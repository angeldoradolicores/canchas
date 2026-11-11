-- ==============================================================================
-- MIGRACIÓN CANCHEROS: CORRECCIÓN DEL TRIGGER DE FECHAS Y HORAS PASADAS
--
-- REGLA ESTRICTA:
-- 1. ÚNICAMENTE el dueño del complejo puede reservar fechas u horas pasadas,
--    y SOLO cuando realiza una reserva manual en SU PROPIA CANCHA.
--    No puede reservar horas pasadas en canchas de otros complejos/dueños.
-- 2. Para clientes regulares (y dueños reservando en canchas ajenas),
--    se otorga un margen máximo de 5 minutos de gracia (hasta :05 minutos).
--
-- Ejecutar en: Supabase Dashboard -> SQL Editor -> New Query -> Run
-- ==============================================================================

-- 1. Eliminar cualquier trigger previo que bloquee reservas pasadas
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT t.tgname, c.relname
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_proc p ON p.oid = t.tgfoid
    WHERE c.relname = 'bookings'
      AND (
        p.prosrc ILIKE '%Fraude detectado%'
        OR p.prosrc ILIKE '%fechas u horas pasadas%'
        OR p.prosrc ILIKE '%horas pasadas%'
        OR t.tgname ILIKE '%past%'
        OR t.tgname ILIKE '%fraud%'
        OR t.tgname ILIKE '%check_time%'
        OR t.tgname ILIKE '%check_booking%'
      )
  ) LOOP
    EXECUTE 'DROP TRIGGER IF EXISTS ' || quote_ident(r.tgname) || ' ON ' || quote_ident(r.relname) || ' CASCADE;';
  END LOOP;
END $$;

-- Eliminar funciones previas si existen
DROP FUNCTION IF EXISTS check_past_booking() CASCADE;
DROP FUNCTION IF EXISTS check_fraud_past_booking() CASCADE;
DROP FUNCTION IF EXISTS validate_booking_time() CASCADE;
DROP FUNCTION IF EXISTS prevent_past_bookings() CASCADE;
DROP FUNCTION IF EXISTS tr_func_check_past_booking() CASCADE;

-- 2. Crear la función del trigger con validación estricta de propiedad de cancha
CREATE OR REPLACE FUNCTION tr_func_check_past_booking()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_own_pitch BOOLEAN := FALSE;
  v_caller_uid UUID;
  v_target_pitch_id UUID;
  v_source TEXT;
  v_booking_type TEXT;
  v_start_time TIMESTAMPTZ;
  v_now_colombia TIMESTAMPTZ;
  v_grace_limit TIMESTAMPTZ;
BEGIN
  -- Extraer valores del registro NEW en variables locales de PL/pgSQL
  -- para evitar el error "missing FROM-clause entry for table new"
  v_target_pitch_id := NEW.pitch_id;
  v_source := COALESCE(NEW.source, '');
  v_booking_type := COALESCE(NEW.booking_type, 'standard');
  v_start_time := NEW.start_time;

  -- Determinar el usuario que realiza la acción
  v_caller_uid := auth.uid();
  IF v_caller_uid IS NULL AND NEW.user_id IS NOT NULL THEN
    v_caller_uid := NEW.user_id;
  END IF;

  -- ── REGLA ESTRICTA 1: RESERVA MANUAL DEL DUEÑO EN SU PROPIA CANCHA ──
  -- Solo se permite bypass de fechas pasadas si la reserva proviene del panel del dueño
  -- (source = 'owner_panel' o booking_type = 'contract') Y la cancha pertenece al dueño.
  IF v_source = 'owner_panel' OR v_booking_type = 'contract' THEN
    IF v_caller_uid IS NOT NULL AND v_target_pitch_id IS NOT NULL THEN
      -- Verificar si la cancha pertenece a una empresa donde el usuario es el dueño
      SELECT EXISTS (
        SELECT 1 
        FROM public.pitches p
        JOIN public.companies c ON c.id = p.company_id
        WHERE p.id = v_target_pitch_id 
          AND c.owner_id = v_caller_uid
      ) INTO v_is_own_pitch;

      IF v_is_own_pitch THEN
        RETURN NEW; -- PERMITIDO: El dueño está reservando en SU PROPIA CANCHA
      END IF;

      -- Verificar si el usuario tiene rol superadmin / admin del sistema
      SELECT EXISTS (
        SELECT 1 
        FROM public.profiles
        WHERE id = v_caller_uid 
          AND role IN ('superadmin', 'admin')
      ) INTO v_is_own_pitch;

      IF v_is_own_pitch THEN
        RETURN NEW; -- PERMITIDO: Administrador del sistema
      END IF;
    ELSE
      -- Petición del servidor con service-role para reserva manual
      RETURN NEW;
    END IF;
  END IF;

  -- ── REGLA ESTRICTA 2: CLIENTES O DUEÑOS EN CANCHAS AJENAS ──
  -- En cualquier cancha ajena o para clientes normales, está prohibido reservar horas pasadas.
  -- Se permite únicamente hasta 5 minutos de gracia después de la hora (máximo :05).
  v_now_colombia := NOW();
  v_grace_limit := v_now_colombia - INTERVAL '5 minutes';

  IF v_start_time < v_grace_limit THEN
    RAISE EXCEPTION 'Fraude detectado: no se pueden crear reservas en fechas u horas pasadas. Solo el dueño del complejo puede reservar horarios pasados en sus propias canchas vía reserva manual.';
  END IF;

  RETURN NEW;
END;
$$;

-- 3. Vincular el trigger a la tabla bookings
DROP TRIGGER IF EXISTS tr_validate_booking_past_time ON public.bookings;

CREATE TRIGGER tr_validate_booking_past_time
BEFORE INSERT OR UPDATE OF start_time
ON public.bookings
FOR EACH ROW
EXECUTE FUNCTION tr_func_check_past_booking();

-- 4. Notificar recarga de schema a PostgREST
NOTIFY pgrst, 'reload schema';
