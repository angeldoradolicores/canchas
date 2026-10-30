#!/usr/bin/env node
/**
 * scripts/test-apis.mjs — Test Virtual Integral para todas las APIs de Cancheros
 * ─────────────────────────────────────────────────────────────────────────────
 * Ejecuta pruebas automatizadas contra todos los endpoints (públicos y protegidos).
 * Soporta autenticación mediante:
 *   1. Token JWT directo: --token <JWT> o variable de entorno AUTH_TOKEN
 *   2. Login automático:   --email <correo> --password <clave>
 *   3. Modo auditoría:     Si no hay token, prueba endpoints públicos y verifica que los
 *                          endpoints privados rechacen adecuadamente peticiones sin autorización (401).
 *
 * Uso:
 *   node --env-file=.env.local scripts/test-apis.mjs
 *   node --env-file=.env.local scripts/test-apis.mjs --token eyJhbGciOi...
 *   node --env-file=.env.local scripts/test-apis.mjs --email tu@correo.com --password tuClave
 *   node --env-file=.env.local scripts/test-apis.mjs --url https://tudominio.com
 */

const args = process.argv.slice(2);

function getArg(flag, fallback = '') {
  const index = args.indexOf(flag);
  if (index !== -1 && args[index + 1]) {
    return args[index + 1];
  }
  return fallback;
}

const BASE_URL = (getArg('--url') || process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
let AUTH_TOKEN = getArg('--token') || process.env.AUTH_TOKEN || '';
const LOGIN_EMAIL = getArg('--email') || process.env.LOGIN_EMAIL || '';
const LOGIN_PASSWORD = getArg('--password') || process.env.LOGIN_PASSWORD || '';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// Colores ANSI para terminal
const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
};

const results = [];

/**
 * Intenta iniciar sesión con Supabase Auth directamente para obtener el JWT token
 */
async function tryAutoLogin(email, password) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.log(`${c.yellow}⚠️  No se encontró NEXT_PUBLIC_SUPABASE_URL o ANON_KEY para auto-login.${c.reset}`);
    return null;
  }
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    });

    const data = await res.json();
    if (res.ok && data.access_token) {
      console.log(`${c.green}✅ Autenticación exitosa con Supabase Auth como:${c.reset} ${c.bold}${data.user?.email || email}${c.reset}`);
      return data.access_token;
    } else {
      console.log(`${c.red}❌ Error en login automático:${c.reset}`, data.error_description || data.msg || JSON.stringify(data));
      return null;
    }
  } catch (err) {
    console.log(`${c.red}❌ Error de conexión con Supabase Auth:${c.reset}`, err.message);
    return null;
  }
}

/**
 * Ejecuta una petición HTTP midiendo latencia y validando el código de respuesta
 */
async function runTest({ name, method = 'GET', endpoint, headers = {}, body = null, expectedStatus = [200], requiresAuth = false }) {
  const url = `${BASE_URL}${endpoint}`;
  const reqHeaders = {
    'Accept': 'application/json',
    ...headers,
  };

  if (requiresAuth && AUTH_TOKEN) {
    reqHeaders['Authorization'] = `Bearer ${AUTH_TOKEN}`;
  }

  if (body && typeof body === 'object' && !(body instanceof FormData)) {
    reqHeaders['Content-Type'] = 'application/json';
  }

  const start = performance.now();
  let status = 0;
  let responseData = null;
  let ok = false;
  let errorMsg = '';
  let headersReceived = {};

  try {
    const res = await fetch(url, {
      method,
      headers: reqHeaders,
      body: body ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
    });

    const duration = Math.round(performance.now() - start);
    status = res.status;
    
    // Capturar headers relevantes
    headersReceived = {
      cache: res.headers.get('cache-control') || res.headers.get('x-cache') || '-',
      rateLimitRemaining: res.headers.get('x-ratelimit-remaining') || '-',
    };

    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      responseData = await res.json().catch(() => null);
    } else {
      responseData = (await res.text().catch(() => '')).slice(0, 100);
    }

    const expected = Array.isArray(expectedStatus) ? expectedStatus : [expectedStatus];
    ok = expected.includes(status);

    const result = {
      name,
      method,
      endpoint,
      status,
      expected: expected.join(','),
      duration,
      ok,
      requiresAuth,
      usedToken: Boolean(requiresAuth && AUTH_TOKEN),
      headersReceived,
      snippet: responseData ? (typeof responseData === 'object' ? JSON.stringify(responseData).slice(0, 80) : String(responseData)) : '',
    };

    results.push(result);
    printTestResult(result);
  } catch (err) {
    const duration = Math.round(performance.now() - start);
    errorMsg = err.message;
    if (err.cause?.code === 'ECONNREFUSED' || err.message.includes('fetch failed')) {
      errorMsg = `Conexión rechazada en ${BASE_URL} — ¿El servidor está encendido? (npm run dev)`;
    }

    const result = {
      name,
      method,
      endpoint,
      status: 'ERR',
      expected: Array.isArray(expectedStatus) ? expectedStatus.join(',') : expectedStatus,
      duration,
      ok: false,
      requiresAuth,
      usedToken: Boolean(requiresAuth && AUTH_TOKEN),
      errorMsg,
    };
    results.push(result);
    printTestResult(result);
  }
}

