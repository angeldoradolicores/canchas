/**
 * ============================================================
 *  🏟️  CANCHEROS — Suite de Pruebas de Carga con k6
 * ============================================================
 *  Ejecutar local:
 *    k6 run tests/load/k6-canchas-full.js
 *
 *  Ejecutar en Grafana Cloud k6:
 *    k6 cloud tests/load/k6-canchas-full.js
 *
 *  Variables de entorno (pasar con -e):
 *    BASE_URL        URL base (default: https://cancheros.site)
 *    USER_EMAIL      Email del usuario de prueba
 *    USER_PASSWORD   Contraseña del usuario de prueba
 *    OWNER_EMAIL     Email del dueño de prueba
 *    OWNER_PASSWORD  Contraseña del dueño
 *    ANON_KEY        Supabase anon key
 *    SUPABASE_URL    URL de Supabase
 *    PITCH_ID        ID de una cancha real para las pruebas de reserva
 *
 *  Ejemplo de ejecución local:
 *    k6 run \
 *      -e USER_EMAIL=cliente@test.com \
 *      -e USER_PASSWORD=Test1234! \
 *      -e OWNER_EMAIL=dueno@test.com \
 *      -e OWNER_PASSWORD=Test1234! \
 *      -e PITCH_ID=uuid-de-tu-cancha \
 *      tests/load/k6-canchas-full.js
 * ============================================================
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';
import { randomIntBetween, randomItem } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';

// ── Métricas personalizadas ───────────────────────────────
const errorRate         = new Rate('error_rate');
const bookingDuration   = new Trend('booking_api_duration', true);
const searchDuration    = new Trend('search_companies_duration', true);
const dashboardDuration = new Trend('dashboard_stats_duration', true);
const totalErrors       = new Counter('total_errors');

// ── Configuración ─────────────────────────────────────────
const BASE_URL     = __ENV.BASE_URL     || 'https://cancheros.site';
const SUPABASE_URL = __ENV.SUPABASE_URL || 'https://rxykieyrzaqnfasouwke.supabase.co';
const ANON_KEY     = __ENV.ANON_KEY     || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ4eWtpZXlyemFxbmZhc291d2tlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcyNzM3MTUsImV4cCI6MjEwMjg0OTcxNX0.Y3lCThAI9ajyX9JlrBMh3av3Z-euXquxqBZyOl7jklc';
const PITCH_ID     = __ENV.PITCH_ID     || '';

// ── Escenarios de carga ───────────────────────────────────
export const options = {
  scenarios: {
    // 1. Usuarios explorando canchas (trafico tipico)
    public_browsing: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 20  },
        { duration: '1m',  target: 50  },
        { duration: '30s', target: 100 },
        { duration: '30s', target: 50  },
        { duration: '30s', target: 0   },
      ],
      gracefulRampDown: '10s',
      exec: 'public_browsing',
    },

    // 2. Usuarios realizando reservas
    booking_flow: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 5  },
        { duration: '2m',  target: 20 },
        { duration: '30s', target: 0  },
      ],
      startTime: '30s',
      gracefulRampDown: '10s',
      exec: 'booking_flow',
    },

    // 3. Duenos revisando el dashboard
    owner_dashboard: {
      executor: 'constant-vus',
      vus: 5,
      duration: '3m',
      startTime: '1m',
      exec: 'owner_dashboard',
    },

    // 4. Spike: simular evento viral o partido importante
    spike_test: {
      executor: 'ramping-arrival-rate',
      startRate: 10,
      timeUnit: '1s',
      preAllocatedVUs: 50,
      maxVUs: 200,
      stages: [
        { duration: '30s', target: 10  },
        { duration: '15s', target: 150 },
        { duration: '30s', target: 10  },
      ],
      startTime: '3m30s',
      exec: 'spike_test',
    },
  },

  // ── Umbrales de calidad ───────────────────────────────
  thresholds: {
    http_req_duration:           ['p(95)<2000', 'p(99)<4000'],
    search_companies_duration:   ['p(95)<1500'],
    booking_api_duration:        ['p(95)<3000'],
    dashboard_stats_duration:    ['p(95)<3000'],
    error_rate:                  ['rate<0.01'],
    http_req_failed:             ['rate<0.02'],
  },

  // ── Para Grafana Cloud k6 ─────────────────────────────
  ext: {
    loadimpact: {
      // Reemplaza con tu Project ID de Grafana Cloud
      // projectID: 123456,
      name: 'Cancheros - Full Load Suite',
      distribution: {
        'amazon:co:bogota': { loadZone: 'amazon:co:bogota', percent: 70 },
        'amazon:us:miami':  { loadZone: 'amazon:us:miami',  percent: 30 },
      },
    },
  },
};

// ── Setup: login y datos base ─────────────────────────────
export function setup() {
  // Login usuario cliente
  const loginRes = http.post(
    `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
    JSON.stringify({
      email:    __ENV.USER_EMAIL    || 'test@cancheros.site',
      password: __ENV.USER_PASSWORD || 'Test1234!',
    }),
    { headers: { 'Content-Type': 'application/json', 'apikey': ANON_KEY } }
  );

  let userToken = '';
  if (loginRes.status === 200) {
    userToken = loginRes.json('access_token') || '';
    console.log('Login cliente OK');
  } else {
    console.warn(`Login cliente fallo (${loginRes.status}) — tests publicos solo`);
  }

  // Login dueno
  let ownerToken = '';
  if (__ENV.OWNER_EMAIL) {
    const ownerRes = http.post(
      `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
      JSON.stringify({
        email:    __ENV.OWNER_EMAIL,
        password: __ENV.OWNER_PASSWORD || 'Test1234!',
      }),
      { headers: { 'Content-Type': 'application/json', 'apikey': ANON_KEY } }
    );
    if (ownerRes.status === 200) {
      ownerToken = ownerRes.json('access_token') || '';
      console.log('Login dueno OK');
    }
  }

  return { userToken, ownerToken };
}

// ── Helpers ───────────────────────────────────────────────
function authHeaders(token) {
  const h = { 'Content-Type': 'application/json' };
  if (token) h['Authorization'] = `Bearer ${token}`;
  return h;
}

function ok(res, name, maxStatus) {
  const isOk = res.status < (maxStatus || 400) || res.status === 404;
  errorRate.add(!isOk);
  if (!isOk) totalErrors.add(1);
  check(res, {
    [`${name} — status OK`]:     () => isOk,
    [`${name} — responde <3s`]:  () => res.timings.duration < 3000,
    [`${name} — tiene body`]:    () => (res.body || '').length > 0,
  });
}

// ── ESCENARIO 1: Navegacion publica ──────────────────────
export function public_browsing() {
  const cities = ['Pasto', 'Bogota', 'Medellin', 'Cali'];
  const city   = randomItem(cities);

  group('Busqueda de canchas', () => {
    const start = Date.now();
    const res = http.get(`${BASE_URL}/api/search-companies?q=${city}&limit=20`);
    searchDuration.add(Date.now() - start);
    ok(res, 'Busqueda');
    sleep(randomIntBetween(1, 3));
  });

  group('Pagina principal', () => {
    const res = http.get(BASE_URL);
    ok(res, 'Home');
    sleep(randomIntBetween(2, 4));
  });

  group('Disponibilidad de cancha', () => {
    if (!PITCH_ID) { sleep(1); return; }
    const today = new Date().toISOString().split('T')[0];
    const res = http.get(`${BASE_URL}/api/bookings?date=${today}&pitch_id=${PITCH_ID}`);
    ok(res, 'Disponibilidad');
    sleep(1);
  });

  group('Tour page', () => {
    const res = http.get(`${BASE_URL}/tour`);
    ok(res, 'Tour');
    sleep(randomIntBetween(1, 2));
  });

  sleep(randomIntBetween(1, 2));
}

// ── ESCENARIO 2: Flujo de reserva ────────────────────────
export function booking_flow(data) {
  const { userToken } = data || {};

  group('Mis reservas (autenticado)', () => {
    const start = Date.now();
    const res = http.get(`${BASE_URL}/api/bookings`, {
      headers: authHeaders(userToken),
    });
    bookingDuration.add(Date.now() - start);
    ok(res, 'Mis reservas');
    sleep(2);
  });

  // Simular formulario de reserva SIN crear datos reales
  // (solo prueba que el endpoint responda correctamente con validacion)
  group('Validacion de reserva (payload invalido)', () => {
    const start = Date.now();
    const res = http.post(
      `${BASE_URL}/api/bookings`,
      JSON.stringify({ pitch_id: '' }), // Payload invalido adrede
      { headers: authHeaders(userToken) }
    );
    bookingDuration.add(Date.now() - start);
    // Esperamos 400 o 422 — confirma que la validacion funciona
    check(res, {
      'Validacion: rechaza payload invalido': () => res.status >= 400 && res.status < 500,
      'Validacion: responde rapido': () => res.timings.duration < 2000,
    });
    sleep(randomIntBetween(2, 4));
  });

  sleep(randomIntBetween(1, 3));
}

// ── ESCENARIO 3: Dashboard del dueno ─────────────────────
export function owner_dashboard(data) {
  const { ownerToken } = data || {};
  if (!ownerToken) { sleep(5); return; }

  group('Stats del dashboard', () => {
    const start = Date.now();
    const res = http.post(
      `${BASE_URL}/api/admin-actions`,
      JSON.stringify({ action: 'get_dashboard_stats', payload: {} }),
      { headers: authHeaders(ownerToken) }
    );
    dashboardDuration.add(Date.now() - start);
    ok(res, 'Dashboard stats');
    sleep(3);
  });

  group('Reservas del complejo (pendientes)', () => {
    const res = http.post(
      `${BASE_URL}/api/admin-actions`,
      JSON.stringify({ action: 'get_bookings', payload: { status: 'pending', limit: 50 } }),
      { headers: authHeaders(ownerToken) }
    );
    ok(res, 'Reservas dueno');
    sleep(randomIntBetween(5, 10));
  });

  group('Canchas del complejo', () => {
    const res = http.post(
      `${BASE_URL}/api/admin-actions`,
      JSON.stringify({ action: 'get_pitches', payload: {} }),
      { headers: authHeaders(ownerToken) }
    );
    ok(res, 'Canchas dueno');
    sleep(2);
  });

  sleep(randomIntBetween(2, 5));
}

// ── ESCENARIO 4: Spike test ───────────────────────────────
export function spike_test() {
  const res1 = http.get(BASE_URL);
  ok(res1, 'Spike home');

  const res2 = http.get(`${BASE_URL}/api/search-companies?q=Pasto&limit=10`);
  ok(res2, 'Spike busqueda');

  sleep(0.5);
}

// ── Default para ejecucion simple ────────────────────────
export default function(data) {
  public_browsing(data);
}

export function teardown() {
  console.log('Suite de carga Cancheros finalizada.');
}
