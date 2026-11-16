begin;
create table public.owner_requests (
 user_id uuid primary key references auth.users(id) on delete cascade,
 full_name text not null check(length(full_name) between 2 and 100),
 company_name text not null check(length(company_name) between 2 and 150),
 phone text not null check(phone ~ '^[0-9+]{10,16}$'),
 address text not null check(length(address) between 5 and 300),
 evidence text not null check(length(evidence) between 10 and 2000),
 status text not null default 'pending' check(status in ('pending','approved','rejected')),
 created_at timestamptz not null default now(),
 reviewed_at timestamptz,
 reviewed_by uuid references auth.users(id)
);
alter table public.owner_requests enable row level security;
revoke all on public.owner_requests from anon, authenticated;
grant all on public.owner_requests to service_role;

-- Incluso funciones antiguas SECURITY DEFINER pasan por esta protección.
create or replace function public.protect_profile_role() returns trigger
language plpgsql set search_path = public as $$
begin
 if TG_OP = 'INSERT' then
   new.role := 'player';
 elsif new.role is distinct from old.role then
   if coalesce(auth.role(),'') <> 'service_role' then
     raise exception 'Cambio de rol no autorizado';
   end if;
 end if;
 return new;
end $$;
drop trigger if exists tr_owner_profile_guard on public.profiles;
create trigger tr_owner_profile_guard before insert or update on public.profiles
for each row execute function public.protect_profile_role();

create function public.review_owner_request(p_user uuid, p_reviewer uuid, p_approve boolean)
returns void language plpgsql security definer set search_path = public as $$
declare r public.owner_requests;
begin
 if coalesce(auth.role(),'') <> 'service_role' or not exists(
   select 1 from auth.users where id=p_reviewer and raw_app_meta_data->>'role'='superadmin'
 ) then raise exception 'No autorizado'; end if;
 select * into r from public.owner_requests where user_id=p_user for update;
 if not found or r.status <> 'pending' then raise exception 'Solicitud no pendiente'; end if;
 if p_user=p_reviewer then raise exception 'No puedes aprobarte a ti mismo'; end if;
 if p_approve then
   insert into public.profiles(id, full_name, role, phone)
   values(r.user_id,r.full_name,'player',r.phone) on conflict(id) do nothing;
   update public.profiles set role='owner' where id=r.user_id;
   insert into public.companies(owner_id,name,address,zone,owner_phone,whatsapp_status)
   select r.user_id,r.company_name,r.address,'Pasto',r.phone,'disconnected'
   where not exists(select 1 from public.companies where owner_id=r.user_id);
 end if;
 update public.owner_requests set status=case when p_approve then 'approved' else 'rejected' end,
 reviewed_at=now(), reviewed_by=p_reviewer where user_id=p_user;
end $$;
revoke all on function public.review_owner_request(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.review_owner_request(uuid,uuid,boolean) to service_role;

create function public.guard_company_owner() returns trigger language plpgsql set search_path=public as $$
begin
 if TG_OP='UPDATE' and new.owner_id is distinct from old.owner_id and coalesce(auth.role(),'') <> 'service_role'
 then raise exception 'No puedes transferir el complejo'; end if;
 if not exists(select 1 from public.profiles where id=new.owner_id and role='owner')
 then raise exception 'Dueño no aprobado'; end if;
 return new;
end $$;
create trigger tr_company_owner_guard before insert or update of owner_id on public.companies
for each row execute function public.guard_company_owner();
commit;
