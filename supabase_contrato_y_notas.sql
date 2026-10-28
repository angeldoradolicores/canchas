-- ==============================================================================
-- MIGRACIÓN CANCHEROS: COLUMNAS DE NOTAS Y TIPO DE RESERVA (CONTRATOS)
-- Ejecutar en: Supabase Dashboard -> SQL Editor -> New Query -> Run
-- ==============================================================================

-- 1. Agregar columnas para notas personalizadas y clasificación de contrato/fijo
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS note text;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS booking_type text DEFAULT 'standard';

-- 2. Índice para consultas rápidas por tipo de reserva
CREATE INDEX IF NOT EXISTS idx_bookings_booking_type ON public.bookings(booking_type);

-- 3. Recargar schema de PostgREST
NOTIFY pgrst, 'reload schema';
