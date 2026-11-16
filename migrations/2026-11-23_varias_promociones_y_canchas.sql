-- =============================================================================
-- Varias promociones activas por complejo y canchas donde se puede canjear.
-- Ejecutar DESPUÉS de 2026-11-22_aviso_dueno_aprobado.sql
-- =============================================================================
begin;

-- ── 1. Se permiten varias promociones activas (máximo 10 por complejo) ──────
drop index if exists public.one_active_complex_promotion;

-- Canchas donde se puede USAR el regalo. NULL = cualquier cancha del complejo.
-- (Las reservas siguen contando en cualquier cancha del complejo.)
alter table public.complex_promotions add column if not exists redeem_pitch_ids uuid[];
alter table public.complex_promotions drop constraint if exists complex_promotions_redeem_pitches_len;
alter table public.complex_promotions add constraint complex_promotions_redeem_pitches_len
  check (redeem_pitch_ids is null or cardinality(redeem_pitch_ids) between 1 and 50);

-- ── 2. Guardia: solo el dueño aprobado, canchas propias, condiciones inmutables
create or replace function public.guard_complex_promotion() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if not exists(
    select 1 from public.companies c join public.profiles u on u.id = c.owner_id
     where c.id = new.company_id and c.owner_id = new.created_by and u.role = 'owner'
  ) then raise exception 'Only the approved owner can create promotions'; end if;
  if coalesce(auth.role(), '') <> 'service_role' and new.created_by is distinct from auth.uid() then
    raise exception 'Cannot create promotions for another user';
  end if;
  if new.image_url is not null and not (
       new.image_url ~ ('^(https://[A-Za-z0-9.-]+(/storage/v1/object/public/pitch-images)?|/api/media)/promotions/'
                        || new.created_by::text || '/[0-9]+_[a-z0-9]+\.webp$')
  ) then raise exception 'Invalid promotion image'; end if;
  -- Todas las canchas elegidas deben pertenecer a ESTE complejo.
  if new.redeem_pitch_ids is not null and exists(
       select 1 from unnest(new.redeem_pitch_ids) x
        where x is null or not exists(select 1 from public.pitches pi where pi.id = x and pi.company_id = new.company_id)
  ) then raise exception 'Invalid redeem pitch'; end if;

  if TG_OP = 'INSERT' then
    perform public.promotion_lock('c:' || new.company_id::text);
    if (select count(*) from public.complex_promotions
         where company_id = new.company_id and active and ends_at > now()) >= 10 then
      raise exception 'Too many active promotions';
    end if;
  end if;

  if TG_OP = 'UPDATE' then
    if (new.company_id, new.created_by, new.title, new.required_bookings, new.gift_hours, new.redeem_days,
        new.weekdays, new.starts_at, new.ends_at, new.period, new.image_url, new.redeem_pitch_ids)
       is distinct from
       (old.company_id, old.created_by, old.title, old.required_bookings, old.gift_hours, old.redeem_days,
        old.weekdays, old.starts_at, old.ends_at, old.period, old.image_url, old.redeem_pitch_ids)
    then raise exception 'Published promotion conditions are immutable'; end if;
    if new.active and not old.active then raise exception 'A finished promotion cannot be reactivated'; end if;
  end if;
  return new;
end $$;

-- ── 3. Canje: además valida la cancha elegida por el dueño ──────────────────
create or replace function public.redeem_complex_reward(p_reward uuid, p_user uuid, p_ids uuid[])
returns setof public.bookings language plpgsql security definer set search_path=public as $$
declare r public.promotion_rewards; p public.complex_promotions; b public.bookings; n integer := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role' or p_user is null then raise exception 'PROMO_FORBIDDEN'; end if;
  if p_ids is null or cardinality(p_ids) not between 1 and 24 then raise exception 'PROMO_BOOKING_LIST'; end if;
  perform 1 from public.bookings where id = any(p_ids) and user_id = p_user order by id for update;
  perform public.promotion_lock('u:' || p_user::text);
  select * into r from public.promotion_rewards where id = p_reward and user_id = p_user for update;
  if not found then raise exception 'PROMO_REWARD_NOT_FOUND'; end if;
  if r.expires_at <= now() or r.remaining <= 0 then raise exception 'PROMO_REWARD_EXPIRED'; end if;
  if cardinality(p_ids) > r.remaining then raise exception 'PROMO_NOT_ENOUGH_HOURS'; end if;
  select * into p from public.complex_promotions where id = r.promotion_id;
  if public.promotion_holder_count(p, p_user, null, r.period_start) < r.cycle * p.required_bookings then
    raise exception 'PROMO_QUALIFYING_CANCELLED';
  end if;
  for b in select * from public.bookings where id = any(p_ids) and user_id = p_user order by id loop
    n := n + 1;
    if b.status is distinct from 'draft' or b.expires_at is null or b.expires_at <= now() then
      raise exception 'PROMO_LOCK_EXPIRED'; end if;
    if b.start_time is null or b.end_time is null or b.start_time <= now() then
      raise exception 'PROMO_PAST_SLOT'; end if;
    if b.start_time >= r.expires_at then raise exception 'PROMO_AFTER_EXPIRY'; end if;
    if b.end_time - b.start_time <> interval '1 hour' then raise exception 'PROMO_SLOT_LENGTH'; end if;
    if not (extract(dow from b.start_time at time zone 'America/Bogota')::integer = any(p.weekdays)) then
      raise exception 'PROMO_WEEKDAY'; end if;
    if not exists(select 1 from public.pitches where id = b.pitch_id and company_id = p.company_id) then
      raise exception 'PROMO_OTHER_COMPLEX'; end if;
    if p.redeem_pitch_ids is not null and not (b.pitch_id = any(p.redeem_pitch_ids)) then
      raise exception 'PROMO_PITCH'; end if;
  end loop;
  if n <> cardinality(p_ids) then raise exception 'PROMO_BOOKING_LIST'; end if;
  delete from public.promotion_redemptions where booking_id = any(p_ids);
  insert into public.promotion_redemptions(booking_id, reward_id) select unnest(p_ids), r.id;
  update public.promotion_rewards set remaining = remaining - n where id = r.id;
  return query update public.bookings
     set status = 'confirmed', payment_status = 'verified', total_price = 0, deposit_amount = 0,
         source = 'loyalty_reward', expires_at = null,
         customer_name = coalesce(customer_name, 'Reserva con regalo')
   where id = any(p_ids) returning *;
end $$;

revoke all on function public.guard_complex_promotion() from public, anon, authenticated;
revoke all on function public.redeem_complex_reward(uuid, uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.redeem_complex_reward(uuid, uuid, uuid[]) to service_role;

commit;
