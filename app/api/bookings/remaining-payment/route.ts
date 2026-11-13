import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthenticatedUser, verifyPitchOwnership, isPlatformAdmin } from '@/lib/auth-guard';
import { safeServerErrorResponse } from '@/lib/error-handler';

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
      splits = null,
      edit_payment_id = null,
    } = body;

    const ids: string[] = Array.from(
      new Set(
        (Array.isArray(booking_ids)
          ? booking_ids
          : typeof body.booking_id === 'string'
          ? [body.booking_id]
          : []
        ).filter(Boolean)
      )
    );

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

    // 1. Obtener reservas con columnas básicas seguras (nunca falla por columnas extendidas faltantes)
    const { data: bookingsData, error: fetchErr } = await supabase
      .from('bookings')
      .select('id, payment_proof_url, pitch_id')
      .in('id', ids);

    if (fetchErr) {
      console.error('[remaining-payment] Error al buscar reservas:', fetchErr);
      return NextResponse.json({ error: 'Error al consultar las reservas en la base de datos.' }, { status: 500 });
    }

    if (!bookingsData || bookingsData.length === 0) {
      console.warn('[remaining-payment] No se encontraron reservas para IDs:', ids);
      return NextResponse.json({ error: 'No se encontraron las reservas especificadas.' }, { status: 404 });
    }

    // 2. Verificar permisos sobre las canchas correspondientes
    const pitchIds = Array.from(new Set(bookingsData.map((b: any) => b.pitch_id).filter(Boolean)));
    const isSuperAdmin = isPlatformAdmin(user);

    if (!isSuperAdmin) {
      for (const pId of pitchIds) {
        const isOwner = await verifyPitchOwnership(user.id, pId);
        if (!isOwner) {
          return NextResponse.json({ error: 'No tienes permiso para registrar pagos en estas canchas.' }, { status: 403 });
        }
      }
    }

    const timestamp = new Date().toISOString();
    const paymentId = `pay_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    // 3. Construir la entrada de pago para el historial
    const newEntry: any = {
      id: edit_payment_id || paymentId,
      amount: parsedAmount,
      method: payment_method,
      proofUrl: proof_url || null,
      notes: notes ? notes.trim() : '',
      at: timestamp,
      by: user.id,
    };
    if (splits) newEntry.splits = splits;

    // 4. Intentar leer payment_history y remaining_payment_amount si las columnas ya existen
    const existingHistories: Record<string, any[]> = {};
    const existingAmounts: Record<string, number> = {};
    let supportsHistoryColumn = false;

    try {
      const { data: histData, error: histErr } = await supabase
        .from('bookings')
        .select('id, payment_history, remaining_payment_amount')
        .in('id', ids);

      if (!histErr && histData) {
        supportsHistoryColumn = true;
        for (const row of histData) {
          let h = row.payment_history;
          if (typeof h === 'string') {
            try { h = JSON.parse(h); } catch { h = []; }
          }
          existingHistories[row.id] = Array.isArray(h) ? h : [];
          existingAmounts[row.id] = Number(row.remaining_payment_amount || 0);
        }
      }
    } catch {
      supportsHistoryColumn = false;
    }

    // 5. Para cada reserva, procesar el historial y guardar con triple fallback
    let supportsNativeRemaining = true;

    for (const b of bookingsData) {
      let existingHistory: any[] = existingHistories[b.id] ? [...existingHistories[b.id]] : [];

      // Si no había en la columna nativa, intentar parsear del payment_proof_url fallback
      if (existingHistory.length === 0 && b.payment_proof_url?.includes('###remaining:')) {
        try {
          const rawRem = b.payment_proof_url.split('###remaining:')[1];
          const parsed = JSON.parse(rawRem);
          if (parsed && typeof parsed === 'object') {
            if (Array.isArray(parsed.history)) {
              existingHistory = parsed.history;
            } else if (parsed.amount) {
              existingHistory = [{
                id: `legacy_${b.id}`,
                amount: Number(parsed.amount),
                method: parsed.method || 'cash',
                proofUrl: parsed.proof_url || null,
                notes: parsed.notes || '',
                at: parsed.at || timestamp,
                by: parsed.by,
              }];
            }
          }
        } catch { /* ignorar */ }
      }

      if (edit_payment_id) {
        const existingIdx = existingHistory.findIndex((e: any) => e.id === edit_payment_id);
        if (existingIdx >= 0) {
          const old = existingHistory[existingIdx];
          newEntry.editedAt = timestamp;
          newEntry.editedBy = user.id;
          newEntry.previousAmount = old.amount;
          newEntry.previousMethod = old.method;
          newEntry.previousNotes = old.notes || '';
          newEntry.at = old.at; // Mantener fecha de registro original
          existingHistory[existingIdx] = newEntry;
        } else {
          existingHistory.push(newEntry);
        }
      } else {
        existingHistory.push(newEntry);
      }

      const totalPaid = existingHistory.reduce((sum: number, e: any) => sum + Number(e.amount || 0), 0);

      // Fallback 1: Si soporta la columna payment_history
      if (supportsHistoryColumn) {
        const updatePayload: Record<string, any> = {
          payment_history: existingHistory,
          remaining_payment_status: 'completed',
          remaining_payment_method: payment_method,
          remaining_payment_amount: totalPaid,
          remaining_payment_proof_url: proof_url || null,
          remaining_payment_notes: notes ? notes.trim() : null,
          remaining_payment_at: timestamp,
          remaining_payment_by: user.id,
          ...(splits ? { remaining_payment_splits: splits } : {}),
        };

        const { error: updateErr } = await supabase
          .from('bookings')
          .update(updatePayload)
          .eq('id', b.id);

        if (!updateErr) continue;
        supportsHistoryColumn = false;
      }

      // Fallback 2: Columnas nativas estándar de saldo restante
      if (supportsNativeRemaining) {
        const nativePayload: Record<string, any> = {
          remaining_payment_status: 'completed',
          remaining_payment_method: payment_method,
          remaining_payment_amount: totalPaid,
          remaining_payment_proof_url: proof_url || null,
          remaining_payment_notes: notes ? notes.trim() : null,
          remaining_payment_at: timestamp,
          remaining_payment_by: user.id,
          ...(splits ? { remaining_payment_splits: splits } : {}),
        };

        const { error: nativeErr } = await supabase
          .from('bookings')
          .update(nativePayload)
          .eq('id', b.id);

        if (!nativeErr) continue;
        supportsNativeRemaining = false;
      }

      // Fallback 3: Fallback infalible en payment_proof_url con historial JSON embebido
      const currentProof = b.payment_proof_url ? b.payment_proof_url.split('###remaining:')[0].trim() : '';
      const fallbackMeta = {
        status: 'completed',
        method: payment_method,
        amount: totalPaid,
        proof_url: proof_url || null,
        notes: notes ? notes.trim() : '',
        at: timestamp,
        by: user.id,
        splits,
        history: existingHistory,
      };
      const remainingString = `###remaining:${JSON.stringify(fallbackMeta)}`;
      const updatedProof = currentProof ? `${currentProof}${remainingString}` : remainingString;

      await supabase
        .from('bookings')
        .update({ payment_proof_url: updatedProof })
        .eq('id', b.id);
    }

    return NextResponse.json({
      success: true,
      message: edit_payment_id ? 'Pago editado con éxito.' : 'Abono registrado con éxito.',
      data: {
        ...newEntry,
        status: 'completed',
      },
    });
  } catch (err: any) {
    return NextResponse.json(safeServerErrorResponse(err, 'Error interno al registrar el pago restante.'), { status: 500 });
  }
}
