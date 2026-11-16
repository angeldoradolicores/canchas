-- =============================================================================
-- Aviso especial cuando el superadmin aprueba a un dueño.
-- Ejecutar DESPUÉS de 2026-11-21_promociones_por_periodo.sql
-- =============================================================================
begin;

-- Momento en que el dueño vio la celebración de su aprobación (una sola vez).
alter table public.owner_requests add column if not exists celebrated_at timestamptz;
-- Las aprobaciones anteriores no deben mostrar la celebración ahora.
update public.owner_requests set celebrated_at = now() where status = 'approved' and celebrated_at is null;

-- Misma lógica segura de aprobación + notificación al solicitante.
create or replace function public.review_owner_request(p_user uuid, p_reviewer uuid, p_approve boolean)
returns void language plpgsql security definer set search_path = public as $$
declare r public.owner_requests;
begin
  if coalesce(auth.role(), '') <> 'service_role' or not exists(
    select 1 from auth.users where id = p_reviewer and raw_app_meta_data->>'role' = 'superadmin'
  ) then raise exception 'No autorizado'; end if;
  select * into r from public.owner_requests where user_id = p_user for update;
  if not found or r.status <> 'pending' then raise exception 'Solicitud no pendiente'; end if;
  if p_user = p_reviewer then raise exception 'No puedes aprobarte a ti mismo'; end if;

  if p_approve then
    insert into public.profiles(id, full_name, role, phone)
    values (r.user_id, r.full_name, 'player', r.phone) on conflict (id) do nothing;
    update public.profiles set role = 'owner' where id = r.user_id;
    insert into public.companies(owner_id, name, address, zone, owner_phone, whatsapp_status)
    select r.user_id, r.company_name, r.address, 'Pasto', r.phone, 'disconnected'
     where not exists(select 1 from public.companies where owner_id = r.user_id);
    insert into public.notifications(user_id, sender_id, title, message, type, is_read)
    values (r.user_id, p_reviewer, '🎉 ¡Ya eres dueño en Cancheros!',
            'Aprobamos tu solicitud para ' || r.company_name || '. Entra a tu panel de dueño para crear tus canchas y recibir reservas.',
            'booking_status', false);
  else
    insert into public.notifications(user_id, sender_id, title, message, type, is_read)
    values (r.user_id, p_reviewer, 'Solicitud de dueño no aprobada',
            'No pudimos verificar tu solicitud para ' || r.company_name || '. Puedes corregir tus datos y enviarla de nuevo.',
            'booking_status', false);
  end if;

  update public.owner_requests
     set status = case when p_approve then 'approved' else 'rejected' end,
         reviewed_at = now(), reviewed_by = p_reviewer
   where user_id = p_user;
end $$;
revoke all on function public.review_owner_request(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.review_owner_request(uuid, uuid, boolean) to service_role;

commit;
