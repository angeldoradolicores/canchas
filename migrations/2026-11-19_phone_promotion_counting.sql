begin;
-- El cliente no puede fabricar aprobaciones para obtener regalos, aunque exista
-- una política permisiva antigua. Las altas/bajas siguen pasando por el servidor.
alter table public.bookings enable row level security;
create policy promotion_booking_insert_guard on public.bookings as restrictive
 for insert to public with check(false);
create policy promotion_booking_delete_guard on public.bookings as restrictive
 for delete to public using(false);
create policy promotion_booking_update_guard on public.bookings as restrictive
 for update to public
 using(exists(select 1 from public.pitches pi join public.companies c on c.id=pi.company_id
  join public.profiles pr on pr.id=c.owner_id where pi.id=bookings.pitch_id and c.owner_id=auth.uid() and pr.role='owner'))
 with check(exists(select 1 from public.pitches pi join public.companies c on c.id=pi.company_id
  join public.profiles pr on pr.id=c.owner_id where pi.id=bookings.pitch_id and c.owner_id=auth.uid() and pr.role='owner'));
-- Acumulación por cuenta o teléfono, nunca por coincidencia de nombre.
create function public.promotion_phone(p text) returns text
language plpgsql immutable set search_path=public as $$
declare digits text;
begin
 if p is null or p !~ '^[+0-9 ()-]+$' then return null; end if;
 digits:=regexp_replace(p,'[^0-9]','','g');
 if digits ~ '^3[0-9]{9}$' then return '57'||digits; end if;
 if digits ~ '^573[0-9]{9}$' then return digits; end if;
 return null;
end $$;

create table public.promotion_phone_accounts(
 phone text primary key check(phone ~ '^573[0-9]{9}$'),
 user_id uuid not null references auth.users(id),
 verified_at timestamptz not null default now()
);
create table public.promotion_booking_credits(
 booking_id uuid primary key references public.bookings(id),
 user_id uuid references auth.users(id),
 phone text,
 recorded_at timestamptz not null default now(),
 check(user_id is not null or phone is not null)
);
create index promotion_credit_user on public.promotion_booking_credits(user_id);
create index promotion_credit_phone on public.promotion_booking_credits(phone) where user_id is null;
alter table public.promotion_phone_accounts enable row level security;
alter table public.promotion_booking_credits enable row level security;
revoke all on public.promotion_phone_accounts,public.promotion_booking_credits from public,anon,authenticated;
grant all on public.promotion_phone_accounts,public.promotion_booking_credits to service_role;
alter table public.promotion_rewards alter column user_id drop not null;
alter table public.promotion_rewards add column recipient_phone text;
alter table public.promotion_rewards add constraint reward_identity_required check(user_id is not null or recipient_phone is not null);
create unique index reward_phone_cycle on public.promotion_rewards(promotion_id,recipient_phone,cycle) where recipient_phone is not null;

create function public.record_promotion_credit(b public.bookings) returns void
language plpgsql security definer set search_path=public as $$
declare recipient uuid; phone_key text; manual boolean;
begin
 if b.status is distinct from 'confirmed' or b.payment_status is distinct from 'verified'
 or b.source='loyalty_reward' or coalesce(b.total_price,0)<=0
 or exists(select 1 from public.promotion_redemptions where booking_id=b.id) then
  delete from public.promotion_booking_credits where booking_id=b.id;
  return;
 end if;
 manual:=coalesce(b.source='owner_panel',false);
 -- owner_panel.user_id es quien administra, NO el cliente.
 if manual and (nullif(btrim(b.customer_name),'') is null or lower(btrim(b.customer_name)) in
 ('turno fijo','reserva interna','reserva manual','sin nombre')) then
  delete from public.promotion_booking_credits where booking_id=b.id;
  return;
 end if;
 if not manual and b.user_id is not null then
   recipient:=b.user_id;
 else
   phone_key:=public.promotion_phone(b.customer_phone);
   if phone_key is null then
    delete from public.promotion_booking_credits where booking_id=b.id;
    return;
   end if;
   select user_id into recipient from public.promotion_phone_accounts where phone=phone_key;
 end if;
 insert into public.promotion_booking_credits(booking_id,user_id,phone)
 values(b.id,recipient,phone_key) on conflict(booking_id) do update
 set user_id=excluded.user_id,phone=excluded.phone;
end $$;

