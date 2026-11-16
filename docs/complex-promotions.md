# Promociones por complejo

## Instalación

Aplicar una vez en Supabase, después de las migraciones anteriores de aprobación
de dueños y reservas seguras:

1. migrations/2026-11-18_complex_promotions.sql
2. migrations/2026-11-18_complex_content_security.sql
3. migrations/2026-11-19_phone_promotion_counting.sql

Si ya aplicaste las dos primeras, ejecuta únicamente la tercera.
No se ejecutaron contra Supabase. Las migraciones de promociones y teléfonos se
probaron en PostgreSQL temporal local con un esquema mínimo representativo.
Requiere companies, pitches, bookings, notifications, profiles, schools,
tournaments y auth.users. Las notificaciones utilizan el tipo booking_status.
Probar primero con una copia del esquema real; estos scripts no son reejecutables.

## Reglas

- Panel /dashboard/promotions. Una promoción activa por complejo, con requisito
  de reservas, horas de regalo, días de semana y plazo para canjear y jugar.
- Cada registro de reserva aprobada y verificada cuenta una vez desde el inicio
  de campaña. El flujo normal genera una reserva por horario de una hora.
- Reservas normales de una cuenta identificada suman a esa cuenta. Las reservas
  de invitados suman por su celular aunque todavía no tengan cuenta.
- Reservas manuales y turnos fijos suman por celular del cliente, con nombre real
  informado. Sin nombre o sin celular válido no suman a nadie. Los marcadores
  «Turno Fijo», «Reserva Interna», «Reserva Manual» y «Sin Nombre» no son nombres.
  Nunca se vinculan personas por coincidencia de nombre. El user_id de owner_panel
  identifica al creador; no se utiliza como identidad del cliente.
- El teléfono acumula sin SMS. Se une a una cuenta automáticamente la primera vez
  que el dueño aprueba (confirmed + verified, valor > 0) una reserva EN LÍNEA de esa
  cuenta hecha con ese celular. Un celular pertenece a una sola cuenta y cada cuenta
  vincula un solo celular. Formatos colombianos de 10 dígitos o +57 se normalizan.
- La vinculación combina progresos y conserva regalos, saldo y fecha de vencimiento;
  no entrega un duplicado ni reinicia su vigencia. Un número ya vinculado no se
  reasigna automáticamente a otra cuenta; ese caso requiere revisión de soporte.
- Una reserva tiene como máximo un crédito. Cambiar su destinatario o reutilizar
  una fila cancelada actualiza ese crédito; quitar nombre/celular a una manual lo
  elimina. Los premios anteriores se vuelven a validar al canjear. Los regalos
  ya consumidos no se recuperan automáticamente si luego se cancela la reserva.
- Cada múltiplo del requisito entrega otro regalo; notificación y entrega únicas.
- Finalizar campaña detiene acumulación y conserva los regalos ya entregados.
- Canje desde el paso de pago: todas las horas seleccionadas deben caber en el
  saldo y cumplir días y vencimiento. Confirma sin transferencia ni comprobante.
- Cancelaciones de reservas que sumaban al premio se comprueban al canjear.
- Cancelar una reserva ya canjeada no devuelve automáticamente horas del regalo.
- /rewards muestra regalos; aviso dentro de la aplicación actualiza cada minuto.
  También se guarda una notificación en el sistema existente. Una nueva campaña
  avisa a clientes identificados con reservas aprobadas en ese complejo. El aviso
  de regalo aparece en la aplicación; no se envían campañas por SMS o WhatsApp.
- Escuelas y torneos se consultan por canchas hermanas sin duplicar registros.
- Tarifa manual precargada según horario. Si se modifica, aplica esa tarifa a todas
  las horas seleccionadas; si no, cada hora conserva su precio. Abono y tarifa
  solo admiten enteros no negativos, validados también en servidor.

## Seguridad y pruebas

- Propiedad y rol owner vigente verificados en servidor.
- Tablas de premios/canjes sin acceso directo para anon/authenticated.
- RPC solo service_role; identidad obtenida de sesión, sin confiar en el cliente.
- Teléfonos, créditos y vinculaciones sin lectura/escritura directa del cliente.
- Políticas restrictivas en bookings bloquean altas/bajas directas y exigen dueño
  aprobado del complejo para editar, incluso ante políticas permisivas heredadas.
- Bloqueo de filas, deduplicación de premios y canjes; errores no descuentan saldo.
- Condiciones de campañas publicadas no editables.
- Trigger impide asociar escuelas y torneos a complejos ajenos.
- Pruebas SQL: entrega, notificación única, identidad ajena, doble canje, vencimiento,
  cancelación, saldo intacto al fallar y ausencia de privilegios directos.
- tests/promotion-phone-counting.sql también comprueba invitados, manuales, turnos
  fijos, nombres vacíos, homónimos, normalización, vinculación verificada repetida,
  reutilización de filas, combinación de premios existentes, arrastre de progresos,
  teléfono ajeno/reciclado y rechazo de aprobaciones fabricadas por un jugador.
  Ejecutar con psql -X -d <base_local_vacía> -f tests/promotion-phone-counting.sql;
  el archivo crea datos y roles de prueba: no ejecutarlo en producción.
- También se probaron conexiones simultáneas en PostgreSQL local: aprobación con
  dos vinculaciones concurrentes y vinculación durante un canje. Se conservaron
  los conteos y saldos sin duplicados en esos escenarios.
- TypeScript verificado. Diseño con grids adaptables; falta validación visual en
  navegador con datos reales y pruebas concurrentes contra el esquema de Supabase.

No se ha desplegado ni se afirma seguridad absoluta. Revisar los hallazgos previos
documentados en security-followup-audit.md antes de publicar.

## Visibilidad

Las promociones solo se muestran como pestaña dentro del flujo de reserva
(BookingPromotionsTab). No hay aviso flotante global ni notificación masiva al
publicar una promoción; solo se notifica al usuario cuando gana horas gratis.
La antigua "cortesía por 20 canchas" del panel se eliminó: únicamente cuentan las
promociones que crea el dueño.

Migración: migrations/2026-11-20_promociones_sin_sms.sql (después de la del 19).
