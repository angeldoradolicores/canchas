-- =============================================================================
-- FASE 1 — VERIFICACIÓN DE LA BASE (SOLO LECTURA, no cambia nada)
-- Supabase → SQL Editor → pega todo → Run. Si sale el aviso de RLS: "Run without RLS".
-- Devuelve UNA tabla (seccion, objeto, resultado). Expórtala (botón "Export → CSV")
-- o cópiala y pégamela.
-- =============================================================================
with
mig(migracion, tipo, objeto) as (values
  ('2026-11-12 anti doble reserva',      'constraint', 'bookings_no_overlap_same_pitch'),
  ('2026-11-12 anti doble reserva',      'trigger',    'trg_booking_no_overlap'),
  ('2026-11-12 anti doble reserva',      'column',     'bookings.lock_token'),
  ('2026-11-12 anti doble reserva',      'column',     'bookings.remaining_payment_splits'),
  ('2026-11-12b stats jugador',          'function',   'get_player_confirmed_count'),
  ('2026-11-13 índices',                 'index',      'idx_bookings_user_id'),
  ('2026-11-16 aprobación dueño',        'trigger',    'tr_company_owner_guard'),
  ('2026-11-16 aprobación dueño',        'table',      'owner_requests'),
  ('2026-11-16 comprobantes privados',   'bucket',     'payment-proofs'),
  ('2026-11-17 historial dueño',         'table',      'owner_request_events'),
  ('2026-11-17 comprobantes',            'function',   'receipt_bookings'),
  ('2026-11-17 security followup',       'function',   'submit_booking_secure'),
  ('2026-11-17 security followup',       'policy',     'security_company_update'),
  ('2026-11-18 contenido complejo',      'trigger',    'guard_school_complex'),
  ('2026-11-18 promociones',             'table',      'promotion_rewards'),
  ('2026-11-19 promos por celular',      'column',     'promotion_rewards.recipient_phone'),
  ('2026-11-20 promos sin SMS',          'index',      'promotion_phone_one_per_user'),
  ('2026-11-21 promos por periodo',      'column',     'complex_promotions.period'),
  ('2026-11-22 aviso dueño aprobado',    'column',     'owner_requests.celebrated_at'),
  ('2026-11-23 varias promos',           'column',     'complex_promotions.redeem_pitch_ids'),
  ('2026-11-24 ocultar cols complejos',  'nocolgrant', 'companies.whatsapp_qr_code'),
  ('2026-11-25 cerrar lectura reservas', 'policy',     'bookings_read_guard'),
  ('2026-11-26 promos día/quincena',     'function',   'promo_period_end'),
  ('2026-11-27 anti acaparamiento',      'trigger',    'enforce_booking_quota'),
  ('2026-11-27 anti acaparamiento',      'table',      'booking_blocked_phones'),
  ('2026-11-28 alertas superadmin',      'table',      'security_alerts'),
  ('2026-11-29 promos por cancha',       'column',     'complex_promotions.count_pitch_ids'),
  ('2026-11-30 tolerancia 10 min',       'trigger',    'enforce_booking_not_past')
),
mig_check as (
  select '1 migración' as seccion, m.migracion || ' → ' || m.objeto as objeto,
    case
      when m.tipo = 'constraint' then exists(select 1 from pg_constraint where conname = m.objeto)
      when m.tipo = 'trigger'    then exists(select 1 from pg_trigger where tgname = m.objeto and not tgisinternal)
      when m.tipo = 'function'   then exists(select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = m.objeto)
      when m.tipo = 'table'      then to_regclass('public.' || m.objeto) is not null
      when m.tipo = 'index'      then to_regclass('public.' || m.objeto) is not null
      when m.tipo = 'policy'     then exists(select 1 from pg_policies where policyname = m.objeto)
      when m.tipo = 'bucket'     then exists(select 1 from storage.buckets where id = m.objeto and not public)
      when m.tipo = 'column'     then exists(select 1 from information_schema.columns where table_schema = 'public' and table_name = split_part(m.objeto, '.', 1) and column_name = split_part(m.objeto, '.', 2))
      when m.tipo = 'nocolgrant' then not exists(select 1 from information_schema.column_privileges where table_schema = 'public' and table_name = split_part(m.objeto, '.', 1) and column_name = split_part(m.objeto, '.', 2) and grantee in ('anon', 'authenticated') and privilege_type = 'SELECT')
    end::text as resultado
  from mig m
),
pol as (
  select '2 política' as seccion,
         tablename || ' · ' || policyname || ' · ' || permissive || ' · ' || cmd || ' · ' || array_to_string(roles, ',') as objeto,
         'USING ' || coalesce(qual, '-') || ' | CHECK ' || coalesce(with_check, '-') as resultado
  from pg_policies where schemaname = 'public'
),
rls as (
  select '3 RLS activo' as seccion, c.relname as objeto,
         (case when c.relrowsecurity then 'RLS sí' else 'RLS NO' end) || (case when c.relforcerowsecurity then ' (forzado)' else '' end) as resultado
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'
),
tbl_grants as (
  select '4 privilegio tabla' as seccion, table_name || ' · ' || grantee as objeto, string_agg(privilege_type, ',' order by privilege_type) as resultado
  from information_schema.role_table_grants
  where table_schema = 'public' and grantee in ('anon', 'authenticated')
  group by table_name, grantee
),
col_grants as (
  select '5 privilegio columna' as seccion, table_name || ' · ' || grantee || ' · ' || privilege_type as objeto, string_agg(column_name, ',' order by column_name) as resultado
  from information_schema.column_privileges
  where table_schema = 'public' and grantee in ('anon', 'authenticated') and table_name in ('companies', 'profiles', 'bookings', 'pitches')
  group by table_name, grantee, privilege_type
),
trg as (
  select '6 trigger' as seccion, c.relname || ' · ' || t.tgname as objeto,
         p.proname || (case when t.tgenabled = 'D' then ' (DESACTIVADO)' else '' end) as resultado
  from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_proc p on p.oid = t.tgfoid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and not t.tgisinternal
),
fns as (
  select '7 función' as seccion, p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as objeto,
         (case when p.prosecdef then 'SECURITY DEFINER' else 'invoker' end)
         || ' · search_path=' || coalesce((select string_agg(x, ';') from unnest(p.proconfig) x where x like 'search_path%'), 'SIN FIJAR')
         || ' · anon=' || has_function_privilege('anon', p.oid, 'execute')::text
         || ' · authenticated=' || has_function_privilege('authenticated', p.oid, 'execute')::text as resultado
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prokind = 'f' and p.prorettype <> 'trigger'::regtype
),
cons as (
  select '8 constraint bookings' as seccion, conname as objeto, pg_get_constraintdef(oid) as resultado
  from pg_constraint where conrelid = 'public.bookings'::regclass
),
idx as (
  select '9 índice bookings' as seccion, indexname as objeto, indexdef as resultado
  from pg_indexes where schemaname = 'public' and tablename = 'bookings'
)
select * from mig_check
union all select * from pol
union all select * from rls
union all select * from tbl_grants
union all select * from col_grants
union all select * from trg
union all select * from fns
union all select * from cons
union all select * from idx
order by 1, 2;
