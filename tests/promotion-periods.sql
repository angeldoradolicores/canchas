\set ON_ERROR_STOP on
-- Base: fixture + migraciones 18, 19 y 20 (vía el test de conteo por celular).
\ir promotion-phone-counting.sql
reset role;
select set_config('request.jwt.claim.role','service_role',false);
\ir ../migrations/2026-11-21_promociones_por_periodo.sql

update complex_promotions set active=false;
insert into auth.users(id) values('00000000-0000-0000-0000-000000000005'),('00000000-0000-0000-0000-000000000006');
insert into profiles values('00000000-0000-0000-0000-000000000006','player');

-- ── Solo el dueño aprobado crea promociones ────────────────────────────────
do $$begin
 begin
  insert into complex_promotions(company_id,title,required_bookings,gift_hours,weekdays,ends_at,created_by,period)
  values('10000000-0000-0000-0000-000000000001','Falsa',1,5,array[0],now()+interval '30 days','00000000-0000-0000-0000-000000000006','week');
  raise exception 'Non-owner created promotion' using errcode='XX001';
 exception when raise_exception then
  if sqlerrm not like 'Only the approved owner%' then raise; end if;
 end;
 begin
  insert into complex_promotions(company_id,title,required_bookings,gift_hours,weekdays,ends_at,created_by,period,image_url)
  values('10000000-0000-0000-0000-000000000001','Imagen mala',1,1,array[0],now()+interval '30 days','00000000-0000-0000-0000-000000000002','week','https://evil.com/x.svg');
  raise exception 'Bad image accepted' using errcode='XX001';
 exception when raise_exception then
  if sqlerrm not like 'Invalid promotion image%' then raise; end if;
 end;
end$$;

-- Semanal: 2 reservas en la semana -> 1 hora gratis, válida hasta el fin de esa semana, solo sáb/dom.
insert into complex_promotions(id,company_id,title,required_bookings,gift_hours,redeem_days,weekdays,ends_at,created_by,period,image_url)
values('30000000-0000-0000-0000-000000000009','10000000-0000-0000-0000-000000000001','Semana feliz',2,1,null,array[0,6],now()+interval '60 days',
 '00000000-0000-0000-0000-000000000002','week',
 'https://cdn.example.com/promotions/00000000-0000-0000-0000-000000000002/1731800000_abc123.webp');

do $$begin
 begin
  update complex_promotions set gift_hours=10 where id='30000000-0000-0000-0000-000000000009';
  raise exception 'Conditions edited' using errcode='XX001';
 exception when raise_exception then
  if sqlerrm not like 'Published promotion conditions%' then raise; end if;
 end;
end$$;

-- Dos reservas pagadas el próximo lunes y martes (misma semana).
create temp table wk as select (date_trunc('week', (now() at time zone 'America/Bogota')) + interval '7 days')::timestamp as monday;
insert into bookings(id,pitch_id,user_id,status,payment_status,total_price,customer_name,start_time,end_time)
select ('60000000-0000-0000-0000-00000000000'||i)::uuid, '20000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000005',
 'confirmed','verified',80000,'Leo',
 ((select monday from wk) + (i-1)*interval '1 day' + interval '18 hours') at time zone 'America/Bogota',
 ((select monday from wk) + (i-1)*interval '1 day' + interval '19 hours') at time zone 'America/Bogota'
from generate_series(1,2) i;
do $$declare r promotion_rewards;begin
 select * into r from promotion_rewards where user_id='00000000-0000-0000-0000-000000000005';
 if not found then raise exception 'Weekly reward missing'; end if;
 if r.period_start <> (select monday::date from wk) then raise exception 'Wrong period %', r.period_start; end if;
 if r.expires_at <> (((select monday from wk) + interval '7 days') at time zone 'America/Bogota') then raise exception 'Reward must expire at week end'; end if;
 if r.celebrated_at is not null then raise exception 'New reward must be pending celebration'; end if;
 if not exists(select 1 from notifications where user_id='00000000-0000-0000-0000-000000000005' and title like '%Ganaste un bono%') then raise exception 'Special notification missing'; end if;
end$$;
-- Una tercera reserva en OTRA semana no suma a la anterior.
insert into bookings(id,pitch_id,user_id,status,payment_status,total_price,customer_name,start_time,end_time)
values('60000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000005','confirmed','verified',80000,'Leo',
 ((select monday from wk) + interval '8 days 18 hours') at time zone 'America/Bogota',
 ((select monday from wk) + interval '8 days 19 hours') at time zone 'America/Bogota');
do $$begin
 if (select count(*) from promotion_rewards where user_id='00000000-0000-0000-0000-000000000005')<>1 then raise exception 'Weeks were mixed'; end if;
end$$;

-- Canje: un martes (día no permitido) da error específico; el sábado funciona.
insert into bookings(id,pitch_id,user_id,status,start_time,end_time,expires_at) values
('60000000-0000-0000-0000-000000000010','20000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000005','draft',
 ((select monday from wk) + interval '1 day 20 hours') at time zone 'America/Bogota',
 ((select monday from wk) + interval '1 day 21 hours') at time zone 'America/Bogota', now()+interval '5 minutes'),
