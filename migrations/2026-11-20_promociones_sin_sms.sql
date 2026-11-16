-- =============================================================================
-- Promociones del complejo: sin SMS, vinculación segura del celular y bloqueos
-- por usuario/teléfono (en lugar de un bloqueo global).
-- Ejecutar DESPUÉS de:
--   2026-11-18_complex_content_security.sql
--   2026-11-18_complex_promotions.sql
--   2026-11-19_phone_promotion_counting.sql
-- =============================================================================
begin;

-- ── 1. Solo cuentan las promociones que crea el dueño ───────────────────────
-- La antigua "cortesía por 20 canchas" vivía solo en el frontend y ya se eliminó.
-- Ya no se envía una notificación masiva a todos los clientes al publicar una
-- promoción: ahora solo se muestra como pestaña dentro del flujo de reserva.
drop trigger if exists notify_complex_promotion on public.complex_promotions;
drop function if exists public.notify_complex_promotion();

-- ── 2. Se elimina la vinculación por SMS ────────────────────────────────────
drop function if exists public.claim_phone_promotions(uuid);

-- Un celular pertenece a una sola cuenta y una cuenta tiene un solo celular de
-- conteo. Así nadie puede "aspirar" el conteo de muchos teléfonos.
create unique index if not exists promotion_phone_one_per_user
  on public.promotion_phone_accounts(user_id);

-- Bloqueo transaccional por clave (teléfono o usuario). Orden fijo: primero el
-- teléfono y luego el usuario, para no generar bloqueos circulares.
create or replace function public.promotion_lock(k text) returns void
language sql volatile set search_path=public as $$
  select pg_advisory_xact_lock(hashtextextended('promo:' || k, 0));
$$;

-- Une el conteo acumulado por un celular a una cuenta registrada.
-- Solo se llama desde el trigger cuando el DUEÑO aprueba (confirmed + verified)
-- una reserva PAGADA hecha en línea por esa cuenta con ese mismo celular.
-- El primer vínculo es definitivo; cambios posteriores solo vía soporte.
create or replace function public.link_promotion_phone(phone_key text, p_user uuid) returns void
language plpgsql security definer set search_path=public as $$
declare p public.complex_promotions; r public.promotion_rewards; offset_cycle integer;
begin
  if phone_key is null or p_user is null then return; end if;
  if exists(select 1 from public.promotion_phone_accounts where phone = phone_key or user_id = p_user) then
    return;
  end if;
  insert into public.promotion_phone_accounts(phone, user_id) values (phone_key, p_user)
  on conflict do nothing;
  if not found then return; end if;

  update public.promotion_booking_credits set user_id = p_user
   where phone = phone_key and user_id is null;

  for p in select cp.* from public.complex_promotions cp
            where exists(select 1 from public.promotion_rewards pr
                          where pr.promotion_id = cp.id and pr.recipient_phone = phone_key)
               or (cp.active and now() >= cp.starts_at and now() < cp.ends_at)
  loop
    select coalesce(max(cycle), 0) into offset_cycle
      from public.promotion_rewards where promotion_id = p.id and user_id = p_user;
    for r in select * from public.promotion_rewards
              where promotion_id = p.id and recipient_phone = phone_key and user_id is null
              order by cycle for update
    loop
      offset_cycle := offset_cycle + 1;
      -- Se conserva saldo y vencimiento; no se crea un premio adicional.
      update public.promotion_rewards set user_id = p_user, recipient_phone = null, cycle = offset_cycle
       where id = r.id;
      if r.remaining > 0 and r.expires_at > now() then
        insert into public.notifications(user_id, sender_id, title, message, type, is_read)
        values (p_user, p.created_by, '🎁 Unimos tus reservas por celular',
                p.title || ': ya puedes usar tus horas gratis al reservar en este complejo.', 'booking_status', false);
      end if;
    end loop;
    if p.active and now() >= p.starts_at and now() < p.ends_at then
      perform public.refresh_promotion_awards(p, p_user, null);
    end if;
  end loop;
end $$;

-- ── 3. Trigger de premios con bloqueos por teléfono/usuario ─────────────────
create or replace function public.award_complex_promotion() returns trigger
language plpgsql security definer set search_path=public as $$
declare
  p public.complex_promotions;
  cr public.promotion_booking_credits;
  phone_key text;
  recipient uuid;
  manual boolean;
