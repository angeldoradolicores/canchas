-- =============================================================================
-- LIMPIEZA AL TERMINAR LA AUDITORÍA (Supabase → SQL Editor)
-- 1) Ejecuta el bloque "VER" y revisa que solo salgan cosas de prueba.
-- 2) Ejecuta el bloque "BORRAR".
-- 3) Borra las 3 cuentas de prueba en Authentication → Users.
-- 4) Ejecuta "VER" otra vez: todo debe dar 0.
-- =============================================================================

-- ── VER ──────────────────────────────────────────────────────────────────────
with c as (select id from public.companies where name = 'PRUEBA AUDITORIA'),
     p as (select id from public.pitches where company_id in (select id from c))
select 'complejos' as que, count(*) from c
union all select 'canchas', count(*) from p
union all select 'reservas en canchas de prueba', count(*) from public.bookings where pitch_id in (select id from p)
union all select 'reservas marcadas fuera de canchas de prueba', count(*) from public.bookings
  where customer_name ilike 'PRUEBA AUDITORIA%' and pitch_id not in (select id from p)
union all select 'perfiles marcados', count(*) from public.profiles where full_name ilike 'PRUEBA AUDITORIA%'
union all select 'promociones del complejo', count(*) from public.complex_promotions where company_id in (select id from c)
union all select 'alertas de seguridad de prueba', count(*) from public.security_alerts where customer_name ilike 'PRUEBA AUDITORIA%' or company_id in (select id from public.companies where name = 'PRUEBA AUDITORIA');

-- ── BORRAR ───────────────────────────────────────────────────────────────────
-- begin;
-- select set_config('request.jwt.claim.role', 'service_role', true);
-- select set_config('request.jwt.claims', '{"role":"service_role"}', true);
-- delete from public.promotion_rewards where promotion_id in (select id from public.complex_promotions where company_id in (select id from public.companies where name = 'PRUEBA AUDITORIA'));
-- delete from public.complex_promotions where company_id in (select id from public.companies where name = 'PRUEBA AUDITORIA');
-- delete from public.bookings where pitch_id in (select id from public.pitches where company_id in (select id from public.companies where name = 'PRUEBA AUDITORIA'));
-- delete from public.bookings where customer_name ilike 'PRUEBA AUDITORIA%';
-- delete from public.security_alerts where customer_name ilike 'PRUEBA AUDITORIA%' or company_id in (select id from public.companies where name = 'PRUEBA AUDITORIA');
-- delete from public.pitches where company_id in (select id from public.companies where name = 'PRUEBA AUDITORIA');
-- delete from public.companies where name = 'PRUEBA AUDITORIA';
-- commit;
