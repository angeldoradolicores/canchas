#!/usr/bin/env node
/**
 * FASE 1 — Seguridad de la base de datos (RLS, privilegios por columna, RPC).
 * Ataca Supabase directo, como lo haría alguien con DevTools, primero sin sesión
 * (clave anónima) y luego con la sesión de un jugador y del dueño de prueba.
 *
 *   node --env-file=loadtest/.env.test loadtest/rls.mjs
 *
 * Escrituras: solo intenta cambios que deben fallar. Si alguno NO falla, escribe el
 * MISMO valor que ya tenía (no altera datos) o toca filas de prueba ("PRUEBA AUDITORIA").
 * La única fila que crea a propósito es un borrador en la cancha de prueba, que se libera al final.
 * Nunca imprime celulares ni nombres reales: solo conteos.
 */
import { CFG, env, requireVars, login, call, rest, report, warn, info, summary, futureDate } from './lib.mjs';

requireVars(['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'TEST_PITCH_ID']);
const FAKE = '00000000-0000-4000-8000-000000000000';
const MARK = env('AUDIT_MARK', 'PRUEBA AUDITORIA');
const blocked = (r) => r.status >= 400 || (Array.isArray(r.json) && r.json.length === 0);
const short = (r) => `HTTP ${r.status}${Array.isArray(r.json) ? `, ${r.json.length} filas` : ''}`;

// Datos públicos que necesitamos
const testPitch = (await rest(`/rest/v1/pitches?select=id,company_id,price_per_hour,booking_percentage&id=eq.${CFG.pitch}`)).json?.[0];
if (!testPitch) { console.error('No encuentro TEST_PITCH_ID'); process.exit(2); }
const otherPitch = (await rest(`/rest/v1/pitches?select=id,company_id,price_per_hour,booking_percentage&company_id=neq.${testPitch.company_id}&limit=1`)).json?.[0];
const testProfiles = (await rest(`/rest/v1/profiles?select=id,full_name&full_name=like.${encodeURIComponent(MARK)}*`)).json || [];

async function suite(label, token) {
  console.log(`\n── ${label}: lecturas`);
  const me = token ? JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).sub : null;

  const bk = await rest('/rest/v1/bookings?select=id,user_id,customer_phone&limit=1000', { token });
  const foreign = Array.isArray(bk.json) ? bk.json.filter((b) => b.user_id !== me).length : 0;
  report(bk.status >= 400 || foreign === 0, `${label}: no ve reservas ajenas (nombre/celular/comprobante)`, `${short(bk)}, ajenas: ${foreign}`);

  const pr = await rest('/rest/v1/profiles?select=id,phone,role', { token });
  const otherPhones = Array.isArray(pr.json) ? pr.json.filter((p) => p.id !== me && p.phone).length : 0;
  if (otherPhones) warn(`${label}: ve el celular de ${otherPhones} perfiles ajenos`, 'aceptado por el dueño del negocio el 2026-11-18 (Comunidad muestra el celular)');
  else report(true, `${label}: no ve celulares de otros perfiles`, short(pr));
  const roles = Array.isArray(pr.json) ? pr.json.filter((p) => p.role === 'superadmin').length : 0;
  if (roles) warn(`${label}: puede identificar ${roles} cuenta(s) superadmin por profiles.role`, 'facilita apuntar ataques');

  for (const col of ['whatsapp_qr_code', 'whatsapp_instance_name', 'whatsapp_connected_phone', 'bank_account', 'bank_name', 'filter_personal_messages']) {
    const r = await rest(`/rest/v1/companies?select=${col}&limit=1`, { token });
    report(r.status >= 400, `${label}: no lee companies.${col}`, `HTTP ${r.status}`);
  }
  for (const t of ['security_alerts', 'booking_blocked_phones', 'owner_requests', 'complex_promotions', 'promotion_rewards']) {
    const r = await rest(`/rest/v1/${t}?select=*&limit=50`, { token });
    const others = Array.isArray(r.json) ? r.json.filter((x) => (x.user_id ?? null) !== me).length : 0;
    report(r.status >= 400 || others === 0, `${label}: no lee ${t} ajenos`, `${short(r)}, ajenos ${others}`);
  }
  // Hallazgo 2026-11-18 (crítico): vistas creadas a mano que saltan el RLS de bookings y companies.
  for (const v of ['bookings_confirmed_full', 'bookings_reminder_2h']) {
    const r = await rest(`/rest/v1/${v}?select=*&limit=200`, { token });
    const foreignRows = Array.isArray(r.json) ? r.json.filter((x) => x.user_id !== me).length : 0;
    report(r.status >= 400 || foreignRows === 0, `${label}: la vista ${v} no expone reservas ajenas`, `${short(r)}, ajenas ${foreignRows}`);
  }
  for (const t of ['notifications', 'push_subscriptions', 'pitch_favorites']) {
    const r = await rest(`/rest/v1/${t}?select=user_id&limit=200`, { token });
    const others = Array.isArray(r.json) ? r.json.filter((x) => x.user_id !== me).length : 0;
    report(others === 0, `${label}: no lee ${t} de otros usuarios`, `${short(r)}, ajenas ${others}`);
  }

  console.log(`\n── ${label}: escrituras directas (todas deben fallar)`);
  const victim = testProfiles.find((p) => p.id !== me)?.id || FAKE;
  const attempts = [
    ['insertar reserva confirmada', 'POST', '/rest/v1/bookings', { pitch_id: CFG.pitch, user_id: me, start_time: `${futureDate(40)}T10:00:00-05:00`, end_time: `${futureDate(40)}T11:00:00-05:00`, status: 'confirmed', payment_status: 'verified', source: 'owner_panel', customer_name: MARK, total_price: 1 }],
    ['cambiar precio de la cancha (mismo valor)', 'PATCH', `/rest/v1/pitches?id=eq.${CFG.pitch}`, { price_per_hour: testPitch.price_per_hour }],
    ['cambiar custom_pricing de la cancha', 'PATCH', `/rest/v1/pitches?id=eq.${CFG.pitch}`, { booking_percentage: testPitch.booking_percentage }],
    ...(otherPitch ? [['cambiar cancha de OTRO complejo (mismo valor)', 'PATCH', `/rest/v1/pitches?id=eq.${otherPitch.id}`, { price_per_hour: otherPitch.price_per_hour }]] : []),
    ['crear cancha en complejo ajeno', 'POST', '/rest/v1/pitches', { company_id: testPitch.company_id, name: MARK, price_per_hour: 1 }],
    ['crear complejo', 'POST', '/rest/v1/companies', { owner_id: me || FAKE, name: MARK }],
    ['subirse el rol a owner', 'PATCH', `/rest/v1/profiles?id=eq.${me || FAKE}`, { role: 'owner' }],
    ['subirse el rol a superadmin', 'PATCH', `/rest/v1/profiles?id=eq.${me || FAKE}`, { role: 'superadmin' }],
    ['cambiar perfil ajeno', 'PATCH', `/rest/v1/profiles?id=eq.${victim}`, { full_name: `${MARK} hackeado` }],
    ['insertar security_alert', 'POST', '/rest/v1/security_alerts', { code: 'fake', customer_name: MARK }],
    ['bloquear un celular', 'POST', '/rest/v1/booking_blocked_phones', { phone: '3000000001' }],
    ['crear promoción', 'POST', '/rest/v1/complex_promotions', { company_id: testPitch.company_id, title: MARK }],
    ['regalarse horas de bono', 'POST', '/rest/v1/promotion_rewards', { promotion_id: FAKE, user_id: me || FAKE, hours: 50, remaining: 50 }],
    ['notificar a otro usuario', 'POST', '/rest/v1/notifications', { user_id: victim, title: MARK, message: 'phishing', type: 'info' }],
    ['falsificar una alerta de seguridad', 'POST', '/rest/v1/notifications', { user_id: victim, sender_id: me || FAKE, title: MARK, message: 'phishing', type: 'security_alert' }],
    ['notificar haciéndose pasar por otro', 'POST', '/rest/v1/notifications', { user_id: victim, sender_id: victim, title: MARK, message: 'x', type: 'challenge_join' }],
    ['aprobarse como dueño', 'POST', '/rest/v1/owner_requests', { user_id: me || FAKE, status: 'approved' }],
  ];
  for (const [name, method, path, body] of attempts) {
    const r = await rest(path, { method, token, body, prefer: 'return=representation' });
    report(blocked(r), `${label}: ${name}`, short(r));
  }

  console.log(`\n── ${label}: funciones internas (RPC)`);
  for (const [fn, body] of [
    ['submit_booking_secure', {}], ['receipt_bookings', { p_path: '/api/receipts/x' }],
    ['review_owner_request', { p_user: me || FAKE, p_reviewer: me || FAKE, p_approve: true }],
    ['redeem_complex_reward', {}], ['record_promotion_credit', {}], ['resolve_pending_booking', {}],
    ['get_booking_notification_info', {}], ['link_promotion_phone', {}],
    // Funciones viejas ejecutables por cualquiera (no se invocan las que cambian datos reales:
    // expire_pending_bookings / cleanup_expired_drafts se comprueban con verificar_bd.sql).
    ['create_booking', { p_pitch_id: FAKE, p_company_id: FAKE, p_user_name: MARK, p_user_phone: '3000000000', p_start_time: '2030-01-01T10:00:00Z', p_end_time: '2030-01-01T11:00:00Z' }],
    ['check_pitch_availability_n8nn', { p_company_id: testPitch.company_id, p_date: futureDate(1) }],
  ]) {
    const r = await rest(`/rest/v1/rpc/${fn}`, { method: 'POST', token, body });
    report(r.status === 401 || r.status === 403 || r.status === 404 || /42501|permission denied/.test(r.text), `${label}: RPC ${fn} bloqueada`, `HTTP ${r.status}`);
  }
  {
    const r = await rest('/rest/v1/rpc/get_pitch_occupancy', { method: 'POST', token, body: { p_pitch_ids: Array(60).fill(CFG.pitch), p_from: '2000-01-01T00:00:00Z', p_to: '2100-01-01T00:00:00Z' } });
    report(Array.isArray(r.json) && r.json.length === 0, `${label}: get_pitch_occupancy limita canchas (≤50) y rango (≤370 días)`, short(r));
    const ok = await rest('/rest/v1/rpc/get_pitch_occupancy', { method: 'POST', token, body: { p_pitch_ids: [CFG.pitch], p_from: '2026-01-01T00:00:00Z', p_to: '2026-12-31T00:00:00Z' } });
    const leaks = Array.isArray(ok.json) && ok.json.some((x) => 'customer_name' in x || 'customer_phone' in x || 'user_id' in x);
    report(!leaks, `${label}: get_pitch_occupancy no devuelve datos personales`, short(ok));
    const st = await rest('/rest/v1/rpc/get_booking_statuses', { method: 'POST', token, body: { p_ids: [FAKE] } });
    report(st.status === 200 && !/customer|phone/.test(st.text), `${label}: get_booking_statuses solo devuelve id y estado`, short(st));
    const cpa = await rest('/rest/v1/rpc/check_pitch_availability', { method: 'POST', token, body: { p_company_id: testPitch.company_id, p_date: futureDate(1) } });
    if (cpa.status === 200) warn(`${label}: check_pitch_availability es invocable desde el navegador`, 'la usa n8n; con RLS da todo "disponible" a anónimos. Revocar a anon/authenticated');
  }
}

await suite('Anónimo', null);

const havePlayer = CFG.players[0] && !/COMPLETAR/.test(CFG.players[0].password);
if (havePlayer) {
  const p1 = await login(CFG.players[0]);
  await suite('Jugador', p1.token);

  console.log('\n── Jugador: borrador propio manipulado');
  const cookieless = await call('/api/bookings', { method: 'POST', token: p1.token, body: { action: 'lock_booking', payload: { pitch_id: CFG.pitch, selected_date: futureDate(45), selected_times: ['21:00'] } } });
  const draftIds = cookieless.json?.booking_ids || cookieless.json?.data?.booking_ids || cookieless.json?.bookingIds || [];
  if (cookieless.status === 200 && draftIds.length) {
    for (const [name, body] of [
      ['bajarse el precio de su reserva', { total_price: 1, deposit_amount: 0 }],
      ['confirmarse su reserva', { status: 'confirmed', payment_status: 'verified' }],
      ['marcarla como reserva del dueño', { source: 'owner_panel' }],
      ['marcarla como turno fijo', { booking_type: 'contract' }],
      ['alargar el borrador un año', { expires_at: '2030-01-01T00:00:00Z' }],
    ]) {
      const r = await rest(`/rest/v1/bookings?id=eq.${draftIds[0]}`, { method: 'PATCH', token: p1.token, body, prefer: 'return=representation' });
      report(blocked(r), `Jugador: ${name} (PATCH directo)`, short(r));
    }
    await call('/api/bookings', { method: 'POST', token: p1.token, body: { action: 'cancel_draft', payload: { pitch_id: CFG.pitch, selected_date: futureDate(45), selected_times: ['21:00'], booking_ids: draftIds } } });
  } else {
    warn('Jugador: no pude crear un borrador para manipularlo', `HTTP ${cookieless.status} ${cookieless.text.slice(0, 120)}`);
  }

  console.log('\n── Jugador: escalada de rol por user_metadata');
  await fetch(`${CFG.supabase}/auth/v1/user`, { method: 'PUT', headers: { apikey: CFG.anon, Authorization: `Bearer ${p1.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ data: { role: 'superadmin' } }) });
  const relog = await login(CFG.players[0]);
  for (const [path, opts, name] of [
    ['/api/admin/security', {}, 'panel de seguridad del superadmin'],
    ['/api/owner-requests', { method: 'PATCH', body: { user_id: p1.userId, approve: true } }, 'aprobarse como dueño'],
    ['/api/admin-actions', { method: 'POST', body: { action: 'get_dashboard_stats', payload: {} } }, 'estadísticas de dueño'],
    ['/api/bookings/blocked-phones', {}, 'lista de celulares bloqueados'],
  ]) {
    const r = await call(path, { ...opts, token: relog.token });
    report(r.status === 401 || r.status === 403 || r.status === 404, `Jugador con user_metadata.role=superadmin: ${name}`, `HTTP ${r.status}`);
  }
  {
    // Un usuario normal sí recibe 200, pero solo con SU propia solicitud y admin=false.
    const r = await call('/api/owner-requests', { token: relog.token });
    const rows = Array.isArray(r.json?.data) ? r.json.data : [];
    const foreign = rows.filter((x) => x.user_id !== p1.userId).length;
    report(r.status !== 200 || (r.json?.admin === false && foreign === 0), 'Jugador con user_metadata.role=superadmin: no ve solicitudes de dueño ajenas', `HTTP ${r.status}, admin=${r.json?.admin}, ajenas ${foreign}`);
  }
  await fetch(`${CFG.supabase}/auth/v1/user`, { method: 'PUT', headers: { apikey: CFG.anon, Authorization: `Bearer ${relog.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ data: { role: null } }) });
} else {
  info('Jugador', 'sin contraseña en PLAYER_ACCOUNTS: se omiten las pruebas con sesión');
}

process.exit(summary('Fase 1 — Base de datos') ? 1 : 0);
