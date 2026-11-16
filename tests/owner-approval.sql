\set ON_ERROR_STOP on
do $$begin create role anon;exception when duplicate_object then null;end$$;
do $$begin create role authenticated;exception when duplicate_object then null;end$$;
do $$begin create role service_role;exception when duplicate_object then null;end$$;
create schema auth;
create function auth.role() returns text language sql as $$ select current_setting('request.jwt.claim.role',true) $$;
create table auth.users(id uuid primary key, raw_app_meta_data jsonb default '{}');
create table public.profiles(id uuid primary key, full_name text, role text, phone text);
create table public.companies(id uuid primary key default gen_random_uuid(), owner_id uuid, name text, address text, zone text, owner_phone text, whatsapp_status text);
create table public.notifications(user_id uuid,sender_id uuid,title text,message text,type text,is_read boolean);
\ir ../migrations/2026-11-16_owner_approval.sql
\ir ../migrations/2026-11-17_owner_request_history.sql
\ir ../migrations/2026-11-22_aviso_dueno_aprobado.sql

select set_config('request.jwt.claim.role','service_role',false);
insert into auth.users values
 ('00000000-0000-0000-0000-0000000000a1','{"role":"superadmin"}'),
 ('00000000-0000-0000-0000-0000000000b1','{}'),
 ('00000000-0000-0000-0000-0000000000b2','{}');
-- El registro intenta crear perfil de dueño: el trigger lo deja como jugador.
insert into profiles values('00000000-0000-0000-0000-0000000000b1','Ana','owner','3001112233');
select resubmit_owner_request('00000000-0000-0000-0000-0000000000b1',
 '{"full_name":"Ana","company_name":"Complejo Ana","phone":"573001112233","address":"Calle 1 # 2-3","evidence":"Instagram @complejoana"}');
do $$begin
 if (select role from profiles where id='00000000-0000-0000-0000-0000000000b1')<>'player' then raise exception 'Signup became owner'; end if;
 -- Un usuario normal no puede aprobar.
 begin
  perform review_owner_request('00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000b2',true);
  raise exception 'Non-superadmin approved' using errcode='XX001';
 exception when raise_exception then if sqlerrm<>'No autorizado' then raise; end if; end;
end$$;
select review_owner_request('00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000a1',true);
do $$begin
 if (select role from profiles where id='00000000-0000-0000-0000-0000000000b1')<>'owner' then raise exception 'Approval did not grant owner'; end if;
 if not exists(select 1 from companies where owner_id='00000000-0000-0000-0000-0000000000b1' and name='Complejo Ana') then raise exception 'Company not created'; end if;
 if not exists(select 1 from notifications where user_id='00000000-0000-0000-0000-0000000000b1' and title like '%Ya eres dueño%') then raise exception 'Approval notification missing'; end if;
 if (select celebrated_at from owner_requests where user_id='00000000-0000-0000-0000-0000000000b1') is not null then raise exception 'Celebration should be pending'; end if;
 begin
  perform review_owner_request('00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000a1',true);
  raise exception 'Approved twice' using errcode='XX001';
 exception when raise_exception then if sqlerrm<>'Solicitud no pendiente' then raise; end if; end;
end$$;
-- Desde el navegador nadie puede cambiar su rol ni llamar la aprobación.
grant select,update on profiles to authenticated;
select set_config('request.jwt.claim.role','authenticated',false);
set role authenticated;
do $$begin
 begin
  update profiles set role='owner' where id='00000000-0000-0000-0000-0000000000b2';
 exception when raise_exception then null; end;
end$$;
reset role;
do $$begin
 if exists(select 1 from profiles where id='00000000-0000-0000-0000-0000000000b2' and role='owner') then raise exception 'Role escalated'; end if;
 if has_function_privilege('authenticated','public.review_owner_request(uuid,uuid,boolean)','EXECUTE') then raise exception 'Public review RPC'; end if;
 if has_table_privilege('authenticated','public.owner_requests','SELECT') then raise exception 'Requests readable from browser'; end if;
end$$;
select 'Owner approval, superadmin-only review, notification and role protection passed' as result;
