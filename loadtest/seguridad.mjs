#!/usr/bin/env node
/**
 * AUDITORÍA DE SEGURIDAD AUTOMÁTICA (no destructiva).
 * Intenta lo que haría un atacante y verifica que la app lo bloquea:
 *  1. Encabezados de seguridad           6. Robo de datos entre usuarios (IDOR)
 *  2. Lectura de datos privados sin login 7. Subida de archivos maliciosos
 *  3. Escrituras/escalada de rol          8. SSRF, redirección abierta, CSRF
 *  4. Funciones internas de la BD (RPC)   9. Inyección y cuerpos gigantes
 *  5. APIs sin sesión                    10. Bots: límite de peticiones, IP falsificada, fuerza bruta
 *
 *   node --env-file=loadtest/.env.test loadtest/seguridad.mjs
 *
 * Solo crea datos que se rechazan; no deja nada en la base. Funciona en local y en producción.
 */
import { CFG, env, requireVars, login, call, rest, report, warn, info, summary, sleep } from './lib.mjs';

requireVars(['BASE_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY']);
const FAKE_UUID = '00000000-0000-4000-8000-000000000000';
const denied = (s) => s === 401 || s === 403 || s === 404 || s === 400 || s === 405;

console.log(`\nObjetivo: ${CFG.base}\n`);

// ── 1. Encabezados ──────────────────────────────────────────────────────────
console.log('── 1. Encabezados de seguridad');
{
  const r = await call('/');
  const h = (k) => r.headers?.get(k) || '';
  report(/max-age=\d{7,}/.test(h('strict-transport-security')) || !CFG.base.startsWith('https'), 'HSTS (obliga HTTPS)', h('strict-transport-security') || 'ausente');
  report(/sameorigin|deny/i.test(h('x-frame-options')) || /frame-ancestors/.test(h('content-security-policy')), 'Anti-clickjacking (X-Frame-Options)');
  report(/nosniff/i.test(h('x-content-type-options')), 'X-Content-Type-Options: nosniff');
  report(!!h('referrer-policy'), 'Referrer-Policy', h('referrer-policy'));
  if (!h('content-security-policy')) warn('Content-Security-Policy ausente', 'mitiga XSS; recomendable agregarla');
  report(!h('x-powered-by'), 'No revela tecnología (X-Powered-By)', h('x-powered-by'));
  for (const p of ['/.env', '/.env.local', '/.git/config', '/repomix-output.xml', '/package.json']) {
    const f = await call(p);
    report(f.status === 404 || !/SUPABASE|SERVICE_ROLE|\[core\]|"dependencies"/.test(f.text), `Archivo sensible no expuesto: ${p}`, String(f.status));
  }
}

// ── 2. Lectura sin sesión de datos privados (directo a Supabase, como un atacante) ─
console.log('\n── 2. Datos privados sin iniciar sesión');
const privateReads = [
  ['bookings', 'id,customer_name,customer_phone,payment_proof_url'],
  ['profiles', 'id,phone'],
  ['owner_requests', '*'],
  ['notifications', '*'],
  ['promotion_rewards', '*'],
  ['promotion_phone_accounts', '*'],
  ['promotion_booking_credits', '*'],
  ['push_subscriptions', '*'],
  ['companies', 'whatsapp_qr_code,whatsapp_api_token,bank_account'],
];
for (const [table, cols] of privateReads) {
  const r = await rest(`/rest/v1/${table}?select=${cols}&limit=3`);
  const leaked = r.status === 200 && Array.isArray(r.json) && r.json.some((row) => Object.values(row).some((v) => v !== null && v !== ''));
  report(!leaked, `Anónimo no lee ${table} (${cols})`, leaked ? `¡FUGA! devolvió ${r.json.length} filas con datos` : `HTTP ${r.status}`);
}

