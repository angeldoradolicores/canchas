begin;
create table public.owner_request_events(
 id bigint generated always as identity primary key,
 user_id uuid not null, actor uuid, happened_at timestamptz not null default now(), snapshot jsonb not null
);
alter table public.owner_request_events enable row level security;
revoke all on public.owner_request_events from public,anon,authenticated;
create function public.audit_owner_request() returns trigger language plpgsql security definer set search_path=public as $$
begin
 insert into public.owner_request_events(user_id,actor,snapshot) values(new.user_id,new.reviewed_by,to_jsonb(new));
 return new;
end $$;
create trigger owner_request_audit after insert or update on public.owner_requests for each row execute function public.audit_owner_request();
create function public.resubmit_owner_request(p_user uuid,p_data jsonb) returns void language plpgsql security definer set search_path=public as $$
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'Forbidden'; end if;
 insert into public.owner_requests(user_id,full_name,company_name,phone,address,evidence)
 values(p_user,p_data->>'full_name',p_data->>'company_name',p_data->>'phone',p_data->>'address',p_data->>'evidence')
 on conflict(user_id) do update set full_name=excluded.full_name,company_name=excluded.company_name,
 phone=excluded.phone,address=excluded.address,evidence=excluded.evidence,status='pending',
 reviewed_at=null,reviewed_by=null,created_at=now()
 where owner_requests.status='rejected';
 if not found then raise exception 'Already pending or approved'; end if;
end $$;
revoke all on function public.resubmit_owner_request(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.resubmit_owner_request(uuid,jsonb) to service_role;
commit;
