-- =============================================================================
-- LÍMITES ANTI-ACAPARAMIENTO DE HORAS (reservas sin iniciar sesión)
--
-- Evita que una misma persona, dispositivo o red bloquee todas las horas de una
-- cancha. Se aplica en la base de datos (no en memoria) y dentro de la misma
-- transacción, así no se puede esquivar con peticiones simultáneas.
--
-- SOLO afecta reservas hechas por jugadores e invitados desde la app
-- (estados 'draft' = hora apartada y 'pending' = comprobante enviado).
-- NO afecta:
--   · reservas manuales y contratos/turnos fijos del dueño (source 'owner_panel',
--     siempre se guardan 'confirmed'),
--   · horas canjeadas con bono (source 'loyalty_reward'),
--   · al dueño reservando en su propio complejo ni a los administradores.
--
-- Límites (cámbialos aquí si hace falta):
--   Horas apartadas a la vez ........ invitado 2 · con cuenta 4 · por red (IP) 10
--   Horas pendientes por complejo/día  invitado 2 · con cuenta 4 · por red (IP) 8
--     (se cuentan por celular Y por dispositivo/cuenta: no basta con cambiar uno)
--   Celulares bloqueados por el dueño: no pueden enviar reservas a ese complejo.
--
-- Ejecutar DESPUÉS de 2026-11-26.
-- =============================================================================
begin;

-- Huella de la red (hash de la IP con sal secreta; nunca se guarda la IP real).
alter table public.bookings add column if not exists client_ip_hash text;

create index if not exists idx_bookings_quota_user  on public.bookings(user_id)        where status in ('draft', 'pending');
create index if not exists idx_bookings_quota_token on public.bookings(lock_token)     where status in ('draft', 'pending');
create index if not exists idx_bookings_quota_ip    on public.bookings(client_ip_hash) where status in ('draft', 'pending');

-- Celulares bloqueados por el dueño de cada complejo.
create table if not exists public.booking_blocked_phones (
  company_id uuid not null references public.companies(id) on delete cascade,
  phone      text not null check (phone ~ '^[0-9]{7,10}$'),
  reason     text check (char_length(reason) <= 200),
  created_by uuid,
  created_at timestamptz not null default now(),
  primary key (company_id, phone)
);
alter table public.booking_blocked_phones enable row level security;
revoke all on public.booking_blocked_phones from public, anon, authenticated;

-- Últimos 10 dígitos del celular (3001234567, +57 300 123 4567 y 573001234567 son el mismo).
create or replace function public.booking_phone_key(p text) returns text
language sql immutable set search_path = public as $$
  select case when length(d) >= 7 then right(d, 10) end
    from (select regexp_replace(coalesce(p, ''), '\D', '', 'g') as d) x;
$$;

create or replace function public.enforce_booking_quota() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_company uuid;
  v_owner   uuid;
  v_guest   boolean := new.user_id is null;
  v_day     date;
  v_from    timestamptz;
  v_to      timestamptz;
  v_phone   text;
  v_count   integer;
  v_limit_draft   constant integer := case when new.user_id is null then 2 else 4 end;
  v_limit_pending constant integer := case when new.user_id is null then 2 else 4 end;
  c_ip_draft      constant integer := 10;
  c_ip_pending    constant integer := 8;