function printTestResult(r) {
  const icon = r.ok ? `${c.green}✔ PASS${c.reset}` : `${c.red}✖ FAIL${c.reset}`;
  const methodBadge = `${c.cyan}${r.method.padEnd(4)}${c.reset}`;
  const statusBadge = r.ok ? `${c.green}${r.status}${c.reset}` : `${c.red}${r.status}${c.reset}`;
  const timeBadge = r.duration < 150 ? `${c.green}${r.duration}ms${c.reset}` : r.duration < 500 ? `${c.yellow}${r.duration}ms${c.reset}` : `${c.red}${r.duration}ms${c.reset}`;
  const authBadge = r.requiresAuth ? (r.usedToken ? `${c.magenta}[Bearer Token]${c.reset}` : `${c.dim}[Sin Token]${c.reset}`) : `${c.dim}[Público]${c.reset}`;

  console.log(` ${icon}  ${methodBadge} ${r.endpoint.padEnd(38)} ${statusBadge} (exp: ${r.expected}) in ${timeBadge} ${authBadge}`);
  if (r.errorMsg) {
    console.log(`     ${c.red}└─ Error: ${r.errorMsg}${c.reset}`);
  } else if (!r.ok && r.snippet) {
    console.log(`     ${c.yellow}└─ Respuesta: ${r.snippet}...${c.reset}`);
  }
}