// ── 3. Escrituras sin sesión / escalada ─────────────────────────────────────
console.log('\n── 3. Escrituras y escalada de privilegios sin sesión');
{
  const ins = await rest('/rest/v1/bookings', { method: 'POST', body: { pitch_id: CFG.pitch || FAKE_UUID, start_time: '2030-01-01T10:00:00Z', end_time: '2030-01-01T11:00:00Z', status: 'confirmed', customer_name: 'ATAQUE' } });
  report(ins.status >= 400, 'Anónimo no crea reservas confirmadas', `HTTP ${ins.status}`);
  const up = await rest(`/rest/v1/profiles?id=eq.${FAKE_UUID}`, { method: 'PATCH', body: { role: 'owner' }, prefer: 'return=representation' });
  report(up.status >= 400 || (Array.isArray(up.json) && up.json.length === 0), 'Anónimo no cambia roles', `HTTP ${up.status}`);
  const promo = await rest('/rest/v1/complex_promotions', { method: 'POST', body: { company_id: FAKE_UUID, title: 'Hack', required_bookings: 1, gift_hours: 24, weekdays: [0], ends_at: '2030-01-01T00:00:00Z', created_by: FAKE_UUID } });
  report(promo.status >= 400, 'Anónimo no crea promociones', `HTTP ${promo.status}`);
}

// ── 4. Funciones internas de la base ───────────────────────────────────────
console.log('\n── 4. Funciones internas (RPC) bloqueadas para el navegador');
for (const [fn, args] of [
  ['review_owner_request', { p_user: FAKE_UUID, p_reviewer: FAKE_UUID, p_approve: true }],
  ['redeem_complex_reward', { p_reward: FAKE_UUID, p_user: FAKE_UUID, p_ids: [FAKE_UUID] }],
  ['link_promotion_phone', { phone_key: '3000000000', p_user: FAKE_UUID }],
  ['receipt_bookings', { p_path: '/api/receipts/x' }],
]) {
  const r = await rest(`/rest/v1/rpc/${fn}`, { method: 'POST', body: args });
  report(r.status >= 400, `RPC ${fn} no ejecutable por anónimos`, `HTTP ${r.status}`);
}

// ── 5. APIs de la app sin sesión ───────────────────────────────────────────
console.log('\n── 5. APIs protegidas sin sesión');
for (const [path, opts, label] of [
  ['/api/admin-actions', { method: 'POST', body: { action: 'create_manual_booking', payload: { pitch_id: CFG.pitch || FAKE_UUID, date: '2030-01-01', selected_times: ['10:00'], customer_name: 'x' } } }, 'reserva manual'],
  ['/api/admin-actions', { method: 'POST', body: { action: 'get_dashboard_stats', payload: {} } }, 'estadísticas del dueño'],
  ['/api/bookings/batch-action', { method: 'POST', body: { ids: [FAKE_UUID], action: 'confirm' } }, 'aprobar reservas'],
  ['/api/owner-requests', {}, 'solicitudes de dueño'],
  ['/api/owner-requests', { method: 'PATCH', body: { user_id: FAKE_UUID, approve: true } }, 'aprobar dueño'],
  ['/api/receipts/comprobantes/x/1_a.jpeg', {}, 'comprobante privado'],
  ['/api/send-push', { method: 'POST', body: { user_id: FAKE_UUID, title: 'x', body: 'x' } }, 'enviar push'],
  ['/api/promotions', { method: 'POST', body: { action: 'stop', id: FAKE_UUID } }, 'finalizar promoción'],
  ['/api/delete-account', { method: 'POST', body: {} }, 'borrar cuenta'],
  ['/api/debug-dashboard', {}, 'endpoint de depuración'],
]) {
  const r = await call(path, opts);
  report(denied(r.status) || r.status === 429, `Sin sesión: ${label}`, `HTTP ${r.status}`);
}
{
  // Hallazgo 2026-11-18: /api/generate-status devolvía sin sesión los nombres de los
  // clientes y los ids de reserva de cualquier complejo. Se prueba con un complejo real
  // (público) y con varias fechas: nunca debe responder datos ni nombres.
  const companies = await fetch(`${CFG.supabase}/rest/v1/companies?select=id&limit=3`, {
    headers: { apikey: CFG.anon },
  }).then((r) => r.json()).catch(() => []);
  const ids = Array.isArray(companies) && companies.length ? companies.map((c) => c.id) : [FAKE_UUID];
  for (const companyId of ids) {
    const r = await call('/api/generate-status', { method: 'POST', body: { companyId } });
    report(denied(r.status) && !/customer_name/.test(r.text), 'Sin sesión: estado de horas con nombres de clientes (generate-status)', `HTTP ${r.status}`);
  }
}

