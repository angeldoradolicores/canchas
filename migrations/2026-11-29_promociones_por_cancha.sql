-- =============================================================================
-- PROMOCIONES POR CANCHA
--
-- Antes: las reservas contaban en CUALQUIER cancha del complejo y solo se elegía
-- dónde canjear el regalo (redeem_pitch_ids).
-- Ahora: el dueño elige la cancha de la promoción y SOLO cuentan las reservas en
-- esa(s) cancha(s). Ej.: "reserva 2 veces en la Cancha 1 y gana 1 hora gratis en
-- la Cancha 1". Reservar en la Cancha 2 no suma.
--
-- count_pitch_ids NULL = cuentan todas las canchas (promociones ya publicadas no
-- cambian sus condiciones).
--
-- Ejecutar DESPUÉS de 2026-11-28.
-- =============================================================================
begin;

alter table public.complex_promotions add column if not exists count_pitch_ids uuid[];
alter table public.complex_promotions drop constraint if exists complex_promotions_count_pitches_len;
alter table public.complex_promotions add constraint complex_promotions_count_pitches_len
  check (count_pitch_ids is null or cardinality(count_pitch_ids) between 1 and 50);

-- Guardia: igual a la de 2026-11-23 + valida count_pitch_ids y lo vuelve inmutable.
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
  if new.redeem_pitch_ids is not null and exists(
       select 1 from unnest(new.redeem_pitch_ids) x
        where x is null or not exists(select 1 from public.pitches pi where pi.id = x and pi.company_id = new.company_id)
  ) then raise exception 'Invalid redeem pitch'; end if;
  if new.count_pitch_ids is not null and exists(
       select 1 from unnest(new.count_pitch_ids) x
        where x is null or not exists(select 1 from public.pitches pi where pi.id = x and pi.company_id = new.company_id)
  ) then raise exception 'Invalid count pitch'; end if;

  if TG_OP = 'INSERT' then
    perform public.promotion_lock('c:' || new.company_id::text);
    if (select count(*) from public.complex_promotions
         where company_id = new.company_id and active and ends_at > now()) >= 10 then
      raise exception 'Too many active promotions';
    end if;
  end if;

  if TG_OP = 'UPDATE' then
    if (new.company_id, new.created_by, new.title, new.required_bookings, new.gift_hours, new.redeem_days,
        new.weekdays, new.starts_at, new.ends_at, new.period, new.image_url, new.redeem_pitch_ids, new.count_pitch_ids)
       is distinct from
       (old.company_id, old.created_by, old.title, old.required_bookings, old.gift_hours, old.redeem_days,
        old.weekdays, old.starts_at, old.ends_at, old.period, old.image_url, old.redeem_pitch_ids, old.count_pitch_ids)
    then raise exception 'Published promotion conditions are immutable'; end if;
    if new.active and not old.active then raise exception 'A finished promotion cannot be reactivated'; end if;
  end if;
  return new;
end $$;

-- Conteo: igual al de 2026-11-21 + solo reservas en las canchas de la promoción.
create or replace function public.promotion_holder_count(p public.complex_promotions, u uuid, phone_key text, ps date)
returns bigint language sql stable security definer set search_path=public as $$
  select count(*) from public.promotion_booking_credits cr
    join public.bookings b on b.id = cr.booking_id
    join public.pitches pi on pi.id = b.pitch_id
   where pi.company_id = p.company_id
     and (p.count_pitch_ids is null or b.pitch_id = any(p.count_pitch_ids))
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

revoke all on function public.guard_complex_promotion() from public, anon, authenticated;
revoke all on function public.promotion_holder_count(public.complex_promotions, uuid, text, date) from public, anon, authenticated;

commit;