async function main() {
  console.log(`\n${c.bold}${c.magenta}╔══════════════════════════════════════════════════════════════════╗${c.reset}`);
  console.log(`${c.bold}${c.magenta}║         CANCHEROS — SUITE DE PRUEBAS VIRTUALES DE APIS           ║${c.reset}`);
  console.log(`${c.bold}${c.magenta}╚══════════════════════════════════════════════════════════════════╝${c.reset}\n`);

  console.log(`${c.bold}Destino:${c.reset} ${c.cyan}${BASE_URL}${c.reset}`);

  // Intentar login si se pasó credenciales
  if (!AUTH_TOKEN && LOGIN_EMAIL && LOGIN_PASSWORD) {
    console.log(`${c.cyan}Autenticando con credenciales suministradas...${c.reset}`);
    AUTH_TOKEN = await tryAutoLogin(LOGIN_EMAIL, LOGIN_PASSWORD) || '';
  }

  if (AUTH_TOKEN) {
    console.log(`${c.green}✔ Token activo detectado:${c.reset} ${AUTH_TOKEN.slice(0, 16)}...${AUTH_TOKEN.slice(-10)}`);
  } else {
    console.log(`${c.yellow}ℹ No se suministró token de usuario.${c.reset}`);
    console.log(`${c.dim}  Las rutas protegidas se probarán para verificar que el servidor las bloquee correctamente (401).${c.reset}`);
    console.log(`${c.dim}  Para probar con usuario autenticado: npm run test:apis -- --token <TU_JWT_TOKEN>${c.reset}\n`);
  }

  console.log(`\n${c.bold}=== 1. APIS PÚBLICAS Y DE BÚSQUEDA ===${c.reset}`);
  
  // 1. Búsqueda de empresas/canchas
  await runTest({
    name: 'Búsqueda de canchas',
    method: 'GET',
    endpoint: '/api/search-companies?q=cancha',
    expectedStatus: 200,
  });

  // 1b. Búsqueda con caché (segunda llamada para comprobar respuesta ultra-rápida)
  await runTest({
    name: 'Búsqueda de canchas (Caché Hit)',
    method: 'GET',
    endpoint: '/api/search-companies?q=cancha',
    expectedStatus: 200,
  });

  // 2. Escuelas de formación deportiva
  await runTest({
    name: 'Listar escuelas deportivas',
    method: 'GET',
    endpoint: '/api/schools',
    expectedStatus: 200,
  });

  // 3. Torneos
  await runTest({
    name: 'Listar torneos disponibles',
    method: 'GET',
    endpoint: '/api/tournaments',
    expectedStatus: 200,
  });

  // 4. Consulta de disponibilidad pública de horarios
  await runTest({
    name: 'Disponibilidad de canchas por fecha',
    method: 'GET',
    endpoint: '/api/bookings?pitch_id=1331eec2-0a72-4dbf-9780-d0814de4270e&date=2026-11-01',
    expectedStatus: 200,
  });

  // 5. Favoritos (sin token retorna lista vacía de forma segura)
  await runTest({
    name: 'Favoritos en modo anónimo',
    method: 'GET',
    endpoint: '/api/favorites',
    expectedStatus: 200,
  });

  console.log(`\n${c.bold}=== 2. VERIFICACIÓN DE SEGURIDAD (RECHAZO 401 A NO AUTORIZADOS) ===${c.reset}`);
  
  // Endpoints que DEBEN rechazar peticiones si no hay token
  await runTest({
    name: 'Debug Dashboard sin token (debe rechazar/404)',
    method: 'GET',
    endpoint: '/api/debug-dashboard',
    expectedStatus: [401, 404],
    requiresAuth: false,
  });

  await runTest({
    name: 'Acciones de Comunidad sin token (debe rechazar)',
    method: 'POST',
    endpoint: '/api/community-actions',
    body: { action: 'delete_challenge', payload: { id: 'fake-id' } },
    expectedStatus: 401,
    requiresAuth: false,
  });

  await runTest({
    name: 'Acciones de Administrador sin token (debe rechazar)',
    method: 'POST',
    endpoint: '/api/admin-actions',
    body: { action: 'ensure_company' },
    expectedStatus: 401,
    requiresAuth: false,
  });

  await runTest({
    name: 'Aprobación masiva sin token (debe rechazar)',
    method: 'POST',
    endpoint: '/api/bookings/batch-action',
    body: { action: 'approve', booking_ids: ['fake-id'] },
    expectedStatus: 401,
    requiresAuth: false,
  });

  await runTest({
    name: 'Eliminación de cuenta sin token (debe rechazar)',
    method: 'POST',
    endpoint: '/api/delete-account',
    body: { reason: 'test' },
    expectedStatus: 401,
    requiresAuth: false,
  });

  console.log(`\n${c.bold}=== 3. APIS CON AUTENTICACIÓN (BEARER TOKEN) ===${c.reset}`);

  if (AUTH_TOKEN) {
    // 1. Mis Reservas
    await runTest({
      name: 'Mis Reservas (usuario autenticado)',
      method: 'GET',
      endpoint: '/api/bookings',
      expectedStatus: 200,
      requiresAuth: true,
    });

    // 2. Mis Favoritos
    await runTest({
      name: 'Mis Favoritos (usuario autenticado)',
      method: 'GET',
      endpoint: '/api/favorites',
      expectedStatus: 200,
      requiresAuth: true,
    });

    // 3. Debug Dashboard
    await runTest({
      name: 'Debug Dashboard del usuario',
      method: 'GET',
      endpoint: '/api/debug-dashboard',
      expectedStatus: [200, 404], // 404 si está en NODE_ENV=production
      requiresAuth: true,
    });

    // 4. Admin action: ensure_company
    await runTest({
      name: 'Admin: ensure_company',
      method: 'POST',
      endpoint: '/api/admin-actions',
      body: { action: 'ensure_company' },
      expectedStatus: [200, 403],
      requiresAuth: true,
    });

    // 5. Community action: validación de esquema
    await runTest({
      name: 'Comunidad: validación estricta de payload',
      method: 'POST',
      endpoint: '/api/community-actions',
      body: { action: 'delete_challenge', payload: {} },
      expectedStatus: 400, // Debe rechazar por validación Zod
      requiresAuth: true,
    });

    // 6. Generador de estado WhatsApp
    await runTest({
      name: 'Generador de flyer de estados WhatsApp',
      method: 'POST',
      endpoint: '/api/generate-status',
      body: {
        company_name: 'Complejo Deportivo Prueba',
        date: '2026-11-01',
        available_slots: ['18:00', '19:00', '20:00'],
      },
      expectedStatus: [200, 400],
      requiresAuth: true,
    });
  } else {
    console.log(`${c.yellow}⚠️  Pruebas de usuario autenticado omitidas (ejecuta con --token <JWT> para probarlas).${c.reset}`);
  }

  // Resumen final
  console.log(`\n${c.bold}${c.magenta}╔══════════════════════════════════════════════════════════════════╗${c.reset}`);
  console.log(`${c.bold}${c.magenta}║                      REPORTE DE RESULTADOS                       ║${c.reset}`);
  console.log(`${c.bold}${c.magenta}╚══════════════════════════════════════════════════════════════════╝${c.reset}\n`);

  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  const total = results.length;
  const avgLatency = Math.round(results.reduce((acc, r) => acc + (typeof r.duration === 'number' ? r.duration : 0), 0) / (total || 1));

  console.log(`Total Pruebas: ${c.bold}${total}${c.reset}`);
  console.log(`Exitosas:      ${c.green}${c.bold}${passed}${c.reset}`);
  console.log(`Fallidas:      ${failed > 0 ? c.red : c.green}${c.bold}${failed}${c.reset}`);
  console.log(`Latencia prom: ${c.cyan}${c.bold}${avgLatency}ms${c.reset}\n`);

  if (failed === 0 && total > 0) {
    console.log(`${c.green}${c.bold}🎉 ¡TODAS LAS APIS FUNCIONARON CORRECTAMENTE!${c.reset}\n`);
  } else if (failed > 0) {
    console.log(`${c.red}${c.bold}⚠️  Se detectaron ${failed} endpoints con fallas o el servidor no respondió.${c.reset}\n`);
  }
}

main().catch((err) => {
  console.error('Error fatal al ejecutar pruebas:', err);
  process.exit(1);
});
