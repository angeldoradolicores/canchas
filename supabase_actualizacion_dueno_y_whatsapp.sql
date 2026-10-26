-- ============================================================================
-- ACTUALIZACIÓN SUPABASE: PERMISOS DE DUEÑO (TODO EL DÍA) + FILTRO WHATSAPP
-- Ejecuta este script en el SQL Editor de tu Dashboard de Supabase.
-- ============================================================================

-- 1. Columna para controlar el filtro de mensajes personales en WhatsApp
ALTER TABLE companies ADD COLUMN IF NOT EXISTS filter_personal_messages boolean DEFAULT false;

-- 2. Función Antifraude actualizada:
--    - Permite al DUEÑO agendar cualquier horario (todo el día o pasado) sin bloqueos.
--    - Mantiene la protección antifraude ESTRICTA para clientes web normales.
CREATE OR REPLACE FUNCTION prevent_past_bookings()
RETURNS trigger AS $$
BEGIN
  -- Si la reserva proviene del panel del dueño (reserva manual): PERMITIR SIEMPRE
  IF NEW.source = 'owner_panel' THEN
    RETURN NEW;
  END IF;

  -- Si el usuario que crea o al que pertenece la reserva es el dueño de la empresa: PERMITIR SIEMPRE
  IF EXISTS (
    SELECT 1 FROM pitches p
    JOIN companies c ON c.id = p.company_id
    WHERE p.id = NEW.pitch_id
      AND (c.owner_id = auth.uid() OR c.owner_id = NEW.user_id)
  ) THEN
    RETURN NEW;
  END IF;

  -- Para clientes externos de la web: Bloquear fechas u horas pasadas (con 10 min de gracia)
  IF NEW.start_time < (now() - interval '10 minutes') THEN
    RAISE EXCEPTION 'Fraude detectado: no se pueden crear reservas en fechas u horas pasadas.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Reasociar el trigger sobre la tabla bookings
DROP TRIGGER IF EXISTS trg_prevent_past_bookings ON bookings;
DROP TRIGGER IF EXISTS prevent_past_bookings_trigger ON bookings;
DROP TRIGGER IF EXISTS check_past_bookings ON bookings;

CREATE TRIGGER trg_prevent_past_bookings
BEFORE INSERT OR UPDATE OF start_time ON bookings
FOR EACH ROW
EXECUTE FUNCTION prevent_past_bookings();

-- Refrescar la caché del schema para PostgREST
NOTIFY pgrst, 'reload schema';
