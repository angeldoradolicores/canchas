begin;
create function public.guard_profile_identity() returns trigger language plpgsql as $$
begin
 if new.id is distinct from old.id then raise exception 'Profile identity is immutable'; end if;
 return new;
end $$;
create trigger profile_identity_guard before update on public.profiles for each row execute function public.guard_profile_identity();
alter table public.bookings add column if not exists lock_token uuid;
create or replace function public.submit_booking_secure(p_ids uuid[], p_user uuid, p_token uuid,
 p_pitch uuid, p_name text, p_phone text, p_proof text)
returns setof public.bookings language plpgsql security definer set search_path=public as $$
declare r public.bookings; n integer:=0; price numeric; percentage numeric; pricing jsonb;
begin
 if coalesce(auth.role(),'') <> 'service_role' then raise exception 'Forbidden'; end if;
 if cardinality(p_ids) not between 1 and 4 or p_proof is null then raise exception 'Invalid request'; end if;
 select price_per_hour, booking_percentage, custom_pricing into price, percentage, pricing from public.pitches where id=p_pitch;
 if price is null then raise exception 'Invalid pitch'; end if;
 for r in select * from public.bookings where id=any(p_ids) order by id for update loop
   n:=n+1;
   if r.pitch_id<>p_pitch or r.status<>'draft' or r.expires_at < now()
    or r.expires_at is null
    or (p_user is not null and r.user_id is distinct from p_user)
    or (p_user is null and (r.user_id is not null or r.lock_token is distinct from p_token or p_token is null))
   then raise exception 'Invalid lock'; end if;
 end loop;
 if n<>cardinality(p_ids) then raise exception 'Missing locks'; end if;
 return query update public.bookings set status='pending', payment_status='submitted',
 customer_name=p_name, customer_phone=p_phone, payment_proof_url=p_proof,
 total_price=coalesce(nullif(pricing->>to_char(start_time at time zone 'America/Bogota','HH24:MI'),'')::numeric,price),
 deposit_amount=case when pricing->>'booking_type'='fixed' then coalesce((pricing->>'booking_fixed')::numeric,0)
 else round(coalesce(nullif(pricing->>to_char(start_time at time zone 'America/Bogota','HH24:MI'),'')::numeric,price)*coalesce(percentage,50)/100) end,
 expires_at=now()+interval '10 minutes'
 where id=any(p_ids) returning *;
end $$;
revoke all on function public.submit_booking_secure(uuid[],uuid,uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.submit_booking_secure(uuid[],uuid,uuid,uuid,text,text,text) to service_role;

-- Restrictive policies intersect with any existing permissive policies.
alter table public.profiles enable row level security;
create policy security_profile_insert on public.profiles as restrictive for insert to authenticated
 with check(id=auth.uid() and role='player');
create policy security_profile_update on public.profiles as restrictive for update to authenticated
 using(id=auth.uid()) with check(id=auth.uid());
alter table public.companies enable row level security;
create policy security_company_insert on public.companies as restrictive for insert to authenticated
 with check(false);
create policy security_company_update on public.companies as restrictive for update to authenticated
 using(owner_id=auth.uid() and exists(select 1 from public.profiles where id=auth.uid() and role='owner'))
 with check(owner_id=auth.uid());
create policy security_company_delete on public.companies as restrictive for delete to authenticated using(false);
revoke insert,update,delete on public.companies,public.profiles,public.pitches from anon;
alter table public.pitches enable row level security;
create policy security_pitch_insert on public.pitches as restrictive for insert to authenticated
 with check(false);
create policy security_pitch_update on public.pitches as restrictive for update to authenticated
 using(exists(select 1 from public.companies c join public.profiles p on p.id=c.owner_id
 where c.id=company_id and c.owner_id=auth.uid() and p.role='owner'))
 with check(exists(select 1 from public.companies c join public.profiles p on p.id=c.owner_id
 where c.id=company_id and c.owner_id=auth.uid() and p.role='owner'));
create policy security_pitch_delete on public.pitches as restrictive for delete to authenticated using(false);
commit;
