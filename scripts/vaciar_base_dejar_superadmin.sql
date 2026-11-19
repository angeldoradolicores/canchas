-- =============================================================================
-- VACIAR LA BASE DE DATOS DEJANDO SOLO EL/LOS SUPERADMIN
--
-- Borra TODO: reservas, complejos, canchas, promociones, notificaciones, solicitudes
-- de dueño, comunidad, torneos, escuelas, alertas, etc., y todos los usuarios
-- (dueños, jugadores) EXCEPTO las cuentas con app_metadata.role = 'superadmin'
-- y su perfil, para que puedan seguir entrando a /jogoa y aprobar canchas.
--
-- NO SE PUEDE DESHACER. Antes de correrlo:
--   1. Haz una copia de seguridad (Supabase › Database › Backups, o pg_dump).
--   2. Córrelo UNA vez tal cual: termina en ROLLBACK, así que solo muestra en
--      "Messages / Notices" qué va a borrar y no borra nada.
--   3. Si todo se ve bien, cambia el ROLLBACK del final por COMMIT y córrelo otra vez.
--
-- No toca: archivos en Cloudflare R2 (fotos y comprobantes), Evolution API, n8n,
-- variables de Vercel ni la estructura de las tablas (solo los datos).
-- =============================================================================
begin;

do $$
declare
  v_admins int;
  v_tables text;
  v_bad text;
  r record;
begin
  -- 1. Debe existir al menos un superadmin; si no, no se borra nada.
  select count(*) into v_admins
    from auth.users
   where coalesce(raw_app_meta_data ->> 'role', '') = 'superadmin';
  if v_admins = 0 then
    raise exception 'No hay ningún superadmin (app_metadata.role = superadmin). No se borró nada.';
  end if;
  raise notice 'Superadmins que se conservan: %', v_admins;
  for r in
    select u.email, (p.id is not null) as tiene_perfil
      from auth.users u left join public.profiles p on p.id = u.id
     where coalesce(u.raw_app_meta_data ->> 'role', '') = 'superadmin'
  loop
    raise notice '  · % (perfil: %)', r.email, case when r.tiene_perfil then 'sí' else 'NO' end;
  end loop;

  -- 2. Tablas de datos de la app (esquema public), sin "profiles" y sin tablas de extensiones.
  select string_agg(format('public.%I', c.relname), ', ' order by c.relname)
    into v_tables
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relkind in ('r', 'p')
     and c.relname <> 'profiles'
     and not exists (select 1 from pg_depend d where d.objid = c.oid and d.deptype = 'e');

  -- 3. Seguridad: si "profiles" apunta a alguna de esas tablas, vaciarlas en cascada
  --    borraría también el perfil del superadmin. En ese caso se detiene sin borrar nada.
  select string_agg(distinct conf.relname, ', ')
    into v_bad
    from pg_constraint k
    join pg_class src on src.oid = k.conrelid
    join pg_class conf on conf.oid = k.confrelid
    join pg_namespace n on n.oid = src.relnamespace
   where k.contype = 'f' and n.nspname = 'public' and src.relname = 'profiles'
     and conf.relname <> 'profiles';
  if v_bad is not null then
    raise exception 'profiles tiene llaves foráneas hacia: %. Revisa antes de vaciar (no se borró nada).', v_bad;
  end if;

  -- 4. Vista previa: filas por tabla.
  for r in
    select c.relname
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('r', 'p') and c.relname <> 'profiles'
       and not exists (select 1 from pg_depend d where d.objid = c.oid and d.deptype = 'e')
     order by c.relname
  loop
    execute format('select count(*) from public.%I', r.relname) into v_admins;
    if v_admins > 0 then raise notice 'Se vacía public.%: % filas', r.relname, v_admins; end if;
  end loop;

  -- 5. Vaciar todas las tablas de datos de una vez (y reiniciar contadores).
  if v_tables is not null then
    execute 'truncate table ' || v_tables || ' restart identity';
  end if;

  -- 6. Perfiles: solo quedan los de superadmin.
  delete from public.profiles p
   where not exists (
     select 1 from auth.users u
      where u.id = p.id and coalesce(u.raw_app_meta_data ->> 'role', '') = 'superadmin');
  get diagnostics v_admins = row_count;
  raise notice 'Perfiles borrados: %', v_admins;

  -- 7. Usuarios: solo quedan los superadmin (sesiones, identidades de Google y MFA de los
  --    demás se borran en cascada; el MFA del superadmin se conserva).
  delete from auth.users
   where coalesce(raw_app_meta_data ->> 'role', '') <> 'superadmin';
  get diagnostics v_admins = row_count;
  raise notice 'Usuarios borrados: %', v_admins;
end $$;

-- 8. Comprobación: debe quedar solo el/los superadmin.
select u.email, u.raw_app_meta_data ->> 'role' as rol, p.role as rol_perfil
  from auth.users u left join public.profiles p on p.id = u.id;

-- Primera vez: ROLLBACK (no borra nada, solo muestra). Para borrar de verdad: cámbialo por COMMIT.
rollback;
