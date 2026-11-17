/**
 * SIMULACIÓN DE ATAQUE DE BOTS (inundación controlada) con k6.
 *
 * Mientras un "bot" golpea las rutas caras (bloquear horas, búsqueda, login, proxy de imágenes),
 * un "cliente real" sigue navegando a ritmo normal. Se mide:
 *   - qué tan rápido el bot empieza a recibir 429 (límite anti-bots),
 *   - si el bot logra errores 5xx (el servidor se cae o se satura),
 *   - cuánto empeora la latencia del cliente real durante el ataque.
 *
 *   k6 run loadtest/bots.k6.js                         (60 s, 30 peticiones/s del bot)
 *   k6 run -e BOT_RPS=100 -e DURACION=2m loadtest/bots.k6.js
 *
 * En producción exige -e I_UNDERSTAND_PRODUCTION=1: el ataque consume funciones de Vercel
 * y consultas de Supabase (cuesta dinero y puede afectar a usuarios reales). Hazlo de madrugada.
 */
import http from 'k6/http';
import { check } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

const BASE = (__ENV.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const SB = (__ENV.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
const ANON = __ENV.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const RPS = Number(__ENV.BOT_RPS || 30);
const DUR = __ENV.DURACION || '60s';

if (/cancheros\.site/i.test(BASE) && __ENV.I_UNDERSTAND_PRODUCTION !== '1') {
  throw new Error('Ataque simulado contra PRODUCCIÓN: agrega -e I_UNDERSTAND_PRODUCTION=1 si de verdad quieres hacerlo.');
}

const botBlocked = new Counter('bot_bloqueado_429');
const botPassed = new Counter('bot_paso');
const botCrash = new Counter('bot_provoco_5xx');
const realLatency = new Trend('cliente_real_latencia', true);
const realErrors = new Rate('cliente_real_errores');

export const options = {
  scenarios: {
    bot: { executor: 'constant-arrival-rate', exec: 'bot', rate: RPS, timeUnit: '1s', duration: DUR, preAllocatedVUs: Math.min(RPS * 2, 400), maxVUs: 600 },
    cliente_real: { executor: 'constant-arrival-rate', exec: 'clienteReal', rate: 1, timeUnit: '2s', duration: DUR, preAllocatedVUs: 3 },
  },
  thresholds: {
    bot_provoco_5xx: ['count<5'],               // el ataque no debe tumbar el servidor
    cliente_real_errores: ['rate<0.02'],        // el cliente real casi no debe notar errores
    cliente_real_latencia: ['p(95)<2000'],      // ni demoras grandes
  },
};
http.setResponseCallback(http.expectedStatuses({ min: 200, max: 499 }));

const ATTACKS = [
  () => http.post(`${BASE}/api/bookings`, JSON.stringify({ action: 'lock_booking', payload: { pitch_id: 'bot', selected_date: '2030-01-01', selected_times: ['10:00'] } }), { headers: { 'Content-Type': 'application/json' }, tags: { name: 'bot_bloquear' } }),
  () => http.get(`${BASE}/api/search-companies?q=${Math.random().toString(36).slice(2)}`, { tags: { name: 'bot_busqueda' } }),
  () => http.get(`${BASE}/api/image-proxy?url=${encodeURIComponent('https://images.unsplash.com/photo-1?' + Math.random())}`, { tags: { name: 'bot_proxy' } }),
  () => http.post(`${BASE}/api/upload`, 'x', { headers: { 'Content-Type': 'text/plain' }, tags: { name: 'bot_upload' } }),
  () => http.post(`${SB}/auth/v1/token?grant_type=password`, JSON.stringify({ email: `bot${Math.random()}@example.com`, password: 'x' }), { headers: { apikey: ANON, 'Content-Type': 'application/json' }, tags: { name: 'bot_login' } }),
];

export function bot() {
  const r = ATTACKS[Math.floor(Math.random() * ATTACKS.length)]();
  if (r.status === 429) botBlocked.add(1);
  else if (r.status === 0 || r.status >= 500) botCrash.add(1);
  else botPassed.add(1);
}

export function clienteReal() {
  const r = http.get(`${BASE}/`, { tags: { name: 'real_inicio' } });
  realLatency.add(r.timings.duration);
  realErrors.add(r.status === 0 || r.status >= 500);
  check(r, { 'cliente real atendido': (x) => x.status === 200 });
}

export function handleSummary(data) {
  const m = data.metrics;
  const n = (k) => m[k]?.values?.count ?? 0;
  const total = n('bot_bloqueado_429') + n('bot_paso') + n('bot_provoco_5xx');
  return {
    stdout: `
══════════════ ATAQUE DE BOTS SIMULADO contra ${BASE} ══════════════
Bot: ${RPS} peticiones/s durante ${DUR} → ${total} peticiones
  Bloqueadas por límite (429): ${n('bot_bloqueado_429')} (${total ? ((n('bot_bloqueado_429') / total) * 100).toFixed(0) : 0}%)
  Pasaron (rechazadas por validación o atendidas): ${n('bot_paso')}
  Provocaron error del servidor (5xx/caída): ${n('bot_provoco_5xx')}
Cliente real durante el ataque:
  Latencia p95 ${(m.cliente_real_latencia?.values?.['p(95)'] ?? 0).toFixed(0)} ms (mediana ${(m.cliente_real_latencia?.values?.med ?? 0).toFixed(0)} ms)
  Errores ${((m.cliente_real_errores?.values?.rate ?? 0) * 100).toFixed(1)}%
Nota: el bot sale de UNA IP. Una botnet real usa miles; contra eso protege el Firewall de Vercel, no el código.
`,
    [`loadtest/resultados/bots-${Date.now()}.json`]: JSON.stringify(data, null, 2),
  };
}
