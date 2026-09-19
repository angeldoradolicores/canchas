-- ============================================================================
-- FUNCIONES CORREGIDAS Y OPTIMIZADAS PARA CANCHAS PASTO
-- Ejecuta este script completo en el SQL Editor de tu Dashboard de Supabase.
-- ============================================================================

-- 0) Índices para acelerar búsquedas
create index if not exists idx_bookings_pitch_starttime on bookings (pitch_id, start_time);
create index if not exists idx_pitches_company_id on pitches (company_id);


-- ============================================================================
-- 1) DISPONIBILIDAD DE CANCHAS DE UNA EMPRESA EN UNA FECHA (Versión SQL pura)
--    - Retorna detalles completos de cada cancha real (nombre, tipo, superficie, precio, profile_url)
--    - Retorna slots con estado: available, booked o being_booked
-- ============================================================================
create or replace function check_pitch_availability(p_company_id uuid, p_date date)
returns jsonb
language sql
stable
as $$
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'pitch_id', p.id,
      'pitch_name', p.name,
      'pitch_type', p.type,
      'surface', p.surface,
      'price_per_hour', p.price_per_hour,
      'profile_url', '/cancha/' || p.id,
      'payment_methods', p.payment_methods,
      'slots', (
        select coalesce(jsonb_agg(
          jsonb_build_object(
            'time', s.slot,
            'price', coalesce((p.custom_pricing ->> s.slot)::numeric, p.price_per_hour),
            'status', case
              when exists (
                select 1 from bookings b
                where b.pitch_id = p.id
                  and b.status in ('pending', 'confirmed')
                  and b.start_time < s.slot_end
                  and b.end_time > s.slot_start
              ) then 'booked'
              when exists (
                select 1 from bookings b
                where b.pitch_id = p.id
                  and b.status = 'draft'
                  and b.expires_at > now()
                  and b.start_time < s.slot_end
                  and b.end_time > s.slot_start
              ) then 'being_booked'
              else 'available'
            end
          ) order by s.slot
        ), '[]'::jsonb)
        from (
          select slot,
                 (p_date::text || 'T' || slot || ':00-05:00')::timestamptz as slot_start,
                 (p_date::text || 'T' || slot || ':00-05:00')::timestamptz + interval '1 hour' as slot_end
          from unnest(
            case
              when p.custom_pricing ? 'time_slots'
                   and jsonb_array_length(p.custom_pricing -> 'time_slots') > 0
              then (select array_agg(x) from jsonb_array_elements_text(p.custom_pricing -> 'time_slots') as x)
              else array['06:00','07:00','08:00','09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00','18:00','19:00','20:00','21:00','22:00','23:00']
            end
          ) as slot
        ) s
      )
    )
  ), '[]'::jsonb)
  from pitches p
  where p.company_id = p_company_id;
$$;


