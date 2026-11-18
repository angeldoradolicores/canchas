#!/usr/bin/env node
/**
 * FASE 4 — Acaparamiento: alguien intenta apartar todas las horas.
 * Mide cuántas horas logra retener UNA sola red (tu IP) cambiando de dispositivo (cookie)
 * y de cuenta, y si los límites de enforce_booking_quota lo frenan.
 *
 *   I_UNDERSTAND_PRODUCTION=1 node --env-file=loadtest/.env.test loadtest/acaparamiento.mjs
 *
 * Solo en la cancha de prueba. Usa celular VACÍO (no envía WhatsApp a nadie).
 * Las pruebas de "pendientes" crean reservas con un comprobante de 1 píxel; el dueño de
 * prueba las cancela al final. Dispara alertas en /jogoa (código QUOTA_*): es lo esperado.
 */
import { CFG, env, requireVars, login, call, rest, report, warn, info, summary, futureDate, isProd, sleep, guestCookie } from './lib.mjs';

requireVars(['BASE_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'TEST_PITCH_ID', 'OWNER_EMAIL', 'OWNER_PASSWORD', 'PLAYER_ACCOUNTS']);
if (isProd() && env('I_UNDERSTAND_PRODUCTION') !== '1') {
  console.error('Escribe en la cancha de prueba de PRODUCCIÓN. Agrega I_UNDERSTAND_PRODUCTION=1.');
  process.exit(2);
}
const MARK = env('AUDIT_MARK', 'PRUEBA AUDITORIA');
const PNG_1PX = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const owner = await login(CFG.owner);
const p1 = await login(CFG.players[0]);
const TT = process.env.TURNSTILE_TEST_TOKEN || null;

const drafts = [];   // { cookie?, token?, ids }
const pendings = []; // ids
let cursor = 0;
const slotOf = (dayOffset) => ({ date: futureDate(dayOffset), slot: `${String(6 + (cursor++ % 18)).padStart(2, '0')}:00` });
const quotaCode = (r) => (r.json?.code === 'QUOTA' || r.status === 429) ? (r.json?.error || '').slice(0, 70) : null;

// 2,6 s entre peticiones: el límite por IP de /api/bookings es 25/min (y cuenta por instancia).
async function bk(body, who = {}) { await sleep(2600); return call('/api/bookings', { method: 'POST', body, token: who.token, cookie: who.cookie }); }
async function lock(who, { date, slot }) {
  const r = await bk({ action: 'lock_booking', payload: { pitch_id: CFG.pitch, selected_date: date, selected_times: [slot], turnstile_token: TT } }, who);
  const ids = r.json?.data?.booking_ids || [];
  if (ids.length) drafts.push({ ...who, ids });
  return { r, ids };
}

// ── A. Invitado con un solo dispositivo ─────────────────────────────────────
console.log('\n── A. Invitado, un solo dispositivo (límite 2 horas apartadas)');
{
  const g = { cookie: guestCookie() };
  const got = [];
  let stop = null;
  for (let i = 0; i < 4; i++) {
    const { r, ids } = await lock(g, slotOf(60));
    if (ids.length) got.push(...ids); else { stop = `${r.status} ${quotaCode(r) || (r.json?.error || '').slice(0, 60)}`; break; }
  }
  report(got.length <= 2, 'Invitado con un dispositivo aparta como máximo 2 horas', `apartó ${got.length}; frenado con: ${stop || 'nunca'}`);
}

// ── B. Invitado cambiando de dispositivo en cada intento (misma red) ─────────
console.log('\n── B. Invitado que cambia de dispositivo (cookie) en cada intento — límite por red: 10');
{
  let got = 0, stop = null;
  for (let i = 0; i < 13; i++) {
    const { r, ids } = await lock({ cookie: guestCookie() }, slotOf(61));
    if (ids.length) got++; else { stop = `${r.status} ${quotaCode(r) || (r.json?.error || '').slice(0, 60)}`; break; }
  }
  report(got <= 10, 'Una red no aparta más de 10 horas a la vez aunque cambie de dispositivo', `apartó ${got}; frenado con: ${stop || 'nunca'}`);
  if (got >= 10) warn('Con 10 horas por red, un solo atacante bloquea 10 horas durante 5 minutos y puede repetirlo', 'sin CAPTCHA, rotando IPs (datos móviles, proxies) no hay tope. Activar Turnstile');
}
// liberar para no contaminar lo que sigue
for (const d of drafts.splice(0)) await bk({ action: 'cancel_draft', payload: { booking_ids: d.ids } }, d);

// ── C. Jugador con cuenta ───────────────────────────────────────────────────
console.log('\n── C. Jugador con cuenta (límite 4 horas apartadas)');
{
  let got = 0, stop = null;
  for (let i = 0; i < 6; i++) {
    const { r, ids } = await lock({ token: p1.token }, slotOf(62));
    if (ids.length) got++; else { stop = `${r.status} ${quotaCode(r) || (r.json?.error || '').slice(0, 60)}`; break; }
  }
  report(got <= 4, 'Jugador aparta como máximo 4 horas a la vez', `apartó ${got}; frenado con: ${stop || 'nunca'}`);
}
for (const d of drafts.splice(0)) await bk({ action: 'cancel_draft', payload: { booking_ids: d.ids } }, d);

// ── D. Reservas "por aprobar" con comprobante falso, cambiando de dispositivo ──
// Una pendiente retiene la hora hasta que el dueño la rechace (o hasta que expire, si hay tarea programada).
console.log('\n── D. Pendientes con comprobante falso (límite por red: 8 por complejo y día)');
async function pendingRun(dayOffset) {
  let got = 0, stop = null;
  for (let i = 0; i < 11; i++) {
    const g = { cookie: guestCookie() };
    const s = slotOf(dayOffset);
    const { r, ids } = await lock(g, s);
    if (!ids.length) { stop = `apartar: ${r.status} ${quotaCode(r) || (r.json?.error || '').slice(0, 60)}`; break; }
    const c = await bk({ action: 'create_booking', payload: { pitch_id: CFG.pitch, selected_date: s.date, selected_times: [s.slot], booking_ids: ids, customer_name: `${MARK} acaparador`, customer_phone: '', file_name: 'c.png', file_base64: PNG_1PX } }, g);
    if (c.status === 200) { got++; pendings.push(...ids); drafts.pop(); }
    else { stop = `enviar: ${c.status} ${quotaCode(c) || (c.json?.error || '').slice(0, 60)}`; break; }
  }
  return { got, stop };
}
const day1 = await pendingRun(63);
report(day1.got <= 8, 'Una red deja como máximo 8 reservas por aprobar por complejo y día', `logró ${day1.got}; frenado con: ${day1.stop || 'nunca'}`);
const day2 = await pendingRun(64);
if (day2.got > 0) warn(`Al día siguiente la misma red logra otras ${day2.got} por aprobar`, `el límite es por día: en 7 días serían ~${(day1.got) * 7} horas retenidas en un complejo desde una sola red, con imágenes falsas, hasta que el dueño las rechace una por una`);
info('Alertas', 'revisa /jogoa: deben aparecer alertas QUOTA_* de este complejo de prueba (y la notificación al superadmin)');

// ── E. Bloqueo de celulares y panel de seguridad: solo superadmin ───────────
console.log('\n── E. Bloquear celulares y ver alertas: solo superadmin');
for (const [who, tok] of [['dueño', owner.token], ['jugador', p1.token]]) {
  for (const [name, path, opts] of [
    ['ver alertas', '/api/admin/security', {}],
    ['bloquear un celular', '/api/admin/security', { method: 'POST', body: { action: 'block', company_id: '00000000-0000-4000-8000-000000000000', phone: '3000000001' } }],
    ['desbloquear un celular', '/api/admin/security', { method: 'DELETE', body: { company_id: '00000000-0000-4000-8000-000000000000', phone: '3000000001' } }],
  ]) {
    const r = await call(path, { ...opts, token: tok });
    report([401, 403, 404].includes(r.status), `${who}: ${name}`, `HTTP ${r.status}`);
  }
}

// ── Limpieza ────────────────────────────────────────────────────────────────
console.log('\nLimpiando…');
for (const d of drafts.splice(0)) await bk({ action: 'cancel_draft', payload: { booking_ids: d.ids } }, d);
if (pendings.length) {
  const r = await call('/api/bookings/batch-action', { method: 'POST', token: owner.token, body: { ids: pendings, action: 'cancel' } });
  if (r.status !== 200) warn('No se pudieron cancelar las pendientes de prueba', `${r.status} ${r.text.slice(0, 100)}`);
}
info('Limpieza', `${pendings.length} reservas por aprobar canceladas`);
process.exit(summary('Fase 4 — Acaparamiento') ? 1 : 0);
