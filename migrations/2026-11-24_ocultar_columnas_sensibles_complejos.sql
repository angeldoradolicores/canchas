-- =============================================================================
-- La tabla companies se podía leer completa desde el navegador (incluso sin
-- sesión): código QR de vinculación de WhatsApp, token de la API, instancia,
-- número conectado y datos bancarios. Ahora el navegador solo puede leer las
-- columnas públicas; el resto se consulta únicamente desde el servidor
-- (service_role), que ya es como lo hace la app.
-- Ejecutar DESPUÉS de 2026-11-23_varias_promociones_y_canchas.sql
-- =============================================================================
begin;

revoke select on public.companies from anon, authenticated;
grant select (id, owner_id, name, address, zone, lat, lng, created_at,
              has_school, has_tournaments, owner_phone, whatsapp_status)
  on public.companies to anon, authenticated;

-- Por si quedó algún QR viejo guardado: ya no sirve y no debe existir.
update public.companies set whatsapp_qr_code = null
 where whatsapp_qr_code is not null and coalesce(whatsapp_status, '') <> 'connecting';

commit;

-- Verificación (debe devolver 0 filas con columnas sensibles legibles):
-- select column_name from information_schema.column_privileges
--  where table_schema='public' and table_name='companies' and grantee in ('anon','authenticated')
--    and privilege_type='SELECT'
--    and column_name in ('whatsapp_qr_code','whatsapp_api_token','whatsapp_instance_name',
--                        'whatsapp_connected_phone','bank_account','bank_name','account_holder');