begin
  if new.status not in ('draft', 'pending') then return new; end if;
  if coalesce(new.source, '') in ('owner_panel', 'loyalty_reward') then return new; end if;

  -- En UPDATE solo se revisa cuando la fila "entra" a ocupar una hora: cambia de
  -- estado o se re-aparta un borrador vencido. Editar una reserva existente
  -- (por ejemplo, el dueño corrigiendo el celular) nunca dispara el límite.
  if tg_op = 'UPDATE'
     and old.status = new.status
     and not (new.status = 'draft' and (old.expires_at is null or old.expires_at <= now())) then
    return new;
  end if;

  select p.company_id, c.owner_id into v_company, v_owner
    from public.pitches p join public.companies c on c.id = p.company_id
   where p.id = new.pitch_id;

  -- El dueño en su propio complejo y los administradores no tienen límite.
  if new.user_id is not null and (
       new.user_id = v_owner
       or exists (select 1 from auth.users u where u.id = new.user_id
                   and coalesce(u.raw_app_meta_data ->> 'role', '') in ('admin', 'superadmin'))) then
    return new;
  end if;

  -- Serializa a la misma persona/dispositivo y a la misma red para que dos
  -- peticiones simultáneas no puedan pasar ambas el límite.
  if v_guest then
    perform pg_advisory_xact_lock(hashtext('booking-quota:t:' || coalesce(new.lock_token::text, '')));
  else
    perform pg_advisory_xact_lock(hashtext('booking-quota:u:' || new.user_id::text));
  end if;
  if new.client_ip_hash is not null then
    perform pg_advisory_xact_lock(hashtext('booking-quota:ip:' || new.client_ip_hash));
  end if;

  if new.status = 'draft' then
    select count(*) into v_count from public.bookings b
     where b.status = 'draft' and b.expires_at > now() and b.id <> new.id
       and (case when v_guest then b.user_id is null and b.lock_token = new.lock_token
                 else b.user_id = new.user_id end);
    if v_count + 1 > v_limit_draft then
      raise exception '%', case when v_guest then 'QUOTA_DRAFT_GUEST' else 'QUOTA_DRAFT_USER' end;
    end if;

    if new.client_ip_hash is not null then
      select count(*) into v_count from public.bookings b
       where b.status = 'draft' and b.expires_at > now() and b.id <> new.id
         and b.client_ip_hash = new.client_ip_hash;
      if v_count + 1 > c_ip_draft then raise exception 'QUOTA_DRAFT_IP'; end if;
    end if;
    return new;
  end if;

  -- new.status = 'pending' (comprobante enviado)
  v_phone := public.booking_phone_key(new.customer_phone);
  if v_phone is not null and exists (
       select 1 from public.booking_blocked_phones bp
        where bp.company_id = v_company and bp.phone = v_phone) then
    raise exception 'BLOCKED_PHONE';
  end if;

  v_day  := (new.start_time at time zone 'America/Bogota')::date;
  v_from := v_day::timestamp at time zone 'America/Bogota';
  v_to   := (v_day + 1)::timestamp at time zone 'America/Bogota';

  -- Por celular, en este complejo y este día.
  if v_phone is not null then
    perform pg_advisory_xact_lock(hashtext('booking-quota:ph:' || v_company::text || ':' || v_phone));
    select count(*) into v_count from public.bookings b
      join public.pitches p on p.id = b.pitch_id
     where p.company_id = v_company and b.status = 'pending' and b.id <> new.id
       and b.start_time >= v_from and b.start_time < v_to
       and coalesce(b.source, '') not in ('owner_panel', 'loyalty_reward')
       and public.booking_phone_key(b.customer_phone) = v_phone;
    if v_count + 1 > v_limit_pending then raise exception 'QUOTA_PENDING_PHONE'; end if;
  end if;

  -- Por dispositivo (invitado) o cuenta, en este complejo y este día.
  select count(*) into v_count from public.bookings b
    join public.pitches p on p.id = b.pitch_id
   where p.company_id = v_company and b.status = 'pending' and b.id <> new.id
     and b.start_time >= v_from and b.start_time < v_to
     and coalesce(b.source, '') not in ('owner_panel', 'loyalty_reward')
     and (case when v_guest then b.user_id is null and b.lock_token = new.lock_token
               else b.user_id = new.user_id end);
  if v_count + 1 > v_limit_pending then raise exception 'QUOTA_PENDING_DEVICE'; end if;

  -- Por red, en este complejo y este día (tope alto: los datos móviles comparten IP).
  if new.client_ip_hash is not null then
    select count(*) into v_count from public.bookings b
      join public.pitches p on p.id = b.pitch_id
     where p.company_id = v_company and b.status = 'pending' and b.id <> new.id
       and b.start_time >= v_from and b.start_time < v_to
       and b.client_ip_hash = new.client_ip_hash;
    if v_count + 1 > c_ip_pending then raise exception 'QUOTA_PENDING_IP'; end if;
  end if;

  return new;
end $$;

drop trigger if exists enforce_booking_quota on public.bookings;
create trigger enforce_booking_quota
  before insert or update of status, expires_at
  on public.bookings
  for each row execute function public.enforce_booking_quota();

revoke all on function public.enforce_booking_quota() from public, anon, authenticated;
revoke all on function public.booking_phone_key(text) from public, anon, authenticated;

commit;
