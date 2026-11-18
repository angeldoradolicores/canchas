#!/usr/bin/env node
/**
 * FASE 2 — "Nunca una hora reservada por dos personas", escenario por escenario.
 * Complementa doble-reserva.mjs (todos contra todos): aquí cada combinación se corre
 * REPS veces (por defecto 20), siempre en el mismo milisegundo, y se cuenta cuántas
 * veces quedaron dos reservas activas que chocan (debe ser 0).
 *
 *   I_UNDERSTAND_PRODUCTION=1 node --env-file=loadtest/.env.test loadtest/doble-reserva-escenarios.mjs
 *   ESCENARIOS=combinada,tolerancia REPS=5 ...   (solo algunos)
 *
 * Escenarios:
 *   inv-inv, jug-jug, jug-inv, jug-manual, jug-turno, manual-turno,
 *   combinada (A+B contra A), combinada-rev (B contra A+B), manual-combinada,
 *   dos-pestanas (el mismo jugador dos veces), cancelar-reintentar, tolerancia
 *
 * Solo escribe en las canchas de prueba (TEST_PITCH_ID, TEST_SECOND_CHILD_PITCH_ID,
 * TEST_LINKED_PITCH_ID). Cancela al final de cada ronda. Las filas canceladas que quedan
 * se borran con loadtest/limpieza_prueba_auditoria.sql.
 */
import { CFG, env, requireVars, login, call, rest, guestCookie, sleep, percentile, futureDate, report, info, warn, summary, isProd } from './lib.mjs';

