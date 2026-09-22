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

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      authSuccess = true;
    } else {
      console.error('exchangeCodeForSession error:', error.message);
    }
  } else if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });
    if (!error) {
      authSuccess = true;
    } else {
      console.error('verifyOtp error:', error.message);
    }
  } else {
    // Si no vino code ni token_hash, verificar si ya hay una sesión activa en cookies
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      authSuccess = true;
    }
  }

  if (!authSuccess) {
    return NextResponse.redirect(`${origin}/login?error=auth_failed`);
  }

  // Obtener usuario autenticado
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(`${origin}/login?error=user_not_found`);
  }

  // Determinar rol solicitado (de query params, cookies o user_metadata)
  const targetRole = roleParam || pendingRoleCookie || user.user_metadata?.role || 'player';
  const isOwner = targetRole === 'owner';
  const companyName = companyNameParam || pendingCompanyCookie || user.user_metadata?.full_name || 'Mi Complejo Deportivo';

  // Usar cliente de servicio para garantizar actualización sin bloqueos de RLS
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const adminSupabase = createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey);

  try {
    if (isOwner) {
      // 1. Asegurar o actualizar perfil como 'owner'
      const { data: existingProfile } = await adminSupabase
        .from('profiles')
        .select('id, full_name, role')
        .eq('id', user.id)
        .maybeSingle();

      const finalName = existingProfile?.full_name || companyName || user.email?.split('@')[0] || 'Dueño';

      if (!existingProfile) {
        await adminSupabase.from('profiles').insert({
          id: user.id,
          full_name: finalName,
          role: 'owner',
        });
      } else if (existingProfile.role !== 'owner') {
        await adminSupabase.from('profiles').update({
          role: 'owner',
          ...(finalName ? { full_name: finalName } : {}),
        }).eq('id', user.id);
      }

      // 2. Asegurar empresa / complejo deportivo en 'companies'
      const { data: existingComp } = await adminSupabase
        .from('companies')
        .select('id')
        .eq('owner_id', user.id)
        .limit(1);

      if (!existingComp || existingComp.length === 0) {
        await adminSupabase.from('companies').insert({
          owner_id: user.id,
          name: companyName.trim() || 'Mi Complejo Deportivo',
          address: 'Pasto, Nariño',
          zone: 'Norte',
          whatsapp_status: 'disconnected',
        });
      }

      // 3. Sincronizar metadata en auth.users si es necesario
      if (user.user_metadata?.role !== 'owner') {
        try {
          await adminSupabase.auth.admin.updateUserById(user.id, {
            user_metadata: {
              ...user.user_metadata,
              role: 'owner',
            },
          });
        } catch (mErr) {
          console.warn('No se pudo actualizar metadata en auth:', mErr);
        }
      }
    } else {
      // Asegurar perfil básico de jugador si no existe
      const { data: existingProfile } = await adminSupabase
        .from('profiles')
        .select('id')
        .eq('id', user.id)
        .maybeSingle();

      if (!existingProfile) {
        await adminSupabase.from('profiles').insert({
          id: user.id,
          full_name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'Jugador',
          role: 'player',
        });
      }
    }
  } catch (dbErr) {
    console.error('Error sincronizando perfil en callback:', dbErr);
  }

  // Redirección final
  const destination = isOwner
    ? '/dashboard'
    : (next && next.startsWith('/') && next !== '/dashboard' ? next : (pendingNextCookie || '/'));

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

