import { cookies } from 'next/headers';
import { randomUUID } from 'node:crypto';
import { sanitizeReceipt } from '@/lib/receipt-security';
import { NextRequest, NextResponse, after } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { checkRateLimit, createRateLimitErrorResponse, getClientIp } from '@/lib/rate-limit';
import { hashClientIp, quotaErrorMessage, verifyTurnstile, GUEST_MAX_HOURS } from '@/lib/booking-guard';
import { getAuthenticatedUser } from '@/lib/auth-guard';
import { quotaCodeOf, reportSecurityAlert } from '@/lib/security-alerts';
import {
  BookingCancelDraftSchema,
  BookingLockSchema,
  BookingCreateSchema,
} from '@/lib/validations/api-schemas';
import { notifyBookingSubmitted } from '@/lib/whatsapp-notifications';
import { fetchConflictingPitchIds } from '@/lib/combined-pitch-utils';
import { uploadToR2, isR2Configured } from '@/lib/storage/r2';
import { safeServerErrorResponse } from '@/lib/error-handler';
import { withCache, cache, TTL } from '@/lib/cache';
import { isSlotPassed, BOOKING_GRACE_MINUTES } from '@/lib/utils';
import { validateImageUpload } from '@/lib/image-upload-validator';


function getAdminSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, key);
}

/**
 * Calcula start_time y end_time en ISO con offset -05:00 de Colombia.
 * Para horas a las 23:00 (11:00 PM), el end_time cruza la medianoche al día siguiente a las 00:00.
 */
