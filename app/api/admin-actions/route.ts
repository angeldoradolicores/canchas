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
import { fetchConflictingPitchIds } from '@/lib/combined-pitch-utils';
import { safeServerErrorResponse } from '@/lib/error-handler';

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  return createClient(url, key);
}

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

// Caché en memoria para verificar si la BD tiene columnas 'note' y 'booking_type'
let _supportsContractColumns: boolean | null = null;

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
          return NextResponse.json(safeServerErrorResponse(error, 'Error al crear la empresa.'), { status: 500 });
        }
        company = newComp;
      }

      return NextResponse.json({ success: true, data: company });
    }

    // ── ACCIÓN: UPDATE_COMPANY ──
    if (action === 'update_company') {
      if (!ownerId) {
        return NextResponse.json({ error: 'Sesión no autorizada' }, { status: 401 });
      }
      const newName = typeof payload?.name === 'string' ? payload.name.trim().slice(0, 100) : null;
      if (!newName) {
        return NextResponse.json({ error: 'Nombre de complejo inválido' }, { status: 400 });
      }
      const { data: updated, error } = await supabase
        .from('companies')
        .update({ name: newName })
        .eq('owner_id', ownerId)
        .select('*')
        .maybeSingle();

      if (error) return NextResponse.json(safeServerErrorResponse(error, 'Error al actualizar la empresa.'), { status: 500 });
      return NextResponse.json({ success: true, data: updated });
    }

    // ── ACCIÓN: TOGGLE_FILTER_PERSONAL_MESSAGES ──
    if (action === 'toggle_filter_personal_messages') {
      if (!ownerId) {
        return NextResponse.json({ error: 'Sesión no autorizada' }, { status: 401 });
      }
      const filterVal = Boolean(payload?.filter_personal_messages);
      const { data: updated, error } = await supabase
        .from('companies')
        .update({ filter_personal_messages: filterVal })
        .eq('owner_id', ownerId)
        .select('*')
        .maybeSingle();

      if (error) return NextResponse.json(safeServerErrorResponse(error, 'Error al actualizar preferencia de filtro.'), { status: 500 });
      return NextResponse.json({ success: true, data: updated });
    }

    // ── 4. ACCIÓN: GET_PITCHES ──
    if (action === 'get_pitches') {
      const targetOwnerId = ownerId || (typeof payload?.owner_id === 'string' ? payload.owner_id : null);
      if (!targetOwnerId) {
        return NextResponse.json({ success: true, data: [] });
      }

      const { data: companies } = await supabase
        .from('companies')
        .select('id, name')
        .eq('owner_id', targetOwnerId);

      if (!companies || companies.length === 0) {
        return NextResponse.json({ success: true, data: [], company: null });
      }

      const companyIds = companies.map(c => c.id);

      const { data: pitches, error } = await supabase
        .from('pitches')
        .select('*, companies(id, name, address, zone)')
        .in('company_id', companyIds)
        .order('created_at', { ascending: false });

      if (error) return NextResponse.json(safeServerErrorResponse(error, 'Error al obtener las canchas.'), { status: 500 });
      return NextResponse.json({ success: true, data: pitches || [], company: companies[0] });
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

        if (createErr) return NextResponse.json(safeServerErrorResponse(createErr, 'Error al registrar la empresa.'), { status: 500 });
        company = newComp;
      }

      const amenitiesString = Array.isArray(payload.amenities)
        ? payload.amenities.join(' · ')
        : (typeof payload.amenities === 'string' ? payload.amenities : '');

      const imageUrl = data.image_url ||
        (Array.isArray(data.media_urls) && data.media_urls[0]) ||
        'https://images.unsplash.com/photo-1529900748604-07564a03e7a6?w=800&auto=format&fit=crop';

      const facebookUrl = typeof payload.facebook_url === 'string' ? payload.facebook_url.trim() : null;
      const instagramUrl = typeof payload.instagram_url === 'string' ? payload.instagram_url.trim() : null;
      const tiktokUrl = typeof payload.tiktok_url === 'string' ? payload.tiktok_url.trim() : null;

      const pitchAddress = typeof payload.address === 'string' ? payload.address.trim() : (typeof data.address === 'string' ? data.address.trim() : null);
      const pitchNeighborhood = typeof payload.neighborhood === 'string' ? payload.neighborhood.trim() : (typeof payload.custom_pricing?.neighborhood === 'string' ? payload.custom_pricing.neighborhood.trim() : null);
      const pitchPlaceId = typeof payload.place_id === 'string' ? payload.place_id.trim() : (typeof payload.custom_pricing?.place_id === 'string' ? payload.custom_pricing.place_id.trim() : null);
      const pitchPlaceName = typeof payload.place_name === 'string' ? payload.place_name.trim() : (typeof payload.custom_pricing?.place_name === 'string' ? payload.custom_pricing.place_name.trim() : null);
      const pitchMapsUrl = typeof payload.maps_url === 'string' ? payload.maps_url.trim() : (typeof payload.custom_pricing?.maps_url === 'string' ? payload.custom_pricing.maps_url.trim() : null);

      const mergedCustomPricing = {
        ...(payload.custom_pricing || {}),
        ...(pitchAddress ? { address: pitchAddress, street: payload.street || pitchAddress } : {}),
        ...(pitchNeighborhood ? { neighborhood: pitchNeighborhood, barrio: pitchNeighborhood } : {}),
        ...(pitchPlaceId ? { place_id: pitchPlaceId } : {}),
        ...(pitchPlaceName ? { place_name: pitchPlaceName } : {}),
        ...(pitchMapsUrl ? { maps_url: pitchMapsUrl } : {}),
        full_address: payload.full_address || (pitchAddress && pitchNeighborhood ? `${pitchAddress}, Barrio ${pitchNeighborhood}` : pitchAddress || null),
        ...(facebookUrl ? { facebook_url: facebookUrl } : {}),
        ...(instagramUrl ? { instagram_url: instagramUrl } : {}),
        ...(tiktokUrl ? { tiktok_url: tiktokUrl } : {}),
        ...(payload.is_combined !== undefined ? { is_combined: Boolean(payload.is_combined) } : {}),
        ...(Array.isArray(payload.linked_pitch_ids) ? { linked_pitch_ids: payload.linked_pitch_ids } : {}),
        social_links: {
          facebook: facebookUrl || null,
          instagram: instagramUrl || null,
          tiktok: tiktokUrl || null,
        },
      };

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
          custom_pricing: mergedCustomPricing,
          payment_methods: Array.isArray(payload.payment_methods) ? payload.payment_methods : [],
          amenities: amenitiesString,
          contact_phone: typeof payload.contact_phone === 'string' ? payload.contact_phone.slice(0, 25) : null,
          image_url: imageUrl,
          media_urls: data.media_urls,
          lat: typeof payload.lat === 'number' ? payload.lat : null,
          lng: typeof payload.lng === 'number' ? payload.lng : null,
          city: typeof payload.city === 'string' ? payload.city.slice(0, 100) : 'Pasto',
          department: typeof payload.department === 'string' ? payload.department.slice(0, 100) : 'Nariño',
          ...(pitchAddress ? { address: pitchAddress } : {}),
        })
        .select()
        .single();

      if (company && (payload.address || payload.city || pitchNeighborhood)) {
        const finalCompanyAddress = payload.address || `${payload.city || 'Pasto'}${payload.department ? ', ' + payload.department : ''}`;
        try {
          await supabase
            .from('companies')
            .update({
              address: finalCompanyAddress,
              zone: pitchNeighborhood || payload.zone || undefined,
            })
            .eq('id', company.id);
        } catch (e) {
          console.error('Error updating company address:', e);
        }
      }

      if (error) return NextResponse.json(safeServerErrorResponse(error, 'Error al crear la cancha.'), { status: 500 });
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

      const facebookUrl = payload.facebook_url !== undefined ? (typeof payload.facebook_url === 'string' ? payload.facebook_url.trim() : null) : undefined;
      const instagramUrl = payload.instagram_url !== undefined ? (typeof payload.instagram_url === 'string' ? payload.instagram_url.trim() : null) : undefined;
      const tiktokUrl = payload.tiktok_url !== undefined ? (typeof payload.tiktok_url === 'string' ? payload.tiktok_url.trim() : null) : undefined;

      const pitchAddress = payload.address !== undefined ? (typeof payload.address === 'string' ? payload.address.trim() : null) : undefined;
      const pitchNeighborhood = payload.neighborhood !== undefined ? (typeof payload.neighborhood === 'string' ? payload.neighborhood.trim() : null) : (typeof payload.custom_pricing?.neighborhood === 'string' ? payload.custom_pricing.neighborhood.trim() : undefined);
      const pitchPlaceId = payload.place_id !== undefined ? (typeof payload.place_id === 'string' ? payload.place_id.trim() : null) : (typeof payload.custom_pricing?.place_id === 'string' ? payload.custom_pricing.place_id.trim() : undefined);
      const pitchPlaceName = payload.place_name !== undefined ? (typeof payload.place_name === 'string' ? payload.place_name.trim() : null) : (typeof payload.custom_pricing?.place_name === 'string' ? payload.custom_pricing.place_name.trim() : undefined);
      const pitchMapsUrl = payload.maps_url !== undefined ? (typeof payload.maps_url === 'string' ? payload.maps_url.trim() : null) : (typeof payload.custom_pricing?.maps_url === 'string' ? payload.custom_pricing.maps_url.trim() : undefined);

      const mergedCustomPricing = {
        ...(payload.custom_pricing || {}),
        ...(pitchAddress !== undefined ? { address: pitchAddress, street: payload.street || pitchAddress } : {}),
        ...(pitchNeighborhood !== undefined ? { neighborhood: pitchNeighborhood, barrio: pitchNeighborhood } : {}),
        ...(pitchPlaceId !== undefined ? { place_id: pitchPlaceId } : {}),
        ...(pitchPlaceName !== undefined ? { place_name: pitchPlaceName } : {}),
        ...(pitchMapsUrl !== undefined ? { maps_url: pitchMapsUrl } : {}),
        ...(payload.full_address !== undefined ? { full_address: payload.full_address } : (pitchAddress && pitchNeighborhood ? { full_address: `${pitchAddress}, Barrio ${pitchNeighborhood}` } : {})),
        ...(facebookUrl !== undefined ? { facebook_url: facebookUrl } : {}),
        ...(instagramUrl !== undefined ? { instagram_url: instagramUrl } : {}),
        ...(tiktokUrl !== undefined ? { tiktok_url: tiktokUrl } : {}),
        ...(payload.is_combined !== undefined ? { is_combined: Boolean(payload.is_combined) } : {}),
        ...(payload.is_covered !== undefined ? { is_covered: Boolean(payload.is_covered) } : {}),
        ...(Array.isArray(payload.linked_pitch_ids) ? { linked_pitch_ids: payload.linked_pitch_ids } : {}),
        social_links: {
          facebook: facebookUrl !== undefined ? facebookUrl : payload.custom_pricing?.social_links?.facebook,
          instagram: instagramUrl !== undefined ? instagramUrl : payload.custom_pricing?.social_links?.instagram,
          tiktok: tiktokUrl !== undefined ? tiktokUrl : payload.custom_pricing?.social_links?.tiktok,
        },
      };

      const updateFields: any = {
        name: payload.name,
        description: payload.description ?? null,
        type: payload.type || 'Fútbol 5',
        supported_types: payload.supported_types || [payload.type || 'Fútbol 5'],
        surface: payload.surface || 'Sintética',
        tone: payload.tone || 'field-emerald',
        price_per_hour: parseFloat(payload.price) || 80000,
        booking_percentage: payload.booking_percentage || 50,
        custom_pricing: mergedCustomPricing,
        payment_methods: payload.payment_methods || [],
        amenities: amenitiesString,
        contact_phone: payload.contact_phone || null,
        image_url: imageUrl,
        media_urls: payload.media_urls || [],
        lat: payload.lat || null,
        lng: payload.lng || null,
      };

      if (payload.city !== undefined) updateFields.city = payload.city;
      if (payload.department !== undefined) updateFields.department = payload.department;
      if (pitchAddress !== undefined) updateFields.address = pitchAddress;

      const { data: pitch, error } = await supabase
        .from('pitches')
        .update(updateFields)
        .eq('id', pitch_id)
        .select()
        .single();

      if (error) return NextResponse.json(safeServerErrorResponse(error, 'Error al actualizar la cancha.'), { status: 500 });

      if (payload.address || payload.city || pitchNeighborhood) {
        try {
          const { data: pitchRow } = await supabase.from('pitches').select('company_id').eq('id', pitch_id).single();
          if (pitchRow?.company_id) {
            const finalCompanyAddress = payload.address || `${payload.city || 'Pasto'}${payload.department ? ', ' + payload.department : ''}`;
            await supabase.from('companies').update({
              address: finalCompanyAddress,
              ...(pitchNeighborhood ? { zone: pitchNeighborhood } : {}),
            }).eq('id', pitchRow.company_id);
          }
        } catch (e) {}
      }

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

      // Eliminar en cascada todos los registros dependientes (para evitar errores de FK constraint)
      try { await supabase.from('pitch_favorites').delete().eq('pitch_id', pitch_id); } catch (e) { /* ignorar */ }
      try { await supabase.from('favorites').delete().eq('pitch_id', pitch_id); } catch (e) { /* ignorar */ }
      try { await supabase.from('pitch_reviews').delete().eq('pitch_id', pitch_id); } catch (e) { /* ignorar */ }
      try { await supabase.from('tournaments').delete().eq('pitch_id', pitch_id); } catch (e) { /* ignorar */ }
      try { await supabase.from('schools').delete().eq('pitch_id', pitch_id); } catch (e) { /* ignorar */ }
      try { await supabase.from('challenges').delete().eq('pitch_id', pitch_id); } catch (e) { /* ignorar */ }
      try { await supabase.from('bookings').delete().eq('pitch_id', pitch_id); } catch (e) { /* ignorar */ }

      const { error } = await supabase
        .from('pitches')
        .delete()
        .eq('id', pitch_id);

      if (error) return NextResponse.json(safeServerErrorResponse(error, 'Error al eliminar la cancha.'), { status: 500 });
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
      // Campos adicionales opcionales (no requieren validación estricta)
      const note = typeof payload?.note === 'string' ? payload.note.slice(0, 500) : undefined;
      const isContract = !!payload?.is_contract;

      // Verificar que la cancha le pertenece al dueño
      const isOwner = await verifyPitchOwnership(ownerId, pitch_id);
      if (!isOwner) {
        return NextResponse.json({ error: 'No tienes permisos para agendar en esta cancha' }, { status: 403 });
      }

      // Verificar slots operativos – los contratos y reservas de todo el día omiten este chequeo
      if (!isContract) {
        const { data: pitchData } = await supabase
          .from('pitches')
          .select('custom_pricing')
          .eq('id', pitch_id)
          .single();

        const allowedSlots = pitchData?.custom_pricing?.time_slots;
        if (Array.isArray(allowedSlots) && allowedSlots.length > 0) {
          const closedSlot = selected_times.find((s: string) => !allowedSlots.includes(s));
          if (closedSlot) {
            return NextResponse.json(
              { error: `La hora ${closedSlot} no es operable para esta cancha.` },
              { status: 400 }
            );
          }
        }
      }

      // Mapeo seguro: base nativa garantizada + versión extendida si la BD tiene las columnas
      const inserts = selected_times.map((slot: string) => {
        const { startIso, endIso } = computeSlotIsoTimes(selected_date, slot);
        return {
          base: {
            pitch_id,
            user_id: ownerId,
            customer_name: customer_name || 'Reserva Interna',
            customer_phone: customer_phone || '',
            start_time: startIso,
            end_time: endIso,
            status: 'confirmed',
            payment_status: 'verified',
            source: 'owner_panel',
          },
          extended: {
            pitch_id,
            user_id: ownerId,
            customer_name: customer_name || 'Reserva Interna',
            customer_phone: customer_phone || '',
            start_time: startIso,
            end_time: endIso,
            status: 'confirmed',
            payment_status: 'verified',
            source: 'owner_panel',
            ...(note ? { note } : {}),
            ...(isContract ? { booking_type: 'contract' } : {}),
          },
          start_time: startIso,
          end_time: endIso,
        };
      });

      const conflictingPitchIds = await fetchConflictingPitchIds(supabase, pitch_id);
      const createdBookings: any[] = [];
      const skippedConflicts: any[] = [];

      for (const item of inserts) {
        // Verificar conflictos en la cancha actual y canchas combinadas/hijas vinculadas
        const { data: conflictRows } = await supabase
          .from('bookings')
          .select('id, pitch_id, status, expires_at')
          .in('pitch_id', conflictingPitchIds)
          .eq('start_time', item.start_time);

        const activeConflict = (conflictRows || []).find((b: any) => {
          if (['confirmed', 'pending'].includes(b.status)) return true;
          if (b.status === 'draft' && b.expires_at && new Date(b.expires_at) > new Date()) return true;
          return false;
        });

        if (activeConflict) {
          if (isContract) {
            skippedConflicts.push({ slot: item.start_time, reason: 'Hora ya ocupada' });
            continue;
          }
          const isLinked = activeConflict.pitch_id !== pitch_id;
          return NextResponse.json(
            {
              error: isLinked
                ? `La hora ${item.start_time.substring(11, 16)} no está disponible: cancha combinada o individual vinculada ya reservada.`
                : `La hora ${item.start_time.substring(11, 16)} ya está ocupada.`
            },
            { status: 400 }
          );
        }

        // Buscar si ya hay un registro para reutilizar (sólo de la cancha principal, no linked)
        const existing = (conflictRows || []).find((b: any) => b.pitch_id === pitch_id) || null;

        if (existing) {
          // Solo llegamos aquí si no estaba en activeConflict (es cancelled o draft expirado)
          if (existing.status === 'draft') {
            const { data: draftRow } = await supabase
              .from('bookings')
              .select('expires_at')
              .eq('id', existing.id)
              .single();

            if (draftRow?.expires_at && new Date(draftRow.expires_at) > new Date()) {
              if (isContract) {
                skippedConflicts.push({ slot: item.start_time, reason: 'Hora en proceso por otro usuario' });
                continue;
              }
              return NextResponse.json(
                { error: `La hora ${item.start_time.substring(11, 16)} está siendo reservada por otro usuario.` },
                { status: 400 }
              );
            }
          }

          // Reutilizar registro cancelado o expirado
          const { data: updated, error: updateErr } = await supabase
            .from('bookings')
            .update({
              user_id: item.base.user_id,
              customer_name: item.base.customer_name,
              customer_phone: item.base.customer_phone,
              end_time: item.base.end_time,
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
            if (isContract) {
              skippedConflicts.push({ slot: item.start_time, reason: updateErr.message });
              continue;
            }
            return NextResponse.json(safeServerErrorResponse(updateErr, 'Error al actualizar la reserva.'), { status: 500 });
          }
          if (updated) createdBookings.push(updated);
        } else {
          // Insertar nueva reserva con manejo dinámico de schema de columnas
          let payloadToInsert = (_supportsContractColumns === false) ? item.base : item.extended;
          let { data: inserted, error: insertErr } = await supabase
            .from('bookings')
            .insert(payloadToInsert)
            .select()
            .single();

          // Si falla porque las columnas note o booking_type no existen en Supabase (PGRST204), fallback seguro
          if (insertErr && insertErr.code === 'PGRST204') {
            _supportsContractColumns = false;
            const retry = await supabase
              .from('bookings')
              .insert(item.base)
              .select()
              .single();
            inserted = retry.data;
            insertErr = retry.error;
          } else if (!insertErr && _supportsContractColumns === null) {
            _supportsContractColumns = true;
          }

          if (insertErr) {
            if (insertErr.code === '23505') {
              if (isContract) {
                skippedConflicts.push({ slot: item.start_time, reason: 'Hora ya ocupada' });
                continue;
              }
              return NextResponse.json({ error: `La hora ${item.start_time.substring(11, 16)} ya está ocupada.` }, { status: 400 });
            }
            if (isContract) {
              skippedConflicts.push({ slot: item.start_time, reason: insertErr.message });
              continue;
            }
            return NextResponse.json(safeServerErrorResponse(insertErr, 'Error al crear la reserva.'), { status: 500 });
          }
          if (inserted) createdBookings.push(inserted);
        }
      }

      return NextResponse.json({
        success: true,
        data: createdBookings,
        booking_ids: createdBookings.map(b => b.id),
        skipped_conflicts: skippedConflicts,
      });
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
    return NextResponse.json(safeServerErrorResponse(err, 'Error de servidor al procesar la solicitud.'), { status: 500 });
  }
}