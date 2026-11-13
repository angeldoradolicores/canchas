import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthenticatedUser, verifyPitchOwnership, isPlatformAdmin } from '@/lib/auth-guard';
import { notifyBookingStatusChange } from '@/lib/whatsapp-notifications';
import { safeServerErrorResponse } from '@/lib/error-handler';

export async function POST(req: NextRequest) {
  try {
    // Solo el dueño de la cancha (o un admin de plataforma) puede disparar la
    // notificación de WhatsApp, y solo si coincide con el estado real de la reserva.
    // Antes, con un bookingId cualquiera se enviaban tickets falsos desde el WhatsApp del complejo.
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    const bookingId = body?.bookingId;
    const status = body?.status;
    if (typeof bookingId !== 'string' || (status !== 'confirmed' && status !== 'cancelled')) {
      return NextResponse.json({ error: 'Parámetros inválidos' }, { status: 400 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );

    const { data: booking } = await supabase
      .from('bookings')
      .select('pitch_id, status')
      .eq('id', bookingId)
      .maybeSingle();

    if (!booking) {
      return NextResponse.json({ error: 'Reserva no encontrada' }, { status: 404 });
    }

    if (!isPlatformAdmin(user) && !(await verifyPitchOwnership(user.id, booking.pitch_id))) {
      return NextResponse.json({ error: 'No tienes permiso sobre esta reserva' }, { status: 403 });
    }

    // El estado notificado debe coincidir con el estado persistido (no inventar confirmaciones)
    if (booking.status !== status) {
      return NextResponse.json(
        { error: 'El estado no coincide con el de la reserva' },
        { status: 409 },
      );
    }

    await notifyBookingStatusChange(bookingId, status);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json(
      safeServerErrorResponse(err, 'Error interno al notificar el estado.'),
      { status: 500 },
    );
  }
}
