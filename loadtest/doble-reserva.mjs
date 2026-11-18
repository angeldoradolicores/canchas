#!/usr/bin/env node
/**
 * PRUEBA DE DOBLE RESERVA (carrera real).
 *
 * En cada ronda, todos estos "clientes" intentan tomar LA MISMA cancha y hora en el mismo milisegundo:
 *   - invitados sin cuenta (reserva rápida)          → POST /api/bookings  lock_booking
 *   - jugadores con sesión                            → POST /api/bookings  lock_booking
 *   - el dueño con reserva manual                     → POST /api/admin-actions create_manual_booking
 *   - el dueño con turno fijo                         → POST /api/admin-actions create_contract_batch
 *   - (opcional) cancha vinculada/combinada           → la misma hora en TEST_LINKED_PITCH_ID
 *   - (opcional, DB_RACE=1) 40 inserciones directas a la base con service role, saltándose la API,
 *     para probar la restricción de la base de datos con concurrencia extrema.
 *
 * Regla que se verifica: después de cada ronda debe haber COMO MÁXIMO UNA reserva activa en esa hora.
 * Al final se cancela/borra todo lo creado.
 *
 *   node --env-file=loadtest/.env.test loadtest/doble-reserva.mjs
 *
 * Usa SIEMPRE una cancha de prueba (TEST_PITCH_ID) de un complejo de prueba.
 */
import { CFG, env, requireVars, login, call, rest, activeAt, guestCookie, sleep, percentile, futureDate, report, info, warn, summary, isProd } from './lib.mjs';

