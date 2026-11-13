-- =============================================================================
-- MIGRACIÓN DE SEGURIDAD + GARANTÍA ANTI DOBLE RESERVA — Cancheros / Canchas Pasto
-- Fecha: 2026-11-12
--
-- Aplicar en: Supabase Dashboard -> SQL Editor. LEE Y EJECUTA POR BLOQUES, EN ORDEN.
-- Antes de nada, haz un backup (Dashboard -> Database -> Backups) y ejecuta el
-- BLOQUE 0 para conocer el estado actual.
--
-- Qué hace:
--   0) Diagnóstico (no modifica nada).
--   1) Columnas que el código ya espera pero no existen (arregla reportes/abonos).
--   2) Garantía anti doble reserva (constraint de exclusión + trigger por empresa).
--   3) Protección del rol en profiles (no auto-escalar a admin).
--   4) RLS en bookings + RPC pública de ocupación SIN datos personales.
--   5) Endurecer RPCs SECURITY DEFINER (resolve_pending_booking, etc.).
--   6) Expiración automática de pendientes y limpieza de borradores (pg_cron).
-- =============================================================================


-- =============================================================================
-- BLOQUE 0 — DIAGNÓSTICO (ejecutar primero, solo lectura)
-- =============================================================================
-- 0.1 Tablas sin RLS
-- select tablename, rowsecurity from pg_tables where schemaname='public' order by 2,1;

-- 0.2 Políticas actuales
-- select tablename, policyname, roles, cmd, qual, with_check from pg_policies
--   where schemaname='public' order by 1,4;

-- 0.3 Funciones SECURITY DEFINER y si anon puede ejecutarlas
-- select p.proname, p.prosecdef, has_function_privilege('anon', p.oid, 'execute') anon_exec
--   from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--   where n.nspname='public' order by 3 desc,2 desc;

-- 0.4 Restricciones/índices actuales de bookings
-- select conname, pg_get_constraintdef(oid) from pg_constraint where conrelid='public.bookings'::regclass;
-- select indexname, indexdef from pg_indexes where tablename='bookings';

-- 0.5 ¿HAY SOLAPES YA EXISTENTES? (hay que resolverlos a mano antes del BLOQUE 2)
-- select a.id a_id, b.id b_id, a.pitch_id, a.start_time a_start, a.end_time a_end,
--        b.start_time b_start, b.end_time b_end
--   from bookings a join bookings b
--     on a.pitch_id=b.pitch_id and a.id<b.id
--    and tstzrange(a.start_time,a.end_time,'[)') && tstzrange(b.start_time,b.end_time,'[)')
--  where a.status in ('pending','confirmed') and b.status in ('pending','confirmed');

-- 0.6 Cuentas que hoy son admin/superadmin (revísalas tras el BLOQUE 3)
-- select id, full_name, role from public.profiles where role in ('admin','superadmin');


-- =============================================================================
-- BLOQUE 1 — COLUMNAS QUE FALTAN (arregla abonos, pagos y reportes del dashboard)
-- El código de /api/bookings/remaining-payment y create_contract_batch escribe
-- en estas columnas; como no existían, los datos caían en un fallback frágil
-- (incrustados como texto dentro de payment_proof_url). Al crearlas, el código
-- pasa solo a su ruta nativa limpia, sin cambios de aplicación.
-- =============================================================================
alter table public.bookings add column if not exists remaining_payment_status text default 'pending';
alter table public.bookings add column if not exists remaining_payment_amount numeric default 0;
alter table public.bookings add column if not exists remaining_payment_notes  text;
alter table public.bookings add column if not exists remaining_payment_at      timestamptz;
alter table public.bookings add column if not exists remaining_payment_by      uuid;
alter table public.bookings add column if not exists remaining_payment_splits  jsonb;
alter table public.bookings add column if not exists billing_scheme            text;
alter table public.bookings add column if not exists lock_token                uuid;

create index if not exists idx_bookings_lock_token on public.bookings(lock_token) where lock_token is not null;
create index if not exists idx_bookings_pitch_start on public.bookings(pitch_id, start_time);
create index if not exists idx_bookings_status on public.bookings(status);

notify pgrst, 'reload schema';


-- =============================================================================
-- BLOQUE 2 — GARANTÍA ANTI DOBLE RESERVA
-- Resuelve primero el BLOQUE 0.5 (no puede haber solapes activos preexistentes).
-- =============================================================================

-- 2.1 Rango válido
alter table public.bookings
  add constraint bookings_valid_range check (end_time > start_time) not valid;
alter table public.bookings validate constraint bookings_valid_range;

