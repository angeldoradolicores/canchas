-- =============================================================================
-- Promociones por periodo (semana / mes / campaña), imagen, bono celebrado,
-- errores de canje específicos, devolución de horas al cancelar y protección
-- en BD para que SOLO el dueño aprobado del complejo cree promociones.
-- Ejecutar DESPUÉS de 2026-11-20_promociones_sin_sms.sql
-- =============================================================================
begin;

-- ── 1. Columnas nuevas ──────────────────────────────────────────────────────
alter table public.complex_promotions
  add column if not exists period text not null default 'campaign',
  add column if not exists image_url text;
alter table public.complex_promotions alter column redeem_days drop not null;
alter table public.complex_promotions drop constraint if exists complex_promotions_period_check;
alter table public.complex_promotions add constraint complex_promotions_period_check
  check (period in ('week', 'month', 'campaign'));
alter table public.complex_promotions drop constraint if exists complex_promotions_campaign_days;
alter table public.complex_promotions add constraint complex_promotions_campaign_days
  check (period <> 'campaign' or redeem_days is not null);
alter table public.complex_promotions drop constraint if exists complex_promotions_image_len;
alter table public.complex_promotions add constraint complex_promotions_image_len
  check (image_url is null or length(image_url) <= 600);

alter table public.promotion_rewards
  add column if not exists period_start date,
  add column if not exists celebrated_at timestamptz;
update public.promotion_rewards r
   set period_start = (p.starts_at at time zone 'America/Bogota')::date
  from public.complex_promotions p
 where p.id = r.promotion_id and r.period_start is null;
-- Los regalos anteriores ya se notificaron: no mostrar la celebración otra vez.
update public.promotion_rewards set celebrated_at = now() where celebrated_at is null;
alter table public.promotion_rewards alter column period_start set not null;

-- Un ciclo por periodo (semana/mes) en vez de uno por toda la promoción.
alter table public.promotion_rewards drop constraint if exists promotion_rewards_promotion_id_user_id_cycle_key;
drop index if exists public.reward_phone_cycle;
create unique index if not exists reward_user_period_cycle
  on public.promotion_rewards(promotion_id, user_id, period_start, cycle) where user_id is not null;
create unique index if not exists reward_phone_period_cycle
  on public.promotion_rewards(promotion_id, recipient_phone, period_start, cycle) where recipient_phone is not null;

-- ── 2. Solo el dueño aprobado crea promociones; condiciones inmutables ─────
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
  if TG_OP = 'UPDATE' then
    if (new.company_id, new.created_by, new.title, new.required_bookings, new.gift_hours, new.redeem_days,
        new.weekdays, new.starts_at, new.ends_at, new.period, new.image_url)
       is distinct from
       (old.company_id, old.created_by, old.title, old.required_bookings, old.gift_hours, old.redeem_days,
        old.weekdays, old.starts_at, old.ends_at, old.period, old.image_url)
    then raise exception 'Published promotion conditions are immutable'; end if;
    if new.active and not old.active then raise exception 'A finished promotion cannot be reactivated'; end if;
  end if;
  return new;
end $$;
drop trigger if exists guard_complex_promotion on public.complex_promotions;
create trigger guard_complex_promotion before insert or update on public.complex_promotions
for each row execute function public.guard_complex_promotion();

-- ── 3. Periodos ─────────────────────────────────────────────────────────────
create or replace function public.promo_period_start(p public.complex_promotions, ts timestamptz) returns date
language sql stable set search_path=public as $$
  select case p.period
    when 'week'  then date_trunc('week',  ts at time zone 'America/Bogota')::date
    when 'month' then date_trunc('month', ts at time zone 'America/Bogota')::date
    else (p.starts_at at time zone 'America/Bogota')::date end;
$$;

create or replace function public.promo_period_end(p public.complex_promotions, ps date) returns timestamptz
language sql stable set search_path=public as $$
  select case p.period
    when 'week'  then (ps + 7)::timestamp at time zone 'America/Bogota'
    when 'month' then (ps + interval '1 month')::timestamp at time zone 'America/Bogota'
    else p.ends_at end;
$$;

