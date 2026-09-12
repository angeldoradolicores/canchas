import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { checkRateLimit, createRateLimitErrorResponse } from '@/lib/rate-limit';

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // ── 1. PROTECCIÓN GLOBAL DE RATE LIMITING PARA RUTAS /api/* ──
  if (pathname.startsWith('/api/')) {
    const globalLimit = checkRateLimit(request, {
      limit: 120, // Máximo 120 peticiones/minuto por IP a nivel global de API
      windowSeconds: 60,
      keyPrefix: 'global:api',
    });

    if (!globalLimit.success) {
      return createRateLimitErrorResponse(globalLimit);
    }
  }

  let supabaseResponse = NextResponse.next({ request });

  // ── 2. CABECERAS DE SEGURIDAD OWASP ──
  supabaseResponse.headers.set('X-Content-Type-Options', 'nosniff');
  supabaseResponse.headers.set('X-Frame-Options', 'SAMEORIGIN');
  supabaseResponse.headers.set('X-XSS-Protection', '1; mode=block');
  supabaseResponse.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  supabaseResponse.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

  // ── 3. REFRESCO DE SESIÓN SUPABASE ──
  try {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value }) =>
              request.cookies.set(name, value)
            );
            supabaseResponse = NextResponse.next({ request });
            cookiesToSet.forEach(({ name, value, options }) =>
              supabaseResponse.cookies.set(name, value, options)
            );
          },
        },
      }
    );

    await supabase.auth.getUser();
  } catch {
    // Si falla la conexión con Supabase en middleware, no bloquear la navegación pública
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