// ── 6. Usuario jugador intentando acciones del dueño (IDOR) ────────────────
console.log('\n── 6. Jugador con sesión intentando acciones del dueño');
if (CFG.players[0]?.email) {
  const p = await login(CFG.players[0]);
  if (CFG.pitch) {
    const r = await call('/api/admin-actions', { method: 'POST', token: p.token, body: { action: 'create_manual_booking', payload: { pitch_id: CFG.pitch, date: '2030-01-01', selected_times: ['10:00'], customer_name: 'IDOR' } } });
    report(denied(r.status), 'Jugador no crea reservas manuales en cancha ajena', `HTTP ${r.status}`);
    const u = await call('/api/admin-actions', { method: 'POST', token: p.token, body: { action: 'update_pitch', payload: { id: CFG.pitch, name: 'HACKEADA' } } });
    report(denied(u.status), 'Jugador no edita canchas ajenas', `HTTP ${u.status}`);
  }
  const b = await call('/api/bookings/batch-action', { method: 'POST', token: p.token, body: { ids: [FAKE_UUID], action: 'cancel' } });
  report(denied(b.status) || (b.status === 200 && !(b.json?.updated > 0)), 'Jugador no cancela reservas ajenas', `HTTP ${b.status}`);
  const a = await call('/api/owner-requests', { method: 'PATCH', token: p.token, body: { user_id: p.userId, approve: true } });
  report(denied(a.status), 'Jugador no se aprueba a sí mismo como dueño', `HTTP ${a.status}`);
  const role = await rest(`/rest/v1/profiles?id=eq.${p.userId}`, { method: 'PATCH', token: p.token, body: { role: 'owner' }, prefer: 'return=representation' });
  const escalated = role.status < 300 && Array.isArray(role.json) && role.json[0]?.role === 'owner';
  report(!escalated, 'Jugador no se cambia el rol a dueño desde el navegador', `HTTP ${role.status}`);
  const others = await rest('/rest/v1/bookings?select=id,customer_phone&limit=20', { token: p.token });
  const foreign = Array.isArray(others.json) ? others.json.filter((x) => x.customer_phone).length : 0;
  info('Reservas visibles para el jugador', `${Array.isArray(others.json) ? others.json.length : 0} filas (deben ser solo las suyas)`);
  const csrf = await call('/api/promotions', { method: 'POST', token: p.token, headers: { Origin: 'https://sitio-malicioso.com' }, body: { action: 'ack', reward_id: FAKE_UUID } });
  report(csrf.status === 403, 'CSRF: petición desde otro sitio rechazada', `HTTP ${csrf.status}`);
  void foreign;

  // ── 7. Subidas maliciosas ──
  console.log('\n── 7. Subida de archivos maliciosos');
  const evil = [
    ['ataque.svg', 'image/svg+xml', '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'],
    ['foto.jpg', 'image/jpeg', '<html><script>alert(document.cookie)</script></html>'],
    ['shell.php', 'image/png', '<?php system($_GET["c"]); ?>'],
  ];
  for (const [name, type, content] of evil) {
    const fd = new FormData();
    fd.append('file', new Blob([content], { type }), name);
    fd.append('type', 'pitch');
    const r = await fetch(`${CFG.base}/api/upload`, { method: 'POST', body: fd, headers: { Authorization: `Bearer ${p.token}`, Origin: CFG.base } });
    report(r.status >= 400, `Rechaza archivo disfrazado: ${name}`, `HTTP ${r.status}`);
  }
  const fdp = new FormData();
  fdp.append('file', new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], { type: 'image/png' }), 'p.png');
  fdp.append('type', 'promotion');
  const pr = await fetch(`${CFG.base}/api/upload`, { method: 'POST', body: fdp, headers: { Authorization: `Bearer ${p.token}`, Origin: CFG.base } });
  report(pr.status === 403 || pr.status === 400, 'Jugador no sube imágenes de promociones', `HTTP ${pr.status}`);
} else {
  warn('Sin PLAYER_ACCOUNTS', 'se omiten las pruebas con sesión de jugador (6 y 7)');
}