-- 2.2 Exclusión por rango: misma cancha, reservas activas no se solapan.
--     Esta es la barrera infalible a nivel de motor: da igual el camino (API web,
--     panel, turno fijo, n8n, consola, inyección) — Postgres rechaza el solape.
create extension if not exists btree_gist;
alter table public.bookings
  add constraint bookings_no_overlap_same_pitch
  exclude using gist (pitch_id with =, tstzrange(start_time, end_time, '[)') with &&)
  where (status in ('pending', 'confirmed'));

-- 2.3 Trigger: cubre canchas combinadas/hijas y borradores (draft) vigentes,
--     serializando por empresa con un advisory lock para cerrar la carrera entre
--     la cancha individual y su combinada.
create or replace function public.enforce_booking_no_overlap()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company  uuid;
  v_conflict uuid[];
begin
  if new.status not in ('pending', 'confirmed', 'draft') then
    return new;
  end if;
  if new.status = 'draft' and (new.expires_at is null or new.expires_at <= now()) then
    return new;
  end if;

  select company_id into v_company from pitches where id = new.pitch_id;

  -- Serializa todas las escrituras de reservas de la misma empresa en la transacción
  perform pg_advisory_xact_lock(
    hashtextextended('booking:' || coalesce(v_company, new.pitch_id)::text, 0)
  );

  -- Canchas en conflicto: ella misma + sus hijas (si es combinada) + combinadas que la contienen
  select array_agg(distinct x) into v_conflict from (
    select new.pitch_id as x
    union
    select (jsonb_array_elements_text(p.custom_pricing -> 'linked_pitch_ids'))::uuid
      from pitches p
     where p.id = new.pitch_id
       and coalesce((p.custom_pricing ->> 'is_combined')::boolean, false)
       and jsonb_typeof(p.custom_pricing -> 'linked_pitch_ids') = 'array'
    union
    select p.id from pitches p
     where p.company_id = v_company
       and coalesce((p.custom_pricing ->> 'is_combined')::boolean, false)
       and jsonb_typeof(p.custom_pricing -> 'linked_pitch_ids') = 'array'
       and (p.custom_pricing -> 'linked_pitch_ids') ? new.pitch_id::text
  ) s;

  if exists (
    select 1 from bookings b
     where b.id <> new.id
       and b.pitch_id = any (v_conflict)
       and tstzrange(b.start_time, b.end_time, '[)') && tstzrange(new.start_time, new.end_time, '[)')
       and ( b.status in ('pending', 'confirmed')
             or (b.status = 'draft' and b.expires_at > now()) )
  ) then
    raise exception 'SLOT_TAKEN: el horario se solapa con otra reserva activa'
      using errcode = '23P01';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_booking_no_overlap on public.bookings;
create trigger trg_booking_no_overlap
before insert or update of status, start_time, end_time, pitch_id, expires_at on public.bookings
for each row execute function public.enforce_booking_no_overlap();


-- =============================================================================
-- BLOQUE 3 — PROTECCIÓN DEL ROL (impide auto-escalada a admin/superadmin)
-- Solo el service role (o SQL directo del dueño del proyecto) puede fijar
-- admin/superadmin. Un usuario final solo puede ser player, o pasar de player a owner.
-- =============================================================================
create or replace function public.protect_profile_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Solo aplica a peticiones de usuarios finales (anon / authenticated).
  if coalesce(auth.role(), 'service_role') in ('anon', 'authenticated') then
    if tg_op = 'INSERT' then
      if new.id <> auth.uid() then
        raise exception 'forbidden' using errcode = '42501';
      end if;
      if new.role is null or new.role not in ('player', 'owner') then
        new.role := 'player';
      end if;
    elsif tg_op = 'UPDATE' then
      if new.role is distinct from old.role then
        -- Único auto-cambio permitido: player -> owner (registro de dueño).
        if not (old.role = 'player' and new.role = 'owner') then
          raise exception 'No está permitido cambiar el rol' using errcode = '42501';
        end if;
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protect_profile_role on public.profiles;
create trigger trg_protect_profile_role
before insert or update on public.profiles
for each row execute function public.protect_profile_role();

-- Promover a un superadmin legítimo se hace desde app_metadata (no desde profiles ni
-- user_metadata). Ejecutar una vez por cada admin real, reemplazando el id:
--   select auth.uid();  -- (logueado como esa persona) o buscarlo en Auth -> Users
-- update auth.users set raw_app_meta_data =
--   coalesce(raw_app_meta_data,'{}'::jsonb) || '{"role":"superadmin"}'::jsonb
--   where id = '<uuid-del-admin>';


-- =============================================================================
-- BLOQUE 4 — RLS EN BOOKINGS + OCUPACIÓN PÚBLICA SIN PII
-- Hoy el navegador lee la tabla bookings con la anon key (teléfonos, nombres,
-- comprobantes). Esto lo cierra y expone solo la ocupación (horas tomadas).
-- =============================================================================
alter table public.bookings enable row level security;

