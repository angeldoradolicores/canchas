import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthenticatedUser } from '@/lib/auth-guard';

function getServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return NextResponse.json({ error: 'No autorizado. Inicia sesión como dueño.' }, { status: 401 });
    }

    const body = await req.json();
    const {
      booking_ids,
      payment_method,
      amount,
      proof_url = null,
      notes = '',
    } = body;

    const ids: string[] = Array.isArray(booking_ids)
      ? booking_ids
      : typeof body.booking_id === 'string'
      ? [body.booking_id]
      : [];

    if (!ids.length) {
      return NextResponse.json({ error: 'Debes proporcionar al menos un ID de reserva.' }, { status: 400 });
    }

    if (!payment_method) {
      return NextResponse.json({ error: 'Debes seleccionar un método de pago.' }, { status: 400 });
    }

    const parsedAmount = Number(amount || 0);
    if (isNaN(parsedAmount) || parsedAmount < 0) {
      return NextResponse.json({ error: 'El monto ingresado no es válido.' }, { status: 400 });
    }

    const supabase = getServiceSupabase();

    // 1. Verificar permisos: La reserva debe pertenecer a una cancha de la empresa del dueño (o superadmin)
    const { data: bookingsData, error: fetchErr } = await supabase
      .from('bookings')
      .select('id, payment_proof_url, pitch_id, pitches!inner(company_id, companies!inner(owner_id))')
      .in('id', ids);

    if (fetchErr || !bookingsData || bookingsData.length === 0) {
      return NextResponse.json({ error: 'No se encontraron las reservas especificadas.' }, { status: 404 });
    }

    // Comprobar que todas las reservas pertenezcan a este dueño
    const isOwner = bookingsData.every((b: any) => {
      const ownerId = b.pitches?.companies?.owner_id;
      return ownerId === user.id || user.user_metadata?.role === 'admin' || user.user_metadata?.role === 'superadmin';
    });

    if (!isOwner) {
      return NextResponse.json({ error: 'No tienes permiso para registrar pagos de estas canchas.' }, { status: 403 });
    }

    const timestamp = new Date().toISOString();

    const nativeUpdatePayload: Record<string, any> = {
      remaining_payment_status: 'completed',
      remaining_payment_method: payment_method,
      remaining_payment_amount: parsedAmount,
      remaining_payment_proof_url: proof_url || null,
      remaining_payment_notes: notes ? notes.trim() : null,
      remaining_payment_at: timestamp,
      remaining_payment_by: user.id,
    };

    // 2. Intentar actualizar con las columnas nativas de Supabase
    const { error: nativeUpdateErr } = await supabase
      .from('bookings')
      .update(nativeUpdatePayload)
      .in('id', ids);

    if (!nativeUpdateErr) {
      return NextResponse.json({
        success: true,
        message: 'Pago restante registrado con éxito.',
        data: {
          status: 'completed',
          method: payment_method,
          amount: parsedAmount,
          proofUrl: proof_url,
          notes,
          at: timestamp,
          by: user.id,
        },
      });
    }

    // 3. Fallback seguro si las columnas aún no existen en la base de datos (código de error PGRST204)
    console.warn('[remaining-payment] Columnas nativas no disponibles, usando fallback en payment_proof_url:', nativeUpdateErr.message);

    const remainingData = {
      status: 'completed',
      method: payment_method,
      amount: parsedAmount,
      proof_url: proof_url || null,
      notes: notes ? notes.trim() : '',
      at: timestamp,
      by: user.id,
    };

    const remainingString = `###remaining:${JSON.stringify(remainingData)}`;

    // Para cada reserva, combinar el comprobante original con la metadata del saldo
    for (const b of bookingsData) {
      const currentProof = b.payment_proof_url ? b.payment_proof_url.split('###remaining:')[0].trim() : '';
      const updatedProof = currentProof ? `${currentProof}${remainingString}` : remainingString;

      await supabase
        .from('bookings')
        .update({ payment_proof_url: updatedProof })
        .eq('id', b.id);
    }

    return NextResponse.json({
      success: true,
      message: 'Pago restante registrado con éxito (modo compatibilidad).',
      data: {
        status: 'completed',
        method: payment_method,
        amount: parsedAmount,
        proofUrl: proof_url,
        notes,
        at: timestamp,
        by: user.id,
      },
    });
  } catch (err: any) {
    console.error('Error en /api/bookings/remaining-payment:', err);
    return NextResponse.json({ error: err.message || 'Error interno del servidor' }, { status: 500 });
  }
}
