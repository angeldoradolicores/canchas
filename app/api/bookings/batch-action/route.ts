import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@supabase/supabase-js';
import { notifyBookingStatusChange } from '@/lib/whatsapp-notifications';

export const dynamic = 'force-dynamic';

// Service-role client — never exposed to the browser
const supabase = createServerClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    // 1. Authenticate caller via Authorization header (Bearer <access_token>)
    const authHeader = req.headers.get('authorization') || '';
    const token = authHeader.replace('Bearer ', '').trim();
    if (!token) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    // Validate the JWT and get caller's user_id
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) {
      return NextResponse.json({ error: 'Token inválido' }, { status: 401 });
    }

    const body = await req.json();
    const { ids, action } = body as { ids: string[]; action: 'confirm' | 'cancel' };

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'Se requieren IDs de reserva' }, { status: 400 });
    }
    if (action !== 'confirm' && action !== 'cancel') {
      return NextResponse.json({ error: 'Acción inválida' }, { status: 400 });
    }

    // 2. Find the company owned by this user
    const { data: company } = await supabase
      .from('companies')
      .select('id')
      .eq('owner_id', user.id)
      .maybeSingle();

    if (!company) {
      return NextResponse.json({ error: 'No tienes una empresa registrada' }, { status: 403 });
    }

    // 3. Validate ALL requested booking IDs belong to this owner's company pitches
    //    and are in 'pending' state (prevent double-approve / approve-cancelled)
    const expectedStatus = action === 'confirm' ? 'pending' : undefined; // cancel can act on pending OR confirmed

    const { data: bookings, error: bookingsErr } = await supabase
      .from('bookings')
      .select('id, status, pitch_id, pitches!inner(company_id)')
      .in('id', ids);

    if (bookingsErr || !bookings) {
      return NextResponse.json({ error: 'Error al verificar reservas' }, { status: 500 });
    }

    // All bookings must belong to this owner's company
    const unauthorized = bookings.filter(
      (b: any) => b.pitches?.company_id !== company.id
    );
    if (unauthorized.length > 0) {
      return NextResponse.json({ error: 'Acceso denegado a una o más reservas' }, { status: 403 });
    }

    // For confirm: only act on pending bookings (prevent double-confirm)
    const validIds = expectedStatus
      ? bookings.filter((b: any) => b.status === expectedStatus).map((b: any) => b.id)
      : bookings.map((b: any) => b.id);

    if (validIds.length === 0) {
      return NextResponse.json({ skipped: true, message: 'No hay reservas en estado válido para esta acción' });
    }

    // 4. Perform atomic update only on valid IDs
    const newStatus = action === 'confirm' ? 'confirmed' : 'cancelled';
    const updatePayload: Record<string, any> = {
      status: newStatus,
      reviewed_at: new Date().toISOString(),
      reviewed_by: user.id,
      payment_status: action === 'confirm' ? 'verified' : 'rejected',
    };

    const { error: updateErr } = await supabase
      .from('bookings')
      .update(updatePayload)
      .in('id', validIds);

    if (updateErr) {
      console.error('[batch-action] update error:', updateErr);
      return NextResponse.json({ error: 'Error al actualizar reservas' }, { status: 500 });
    }

    // 5. Insert notifications in DB for each affected booking's user
    const { data: updatedBookings } = await supabase
      .from('bookings')
      .select('id, user_id, start_time, customer_name')
      .in('id', validIds);

    if (updatedBookings && updatedBookings.length > 0) {
      const notifs = updatedBookings
        .filter((b: any) => b.user_id)
        .map((b: any) => {
          const st = new Date(b.start_time);
          const timeStr = st.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Bogota' });
          const dateStr = st.toLocaleDateString('es-CO', { day: 'numeric', month: 'short', timeZone: 'America/Bogota' });
          const isApproved = newStatus === 'confirmed';
          return {
            user_id: b.user_id,
            sender_id: user.id,
            title: isApproved ? '🎉 ¡Reserva Confirmada!' : '⚠️ Reserva Cancelada',
            message: isApproved
              ? `Tu reserva para el ${dateStr} a las ${timeStr} fue confirmada. ¡A jugar!`
              : `Tu reserva para el ${dateStr} a las ${timeStr} fue cancelada por el establecimiento.`,
            type: 'booking_status',
            is_read: false,
          };
        });

      if (notifs.length > 0) {
        await supabase.from('notifications').insert(notifs);
      }

      // 6. Trigger WhatsApp notification immediately
      const firstId = validIds[0];
      try {
        await notifyBookingStatusChange(firstId, newStatus);
      } catch (e) {
        console.error('[batch-action] notify-status error:', e);
      }
    }

    return NextResponse.json({ success: true, updated: validIds.length, skipped: ids.length - validIds.length });
  } catch (err: any) {
    console.error('[batch-action] unexpected error:', err);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
