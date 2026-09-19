import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/';

  // Determinar el origen correcto (funciona en localhost y en Vercel)
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL
    || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null);
  const origin = siteUrl || new URL(request.url).origin;

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=no_code`);
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      console.error('Auth callback error:', error.message);
      return NextResponse.redirect(`${origin}/login?error=auth_failed`);
    }

    // Sesión creada correctamente — redirigir al destino
    const redirectTo = next.startsWith('/') ? next : '/';
    return NextResponse.redirect(`${origin}${redirectTo}`);

  } catch (err) {
    console.error('Unexpected callback error:', err);
    return NextResponse.redirect(`${origin}/login?error=server_error`);
  }
}
