-- =============================================================================
-- DATOS DE PRUEBA PARA LA AUDITORÍA (ejecutar en Supabase → SQL Editor)
--
-- Antes de correrlo crea en Supabase → Authentication → Users → "Add user" →
-- "Create new user" (marca "Auto Confirm User") estas 3 cuentas, con correos y
-- contraseñas que elijas tú (alias tipo tucorreo+dueno@gmail.com sirven):
--   1. dueño de prueba      2. jugador de prueba 1      3. jugador de prueba 2
-- Cambia los 3 correos de abajo y ejecuta todo. Se puede ejecutar más de una vez.
--
-- Crea: perfil de dueño aprobado + complejo "PRUEBA AUDITORIA" + cancha A,
-- cancha B y cancha combinada A+B. Al final imprime los 3 ids para .env.test.
-- Todo se borra con loadtest/limpieza_prueba_auditoria.sql.
-- =============================================================================
begin;

-- Los triggers de protección de rol solo dejan cambiar roles al service role.
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

create temp table _audit_cfg(owner_email text, p1_email text, p2_email text) on commit drop;
insert into _audit_cfg values (
  'CAMBIAR+dueno@gmail.com',      -- ← correo del dueño de prueba
  'CAMBIAR+jugador1@gmail.com',   -- ← correo del jugador 1
  'CAMBIAR+jugador2@gmail.com'    -- ← correo del jugador 2
);

do $$
declare
  c _audit_cfg; v_owner uuid; v_p1 uuid; v_p2 uuid; v_company uuid; v_a uuid; v_b uuid; v_ab uuid;
  slots jsonb := '["06:00","07:00","08:00","09:00","10:00","11:00","12:00","13:00","14:00","15:00","16:00","17:00","18:00","19:00","20:00","21:00","22:00","23:00"]';
begin
  select * into c from _audit_cfg;
  select id into v_owner from auth.users where lower(email) = lower(c.owner_email);
  select id into v_p1    from auth.users where lower(email) = lower(c.p1_email);
  select id into v_p2    from auth.users where lower(email) = lower(c.p2_email);
  if v_owner is null or v_p1 is null or v_p2 is null then
    raise exception 'Falta crear alguna de las 3 cuentas en Authentication → Users (o el correo no coincide)';
  end if;

  -- Perfiles: dueño aprobado y dos jugadores. Marcados para poder limpiarlos.
  insert into public.profiles (id, full_name, role) values
    (v_owner, 'PRUEBA AUDITORIA Dueño', 'owner'),
    (v_p1,    'PRUEBA AUDITORIA Jugador 1', 'player'),
    (v_p2,    'PRUEBA AUDITORIA Jugador 2', 'player')
  on conflict (id) do update set full_name = excluded.full_name;

  -- El trigger protect_profile_role fuerza role='player' en todo INSERT; el rol de
  -- dueño solo se puede poner con un UPDATE hecho como service role.
  update public.profiles set role = 'owner' where id = v_owner;
  if not exists (select 1 from public.profiles where id = v_owner and role = 'owner') then
    raise exception 'No se pudo marcar al dueño de prueba como aprobado';
  end if;

  -- Complejo de prueba
  select id into v_company from public.companies where owner_id = v_owner and name = 'PRUEBA AUDITORIA' limit 1;
  if v_company is null then
    insert into public.companies (owner_id, name, address, zone, whatsapp_status)
    values (v_owner, 'PRUEBA AUDITORIA', 'Prueba - no reservar', 'Prueba', 'disconnected')
    returning id into v_company;
  end if;

  -- Cancha A y cancha B
  select id into v_a from public.pitches where company_id = v_company and name = 'PRUEBA AUDITORIA A';
  if v_a is null then
    insert into public.pitches (company_id, name, type, price_per_hour, booking_percentage, custom_pricing, city, department)
    values (v_company, 'PRUEBA AUDITORIA A', 'Fútbol 5', 100000, 50, jsonb_build_object('time_slots', slots), 'Pasto', 'Nariño')
    returning id into v_a;
  end if;
  select id into v_b from public.pitches where company_id = v_company and name = 'PRUEBA AUDITORIA B';
  if v_b is null then
    insert into public.pitches (company_id, name, type, price_per_hour, booking_percentage, custom_pricing, city, department)
    values (v_company, 'PRUEBA AUDITORIA B', 'Fútbol 5', 100000, 50, jsonb_build_object('time_slots', slots), 'Pasto', 'Nariño')
    returning id into v_b;
  end if;

  -- Cancha combinada A+B (si se reserva, bloquea A y B, y al revés)
  select id into v_ab from public.pitches where company_id = v_company and name = 'PRUEBA AUDITORIA A+B';
  if v_ab is null then
    insert into public.pitches (company_id, name, type, price_per_hour, booking_percentage, custom_pricing, city, department)
    values (v_company, 'PRUEBA AUDITORIA A+B', 'Fútbol 8', 180000, 50,
            jsonb_build_object('time_slots', slots, 'is_combined', true, 'linked_pitch_ids', jsonb_build_array(v_a, v_b)),
            'Pasto', 'Nariño')
    returning id into v_ab;
  end if;

  raise notice 'TEST_PITCH_ID=%', v_a;
  raise notice 'TEST_SECOND_CHILD_PITCH_ID=%', v_b;
  raise notice 'TEST_LINKED_PITCH_ID=%', v_ab;
end $$;

commit;

-- Corrige el formato de horario si corriste una versión anterior de este script.
update public.pitches
   set custom_pricing = jsonb_set(custom_pricing, '{time_slots}', (select jsonb_agg(to_char(h, 'FM00') || ':00') from generate_series(6, 23) h))
 where company_id in (select id from public.companies where name = 'PRUEBA AUDITORIA');

-- Copia estos 3 ids a loadtest/.env.test:
select name, id from public.pitches
 where company_id in (select id from public.companies where name = 'PRUEBA AUDITORIA')
 order by name;