begin
  phone_key := public.promotion_phone(new.customer_phone);
  manual := coalesce(new.source = 'owner_panel', false);

  if phone_key is not null then perform public.promotion_lock('p:' || phone_key); end if;

  -- En reservas manuales/turnos fijos user_id es el dueño, NO el cliente:
  -- el destinatario sale únicamente del celular vinculado.
  if manual then
    if phone_key is not null then
      select user_id into recipient from public.promotion_phone_accounts where phone = phone_key;
    end if;
  else
    recipient := new.user_id;
  end if;
  if recipient is not null then perform public.promotion_lock('u:' || recipient::text); end if;

  -- Vinculación sin SMS: reserva en línea de una cuenta, pagada y aprobada por el dueño.
  if not manual and new.user_id is not null and phone_key is not null
     and new.status = 'confirmed' and new.payment_status = 'verified'
     and coalesce(new.total_price, 0) > 0
     and new.source is distinct from 'loyalty_reward' then
    perform public.link_promotion_phone(phone_key, new.user_id);
  end if;

  perform public.record_promotion_credit(new);
  select * into cr from public.promotion_booking_credits where booking_id = new.id;
  if not found then return new; end if;

  for p in select cp.* from public.complex_promotions cp
             join public.pitches pi on pi.company_id = cp.company_id
            where pi.id = new.pitch_id and cp.active and now() >= cp.starts_at and now() < cp.ends_at
  loop
    perform public.refresh_promotion_awards(p, cr.user_id, cr.phone);
  end loop;
  return new;
end $$;

-- ── 4. Canje con bloqueo por usuario (antes era global) ─────────────────────
create or replace function public.redeem_complex_reward(p_reward uuid, p_user uuid, p_ids uuid[])
returns setof public.bookings language plpgsql security definer set search_path=public as $$
declare r public.promotion_rewards; p public.complex_promotions; b public.bookings; n integer := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role' or p_user is null then raise exception 'Forbidden'; end if;
  if p_ids is null or cardinality(p_ids) not between 1 and 24 then raise exception 'Invalid booking list'; end if;
  perform 1 from public.bookings where id = any(p_ids) and user_id = p_user order by id for update;
  perform public.promotion_lock('u:' || p_user::text);
  select * into r from public.promotion_rewards where id = p_reward and user_id = p_user for update;
  if not found or r.expires_at <= now() or cardinality(p_ids) > r.remaining then
    raise exception 'Reward unavailable';
  end if;
  select * into p from public.complex_promotions where id = r.promotion_id;
  if public.promotion_count(p, p_user) < r.cycle * p.required_bookings then
    raise exception 'Qualifying bookings were cancelled';
  end if;
  for b in select * from public.bookings where id = any(p_ids) and user_id = p_user order by id loop
    n := n + 1;
    if b.status is distinct from 'draft' or b.expires_at is null or b.expires_at <= now()
       or b.start_time is null or b.end_time is null or b.start_time <= now() or b.start_time >= r.expires_at
       or b.end_time - b.start_time <> interval '1 hour'
       or not (extract(dow from b.start_time at time zone 'America/Bogota')::integer = any(p.weekdays))
       or not exists(select 1 from public.pitches where id = b.pitch_id and company_id = p.company_id)
    then raise exception 'Invalid booking for reward'; end if;
  end loop;
  if n <> cardinality(p_ids) then raise exception 'Invalid booking list'; end if;
  insert into public.promotion_redemptions(booking_id, reward_id) select unnest(p_ids), r.id;
  update public.promotion_rewards set remaining = remaining - n where id = r.id;
  return query update public.bookings
     set status = 'confirmed', payment_status = 'verified', total_price = 0, deposit_amount = 0,
         source = 'loyalty_reward', expires_at = null,
         customer_name = coalesce(customer_name, 'Reserva con regalo')
   where id = any(p_ids) returning *;
end $$;

-- ── 5. Escuelas/campeonatos: cerrar el hueco para rol anon ─────────────────
create or replace function public.guard_complex_content() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if new.pitch_id is not null and not exists(
    select 1 from public.pitches p join public.companies c on c.id = p.company_id
      join public.profiles u on u.id = c.owner_id
     where p.id = new.pitch_id and c.owner_id = new.user_id and u.role = 'owner'
  ) then raise exception 'Only the approved owner can publish complex content'; end if;
  -- Antes solo se validaba para 'authenticated'; ahora cualquier rol distinto al servidor.
  if coalesce(auth.role(), '') <> 'service_role' and new.user_id is distinct from auth.uid()
  then raise exception 'Cannot publish for another user'; end if;
  if TG_OP = 'UPDATE' and new.user_id is distinct from old.user_id
  then raise exception 'Cannot transfer content ownership'; end if;
  return new;
end $$;

-- ── Permisos: nada de esto es invocable desde el navegador ─────────────────
revoke all on function public.promotion_lock(text) from public, anon, authenticated;
revoke all on function public.link_promotion_phone(text, uuid) from public, anon, authenticated;
revoke all on function public.award_complex_promotion() from public, anon, authenticated;
revoke all on function public.redeem_complex_reward(uuid, uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.redeem_complex_reward(uuid, uuid, uuid[]) to service_role;
revoke all on function public.guard_complex_content() from public, anon, authenticated;

commit;

-- Soporte (desvincular un celular mal vinculado), ejecutar en el SQL editor:
-- delete from public.promotion_phone_accounts where phone = '573XXXXXXXXX';
