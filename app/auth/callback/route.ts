import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { createClient as createAdminClient, type EmailOtpType } from '@supabase/supabase-js';

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const searchParams = requestUrl.searchParams;
  const code = searchParams.get('code');
  const token_hash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;
  const next = searchParams.get('next') ?? '/';
  const roleParam = searchParams.get('role');
  const companyNameParam = searchParams.get('company_name');
  const errorParam = searchParams.get('error_description') || searchParams.get('error');

  // Determinar el origen real preservando el host exacto del usuario (funciona en localhost y Vercel)
  const forwardedHost = request.headers.get('x-forwarded-host');
  const forwardedProto = request.headers.get('x-forwarded-proto') || 'https';
  const origin = forwardedHost ? `${forwardedProto}://${forwardedHost}` : requestUrl.origin;

  if (errorParam) {
    console.error('Auth callback error from provider:', errorParam);
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(errorParam)}`);
  }

  const cookieStore = await cookies();
  const pendingRoleCookie = cookieStore.get('sb_pending_role')?.value;
  const pendingNextCookie = cookieStore.get('sb_pending_next')?.value;
  const pendingCompanyCookie = cookieStore.get('sb_pending_company')?.value;

  const cookiesToSetOnResponse: { name: string; value: string; options: any }[] = [];

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            try {
              cookieStore.set(name, value, options);
            } catch {}
            cookiesToSetOnResponse.push({ name, value, options });
          });
        },
      },
    }
  );

  let authSuccess = false;
  // Capturamos el usuario directamente de la MISMA llamada que ya autentica,
  // para no hacer una llamada extra a getUser() después (round-trip de menos
  // en cada login, no solo en el primero).
  let authedUser: any = null;

  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      authSuccess = true;
      authedUser = data?.user || data?.session?.user || null;
    } else {
      console.error('exchangeCodeForSession error:', error.message);
    }
  } else if (token_hash && type) {
    const { data, error } = await supabase.auth.verifyOtp({ type, token_hash });
    if (!error) {
      authSuccess = true;
      authedUser = data?.user || data?.session?.user || null;
    } else {
      console.error('verifyOtp error:', error.message);
    }
  } else {
    // Si no vino code ni token_hash, verificar si ya hay una sesión activa en cookies
    const { data: { user: verified } } = await supabase.auth.getUser();
    const session = verified ? { user: verified } : null;
    if (session) {
      authSuccess = true;
      authedUser = session.user || null;
    }
  }

  if (!authSuccess) {
    if (type === 'recovery' || next === '/reset-password') {
      return NextResponse.redirect(`${origin}/reset-password?error=expired`);
    }
    return NextResponse.redirect(`${origin}/login?error=auth_failed`);
  }

  // ── Si es un flujo de recuperación de contraseña, ir directo a /reset-password ──
  const isRecovery = type === 'recovery' || next === '/reset-password' || searchParams.get('type') === 'recovery';
  if (isRecovery) {
    const response = NextResponse.redirect(`${origin}/reset-password`);
    // Inyectar todas las cookies de sesión en la respuesta para que el usuario llegue autenticado a /reset-password
    cookiesToSetOnResponse.forEach(({ name, value, options }) => {
      response.cookies.set(name, value, options);
    });
    // Limpiar cookies temporales
    response.cookies.delete('sb_pending_role');
    response.cookies.delete('sb_pending_next');
    response.cookies.delete('sb_pending_company');
    return response;
  }

  // Usar el usuario ya obtenido en el paso de autenticación. Solo si por alguna
  // razón no vino incluido (defensivo), se hace la llamada extra a getUser().
  let user = authedUser;
  if (!user) {
    const { data } = await supabase.auth.getUser();
    user = data.user;
  }
  if (!user) {
    return NextResponse.redirect(`${origin}/login?error=user_not_found`);
  }

  // La intención de registro nunca concede privilegios.
  const requestedOwner = roleParam === 'owner' || pendingRoleCookie === 'owner';
  const destination = requestedOwner ? '/owner-request' : '/';
  const response = NextResponse.redirect(`${origin}${destination}`);

  // Inyectar todas las cookies de sesión en la respuesta saliente
  cookiesToSetOnResponse.forEach(({ name, value, options }) => {
    response.cookies.set(name, value, options);
  });

  // Limpiar cookies temporales de registro
  response.cookies.delete('sb_pending_role');
  response.cookies.delete('sb_pending_next');
  response.cookies.delete('sb_pending_company');

  return response;
}

