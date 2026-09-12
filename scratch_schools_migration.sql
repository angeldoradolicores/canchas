-- Migración para escuelas (opcional, el backend ya cuenta con compatibilidad y fallback automático):
ALTER TABLE schools ADD COLUMN IF NOT EXISTS images text[];
ALTER TABLE schools ADD COLUMN IF NOT EXISTS custom_location text;