-- Reservas que cuentan para un titular (cuenta o celular) en un periodo.
create or replace function public.promotion_holder_count(p public.complex_promotions, u uuid, phone_key text, ps date)
returns bigint language sql stable security definer set search_path=public as $$
  select count(*) from public.promotion_booking_credits cr
    join public.bookings b on b.id = cr.booking_id
    join public.pitches pi on pi.id = b.pitch_id
   where pi.company_id = p.company_id
     and case when u is not null then cr.user_id = u
              else cr.user_id is null and cr.phone = phone_key end
     and b.status = 'confirmed' and b.payment_status = 'verified'
     and coalesce(b.total_price, 0) > 0
     and b.source is distinct from 'loyalty_reward'
     and b.created_at >= p.starts_at and b.created_at < p.ends_at
     and b.start_time is not null
     and public.promo_period_start(p, b.start_time) = ps
     and not exists(select 1 from public.promotion_redemptions r where r.booking_id = b.id);
$$;

drop function if exists public.refresh_promotion_awards(public.complex_promotions, uuid, text);
create or replace function public.refresh_promotion_awards(p public.complex_promotions, recipient uuid, phone_key text, ps date)
returns void language plpgsql security definer set search_path=public as $$
declare amount bigint; tier integer; inserted integer; exp timestamptz;
begin
  if (recipient is null and phone_key is null) or ps is null then return; end if;
  exp := case when p.redeem_days is null then public.promo_period_end(p, ps)
              else now() + make_interval(days => p.redeem_days) end;
  if exp <= now() then return; end if;
  amount := public.promotion_holder_count(p, recipient, phone_key, ps);
  for tier in 1..(amount / p.required_bookings)::integer loop
    insert into public.promotion_rewards(promotion_id, user_id, recipient_phone, period_start, cycle, hours, remaining, expires_at)
    values (p.id, recipient, case when recipient is null then phone_key end, ps, tier, p.gift_hours, p.gift_hours, exp)
    on conflict do nothing;
    get diagnostics inserted = row_count;
    if inserted = 1 and recipient is not null then
      insert into public.notifications(user_id, sender_id, title, message, type, is_read)
      select recipient, c.owner_id, '🎉 ¡Ganaste un bono!',
             'Ganaste ' || p.gift_hours || case when p.gift_hours = 1 then ' hora gratis' else ' horas gratis' end
             || ' en ' || c.name || ' (' || p.title || '). Úsalas al reservar antes del '
             || to_char(exp at time zone 'America/Bogota', 'DD/MM/YYYY') || '.',
             'booking_status', false
        from public.companies c where c.id = p.company_id;
    end if;
  end loop;
end $$;

-- ── 4. Vinculación de celular (sin SMS) por periodo ────────────────────────
create or replace function public.link_promotion_phone(phone_key text, p_user uuid) returns void
language plpgsql security definer set search_path=public as $$
declare r public.promotion_rewards; p public.complex_promotions; offset_cycle integer; ps date;
begin
  if phone_key is null or p_user is null then return; end if;
  if exists(select 1 from public.promotion_phone_accounts where phone = phone_key or user_id = p_user) then return; end if;
  insert into public.promotion_phone_accounts(phone, user_id) values (phone_key, p_user) on conflict do nothing;
  if not found then return; end if;

  update public.promotion_booking_credits set user_id = p_user where phone = phone_key and user_id is null;

  -- Regalos ganados por celular: pasan a la cuenta conservando saldo y vencimiento.
  for r in select * from public.promotion_rewards
            where recipient_phone = phone_key and user_id is null
            order by promotion_id, period_start, cycle for update
  loop
    select coalesce(max(cycle), 0) + 1 into offset_cycle from public.promotion_rewards
     where promotion_id = r.promotion_id and user_id = p_user and period_start = r.period_start;
    update public.promotion_rewards
       set user_id = p_user, recipient_phone = null, cycle = offset_cycle,
           celebrated_at = case when r.remaining > 0 and r.expires_at > now() then null else now() end
     where id = r.id;
  end loop;

  for p in select * from public.complex_promotions where active and now() >= starts_at and now() < ends_at loop
    for ps in select distinct public.promo_period_start(p, b.start_time)
                from public.promotion_booking_credits cr
                join public.bookings b on b.id = cr.booking_id
                join public.pitches pi on pi.id = b.pitch_id
               where cr.user_id = p_user and pi.company_id = p.company_id and b.start_time is not null
    loop
      perform public.refresh_promotion_awards(p, p_user, null, ps);
    end loop;
  end loop;
end $$;

-- ── 5. Trigger de premios ───────────────────────────────────────────────────
create or replace function public.award_complex_promotion() returns trigger
language plpgsql security definer set search_path=public as $$
declare
  p public.complex_promotions; cr public.promotion_booking_credits;
  phone_key text; recipient uuid; manual boolean;
