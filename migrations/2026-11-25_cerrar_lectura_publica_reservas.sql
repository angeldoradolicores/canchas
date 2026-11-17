-- =============================================================================
-- FUGA DETECTADA EN PRODUCCIÓN (prueba loadtest/seguridad.mjs, 2026-11-16):
-- cualquier persona SIN iniciar sesión podía leer todas las reservas (nombre,
-- celular, enlace del comprobante) con la anon key, y Realtime enviaba cada
-- cambio de reserva a todos los navegadores. Causa: una política SELECT
-- permisiva antigua sobre bookings que nunca se eliminó.
--
-- Arreglo: política RESTRICTIVA de lectura (se suma con AND a cualquier política
-- vieja, así que no importa cómo se llame): solo se ven las reservas propias,
-- las de las canchas del propio complejo o, para el superadmin, todas.
-- Los invitados consultan el estado de SU bloqueo con una función que solo
-- devuelve id y estado (sin datos personales).
-- Ejecutar DESPUÉS de 2026-11-24_ocultar_columnas_sensibles_complejos.sql
-- =============================================================================
begin;

alter table public.bookings enable row level security;

-- Permisivas (por si la migración del 12-nov no se aplicó completa).
drop policy if exists bookings_select_own on public.bookings;
create policy bookings_select_own on public.bookings
  for select to authenticated using (user_id = auth.uid());

drop policy if exists bookings_select_owner on public.bookings;
create policy bookings_select_owner on public.bookings
  for select to authenticated using (
    exists (select 1 from public.pitches p
              join public.companies c on c.id = p.company_id
             where p.id = bookings.pitch_id and c.owner_id = auth.uid()));

-- Restrictiva: el límite real de lectura.
drop policy if exists bookings_read_guard on public.bookings;
create policy bookings_read_guard on public.bookings as restrictive
  for select to public using (
    auth.uid() is not null and (
      user_id = auth.uid()
      or exists (select 1 from public.pitches p
                   join public.companies c on c.id = p.company_id
                  where p.id = bookings.pitch_id and c.owner_id = auth.uid())
      or coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('admin', 'superadmin')
    ));

-- Estado del bloqueo de un invitado (los ids son UUID imposibles de adivinar).
create or replace function public.get_booking_statuses(p_ids uuid[])
returns table (id uuid, status text)
language sql stable security definer set search_path = public as $$
  select b.id, b.status from public.bookings b
   where b.id = any (p_ids) and cardinality(p_ids) <= 24;
$$;
revoke all on function public.get_booking_statuses(uuid[]) from public;
grant execute on function public.get_booking_statuses(uuid[]) to anon, authenticated;

commit;

-- Verificación: con la anon key esto debe devolver [] (lista vacía):
--   GET /rest/v1/bookings?select=id&limit=1
