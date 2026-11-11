-- ==============================================================================
-- MIGRACIÓN CANCHEROS: HISTORIAL DE ABONOS / PAGOS PARCIALES EN CONTRATOS
-- Ejecutar en: Supabase Dashboard -> SQL Editor -> New Query -> Run
-- ==============================================================================

-- 1. Agregar columna de historial de pagos (JSON array de abonos)
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS payment_history jsonb DEFAULT '[]'::jsonb;

-- 2. Índice para acceso rápido
CREATE INDEX IF NOT EXISTS idx_bookings_payment_history ON public.bookings USING gin(payment_history);

-- 3. Recargar schema de PostgREST
NOTIFY pgrst, 'reload schema';

