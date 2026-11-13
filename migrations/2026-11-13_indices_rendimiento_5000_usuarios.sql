-- ==============================================================================
-- MIGRACIÓN: ÍNDICES DE RENDIMIENTO PARA ALTA CONCURRENCIA (~5.000 usuarios)
-- Fecha: 2026-11-13
--
-- Contexto: auditoría de estrés/escalabilidad. Los índices existentes
-- (idx_bookings_pitch_start, idx_bookings_status, idx_bookings_lock_token,
-- idx_pitches_company_id, etc.) ya cubren las consultas de disponibilidad.
-- Esta migración agrega los que faltan para las rutas que SÍ se ejecutan en
-- producción y no tenían índice de soporte:
--
--   1. companies.whatsapp_instance_name -> se consulta en CADA mensaje entrante
--      de WhatsApp (nodo "Get Company Details" de n8n). Sin índice, cada
--      mensaje hace un seq scan sobre toda la tabla companies.
--   2. companies.owner_id -> usado en app/api/bookings/batch-action/route.ts
--      y en admin-actions/route.ts para listar las empresas de un dueño.
--   3. bookings.user_id -> usado en GET /api/bookings (reservas personales
--      del usuario autenticado) y en varios lookups de notificaciones.
--   4. bookings.customer_phone -> usado para agrupar "reservas hermanas" del
--      mismo cliente en lib/whatsapp-notifications.ts.
--   5. bookings.payment_proof_url (parcial, solo no-nulos) -> usado para
--      agrupar reservas del mismo comprobante en varias rutas.
--
-- Ejecutar en: Supabase Dashboard -> SQL Editor -> New Query -> Run
-- Todas usan CONCURRENTLY implícito vía "if not exists" + sin bloquear
-- escrituras largas (son tablas pequeñas/medianas, pero igual se usan índices
-- btree estándar; si en el futuro estas tablas crecen mucho, considera
-- CREATE INDEX CONCURRENTLY ejecutado fuera de una transacción).
-- ==============================================================================

create index if not exists idx_companies_whatsapp_instance_name
  on public.companies (whatsapp_instance_name);

create index if not exists idx_companies_owner_id
  on public.companies (owner_id);

create index if not exists idx_bookings_user_id
  on public.bookings (user_id);

create index if not exists idx_bookings_customer_phone
  on public.bookings (customer_phone);

create index if not exists idx_bookings_payment_proof_url
  on public.bookings (payment_proof_url)
  where payment_proof_url is not null;

-- ==============================================================================
-- NOTA IMPORTANTE (acción manual tuya, no ejecutable desde aquí):
--
-- La función check_pitch_availability_n8nn (la que usa el bot de WhatsApp vía
-- n8n) NO está en ningún archivo .sql de este repositorio — fue creada
-- directamente en el SQL Editor de Supabase y nunca se versionó. Eso significa
-- que si alguien la borra o la edita por error en el dashboard, no hay forma
-- de recuperarla desde el código. Corre esto en el SQL Editor y pégame el
-- resultado para versionarla en una migración y revisar si usa el índice GiST
-- de rango (el mismo que ya existe por la restricción EXCLUDE anti-doble-
-- reserva) en vez de recorrer cada slot por separado:
--
--   select pg_get_functiondef('public.check_pitch_availability_n8nn(uuid, date)'::regprocedure);
-- ==============================================================================

notify pgrst, 'reload schema';
