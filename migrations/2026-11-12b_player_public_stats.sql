-- =============================================================================
-- INCREMENTAL: conteo público de partidos jugados por un usuario (sin PII)
-- Ejecutar DESPUÉS de la migración principal (que activó RLS en bookings).
--
-- Motivo: con la RLS, el navegador ya no puede contar las reservas de OTRO usuario
-- (el perfil público mostraba "0 canchas jugadas" para todos menos para uno mismo).
-- Esta función devuelve SOLO un número, nunca filas ni datos personales.
-- =============================================================================
create or replace function public.get_player_confirmed_count(p_user_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int
  from bookings
  where user_id = p_user_id
    and status = 'confirmed';
$$;

revoke execute on function public.get_player_confirmed_count(uuid) from public;
grant  execute on function public.get_player_confirmed_count(uuid) to anon, authenticated;

notify pgrst, 'reload schema';
