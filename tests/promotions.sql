\set ON_ERROR_STOP on
do $$begin create role anon;exception when duplicate_object then null;end$$;
do $$begin create role authenticated;exception when duplicate_object then null;end$$;
do $$begin create role service_role;exception when duplicate_object then null;end$$;
create schema auth;
create function auth.role() returns text language sql as $$ select current_setting('request.jwt.claim.role',true) $$;
create table auth.users(id uuid primary key);
create table public.companies(id uuid primary key,owner_id uuid,name text default 'Complejo de prueba');
create table public.notifications(user_id uuid,sender_id uuid,title text,message text,type text,is_read boolean);
create table public.pitches(id uuid primary key,company_id uuid references companies(id));
create table public.bookings(
 id uuid primary key, pitch_id uuid,user_id uuid,status text,payment_status text,source text,
 created_at timestamptz default now(),start_time timestamptz,end_time timestamptz,
 expires_at timestamptz,total_price numeric,deposit_amount numeric,customer_name text
);
\ir ../migrations/2026-11-18_complex_promotions.sql
select set_config('request.jwt.claim.role','service_role',false);
insert into auth.users values('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002');
insert into companies(id,owner_id) values('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002');
insert into pitches values('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001');
insert into complex_promotions(id,company_id,title,required_bookings,gift_hours,redeem_days,weekdays,starts_at,ends_at,created_by)
values('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Premio de prueba',2,1,30,array[0,1,2,3,4,5,6],now()-interval '1 day',now()+interval '1 day','00000000-0000-0000-0000-000000000002');
insert into bookings(id,pitch_id,user_id,status,payment_status,total_price) values
('40000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','confirmed','verified',80000),
('40000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','confirmed','verified',80000);
do $$begin
 if (select count(*) from promotion_rewards)<>1 then raise exception 'Expected one reward'; end if;
end$$;
update bookings set status='confirmed';
do $$begin
 if (select count(*) from promotion_rewards)<>1 then raise exception 'Duplicate award'; end if;
 if (select count(*) from notifications)<>1 then raise exception 'Duplicate notification'; end if;
end$$;
insert into bookings(id,pitch_id,user_id,status,start_time,end_time,expires_at) values
('40000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','draft',now()+interval '1 day',now()+interval '25 hours',now()+interval '5 minutes');
do $$declare rid uuid;begin
 select id into rid from promotion_rewards limit 1;
 begin
  perform redeem_complex_reward(rid,'00000000-0000-0000-0000-000000000002',array['40000000-0000-0000-0000-000000000003'::uuid]);
  raise exception 'Unauthorized redemption succeeded' using errcode='XX001';
 exception when raise_exception then null; end;
 perform redeem_complex_reward(rid,'00000000-0000-0000-0000-000000000001',array['40000000-0000-0000-0000-000000000003'::uuid]);
 if (select remaining from promotion_rewards where id=rid)<>0 then raise exception 'Incorrect debit'; end if;
 begin
  perform redeem_complex_reward(rid,'00000000-0000-0000-0000-000000000001',array['40000000-0000-0000-0000-000000000003'::uuid]);
  raise exception 'Double redemption succeeded' using errcode='XX001';
 exception when raise_exception then null; end;
 if (select count(*) from promotion_rewards)<>1 then raise exception 'Gift counted as paid booking'; end if;
end$$;
select 'Award, idempotency, ownership and single-use redemption passed' as result;
do $$begin
 if has_table_privilege('authenticated','promotion_rewards','UPDATE') then raise exception 'Client can edit rewards'; end if;
 if has_function_privilege('authenticated','public.redeem_complex_reward(uuid,uuid,uuid[])','EXECUTE') then raise exception 'Client can call privileged RPC'; end if;
end$$;
-- Restore unused reward only inside this disposable test database.
update promotion_rewards set remaining=1,expires_at=now()-interval '1 second';
insert into bookings(id,pitch_id,user_id,status,start_time,end_time,expires_at) values
('40000000-0000-0000-0000-000000000004','20000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','draft',now()+interval '2 days',now()+interval '49 hours',now()+interval '5 minutes');
do $$declare rid uuid;begin
 select id into rid from promotion_rewards limit 1;
 begin
  perform redeem_complex_reward(rid,'00000000-0000-0000-0000-000000000001',array['40000000-0000-0000-0000-000000000004'::uuid]);
  raise exception 'Expired reward accepted' using errcode='XX001';
 exception when raise_exception then null;end;
end$$;
update promotion_rewards set expires_at=now()+interval '30 days';
update bookings set status='cancelled' where id='40000000-0000-0000-0000-000000000001';
do $$declare rid uuid;begin
 select id into rid from promotion_rewards limit 1;
 begin
  perform redeem_complex_reward(rid,'00000000-0000-0000-0000-000000000001',array['40000000-0000-0000-0000-000000000004'::uuid]);
  raise exception 'Cancelled qualifying booking counted' using errcode='XX001';
 exception when raise_exception then null;end;
 if (select remaining from promotion_rewards where id=rid)<>1 then raise exception 'Failed redemption spent reward'; end if;
end$$;
select 'Privilege isolation, expiry, cancellation and rollback passed' as result;