begin
  phone_key := public.promotion_phone(new.customer_phone);
  manual := coalesce(new.source = 'owner_panel', false);
  if phone_key is not null then perform public.promotion_lock('p:' || phone_key); end if;
  if manual then
    if phone_key is not null then
      select user_id into recipient from public.promotion_phone_accounts where phone = phone_key;
    end if;
  else
    recipient := new.user_id;
  end if;
  if recipient is not null then perform public.promotion_lock('u:' || recipient::text); end if;

  if not manual and new.user_id is not null and phone_key is not null
     and new.status = 'confirmed' and new.payment_status = 'verified'
     and coalesce(new.total_price, 0) > 0 and new.source is distinct from 'loyalty_reward' then
    perform public.link_promotion_phone(phone_key, new.user_id);
  end if;

  perform public.record_promotion_credit(new);
  select * into cr from public.promotion_booking_credits where booking_id = new.id;
  if not found or new.start_time is null then return new; end if;

  for p in select cp.* from public.complex_promotions cp join public.pitches pi on pi.company_id = cp.company_id
            where pi.id = new.pitch_id and cp.active and now() >= cp.starts_at and now() < cp.ends_at
  loop
    perform public.refresh_promotion_awards(p, cr.user_id, cr.phone, public.promo_period_start(p, new.start_time));
  end loop;
  return new;
end $$;
drop trigger if exists award_complex_promotion on public.bookings;
create trigger award_complex_promotion
after insert or update of status, payment_status, customer_phone, customer_name, total_price, user_id, source, pitch_id, start_time
on public.bookings for each row execute function public.award_complex_promotion();

-- ── 6. Canje con errores específicos ────────────────────────────────────────
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
  end loop;
  if n <> cardinality(p_ids) then raise exception 'PROMO_BOOKING_LIST'; end if;
  -- Filas reutilizadas de reservas antiguas: limpiar canjes huérfanos.
  delete from public.promotion_redemptions where booking_id = any(p_ids);
  insert into public.promotion_redemptions(booking_id, reward_id) select unnest(p_ids), r.id;
  update public.promotion_rewards set remaining = remaining - n where id = r.id;
  return query update public.bookings
     set status = 'confirmed', payment_status = 'verified', total_price = 0, deposit_amount = 0,
         source = 'loyalty_reward', expires_at = null,
         customer_name = coalesce(customer_name, 'Reserva con regalo')
   where id = any(p_ids) returning *;
end $$;

-- ── 7. Cancelar una reserva canjeada devuelve la hora ───────────────────────
create or replace function public.refund_promotion_redemption() returns trigger
language plpgsql security definer set search_path=public as $$
declare rr public.promotion_redemptions;
begin
  if old.source = 'loyalty_reward' and old.status = 'confirmed'
     and (new.status is distinct from 'confirmed' or new.source is distinct from 'loyalty_reward') then
    delete from public.promotion_redemptions where booking_id = new.id returning * into rr;
    if found then
      update public.promotion_rewards set remaining = least(hours, remaining + 1)
       where id = rr.reward_id and expires_at > now();
    end if;
  end if;
  return new;
end $$;
drop trigger if exists refund_promotion_redemption on public.bookings;
create trigger refund_promotion_redemption after update of status, source on public.bookings
for each row execute function public.refund_promotion_redemption();

-- Limpieza: canjes de reservas que ya no son reservas con regalo.
delete from public.promotion_redemptions pr using public.bookings b
 where b.id = pr.booking_id and (b.source is distinct from 'loyalty_reward' or b.status is distinct from 'confirmed');

drop function if exists public.promotion_count(public.complex_promotions, uuid);

-- ── Permisos ────────────────────────────────────────────────────────────────
revoke all on function public.guard_complex_promotion() from public, anon, authenticated;
revoke all on function public.promo_period_start(public.complex_promotions, timestamptz) from public, anon, authenticated;
revoke all on function public.promo_period_end(public.complex_promotions, date) from public, anon, authenticated;
revoke all on function public.promotion_holder_count(public.complex_promotions, uuid, text, date) from public, anon, authenticated;
revoke all on function public.refresh_promotion_awards(public.complex_promotions, uuid, text, date) from public, anon, authenticated;
revoke all on function public.link_promotion_phone(text, uuid) from public, anon, authenticated;
revoke all on function public.award_complex_promotion() from public, anon, authenticated;
revoke all on function public.refund_promotion_redemption() from public, anon, authenticated;
revoke all on function public.redeem_complex_reward(uuid, uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.redeem_complex_reward(uuid, uuid, uuid[]) to service_role;

commit;
