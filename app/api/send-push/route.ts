import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, title, message, url } = body;

    if (!userId) {
      return NextResponse.json({ error: 'userId requerido' }, { status: 400 });
    }

    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
    );

    // Obtener suscripciones activas del usuario
    const { data: subs, error } = await supabase
      .from('push_subscriptions')
      .select('id, subscription')
      .eq('user_id', userId);

    if (error || !subs || subs.length === 0) {
      return NextResponse.json({ sent: 0, reason: 'Sin suscripciones push activas para este usuario' });
    }

    // Intentar importar web-push si está disponible en el entorno
    let webpush: any = null;
    try {
      webpush = require('web-push');
    } catch {
      // web-push no está instalado todavía, retornar graceful response
      return NextResponse.json({
        sent: 0,
        warning: 'Módulo web-push no instalado en node_modules. El sistema usa Web Audio y Realtime en vivo.',
      });
    }

    const vapidPublic = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    const vapidPrivate = process.env.VAPID_PRIVATE_KEY;
    const vapidEmail = process.env.VAPID_EMAIL || 'admin@cancheros.com';

    if (!vapidPublic || !vapidPrivate) {
      return NextResponse.json({
        sent: 0,
        warning: 'Claves VAPID no configuradas en variables de entorno.',
      });
    }

    webpush.setVapidDetails(`mailto:${vapidEmail}`, vapidPublic, vapidPrivate);

    const payload = JSON.stringify({
      title: title || '⚽ Cancheros: Reserva por aprobar',
      body: message || 'Un cliente subió su comprobante de pago y espera tu confirmación.',
      icon: '/icon-192x192.png',
      badge: '/icon-96x96.png',
      url: url || '/dashboard/bookings',
      vibrate: [350, 150, 350, 150, 500],
      tag: 'booking-pending-alert',
    });

    let sent = 0;
    for (const s of subs) {
      try {
        const parsed = typeof s.subscription === 'string' ? JSON.parse(s.subscription) : s.subscription;
        await webpush.sendNotification(parsed, payload);
        sent++;
      } catch (err: any) {
        if (err.statusCode === 410 || err.statusCode === 404) {
          // Suscripción inválida o expirada en el servicio push del móvil
          await supabase.from('push_subscriptions').delete().eq('id', s.id);
        }
      }
    }

    return NextResponse.json({ success: true, sent });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error al enviar push' }, { status: 500 });
  }
}

