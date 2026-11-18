#!/usr/bin/env node
/**
 * FASE 3 — Nadie cambia precios, promociones ni pagos.
 * Manipula las peticiones como lo haría alguien con DevTools o curl, con un jugador,
 * otro jugador y un anónimo, y verifica lo que QUEDÓ GUARDADO (no solo el código HTTP).
 *
 *   I_UNDERSTAND_PRODUCTION=1 node --env-file=loadtest/.env.test loadtest/precios-pagos.mjs
 *
 * Solo escribe en la cancha de prueba (TEST_PITCH_ID): borradores, reservas pendientes con
 * un comprobante de 1 píxel y una reserva manual. Todo se cancela al final; las filas
 * canceladas se borran con loadtest/limpieza_prueba_auditoria.sql.
 */
import { CFG, env, requireVars, login, call, rest, report, warn, info, summary, futureDate, isProd, sleep } from './lib.mjs';

requireVars(['BASE_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'TEST_PITCH_ID', 'OWNER_EMAIL', 'OWNER_PASSWORD', 'PLAYER_ACCOUNTS']);
if (isProd() && env('I_UNDERSTAND_PRODUCTION') !== '1') {
  console.error('Escribe en la cancha de prueba de PRODUCCIÓN. Agrega I_UNDERSTAND_PRODUCTION=1.');
  process.exit(2);
}
const MARK = env('AUDIT_MARK', 'PRUEBA AUDITORIA');
const FAKE = '00000000-0000-4000-8000-000000000000';
const PNG_1PX = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const denied = (s) => s === 401 || s === 403 || s === 404;

const owner = await login(CFG.owner);
const [p1, p2] = [await login(CFG.players[0]), await login(CFG.players[1])];
const pitch = (await rest(`/rest/v1/pitches?select=id,company_id,price_per_hour,booking_percentage,custom_pricing&id=eq.${CFG.pitch}`)).json?.[0];
if (!pitch) { console.error('No encuentro TEST_PITCH_ID'); process.exit(2); }

// Precio que DEBE quedar guardado (misma regla que submit_booking_secure).
function expected(slot) {
  const cp = pitch.custom_pricing || {};
  const total = Number(cp[slot] || pitch.price_per_hour);
  const deposit = cp.booking_type === 'fixed' ? Number(cp.booking_fixed || 0) : Math.round(total * Number(pitch.booking_percentage ?? 50) / 100);
  return { total, deposit };
}

const DATE = futureDate(50);
let hour = 6;
const nextSlot = () => `${String(hour++).padStart(2, '0')}:00`;
const toCancel = { drafts: [], owner: [] };

// Ritmo suave para no chocar con el límite de 25/min por IP de /api/bookings.
async function bk(token, body, cookie) { await sleep(2600); return call('/api/bookings', { method: 'POST', token, cookie, body }); }
async function lock(who, slot) {
  const r = await bk(who.token, { action: 'lock_booking', payload: { pitch_id: CFG.pitch, selected_date: DATE, selected_times: [slot] } });
  const ids = r.json?.data?.booking_ids || [];
  if (ids.length) toCancel.drafts.push({ token: who.token, ids });
  return ids;
}
async function submit(who, slot, ids, extra = {}) {
  return bk(who.token, { action: 'create_booking', payload: { pitch_id: CFG.pitch, selected_date: DATE, selected_times: [slot], booking_ids: ids, customer_name: `${MARK} precios`, customer_phone: '', file_name: 'c.png', file_base64: PNG_1PX, ...extra } });
}
async function readOwn(who, ids) {
  const r = await call(`/api/bookings?ids=${ids.join(',')}`, { token: who.token });
  return r.json?.data || [];
}

// ── 1. Precio y anticipo manipulados en create_booking ──────────────────────
console.log('\n── 1. Precio manipulado al reservar (el servidor debe recalcularlo desde la cancha)');
const variants = [
  ['precio 1 y anticipo 0', { total_price: 1, deposit_amount: 0 }],
  ['decimales raros', { total_price: 0.0001, deposit_amount: 0.00001 }],
  ['números gigantes', { total_price: 1e15, deposit_amount: 1e15 }],
  ['cadena de texto', { total_price: 'gratis', deposit_amount: 'nada' }],
  ['negativos', { total_price: -100000, deposit_amount: -50000 }],
];
let p1Receipt = null, p1PendingIds = [];
for (const [name, extra] of variants) {
  const slot = nextSlot();
  const ids = await lock(p1, slot);
  if (!ids.length) { warn(`Precio (${name})`, 'no se pudo apartar la hora'); continue; }
  const r = await submit(p1, slot, ids, extra);
  if (r.status !== 200) {
    report(r.status === 400 && !/numeric|column|constraint|violates/i.test(r.text), `Precio (${name}): rechazado sin crear la reserva`, `HTTP ${r.status} ${(r.json?.error || '').slice(0, 60)}`);
    continue;
  }
  const [row] = await readOwn(p1, ids);
  const exp = expected(slot);
  report(row && Number(row.total_price) === exp.total && Number(row.deposit_amount) === exp.deposit,
    `Precio (${name}): queda el de la cancha`, `guardado total=${row?.total_price} anticipo=${row?.deposit_amount} · esperado ${exp.total}/${exp.deposit}`);
  p1PendingIds.push(...ids);
  p1Receipt ||= row?.payment_proof_url || null;
}

// ── 2. Reservas ajenas (IDOR) ───────────────────────────────────────────────
console.log('\n── 2. Reservas de otra persona');
{
  const slot = nextSlot();
  const ids = await lock(p1, slot);
  if (ids.length) {
    await bk(p2.token, { action: 'cancel_draft', payload: { booking_ids: ids } });
    const occ = await rest('/rest/v1/rpc/get_pitch_occupancy', { method: 'POST', body: { p_pitch_ids: [CFG.pitch], p_from: `${DATE}T${slot}:00-05:00`, p_to: `${DATE}T${slot}:00-05:00` } });
    report((occ.json || []).some((b) => b.status === 'draft'), 'cancel_draft con el borrador de OTRO jugador no lo libera', `borradores vivos: ${(occ.json || []).filter((b) => b.status === 'draft').length}`);
    const r = await submit(p2, slot, ids);
    report(r.status === 409 || r.status === 400, 'create_booking con el borrador de OTRO jugador es rechazado', `HTTP ${r.status}`);
    const mine = await readOwn(p1, ids);
    report(mine[0]?.status === 'draft', 'El borrador del jugador sigue intacto', `estado ${mine[0]?.status}`);
  }
  const ownPending = p1PendingIds.slice(0, 1);
  if (ownPending.length) {
    const r1 = await call('/api/bookings/batch-action', { method: 'POST', token: p1.token, body: { ids: ownPending, action: 'confirm' } });
    report(denied(r1.status), 'Jugador no puede confirmarse su propia reserva (batch-action)', `HTTP ${r1.status}`);
    const r2 = await call('/api/bookings/remaining-payment', { method: 'POST', token: p1.token, body: { booking_ids: ownPending, payment_method: 'efectivo', amount: 999999 } });
    report(denied(r2.status), 'Jugador no puede registrarse abonos', `HTTP ${r2.status}`);
    const r3 = await call('/api/bookings/notify-status', { method: 'POST', token: p1.token, body: { bookingId: ownPending[0], status: 'confirmed' } });
    report(denied(r3.status), 'Jugador no puede disparar el WhatsApp de "confirmada"', `HTTP ${r3.status}`);
    const r4 = await call('/api/bookings/batch-action', { method: 'POST', token: p2.token, body: { ids: ownPending, action: 'cancel' } });
    report(denied(r4.status), 'Otro jugador no puede cancelar la reserva ajena (batch-action)', `HTTP ${r4.status}`);
  }
}

// ── 3. Acciones del dueño con sesión de jugador ─────────────────────────────
console.log('\n── 3. Jugador intentando acciones de dueño');
for (const [name, body] of [
  ['reserva manual', { action: 'create_manual_booking', payload: { pitch_id: CFG.pitch, date: DATE, selected_times: [nextSlot()], customer_name: MARK, total_price: 0 } }],
  ['turno fijo', { action: 'create_contract_batch', payload: { pitch_id: CFG.pitch, dates: [DATE], selected_times: [nextSlot()], customer_name: MARK } }],
  ['cambiar precio de la cancha', { action: 'update_pitch', payload: { pitch_id: CFG.pitch, price: 1 } }],
  ['borrar la cancha', { action: 'delete_pitch', payload: { pitch_id: CFG.pitch } }],
  ['estadísticas del dueño', { action: 'get_dashboard_stats', payload: {} }],
]) {
  const r = await call('/api/admin-actions', { method: 'POST', token: p1.token, body });
  report(denied(r.status), `Jugador: ${name}`, `HTTP ${r.status}`);
}

// ── 4. Promociones ──────────────────────────────────────────────────────────
console.log('\n── 4. Promociones');
{
  const now = Date.now();
  const promo = { company_id: pitch.company_id, title: MARK, description: 'x', required_bookings: 1, reward_hours: 10, weekdays: [0, 1, 2, 3, 4, 5, 6], starts_at: new Date(now).toISOString(), ends_at: new Date(now + 86400000).toISOString(), period: 'week' };
  const r1 = await call('/api/promotions', { method: 'POST', token: p1.token, body: promo });
  report(denied(r1.status) || r1.status === 400, 'Jugador no puede crear una promoción en el complejo', `HTTP ${r1.status}`);
  const r2 = await call('/api/promotions', { method: 'POST', token: p1.token, body: { action: 'stop', id: FAKE } });
  report(denied(r2.status) || r2.status === 400, 'Jugador no puede finalizar promociones', `HTTP ${r2.status}`);
  const r3 = await call('/api/promotions', { method: 'POST', token: p1.token, body: { action: 'redeem', reward_id: FAKE, booking_ids: [FAKE] } });
  report(r3.status === 409 || r3.status === 400 || denied(r3.status), 'Canjear un bono que no existe es rechazado', `HTTP ${r3.status} ${(r3.json?.error || '').slice(0, 60)}`);
  const r4 = await call('/api/promotions', { method: 'POST', token: p1.token, body: { action: 'redeem', reward_id: FAKE, booking_ids: [FAKE] }, headers: { Origin: 'https://evil.example.com' } });
  report(r4.status === 403, 'Promociones rechazan peticiones desde otro sitio (CSRF)', `HTTP ${r4.status}`);
}

// ── 5. Comprobantes ─────────────────────────────────────────────────────────
console.log('\n── 5. Comprobantes');
if (p1Receipt) {
  const path = p1Receipt.replace(/^\/api\/receipts\//, '');
  info('Formato del nombre del comprobante', /_[0-9a-f-]{36}\.jpe?g$/i.test(p1Receipt) ? 'aleatorio (UUID)' : 'PREDECIBLE (hora en milisegundos)');
  const anon = await call(`/api/receipts/${path}`);
  report(anon.status === 401, 'Comprobante sin sesión: bloqueado', `HTTP ${anon.status}`);
  const other = await call(`/api/receipts/${path}`, { token: p2.token });
  report(denied(other.status), 'Comprobante de otro jugador: bloqueado', `HTTP ${other.status}`);
  const mine = await call(`/api/receipts/${path}`, { token: p1.token });
  report(mine.status === 302, 'El propio cliente sí ve su comprobante', `HTTP ${mine.status}`);
  const own = await call(`/api/receipts/${path}`, { token: owner.token });
  report(own.status === 302, 'El dueño de la cancha sí ve el comprobante', `HTTP ${own.status}`);

  // El dueño intenta "adoptar" un comprobante que no subió él (vector para leer comprobantes de
  // otros complejos). Se prueba con una reserva manual de prueba y el comprobante del jugador.
  const m = await call('/api/admin-actions', { method: 'POST', token: owner.token, body: { action: 'create_manual_booking', payload: { pitch_id: CFG.pitch, date: DATE, selected_times: [nextSlot()], customer_name: `${MARK} manual`, total_price: 0, deposit_amount: 0 } } });
  const mIds = m.json?.booking_ids || [];
  toCancel.owner.push(...mIds);
  if (mIds.length) {
    const r = await rest(`/rest/v1/bookings?id=eq.${mIds[0]}`, { method: 'PATCH', token: owner.token, body: { payment_proof_url: p1Receipt }, prefer: 'return=representation' });
    report(r.status >= 400 || (Array.isArray(r.json) && !r.json.length), 'Dueño no puede ponerle a su reserva un comprobante que no subió él', `HTTP ${r.status}`);
  }
}
{
  const own = p1PendingIds.slice(0, 1);
  if (own.length) {
    for (const [name, body, ok] of [
      ['abono negativo', { booking_ids: own, payment_method: 'efectivo', amount: -50000 }, (s) => s === 400],
      ['comprobante de otra cuenta', { booking_ids: own, payment_method: 'transferencia', amount: 1000, proof_url: p1Receipt || '/api/receipts/comprobantes/x/1.jpeg' }, (s) => s === 400],
      ['comprobante externo', { booking_ids: own, payment_method: 'transferencia', amount: 1000, proof_url: 'https://evil.example.com/a.jpg' }, (s) => s === 400],
    ]) {
      const r = await call('/api/bookings/remaining-payment', { method: 'POST', token: owner.token, body });
      report(ok(r.status), `Dueño: ${name} rechazado`, `HTTP ${r.status} ${(r.json?.error || '').slice(0, 60)}`);
    }
  }
}

// ── 6. Errores sin detalles de la base ──────────────────────────────────────
console.log('\n── 6. Mensajes de error');
{
  const r = await bk(p1.token, { action: 'lock_booking', payload: { pitch_id: FAKE, selected_date: DATE, selected_times: ['10:00'] } });
  report(!/23P01|23505|42501|PGRST|violates|relation|column|constraint|stack/i.test(r.text), 'Cancha inexistente: sin errores de Postgres en la respuesta', `HTTP ${r.status} ${(r.json?.error || '').slice(0, 60)}`);
}

// ── Limpieza ────────────────────────────────────────────────────────────────
console.log('\nLimpiando…');
const ownerIds = [...new Set([...p1PendingIds, ...toCancel.owner])];
if (ownerIds.length) {
  const r = await call('/api/bookings/batch-action', { method: 'POST', token: owner.token, body: { ids: ownerIds, action: 'cancel' } });
  if (r.status !== 200) warn('No se pudieron cancelar las reservas de prueba', `${r.status} ${r.text.slice(0, 100)}`);
}
for (const d of toCancel.drafts) await bk(d.token, { action: 'cancel_draft', payload: { booking_ids: d.ids } });
info('Limpieza', `${ownerIds.length} reservas canceladas, ${toCancel.drafts.length} borradores liberados`);

process.exit(summary('Fase 3 — Precios, promociones y pagos') ? 1 : 0);