requireVars(['BASE_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'TEST_PITCH_ID', 'OWNER_EMAIL', 'OWNER_PASSWORD']);

const ROUNDS = Number(env('ROUNDS', '4'));
const GUESTS = Number(env('GUESTS', '10'));
const DATE = env('TEST_DATE', futureDate(21));
const FIRST_HOUR = Number(env('FIRST_HOUR', '6'));
const DB_RACE = env('DB_RACE') === '1';
const API_LIMIT_PER_MIN = 25; // límite de /api/bookings por IP (lib/rate-limit)

if (isProd() && env('I_UNDERSTAND_PRODUCTION') !== '1') {
  console.error('Vas a crear reservas reales en PRODUCCIÓN. Usa una cancha de prueba y agrega I_UNDERSTAND_PRODUCTION=1.');
  process.exit(2);
}

const owner = await login(CFG.owner);
const players = [];
for (const p of CFG.players) players.push(await login(p));
info('Sesiones', `dueño ${owner.email}, ${players.length} jugadores, ${GUESTS} invitados por ronda`);

const created = { drafts: [], ownerIds: [], dbIds: [] };
const latency = {};
const track = (kind, ms) => (latency[kind] ||= []).push(ms);
let doubleBookings = 0;

const toIso = (h) => `${DATE}T${String(h).padStart(2, '0')}:00:00-05:00`;

for (let round = 0; round < ROUNDS; round++) {
  const hour = FIRST_HOUR + round;
  const slot = `${String(hour).padStart(2, '0')}:00`;
  const startIso = toIso(hour), endIso = toIso(hour + 1);
  const pitches = [CFG.pitch, ...(CFG.linkedPitch ? [CFG.linkedPitch] : [])];

  const before = await activeAt(pitches, startIso, endIso);
  if (before.length) { warn(`Ronda ${round + 1} (${DATE} ${slot})`, 'la hora ya estaba ocupada antes de empezar; se omite'); continue; }

  const contestants = [];
  for (let i = 0; i < GUESTS; i++) {
    const cookie = guestCookie();
    contestants.push({ kind: 'invitado', cookie, run: () => call('/api/bookings', { method: 'POST', cookie, body: { action: 'lock_booking', payload: { pitch_id: CFG.pitch, selected_date: DATE, selected_times: [slot], turnstile_token: process.env.TURNSTILE_TEST_TOKEN || null } } }) });
  }
  for (const p of players) {
    contestants.push({ kind: 'jugador', token: p.token, run: () => call('/api/bookings', { method: 'POST', token: p.token, body: { action: 'lock_booking', payload: { pitch_id: CFG.pitch, selected_date: DATE, selected_times: [slot], turnstile_token: process.env.TURNSTILE_TEST_TOKEN || null } } }) });
  }
  contestants.push({ kind: 'manual dueño', run: () => call('/api/admin-actions', { method: 'POST', token: owner.token, body: { action: 'create_manual_booking', payload: { pitch_id: CFG.pitch, date: DATE, selected_times: [slot], customer_name: `${process.env.AUDIT_MARK || 'PRUEBA AUDITORIA'} manual`, customer_phone: '', total_price: 0, deposit_amount: 0, payment_method: 'efectivo' } } }) });
  contestants.push({ kind: 'turno fijo', run: () => call('/api/admin-actions', { method: 'POST', token: owner.token, body: { action: 'create_contract_batch', payload: { pitch_id: CFG.pitch, dates: [DATE], selected_times: [slot], customer_name: `${process.env.AUDIT_MARK || 'PRUEBA AUDITORIA'} turno fijo`, customer_phone: '', payment_method: 'efectivo' } } }) });
  if (CFG.linkedPitch) {
    const cookie = guestCookie();
    contestants.push({ kind: 'cancha vinculada', cookie, run: () => call('/api/bookings', { method: 'POST', cookie, body: { action: 'lock_booking', payload: { pitch_id: CFG.linkedPitch, selected_date: DATE, selected_times: [slot], turnstile_token: process.env.TURNSTILE_TEST_TOKEN || null } } }) });
  }
  if (DB_RACE && CFG.service) {
    for (let i = 0; i < 40; i++) {
      contestants.push({ kind: 'BD directa', run: async () => {
        const t0 = performance.now();
        const r = await rest('/rest/v1/bookings', { method: 'POST', key: CFG.service, prefer: 'return=representation',
          body: { pitch_id: CFG.pitch, start_time: startIso, end_time: endIso, status: 'pending', customer_name: `${process.env.AUDIT_MARK || 'PRUEBA AUDITORIA'} BD`, total_price: 0 } });
        return { status: r.status, json: r.json, text: r.text, ms: performance.now() - t0 };
      } });
    }
  }

  // ¡Todos a la vez!
  const results = await Promise.all(contestants.map((c) => c.run().then((r) => ({ c, r }))));

  const wins = [];
  const counts = {};
  for (const { c, r } of results) {
    track(c.kind, r.ms);
    const won = (r.status === 200 || r.status === 201) && (
      c.kind === 'BD directa' ? Array.isArray(r.json) && r.json.length > 0
      : c.kind === 'turno fijo' ? (r.json?.booking_ids || []).length > 0
      : c.kind === 'manual dueño' ? (r.json?.booking_ids || r.json?.data ? true : r.json?.success === true)
      : (r.json?.data?.booking_ids || []).length > 0);
    const label = won ? 'ganó' : r.status === 429 ? 'limitado (429)' : r.status >= 500 || r.status === 0 ? `ERROR ${r.status}` : 'rechazado (ocupado)';
    counts[`${c.kind}: ${label}`] = (counts[`${c.kind}: ${label}`] || 0) + 1;
    if (r.status >= 500 || r.status === 0) warn(`Error del servidor (${c.kind})`, `${r.status} ${(r.json?.error || r.text).slice(0, 160)}`);
    if (c.kind === 'BD directa' && !won && !/23P01|SLOT_TAKEN|exclusion|conflict|ocupad/i.test(r.text) && !counts.__dbWarned) {
      counts.__dbWarned = 1;
      warn('Inserción directa rechazada por otro motivo (no por "hora ocupada")', r.text.slice(0, 200));
    }
    if (won) {
      wins.push(c.kind);
      if (c.kind === 'BD directa') created.dbIds.push(...r.json.map((b) => b.id));
      else if (c.kind === 'manual dueño' || c.kind === 'turno fijo') created.ownerIds.push(...(r.json?.booking_ids || (r.json?.data || []).map?.((b) => b.id) || []));
      else created.drafts.push({ ids: r.json.data.booking_ids, cookie: c.cookie, token: c.token });
    }
  }

  await sleep(400);
  const after = await activeAt(pitches, startIso, endIso);
  const ok = after.length <= 1 && wins.length <= 1;
  if (!ok) doubleBookings++;
  report(ok, `Ronda ${round + 1} · ${DATE} ${slot} · ${contestants.length} intentos simultáneos`,
    `ganadores: ${wins.length ? wins.join(', ') : 'ninguno'} · reservas activas en la hora: ${after.length}`);
  delete counts.__dbWarned;
  console.log('     ', Object.entries(counts).map(([k, v]) => `${k} ×${v}`).join(' | '));

  // Respetar el límite por IP de /api/bookings entre rondas (si no, las rondas siguientes salen "429").
  const apiCalls = contestants.filter((c) => !['manual dueño', 'turno fijo', 'BD directa'].includes(c.kind)).length;
  if (round < ROUNDS - 1 && apiCalls > API_LIMIT_PER_MIN / 2) {
    const wait = Math.ceil((apiCalls / API_LIMIT_PER_MIN) * 60) + 2;
    info('Pausa', `${wait}s para no chocar con el límite anti-bots de ${API_LIMIT_PER_MIN} peticiones/min por IP`);
    await sleep(wait * 1000);
  }
}

// ── Latencias ──
console.log('\nLatencia por tipo de cliente (ms):');
for (const [k, v] of Object.entries(latency)) {
  console.log(`  ${k.padEnd(18)} n=${String(v.length).padStart(3)}  p50=${percentile(v, 50).toFixed(0).padStart(5)}  p95=${percentile(v, 95).toFixed(0).padStart(5)}  máx=${Math.max(...v).toFixed(0).padStart(5)}`);
}

// ── Limpieza ──
console.log('\nLimpiando lo creado por la prueba…');
for (const d of created.drafts) {
  await call('/api/bookings', { method: 'POST', cookie: d.cookie, token: d.token, body: { action: 'cancel_draft', payload: { booking_ids: d.ids } } });
}
if (created.ownerIds.length) {
  const r = await call('/api/bookings/batch-action', { method: 'POST', token: owner.token, body: { ids: created.ownerIds, action: 'cancel' } });
  if (r.status !== 200) warn('No se pudieron cancelar las reservas del dueño', `${r.status} ${r.text.slice(0, 120)} — cancélalas a mano (cliente "PRUEBA AUDITORIA")`);
}
if (created.dbIds.length) {
  await rest(`/rest/v1/bookings?id=in.(${created.dbIds.join(',')})`, { method: 'DELETE', key: CFG.service });
}
info('Limpieza', `${created.drafts.length} bloqueos, ${created.ownerIds.length} reservas del dueño, ${created.dbIds.length} filas directas`);

report(doubleBookings === 0, 'NUNCA hubo dos reservas activas en la misma cancha y hora', doubleBookings ? `${doubleBookings} rondas con doble reserva` : '');
process.exit(summary('Doble reserva') ? 1 : 0);