requireVars(['BASE_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'TEST_PITCH_ID', 'TEST_LINKED_PITCH_ID', 'TEST_SECOND_CHILD_PITCH_ID', 'OWNER_EMAIL', 'OWNER_PASSWORD', 'PLAYER_ACCOUNTS']);
if (isProd() && env('I_UNDERSTAND_PRODUCTION') !== '1') {
  console.error('Vas a crear reservas en PRODUCCIÓN (solo en las canchas de prueba). Agrega I_UNDERSTAND_PRODUCTION=1 y córrelo fuera del horario de uso.');
  process.exit(2);
}

const REPS = Number(env('REPS', '20'));
const MARK = env('AUDIT_MARK', 'PRUEBA AUDITORIA');
const API_LIMIT = Number(env('API_LIMIT_PER_MIN', '25')); // límite de /api/bookings por IP (lib/rate-limit)
const A = CFG.pitch, B = env('TEST_SECOND_CHILD_PITCH_ID'), AB = CFG.linkedPitch;
const ONLY = env('ESCENARIOS').split(',').map((s) => s.trim()).filter(Boolean);
const TT = process.env.TURNSTILE_TEST_TOKEN || null;

const owner = await login(CFG.owner);
const players = [];
for (const p of CFG.players) players.push(await login(p));
if (players.length < 2) { console.error('Se necesitan 2 jugadores en PLAYER_ACCOUNTS'); process.exit(2); }
info('Sesiones', `dueño + ${players.length} jugadores · ${REPS} repeticiones por escenario`);

// ── Ritmo: no pasar el límite por IP de /api/bookings (si no, todo sale 429 y la prueba no vale) ──
const apiCalls = [];
async function pace(n) {
  for (;;) {
    const now = Date.now();
    while (apiCalls.length && now - apiCalls[0] > 61_000) apiCalls.shift();
    if (apiCalls.length + n <= API_LIMIT - 2) { for (let i = 0; i < n; i++) apiCalls.push(now); return; }
    await sleep(Math.max(500, 61_000 - (now - apiCalls[0])));
  }
}

// ── Contendientes ───────────────────────────────────────────────────────────
const lat = {};
const track = (k, ms) => (lat[k] ||= []).push(ms);
const lockBody = (pitch, date, slot) => ({ action: 'lock_booking', payload: { pitch_id: pitch, selected_date: date, selected_times: [slot], turnstile_token: TT } });

const guest = (pitch) => ({ kind: 'invitado', api: true, cookie: guestCookie(), pitch,
  async run(date, slot) { return call('/api/bookings', { method: 'POST', cookie: this.cookie, body: lockBody(pitch, date, slot) }); } });
const player = (i, pitch) => ({ kind: `jugador${i + 1}`, api: true, token: players[i].token, pitch,
  async run(date, slot) { return call('/api/bookings', { method: 'POST', token: this.token, body: lockBody(pitch, date, slot) }); } });
const manual = (pitch) => ({ kind: 'manual', owner: true, pitch,
  async run(date, slot) { return call('/api/admin-actions', { method: 'POST', token: owner.token, body: { action: 'create_manual_booking', payload: { pitch_id: pitch, date, selected_times: [slot], customer_name: `${MARK} manual`, customer_phone: '', total_price: 0, deposit_amount: 0, payment_method: 'efectivo' } } }); } });
const contract = (pitch) => ({ kind: 'turno fijo', owner: true, pitch,
  async run(date, slot) { return call('/api/admin-actions', { method: 'POST', token: owner.token, body: { action: 'create_contract_batch', payload: { pitch_id: pitch, dates: [date], selected_times: [slot], customer_name: `${MARK} turno fijo`, customer_phone: '', payment_method: 'efectivo' } } }); } });

const idsOf = (c, r) => (r.status === 200 || r.status === 201)
  ? (c.owner ? (r.json?.booking_ids || []) : (r.json?.data?.booking_ids || []))
  : [];

async function cancelAll(entries) {
  for (const { c, ids } of entries) {
    if (!ids.length) continue;
    if (c.owner) {
      const r = await call('/api/bookings/batch-action', { method: 'POST', token: owner.token, body: { ids, action: 'cancel' } });
      if (r.status !== 200) warn('No se pudo cancelar lo del dueño', `${r.status} ${r.text.slice(0, 100)}`);
    } else {
      await pace(1);
      await call('/api/bookings', { method: 'POST', cookie: c.cookie, token: c.token, body: { action: 'cancel_draft', payload: { booking_ids: ids } } });
    }
  }
}

// ── Choques entre canchas: A+B choca con A y con B; A y B no chocan entre sí ──
const conflicts = (p, q) => p === q || p === AB || q === AB;
async function occupancy(date, slot) {
  const startIso = `${date}T${slot}:00-05:00`;
  const end = new Date(new Date(startIso).getTime() + 3600_000).toISOString();
  const r = await rest('/rest/v1/rpc/get_pitch_occupancy', { method: 'POST', body: { p_pitch_ids: [A, B, AB], p_from: new Date(new Date(startIso).getTime() - 3600_000).toISOString(), p_to: end } });
  if (r.status !== 200) throw new Error(`get_pitch_occupancy ${r.status}`);
  const now = Date.now();
  return r.json.filter((b) => new Date(b.start_time) < new Date(end) && new Date(b.end_time) > new Date(startIso)
    && (b.status === 'pending' || b.status === 'confirmed' || (b.status === 'draft' && b.expires_at && new Date(b.expires_at).getTime() > now)));
}
const clashes = (rows) => {
  let n = 0;
  for (let i = 0; i < rows.length; i++) for (let j = i + 1; j < rows.length; j++) if (conflicts(rows[i].pitch_id, rows[j].pitch_id)) n++;
  return n;
};

// ── Fechas y horas: cada escenario usa sus propias horas para no pisarse ──
let slotCursor = 0;
function nextSlot() {
  const k = slotCursor++;
  return { date: futureDate(30 + Math.floor(k / 18)), slot: `${String(6 + (k % 18)).padStart(2, '0')}:00` };
}

const table = [];
async function race(name, makeContenders) {
  if (ONLY.length && !ONLY.includes(name)) return;
  console.log(`\n── ${name}`);
  let valid = 0, doubles = 0, limited = 0, errors = 0;
  const winsBy = {};
  for (let rep = 0; rep < REPS; rep++) {
    const { date, slot } = nextSlot();
    if ((await occupancy(date, slot)).length) { warn(`${name} #${rep + 1}`, `${date} ${slot} ya estaba ocupada; se omite`); continue; }
    const cs = makeContenders();
    await pace(cs.filter((c) => c.api).length);
    const res = await Promise.all(cs.map((c) => c.run(date, slot).then((r) => ({ c, r, ids: idsOf(c, r) }))));
    for (const { c, r } of res) track(c.kind, r.ms);
    const wins = res.filter((x) => x.ids.length);
    if (res.some((x) => x.r.status === 429)) limited++;
    if (res.some((x) => x.r.status >= 500 || x.r.status === 0)) { errors++; warn(`${name} #${rep + 1}: error del servidor`, res.filter((x) => x.r.status >= 500 || x.r.status === 0).map((x) => `${x.c.kind} ${x.r.status}`).join(', ')); }
    const guestBlocked = res.filter((x) => x.c.kind === 'invitado' && x.r.status === 403).length;
    if (guestBlocked && rep === 0) warn('Invitados rechazados con 403', 'probablemente CAPTCHA (Turnstile) activo: usa TURNSTILE_TEST_TOKEN válido o mira solo los demás escenarios');
    await sleep(300);
    const active = await occupancy(date, slot);
    const c = clashes(active);
    // Los perdedores deben recibir un 409/400 con mensaje claro (no 500, no éxito silencioso).
    const losers = res.filter((x) => !x.ids.length && x.r.status !== 429 && !(x.c.kind === 'invitado' && x.r.status === 403));
    const unclear = losers.filter((x) => !(x.r.status === 409 || x.r.status === 400 || (x.c.kind === 'turno fijo' && x.r.status === 200)) || !(x.r.json?.error || x.r.json?.skipped_conflicts?.length || x.r.json?.message));
    if (unclear.length && rep === 0) warn(`${name}: respuesta poco clara para el perdedor`, unclear.map((x) => `${x.c.kind} HTTP ${x.r.status} ${x.r.text.slice(0, 80)}`).join(' | '));
    if (!res.some((x) => x.r.status === 429)) valid++;
    if (c > 0) { doubles++; report(false, `${name} #${rep + 1} ${date} ${slot}`, `${c} choque(s): ${active.map((a) => `${a.pitch_id === AB ? 'A+B' : a.pitch_id === A ? 'A' : 'B'}:${a.status}`).join(', ')}`); }
    // Sobrescritura: dos clientes DISTINTOS creen haber ganado y comparten la misma fila
    // (uno le quitó la reserva al otro sin avisar). El mismo cliente en dos pestañas sí puede.
    const who = (x) => `${x.c.kind}|${x.c.token || x.c.cookie || 'dueño'}`;
    const overwritten = wins.some((x, i) => wins.some((y, j) => j > i && who(x) !== who(y) && x.ids.some((id) => y.ids.includes(id))));
    if (overwritten && c === 0) { doubles++; report(false, `${name} #${rep + 1} ${date} ${slot}: SOBRESCRITURA`, `${wins.map((w) => w.c.kind).join(' y ')} recibieron la misma reserva`); }
    for (const w of wins) winsBy[w.c.kind] = (winsBy[w.c.kind] || 0) + 1;
    await cancelAll(res);
  }
  report(doubles === 0, `${name}: ${valid} rondas válidas, ${doubles} con doble reserva`, `ganó: ${Object.entries(winsBy).map(([k, v]) => `${k}×${v}`).join(', ') || 'nadie'}${limited ? ` · ${limited} rondas con 429` : ''}${errors ? ` · ${errors} con error 5xx` : ''}`);
  table.push({ name, valid, doubles, limited, errors });
}

// ── Escenarios de carrera ───────────────────────────────────────────────────
await race('inv-inv', () => [guest(A), guest(A)]);
await race('jug-jug', () => [player(0, A), player(1, A)]);
await race('jug-inv', () => [player(0, A), guest(A)]);
await race('jug-manual', () => [player(0, A), manual(A)]);
await race('jug-turno', () => [player(0, A), contract(A)]);
await race('manual-turno', () => [manual(A), contract(A)]);
await race('combinada', () => [player(0, AB), player(1, A)]);
await race('combinada-rev', () => [player(0, B), player(1, AB)]);
await race('manual-combinada', () => [manual(AB), player(0, A), player(1, B)]);
await race('dos-pestanas', () => [player(0, A), player(0, A)]);

// ── Turno fijo sobre una reserva manual que YA existe (no es carrera: va en orden) ──
// Antes el turno fijo reutilizaba la fila del panel y le cambiaba el cliente sin avisar.
if (!ONLY.length || ONLY.includes('turno-sobre-manual')) {
  console.log('\n── turno-sobre-manual');
  let overwrites = 0, n = 0;
  for (let rep = 0; rep < REPS; rep++) {
    const { date, slot } = nextSlot();
    if ((await occupancy(date, slot)).length) continue;
    const m = manual(A), t = contract(A);
    const rm = await m.run(date, slot);
    const mIds = idsOf(m, rm);
    if (!mIds.length) { warn(`turno-sobre-manual #${rep + 1}`, `la reserva manual falló: ${rm.status} ${rm.text.slice(0, 80)}`); continue; }
    n++;
    const rt = await t.run(date, slot);
    const tIds = idsOf(t, rt);
    if (tIds.some((id) => mIds.includes(id))) { overwrites++; if (overwrites === 1) report(false, `turno-sobre-manual #${rep + 1} ${date} ${slot}: SOBRESCRITURA`, 'el turno fijo tomó la fila de la reserva manual existente'); }
    await cancelAll([{ c: m, ids: mIds }, { c: t, ids: tIds.filter((id) => !mIds.includes(id)) }]);
  }
  report(overwrites === 0, `turno-sobre-manual: ${n} rondas, ${overwrites} sobrescrituras`, 'el turno fijo debe saltarse la hora y dejar intacta la reserva manual');
  table.push({ name: 'turno-sobre-manual', valid: n, doubles: overwrites, limited: 0, errors: 0 });
}

// ── Cancelar y reintentar de inmediato (antes: la hora quedaba bloqueada hasta 5 min) ──
if (!ONLY.length || ONLY.includes('cancelar-reintentar')) {
  console.log('\n── cancelar-reintentar');
  let ok = 0, okOther = 0, n = 0;
  for (let rep = 0; rep < REPS; rep++) {
    const { date, slot } = nextSlot();
    const p = player(0, A);
    await pace(5);
    const first = await p.run(date, slot);
    const ids = idsOf(p, first);
    if (!ids.length) { warn(`cancelar-reintentar #${rep + 1}`, `el primer bloqueo falló: ${first.status} ${first.text.slice(0, 80)}`); continue; }
    n++;
    await call('/api/bookings', { method: 'POST', token: p.token, body: { action: 'cancel_draft', payload: { booking_ids: ids } } });
    // La misma persona vuelve a intentarlo enseguida…
    const again = await p.run(date, slot);
    const ids2 = idsOf(p, again);
    if (ids2.length) ok++;
    if (ids2.length) await call('/api/bookings', { method: 'POST', token: p.token, body: { action: 'cancel_draft', payload: { booking_ids: ids2 } } });
    // …y otra persona también debe poder tomar la hora liberada al instante.
    const other = player(1, A);
    const r3 = await other.run(date, slot);
    const ids3 = idsOf(other, r3);
    if (ids3.length) okOther++;
    await cancelAll([{ c: other, ids: ids3 }]);
  }
  report(ok === n, 'Cancelar y reintentar al instante (mismo jugador)', `${ok}/${n} pudo volver a apartar la hora`);
  report(okOther === n, 'Hora liberada disponible al instante para otra persona', `${okOther}/${n}`);
  table.push({ name: 'cancelar-reintentar', valid: n, doubles: 0, limited: 0, errors: 0 });
}

// ── Tolerancia de horas ya iniciadas (BOOKING_GRACE_MINUTES = 10) ──
// No se puede fijar el reloj del servidor: se prueba con la hora real de Bogotá.
// Córrelo a distintos minutos (ej. hh:00-hh:09 y hh:10-hh:59) para cubrir los dos lados.
if (!ONLY.length || ONLY.includes('tolerancia')) {
  console.log('\n── tolerancia (hora real de Bogotá)');
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(new Date()).map((x) => [x.type, x.value]));
  const today = `${parts.year}-${parts.month}-${parts.day}`;
  const h = Number(parts.hour), m = Number(parts.minute);
  info('Hora del cliente', `${today} ${parts.hour}:${parts.minute}:${parts.second} (Bogotá)`);
  const cases = [];
  if (h >= 6 && h <= 23) cases.push({ slot: `${String(h).padStart(2, '0')}:00`, expect: m < 10, why: `hora en curso, minuto ${m} (${m < 10 ? 'dentro' : 'fuera'} de los 10 min)` });
  if (h - 1 >= 6 && h - 1 <= 23) cases.push({ slot: `${String(h - 1).padStart(2, '0')}:00`, expect: false, why: 'hora anterior (ya pasó)' });
  if (!cases.length) info('Tolerancia', 'fuera del horario de las canchas de prueba (06:00–23:59); córrelo de día');
  for (const k of cases) {
    if ((await occupancy(today, k.slot)).length) { warn(`tolerancia ${k.slot}`, 'la hora ya estaba ocupada'); continue; }
    for (const c of [player(0, A), guest(A)]) {
      await pace(2);
      const r = await c.run(today, k.slot);
      const ids = idsOf(c, r);
      const leak = /23514|P0001|violates|constraint|enforce_|relation|column/i.test(r.text);
      report(Boolean(ids.length) === k.expect && !leak, `${c.kind} · ${today} ${k.slot} · ${k.why}`, `esperado ${k.expect ? 'aceptar' : 'rechazar'}, obtenido HTTP ${r.status} ${(r.json?.error || '').slice(0, 70)}${leak ? ' · ¡muestra error de la BD!' : ''}`);
      await cancelAll([{ c, ids }]);
    }
  }
  // Reserva manual del dueño SÍ puede registrar horas pasadas (decisión del negocio).
  const past = cases.find((k) => !k.expect);
  if (past) {
    const mc = manual(A);
    const r = await mc.run(today, past.slot);
    const ids = idsOf(mc, r);
    report(ids.length > 0, `Reserva manual del dueño en hora pasada (${past.slot}) se permite`, `HTTP ${r.status} ${(r.json?.error || '').slice(0, 70)}`);
    await cancelAll([{ c: mc, ids }]);
  }
}

// ── Resumen ─────────────────────────────────────────────────────────────────
console.log('\nEscenario               rondas válidas   dobles   429   5xx');
for (const t of table) console.log(`${t.name.padEnd(22)} ${String(t.valid).padStart(14)} ${String(t.doubles).padStart(8)} ${String(t.limited).padStart(5)} ${String(t.errors).padStart(5)}`);
const total = table.reduce((s, t) => s + t.doubles, 0);
console.log('\nLatencia (ms):');
for (const [k, v] of Object.entries(lat)) console.log(`  ${k.padEnd(12)} n=${String(v.length).padStart(3)}  p50=${percentile(v, 50).toFixed(0).padStart(5)}  p95=${percentile(v, 95).toFixed(0).padStart(5)}  máx=${Math.max(...v).toFixed(0).padStart(5)}`);
report(total === 0, 'NUNCA quedaron dos reservas activas que chocan (misma cancha o canchas unidas)', `${total} rondas con doble reserva`);
process.exit(summary('Fase 2 — Doble reserva por escenario') ? 1 : 0);
