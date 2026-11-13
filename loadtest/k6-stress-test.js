/**
 * Prueba de estrés para Canchas Pasto — disponibilidad + carrera de reserva.
 *
 * IMPORTANTE antes de correrlo:
 *  - Esto genera tráfico REAL contra el BASE_URL que le pases. Si apuntas a
 *    producción (cancheros.site), hazlo en horario de baja demanda y avisa
 *    al equipo. Preferible probar primero contra un entorno de staging si
 *    existe.
 *  - El escenario "race_booking" crea reservas tipo 'draft' reales para un
 *    pitch/fecha/hora de prueba. Usa un PITCH_ID de una cancha de prueba
 *    (no una real de un cliente), y bórralas después si hace falta:
 *      SIMULACIÓN DE LIMPIEZA: las reservas 'draft' expiran solas (hay un
 *      cron en Supabase que las purga), pero puedes forzar la limpieza con
 *      el propio endpoint: POST /api/bookings { action: "cancel_draft", ... }
 *  - k6 NO puede medir CPU del servidor (eso solo lo ve el servidor). Para
 *    el umbral "CPU < 75%" mira en paralelo las métricas de Vercel (si el
 *    front corre ahí) y la alarma de CloudWatch del EC2 (para el lado
 *    n8n/Evolution) mientras corre esta prueba.
 *
 * Variables de entorno esperadas (pásalas con -e NOMBRE=valor):
 *   BASE_URL   -> ej: https://cancheros.site  (SIN / al final)
 *   PITCH_ID   -> uuid de una cancha real/de prueba para el test de disponibilidad y de carrera
 *   TEST_DATE  -> fecha YYYY-MM-DD a usar en ambos escenarios (usa una fecha futura)
 *   TEST_TIME  -> hora HH:MM del slot exacto a disputar en la carrera (ej: "19:00")
 *
 * Ejecutar:
 *   k6 run -e BASE_URL=https://cancheros.site \
 *          -e PITCH_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx \
 *          -e TEST_DATE=2026-12-20 \
 *          -e TEST_TIME=19:00 \
 *          loadtest/k6-stress-test.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const PITCH_ID = __ENV.PITCH_ID || 'CAMBIA_ESTO_POR_UN_PITCH_ID_REAL';
const TEST_DATE = __ENV.TEST_DATE || '2026-12-20';
const TEST_TIME = __ENV.TEST_TIME || '19:00';

// ── Métricas custom para medir CORRECCIÓN, no solo velocidad ──────────────
const lockSuccesses = new Counter('race_lock_successes');       // debe terminar en exactamente 1
const lockSlotTaken = new Counter('race_lock_slot_taken_409');  // contención esperada y correcta
const lockUnexpectedErrors = new Counter('race_lock_unexpected_errors'); // 500 / timeout / otro -> esto SÍ es un bug
const availabilityErrors = new Rate('availability_error_rate');
const availabilityDuration = new Trend('availability_duration_ms');

export const options = {
  scenarios: {
    // ── ESCENARIO A: lectura masiva de disponibilidad (el camino más caliente) ──
    disponibilidad: {
      executor: 'ramping-vus',
      exec: 'checkAvailability',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 200 },   // calentamiento
        { duration: '1m',  target: 800 },   // carga sostenida alta
        { duration: '30s', target: 1200 },  // pico — representa una fracción de los 5000 usuarios
                                             // consultando disponibilidad casi al mismo tiempo
        { duration: '30s', target: 0 },     // enfriamiento
      ],
      gracefulRampDown: '10s',
    },

    // ── ESCENARIO B: carrera real de doble-reserva sobre el MISMO slot ──
    // 50 "usuarios" disparan la reserva del mismo pitch+fecha+hora en la
    // misma ráfaga. Debe quedar exactamente 1 éxito y 49 rechazos 409.
    race_booking: {
      executor: 'shared-iterations',
      exec: 'raceBooking',
      vus: 50,
      iterations: 50,
      maxDuration: '20s',
      startTime: '10s', // arranca poco después de que el escenario A ya esté generando carga de fondo
    },
  },
  thresholds: {
    // Umbrales pedidos: P95 < 200ms y tasa de error < 0.1% — aplicados al
    // escenario de disponibilidad, que es el tráfico de lectura normal.
    'availability_duration_ms': ['p(95)<200'],
    'availability_error_rate': ['rate<0.001'],
    // La carrera NUNCA debe producir más de 1 éxito ni ningún error inesperado.
    'race_lock_unexpected_errors': ['count==0'],
  },
};

export function checkAvailability() {
  const url = `${BASE_URL}/api/bookings?pitch_id=${PITCH_ID}&date=${TEST_DATE}`;
  const res = http.get(url, { tags: { name: 'GET /api/bookings (disponibilidad)' } });

  const ok = check(res, {
    'status 200': (r) => r.status === 200,
    'respuesta tiene success:true': (r) => {
      try { return JSON.parse(r.body).success === true; } catch (e) { return false; }
    },
  });

  availabilityDuration.add(res.timings.duration);
  availabilityErrors.add(!ok);

  sleep(Math.random() * 2 + 0.5); // simula "think time" humano entre consultas
}

export function raceBooking() {
  const url = `${BASE_URL}/api/bookings`;
  const payload = JSON.stringify({
    action: 'lock_booking',
    payload: {
      pitch_id: PITCH_ID,
      selected_date: TEST_DATE,
      selected_times: [TEST_TIME],
    },
  });
  const params = {
    headers: { 'Content-Type': 'application/json' },
    tags: { name: 'POST /api/bookings (lock_booking - carrera)' },
  };

  const res = http.post(url, payload, params);

  if (res.status === 200 || res.status === 201) {
    lockSuccesses.add(1);
  } else if (res.status === 409 || (res.body && res.body.includes('SLOT_TAKEN'))) {
    lockSlotTaken.add(1); // esto es lo CORRECTO para 49 de los 50 intentos
  } else if (res.status === 429) {
    // Rate limit de la propia API (25 req/min/IP) — en un test real multi-IP
    // no debería dispararse tanto; si lo hace masivamente, usa k6 Cloud o
    // varias IPs de salida para que el rate-limit no enmascare la prueba.
    lockSlotTaken.add(1);
  } else {
    lockUnexpectedErrors.add(1);
    console.error(`[race_booking] Respuesta inesperada: status=${res.status} body=${res.body}`);
  }
}

export function handleSummary(data) {
  const successes = data.metrics.race_lock_successes ? data.metrics.race_lock_successes.values.count : 0;
  const taken = data.metrics.race_lock_slot_taken_409 ? data.metrics.race_lock_slot_taken_409.values.count : 0;
  const unexpected = data.metrics.race_lock_unexpected_errors ? data.metrics.race_lock_unexpected_errors.values.count : 0;

  console.log('\n================ RESULTADO DE LA CARRERA DE DOBLE-RESERVA ================');
  console.log(`Éxitos (deben ser EXACTAMENTE 1): ${successes}`);
  console.log(`Rechazos correctos (slot ya tomado): ${taken}`);
  console.log(`Errores inesperados (bug real si es > 0): ${unexpected}`);
  console.log(successes === 1 ? '✅ PROTECCIÓN ANTI-DOBLE-RESERVA FUNCIONANDO CORRECTAMENTE' : '🚨 ALERTA: no hubo exactamente 1 éxito — revisar inmediatamente');
  console.log('============================================================================\n');

  return {
    stdout: '',
  };
}