-- ============================================================================
-- 2) APROBAR / CANCELAR RESERVA POR CÓDIGO CORTO
--    - SECURITY DEFINER: corre con privilegios del dueño de la función
--      (bypasses RLS en tabla notifications)
--    - Permite al dueño enviar "aprobar a1b2c3" o "cancelar a1b2c3" por WhatsApp
--    - Limita la búsqueda a las canchas de SU empresa
--    - Actualiza bookings y genera notificación in-app
--    - Retorna toda la información necesaria para enviarle el ticket al cliente
-- ============================================================================
create or replace function resolve_pending_booking(p_company_id uuid, p_prefix text, p_new_status text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  updated_row bookings%rowtype;
  v_pitch pitches%rowtype;
  v_company companies%rowtype;
  v_owner_id uuid;
  v_payment_status text;
  v_title text;
  v_message text;
  v_time_str text;
  v_date_str text;
begin
  if p_new_status not in ('confirmed', 'cancelled') then
    return jsonb_build_object('success', false, 'message', 'Estado no válido: ' || p_new_status);
  end if;

  select * into v_company from companies where id = p_company_id;
  v_owner_id := v_company.owner_id;
  v_payment_status := case when p_new_status = 'confirmed' then 'verified' else 'rejected' end;

  update bookings b
  set status = p_new_status,
      payment_status = v_payment_status,
      reviewed_at = now(),
      reviewed_by = v_owner_id
  from pitches p
  where b.pitch_id = p.id
    and p.company_id = p_company_id
    and b.status = 'pending'
    and b.id::text ilike (p_prefix || '%')
  returning b.* into updated_row;

  if not found then
    return jsonb_build_object('success', false, 'message', 'No encontré una reserva pendiente con el código ' || p_prefix);
  end if;

  select * into v_pitch from pitches where id = updated_row.pitch_id;

  v_time_str := to_char(updated_row.start_time at time zone 'America/Bogota', 'HH24:MI');
  v_date_str := to_char(updated_row.start_time at time zone 'America/Bogota', 'DD/MM/YYYY');

  -- Notificación in-app si el cliente es usuario registrado
  if updated_row.user_id is not null then
    if p_new_status = 'confirmed' then
      v_title := '🎉 ¡Reserva Confirmada!';
      v_message := 'Tu reserva para el ' || v_date_str || ' a las ' || v_time_str || ' fue confirmada. ¡A jugar!';
    else
      v_title := '⚠️ Reserva Cancelada';
      v_message := 'Tu solicitud de reserva para el ' || v_date_str || ' a las ' || v_time_str || ' fue cancelada por el establecimiento.';
    end if;

    insert into notifications (user_id, sender_id, title, message, type, is_read)
    values (updated_row.user_id, v_owner_id, v_title, v_message, 'booking_status', false);
  end if;

  return jsonb_build_object(
    'success', true,
    'status', p_new_status,
    'booking_id', updated_row.id,
    'short_id', left(updated_row.id::text, 6),
    'customer_name', updated_row.customer_name,
    'customer_phone', updated_row.customer_phone,
    'pitch_name', v_pitch.name,
    'company_name', v_company.name,
    'date_str', v_date_str,
    'time_str', v_time_str,
    'whatsapp_instance_name', v_company.whatsapp_instance_name,
    'booking', to_jsonb(updated_row)
  );
end;
$$;


-- ============================================================================
-- 3) INFORMACIÓN PARA NOTIFICAR AL DUEÑO Y AL CLIENTE DE NUEVA RESERVA
--    - Calcula precios basándose en pitches.price_per_hour y booking_percentage
--    - Obtiene teléfono personal del dueño (profiles.phone o companies.owner_phone)
--    - Formatea fecha y hora en zona horaria de Colombia
-- ============================================================================
create or replace function get_booking_notification_info(p_booking_id uuid)
returns jsonb
language plpgsql
stable
as $$
#variable_conflict use_column
declare
  result jsonb;
  v_proof text;
begin
  -- Obtener el comprobante de pago de la reserva actual
  select payment_proof_url into v_proof from bookings where id = p_booking_id;

  select jsonb_build_object(
    'booking_id', b.id,
    'short_id', left(b.id::text, 6),
    'customer_name', b.customer_name,
    'customer_phone', b.customer_phone,
    'start_time', b.start_time,
    'end_time', b.end_time,
    'date_str', to_char(b.start_time at time zone 'America/Bogota', 'DD/MM/YYYY'),
    'time_str', to_char(b.start_time at time zone 'America/Bogota', 'HH24:MI') || ' a ' || to_char(b.end_time at time zone 'America/Bogota', 'HH24:MI'),
    'payment_proof_url', b.payment_proof_url,
    'price_per_hour', p.price_per_hour,
    'total_price', p.price_per_hour,
    'deposit_amount', round(p.price_per_hour * coalesce(p.booking_percentage, 50) / 100),
    'pitch_id', p.id,
    'pitch_name', p.name,
    'company_id', c.id,
    'company_name', c.name,
    'owner_phone', coalesce(prof.phone, c.owner_phone),
    'whatsapp_instance_name', c.whatsapp_instance_name,
    'sibling_bookings', (
      -- Buscar otras reservas con el MISMO comprobante (para agruparlas)
      select coalesce(jsonb_agg(jsonb_build_object(
        'booking_id', sb.id,
        'pitch_name', sp.name,
        'start_time', sb.start_time
      )), '[]'::jsonb)
      from bookings sb
      join pitches sp on sp.id = sb.pitch_id
      where sb.payment_proof_url = v_proof 
        and v_proof is not null
    )
  )
  into result
  from bookings b
  join pitches p on p.id = b.pitch_id
  join companies c on c.id = p.company_id
  left join profiles prof on prof.id = c.owner_id
  where b.id = p_booking_id;

  return result;
end;
$$;
