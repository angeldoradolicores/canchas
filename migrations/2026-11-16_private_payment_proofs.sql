-- Los comprobantes contienen datos financieros y no deben ser accesibles por
-- URL pública. La aplicación los entrega únicamente mediante /api/receipts,
-- después de comprobar autorización y generar una URL firmada temporal.
update storage.buckets
set public = false
where id = 'payment-proofs';

-- Verificación posterior recomendada:
-- select id, public from storage.buckets where id = 'payment-proofs';
