import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { checkRateLimit, createRateLimitErrorResponse } from '@/lib/rate-limit';
import { getAuthenticatedUser } from '@/lib/auth-guard';
import {
  BookingCancelDraftSchema,
  BookingLockSchema,
  BookingCreateSchema,
} from '@/lib/validations/api-schemas';

function getAdminSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, key);
}

export async function POST(req: NextRequest) {
  // ── 1. RATE LIMITING: Máximo 25 peticiones por minuto por IP ──
  const rateLimit = checkRateLimit(req, {
    limit: 25,
    windowSeconds: 60,
    keyPrefix: 'api:bookings',
  });

  if (!rateLimit.success) {
    return createRateLimitErrorResponse(rateLimit);
  }

  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Cuerpo de la petición inválido' }, { status: 400 });
    }

    const { action, payload } = body;
    const supabase = getAdminSupabase();
    const authedUser = await getAuthenticatedUser(req);
    const verifiedUserId = authedUser?.id || null;

    // ── 2. ACCIÓN: CANCEL_DRAFT ──
    if (action === 'cancel_draft') {
      const parseResult = BookingCancelDraftSchema.safeParse(payload || {});
      if (!parseResult.success) {
        return NextResponse.json(
          { error: 'Datos de cancelación inválidos', details: parseResult.error.flatten() },
          { status: 400 }
        );
      }

      const { pitch_id, selected_date, selected_times, booking_ids } = parseResult.data;

      let query = supabase.from('bookings').delete().eq('status', 'draft');

      if (Array.isArray(booking_ids) && booking_ids.length > 0) {
        query = query.in('id', booking_ids);
      } else if (pitch_id && selected_date && Array.isArray(selected_times) && selected_times.length > 0) {
        const startTimes = selected_times.map((s: string) => `${selected_date}T${s}:00-05:00`);
        query = query.eq('pitch_id', pitch_id).in('start_time', startTimes);
      } else if (verifiedUserId) {
        query = query.eq('user_id', verifiedUserId);
      } else {
        return NextResponse.json({ error: 'Faltan parámetros para cancelar borrador' }, { status: 400 });
      }

      // Si el usuario está autenticado, asegurar que no pueda cancelar borradores de otros
      if (verifiedUserId) {
        query = query.or(`user_id.eq.${verifiedUserId},user_id.is.null`);
      }

      const { error } = await query;
      if (error) {
        console.error('[cancel_draft error]', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ success: true, message: 'Reserva temporal cancelada' });
    }

    // ── 3. ACCIÓN: LOCK_BOOKING ──
    if (action === 'lock_booking') {
      const parseResult = BookingLockSchema.safeParse(payload || {});
      if (!parseResult.success) {
        return NextResponse.json(
          {
            error: parseResult.error.issues[0]?.message || 'Datos de bloqueo inválidos',
            details: parseResult.error.flatten(),
          },
          { status: 400 }
        );
      }

      const { pitch_id, selected_date, selected_times } = parseResult.data;
      const effectiveUserId = verifiedUserId || parseResult.data.user_id || null;
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString(); // 5 minutos de bloqueo

      const inserts = selected_times.map((slot: string) => {
        const hourNum = parseInt(slot.split(':')[0], 10);
        const endHourNum = (hourNum + 1) % 24;
        const endSlot = endHourNum < 10 ? `0${endHourNum}:00` : `${endHourNum}:00`;
        return {
          pitch_id,
          user_id: effectiveUserId,
          start_time: `${selected_date}T${slot}:00-05:00`,
          end_time: `${selected_date}T${endSlot}:00-05:00`,
          status: 'draft',
          expires_at: expiresAt,
        };
      });

      const now = new Date();
      const lockedBookingIds: string[] = [];

      for (const item of inserts) {
        const { data: existing } = await supabase
          .from('bookings')
          .select('id, user_id, status, expires_at')
          .eq('pitch_id', pitch_id)
          .eq('start_time', item.start_time)
          .maybeSingle();

        if (existing) {
          if (existing.status === 'confirmed' || existing.status === 'pending') {
            return NextResponse.json({ error: 'Esta hora ya ha sido reservada.' }, { status: 400 });
          }

          if (existing.status === 'draft') {
            const isExpired = !existing.expires_at || new Date(existing.expires_at) < now;
            const isSameUser = effectiveUserId && existing.user_id === effectiveUserId;

            if (isExpired) {
              const { data: updated, error: upErr } = await supabase
                .from('bookings')
                .update({
                  user_id: effectiveUserId,
                  customer_name: null,
                  customer_phone: null,
                  status: 'draft',
                  payment_status: null,
                  payment_proof_url: null,
                  source: null,
                  expires_at: expiresAt,
                  end_time: item.end_time,
                })
                .eq('id', existing.id)
                .select()
                .single();

              if (updated && !upErr) {
                lockedBookingIds.push(updated.id);
                continue;
              } else {
                await supabase.from('bookings').delete().eq('id', existing.id);
              }
            } else if (isSameUser) {
              const { data: updated } = await supabase
                .from('bookings')
                .update({ expires_at: expiresAt })
                .eq('id', existing.id)
                .select()
                .single();
              if (updated) lockedBookingIds.push(updated.id);
              continue;
            } else {
              const secsLeft = Math.max(0, Math.floor((new Date(existing.expires_at).getTime() - now.getTime()) / 1000));
              return NextResponse.json({
                error: 'Alguien más está reservando esta hora en este momento.',
                secondsLeft: secsLeft,
                expires_at: existing.expires_at,
              }, { status: 400 });
            }
          }

          if (existing.status === 'cancelled') {
            const { data: updated, error: upErr } = await supabase
              .from('bookings')
              .update({
                user_id: effectiveUserId,
                customer_name: null,
                customer_phone: null,
                status: 'draft',
                payment_status: null,
                payment_proof_url: null,
                source: null,
                expires_at: expiresAt,
                end_time: item.end_time,
              })
              .eq('id', existing.id)
              .select()
              .single();

            if (updated && !upErr) {
              lockedBookingIds.push(updated.id);
              continue;
            } else {
              await supabase.from('bookings').delete().eq('id', existing.id);
            }
          }
        }

        // Insertar nuevo borrador
        const { data: inserted, error: insErr } = await supabase
          .from('bookings')
          .insert(item)
          .select()
          .single();

        if (insErr) {
          console.error('[lock_booking insert error]', insErr);
          return NextResponse.json({ error: 'No se pudo bloquear la hora: ' + insErr.message }, { status: 500 });
        }
        if (inserted) lockedBookingIds.push(inserted.id);
      }

      return NextResponse.json({
        success: true,
        data: {
          pitch_id,
          selected_date,
          selected_times,
          expires_at: expiresAt,
          booking_ids: lockedBookingIds,
        }
      });
    }

    // ── 4. ACCIÓN: CREATE_BOOKING ──
    if (action === 'create_booking') {
      const parseResult = BookingCreateSchema.safeParse(payload || {});
      if (!parseResult.success) {
        return NextResponse.json(
          {
            error: parseResult.error.issues[0]?.message || 'Datos de reserva incompletos o inválidos',
            details: parseResult.error.flatten(),
          },
          { status: 400 }
        );
      }

      const {
        pitch_id,
        customer_name,
        customer_phone,
        selected_date,
        selected_times,
        file_name,
        file_base64,
        total_price,
        deposit_amount,
      } = parseResult.data;

      const effectiveUserId = verifiedUserId || parseResult.data.user_id || null;
      let validPitchId = pitch_id;


      let paymentProofUrl: string | null = null;

      // Subida segura del comprobante con validación de tipo y tamaño
      if (file_base64) {
        try {
          const match = file_base64.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/);
          let buffer: Buffer;
          let contentType = 'image/jpeg';

          if (match) {
            contentType = match[1];
            buffer = Buffer.from(match[2], 'base64');
          } else {
            buffer = Buffer.from(file_base64, 'base64');
          }

          // Límite de seguridad: 5MB exactos en buffer
          if (buffer.length > 5 * 1024 * 1024) {
            return NextResponse.json({ error: 'El comprobante supera el tamaño máximo de 5MB' }, { status: 400 });
          }

          const safeExt = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg';
          const filePath = `receipts/${effectiveUserId || 'guest'}_${Date.now()}.${safeExt}`;

          const { error: uploadErr } = await supabase.storage
            .from('payment-proofs')
            .upload(filePath, buffer, { contentType, upsert: true });

          if (!uploadErr) {
            const { data: publicUrlData } = supabase.storage.from('payment-proofs').getPublicUrl(filePath);
            paymentProofUrl = publicUrlData?.publicUrl || null;
          } else {
            console.error('[payment-proof upload error]', uploadErr);
          }
        } catch (err) {
          console.error('[payment-proof processing error]', err);
        }
      }

      const sortedTimes = [...selected_times].sort();
      const newExpiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

      const updatedBookings = [];
      for (const slot of sortedTimes) {
        const startTimeIso = `${selected_date}T${slot}:00-05:00`;

        const updatePayload: any = {
          customer_name: customer_name.trim(),
          customer_phone: customer_phone || '',
          status: 'pending',
          payment_status: 'submitted',
          payment_proof_url: paymentProofUrl,
          expires_at: newExpiresAt,
          ...(total_price !== undefined && total_price !== null ? { total_price: Number(total_price) / sortedTimes.length } : {}),
          ...(deposit_amount !== undefined && deposit_amount !== null ? { deposit_amount: Number(deposit_amount) / sortedTimes.length } : {}),
        };
        if (effectiveUserId) updatePayload.user_id = effectiveUserId;

        let query = supabase
          .from('bookings')
          .update(updatePayload)
          .eq('pitch_id', validPitchId)
          .eq('start_time', startTimeIso)
          .eq('status', 'draft');

        if (effectiveUserId) {
          query = query.or(`user_id.eq.${effectiveUserId},user_id.is.null`);
        }

        const { data, error } = await query.select().maybeSingle();

        if (error || !data) {
          console.error('Error actualizando draft a pending:', error);
          return NextResponse.json(
            { error: 'La reserva temporal expiró o no se encontró. Por favor selecciona las horas nuevamente.' },
            { status: 400 }
          );
        }
        updatedBookings.push(data);
      }

      return NextResponse.json({ success: true, data: updatedBookings });
    }

    return NextResponse.json({ error: 'Acción no válida' }, { status: 400 });
  } catch (err: any) {
    console.error('Error en /api/bookings:', err);
    return NextResponse.json({ error: err.message || 'Error de servidor' }, { status: 500 });
  }
}
