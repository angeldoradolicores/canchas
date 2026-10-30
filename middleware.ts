/**
 * middleware.ts — Edge Middleware de Cancheros
 * ──────────────────────────────────────────────────────────────
 * Se ejecuta en el Edge (antes de las funciones serverless).
 * Agrega:
 *  1. Rate limiting por IP para rutas API críticas
 *  2. Headers de seguridad adicionales
 *  3. Bloqueo de bots maliciosos obvios
 * ──────────────────────────────────────────────────────────────
 */
import { NextRequest, NextResponse } from 'next/server';

// Almacén de rate limit en memoria del Edge (por instancia)
// Nota: En el Edge runtime de Vercel esto es por región/instancia
const EDGE_STORE = new Map<string, { count: number; resetAt: number }>();

// Configuración de límites por ruta (peticiones / ventana)
const ROUTE_LIMITS: Array<{
  pattern: RegExp;
  limit: number;
  windowMs: number;
  label: string;
}> = [
  // Crear reserva: máximo 10 por minuto por IP (anti-spam)
  { pattern: /^\/api\/bookings$/, limit: 10, windowMs: 60_000, label: 'bookings_post' },
  // Búsqueda: máximo 80 por minuto por IP
  { pattern: /^\/api\/search-companies/, limit: 80, windowMs: 60_000, label: 'search' },
  // Upload de comprobante: máximo 5 por minuto por IP
  { pattern: /^\/api\/upload/, limit: 5, windowMs: 60_000, label: 'upload' },
  // Admin actions: máximo 30 por minuto por IP
  { pattern: /^\/api\/admin-actions/, limit: 30, windowMs: 60_000, label: 'admin' },
  // Cualquier otra API: máximo 120 por minuto
  { pattern: /^\/api\//, limit: 120, windowMs: 60_000, label: 'api_general' },
];

// User agents de bots que bloquear (scrapers maliciosos, no Googlebot)
const BLOCKED_UA_PATTERNS = [
  /python-requests/i,
  /curl\/[0-9]/i,       // curl directo en producción (excepto tests propios)
  /scrapy/i,
  /zgrab/i,
  /masscan/i,
  /nikto/i,
  /sqlmap/i,
  /nmap/i,
];

function getIp(req: NextRequest): string {
  return (
    req.headers.get('cf-connecting-ip') ||
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    req.headers.get('x-real-ip') ||
    '127.0.0.1'
  );
}

function checkEdgeRateLimit(
  ip: string,
  routeLabel: string,
  limit: number,
  windowMs: number
): { allowed: boolean; remaining: number; retryAfter: number } {
  const key  = `${routeLabel}:${ip}`;
  const now  = Date.now();
  let entry  = EDGE_STORE.get(key);

  // Limpiar entradas viejas cada 1000 requests aprox.
  if (EDGE_STORE.size > 5000) {
    for (const [k, v] of EDGE_STORE) {
      if (v.resetAt < now) EDGE_STORE.delete(k);
    }
  }

  if (!entry || entry.resetAt < now) {
    entry = { count: 1, resetAt: now + windowMs };
    EDGE_STORE.set(key, entry);
    return { allowed: true, remaining: limit - 1, retryAfter: 0 };
  }

  entry.count++;
  if (entry.count > limit) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
    return { allowed: false, remaining: 0, retryAfter };
  }

  return { allowed: true, remaining: limit - entry.count, retryAfter: 0 };
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const method = req.method;
  const ip = getIp(req);
  const ua = req.headers.get('user-agent') || '';

  // ── 1. Bloqueo de bots maliciosos (solo en APIs) ──────────────────────────
  if (pathname.startsWith('/api/')) {
    for (const pattern of BLOCKED_UA_PATTERNS) {
      if (pattern.test(ua)) {
        return NextResponse.json(
          { error: 'Acceso denegado' },
          { status: 403 }
        );
      }
    }
  }

  // ── 2. Rate limiting en Edge ──────────────────────────────────────────────
  // Solo aplicar rate limiting en POST/PUT/PATCH/DELETE y rutas GET sensibles
  const isMutating = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);
  const isSensitiveGet = /^\/(api\/(search|bookings|upload))/.test(pathname);

  if (isMutating || isSensitiveGet) {
    for (const routeConfig of ROUTE_LIMITS) {
      if (routeConfig.pattern.test(pathname)) {
        const result = checkEdgeRateLimit(
          ip,
          routeConfig.label,
          routeConfig.limit,
          routeConfig.windowMs
        );

        if (!result.allowed) {
          return NextResponse.json(
            {
              error: 'Demasiadas solicitudes. Por favor espera un momento.',
              retryAfter: result.retryAfter,
            },
            {
              status: 429,
              headers: {
                'Retry-After':          result.retryAfter.toString(),
                'X-RateLimit-Limit':    routeConfig.limit.toString(),
                'X-RateLimit-Remaining': '0',
                'Content-Type':         'application/json',
              },
            }
          );
        }

        // Agregar headers informativos de rate limit a la respuesta
        const res = NextResponse.next();
        res.headers.set('X-RateLimit-Limit',     routeConfig.limit.toString());
        res.headers.set('X-RateLimit-Remaining', result.remaining.toString());
        return res;
      }
    }
  }

  return NextResponse.next();
}

// Solo aplicar middleware a rutas API (no a assets estáticos)
export const config = {
  matcher: [
    '/api/:path*',
  ],
};
