\set ON_ERROR_STOP on
\ir promotions.sql
alter table auth.users add column phone text, add column phone_confirmed_at timestamptz;
alter table public.bookings add column customer_phone text;
create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create table public.profiles(id uuid primary key,role text);
insert into public.profiles values('00000000-0000-0000-0000-000000000002','owner');
\ir ../migrations/2026-11-19_phone_promotion_counting.sql
\ir ../migrations/2026-11-20_promociones_sin_sms.sql
update complex_promotions set active=false;
insert into auth.users(id) values('00000000-0000-0000-0000-000000000003'),('00000000-0000-0000-0000-000000000004');
insert into complex_promotions(id,company_id,title,required_bookings,gift_hours,redeem_days,weekdays,ends_at,created_by)
values('30000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','Premio por teléfono',3,2,30,array[0,1,2,3,4,5,6],now()+interval '1 day','00000000-0000-0000-0000-000000000002');

-- Manual, invitado y turno fijo: mismo celular, creador no es beneficiario.
insert into bookings(id,pitch_id,user_id,status,payment_status,total_price,source,customer_name,customer_phone) values
('50000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','confirmed','verified',80000,'owner_panel','Ana','3123334455'),
('50000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000001',null,'confirmed','verified',80000,null,'Ana','+57 312 333 4455'),
('50000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','confirmed','verified',80000,'owner_panel','Ana','312-333-4455'),
('50000000-0000-0000-0000-000000000004','20000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','confirmed','verified',80000,'owner_panel','Ana','3133334455'),
('50000000-0000-0000-0000-000000000005','20000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','confirmed','verified',80000,'owner_panel','','3123334455'),
('50000000-0000-0000-0000-000000000006','20000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','confirmed','verified',80000,'owner_panel','Turno Fijo','3123334455'),
('50000000-0000-0000-0000-000000000007','20000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','confirmed','verified',80000,'owner_panel','Ana','');
do $$begin
 if (select count(*) from promotion_booking_credits where phone='573123334455')<>3 then raise exception 'Wrong phone count'; end if;
 if exists(select 1 from promotion_booking_credits where booking_id::text like '5000%' and user_id='00000000-0000-0000-0000-000000000002') then raise exception 'Owner received customer credit'; end if;
 if (select count(*) from promotion_rewards where recipient_phone='573123334455' and user_id is null)<>1 then raise exception 'Missing guest reward'; end if;
 if exists(select 1 from promotion_rewards where recipient_phone='573133334455') then raise exception 'Matched by name'; end if;
 if public.promotion_phone('invalid3123334455') is not null then raise exception 'Invalid phone accepted'; end if;
end$$;

-- ── Vinculación sin SMS ─────────────────────────────────────────────────────
-- Una reserva en línea aún no aprobada NO vincula el celular.
insert into bookings(id,pitch_id,user_id,status,payment_status,total_price,customer_name,customer_phone)
values('50000000-0000-0000-0000-000000000008','20000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000003','pending','submitted',80000,'Ana','3123334455');
do $$begin
 if exists(select 1 from promotion_phone_accounts) then raise exception 'Linked before owner approval'; end if;
end$$;
-- El dueño la aprueba: el celular queda unido a la cuenta y el conteo se combina.
update bookings set status='confirmed',payment_status='verified' where id='50000000-0000-0000-0000-000000000008';
do $$declare p complex_promotions;begin
 select * into p from complex_promotions where id='30000000-0000-0000-0000-000000000002';
 if (select user_id from promotion_phone_accounts where phone='573123334455') is distinct from '00000000-0000-0000-0000-000000000003' then raise exception 'Phone not linked after approval'; end if;
 if promotion_count(p,'00000000-0000-0000-0000-000000000003')<>4 then raise exception 'Account and phone were not combined'; end if;
 if (select count(*) from promotion_rewards where promotion_id=p.id and user_id='00000000-0000-0000-0000-000000000003')<>1 then raise exception 'Link duplicated gifts'; end if;
 if exists(select 1 from promotion_rewards where recipient_phone='573123334455') then raise exception 'Phone reward not transferred'; end if;
