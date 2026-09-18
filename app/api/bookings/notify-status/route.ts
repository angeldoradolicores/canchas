import { NextRequest, NextResponse } from 'next/server';
import { notifyBookingStatusChange } from '@/lib/whatsapp-notifications';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || !body.bookingId || !body.status) {
      return NextResponse.json({ error: 'Faltan parámetros bookingId y status' }, { status: 400 });
    }

    const { bookingId, status } = body;
    if (status !== 'confirmed' && status !== 'cancelled') {
      return NextResponse.json({ error: 'Status inválido' }, { status: 400 });
    }

    await notifyBookingStatusChange(bookingId, status);

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('Error en /api/bookings/notify-status:', err);
    return NextResponse.json({ error: err.message || 'Error interno' }, { status: 500 });
  }
}