-- Elimina políticas permisivas anteriores si las hubiera (ajusta los nombres según el BLOQUE 0.2).
-- drop policy if exists "<nombre-politica-vieja>" on public.bookings;

drop policy if exists bookings_select_own on public.bookings;
create policy bookings_select_own on public.bookings
  for select to authenticated using (user_id = auth.uid());

drop policy if exists bookings_select_owner on public.bookings;
create policy bookings_select_owner on public.bookings
  for select to authenticated using (
    exists (select 1 from public.pitches p
            join public.companies c on c.id = p.company_id
            where p.id = bookings.pitch_id and c.owner_id = auth.uid()));

drop policy if exists bookings_update_owner on public.bookings;
create policy bookings_update_owner on public.bookings
  for update to authenticated
  using (exists (select 1 from public.pitches p
                 join public.companies c on c.id = p.company_id
                 where p.id = bookings.pitch_id and c.owner_id = auth.uid()))
  with check (exists (select 1 from public.pitches p
                 join public.companies c on c.id = p.company_id
                 where p.id = bookings.pitch_id and c.owner_id = auth.uid()));

-- Crear/eliminar reservas SOLO vía API (service role). Quitar permisos directos.
revoke insert, delete on public.bookings from anon, authenticated;
revoke update on public.bookings from anon;

