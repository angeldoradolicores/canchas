-- =============================================================================
-- CIERRE DE FUGAS Y PERMISOS SOBRANTES (auditoría 2026-11-18, Fase 1)
--
-- 1. CRÍTICO: la vista bookings_confirmed_full se leía SIN SESIÓN. Como las vistas
--    corren con los permisos de su creador, salta el RLS de bookings y companies:
--    nombre, celular y comprobante de 38 reservas, más cuenta bancaria, token e
--    instancia de WhatsApp de los complejos. bookings_reminder_2h tiene la misma forma.
-- 2. Funciones viejas ejecutables por cualquiera (create_booking, expire_pending_bookings,
--    cleanup_expired_drafts, check_pitch_availability*). n8n las llama con la service
--    role, que no se ve afectada.
-- 3. El navegador no escribe nunca en companies ni pitches (todo va por /api con service
--    role); de bookings solo actualiza payment_proof_url (ManualBookingModal).
--    Se quitan los demás permisos de escritura para que una política vieja permisiva
--    no pueda volver a abrirlos.
-- 4. notifications: cualquier usuario con sesión podía mandar avisos con cualquier texto,
--    tipo (incluido "security_alert") y remitente falso a cualquier otro usuario.
-- 5. TRUNCATE/TRIGGER/REFERENCES no los necesita nadie desde el navegador.
--
-- Ejecutar en Supabase → SQL Editor ("Run without RLS" si sale el aviso).
-- Se puede ejecutar más de una vez. Al final corre loadtest/rls.mjs.
-- =============================================================================
begin;

-- ── 1. Vistas con datos personales ───────────────────────────────────────────
do $$
declare v text;
begin
  foreach v in array array['bookings_confirmed_full', 'bookings_reminder_2h'] loop
    if to_regclass('public.' || v) is not null then
      execute format('revoke all on public.%I from anon, authenticated, public', v);
      -- Si alguien la vuelve a exponer, que al menos respete el RLS de quien consulta.
      execute format('alter view public.%I set (security_invoker = on)', v);
    end if;
  end loop;
end $$;

-- ── 2. Funciones heredadas: solo el servidor (service_role) ─────────────────
do $$
declare f regprocedure;
begin
  for f in
    select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('create_booking', 'expire_pending_bookings', 'cleanup_expired_drafts',
                         'check_pitch_availability', 'check_pitch_availability_n8n',
                         'check_pitch_availability_n8nn', 'check_pitch_availabilityn8nn')
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

-- ── 3. Escrituras directas que el navegador no usa ──────────────────────────
revoke insert, update, delete on public.companies from anon, authenticated;
revoke insert, update, delete on public.pitches   from anon, authenticated;
revoke insert, update, delete on public.bookings  from anon, authenticated;
grant  update (payment_proof_url) on public.bookings to authenticated;  -- dueño, reserva manual

-- Sin sesión nadie escribe en estas tablas (todas exigen auth.uid()).
revoke insert, update, delete on public.challenges, public.teams, public.team_members,
  public.tournaments, public.schools, public.pitch_reviews, public.pitch_favorites,
  public.push_subscriptions, public.notifications from anon;

-- ── 4. Notificaciones entre usuarios ────────────────────────────────────────
-- Solo los avisos de Comunidad que crea el navegador; remitente = quien inicia sesión.
-- Los avisos del sistema (reservas, alertas, promociones) los crea el servidor con
-- service_role, que no pasa por estas políticas.
drop policy if exists notifications_insert_guard on public.notifications;
create policy notifications_insert_guard on public.notifications
  as restrictive for insert to authenticated
  with check (
    sender_id = auth.uid()
    and user_id is distinct from auth.uid()
    and type in ('challenge_join', 'player_offer', 'team_join')
    and char_length(coalesce(title, '')) <= 80
    and char_length(coalesce(message, '')) <= 400
  );
-- El usuario solo marca como leída: no puede reescribir el texto de un aviso.
revoke update on public.notifications from authenticated;
grant  update (is_read) on public.notifications to authenticated;

-- ── 5. Privilegios que nadie necesita desde el navegador ────────────────────
do $$
declare t text;
begin
  for t in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relkind in ('r', 'v', 'm', 'p')
  loop
    execute format('revoke truncate, trigger, references on public.%I from anon, authenticated', t);
  end loop;
end $$;

commit;

-- ── Verificación (debe devolver 0 filas) ────────────────────────────────────
select table_name, grantee, privilege_type
  from information_schema.role_table_grants
 where table_schema = 'public' and grantee in ('anon', 'authenticated')
   and (table_name in ('bookings_confirmed_full', 'bookings_reminder_2h')
        or privilege_type in ('TRUNCATE', 'TRIGGER', 'REFERENCES')
        or (table_name in ('companies', 'pitches') and privilege_type in ('INSERT', 'UPDATE', 'DELETE')));
