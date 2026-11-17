-- =============================================================================
-- TOLERANCIA DE 10 MINUTOS PARA RESERVAR UNA HORA YA INICIADA (una sola regla)
--
-- Problema: a las 5:03 la app avisaba "te queda poco tiempo" para la hora de las
-- 5:00 pero no dejaba reservar. En la base de datos quedaban triggers viejos con
-- tolerancias distintas (0, 5 y 10 minutos: supabase_fix_past_bookings_trigger.sql,
-- supabase_actualizacion_dueno_y_whatsapp.sql y versiones anteriores) que
-- contradecían a la app (BOOKING_GRACE_MINUTES = 10 en lib/utils.ts).
--
-- Esta migración borra TODOS esos triggers y deja uno solo:
--   · Jugadores e invitados: pueden apartar/reservar hasta 10 min después de que
--     empieza la hora (la de las 7:00 hasta las 7:09:59).
--   · Reservas del panel del dueño (manual / turno fijo), bonos y el dueño o
--     administradores: sin restricción.
--   · Solo se revisa al CREAR la reserva o al CAMBIAR su hora; aprobar, subir el
--     comprobante o editar datos nunca falla por la hora.
--
-- Si cambias BOOKING_GRACE_MINUTES en lib/utils.ts, cambia también c_grace aquí.
-- =============================================================================
begin;

-- 1. Quitar todos los triggers viejos de "horas pasadas" sobre bookings.
do $$
declare r record;
begin
  for r in
    select t.tgname
      from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
      join pg_namespace n on n.oid = c.relnamespace
      join pg_proc p on p.oid = t.tgfoid
     where n.nspname = 'public' and c.relname = 'bookings' and not t.tgisinternal
       and (p.prosrc ilike '%Fraude detectado%'
            or p.prosrc ilike '%horas pasadas%'
            or t.tgname ilike '%past%'
            or t.tgname ilike '%check_time%'
            or t.tgname ilike '%check_booking%'
            or t.tgname ilike '%fraud%')
  loop
    execute format('drop trigger if exists %I on public.bookings', r.tgname);
  end loop;
end $$;

drop function if exists public.tr_func_check_past_booking() cascade;
drop function if exists public.prevent_past_bookings() cascade;
drop function if exists public.check_past_booking() cascade;
drop function if exists public.check_fraud_past_booking() cascade;
drop function if exists public.validate_booking_time() cascade;

-- 2. Regla única.
create or replace function public.enforce_booking_not_past() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  c_grace constant interval := interval '10 minutes';
  v_owner uuid;
begin
  if new.start_time is null then return new; end if;
  -- En UPDATE solo importa si cambió la hora.
  if tg_op = 'UPDATE' and new.start_time is not distinct from old.start_time then return new; end if;
  if new.start_time + c_grace > now() then return new; end if;

  -- Panel del dueño (reserva manual / turno fijo) y horas canjeadas con bono.
  if coalesce(new.source, '') in ('owner_panel', 'loyalty_reward') or coalesce(new.booking_type, '') = 'contract' then
    return new;
  end if;

  -- El dueño en su propia cancha y los administradores.
  select c.owner_id into v_owner
    from public.pitches p join public.companies c on c.id = p.company_id
   where p.id = new.pitch_id;
  if new.user_id is not null and (
       new.user_id = v_owner
       or exists (select 1 from auth.users u where u.id = new.user_id
                   and coalesce(u.raw_app_meta_data ->> 'role', '') in ('admin', 'superadmin'))) then
    return new;
  end if;

  raise exception 'PAST_SLOT: la hora ya empezó y pasó la tolerancia de 10 minutos';
end $$;

drop trigger if exists enforce_booking_not_past on public.bookings;
create trigger enforce_booking_not_past
  before insert or update of start_time on public.bookings
  for each row execute function public.enforce_booking_not_past();

revoke all on function public.enforce_booking_not_past() from public, anon, authenticated;

commit;
