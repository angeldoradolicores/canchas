-- =============================================================================
-- ALERTAS DE SEGURIDAD PARA EL SUPERADMIN
--
-- Los bloqueos de celulares ya no los hace el dueño: los hace el superadmin desde
-- /admin. Cada vez que alguien choca con los límites anti-acaparamiento
-- (migración 2026-11-27) o intenta reservar con un celular bloqueado, la API
-- registra una alerta aquí y avisa a los superadmins (notificación + push).
--
-- Intentos repetidos de la misma persona/red se agrupan en una sola alerta
-- (columna attempts) para no llenar la bandeja.
--
-- Ejecutar DESPUÉS de 2026-11-27.
-- =============================================================================
begin;

create table if not exists public.security_alerts (
  id            uuid primary key default gen_random_uuid(),
  code          text not null check (char_length(code) <= 40),
  company_id    uuid references public.companies(id) on delete cascade,
  pitch_id      uuid references public.pitches(id) on delete set null,
  phone         text check (phone is null or phone ~ '^[0-9]{7,10}$'),
  customer_name text check (char_length(customer_name) <= 120),
  user_id       uuid,
  ip_hash       text check (char_length(ip_hash) <= 64),
  device_token  text check (char_length(device_token) <= 80),
  attempts      integer not null default 1,
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  resolved_at   timestamptz,
  resolved_by   uuid
);

create index if not exists idx_security_alerts_open on public.security_alerts(last_seen_at desc) where resolved_at is null;
create index if not exists idx_security_alerts_company on public.security_alerts(company_id, last_seen_at desc);

alter table public.security_alerts enable row level security;
revoke all on public.security_alerts from public, anon, authenticated;

commit;
