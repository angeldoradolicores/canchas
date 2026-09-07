import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  return createClient(url, key);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { action, payload } = body;
    const supabase = getSupabase();

    // Extraer ownerId del payload o del token de autorización
    let ownerId = payload?.owner_id;
    if (!ownerId) {
      const authHeader = req.headers.get('authorization') || req.headers.get('Authorization');
      if (authHeader) {
        const token = authHeader.replace('Bearer ', '');
        const { data: userData } = await supabase.auth.getUser(token);
        if (userData?.user?.id) {
          ownerId = userData.user.id;
        }
      }
    }

    // 1. OBTENER / GARANTIZAR EMPRESA PARA EL OWNER
    if (action === 'ensure_company') {
      if (!ownerId) {
        return NextResponse.json({ error: 'Falta owner_id' }, { status: 400 });
      }

      let { data: company } = await supabase
        .from('companies')
        .select('*')
        .eq('owner_id', ownerId)
        .maybeSingle();

      if (!company) {
        const companyName = payload?.company_name || 'Mi Complejo Deportivo';
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

    // 2. OBTENER CANCHAS ÚNICAMENTE DEL OWNER
    if (action === 'get_pitches') {
      if (!ownerId) {
        return NextResponse.json({ success: true, data: [] });
      }

      const { data: company } = await supabase
        .from('companies')
        .select('id')
        .eq('owner_id', ownerId)
        .maybeSingle();

      if (!company) {
        return NextResponse.json({ success: true, data: [] });
      }

      const { data: pitches, error } = await supabase
        .from('pitches')
        .select('*')
        .eq('company_id', company.id)
        .order('created_at', { ascending: false });

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true, data: pitches || [] });
    }

    // 3. CREAR CANCHA VINCULADA A LA EMPRESA DEL OWNER
    if (action === 'create_pitch') {
      if (!ownerId) {
        return NextResponse.json({ error: 'Sesión no detectada. Por favor recarga la página e inicia sesión nuevamente.' }, { status: 401 });
      }

      // Obtener o crear la empresa de este owner
      let { data: company } = await supabase
        .from('companies')
        .select('id')
        .eq('owner_id', ownerId)
        .maybeSingle();

      if (!company) {
        const { data: newComp, error: createErr } = await supabase
          .from('companies')
          .insert({
            owner_id: ownerId,
            name: payload?.company_name || 'Mi Complejo Deportivo',
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
        : (payload.amenities || '');

      const imageUrl = (Array.isArray(payload.images) && payload.images[0])
        ? payload.images[0]
        : (payload.image_url || 'https://images.unsplash.com/photo-1529900748604-07564a03e7a6?w=800&auto=format&fit=crop');

      const { data: pitch, error } = await supabase
        .from('pitches')
        .insert({
          company_id: company.id,
          name: payload.name,
          description: payload.description || null,
          type: payload.type || 'Fútbol 5',
          supported_types: payload.supported_types || [payload.type || 'Fútbol 5'],
          surface: payload.surface || 'Sintética',
          tone: payload.tone || 'field-emerald',
          price_per_hour: parseFloat(payload.price) || 80000,
          booking_percentage: payload.booking_percentage || 50,
          custom_pricing: payload.custom_pricing || {},
          payment_methods: payload.payment_methods || [],
          amenities: Array.isArray(payload.amenities)
            ? payload.amenities.join(' · ')
            : (payload.amenities || ''),
          contact_phone: payload.contact_phone || null,
          image_url: payload.image_url || (Array.isArray(payload.media_urls) && payload.media_urls[0]) || 'https://images.unsplash.com/photo-1529900748604-07564a03e7a6?w=800&auto=format&fit=crop',
          media_urls: payload.media_urls || [],
          lat: payload.lat || null,
          lng: payload.lng || null,
        })
        .select()
        .single();

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true, data: pitch });
    }

    // 3.5. ACTUALIZAR CANCHA
    if (action === 'update_pitch') {
      const pitchId = payload?.pitch_id;
      if (!pitchId || !ownerId) {
        return NextResponse.json({ error: 'Falta pitch_id u owner_id' }, { status: 400 });
      }

      // Validar que el pitch pertenece al owner
      const { data: pitchCheck } = await supabase
        .from('pitches')
        .select('company_id, companies!inner(owner_id)')
        .eq('id', pitchId)
        .eq('companies.owner_id', ownerId)
        .single();
        
      if (!pitchCheck) {
        return NextResponse.json({ error: 'No tienes permiso para editar esta cancha' }, { status: 403 });
      }

      const amenitiesString = Array.isArray(payload.amenities)
        ? payload.amenities.join(' · ')
        : (payload.amenities || '');

      const imageUrl = (Array.isArray(payload.media_urls) && payload.media_urls[0])
        ? payload.media_urls[0]
        : (payload.image_url || 'https://images.unsplash.com/photo-1529900748604-07564a03e7a6?w=800&auto=format&fit=crop');

      const { data: pitch, error } = await supabase
        .from('pitches')
        .update({
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
          amenities: Array.isArray(payload.amenities)
            ? payload.amenities.join(' · ')
            : (payload.amenities || ''),
          contact_phone: payload.contact_phone || null,
          image_url: (Array.isArray(payload.media_urls) && payload.media_urls[0]) || payload.image_url || 'https://images.unsplash.com/photo-1529900748604-07564a03e7a6?w=800&auto=format&fit=crop',
          media_urls: payload.media_urls || [],
          lat: payload.lat || null,
          lng: payload.lng || null,
        })
        .eq('id', pitchId)
        .select()
        .single();

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true, data: pitch });
    }

    // 4. ELIMINAR CANCHA
    if (action === 'delete_pitch') {
      const pitchId = payload?.pitch_id;
      if (!pitchId) return NextResponse.json({ error: 'Falta pitch_id' }, { status: 400 });

      const { error } = await supabase
        .from('pitches')
        .delete()
        .eq('id', pitchId);

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true });
    }

    if (action === 'create_manual_booking') {
      const pitchId = payload?.pitch_id;
      const selectedTimes = payload?.selected_times || [];
      const date = payload?.date;

      if (!pitchId || !date || selectedTimes.length === 0) {
         return NextResponse.json({ error: 'Selecciona una cancha, fecha y hora' }, { status: 400 });
      }

      const inserts = selectedTimes.map((slot: string) => {
        const hourNum = parseInt(slot.split(':')[0], 10);
        const endHourNum = (hourNum + 1) % 24;
        const endSlot = endHourNum < 10 ? `0${endHourNum}:00` : `${endHourNum}:00`;

        const startTimeIso = `${date}T${slot}:00-05:00`;
        const endTimeIso = `${date}T${endSlot}:00-05:00`;

        return {
          pitch_id: pitchId,
          user_id: ownerId, // El dueño es el que la registra
          customer_name: payload.customer_name || 'Reserva Interna',
          customer_phone: payload.customer_phone || '',
          start_time: startTimeIso,
          end_time: endTimeIso,
          status: 'confirmed', // Confirmada directamente
          payment_status: 'verified', // Consideramos que pagó o arregló con el dueño
          source: 'owner_panel',
        };
      });

      const { data: bookings, error } = await supabase
        .from('bookings')
        .insert(inserts)
        .select();

      if (error) {
         if (error.code === '23505') {
            return NextResponse.json({ error: 'Alguna hora ya está ocupada.' }, { status: 400 });
         }
         return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ success: true, data: bookings });
    }

    // 6. ESTADÍSTICAS DEL DASHBOARD
    if (action === 'get_dashboard_stats') {
      if (!ownerId) {
        return NextResponse.json({ success: true, data: null });
      }

      const { data: company } = await supabase
        .from('companies')
        .select('*')
        .eq('owner_id', ownerId)
        .maybeSingle();

      if (!company) {
        return NextResponse.json({ success: true, data: null });
      }

      const { data: pitches } = await supabase
        .from('pitches')
        .select('*')
        .eq('company_id', company.id);

      const pitchIds = (pitches || []).map(p => p.id);

      let bookings: any[] = [];
      if (pitchIds.length > 0) {
        const { data: bookingsData } = await supabase
          .from('bookings')
          .select('*, pitches(name)')
          .in('pitch_id', pitchIds)
          .order('created_at', { ascending: false })
          .limit(10);

        bookings = bookingsData || [];
      }

      return NextResponse.json({
        success: true,
        data: {
          company,
          pitchesCount: pitches?.length || 0,
          pitches: pitches || [],
          recentBookings: bookings,
          totalIncome: bookings.length * 80000,
        }
      });
    }

    return NextResponse.json({ success: true, data: [] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error de servidor' }, { status: 500 });
  }
}