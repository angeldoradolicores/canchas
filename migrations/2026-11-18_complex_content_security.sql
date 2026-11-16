begin;
-- Prevent direct REST writes from attaching content to someone else's complex.
create function public.guard_complex_content() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 if new.pitch_id is not null and not exists(
  select 1 from public.pitches p join public.companies c on c.id=p.company_id
  join public.profiles u on u.id=c.owner_id
  where p.id=new.pitch_id and c.owner_id=new.user_id and u.role='owner'
 ) then raise exception 'Only the approved owner can publish complex content'; end if;
 if auth.role()='authenticated' and new.user_id is distinct from auth.uid()
 then raise exception 'Cannot publish for another user'; end if;
 if TG_OP='UPDATE' and new.user_id is distinct from old.user_id then raise exception 'Cannot transfer content ownership'; end if;
 return new;
end $$;
create trigger guard_school_complex before insert or update of pitch_id,user_id on public.schools
for each row execute function public.guard_complex_content();
create trigger guard_tournament_complex before insert or update of pitch_id,user_id on public.tournaments
for each row execute function public.guard_complex_content();
revoke all on function public.guard_complex_content() from public,anon,authenticated;
commit;
