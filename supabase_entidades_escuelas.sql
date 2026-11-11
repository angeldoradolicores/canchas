-- ==============================================================================
-- MIGRACIÓN CANCHEROS: ENTIDADES, ESCUELAS DE FÚTBOL, CONTRATOS, FIDELIZACIÓN (20 CANCHAS) Y PUSH PWA
-- Ejecutar en: Supabase Dashboard -> SQL Editor -> New Query -> Run
-- ==============================================================================

-- 1. Columnas para clasificación de Entidades, Escuelas, Tarifas y Finanzas en bookings
ALTER TABLE public.bookings 
  ADD COLUMN IF NOT EXISTS total_price numeric,
  ADD COLUMN IF NOT EXISTS deposit_amount numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS note text,
  ADD COLUMN IF NOT EXISTS booking_type text DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS client_type text DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS client_entity_name text,
  ADD COLUMN IF NOT EXISTS payment_method text DEFAULT 'efectivo',
  ADD COLUMN IF NOT EXISTS custom_rate numeric,
  ADD COLUMN IF NOT EXISTS is_loyalty_free boolean DEFAULT false;

-- 2. Índices para consultas y reportes rápidos
CREATE INDEX IF NOT EXISTS idx_bookings_booking_type ON public.bookings(booking_type);
CREATE INDEX IF NOT EXISTS idx_bookings_client_type ON public.bookings(client_type);
CREATE INDEX IF NOT EXISTS idx_bookings_payment_method ON public.bookings(payment_method);
CREATE INDEX IF NOT EXISTS idx_bookings_is_loyalty_free ON public.bookings(is_loyalty_free);

-- 3. Tabla para suscripciones Web Push PWA (para celulares Android / iPhone / PC)
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE,
  subscription jsonb NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Políticas RLS para push_subscriptions
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'push_subscriptions' AND policyname = 'Usuarios gestionan su propia suscripcion push'
  ) THEN
    CREATE POLICY "Usuarios gestionan su propia suscripcion push" 
      ON public.push_subscriptions
      FOR ALL 
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- 4. Notificar a PostgREST para recargar el esquema en caliente
NOTIFY pgrst, 'reload schema';
