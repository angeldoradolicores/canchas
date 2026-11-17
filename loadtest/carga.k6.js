/**
 * PRUEBA DE CARGA / ESTRÉS / PICO con k6.
 *
 *   k6 run -e PROFILE=humo loadtest/carga.k6.js        (1 min, 5 usuarios: verificar que todo responde)
 *   k6 run -e PROFILE=carga loadtest/carga.k6.js       (10 min, hasta 100 usuarios: tráfico normal alto)
 *   k6 run -e PROFILE=estres loadtest/carga.k6.js      (14 min, hasta 400: dónde se rompe)
 *   k6 run -e PROFILE=pico loadtest/carga.k6.js        (salto brusco a 300 usuarios: ej. un torneo publicado)
 *   k6 run -e PROFILE=resistencia loadtest/carga.k6.js (40 min a 60 usuarios: fugas de memoria / degradación)
 *
 * Las variables se toman de loadtest/.env.test (el script ejecutar.sh las carga).
 * Usuarios simulados (proporciones aproximadas del tráfico real):
 *   70% visitantes  → inicio, detalle de cancha, búsqueda, disponibilidad, promociones
 *   20% jugadores   → lo anterior + sus regalos y notificaciones (con sesión)
 *   10% dueños      → panel: estadísticas, canchas, reservas
 *   (opcional) ALLOW_WRITES=1 → invitados que bloquean y liberan horas de la cancha de prueba
 *
 * IMPORTANTE: desde un solo computador todas las peticiones salen de la misma IP; las APIs
 * con límite anti-bots (p. ej. /api/bookings: 25/min) responderán 429. Eso se mide aparte como
 * "limitado" y NO cuenta como error: es la protección funcionando.
 */
import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