-- Ocupación pública (lo que las pantallas de disponibilidad necesitan), SIN PII.
create or replace function public.get_pitch_occupancy(
  p_pitch_ids uuid[], p_from timestamptz, p_to timestamptz
)
returns table (pitch_id uuid, start_time timestamptz, end_time timestamptz, status text, expires_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select b.pitch_id, b.start_time, b.end_time, b.status, b.expires_at
  from bookings b
  where b.pitch_id = any (p_pitch_ids)
    and cardinality(p_pitch_ids) <= 50
    and p_to - p_from <= interval '370 days'
    and b.start_time >= p_from and b.start_time <= p_to
    and b.status <> 'cancelled';
$$;
revoke execute on function public.get_pitch_occupancy(uuid[], timestamptz, timestamptz) from public;
grant  execute on function public.get_pitch_occupancy(uuid[], timestamptz, timestamptz) to anon, authenticated;

-- NOTA DE APLICACIÓN (frontend): tras activar esta RLS, en el navegador ya no se
-- puede hacer supabase.from('bookings').select(...). Hay que sustituir esas lecturas
-- por supabase.rpc('get_pitch_occupancy', {...}) en:
--   components/explore/ExploreView.tsx, components/booking/PitchDetail.tsx,
--   components/booking/BookingFlow.tsx, components/booking/ManualBookingModal.tsx,
--   components/booking/ContractBookingModal.tsx, ExpiredBookingFloatingBanner.tsx
-- Y el Realtime de 'bookings' deja de llegar a anónimos: usar Broadcast o polling 15-20s.
-- (Hacer este reemplazo ANTES de ejecutar este bloque, o coordinar el despliegue.)

-- profiles: que nadie lea teléfonos ajenos. Revisa la política actual (BLOQUE 0.2);
-- si hay un "select using (true)", reemplázala por lectura del propio perfil +
-- una vista pública mínima (id, full_name, avatar_url) para listados de comunidad.


-- =============================================================================
-- BLOQUE 5 — ENDURECER RPCs SECURITY DEFINER
-- resolve_pending_booking era invocable por anon (confirmaba/cancelaba reservas de
-- cualquier complejo y devolvía PII). Se restringe a service role / dueño.
-- =============================================================================
create or replace function public.resolve_pending_booking(p_company_id uuid, p_prefix text, p_new_status text)
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
  v_payment_status text;
  v_title text;
  v_message text;
  v_time_str text;
  v_date_str text;
  v_count int;
begin
  -- Autorización: solo n8n (service_role) o el dueño autenticado de esa empresa.
  if coalesce(auth.role(), 'service_role') <> 'service_role'
     and not exists (select 1 from companies where id = p_company_id and owner_id = auth.uid()) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_new_status not in ('confirmed', 'cancelled') then
    return jsonb_build_object('success', false, 'message', 'Estado no válido');
  end if;
  -- Prefijo estricto: 6-36 hex/guion, sin comodines (no permitir '' = todas).
  if p_prefix is null or p_prefix !~ '^[0-9a-fA-F-]{6,36}$' then
    return jsonb_build_object('success', false, 'message', 'Código inválido');
  end if;

  select * into v_company from companies where id = p_company_id;

  select count(*) into v_count
    from bookings b join pitches p on p.id = b.pitch_id
   where p.company_id = p_company_id and b.status = 'pending'
     and left(b.id::text, length(p_prefix)) = lower(p_prefix);
  if v_count <> 1 then
    return jsonb_build_object('success', false, 'message',
      case when v_count = 0 then 'No encontré una reserva pendiente con ese código'
           else 'Código ambiguo, usa más caracteres' end);
  end if;

  v_payment_status := case when p_new_status = 'confirmed' then 'verified' else 'rejected' end;

  update bookings b
     set status = p_new_status, payment_status = v_payment_status,
         reviewed_at = now(), reviewed_by = v_company.owner_id
    from pitches p
   where b.pitch_id = p.id and p.company_id = p_company_id and b.status = 'pending'
     and left(b.id::text, length(p_prefix)) = lower(p_prefix)
  returning b.* into updated_row;   -- el trigger anti-solape valida la confirmación

  select * into v_pitch from pitches where id = updated_row.pitch_id;
  v_time_str := to_char(updated_row.start_time at time zone 'America/Bogota', 'HH24:MI');
  v_date_str := to_char(updated_row.start_time at time zone 'America/Bogota', 'DD/MM/YYYY');

  if updated_row.user_id is not null then
    if p_new_status = 'confirmed' then
      v_title := '🎉 ¡Reserva Confirmada!';
      v_message := 'Tu reserva para el ' || v_date_str || ' a las ' || v_time_str || ' fue confirmada. ¡A jugar!';
    else
      v_title := '⚠️ Reserva Cancelada';
      v_message := 'Tu solicitud de reserva para el ' || v_date_str || ' a las ' || v_time_str || ' fue cancelada por el establecimiento.';
    end if;
    insert into notifications (user_id, sender_id, title, message, type, is_read)
    values (updated_row.user_id, v_company.owner_id, v_title, v_message, 'booking_status', false);
  end if;

  return jsonb_build_object(
    'success', true, 'status', p_new_status, 'booking_id', updated_row.id,
    'short_id', left(updated_row.id::text, 6), 'customer_name', updated_row.customer_name,
    'customer_phone', updated_row.customer_phone, 'pitch_name', v_pitch.name,
    'company_name', v_company.name, 'date_str', v_date_str, 'time_str', v_time_str,
    'whatsapp_instance_name', v_company.whatsapp_instance_name, 'booking', to_jsonb(updated_row));
end;
$$;

revoke execute on function public.resolve_pending_booking(uuid, text, text) from public, anon, authenticated;
grant  execute on function public.resolve_pending_booking(uuid, text, text) to service_role;

-- Las RPC que usa n8n para leer/crear (sus definiciones no están en el repo): revísalas
-- y, si son SECURITY DEFINER o devuelven PII, aplica el mismo patrón.
revoke execute on function public.get_booking_notification_info(uuid) from public, anon, authenticated;
grant  execute on function public.get_booking_notification_info(uuid) to service_role;
-- check_pitch_availability / _n8n / _n8nn / _n8nn(sic) / create_booking / expire_pending_bookings /
-- cleanup_expired_drafts: revisar una por una con el BLOQUE 0.3 y revocar de anon lo que escriba o exponga PII.

-- Por defecto, que las funciones NUEVAS no queden abiertas a anon.
alter default privileges in schema public revoke execute on functions from public, anon;


-- =============================================================================
-- BLOQUE 6 — EXPIRACIÓN AUTOMÁTICA (requiere extensión pg_cron)
-- Libera horarios acaparados por "pending" sin revisar y limpia borradores viejos.
-- =============================================================================
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('expire-stale-pending')
      where exists (select 1 from cron.job where jobname = 'expire-stale-pending');
    perform cron.schedule('expire-stale-pending', '*/10 * * * *', $cron$
      update public.bookings set status = 'cancelled', payment_status = 'expired'
       where status = 'pending' and source is distinct from 'owner_panel'
         and coalesce(booking_type, 'standard') <> 'contract'
         and expires_at is not null and expires_at < now();
    $cron$);

    perform cron.unschedule('purge-expired-drafts')
      where exists (select 1 from cron.job where jobname = 'purge-expired-drafts');
    perform cron.schedule('purge-expired-drafts', '*/15 * * * *', $cron$
      delete from public.bookings
       where status = 'draft' and expires_at < now() - interval '15 minutes';
    $cron$);
  end if;
end $$;

notify pgrst, 'reload schema';

-- =============================================================================
-- FIN. Recuerda: ROTAR la service_role key de Supabase (estaba en los JSON de n8n
-- del repositorio) es imprescindible; ninguna RLS protege si esa llave está filtrada.
-- =============================================================================
