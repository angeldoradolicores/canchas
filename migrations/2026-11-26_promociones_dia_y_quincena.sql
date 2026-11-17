-- =============================================================================
-- Más formas de contar las reservas en las promociones del complejo:
--   day    → en el mismo día (ej.: 2 horas el mismo día = 1 hora gratis)
--   biweek → cada quincena (del 1 al 15 y del 16 al fin de mes)
-- Se suman a week, month y campaign. Ejecutar DESPUÉS de 2026-11-25.
-- =============================================================================
begin;

alter table public.complex_promotions drop constraint if exists complex_promotions_period_check;
alter table public.complex_promotions add constraint complex_promotions_period_check
  check (period in ('day', 'week', 'biweek', 'month', 'campaign'));

create or replace function public.promo_period_start(p public.complex_promotions, ts timestamptz) returns date
language sql stable set search_path=public as $$
  select case p.period
    when 'day'    then (ts at time zone 'America/Bogota')::date
    when 'week'   then date_trunc('week',  ts at time zone 'America/Bogota')::date
    when 'biweek' then case when extract(day from ts at time zone 'America/Bogota') <= 15
                            then date_trunc('month', ts at time zone 'America/Bogota')::date
                            else date_trunc('month', ts at time zone 'America/Bogota')::date + 15 end
    when 'month'  then date_trunc('month', ts at time zone 'America/Bogota')::date
    else (p.starts_at at time zone 'America/Bogota')::date end;
$$;

create or replace function public.promo_period_end(p public.complex_promotions, ps date) returns timestamptz
language sql stable set search_path=public as $$
  select case p.period
    when 'day'    then (ps + 1)::timestamp at time zone 'America/Bogota'
    when 'week'   then (ps + 7)::timestamp at time zone 'America/Bogota'
    when 'biweek' then case when extract(day from ps) = 1
                            then (ps + 15)::timestamp at time zone 'America/Bogota'
                            else (date_trunc('month', ps) + interval '1 month')::timestamp at time zone 'America/Bogota' end
    when 'month'  then (ps + interval '1 month')::timestamp at time zone 'America/Bogota'
    else p.ends_at end;
$$;

revoke all on function public.promo_period_start(public.complex_promotions, timestamptz) from public, anon, authenticated;
revoke all on function public.promo_period_end(public.complex_promotions, date) from public, anon, authenticated;

commit;
