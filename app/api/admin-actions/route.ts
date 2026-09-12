import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { checkRateLimit, createRateLimitErrorResponse } from '@/lib/rate-limit';
import { getAuthenticatedUser, verifyPitchOwnership } from '@/lib/auth-guard';
import {
  AdminCreatePitchSchema,
  AdminUpdatePitchSchema,
  AdminDeletePitchSchema,
  AdminManualBookingSchema,
} from '@/lib/validations/api-schemas';

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  return createClient(url, key);
}

export async function POST(req: NextRequest) {
  // ── 1. RATE LIMITING: 40 peticiones por minuto ──
  const rateLimit = checkRateLimit(req, {
    limit: 40,
    windowSeconds: 60,
    keyPrefix: 'api:admin-actions',
  });

  if (!rateLimit.success) {
    return createRateLimitErrorResponse(rateLimit);
  }

  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Cuerpo de petición inválido' }, { status: 400 });
    }

    const { action, payload } = body;
    const supabase = getSupabase();

    // ── 2. AUTENTICACIÓN ESTRICTA DESDE TOKEN / SESIÓN ──
    // Se extrae el usuario autenticado de forma segura. El payload.owner_id se descarta
    // para evitar que usuarios no autorizados manipulen recursos ajenos (IDOR).
    const authedUser = await getAuthenticatedUser(req);
    let ownerId: string | null = authedUser?.id || null;

    // Si getAuthenticatedUser no lo detectó por cookies, verificar cabecera Authorization directamente
    if (!ownerId) {
      const authHeader = req.headers.get('authorization') || req.headers.get('Authorization');
      if (authHeader) {
        const token = authHeader.replace(/^Bearer\s+/i, '').trim();
        if (token) {
          const { data: userData } = await supabase.auth.getUser(token);
          if (userData?.user?.id) {
            ownerId = userData.user.id;
          }
        }
      }
    }

    // ── 3. ACCIÓN: ENSURE_COMPANY ──
    if (action === 'ensure_company') {
      if (!ownerId) {
        return NextResponse.json({ error: 'Sesión no autorizada' }, { status: 401 });
      }

      // Buscar empresas existentes del dueño
      const { data: existingCompanies } = await supabase
        .from('companies')
        .select('*')
        .eq('owner_id', ownerId)
        .order('created_at', { ascending: true })
        .limit(1);

      let company = existingCompanies?.[0] ?? null;
      if (!company) {
        const companyName = (typeof payload?.company_name === 'string' && payload.company_name.slice(0, 100)) || 'Mi Complejo Deportivo';
        const { data: newComp, error } = await supabase
          .from('companies')
          .insert({
            owner_id: ownerId,
            name: companyName,
            address: 'Pasto, Nariño',
            zone: 'Norte',
            whatsapp_status: 'disconnected',
          })
          .select('*')
          .single();

        if (error) {
          console.error('Error creando empresa:', error);
          return NextResponse.json({ error: error.message }, { status: 500 });
        }
        company = newComp;
      }

      return NextResponse.json({ success: true, data: company });
    }

    // ── 4. ACCIÓN: GET_PITCHES ──
    if (action === 'get_pitches') {
      if (!ownerId) {
        return NextResponse.json({ success: true, data: [] });
      }

      const { data: companies } = await supabase
        .from('companies')
        .select('id')
        .eq('owner_id', ownerId);

      if (!companies || companies.length === 0) {
        return NextResponse.json({ success: true, data: [] });
      }

      const companyIds = companies.map(c => c.id);

      const { data: pitches, error } = await supabase
        .from('pitches')
        .select('*')
        .in('company_id', companyIds)
        .order('created_at', { ascending: false });

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true, data: pitches || [] });
    }

    // ── 5. ACCIÓN: CREATE_PITCH ──
    if (action === 'create_pitch') {
      if (!ownerId) {
        return NextResponse.json({ error: 'No autorizado. Inicia sesión como dueño.' }, { status: 401 });
      }

      const validation = AdminCreatePitchSchema.safeParse(payload || {});
      if (!validation.success) {
        return NextResponse.json(
          { error: validation.error.issues[0]?.message || 'Datos de cancha inválidos', details: validation.error.flatten() },
          { status: 400 }
        );
      }

      const data = validation.data;

      // Obtener o crear la empresa de este owner
      let { data: company } = await supabase
        .from('companies')
        .select('id')
        .eq('owner_id', ownerId)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (!company) {
        const { data: newComp, error: createErr } = await supabase
          .from('companies')
          .insert({
            owner_id: ownerId,
            name: 'Mi Complejo Deportivo',
            address: 'Pasto, Nariño',
            zone: 'Norte',
            whatsapp_status: 'disconnected',
          })
          .select('id')
          .single();

        if (createErr) return NextResponse.json({ error: 'Error al registrar empresa: ' + createErr.message }, { status: 500 });
        company = newComp;
      }

      const amenitiesString = Array.isArray(payload.amenities)
        ? payload.amenities.join(' · ')
        : (typeof payload.amenities === 'string' ? payload.amenities : '');

      const imageUrl = data.image_url ||
        (Array.isArray(data.media_urls) && data.media_urls[0]) ||
        'https://images.unsplash.com/photo-1529900748604-07564a03e7a6?w=800&auto=format&fit=crop';

      const { data: pitch, error } = await supabase
        .from('pitches')
        .insert({
          company_id: company.id,
          name: data.name,
          description: typeof payload.description === 'string' ? payload.description.slice(0, 2000) : null,
          type: data.type,
          supported_types: Array.isArray(payload.supported_types) ? payload.supported_types : [data.type],
          surface: typeof payload.surface === 'string' ? payload.surface : 'Sintética',
          tone: typeof payload.tone === 'string' ? payload.tone : 'field-emerald',
          price_per_hour: data.price_per_hour,
          booking_percentage: Number(payload.booking_percentage) || 50,
          custom_pricing: payload.custom_pricing || {},
          payment_methods: Array.isArray(payload.payment_methods) ? payload.payment_methods : [],
          amenities: amenitiesString,
          contact_phone: typeof payload.contact_phone === 'string' ? payload.contact_phone.slice(0, 25) : null,
          image_url: imageUrl,
          media_urls: data.media_urls,
          lat: typeof payload.lat === 'number' ? payload.lat : null,
          lng: typeof payload.lng === 'number' ? payload.lng : null,
        })
        .select()
        .single();

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true, data: pitch });
    }

    // ── 6. ACCIÓN: UPDATE_PITCH ──
    if (action === 'update_pitch') {
      if (!ownerId) {
        return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
      }

      const validation = AdminUpdatePitchSchema.safeParse(payload || {});
      if (!validation.success) {
        return NextResponse.json({ error: 'Parámetros de actualización inválidos' }, { status: 400 });
      }

      const { pitch_id } = validation.data;

      // Verificar que la cancha pertenece a una empresa del dueño
      const isOwner = await verifyPitchOwnership(ownerId, pitch_id);
      if (!isOwner) {
        return NextResponse.json({ error: 'No tienes permiso para editar esta cancha' }, { status: 403 });
      }

      const amenitiesString = Array.isArray(payload.amenities)
        ? payload.amenities.join(' · ')
        : (typeof payload.amenities === 'string' ? payload.amenities : '');

      const imageUrl = (Array.isArray(payload.media_urls) && payload.media_urls[0]) ||
        payload.image_url ||
        'https://images.unsplash.com/photo-1529900748604-07564a03e7a6?w=800&auto=format&fit=crop';

      const updateFields: any = {
        name: payload.name,
        description: payload.description ?? null,
        type: payload.type || 'Fútbol 5',
        supported_types: payload.supported_types || [payload.type || 'Fútbol 5'],
        surface: payload.surface || 'Sintética',
        tone: payload.tone || 'field-emerald',
        price_per_hour: parseFloat(payload.price) || 80000,
        booking_percentage: payload.booking_percentage || 50,
        custom_pricing: payload.custom_pricing || {},
        payment_methods: payload.payment_methods || [],
        amenities: amenitiesString,
        contact_phone: payload.contact_phone || null,
        image_url: imageUrl,
        media_urls: payload.media_urls || [],
        lat: payload.lat || null,
        lng: payload.lng || null,
      };

      const { data: pitch, error } = await supabase
        .from('pitches')
        .update(updateFields)
        .eq('id', pitch_id)
        .select()
        .single();

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true, data: pitch });
    }

    // ── 7. ACCIÓN: DELETE_PITCH ──
    if (action === 'delete_pitch') {
      if (!ownerId) {
        return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
      }

      const validation = AdminDeletePitchSchema.safeParse(payload || {});
      if (!validation.success) {
        return NextResponse.json({ error: 'ID de cancha inválido' }, { status: 400 });
      }

      const { pitch_id } = validation.data;

      // Verificar propiedad
      const isOwner = await verifyPitchOwnership(ownerId, pitch_id);
      if (!isOwner) {
        return NextResponse.json({ error: 'No tienes permiso para eliminar esta cancha' }, { status: 403 });
      }

      const { error } = await supabase
        .from('pitches')
        .delete()
        .eq('id', pitch_id);

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true });
    }

    // ── 8. ACCIÓN: CREATE_MANUAL_BOOKING ──
    if (action === 'create_manual_booking') {
      if (!ownerId) {
        return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
      }

      const validation = AdminManualBookingSchema.safeParse({
        pitch_id: payload?.pitch_id,
        selected_date: payload?.date,
        selected_times: payload?.selected_times,
        customer_name: payload?.customer_name,
        customer_phone: payload?.customer_phone,
        total_price: payload?.total_price,
        deposit_amount: payload?.deposit_amount,
      });

      if (!validation.success) {
        return NextResponse.json(
          { error: validation.error.issues[0]?.message || 'Datos de reserva manual inválidos' },
          { status: 400 }
        );
      }

      const { pitch_id, selected_date, selected_times, customer_name, customer_phone } = validation.data;

      // Verificar que la cancha le pertenece al dueño
      const isOwner = await verifyPitchOwnership(ownerId, pitch_id);
      if (!isOwner) {
        return NextResponse.json({ error: 'No tienes permisos para agendar en esta cancha' }, { status: 403 });
      }

      const inserts = selected_times.map((slot: string) => {
        const hourNum = parseInt(slot.split(':')[0], 10);
        const endHourNum = (hourNum + 1) % 24;
        const endSlot = endHourNum < 10 ? `0${endHourNum}:00` : `${endHourNum}:00`;
        return {
          pitch_id,
          user_id: ownerId,
          customer_name: customer_name || 'Reserva Interna',
          customer_phone: customer_phone || '',
          start_time: `${selected_date}T${slot}:00-05:00`,
          end_time: `${selected_date}T${endSlot}:00-05:00`,
          status: 'confirmed',
          payment_status: 'verified',
          source: 'owner_panel',
        };
      });

      const createdBookings: any[] = [];

      for (const item of inserts) {
        const { data: existing } = await supabase
          .from('bookings')
          .select('id, status')
          .eq('pitch_id', pitch_id)
          .eq('start_time', item.start_time)
          .maybeSingle();

        if (existing) {
          if (['confirmed', 'pending'].includes(existing.status)) {
            return NextResponse.json(
              { error: `La hora ${item.start_time.substring(11, 16)} ya está ocupada.` },
              { status: 400 }
            );
          }

          if (existing.status === 'draft') {
            const { data: draftRow } = await supabase
              .from('bookings')
              .select('expires_at')
              .eq('id', existing.id)
              .single();

            if (draftRow?.expires_at && new Date(draftRow.expires_at) > new Date()) {
              return NextResponse.json(
                { error: `La hora ${item.start_time.substring(11, 16)} está siendo reservada por otro usuario en este momento.` },
                { status: 400 }
              );
            }
          }

          // Reutilizar registro cancelado o expirado
          const { data: updated, error: updateErr } = await supabase
            .from('bookings')
            .update({
              user_id: item.user_id,
              customer_name: item.customer_name,
              customer_phone: item.customer_phone,
              end_time: item.end_time,
              status: 'confirmed',
              payment_status: 'verified',
              source: 'owner_panel',
              reviewed_at: new Date().toISOString(),
              reviewed_by: ownerId,
            })
            .eq('id', existing.id)
            .select()
            .single();

          if (updateErr) {
            return NextResponse.json({ error: updateErr.message }, { status: 500 });
          }
          if (updated) createdBookings.push(updated);
        } else {
          const { data: inserted, error: insertErr } = await supabase
            .from('bookings')
            .insert(item)
            .select()
            .single();

          if (insertErr) {
            if (insertErr.code === '23505') {
              return NextResponse.json({ error: `La hora ${item.start_time.substring(11, 16)} ya está ocupada.` }, { status: 400 });
            }
            return NextResponse.json({ error: insertErr.message }, { status: 500 });
          }
          if (inserted) createdBookings.push(inserted);
        }
      }

      return NextResponse.json({ success: true, data: createdBookings, booking_ids: createdBookings.map(b => b.id) });
    }

    // ── 9. ACCIÓN: GET_DASHBOARD_STATS ──
    if (action === 'get_dashboard_stats') {
      if (!ownerId) {
        return NextResponse.json({ success: true, data: null });
      }

      const { data: allCompanies } = await supabase
        .from('companies')
        .select('id')
        .eq('owner_id', ownerId);

      if (!allCompanies || allCompanies.length === 0) {
        return NextResponse.json({ success: true, data: null });
      }

      const companyIds = allCompanies.map(c => c.id);

      const { data: pitches } = await supabase
        .from('pitches')
        .select('*')
        .in('company_id', companyIds);

      const pitchIds = (pitches || []).map(p => p.id);

      let bookings: any[] = [];
      if (pitchIds.length > 0) {
        const { data: bookingsData } = await supabase
          .from('bookings')
          .select('*, pitches(name, price_per_hour)')
          .in('pitch_id', pitchIds)
          .order('created_at', { ascending: false });

        bookings = bookingsData || [];
      }

      const { data: primaryCompany } = await supabase
        .from('companies')
        .select('*')
        .eq('owner_id', ownerId)
        .order('created_at', { ascending: true })
        .limit(1)
        .single();

      return NextResponse.json({
        success: true,
        data: {
          company: primaryCompany,
          pitchesCount: pitches?.length || 0,
          pitches: pitches || [],
          recentBookings: bookings,
        }
      });
    }

    return NextResponse.json({ error: 'Acción no válida' }, { status: 400 });
  } catch (err: any) {
    console.error('Error en admin-actions:', err);
    return NextResponse.json({ error: err.message || 'Error de servidor' }, { status: 500 });
  }
}