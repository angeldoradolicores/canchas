import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const role = searchParams.get('role');
  const next = searchParams.get('next');

  let origin = new URL(request.url).origin;
  
  // Usar variable de entorno si existe (para producción en Vercel)
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    origin = process.env.NEXT_PUBLIC_SITE_URL;
  } else if (process.env.VERCEL_URL) {
    origin = `https://${process.env.VERCEL_URL}`;
  }
  
  // Remover barra final por si acaso
  if (origin.endsWith('/')) {
    origin = origin.slice(0, -1);
  }

  if (code) {
    const supabase = await createClient();
    try {
      const { data, error } = await supabase.auth.exchangeCodeForSession(code);

      if (!error && data?.user) {
        const user = data.user;
        
        try {
          // Consultar o crear perfil
          const { data: profile } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .maybeSingle();

          const userRole = role === 'owner' ? 'owner' : (profile?.role || user.user_metadata?.role || 'player');

          if (!profile) {
            await supabase.from('profiles').insert({
              id: user.id,
              full_name: user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0] || 'Usuario',
              role: userRole,
            });
          } else if (role === 'owner' && profile.role !== 'owner') {
            await supabase.from('profiles').update({ role: 'owner' }).eq('id', user.id);
          }

          // Si es dueño, asegurar que tenga empresa registrada
          if (userRole === 'owner') {
            const { data: companies } = await supabase
              .from('companies')
              .select('id')
              .eq('owner_id', user.id)
              .limit(1);

            if (!companies || companies.length === 0) {
              const compName = user.user_metadata?.full_name || user.user_metadata?.name || 'Mi Complejo Deportivo';
              await supabase.from('companies').insert({
                owner_id: user.id,
                name: compName,
                address: 'Pasto, Nariño',
                zone: 'Norte',
                whatsapp_status: 'disconnected',
              });
            }
          }
          
          if (userRole === 'owner' && (!next || next === '/')) {
            return NextResponse.redirect(`${origin}/dashboard`);
          } else if (userRole === 'superadmin' && (!next || next === '/')) {
            return NextResponse.redirect(`${origin}/admin`);
          }

        } catch (dbError) {
          console.error("Error updating profile in callback:", dbError);
          // Si falla la BD, al menos el usuario ya inició sesión. Seguimos.
        }

        // Redirigir siempre, ya sea al next o al home
        const nextUrl = (next && next.startsWith('/')) ? next : '/';
        return NextResponse.redirect(`${origin}${nextUrl}`);
      }
    } catch (authError) {
      console.error("Error exchanging code:", authError);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
