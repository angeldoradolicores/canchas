import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { checkRateLimit, createRateLimitErrorResponse } from '@/lib/rate-limit';

export async function proxy(request: NextRequest) {
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

  let supabaseResponse = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  // ── 2. CABECERAS DE SEGURIDAD OWASP ──
  supabaseResponse.headers.set('X-Content-Type-Options', 'nosniff');
  supabaseResponse.headers.set('X-Frame-Options', 'SAMEORIGIN');
  supabaseResponse.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  supabaseResponse.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(self)');

  // ── 3. REFRESCO DE SESIÓN SUPABASE Y PROTECCIÓN DE RUTAS PRIVADAS ──
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
            supabaseResponse = NextResponse.next({
              request,
            });
            cookiesToSet.forEach(({ name, value, options }) =>
              supabaseResponse.cookies.set(name, value, options)
            );
          },
        },
      }
    );

    const { data: { user } } = await supabase.auth.getUser();

    // ── 4. PROTECCIÓN ESTRICTA DEL PANEL DEL DUEÑO (/dashboard) ──
    if (pathname.startsWith('/dashboard')) {
      if (!user) {
        const loginUrl = new URL('/login', request.url);
        loginUrl.searchParams.set('next', pathname);
        return NextResponse.redirect(loginUrl);
      }
    }
  } catch {
    // Si falla la conexión o no hay credenciales válidas en /dashboard, redirigir al login
    if (pathname.startsWith('/dashboard')) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('next', pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