end$$;
-- Una cuenta solo vincula un celular; otra cuenta no puede robar un celular ya vinculado.
insert into bookings(id,pitch_id,user_id,status,payment_status,total_price,customer_name,customer_phone) values
('50000000-0000-0000-0000-000000000009','20000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000003','confirmed','verified',80000,'Ana','3133334455'),
('50000000-0000-0000-0000-000000000010','20000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000004','confirmed','verified',80000,'Ana','3123334455'),
-- Una reserva sin valor no vincula.
('50000000-0000-0000-0000-000000000012','20000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000004','confirmed','verified',0,'Luis','3153334455');
do $$begin
 if (select count(*) from promotion_phone_accounts where user_id='00000000-0000-0000-0000-000000000003')<>1 then raise exception 'Account linked two phones'; end if;
 if (select user_id from promotion_phone_accounts where phone='573123334455')<>'00000000-0000-0000-0000-000000000003' then raise exception 'Linked phone stolen'; end if;
 if exists(select 1 from promotion_phone_accounts where phone='573153334455') then raise exception 'Free booking linked a phone'; end if;
end$$;
-- Una reserva manual con el celular vinculado suma directamente a la cuenta.
insert into bookings(id,pitch_id,user_id,status,payment_status,total_price,source,customer_name,customer_phone)
values('50000000-0000-0000-0000-000000000013','20000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','confirmed','verified',80000,'owner_panel','Ana','312 333 4455');
do $$begin
 if (select user_id from promotion_booking_credits where booking_id='50000000-0000-0000-0000-000000000013') is distinct from '00000000-0000-0000-0000-000000000003' then raise exception 'Manual booking not credited to linked account'; end if;
 if (select count(*) from promotion_rewards where promotion_id='30000000-0000-0000-0000-000000000002' and user_id='00000000-0000-0000-0000-000000000003')<>2 then raise exception 'Wrong combined cycle count'; end if;
end$$;

-- Canje y doble canje.
insert into bookings(id,pitch_id,user_id,status,start_time,end_time,expires_at) values
('50000000-0000-0000-0000-000000000011','20000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000003','draft',now()+interval '1 day',now()+interval '25 hours',now()+interval '5 minutes');
do $$declare rid uuid;begin
 select id into rid from promotion_rewards where user_id='00000000-0000-0000-0000-000000000003' and cycle=2;
 perform redeem_complex_reward(rid,'00000000-0000-0000-0000-000000000003',array['50000000-0000-0000-0000-000000000011'::uuid]);
 begin
  perform redeem_complex_reward(rid,'00000000-0000-0000-0000-000000000003',array['50000000-0000-0000-0000-000000000011'::uuid]);
  raise exception 'Double redeem' using errcode='XX001';
 exception when raise_exception then null; end;
 if exists(select 1 from promotion_booking_credits where booking_id='50000000-0000-0000-0000-000000000011') then raise exception 'Gift generated credit'; end if;
end$$;

-- Publicar una promoción ya no envía notificaciones masivas; el SMS ya no existe.
update complex_promotions set active=false;
create temp table notif_before as select count(*) n from notifications;
insert into complex_promotions(company_id,title,required_bookings,gift_hours,redeem_days,weekdays,ends_at,created_by)
values('10000000-0000-0000-0000-000000000001','Nueva',5,1,30,array[0],now()+interval '1 day','00000000-0000-0000-0000-000000000002');
do $$begin
 if (select count(*) from notifications)<>(select n from notif_before) then raise exception 'Mass promotion notification sent'; end if;
 if to_regprocedure('public.claim_phone_promotions(uuid)') is not null then raise exception 'SMS claim still exists'; end if;
 if has_function_privilege('authenticated','public.link_promotion_phone(text,uuid)','EXECUTE') then raise exception 'Public link RPC'; end if;
 if has_table_privilege('anon','public.promotion_booking_credits','SELECT') then raise exception 'Phone credits are public'; end if;
end$$;

-- Una política permisiva heredada no autoriza al jugador a aprobar ni fabricar reservas.
grant usage on schema auth to authenticated;
grant select on bookings,pitches,companies,profiles to authenticated;
grant insert,update on bookings to authenticated;
create policy legacy_permissive on bookings for all to authenticated using(true) with check(true);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',false);
select set_config('request.jwt.claim.role','authenticated',false);
set role authenticated;
do $$declare changed integer;begin
 update public.bookings set status='confirmed';
 get diagnostics changed=row_count;
 if changed<>0 then raise exception 'Player can forge approval'; end if;
 begin
  insert into bookings(id,status,payment_status) values(gen_random_uuid(),'confirmed','verified');
  raise exception 'Player can insert paid booking' using errcode='XX001';
 exception when insufficient_privilege then null;end;
end$$;
reset role;
select 'Phone counting without SMS, approval-based linking, theft protection, redemption and RLS passed' as result;
