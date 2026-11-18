-- =============================================================================
-- FASE 4 y 6 — VERIFICACIÓN (SOLO LECTURA, no cambia nada, no muestra datos personales)
-- Supabase → SQL Editor → Run ("Run without RLS" si sale el aviso). Pega el resultado.
-- Si sale el error 'schema "cron" does not exist', no hay tareas programadas: borra los
-- bloques cron_jobs y cron_runs (y sus dos líneas en el select final) y vuelve a correrlo.
-- =============================================================================
with
cron_jobs as (
  select '1 tarea programada' as seccion, j.jobname as objeto,
         j.schedule || ' · activa=' || j.active || ' · ' || left(regexp_replace(j.command, '\s+', ' ', 'g'), 160) as resultado
    from cron.job j
),
cron_runs as (
  select '2 últimas ejecuciones' as seccion, j.jobname as objeto,
         d.status || ' · ' || to_char(d.start_time at time zone 'America/Bogota', 'YYYY-MM-DD HH24:MI') || ' · ' || left(coalesce(d.return_message, ''), 120) as resultado
    from cron.job_run_details d join cron.job j on j.jobid = d.jobid
   where d.start_time > now() - interval '1 day'
     and d.runid in (select max(runid) from cron.job_run_details group by jobid)
),
pend as (
  select '3 pendientes sin revisar' as seccion,
         case when created_at > now() - interval '1 hour' then 'a. menos de 1 hora'
              when created_at > now() - interval '1 day' then 'b. de 1 a 24 horas'
              when created_at > now() - interval '7 days' then 'c. de 1 a 7 días'
              else 'd. más de 7 días' end as objeto,
         count(*)::text || ' reservas · ' || count(*) filter (where start_time < now())::text || ' ya con la hora pasada' as resultado
    from public.bookings where status = 'pending'
   group by 2
),
alerts as (
  select '4 alertas de seguridad (7 días)' as seccion, code as objeto,
         count(*)::text || ' alertas · ' || sum(attempts)::text || ' intentos' as resultado
    from public.security_alerts where created_at > now() - interval '7 days'
   group by code
),
hooks as (
  -- Triggers que mandan reservas a n8n: solo se muestra el esquema y el host del destino.
  select '5 webhook de reservas' as seccion, t.tgname as objeto,
         coalesce(substring(encode(t.tgargs, 'escape') from '(https?://[^/\\]+)'), 'sin URL') ||
         ' · método ' || coalesce(substring(encode(t.tgargs, 'escape') from '\\000(POST|GET|PUT)\\000'), '?') ||
         ' · encabezados: ' || coalesce(nullif(array_to_string(array(
             select distinct m[1] from regexp_matches(encode(t.tgargs, 'escape'), '"([A-Za-z0-9-]+)"\s*:', 'g') as m), ','), ''), 'ninguno') as resultado
    from pg_trigger t
   where t.tgrelid = 'public.bookings'::regclass and not t.tgisinternal
     and t.tgfoid = (select oid from pg_proc where proname = 'http_request' limit 1)
)
select * from cron_jobs
union all select * from cron_runs
union all select * from pend
union all select * from alerts
union all select * from hooks
order by 1, 2;
