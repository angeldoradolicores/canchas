import { NextRequest, NextResponse } from 'next/server';

interface RateLimitRecord {
  timestamps: number[];
}

// Almacén en memoria de ventanas de tiempo por clave
const rateLimitStore = new Map<string, RateLimitRecord>();

// Limpieza periódica de registros viejos para evitar consumo excesivo de memoria
const CLEANUP_INTERVAL_MS = 60 * 1000;
let lastCleanup = Date.now();

function purgeExpiredRecords(now: number, maxAgeMs: number = 300 * 1000) {
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;

  for (const [key, record] of rateLimitStore.entries()) {
    record.timestamps = record.timestamps.filter((ts) => now - ts < maxAgeMs);
    if (record.timestamps.length === 0) {
      rateLimitStore.delete(key);
    }
  }
}

/**
 * Obtiene la IP del cliente a partir de los headers de la solicitud
 */
export function getClientIp(req: NextRequest): string {
  const forwardedFor = req.headers.get('x-forwarded-for');
  if (forwardedFor) {
    const ips = forwardedFor.split(',');
    return ips[0].trim();
  }
  const realIp = req.headers.get('x-real-ip');
  if (realIp) return realIp.trim();
  const cfIp = req.headers.get('cf-connecting-ip');
  if (cfIp) return cfIp.trim();
  return '127.0.0.1';
}

export interface RateLimitOptions {
  /** Número máximo de solicitudes permitidas en la ventana */
  limit: number;
  /** Ventana de tiempo en segundos */
  windowSeconds: number;
  /** Prefijo para agrupar por ruta o acción (ej. "bookings", "uploads") */
  keyPrefix?: string;
  /** Identificador personalizado alternativo a la IP (ej. ID de usuario) */
  identifier?: string;
}

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  resetTime: number; // Segundos hasta que se restablezca la ventana
  retryAfter: number; // Segundos que debe esperar el cliente
}

/**
 * Comprueba si la solicitud excede el límite de velocidad especificado.
 */
export function checkRateLimit(
  req: NextRequest,
  options: RateLimitOptions
): RateLimitResult {
  const now = Date.now();
  const windowMs = options.windowSeconds * 1000;
  
  purgeExpiredRecords(now, windowMs * 2);

  const ip = getClientIp(req);
  const id = options.identifier || ip;
  const prefix = options.keyPrefix ? `${options.keyPrefix}:` : '';
  const key = `${prefix}${id}`;

  let record = rateLimitStore.get(key);
  if (!record) {
    record = { timestamps: [] };
    rateLimitStore.set(key, record);
  }

  // Filtrar las marcas de tiempo que aún están dentro de la ventana
  const windowStart = now - windowMs;
  record.timestamps = record.timestamps.filter((ts) => ts > windowStart);

  if (record.timestamps.length >= options.limit) {
    const oldestTimestamp = record.timestamps[0];
    const retryAfterMs = oldestTimestamp + windowMs - now;
    const retryAfter = Math.max(1, Math.ceil(retryAfterMs / 1000));

    return {
      success: false,
      limit: options.limit,
      remaining: 0,
      resetTime: retryAfter,
      retryAfter,
    };
  }

  // Registrar la nueva petición
  record.timestamps.push(now);
  const remaining = options.limit - record.timestamps.length;
  const oldest = record.timestamps[0];
  const resetTime = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));

  return {
    success: true,
    limit: options.limit,
    remaining,
    resetTime,
    retryAfter: 0,
  };
}

/**
 * Genera una respuesta 429 Too Many Requests con los headers estándar
 */
export function createRateLimitErrorResponse(result: RateLimitResult): NextResponse {
  return NextResponse.json(
    {
      error: 'Has realizado demasiadas solicitudes en poco tiempo. Por favor espera un momento antes de reintentar.',
      retryAfter: result.retryAfter,
    },
    {
      status: 429,
      headers: {
        'X-RateLimit-Limit': result.limit.toString(),
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': result.resetTime.toString(),
        'Retry-After': result.retryAfter.toString(),
      },
    }
  );
}