('60000000-0000-0000-0000-000000000011','20000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000005','draft',
 ((select monday from wk) + interval '5 days 20 hours') at time zone 'America/Bogota',
 ((select monday from wk) + interval '5 days 21 hours') at time zone 'America/Bogota', now()+interval '5 minutes'),
('60000000-0000-0000-0000-000000000012','20000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000005','draft',
 ((select monday from wk) + interval '5 days 21 hours') at time zone 'America/Bogota',
 ((select monday from wk) + interval '5 days 22 hours') at time zone 'America/Bogota', now()+interval '5 minutes');
do $$declare rid uuid;begin
 select id into rid from promotion_rewards where user_id='00000000-0000-0000-0000-000000000005';
 begin
  perform redeem_complex_reward(rid,'00000000-0000-0000-0000-000000000005',array['60000000-0000-0000-0000-000000000010'::uuid]);
  raise exception 'Weekday not enforced' using errcode='XX001';
 exception when raise_exception then if sqlerrm<>'PROMO_WEEKDAY' then raise; end if; end;
 begin
  perform redeem_complex_reward(rid,'00000000-0000-0000-0000-000000000005',array['60000000-0000-0000-0000-000000000011'::uuid,'60000000-0000-0000-0000-000000000012'::uuid]);
  raise exception 'Hours not enforced' using errcode='XX001';
 exception when raise_exception then if sqlerrm<>'PROMO_NOT_ENOUGH_HOURS' then raise; end if; end;
 begin
  perform redeem_complex_reward(rid,'00000000-0000-0000-0000-000000000006',array['60000000-0000-0000-0000-000000000011'::uuid]);
  raise exception 'Other user redeemed' using errcode='XX001';
 exception when raise_exception then if sqlerrm<>'PROMO_REWARD_NOT_FOUND' then raise; end if; end;
 perform redeem_complex_reward(rid,'00000000-0000-0000-0000-000000000005',array['60000000-0000-0000-0000-000000000011'::uuid]);
 if (select remaining from promotion_rewards where id=rid)<>0 then raise exception 'Hours not deducted'; end if;
end$$;

-- Cancelar la reserva canjeada devuelve la hora y libera la fila para reutilizarla.
update bookings set status='cancelled' where id='60000000-0000-0000-0000-000000000011';
do $$begin
 if (select remaining from promotion_rewards where user_id='00000000-0000-0000-0000-000000000005')<>1 then raise exception 'Hour not refunded'; end if;
 if exists(select 1 from promotion_redemptions where booking_id='60000000-0000-0000-0000-000000000011') then raise exception 'Stale redemption kept'; end if;
end$$;
update bookings set status='draft',source=null,expires_at=now()+interval '5 minutes' where id='60000000-0000-0000-0000-000000000011';
do $$declare rid uuid;begin
 select id into rid from promotion_rewards where user_id='00000000-0000-0000-0000-000000000005';
 perform redeem_complex_reward(rid,'00000000-0000-0000-0000-000000000005',array['60000000-0000-0000-0000-000000000011'::uuid]);
end$$;

-- Cancelar una reserva que calificaba invalida el canje del bono.
update bookings set status='cancelled' where id='60000000-0000-0000-0000-000000000011';
update bookings set status='cancelled' where id='60000000-0000-0000-0000-000000000001';
update bookings set status='draft',source=null,expires_at=now()+interval '5 minutes' where id='60000000-0000-0000-0000-000000000011';
do $$declare rid uuid;begin
 select id into rid from promotion_rewards where user_id='00000000-0000-0000-0000-000000000005';
 begin
  perform redeem_complex_reward(rid,'00000000-0000-0000-0000-000000000005',array['60000000-0000-0000-0000-000000000011'::uuid]);
  raise exception 'Cancelled qualifying booking still redeemable' using errcode='XX001';
 exception when raise_exception then if sqlerrm<>'PROMO_QUALIFYING_CANCELLED' then raise; end if; end;
end$$;

-- Nada de esto es accesible desde el navegador.
do $$begin
 if has_function_privilege('authenticated','public.redeem_complex_reward(uuid,uuid,uuid[])','EXECUTE') then raise exception 'Public redeem'; end if;
 if has_function_privilege('authenticated','public.refresh_promotion_awards(public.complex_promotions,uuid,text,date)','EXECUTE') then raise exception 'Public refresh'; end if;
 if has_table_privilege('authenticated','public.complex_promotions','INSERT') then raise exception 'Browser can insert promotions'; end if;
 if has_table_privilege('authenticated','public.promotion_rewards','UPDATE') then raise exception 'Browser can edit rewards'; end if;
end$$;
select 'Owner-only promotions, image validation, weekly periods, weekday/hour checks, refunds and specific errors passed' as result;