function computeSlotIsoTimes(selectedDate: string, slot: string) {
  const [hStr, mStr] = slot.split(':');
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr || '0', 10);
  const startIso = `${selectedDate}T${slot}:00-05:00`;

  let endIso: string;
  if (h === 23) {
    const [y, mon, d] = selectedDate.split('-').map(Number);
    const nextDay = new Date(Date.UTC(y, mon - 1, d + 1));
    const nextY = nextDay.getUTCFullYear();
    const nextM = String(nextDay.getUTCMonth() + 1).padStart(2, '0');
    const nextD = String(nextDay.getUTCDate()).padStart(2, '0');
    endIso = `${nextY}-${nextM}-${nextD}T00:00:00-05:00`;
  } else {
    const endHourNum = h + 1;
    const endSlot = endHourNum < 10 ? `0${endHourNum}:00` : `${endHourNum}:00`;
    endIso = `${selectedDate}T${endSlot}:00-05:00`;
  }

  return { startIso, endIso };
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const idsParam  = searchParams.get('ids');
    const pitchId   = searchParams.get('pitch_id');
    const dateParam = searchParams.get('date');
    const authedUser = await getAuthenticatedUser(req);
    const verifiedUserId = authedUser?.id || null;

    const supabase = getAdminSupabase();

    // ── Disponibilidad pública por cancha+fecha (lectura más frecuente) ──────
    // Estos datos se cachean 20s porque muchos usuarios consultan el mismo slot
    if (pitchId && dateParam && !idsParam && !verifiedUserId) {
      const cacheKey = `availability:${pitchId}:${dateParam}`;
      const cached = await withCache(cacheKey, TTL.AVAILABILITY, async () => {
        const dayStart = `${dateParam}T00:00:00-05:00`;
        const dayEnd   = `${dateParam}T23:59:59-05:00`;
        const { data, error } = await supabase
          .from('bookings')
          .select('id, pitch_id, start_time, end_time, status')
          .eq('pitch_id', pitchId)
          .gte('start_time', dayStart)
          .lte('start_time', dayEnd)
          .in('status', ['confirmed', 'pending']);
        if (error) throw error;
        return data || [];
      });
      return NextResponse.json(
        { success: true, data: cached },
        { headers: { 'Cache-Control': 'public, s-maxage=20, stale-while-revalidate=10' } }
      );
    }

    // ── Reservas personales (no se cachean nunca) ─────────────────────────
    let query = supabase
      .from('bookings')
      .select(`
        *,
        pitches (
          name,
          image_url,
          media_urls,
          tone,
          type,
          custom_pricing,
          companies (name, zone, address)
        )
      `)
      .order('start_time', { ascending: false });

    if (idsParam) {
      // ── Sanitización y validación estricta de UUIDs ──
      const rawIds = idsParam.split(',').map(s => s.trim()).filter(Boolean);
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const validIds = rawIds.filter(id => uuidRegex.test(id)).slice(0, 25);
      if (validIds.length === 0) return NextResponse.json({ success: true, data: [] });
      query = query.in('id', validIds);
      if (verifiedUserId) query = query.eq('user_id', verifiedUserId);
      else {
        const token = req.cookies.get('booking_guest')?.value;
        if (!token || !/^[0-9a-f-]{36}$/.test(token)) return NextResponse.json({ data: [] });
        query = query.is('user_id', null).eq('lock_token', token);
      }
    } else if (verifiedUserId) {
      query = query.eq('user_id', verifiedUserId);
    } else {
      return NextResponse.json({ success: true, data: [] });
    }

    const { data, error } = await query;
    if (error) {
      return NextResponse.json(safeServerErrorResponse(error, 'Error al obtener las reservas.'), { status: 500 });
    }

    return NextResponse.json({ success: true, data: (data || []).map(({ lock_token, ...row }: any) => row) });
  } catch (err: any) {
    return NextResponse.json(safeServerErrorResponse(err, 'Error de servidor al obtener las reservas.'), { status: 500 });
  }
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
    const jar = await cookies();
    let guestToken = jar.get('booking_guest')?.value;
    if (!guestToken || !/^[0-9a-f-]{36}$/.test(guestToken)) {
      guestToken = randomUUID();
      jar.set('booking_guest', guestToken, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 2592000 });
    }

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
        query = query.eq('user_id', verifiedUserId);
      }

      if (!verifiedUserId) query = query.is('user_id', null).eq('lock_token', guestToken);
      const { error } = await query;
      if (error) {
        return NextResponse.json(safeServerErrorResponse(error, 'Error al cancelar la reserva temporal.'), { status: 500 });
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

      const { pitch_id, selected_date, selected_times, turnstile_token } = parseResult.data;
      const effectiveUserId = verifiedUserId;
      const clientIpHash = hashClientIp(req);

      // Invitados: máximo de horas por reserva y CAPTCHA invisible (frena bots que intentan apartar todo).
      if (!verifiedUserId) {
        if (selected_times.length > GUEST_MAX_HOURS) {
          return NextResponse.json({
            error: `Como invitado puedes reservar hasta ${GUEST_MAX_HOURS} horas a la vez. Crea tu cuenta gratis para reservar hasta 4 horas.`,
            code: 'GUEST_LIMIT',
          }, { status: 429 });
        }
        if (!await verifyTurnstile(turnstile_token, getClientIp(req))) {
          return NextResponse.json({
            error: 'No pudimos verificar que eres una persona. Recarga la página e inténtalo de nuevo.',
            code: 'CAPTCHA',
          }, { status: 403 });
        }
      }

      // OPTIMIZACIÓN DE VELOCIDAD: estas 3 consultas son independientes entre sí
      // (ninguna necesita el resultado de otra) pero antes se esperaban una tras
      // otra. Disparándolas en paralelo, el tiempo total pasa de la suma de las 3
      // al máximo de las 3 — sin cambiar ninguna validación ni su orden.
      const [draftCountResult, conflictingPitchIds] = await Promise.all([
        effectiveUserId
          ? supabase.from('bookings').select('id', { count: 'exact', head: true })
            .eq('user_id', effectiveUserId).eq('status', 'draft').gt('expires_at', new Date().toISOString())
          : Promise.resolve({ count: null }),
        fetchConflictingPitchIds(supabase, pitch_id),
      ]);

      // Horas que ya empezaron: en línea NADIE puede reservarlas pasada la tolerancia, ni
      // siquiera el dueño en su propia cancha. Él lo hace desde su panel (reserva manual o
      // turno fijo), que va por /api/admin-actions.
      if (selected_times.some((slot: string) => isSlotPassed(selected_date, slot))) {
        return NextResponse.json(
          { error: `Esta hora ya empezó y pasó la tolerancia de ${BOOKING_GRACE_MINUTES} minutos para reservar en línea. Comunícate con el complejo.` },
          { status: 400 }
        );
      }

      // Seguridad: verificar si el usuario ya tiene el límite de horas en proceso activas
      if (effectiveUserId) {
        const draftCount = (draftCountResult as any)?.count;
        if (draftCount && (draftCount + selected_times.length > 4)) {
          return NextResponse.json(
            { error: 'Superas el límite de 4 horas en proceso simultáneas. Por favor finaliza tu reserva actual antes de apartar más horas.' },
            { status: 429 }
          );
        }
      }

      const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString(); // 5 minutos de bloqueo
      const lockedBookingIds: string[] = [];

      const inserts = selected_times.map((slot: string) => {
        const { startIso, endIso } = computeSlotIsoTimes(selected_date, slot);
        return {
          pitch_id,
          user_id: effectiveUserId,
          start_time: startIso,
          end_time: endIso,
          status: 'draft',
          expires_at: expiresAt,
          lock_token: guestToken,
          client_ip_hash: clientIpHash,
        };
      });

      // Si el límite anti-acaparamiento salta a mitad de camino, se liberan las horas ya apartadas en esta petición.
      const quotaFail = async (err: { message?: string } | null | undefined) => {
        const msg = quotaErrorMessage(err);
        if (!msg) return null;
        const code = quotaCodeOf(err);
        if (code) after(() => reportSecurityAlert(supabase, {
          code, pitchId: pitch_id, userId: effectiveUserId, ipHash: clientIpHash, deviceToken: guestToken,
        }));
        if (lockedBookingIds.length) {
          // Se marcan como vencidas (no se borran: pueden ser filas reutilizadas con historial).
          await supabase.from('bookings').update({ expires_at: new Date(Date.now() - 1000).toISOString() })
            .in('id', lockedBookingIds).eq('status', 'draft');
        }
        return NextResponse.json({ error: msg, code: 'QUOTA' }, { status: 429 });
      };

      const now = new Date();

      // Si una hora de la selección falla, se liberan las que ya se apartaron en esta misma
      // petición: antes quedaban bloqueadas 5 minutos y el mismo jugador no podía reintentar.
      const fail = async (body: Record<string, unknown>, status: number) => {
        if (lockedBookingIds.length) {
          await supabase.from('bookings').update({ expires_at: new Date(Date.now() - 1000).toISOString() })
            .in('id', lockedBookingIds).eq('status', 'draft');
        }
        return NextResponse.json(body, { status });
      };
      // ¿El bloqueo activo es de quien está pidiendo? (mismo usuario, o mismo invitado/dispositivo)
      const isMine = (b: any) => verifiedUserId
        ? b.user_id === verifiedUserId
        : !b.user_id && !!guestToken && b.lock_token === guestToken;

      for (const item of inserts) {
        const { data: conflictRows } = await supabase
          .from('bookings')
          .select('id, pitch_id, user_id, status, expires_at, lock_token')
          .in('pitch_id', conflictingPitchIds)
          .eq('start_time', item.start_time)
          .order('created_at', { ascending: false });

        // Verificar si existe conflicto en canchas combinadas o hijas vinculadas
        const linkedConflict = (conflictRows || []).find((b: any) => {
          if (b.pitch_id === pitch_id) return false;
          if (b.status === 'confirmed' || b.status === 'pending') return true;
          if (b.status === 'draft' && b.expires_at && new Date(b.expires_at) > now) return true;
          return false;
        });

        if (linkedConflict) {
          return fail({
            error: 'Esta hora no está disponible: la cancha vinculada (individual o combinada) ya está reservada o en proceso de reserva.',
          }, 400);
        }

        const existing = (conflictRows || []).find((b: any) => b.pitch_id === pitch_id) || null;

        if (existing) {
          if (existing.status === 'confirmed' || existing.status === 'pending') {
            return fail({ error: 'Esta hora ya ha sido reservada.' }, 400);
          }

          if (existing.status === 'draft') {
            const isExpired = !existing.expires_at || new Date(existing.expires_at) < now;

            // Bloqueo vigente pero es MÍO (volví atrás, recargué o falló el intento anterior):
            // se renueva en vez de hacerme esperar a que venza.
            if (!isExpired && isMine(existing)) {
              const { data: renewed, error: rnErr } = await supabase
                .from('bookings')
                .update({ expires_at: expiresAt, lock_token: guestToken, client_ip_hash: clientIpHash, end_time: item.end_time })
                .eq('id', existing.id)
                .eq('status', 'draft')
                .select('id')
                .single();
              if (renewed && !rnErr) {
                lockedBookingIds.push(renewed.id);
                continue;
              }
              const q = await quotaFail(rnErr);
              if (q) return q;
              return fail({ error: 'Horario modificado por otra solicitud' }, 409);
            }

            if (isExpired) {
              // El bloqueo anterior expiró — podemos reutilizar el registro
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
                  lock_token: guestToken,
                  client_ip_hash: clientIpHash,
                  end_time: item.end_time,
                })
                .eq('id', existing.id)
                .eq('status', existing.status)
                .or(`expires_at.is.null,expires_at.lte.${now.toISOString()}`)
                .select()
                .single();

              if (updated && !upErr) {
                lockedBookingIds.push(updated.id);
                continue;
              } else {
                const q = await quotaFail(upErr);
                if (q) return q;
                return fail({ error: 'Horario modificado por otra solicitud' }, 409);
              }
            } else {
              // Bloqueo activo — CUALQUIER persona (incluso el mismo usuario en otro dispositivo)
              // recibe el error. El primero que bloqueó tiene la hora.
              const secsLeft = Math.max(0, Math.floor((new Date(existing.expires_at!).getTime() - now.getTime()) / 1000));
              return fail({
                error: 'Esta hora ya está siendo reservada. Solo el primero en bloquearla puede continuar.',
                secondsLeft: secsLeft,
                expires_at: existing.expires_at,
              }, 400);
            }
          }

          // Cancelada / rechazada / vencida: la hora está libre YA, sin esperar su expires_at.
          // (Antes se exigía expires_at vencido: si el jugador cancelaba su intento, la hora
          // quedaba bloqueada hasta 5 min — síntoma "a las 11:00 no deja, a las 11:05 sí".)
          if (existing.status !== 'draft') {
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
                lock_token: guestToken,
                client_ip_hash: clientIpHash,
                end_time: item.end_time,
              })
              .eq('id', existing.id)
              .eq('status', existing.status)
              .select()
              .single();

            if (updated && !upErr) {
              lockedBookingIds.push(updated.id);
              continue;
            } else {
              const q = await quotaFail(upErr);
              if (q) return q;
              return fail({ error: 'Horario modificado por otra solicitud' }, 409);
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
          const q = await quotaFail(insErr);
          if (q) return q;
          // Garantía anti-solape de la BD (constraint de exclusión / trigger): hora ya tomada.
          if (insErr.code === '23P01' || insErr.message?.includes('SLOT_TAKEN')) {
            return fail({ error: 'Esta hora ya ha sido reservada.' }, 409);
          }
          // Regla de horas pasadas de la BD (migración 2026-11-30): mismo mensaje que la API.
          if (insErr.message?.includes('PAST_SLOT') || insErr.message?.includes('Fraude detectado')) {
            return fail({ error: `Esta hora ya empezó y pasó la tolerancia de ${BOOKING_GRACE_MINUTES} minutos para reservar en línea. Comunícate con el complejo.` }, 400);
          }
          // INSERT falló — lo más probable es una race condition (23505 unique constraint)
          if (insErr.code === '23505' || insErr.message?.includes('unique')) {
            // Re-fetch atómico: ver quién ganó la carrera
            const { data: conflictRow } = await supabase
              .from('bookings')
              .select('id, user_id, status, expires_at, lock_token')
              .eq('pitch_id', pitch_id)
              .eq('start_time', item.start_time)
              .maybeSingle();

            if (conflictRow) {
              const conflictExpired =
                !conflictRow.expires_at || new Date(conflictRow.expires_at) <= now;

              // Caso 1: Ya confirmada o pendiente — no se puede tomar
              if (
                conflictRow.status === 'confirmed' ||
                conflictRow.status === 'pending'
              ) {
                return fail({ error: 'Esta hora ya ha sido reservada.' }, 400);
              }

              // Caso 2: Draft activo — CUALQUIER intento posterior (mismo o diferente usuario) bloqueado
              if (conflictRow.status === 'draft' && !conflictExpired && !isMine(conflictRow)) {
                const secsLeft = Math.max(
                  0,
                  Math.floor(
                    (new Date(conflictRow.expires_at!).getTime() - now.getTime()) / 1000
                  )
                );
                return fail({
                    error:
                      'Esta hora ya está siendo reservada. Solo el primero en bloquearla puede continuar.',
                    secondsLeft: secsLeft,
                    expires_at: conflictRow.expires_at,
                  }, 400);
              }

              // Caso 3: Expirado o mismo usuario → podemos tomar el slot
              const { data: taken, error: takeErr } = await supabase
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
                  lock_token: guestToken,
                  client_ip_hash: clientIpHash,
                  end_time: item.end_time,
                })
                .eq('id', conflictRow.id)
                .eq('status', conflictRow.status)
                .or(conflictRow.status !== 'draft' || isMine(conflictRow) ? 'id.not.is.null' : `expires_at.is.null,expires_at.lte.${now.toISOString()}`)
                .select()
                .maybeSingle();

              if (taken && !takeErr) {
                lockedBookingIds.push(taken.id);
                continue;
              }
              const q2 = await quotaFail(takeErr);
              if (q2) return q2;
            }
          }
          console.error('[lock_booking insert error]', insErr);
          return fail({ error: 'No se pudo apartar la hora. Inténtalo de nuevo.' }, 500);
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
                  lock_token: guestToken,
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
        booking_ids,
        file_name,
        file_base64,
        total_price,
        deposit_amount,
      } = parseResult.data;

      const effectiveUserId = verifiedUserId;
      let validPitchId = pitch_id;

      // Horas pasadas: igual que al apartar, nadie (ni el dueño) puede en línea.
      if (selected_times.some((slot: string) => isSlotPassed(selected_date, slot))) {
        return NextResponse.json(
          { error: `Esta hora ya empezó y pasó la tolerancia de ${BOOKING_GRACE_MINUTES} minutos para reservar en línea. Comunícate con el complejo.` },
          { status: 400 }
        );
      }

      let paymentProofUrl: string | null = null;
      if (!booking_ids?.length || booking_ids.length > 4) return NextResponse.json({error:'Falta el bloqueo de la reserva'}, {status:400});
      let locksQuery = supabase.from('bookings').select('id,start_time').in('id',booking_ids)
        .eq('pitch_id',pitch_id).eq('status','draft').gt('expires_at',new Date().toISOString());
      locksQuery = verifiedUserId ? locksQuery.eq('user_id',verifiedUserId) : locksQuery.is('user_id',null).eq('lock_token',guestToken);
      const {data: locks,error: lockError}=await locksQuery;
      const requestedStarts = new Set(selected_times.map(t=>new Date(computeSlotIsoTimes(selected_date,t).startIso).getTime()));
      if(lockError || locks?.length!==booking_ids.length || locks.some(r=>!requestedStarts.has(new Date(r.start_time).getTime())))
        return NextResponse.json({error:'El bloqueo no te pertenece o expiró'}, {status:409});

      // Subida segura del comprobante con validación de magic bytes reales.
      // Si el usuario adjunta un archivo y no se puede guardar, se rechaza la
      // reserva: nunca se debe crear una reserva "pagada" sin comprobante.
      if (file_base64) {
        try {
          const match = file_base64.match(/^data:(image\/[a-zA-Z0-9+.\-]+);base64,(.+)$/);
          let buffer: Buffer;

          if (match) {
            buffer = Buffer.from(match[2], 'base64');
          } else {
            buffer = Buffer.from(file_base64, 'base64');
          }

          // ── Validación real con magic bytes: no confiamos en el MIME declarado ──
          const validation = validateImageUpload(buffer, {
            allowVideo: false,       // comprobantes: solo imágenes
            maxBytes: 5 * 1024 * 1024, // 5 MB máximo
            rejectGif: true,         // sin GIF para comprobantes
          });

          if (!validation.ok) {
            return NextResponse.json({ error: validation.error }, { status: 400 });
          }

          buffer = await sanitizeReceipt(buffer);
          const contentType = 'image/jpeg';
          const ext = 'jpeg';
          const filePath = `receipts/${effectiveUserId || 'guest'}_${Date.now()}.${ext}`;

          if (isR2Configured()) {
            try {
              const { url } = await uploadToR2({
                buffer,
                key: `comprobantes/${filePath}`,
                contentType,
                isPrivate: true,
              });
              paymentProofUrl = url;
            } catch (r2Err) {
              console.error('[R2 payment-proof upload error, falling back to Supabase]', r2Err);
            }
          }

          if (!paymentProofUrl) {
            const {data: bucket,error: bucketError}=await supabase.storage.getBucket('payment-proofs');
            if(bucketError || !bucket || bucket.public) throw new Error('El bucket de comprobantes debe ser privado');
            const { error: uploadErr } = await supabase.storage
              .from('payment-proofs')
              .upload(filePath, buffer, { contentType, upsert: true });

            if (!uploadErr) {
              paymentProofUrl = `/api/receipts/supabase/${filePath}`;
            } else {
              console.error('[payment-proof upload error]', uploadErr);
            }
          }
        } catch (err) {
          console.error('[payment-proof processing error]', err);
        }

        if (!paymentProofUrl) {
          return NextResponse.json(
            { error: 'No se pudo guardar el comprobante. Intenta nuevamente con una imagen JPG, PNG o WebP de máximo 5 MB.' },
            { status: 502 }
          );
        }
      }

      {
        if (!paymentProofUrl || !booking_ids?.length) return NextResponse.json({error:'Selecciona de nuevo el horario y adjunta el comprobante'}, {status:400});
        const { data, error } = await supabase.rpc('submit_booking_secure', {
          p_ids: booking_ids, p_user: verifiedUserId, p_token: guestToken,
          p_pitch: pitch_id, p_name: customer_name.trim(), p_phone: customer_phone || '',
          p_proof: paymentProofUrl
        });
        if (error) {
          const quotaMsg = quotaErrorMessage(error);
          if (quotaMsg) {
            const code = quotaCodeOf(error);
            if (code) after(() => reportSecurityAlert(supabase, {
              code, pitchId: pitch_id, phone: customer_phone, customerName: customer_name?.trim(),
              userId: verifiedUserId, ipHash: hashClientIp(req), deviceToken: guestToken,
            }));
            return NextResponse.json({ error: quotaMsg, code: 'QUOTA' }, { status: 429 });
          }
          return NextResponse.json({error:'El bloqueo expiró o no te pertenece. Selecciona de nuevo el horario.'}, {status:409});
        }
        const submitted = (data || []) as any[];
        // Liberar la caché de disponibilidad para que las horas tomadas se vean de inmediato.
        try { cache.invalidatePrefix(`availability:${pitch_id}:${selected_date}`); } catch { /* no crítico */ }
        if (submitted.length > 0) {
          const firstBookingId = submitted[0].id;
          after(async () => {
            // Un solo WhatsApp por solicitud: el mensaje ya agrupa las horas que comparten comprobante.
            try { await notifyBookingSubmitted(firstBookingId); } catch (err) { console.error('[WhatsApp Notification error]:', err); }
            // Aviso push al dueño de la cancha.
            try {
              const { data: pitchOwner } = await supabase.from('pitches').select('name, company_id').eq('id', pitch_id).single();
              const { data: comp } = pitchOwner?.company_id
                ? await supabase.from('companies').select('owner_id').eq('id', pitchOwner.company_id).single()
                : { data: null };
              if (comp?.owner_id && process.env.INTERNAL_API_SECRET) {
                const appBaseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
                await fetch(`${appBaseUrl}/api/send-push`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', 'x-internal-secret': process.env.INTERNAL_API_SECRET },
                  body: JSON.stringify({
                    userId: comp.owner_id,
                    title: '⚽ Cancheros: Reserva por aprobar',
                    message: `Nueva reserva en ${pitchOwner?.name || 'tu cancha'} de ${customer_name.trim().slice(0, 80)}. Comprobante subido.`,
                    url: '/dashboard/bookings',
                  }),
                }).catch(() => {});
              }
            } catch { /* no crítico */ }
          });
        }
        return NextResponse.json({success:true,data:submitted.map(({lock_token,...row}:any)=>row)});
      }


    }

    return NextResponse.json({ error: 'Acción no válida' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json(safeServerErrorResponse(err, 'Error de servidor al procesar la reserva.'), { status: 500 });
  }
}