// ── 8. SSRF y redirección abierta ──────────────────────────────────────────
console.log('\n── 8. SSRF y redirección abierta');
for (const target of ['http://169.254.169.254/latest/meta-data/', 'http://localhost:3000/api/owner-requests', 'http://127.0.0.1/', 'https://evil.example.com/x.png', 'file:///etc/passwd']) {
  const r = await call(`/api/image-proxy?url=${encodeURIComponent(target)}`);
  report(r.status >= 400, `Proxy de imágenes bloquea ${target}`, `HTTP ${r.status}`);
}
for (const next of ['https://evil.example.com', '//evil.example.com', '/\\evil.example.com']) {
  const r = await call(`/auth/callback?next=${encodeURIComponent(next)}&code=invalido`);
  const loc = r.headers?.get('location') || '';
  const external = /^https?:\/\//i.test(loc) && !loc.startsWith(CFG.base) || loc.startsWith('//');
  report(!external, `Sin redirección abierta con next=${next}`, loc || `HTTP ${r.status}`);
}

// ── 9. Inyección y cuerpos gigantes ────────────────────────────────────────
console.log('\n── 9. Inyección y cuerpos gigantes');
for (const q of ["' OR 1=1--", '%27%3B%20DROP%20TABLE%20bookings%3B--', '*),id.gt.0,(name.ilike.*', '<script>alert(1)</script>']) {
  const r = await call(`/api/search-companies?q=${encodeURIComponent(q)}`);
  report(r.status < 500, `Búsqueda resiste inyección: ${q.slice(0, 24)}`, `HTTP ${r.status}`);
}
{
  const big = JSON.stringify({ action: 'lock_booking', payload: { pitch_id: 'x'.repeat(2_000_000) } });
  const r = await call('/api/bookings', { method: 'POST', body: big });
  report(r.status !== 0 && r.status < 500, 'Cuerpo de 2 MB no tumba el servidor', `HTTP ${r.status} en ${r.ms.toFixed(0)} ms`);
}

// ── 10. Bots ───────────────────────────────────────────────────────────────
console.log('\n── 10. Protección contra bots');
{
  const burst = await Promise.all(Array.from({ length: 40 }, () => call('/api/bookings', { method: 'POST', body: { action: 'x' } })));
  const limited = burst.filter((r) => r.status === 429).length;
  report(limited > 0, 'Ráfaga de 40 peticiones desde una IP es frenada (429)', `${limited}/40 bloqueadas`);
  await sleep(1000);
  const spoof = await Promise.all(Array.from({ length: 40 }, (_, i) => call('/api/bookings', {
    method: 'POST', body: { action: 'x' },
    headers: { 'cf-connecting-ip': `203.0.113.${i}`, 'x-forwarded-for': `198.51.100.${i}`, 'x-real-ip': `192.0.2.${i}` },
  })));
  const spoofLimited = spoof.filter((r) => r.status === 429).length;
  report(spoofLimited > 0, 'Un bot NO evade el límite inventando su IP en los headers', `${spoofLimited}/40 bloqueadas`);
  info('Nota', 'el límite es por servidor (memoria). En Vercel con muchas instancias conviene además el Firewall de Vercel (Attack Challenge Mode / Rate Limit rules).');
}
{
  // Fuerza bruta de contraseñas contra un correo inexistente (no bloquea cuentas reales).
  const attempts = await Promise.all(Array.from({ length: 30 }, (_, i) => fetch(`${CFG.supabase}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: CFG.anon, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'noexiste.fuerzabruta@example.com', password: `clave-incorrecta-${i}` }),
  }).then((r) => r.status)));
  const blocked = attempts.filter((s) => s === 429).length;
  if (blocked) report(true, 'Fuerza bruta de login frenada por Supabase', `${blocked}/30 bloqueadas`);
  else warn('30 intentos de login seguidos sin bloqueo', 'revisa en Supabase › Auth › Rate Limits y activa CAPTCHA (Turnstile) en Auth');
}

process.exit(summary('Seguridad') ? 1 : 0);