const BASE = (__ENV.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const SB = (__ENV.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
const ANON = __ENV.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const PITCH = __ENV.TEST_PITCH_ID || '';
const PROFILE = __ENV.PROFILE || 'humo';
const ALLOW_WRITES = __ENV.ALLOW_WRITES === '1';

const PROFILES = {
  humo:        [{ duration: '1m', target: 5 }],
  carga:       [{ duration: '2m', target: 30 }, { duration: '3m', target: 100 }, { duration: '4m', target: 100 }, { duration: '1m', target: 0 }],
  estres:      [{ duration: '2m', target: 100 }, { duration: '3m', target: 200 }, { duration: '3m', target: 300 }, { duration: '3m', target: 400 }, { duration: '3m', target: 0 }],
  pico:        [{ duration: '30s', target: 10 }, { duration: '20s', target: 300 }, { duration: '2m', target: 300 }, { duration: '30s', target: 10 }, { duration: '1m', target: 0 }],
  resistencia: [{ duration: '3m', target: 60 }, { duration: '35m', target: 60 }, { duration: '2m', target: 0 }],
};
const stages = PROFILES[PROFILE] || PROFILES.humo;
const split = (pct) => stages.map((s) => ({ duration: s.duration, target: Math.max(s.target ? 1 : 0, Math.round(s.target * pct)) }));

const limited = new Counter('limitado_429');
const appErrors = new Rate('errores_app');
const pageTime = new Trend('tiempo_paginas', true);
const apiTime = new Trend('tiempo_apis', true);
const dbTime = new Trend('tiempo_supabase', true);
const lockTime = new Trend('tiempo_bloquear_hora', true);

export const options = {
  scenarios: {
    visitantes: { executor: 'ramping-vus', exec: 'visitante', stages: split(0.7), gracefulRampDown: '20s' },
    jugadores:  { executor: 'ramping-vus', exec: 'jugador',   stages: split(0.2), gracefulRampDown: '20s' },
    duenos:     { executor: 'ramping-vus', exec: 'dueno',     stages: split(0.1), gracefulRampDown: '20s' },
    ...(ALLOW_WRITES ? { reservas: { executor: 'constant-arrival-rate', exec: 'reserva', rate: 20, timeUnit: '1m', duration: stages.reduce((a, s) => a + toSec(s.duration), 0) + 's', preAllocatedVUs: 5 } } : {}),
  },
  thresholds: {
    errores_app: ['rate<0.01'],          // menos de 1% de errores reales (5xx, caídas, timeouts)
    tiempo_paginas: ['p(95)<1500'],      // 95% de las páginas en menos de 1,5 s
    tiempo_apis: ['p(95)<800'],          // 95% de las APIs en menos de 0,8 s
    tiempo_supabase: ['p(95)<500'],
    http_req_failed: ['rate<0.05'],
  },
  summaryTrendStats: ['avg', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
};
// 429 no es una falla del servidor: es el límite anti-bots respondiendo.
http.setResponseCallback(http.expectedStatuses({ min: 200, max: 399 }, 401, 429));

function toSec(d) { const m = /^(\d+)(s|m|h)$/.exec(d); return m ? Number(m[1]) * ({ s: 1, m: 60, h: 3600 })[m[2]] : 60; }

function login(email, password) {
  if (!email || !password) return '';
  const r = http.post(`${SB}/auth/v1/token?grant_type=password`, JSON.stringify({ email, password }), { headers: { apikey: ANON, 'Content-Type': 'application/json' } });
  return r.status === 200 ? r.json('access_token') : '';
}

export function setup() {
  const players = (__ENV.PLAYER_ACCOUNTS || '').split(';').filter(Boolean).map((p) => { const i = p.lastIndexOf(':'); return login(p.slice(0, i), p.slice(i + 1)); }).filter(Boolean);
  const owner = login(__ENV.OWNER_EMAIL, __ENV.OWNER_PASSWORD);
  // Canchas reales para navegar (públicas).
  const pr = http.get(`${SB}/rest/v1/pitches?select=id,company_id&limit=30`, { headers: { apikey: ANON } });
  const pitches = pr.status === 200 ? pr.json() : [];
  if (!pitches.length) console.warn('No se pudieron leer canchas públicas: revisa NEXT_PUBLIC_SUPABASE_URL / ANON KEY');
  if (!owner) console.warn('Sin sesión de dueño (OWNER_EMAIL/OWNER_PASSWORD): el escenario de dueños solo medirá páginas.');
  return { players, owner, pitches };
}

function record(res, trend, name) {
  trend.add(res.timings.duration);
  if (res.status === 429) { limited.add(1); return; }
  const bad = res.status === 0 || res.status >= 500;
  appErrors.add(bad);
  check(res, { [`${name} responde`]: () => !bad });
}

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const bogotaDate = (days) => { const d = new Date(Date.now() + days * 86400000 - 5 * 3600000); return d.toISOString().slice(0, 10); };

function navegar(data, token) {
  const p = pick(data.pitches.length ? data.pitches : [{ id: PITCH, company_id: '' }]);
  const auth = token ? { Authorization: `Bearer ${token}` } : {};
  group('inicio', () => record(http.get(`${BASE}/`, { tags: { name: 'pagina_inicio' } }), pageTime, 'Inicio'));
  sleep(Math.random() * 2 + 1);
  group('buscar', () => record(http.get(`${BASE}/api/search-companies?q=${pick(['cancha', 'futbol', 'sintetica', 'pasto', ''])}`, { tags: { name: 'api_busqueda' } }), apiTime, 'Búsqueda'));
  sleep(Math.random() * 2 + 1);
  if (p.id) {
    group('detalle cancha', () => {
      record(http.get(`${BASE}/cancha/${p.id}`, { tags: { name: 'pagina_cancha' } }), pageTime, 'Detalle de cancha');
      const day = bogotaDate(Math.floor(Math.random() * 14));
      record(http.post(`${SB}/rest/v1/rpc/get_pitch_occupancy`, JSON.stringify({ p_pitch_ids: [p.id], p_from: `${day}T00:00:00-05:00`, p_to: `${day}T23:59:59-05:00` }),
        { headers: { apikey: ANON, Authorization: `Bearer ${token || ANON}`, 'Content-Type': 'application/json' }, tags: { name: 'rpc_disponibilidad' } }), dbTime, 'Disponibilidad');
      if (p.company_id) record(http.get(`${BASE}/api/promotions?company_id=${p.company_id}`, { headers: auth, tags: { name: 'api_promociones' } }), apiTime, 'Promociones');
      record(http.get(`${BASE}/api/tournaments?pitch_id=${p.id}`, { tags: { name: 'api_torneos' } }), apiTime, 'Torneos');
      record(http.get(`${BASE}/api/schools?pitch_id=${p.id}`, { tags: { name: 'api_escuelas' } }), apiTime, 'Escuelas');
    });
  }
  sleep(Math.random() * 3 + 2);
}

export function visitante(data) { navegar(data, ''); }

export function jugador(data) {
  const token = data.players.length ? data.players[__VU % data.players.length] : '';
  navegar(data, token);
  if (token) {
    group('mis datos', () => {
      record(http.get(`${BASE}/api/promotions`, { headers: { Authorization: `Bearer ${token}` }, tags: { name: 'api_mis_regalos' } }), apiTime, 'Mis regalos');
      record(http.get(`${SB}/rest/v1/notifications?select=id,title,is_read&order=created_at.desc&limit=20`, { headers: { apikey: ANON, Authorization: `Bearer ${token}` }, tags: { name: 'rest_notificaciones' } }), dbTime, 'Notificaciones');
      record(http.get(`${BASE}/reservations`, { tags: { name: 'pagina_mis_reservas' } }), pageTime, 'Mis reservas');
    });
  }
  sleep(Math.random() * 3 + 2);
}

export function dueno(data) {
  const h = { Authorization: `Bearer ${data.owner}`, 'Content-Type': 'application/json', Origin: BASE };
  group('panel dueño', () => {
    record(http.get(`${BASE}/dashboard`, { tags: { name: 'pagina_panel' } }), pageTime, 'Panel');
    record(http.get(`${BASE}/dashboard/bookings`, { tags: { name: 'pagina_reservas_dueno' } }), pageTime, 'Gestión de reservas');
    if (data.owner) {
      record(http.post(`${BASE}/api/admin-actions`, JSON.stringify({ action: 'get_dashboard_stats', payload: {} }), { headers: h, tags: { name: 'api_estadisticas' } }), apiTime, 'Estadísticas');
      record(http.post(`${BASE}/api/admin-actions`, JSON.stringify({ action: 'get_pitches', payload: {} }), { headers: h, tags: { name: 'api_canchas_dueno' } }), apiTime, 'Canchas del dueño');
      record(http.get(`${SB}/rest/v1/bookings?select=id,status,start_time,customer_name&order=start_time.desc&limit=200`, { headers: { apikey: ANON, Authorization: `Bearer ${data.owner}` }, tags: { name: 'rest_reservas_dueno' } }), dbTime, 'Reservas del dueño');
    }
  });
  sleep(Math.random() * 4 + 3);
}

/** Invitado que bloquea una hora libre de la cancha de prueba y la libera (no deja reservas). */
export function reserva() {
  if (!PITCH) return;
  const jar = http.cookieJar();
  jar.set(BASE, 'booking_guest', `${uuid()}`);
  const day = bogotaDate(30 + Math.floor(Math.random() * 30));
  const slot = `${String(6 + Math.floor(Math.random() * 16)).padStart(2, '0')}:00`;
  const r = http.post(`${BASE}/api/bookings`, JSON.stringify({ action: 'lock_booking', payload: { pitch_id: PITCH, selected_date: day, selected_times: [slot], turnstile_token: __ENV.TURNSTILE_TEST_TOKEN || null } }),
    { headers: { 'Content-Type': 'application/json', Origin: BASE }, tags: { name: 'api_bloquear_hora' } });
  lockTime.add(r.timings.duration);
  record(r, apiTime, 'Bloquear hora');
  const ids = r.status === 200 ? (r.json('data.booking_ids') || []) : [];
  if (ids.length) {
    http.post(`${BASE}/api/bookings`, JSON.stringify({ action: 'cancel_draft', payload: { booking_ids: ids } }), { headers: { 'Content-Type': 'application/json', Origin: BASE }, tags: { name: 'api_liberar_hora' } });
  }
}

function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, () => Math.floor(Math.random() * 16).toString(16));
}

export function handleSummary(data) {
  const m = data.metrics;
  const v = (k, s = 'p(95)') => (m[k]?.values?.[s] ?? 0).toFixed(0);
  const reqs = m.http_reqs?.values?.count ?? 0;
  const rps = (m.http_reqs?.values?.rate ?? 0).toFixed(1);
  const txt = `
══════════════ RESULTADO (${PROFILE}) contra ${BASE} ══════════════
Peticiones totales: ${reqs}   (${rps} por segundo)
Usuarios simultáneos máximos: ${m.vus_max?.values?.max ?? 0}
Errores reales del servidor (5xx/caídas): ${((m.errores_app?.values?.rate ?? 0) * 100).toFixed(2)}%
Frenadas por límite anti-bots (429): ${m.limitado_429?.values?.count ?? 0}

Tiempo de respuesta (p95 = el 95% respondió en menos de):
  Páginas   p95 ${v('tiempo_paginas')} ms   (mediana ${v('tiempo_paginas', 'med')} ms, máx ${v('tiempo_paginas', 'max')} ms)
  APIs      p95 ${v('tiempo_apis')} ms   (mediana ${v('tiempo_apis', 'med')} ms, máx ${v('tiempo_apis', 'max')} ms)
  Supabase  p95 ${v('tiempo_supabase')} ms   (mediana ${v('tiempo_supabase', 'med')} ms)
${ALLOW_WRITES ? `  Bloquear hora p95 ${v('tiempo_bloquear_hora')} ms\n` : ''}
Umbrales: ${Object.entries(m).filter(([, x]) => x.thresholds).map(([k, x]) => `${k} ${Object.values(x.thresholds).every((t) => t.ok) ? 'OK' : 'FALLÓ'}`).join(' · ')}
`;
  return { stdout: txt, [`loadtest/resultados/carga-${PROFILE}-${Date.now()}.json`]: JSON.stringify(data, null, 2) };
}
