\set ON_ERROR_STOP on
-- Base: todo lo anterior (migraciones 18-21 + sus pruebas).
\ir promotion-periods.sql
reset role;
select set_config('request.jwt.claim.role','service_role',false);
\ir ../migrations/2026-11-23_varias_promociones_y_canchas.sql

-- Segunda cancha del complejo y una cancha de OTRO complejo.
insert into companies(id,owner_id) values('10000000-0000-0000-0000-000000000009','00000000-0000-0000-0000-000000000006');
insert into pitches values('20000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001'),
                          ('20000000-0000-0000-0000-000000000009','10000000-0000-0000-0000-000000000009');

-- ── Varias promociones activas a la vez ────────────────────────────────────
insert into complex_promotions(id,company_id,title,required_bookings,gift_hours,weekdays,ends_at,created_by,period,redeem_pitch_ids)
values('30000000-0000-0000-0000-000000000021','10000000-0000-0000-0000-000000000001','Solo cancha 2',2,1,array[0,1,2,3,4,5,6],now()+interval '60 days',
 '00000000-0000-0000-0000-000000000002','week',array['20000000-0000-0000-0000-000000000002'::uuid]);
do $$begin
 if (select count(*) from complex_promotions where company_id='10000000-0000-0000-0000-000000000001' and active)<2 then
  raise exception 'Multiple active promotions not allowed'; end if;
 -- Cancha de otro complejo: rechazada.
 begin
  insert into complex_promotions(company_id,title,required_bookings,gift_hours,weekdays,ends_at,created_by,period,redeem_pitch_ids)
  values('10000000-0000-0000-0000-000000000001','Cancha ajena',1,1,array[0],now()+interval '30 days','00000000-0000-0000-0000-000000000002','week',
   array['20000000-0000-0000-0000-000000000009'::uuid]);
  raise exception 'Foreign pitch accepted' using errcode='XX001';
 exception when raise_exception then if sqlerrm not like 'Invalid redeem pitch%' then raise; end if; end;
 -- Las canchas elegidas no se pueden cambiar después de publicar.
 begin
  update complex_promotions set redeem_pitch_ids=null where id='30000000-0000-0000-0000-000000000021';
  raise exception 'Pitches edited' using errcode='XX001';
 exception when raise_exception then if sqlerrm not like 'Published promotion conditions%' then raise; end if; end;
end$$;
-- Límite de 10 activas por complejo.
do $$declare i int;begin
 for i in 1..20 loop
  begin
   insert into complex_promotions(company_id,title,required_bookings,gift_hours,weekdays,ends_at,created_by,period)
   values('10000000-0000-0000-0000-000000000001','Extra '||i,5,1,array[0],now()+interval '30 days','00000000-0000-0000-0000-000000000002','week');
  exception when raise_exception then
   if sqlerrm not like 'Too many active promotions%' then raise; end if;
   exit;
  end;
 end loop;
 if (select count(*) from complex_promotions where company_id='10000000-0000-0000-0000-000000000001' and active and ends_at>now())<>10 then
  raise exception 'Active promotion limit not enforced'; end if;
end$$;

-- ── Canje solo en la cancha elegida ────────────────────────────────────────
insert into auth.users(id) values('00000000-0000-0000-0000-000000000007');
insert into bookings(id,pitch_id,user_id,status,payment_status,total_price,customer_name,start_time,end_time)
select ('70000000-0000-0000-0000-00000000000'||i)::uuid, '20000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000007',
 'confirmed','verified',80000,'Ana',
 ((select monday from wk) + (i-1)*interval '1 day' + interval '7 hours') at time zone 'America/Bogota',
 ((select monday from wk) + (i-1)*interval '1 day' + interval '8 hours') at time zone 'America/Bogota'
from generate_series(1,2) i;
insert into bookings(id,pitch_id,user_id,status,start_time,end_time,expires_at) values
('70000000-0000-0000-0000-000000000010','20000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000007','draft',
 ((select monday from wk) + interval '2 days 9 hours') at time zone 'America/Bogota',
 ((select monday from wk) + interval '2 days 10 hours') at time zone 'America/Bogota', now()+interval '5 minutes'),
('70000000-0000-0000-0000-000000000011','20000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000007','draft',
 ((select monday from wk) + interval '2 days 9 hours') at time zone 'America/Bogota',
 ((select monday from wk) + interval '2 days 10 hours') at time zone 'America/Bogota', now()+interval '5 minutes');
do $$declare rid uuid;begin
 select id into rid from promotion_rewards where user_id='00000000-0000-0000-0000-000000000007'
   and promotion_id='30000000-0000-0000-0000-000000000021';
 if rid is null then raise exception 'Reward for pitch-limited promotion missing'; end if;
 begin
  perform redeem_complex_reward(rid,'00000000-0000-0000-0000-000000000007',array['70000000-0000-0000-0000-000000000010'::uuid]);
  raise exception 'Pitch restriction not enforced' using errcode='XX001';
 exception when raise_exception then if sqlerrm<>'PROMO_PITCH' then raise; end if; end;
 perform redeem_complex_reward(rid,'00000000-0000-0000-0000-000000000007',array['70000000-0000-0000-0000-000000000011'::uuid]);
 if (select remaining from promotion_rewards where id=rid)<>0 then raise exception 'Hour not deducted'; end if;
end$$;
select 'Multiple promotions, active limit, owner-chosen redeem pitches passed' as result;
