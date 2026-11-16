# Correcciones y segunda auditoría

## Alcance y resultados locales

- Registro normal sin promoción automática; aprobación exclusiva del superadministrador.
- Segundo factor TOTP obligatorio para decisiones desde la API.
- Paginación de solicitudes pendientes, reenvío tras rechazo e historial SQL.
- Permisos de pertenencia exigen también rol owner vigente.
- Envío de reservas sustituido por RPC transaccional: bloqueo de filas, pertenencia,
  vencimiento, cancha y número de registros. Tarifas obtenidas de pitches, incluidas
  tarifas por hora y anticipo fijo. El navegador no fija importes.
- Invitados identificados por cookie HttpOnly; lectura por IDs y cancelación filtradas.
- Reutilización de borradores incorpora condiciones contra cambios concurrentes;
  no elimina registros si falla una actualización.
- Comprobantes se decodifican, limitan a 20 millones de píxeles y se recodifican a JPEG.
- Las nuevas cargas R2 requieren bucket separado R2_PRIVATE_BUCKET_NAME; sin él
  se usa Supabase únicamente si payment-proofs es privado.
- WhatsApp distingue Supabase y R2. Consulta de comprobantes por referencia exacta,
  incluyendo historial y saldo restante.
- Compilación deja de ignorar errores de tipos.

## Activación coordinada (todavía no ejecutada en producción)

Aplicar después de las migraciones del 16:

1. 2026-11-17_security_followup.sql
2. 2026-11-17_owner_request_history.sql
3. 2026-11-17_receipt_lookup.sql

Respaldar y probar en staging antes del despliegue coordinado. Las políticas
restrictivas preservan las políticas permisivas existentes: no conceden acceso
por sí mismas. Revisar que los flujos legítimos tengan su política permisiva.
Comprobar columnas payment_history, remaining_payment_proof_url, total_price,
deposit_amount y booking_percentage antes de aplicar.

El bucket R2 privado debe tener acceso público deshabilitado. Los objetos R2
antiguos siguen en su ubicación anterior: migrarlos requiere inventario y cambio
de referencias coordinados. No basta cambiar una variable para privatizarlos.
Los metadatos antiguos embebidos en ###remaining: necesitan migración específica;
la migración automática no los transforma.

## Pruebas

Ejecutar:

    node --test scripts/test-receipt-security.cjs
    npx next typegen
    npx tsc --noEmit --incremental false
    git diff --check

Cinco pruebas de imágenes ejecutadas con éxito. Requieren verificación real en
staging: jugador intentando actualizar rol por REST/RPC; aprobación sin MFA;
dos aprobaciones simultáneas; dos envíos simultáneos de un bloqueo; invitado
intentando leer/cancelar/enviar una reserva de otro navegador; revocación de dueño;
políticas SQL históricas y funciones SECURITY DEFINER.

## Hallazgos abiertos: no certificar producción todavía

- No se dispone de evidencia de ejecución de nuevas migraciones, políticas remotas
  ni prueba integral de autenticación en el despliegue.
- Rate limit sigue siendo local al proceso. Requiere almacén compartido y configuración
  del proxy para límites globales fiables.
- La aprobación humana verifica al solicitante; cambios de identidad comercial y
  nuevas canchas aún requieren un flujo de revisión por establecimiento.
- No existe reconocimiento OCR ni conciliación bancaria; imagen válida no prueba pago.
- npm audit informó 20 vulnerabilidades (1 crítica, 10 altas, 8 moderadas, 1 baja).
  Debe evaluarse alcance y actualizar dependencias con pruebas; no se ejecutó
  audit fix --force ni se asumió que toda dependencia sea explotable en producción.
- No se ha implementado motivo obligatorio de rechazo ni pantalla para consultar
  el historial de auditoría; el historial existe en la base de datos.
- La autorización de lectura de comprobantes continúa exigiendo sesión.
  El invitado puede enviar y consultar su reserva con la cookie, pero no abrir
  el comprobante privado mediante la ruta protegida.

No se afirma seguridad absoluta ni que el sistema esté completamente terminado.
