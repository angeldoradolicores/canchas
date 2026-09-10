import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getAdminSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, key);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { action, payload } = body;
    const supabase = getAdminSupabase();

    if (action === 'cancel_draft') {
      const { pitch_id, selected_date, selected_times, user_id, booking_ids } = payload || {};
      
      let query = supabase.from('bookings').delete().eq('status', 'draft');
      
      if (Array.isArray(booking_ids) && booking_ids.length > 0) {
        query = query.in('id', booking_ids);
      } else if (pitch_id && selected_date && Array.isArray(selected_times) && selected_times.length > 0) {
        const startTimes = selected_times.map((s: string) => `${selected_date}T${s}:00-05:00`);
        query = query.eq('pitch_id', pitch_id).in('start_time', startTimes);
      } else if (user_id) {
        query = query.eq('user_id', user_id);
      } else {
        return NextResponse.json({ error: 'Faltan parámetros para cancelar borrador' }, { status: 400 });
      }

      const { error } = await query;
      if (error) {
        console.error('[cancel_draft error]', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ success: true, message: 'Reserva temporal cancelada' });
    }

    if (action === 'lock_booking') {
      const { pitch_id, user_id, selected_date, selected_times } = payload || {};
      if (!pitch_id || !selected_date || !Array.isArray(selected_times) || selected_times.length === 0) {
        return NextResponse.json({ error: 'Faltan datos para el bloqueo' }, { status: 400 });
      }

      const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString(); // 5 minutos de bloqueo

      const inserts = selected_times.map((slot: string) => {
        const hourNum = parseInt(slot.split(':')[0], 10);
        const endHourNum = (hourNum + 1) % 24;
        const endSlot = endHourNum < 10 ? `0${endHourNum}:00` : `${endHourNum}:00`;
        return {
          pitch_id,
          user_id: user_id || null,
          start_time: `${selected_date}T${slot}:00-05:00`,
          end_time: `${selected_date}T${endSlot}:00-05:00`,
          status: 'draft', // Estado de bloqueo temporal
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
            const isSameUser = user_id && existing.user_id === user_id;

            if (isExpired) {
              // Reutilizar borrador expirado actualizándolo (evita constraint 23505)
              const { data: updated, error: upErr } = await supabase
                .from('bookings')
                .update({
                  user_id: user_id || null,
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
              // Renovar tiempo de expiración para el mismo usuario
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
            // Reutilizar la fila cancelada actualizándola a draft (evita constraint 23505)
            const { data: updated, error: upErr } = await supabase
              .from('bookings')
              .update({
                user_id: user_id || null,
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

    if (action === 'create_booking') {
      const {
        pitch_id,
        user_id,
        customer_name,
        customer_phone,
        selected_date,
        selected_times,
        file_name,
        file_base64,
      } = payload || {};

      if (!pitch_id || !selected_date || !Array.isArray(selected_times) || selected_times.length === 0) {
        return NextResponse.json({ error: 'Faltan datos requeridos para la reserva' }, { status: 400 });
      }

      let validPitchId = pitch_id;
      const isUuid = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(pitch_id);
      if (!isUuid) {
        // Mock ID logic fallback (mantener igual por si acaso)
        const { data: realPitches } = await supabase.from('pitches').select('id').limit(1);
        if (realPitches && realPitches.length > 0) validPitchId = realPitches[0].id;
      }

      let paymentProofUrl = null;

      if (file_base64) {
        try {
          const match = file_base64.match(/^data:(.+);base64,(.+)$/);
          let buffer: Buffer;
          let contentType = 'image/jpeg';
          if (match) {
            contentType = match[1];
            buffer = Buffer.from(match[2], 'base64');
          } else {
            buffer = Buffer.from(file_base64, 'base64');
          }
          const fileExt = file_name ? file_name.split('.').pop() : 'jpg';
          const filePath = `receipts/${user_id || 'guest'}_${Date.now()}.${fileExt}`;
          const { error: uploadErr } = await supabase.storage.from('payment-proofs').upload(filePath, buffer, { contentType, upsert: true });
          if (!uploadErr) {
            const { data: publicUrlData } = supabase.storage.from('payment-proofs').getPublicUrl(filePath);
            paymentProofUrl = publicUrlData?.publicUrl || null;
          }
        } catch (err) {}
      }

      const sortedTimes = [...selected_times].sort();
      const newExpiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

      const updatedBookings = [];
      for (const slot of sortedTimes) {
        const startTimeIso = `${selected_date}T${slot}:00-05:00`;
        
        // Actualizar el "draft" que creamos en lock_booking a "pending"
        const updatePayload: any = {
          customer_name: customer_name || 'Jugador',
          customer_phone: customer_phone || '',
          status: 'pending',
          payment_status: 'submitted',
          payment_proof_url: paymentProofUrl,
          expires_at: newExpiresAt,
        };
        if (user_id) updatePayload.user_id = user_id;

        let query = supabase
          .from('bookings')
          .update(updatePayload)
          .eq('pitch_id', validPitchId)
          .eq('start_time', startTimeIso)
          .eq('status', 'draft');

        if (user_id) {
          query = query.or(`user_id.eq.${user_id},user_id.is.null`);
        }

        const { data, error } = await query.select().maybeSingle();
          
        if (error || !data) {
           console.error('Error actualizando draft a pending:', error);
           return NextResponse.json({ error: 'La reserva temporal expiró o no se encontró. Por favor selecciona las horas nuevamente.' }, { status: 400 });
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
