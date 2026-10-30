import http from 'k6/http';
import { check, sleep } from 'k6';

// ── 1. CONFIGURACIÓN DE CARGA Y UMBRALES (THRESHOLDS) ──
export const options = {
  stages: [
    { duration: '20s', target: 10 },  // Calentamiento: subir a 10 usuarios
    { duration: '40s', target: 50 },  // Carga sostenida: 50 usuarios concurrentes
    { duration: '30s', target: 100 }, // Pico de tráfico: 100 usuarios concurrentes
    { duration: '20s', target: 0 },   // Rampa de bajada
  ],
  thresholds: {
    // Menos del 2% de peticiones pueden fallar
    http_req_failed: ['rate<0.02'],
    // El 95% de las peticiones deben responder en menos de 800ms
    http_req_duration: ['p(95)<800'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'https://cancheros.site';
const SUPABASE_URL = __ENV.NEXT_PUBLIC_SUPABASE_URL || 'https://rxykieyrzaqnfasouwke.supabase.co';
const SUPABASE_ANON_KEY = __ENV.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ4eWtpZXlyemFxbmZhc291d2tlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcyNzM3MTUsImV4cCI6MjEwMjg0OTcxNX0.Y3lCThAI9ajyX9JlrBMh3av3Z-euXquxqBZyOl7jklc';

// ── 2. SETUP: OBTIENE TOKEN JWT DINÁMICAMENTE ANTES DE LA PRUEBA ──
export function setup() {
  const email = __ENV.EMAIL || 'goldeorocoll@gmail.com';
  const password = __ENV.PASSWORD || 'Miael2017m..';

  const loginRes = http.post(
    `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
    JSON.stringify({ email, password }),
    {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
      },
    }
  );

  const token = loginRes.json('access_token');
  if (!token) {
    console.error('No se pudo obtener el token de autenticación en setup');
  }

  return { token: token || '' };
}

// ── 3. FLUJO DE PRUEBA DE USUARIO SIMULADO (VIRTUAL USERS) ──
export default function (data) {
  const authHeaders = {
    'Accept': 'application/json',
    ...(data.token ? { 'Authorization': `Bearer ${data.token}` } : {}),
  };

  const publicHeaders = {
    'Accept': 'application/json',
  };

  // 1. Búsqueda de canchas (pública, verifica caché)
  const searchRes = http.get(`${BASE_URL}/api/search-companies?q=cancha`, { headers: publicHeaders });
  check(searchRes, {
    'Search 200 OK': (r) => r.status === 200,
  });

  // 2. Disponibilidad de horarios para una cancha específica
  const bookingCheckRes = http.get(
    `${BASE_URL}/api/bookings?pitch_id=1331eec2-0a72-4dbf-9780-d0814de4270e&date=2026-11-01`,
    { headers: publicHeaders }
  );
  check(bookingCheckRes, {
    'Disponibilidad 200 OK': (r) => r.status === 200,
  });

  // 3. Listar Escuelas de fútbol
  const schoolsRes = http.get(`${BASE_URL}/api/schools`, { headers: publicHeaders });
  check(schoolsRes, {
    'Escuelas 200 OK': (r) => r.status === 200,
  });

  // 4. Listar Torneos
  const tournamentsRes = http.get(`${BASE_URL}/api/tournaments`, { headers: publicHeaders });
  check(tournamentsRes, {
    'Torneos 200 OK': (r) => r.status === 200,
  });

  // 5. Mis Reservas (Autenticado con Bearer Token)
  const myBookingsRes = http.get(`${BASE_URL}/api/bookings`, { headers: authHeaders });
  check(myBookingsRes, {
    'Mis Reservas 200 OK': (r) => r.status === 200,
  });

  // 6. Mis Favoritos (Autenticado con Bearer Token)
  const myFavoritesRes = http.get(`${BASE_URL}/api/favorites`, { headers: authHeaders });
  check(myFavoritesRes, {
    'Mis Favoritos 200 OK': (r) => r.status === 200,
  });

  // Pequeña pausa realista entre acciones de usuario (1 a 2 segundos)
  sleep(1);
}
