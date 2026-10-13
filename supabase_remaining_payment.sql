-- ==============================================================================
-- MIGRACIÓN CANCHEROS: PAGO RESTANTE (SALDO EN LOCAL) Y REALTIME PARA DUEÑOS
-- Ejecutar en: Supabase Dashboard -> SQL Editor -> New Query -> Run
-- ==============================================================================

-- 1. Agregar columnas para la gestión del saldo restante en la tabla de reservas
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS remaining_payment_status text DEFAULT 'pending';
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS remaining_payment_method text;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS remaining_payment_amount numeric DEFAULT 0;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS remaining_payment_proof_url text;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS remaining_payment_notes text;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS remaining_payment_at timestamptz;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS remaining_payment_by uuid REFERENCES auth.users(id);

-- 2. Índices de rendimiento
CREATE INDEX IF NOT EXISTS idx_bookings_remaining_status ON public.bookings(remaining_payment_status);

-- 3. Habilitar replicación de Realtime en la tabla bookings (para recibir reservas nuevas sin recargar la página)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'bookings'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.bookings;
  END IF;
END $$;
