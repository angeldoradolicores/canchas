begin;
create table public.complex_promotions(
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id),
 title text not null check(length(title) between 3 and 120),
 required_bookings integer not null check(required_bookings between 1 and 1000),
 gift_hours integer not null check(gift_hours between 1 and 24),
 redeem_days integer not null check(redeem_days between 1 and 365),
 weekdays integer[] not null check(cardinality(weekdays) between 1 and 7 and weekdays <@ array[0,1,2,3,4,5,6]),
 starts_at timestamptz not null default now(),
 ends_at timestamptz not null,
 active boolean not null default true,
 created_by uuid not null references auth.users(id),
 check(ends_at>starts_at)
);
create unique index one_active_complex_promotion on public.complex_promotions(company_id) where active;
create table public.promotion_rewards(
 id uuid primary key default gen_random_uuid(),
 promotion_id uuid not null references public.complex_promotions(id),
 user_id uuid not null references auth.users(id),
 cycle integer not null check(cycle>0),
 hours integer not null check(hours between 1 and 24),
 remaining integer not null check(remaining>=0),
 earned_at timestamptz not null default now(),
 expires_at timestamptz not null,
 unique(promotion_id,user_id,cycle),
 check(remaining<=hours)
);
create table public.promotion_redemptions(
 booking_id uuid primary key references public.bookings(id),
 reward_id uuid not null references public.promotion_rewards(id),
 redeemed_at timestamptz not null default now()
);
alter table public.complex_promotions enable row level security;
alter table public.promotion_rewards enable row level security;
alter table public.promotion_redemptions enable row level security;
revoke all on public.complex_promotions,public.promotion_rewards,public.promotion_redemptions from public,anon,authenticated;
grant all on public.complex_promotions,public.promotion_rewards,public.promotion_redemptions to service_role;

create function public.promotion_count(p public.complex_promotions,u uuid) returns bigint
language sql volatile security definer set search_path=public as $$
 select count(*) from public.bookings b join public.pitches pi on pi.id=b.pitch_id
 where pi.company_id=p.company_id and b.user_id=u and b.status='confirmed'
 and b.payment_status='verified' and b.created_at>=p.starts_at and b.created_at<p.ends_at
 and b.source is distinct from 'owner_panel' and b.source is distinct from 'loyalty_reward'
 and coalesce(b.total_price,0)>0
 and not exists(select 1 from public.promotion_redemptions r where r.booking_id=b.id);
$$;
create function public.award_complex_promotion() returns trigger
language plpgsql security definer set search_path=public as $$
declare p public.complex_promotions; amount bigint; tier integer; inserted integer;
begin
 if new.user_id is null or new.status<>'confirmed' or new.payment_status is distinct from 'verified'
 or new.source in ('owner_panel','loyalty_reward') then return new; end if;
 for p in select cp.* from public.complex_promotions cp join public.pitches pi on pi.company_id=cp.company_id
 where pi.id=new.pitch_id and cp.active and now()>=cp.starts_at and now()<cp.ends_at loop
  perform pg_advisory_xact_lock(hashtextextended(p.id::text||new.user_id::text,0));
  amount:=public.promotion_count(p,new.user_id);
  for tier in 1..(amount/p.required_bookings)::integer loop
   insert into public.promotion_rewards(promotion_id,user_id,cycle,hours,remaining,expires_at)
   values(p.id,new.user_id,tier,p.gift_hours,p.gift_hours,now()+make_interval(days=>p.redeem_days))
   on conflict(promotion_id,user_id,cycle) do nothing;
   get diagnostics inserted = row_count;
   if inserted=1 then
    insert into public.notifications(user_id,sender_id,title,message,type,is_read)
    select new.user_id,c.owner_id,'🎁 ¡Ganaste horas gratis!',
     p.title||': recibiste '||p.gift_hours||' horas en '||c.name||'. Consulta Mis regalos para ver días y vigencia.',
     'booking_status',false from public.companies c where c.id=p.company_id;
   end if;
  end loop;
 end loop;
 return new;
end $$;
create trigger award_complex_promotion after insert or update of status,payment_status on public.bookings
for each row execute function public.award_complex_promotion();

create function public.notify_complex_promotion() returns trigger language plpgsql security definer set search_path=public as $$
begin
 insert into public.notifications(user_id,sender_id,title,message,type,is_read)
 select distinct b.user_id,new.created_by,'🎁 Nueva promoción del complejo',
 new.title||': por cada '||new.required_bookings||' reservas aprobadas recibe '||new.gift_hours||' horas gratis. Consulta las condiciones en el detalle de la cancha.',
 'booking_status',false
 from public.bookings b join public.pitches pi on pi.id=b.pitch_id
 where pi.company_id=new.company_id and b.user_id is not null and b.user_id<>new.created_by
 and b.status='confirmed' and b.payment_status='verified';
 return new;
end $$;
create trigger notify_complex_promotion after insert on public.complex_promotions for each row execute function public.notify_complex_promotion();

create function public.redeem_complex_reward(p_reward uuid,p_user uuid,p_ids uuid[])
returns setof public.bookings language plpgsql security definer set search_path=public as $$
declare r public.promotion_rewards; p public.complex_promotions; b public.bookings; n integer:=0;
begin
 if coalesce(auth.role(),'')<>'service_role' or p_user is null then raise exception 'Forbidden'; end if;
 select * into r from public.promotion_rewards where id=p_reward and user_id=p_user for update;
 if not found or r.expires_at<=now() or cardinality(p_ids) not between 1 and r.remaining then raise exception 'Reward unavailable'; end if;
 select * into p from public.complex_promotions where id=r.promotion_id;
 if public.promotion_count(p,p_user)<r.cycle*p.required_bookings then raise exception 'Qualifying bookings were cancelled'; end if;
 for b in select * from public.bookings where id=any(p_ids) order by id for update loop
  n:=n+1;
  if b.user_id is distinct from p_user or b.status<>'draft' or b.expires_at is null or b.expires_at<=now()
   or b.start_time<=now() or b.start_time>=r.expires_at
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
revoke all on function public.promotion_count(public.complex_promotions,uuid) from public,anon,authenticated;
revoke all on function public.award_complex_promotion() from public,anon,authenticated;
revoke all on function public.notify_complex_promotion() from public,anon,authenticated;
revoke all on function public.redeem_complex_reward(uuid,uuid,uuid[]) from public,anon,authenticated;
grant execute on function public.redeem_complex_reward(uuid,uuid,uuid[]) to service_role;
commit;
