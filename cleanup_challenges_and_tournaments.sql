-- ============================================================================
-- LIMPIEZA AUTOMÁTICA DE RETOS Y CAMPEONATOS (MAYORES A 1 MES)
-- Ejecuta este script en el SQL Editor de tu Dashboard de Supabase.
-- ============================================================================

-- 1. FUNCIÓN CENTRAL DE LIMPIEZA
CREATE OR REPLACE FUNCTION delete_expired_challenges_and_tournaments()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Eliminar retos con más de 1 mes de creación
  DELETE FROM challenges
  WHERE created_at < NOW() - INTERVAL '1 month';

  -- Eliminar campeonatos/torneos con más de 1 mes de creación
  DELETE FROM tournaments
  WHERE created_at < NOW() - INTERVAL '1 month';
END;
$$;


-- ============================================================================
-- 2. TRIGGER EN POSTGRESQL (Se activa automáticamente en cada nueva inserción)
-- ============================================================================
-- Dado que PostgreSQL requiere un evento (INSERT/UPDATE) para disparar triggers,
-- este trigger se ejecuta después de crear cualquier reto o campeonato y purga
-- automáticamente todos los registros que superen el mes de antigüedad.

CREATE OR REPLACE FUNCTION trigger_cleanup_expired_records()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Llama a la función de limpieza
  PERFORM delete_expired_challenges_and_tournaments();
  RETURN NEW;
END;
$$;

-- Trigger para la tabla challenges
DROP TRIGGER IF EXISTS trg_cleanup_challenges ON challenges;
CREATE TRIGGER trg_cleanup_challenges
AFTER INSERT ON challenges
FOR EACH STATEMENT
EXECUTE FUNCTION trigger_cleanup_expired_records();

-- Trigger para la tabla tournaments
DROP TRIGGER IF EXISTS trg_cleanup_tournaments ON tournaments;
CREATE TRIGGER trg_cleanup_tournaments
AFTER INSERT ON tournaments
FOR EACH STATEMENT
EXECUTE FUNCTION trigger_cleanup_expired_records();


-- ============================================================================
-- 3. TAREA PROGRAMADA CON pg_cron (Recomendado para Supabase)
-- ============================================================================
-- Si tienes la extensión pg_cron habilitada en Supabase (Database -> Extensions),
-- esto ejecutará la limpieza automáticamente todas las noches a las 3:00 AM (UTC)
-- sin depender de que alguien inserte un registro.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'pg_cron'
  ) THEN
    -- Desprogramar si ya existía para evitar duplicados
    PERFORM cron.unschedule('cleanup-challenges-and-tournaments')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-challenges-and-tournaments');

    -- Programar ejecución diaria a las 03:00 AM UTC
    PERFORM cron.schedule(
      'cleanup-challenges-and-tournaments',
      '0 3 * * *',
      'SELECT delete_expired_challenges_and_tournaments();'
    );
  END IF;
END $$;
