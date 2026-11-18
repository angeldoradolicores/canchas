-- =============================================================================
-- COMPROBANTE SOLO PROPIO (auditoría 2026-11-18, Fase 3)
--
-- El navegador del dueño puede actualizar bookings.payment_proof_url (adjuntar el
-- soporte de una reserva manual, ManualBookingModal). Sin más control, un dueño
-- podía apuntar SU reserva a la ruta del comprobante de un cliente de OTRO complejo
-- y /api/receipts se lo firmaba (lo autoriza por "una reserva tuya usa esa ruta").
-- Las rutas de los comprobantes del flujo en línea eran adivinables (hora en ms).
--
-- Regla: desde el navegador (rol authenticated) solo se puede poner un comprobante
-- subido por la MISMA cuenta (/api/upload lo guarda en comprobantes/<user_id>/...),
-- o dejar el valor como estaba / vacío. El servidor (service_role) no se ve afectado.
--
-- Ejecutar en Supabase → SQL Editor. Se puede ejecutar más de una vez.
-- =============================================================================
begin;

create or replace function public.guard_payment_proof_owner()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') <> 'authenticated' then
    return new;  -- service_role (API) y triggers internos: sin restricción
  end if;
  if new.payment_proof_url is not distinct from old.payment_proof_url or new.payment_proof_url is null then
    return new;
  end if;
  if new.payment_proof_url !~ ('^/api/receipts/(supabase/|r2-private/)?comprobantes/' || auth.uid()::text || '/[A-Za-z0-9_.-]+$') then
    raise exception 'El comprobante debe subirse desde esta cuenta' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_payment_proof_owner on public.bookings;
create trigger guard_payment_proof_owner
before update of payment_proof_url on public.bookings
for each row execute function public.guard_payment_proof_owner();

commit;
