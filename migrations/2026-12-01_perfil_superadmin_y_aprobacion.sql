-- =============================================================================
-- ARREGLO: "No se pudo resolver la solicitud pendiente" al aprobar un dueño
--
-- Causa: la cuenta superadmin (rol en auth.users.app_metadata) NO tenía fila en
-- public.profiles. review_owner_request guarda una notificación con
-- sender_id = superadmin, y notifications.sender_id es llave foránea a
-- profiles.id → la BD rechazaba toda la aprobación (y también el rechazo).
-- Efectos secundarios de lo mismo: el enlace "Super Admin" del menú no salía
-- (se basa en profiles.role) y las alertas de seguridad no le llegaban.
--
-- 1. Crea/actualiza el perfil de todo usuario con app_metadata.role = superadmin.
-- 2. review_owner_request ya no falla si el revisor no tiene perfil.
--
-- Ejecutar en Supabase → SQL Editor. Se puede ejecutar más de una vez.
-- =============================================================================
begin;

-- Los triggers de protección de rol solo dejan cambiar roles al service role.
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

insert into public.profiles (id, full_name)
select u.id, coalesce(nullif(u.raw_user_meta_data ->> 'full_name', ''), 'Superadmin')
  from auth.users u
 where u.raw_app_meta_data ->> 'role' = 'superadmin'
on conflict (id) do nothing;

update public.profiles p set role = 'superadmin'
  from auth.users u
 where u.id = p.id and u.raw_app_meta_data ->> 'role' = 'superadmin'
   and p.role is distinct from 'superadmin';

create or replace function public.review_owner_request(p_user uuid, p_reviewer uuid, p_approve boolean)
returns void language plpgsql security definer set search_path = public as $$
declare r public.owner_requests; v_sender uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' or not exists(
    select 1 from auth.users where id = p_reviewer and raw_app_meta_data->>'role' = 'superadmin'
  ) then raise exception 'No autorizado'; end if;
  select * into r from public.owner_requests where user_id = p_user for update;
  if not found or r.status <> 'pending' then raise exception 'Solicitud no pendiente'; end if;
  if p_user = p_reviewer then raise exception 'No puedes aprobarte a ti mismo'; end if;

  -- Remitente de la notificación solo si el revisor tiene perfil (llave foránea).
  select id into v_sender from public.profiles where id = p_reviewer;

  if p_approve then
    insert into public.profiles(id, full_name, role, phone)
    values (r.user_id, r.full_name, 'player', r.phone) on conflict (id) do nothing;
    update public.profiles set role = 'owner' where id = r.user_id;
    insert into public.companies(owner_id, name, address, zone, owner_phone, whatsapp_status)
    select r.user_id, r.company_name, r.address, 'Pasto', r.phone, 'disconnected'
     where not exists(select 1 from public.companies where owner_id = r.user_id);
    insert into public.notifications(user_id, sender_id, title, message, type, is_read)
    values (r.user_id, v_sender, '🎉 ¡Ya eres dueño en Cancheros!',
            'Aprobamos tu solicitud para ' || r.company_name || '. Entra a tu panel de dueño para crear tus canchas y recibir reservas.',
            'booking_status', false);
  else
    insert into public.notifications(user_id, sender_id, title, message, type, is_read)
    values (r.user_id, v_sender, 'Solicitud de dueño no aprobada',
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