-- Un único crédito por reserva. Reutilizar una fila cancelada no acredita al cliente anterior.
create or replace function public.promotion_count(p public.complex_promotions,u uuid) returns bigint
language sql volatile security definer set search_path=public as $$
 select count(*) from public.promotion_booking_credits cr
 join public.bookings b on b.id=cr.booking_id join public.pitches pi on pi.id=b.pitch_id
 where cr.user_id=u and pi.company_id=p.company_id and b.status='confirmed'
 and b.payment_status='verified' and b.created_at>=p.starts_at and b.created_at<p.ends_at
 and coalesce(b.total_price,0)>0 and b.source is distinct from 'loyalty_reward'
 and not exists(select 1 from public.promotion_redemptions r where r.booking_id=b.id);
$$;

create function public.refresh_promotion_awards(p public.complex_promotions,recipient uuid,phone_key text)
returns void language plpgsql security definer set search_path=public as $$
declare amount bigint; tier integer; inserted integer;
begin
 if recipient is not null then amount:=public.promotion_count(p,recipient);
 else
  select count(*) into amount from public.promotion_booking_credits cr join public.bookings b on b.id=cr.booking_id
  join public.pitches pi on pi.id=b.pitch_id
  where cr.user_id is null and cr.phone=phone_key and pi.company_id=p.company_id
  and b.status='confirmed' and b.payment_status='verified' and b.created_at>=p.starts_at and b.created_at<p.ends_at
  and coalesce(b.total_price,0)>0 and b.source is distinct from 'loyalty_reward'
  and not exists(select 1 from public.promotion_redemptions r where r.booking_id=b.id);
 end if;
 for tier in 1..(amount/p.required_bookings)::integer loop
  insert into public.promotion_rewards(promotion_id,user_id,recipient_phone,cycle,hours,remaining,expires_at)
  values(p.id,recipient,case when recipient is null then phone_key else null end,tier,p.gift_hours,p.gift_hours,
    now()+make_interval(days=>p.redeem_days)) on conflict do nothing;
  get diagnostics inserted=row_count;
  if inserted=1 and recipient is not null then
   insert into public.notifications(user_id,sender_id,title,message,type,is_read)
   select recipient,c.owner_id,'🎁 ¡Ganaste horas gratis!',
     p.title||': recibiste '||p.gift_hours||' horas en '||c.name||'. Consulta Mis regalos.',
     'booking_status',false from public.companies c where c.id=p.company_id;
  end if;
 end loop;
end $$;

create or replace function public.award_complex_promotion() returns trigger
language plpgsql security definer set search_path=public as $$
declare p public.complex_promotions; cr public.promotion_booking_credits;
begin
 -- Serializa atribución, entrega y vinculación para impedir dobles premios al reclamar.
 perform pg_advisory_xact_lock(8241,1);
 perform public.record_promotion_credit(new);
 select * into cr from public.promotion_booking_credits where booking_id=new.id;
 if not found then return new; end if;
 for p in select cp.* from public.complex_promotions cp join public.pitches pi on pi.company_id=cp.company_id
 where pi.id=new.pitch_id and cp.active and now()>=cp.starts_at and now()<cp.ends_at loop
  perform public.refresh_promotion_awards(p,cr.user_id,cr.phone);
 end loop;
 return new;
end $$;
drop trigger award_complex_promotion on public.bookings;
create trigger award_complex_promotion after insert or update of status,payment_status,customer_phone,customer_name,total_price,user_id,source,pitch_id
on public.bookings for each row execute function public.award_complex_promotion();

create function public.claim_phone_promotions(p_user uuid) returns void
language plpgsql security definer set search_path=public as $$
declare phone_key text; previous_user uuid; p public.complex_promotions; r public.promotion_rewards; offset_cycle integer;
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'Forbidden'; end if;
 select public.promotion_phone(phone) into phone_key from auth.users where id=p_user and phone_confirmed_at is not null;
 if phone_key is null then raise exception 'Verify your phone first'; end if;
 -- No perfiles, nombres ni user_metadata: solo el teléfono confirmado por Auth.
 if (select count(*) from auth.users where phone_confirmed_at is not null and public.promotion_phone(phone)=phone_key)<>1
 then raise exception 'Ambiguous verified phone'; end if;
 perform pg_advisory_xact_lock(8241,1);
 select user_id into previous_user from public.promotion_phone_accounts where phone=phone_key;
 if previous_user is not null and previous_user<>p_user then raise exception 'Phone already linked; contact support'; end if;
 insert into public.promotion_phone_accounts(phone,user_id) values(phone_key,p_user) on conflict do nothing;
 update public.promotion_booking_credits set user_id=p_user where phone=phone_key and user_id is null;
 for p in select * from public.complex_promotions loop
  select coalesce(max(cycle),0) into offset_cycle from public.promotion_rewards where promotion_id=p.id and user_id=p_user;
  for r in select * from public.promotion_rewards where promotion_id=p.id and recipient_phone=phone_key and user_id is null order by cycle for update loop
   offset_cycle:=offset_cycle+1;
   -- Conservar saldo, vencimiento e ID del regalo. No crear un segundo premio.
   update public.promotion_rewards set user_id=p_user,recipient_phone=null,cycle=offset_cycle where id=r.id;
   if r.remaining>0 and r.expires_at>now() then
    insert into public.notifications(user_id,sender_id,title,message,type,is_read)
    values(p_user,p.created_by,'🎁 Vinculamos tus reservas por teléfono',p.title||': consulta tus horas en Mis regalos.','booking_status',false);
   end if;
  end loop;
  if p.active and now()>=p.starts_at and now()<p.ends_at then
   perform public.refresh_promotion_awards(p,p_user,null);
  end if;
 end loop;
