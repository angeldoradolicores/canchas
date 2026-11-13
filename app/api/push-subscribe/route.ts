import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthenticatedUser } from '@/lib/auth-guard';

export async function POST(request: NextRequest) {
  try {
    // Autenticación obligatoria: la suscripción se asocia SIEMPRE al usuario del token,
    // nunca a un userId arbitrario del body (evita secuestrar las notificaciones de otro).
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const { subscription } = await request.json().catch(() => ({}));
    if (
      !subscription ||
      typeof subscription !== 'object' ||
      typeof subscription.endpoint !== 'string' ||
      !/^https:\/\//.test(subscription.endpoint)
    ) {
      return NextResponse.json({ error: 'Suscripción inválida' }, { status: 400 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );

    const { error } = await supabase
      .from('push_subscriptions')
      .upsert(
        {
          user_id: user.id,
          subscription: JSON.stringify(subscription),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' },
      );

    if (error) {
      console.error('[push-subscribe] DB error:', error);
      return NextResponse.json({ error: 'No se pudo guardar la suscripción' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Error al registrar la suscripción' }, { status: 500 });
  }
}