end $$;

create or replace function public.notify_complex_promotion() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 insert into public.notifications(user_id,sender_id,title,message,type,is_read)
 select distinct cr.user_id,new.created_by,'🎁 Nueva promoción del complejo',
 new.title||': por cada '||new.required_bookings||' reservas aprobadas recibe '||new.gift_hours||' horas gratis. Consulta el detalle de la cancha.',
 'booking_status',false
 from public.promotion_booking_credits cr join public.bookings b on b.id=cr.booking_id
 join public.pitches pi on pi.id=b.pitch_id
 where pi.company_id=new.company_id and cr.user_id is not null and cr.user_id<>new.created_by
 and b.status='confirmed' and b.payment_status='verified';
 return new;
end $$;

-- Orden de bloqueo: reservas, atribución, regalo. Evita bloqueo circular al vincular/canjear.
create or replace function public.redeem_complex_reward(p_reward uuid,p_user uuid,p_ids uuid[])
returns setof public.bookings language plpgsql security definer set search_path=public as $$
declare r public.promotion_rewards; p public.complex_promotions; b public.bookings; n integer:=0;
begin
 if coalesce(auth.role(),'')<>'service_role' or p_user is null then raise exception 'Forbidden'; end if;
 if p_ids is null or cardinality(p_ids) not between 1 and 24 then raise exception 'Invalid booking list'; end if;
 perform 1 from public.bookings where id=any(p_ids) and user_id=p_user order by id for update;
 perform pg_advisory_xact_lock(8241,1);
 select * into r from public.promotion_rewards where id=p_reward and user_id=p_user for update;
 if not found or r.expires_at<=now() or cardinality(p_ids)>r.remaining then raise exception 'Reward unavailable'; end if;
 select * into p from public.complex_promotions where id=r.promotion_id;
 if public.promotion_count(p,p_user)<r.cycle*p.required_bookings then raise exception 'Qualifying bookings were cancelled'; end if;
 for b in select * from public.bookings where id=any(p_ids) and user_id=p_user order by id loop
  n:=n+1;
  if b.status is distinct from 'draft' or b.expires_at is null or b.expires_at<=now()
   or b.start_time is null or b.end_time is null or b.start_time<=now() or b.start_time>=r.expires_at
   or b.end_time-b.start_time<>interval '1 hour'
   or not (extract(dow from b.start_time at time zone 'America/Bogota')::integer=any(p.weekdays))
   or not exists(select 1 from public.pitches where id=b.pitch_id and company_id=p.company_id)
  then raise exception 'Invalid booking for reward'; end if;
 end loop;
 if n<>cardinality(p_ids) then raise exception 'Invalid booking list'; end if;
 insert into public.promotion_redemptions(booking_id,reward_id) select unnest(p_ids),r.id;
 update public.promotion_rewards set remaining=remaining-n where id=r.id;
 return query update public.bookings set status='confirmed',payment_status='verified',total_price=0,deposit_amount=0,
 source='loyalty_reward',expires_at=null,customer_name=coalesce(customer_name,'Reserva con regalo')
 where id=any(p_ids) returning *;
end $$;

-- Recuperar reservas aprobadas existentes de las campañas, sin tocar los regalos entregados.
do $$declare b public.bookings; p public.complex_promotions; cr record;
begin
 for b in select bk.* from public.bookings bk
 loop perform public.record_promotion_credit(b); end loop;
 for p in select * from public.complex_promotions where active and now()>=starts_at and now()<ends_at loop
  for cr in select distinct user_id,case when user_id is null then phone else null end as phone from public.promotion_booking_credits loop
   perform public.refresh_promotion_awards(p,cr.user_id,cr.phone);
  end loop;
 end loop;
end $$;
revoke all on function public.promotion_phone(text),public.record_promotion_credit(public.bookings),
 public.refresh_promotion_awards(public.complex_promotions,uuid,text),public.claim_phone_promotions(uuid)
 from public,anon,authenticated;
grant execute on function public.claim_phone_promotions(uuid) to service_role;
commit;
