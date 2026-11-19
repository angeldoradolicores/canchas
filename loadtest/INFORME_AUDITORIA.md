# Informe de auditoría de seguridad y resistencia — Cancheros

> Estado: **en curso**. Fase 0 terminada el 2026-11-18. Las fases 1 a 8 se irán agregando.

## 1. Veredicto (provisional)

**Todavía NO se puede lanzar.** Hay claves maestras publicadas en internet (el repositorio de GitHub es público). Hasta que se cambien (roten), cualquier persona puede leer, cambiar o borrar todas las reservas y usar el WhatsApp del sistema. Esto se arregla en una tarde: está en la lista de acciones de la sección 3.

## 2. Hallazgos

| # | Gravedad | Qué pasa | Estado |
|---|---|---|---|
| F0-1 | **Crítico** | La "llave maestra" de Supabase (service role, formato JWT antiguo) está en 19 archivos JSON de n8n, en un repositorio **público** de GitHub | Requiere acción tuya (rotar) |
| F0-2 | **Crítico** | La clave global de Evolution API (WhatsApp) está en 5 JSON de n8n del mismo repositorio público, y el servidor de Evolution responde desde internet | Requiere acción tuya (rotar) |
| F0-3 | **Alto** | `/api/generate-status` respondía **sin iniciar sesión** con los nombres de los clientes y los ids de reserva de cualquier complejo y fecha | Corregido en local (sin commit) |
| F0-4 | Medio | La licencia de New Relic está escrita en `newrelic.js` (repositorio público) | Requiere acción tuya (rotar) |
| F0-5 | Bajo | Existía la ruta de depuración `/api/debug-dashboard` (en producción respondía 404, pero no debe existir) | Corregido en local: ruta borrada |
| F0-6 | Bajo | `/api/push-subscribe` acepta cualquier URL https como destino de notificaciones push; el servidor enviará peticiones a esa URL | Pendiente (lista de hosts de push permitidos) |
| F0-7 | Bajo | `/api/whatsapp` decide quién es superadmin leyendo `profiles.role` en lugar de `app_metadata` | Pendiente (se verifica en Fase 1 si un usuario puede cambiar su `role`) |

### F0-1 — Llave maestra de Supabase publicada

- **Qué pasa.** El JWT `service_role` del proyecto `rxykieyrzaqnfasouwke` (emitido con `iat 1787273715`) aparece en encabezados `Authorization: Bearer …` de nodos HTTP de n8n. El servidor local usa ya la clave nueva `sb_secret_…`, pero la clave anónima en uso sigue siendo el **JWT antiguo**. Eso indica que las claves JWT antiguas siguen activas en Supabase y, por tanto, que la llave filtrada **probablemente sigue funcionando**. Por política no la probé contra la base: lo confirmas tú en el panel de Supabase.
- **Cómo se reprodujo.** `git log --all -p` + búsqueda de JWT y decodificación del campo `role` (script `scan.py`, que solo muestra los primeros y últimos caracteres). El repositorio `github.com/angeldoradolicores/canchas` responde `HTTP 200` sin iniciar sesión, es decir, es público.
- **Archivos (los 19):** `workflows_export.json`, `Canchas_Pasto_Asistente_IA_v10_Optimizado.json`, `asistente_casi_funcionando.json`, `canchas_pasto_n8n_workflow.json`, `canchas_pasto_workflow_temp.json`, `cancheros_corregido.json`, `cancheros_workflow_actualizado.json`, `cancheros_workflow_final.json`, `n8n_workflow.json`, `n8n_workflow_actualizado.json`, `docs/n8n-asistente-y-notificaciones-v7-final.json`, `docs/n8n-v4-notificaciones-con-link.json`, `docs/n8n-v4.2-notificaciones-final.json`, `docs/n8n-v6-whatsapp-con-link.json`, `docs/n8n-v6.1-asistente-mejorado.json`, `docs/n8n-v6.2-vendedor-estricto.json`, `docs/v4.json`, `docs/v5.json`, `docs/workflow-v8-produccion-corregido.json`. La clave anónima (pública por diseño) aparece además en `scripts/k6-grafana-test.js` y `tests/load/k6-canchas-full.js`.
- **Impacto.** Con esa llave cualquiera salta todas las reglas de seguridad: lee los celulares y comprobantes de todos los clientes, borra o confirma reservas, cambia precios y se vuelve dueño o superadmin.
- **Por qué rotar.** Borrar los archivos del repositorio **no basta**: el historial público ya fue copiado (GitHub, bots que buscan llaves, forks).

### F0-2 — Clave de Evolution API publicada

- **Archivos.** La clave aparece en el historial de 5 archivos y sigue en `HEAD` en 4: `cancheros_corregido.json`, `docs/workflow-v8-produccion-corregido.json`, `n8n_workflow.json` y `n8n_workflow_actualizado.json`. Es la misma clave que usa hoy `EVOLUTION_API_KEY`.
- **Exposición.** El servidor de Evolution (dominio `evo…`, https) responde `200` en `/` desde internet, y `401` en `/instance/fetchInstances` sin clave.
- **Impacto.** Con la clave global se controlan **todas** las instancias de WhatsApp de los complejos: enviar mensajes en su nombre, leer conversaciones, ver el QR de vinculación y desconectarlas.

### F0-3 — Nombres de clientes sin iniciar sesión (corregido)

- **Cómo se reprodujo** (solo lectura en producción):
  ```bash
  curl -s -X POST https://www.cancheros.site/api/generate-status -H 'content-type: application/json' \
    -d '{"companyId":"<id público del complejo>","date":"2026-11-18"}'
  ```
- **Esperado:** `401`. **Obtenido:** `200` con 4 reservas y 3 nombres de clientes distintos (enmascarados en la prueba: `Ca***`, `Os***`, `Pa***`), más `id`, `status` y `source` de cada reserva.
- **Corrección.** La ruta ahora exige sesión, comprueba que quien pide sea el dueño del complejo (o un admin de plataforma) y valida `companyId`, `pitchId` y `date`. El panel `/dashboard/status` envía el token.
- **Prueba que lo cubre.** `loadtest/seguridad.mjs`, sección 5: "Sin sesión: estado de horas con nombres de clientes".

### Variables y bundle del navegador

- `.env`, `.env.*` y `.env*.local` están en `.gitignore` (eso cubre `loadtest/.env.test`). Ningún `.env` aparece en el historial de git.
- Descargué el JavaScript público de producción (18 archivos, 1,27 MB) y lo comparé con cada valor de `.env.local`. Solo aparecen variables `NEXT_PUBLIC_*`: la URL de Supabase, la clave anónima, la URL de la app, el Client ID de Google y la clave pública VAPID. La cadena `sb_secret_` que aparece es código de la librería supabase-js, no una clave. **Ninguna clave secreta llega al navegador.**

### Inventario de rutas `/api`

| Ruta | Métodos | Quién puede | Escribe | Observación |
|---|---|---|---|---|
| `admin-actions` | POST | Dueño aprobado (`profiles.role='owner'`) o superadmin (`app_metadata`) | Sí | Reserva manual, turno fijo, canchas, complejo. IDOR: Fase 3 |
| `admin/security` | GET, POST, DELETE | Superadmin + MFA aal2 | Sí | Bloqueo de celulares y alertas |
| `bookings` | GET | Pública (solo id y estado por cancha y fecha) / propias con sesión o cookie de invitado | No | |
| `bookings` | POST | Jugador o invitado (Turnstile opcional) | Sí | lock, create, cancel_draft |
| `bookings/batch-action` | POST | Dueño del complejo de **todas** las reservas | Sí | No comprueba que el rol `owner` siga vigente (Fase 3) |
| `bookings/notify-status` | POST | Dueño de la cancha o admin | Envía WhatsApp | Exige que el estado coincida con la BD |
| `bookings/remaining-payment` | POST | Dueño o admin | Sí | Fase 3 |
| `community-actions` | POST | Con sesión | Sí | Fase 3 y 7 |
| ~~`debug-dashboard`~~ | GET | — | No | **Borrada** |
| `delete-account` | POST | El propio usuario + confirmación escrita | Sí | |
| `favorites` | GET, POST | Con sesión | Sí | |
| `generate-status` | POST | **Antes: cualquiera.** Ahora: dueño o admin | No | **F0-3** |
| `image-proxy` | GET | Pública, con límite de 30/min | No | Lista blanca de hosts, solo https, anti DNS-rebinding. Fase 6 |
| `media/[...path]` | GET | Pública (solo prefijos de fotos) | No | Bloquea `..` y los comprobantes |
| `owner-requests` | GET, POST, PATCH | Con sesión; aprobar exige superadmin + aal2 | Sí | |
| `promotions` | GET, POST | GET público (promos activas); POST de dueño o jugador | Sí | Fase 3 |
| `push-subscribe` | POST | Con sesión (siempre su propio `user_id`) | Sí | F0-6 |
| `receipts/[...path]` | GET | Dueño, cliente de la reserva o admin | No | Fase 3: ¿se puede apuntar un comprobante ajeno? |
| `schools` | GET, POST, PATCH, PUT, DELETE | GET público; escrituras del autor o superadmin | Sí | |
| `search-companies` | GET | Pública, con límite | No | |
| `send-push` | POST | Solo servidor a servidor (`x-internal-secret`) | Envía push | La comparación no es de tiempo constante (riesgo bajo) |
| `tournaments` | GET, POST | GET público; escrituras con sesión | Sí | Fase 7 (XSS) |
| `upload`, `upload-school-image` | POST | Con sesión | R2 | Re-codifica a WebP. Fase 7 |
| `whatsapp` | POST | Dueño del complejo o superadmin (`profiles.role`) | Instancia de Evolution | No es un webhook: Evolution envía los mensajes entrantes directo a n8n. `send_test` manda un texto fijo al número que indique el dueño |

### Fase 1 — Base de datos (parte sin sesión: terminada 2026-11-18)

Prueba: `node --env-file=loadtest/.env.test loadtest/rls.mjs` → **41 correctas, 2 advertencias, 0 fallas** con la clave anónima.

- **Lecturas.** Un anónimo ve 0 reservas. No ve las columnas privadas de `companies` (QR, instancia y celular de WhatsApp, datos bancarios), ni `security_alerts`, `booking_blocked_phones`, `owner_requests`, `complex_promotions` o `promotion_rewards`. De `notifications`, `push_subscriptions` y `pitch_favorites` recibe 0 filas.
- **Escrituras directas.** Las 20 intentadas fallan con `401 / 42501`:
  - insertar una reserva confirmada;
  - cambiar el precio de una cancha propia o ajena;
  - crear canchas o complejos;
  - subirse el rol a owner o superadmin;
  - crear alertas, promociones o bonos, o notificar a otros;
  - aprobarse como dueño.
- **RPC internas** (`submit_booking_secure`, `receipt_bookings`, `review_owner_request`, `redeem_complex_reward`…): bloqueadas para anónimos.
- **RPC públicas.** `get_pitch_occupancy` devuelve solo horas y estado, y limita a 50 canchas y 370 días: con un rango de 100 años devuelve 0 filas. `get_booking_statuses` devuelve solo id y estado.

| # | Gravedad | Qué pasa | Estado |
|---|---|---|---|
| F1-3 | **Crítico** | La vista `bookings_confirmed_full` (creada a mano en Supabase, no está en el repositorio) se lee **sin iniciar sesión**. Corre con los permisos de su creador, así que salta el RLS: hoy entrega 38 reservas confirmadas con nombre, celular y comprobante del cliente, y de cada complejo la cuenta bancaria, el titular, `whatsapp_api_token`, la instancia y el celular de WhatsApp | **Corregido** 2026-11-18: migración `2026-12-02_cerrar_vistas_y_permisos_sobrantes.sql` ejecutada; la vista responde 401 (anónimo) y 403 (jugador) |
| F1-4 | Medio | Cualquier usuario con sesión puede crear notificaciones para **cualquier** usuario, con cualquier texto, tipo (incluido `security_alert`, que lleva a `/jogoa`) y remitente falso. Sirve para phishing a dueños y superadmins | **Corregido** 2026-11-18 (misma migración); el jugador recibe 403 |
| F1-5 | Medio | Funciones viejas ejecutables por anónimos: `create_booking` (`security definer`, hoy rota por una columna que ya no existe), `expire_pending_bookings` y `cleanup_expired_drafts` (`security definer`, sin `search_path`), y 4 variantes de `check_pitch_availability` | **Corregido** 2026-11-18 (solo `service_role`); anónimo 401, jugador 403 |
| F1-6 | Bajo | Privilegios sobrantes en tablas: `INSERT/UPDATE/DELETE` de `authenticated` en `companies` y `pitches` (y en todas las columnas de `bookings`), escrituras de `anon` en 9 tablas, y `TRUNCATE/TRIGGER/REFERENCES` para `anon` y `authenticated`. Hoy las políticas restrictivas los neutralizan, pero una política vieja permisiva o un cambio futuro los reabriría. Por ejemplo, "Dueños y usuarios pueden actualizar reservas" tiene `USING true` | **Corregido** 2026-11-18 (misma migración) |
| F1-1 | Aceptado | `profiles` es legible sin sesión, con `phone` y `role` | **Aceptado por el dueño del negocio** el 2026-11-18 (Comunidad muestra el celular en los retos) |
| F1-2 | Bajo | `check_pitch_availability` se puede llamar desde el navegador y, con la clave anónima, marca todo "disponible". Además falla (`22007`) si una cancha guarda horarios como `"1:00 PM"` | **Corregido** 2026-11-18 (misma migración) |
| F1-7 | Info | Hay 3 triggers en `bookings` que envían cada reserva a n8n por `http_request`: "Notificaciones de Reservas n8n", `booking_created_n8n` y `booking_confirmed_n8n` | Revisar en la Fase 6 la URL de destino (¿https?, ¿con secreto?) y posibles avisos duplicados |
| F1-8 | Info | El índice `bookings_pitch_start_live_idx` filtra por `'pendiente'` y `'confirmado'`, estados que no existen, así que no sirve. `idx_bookings_pitch_start` e `idx_bookings_pitch_starttime` están duplicados | Fase 5 (rendimiento) |

**Resultado de `verificar_bd.sql` (producción, 2026-11-18).**
- Las 28 comprobaciones de migración están aplicadas, de la 2026-11-12 a la 2026-11-30. El trigger anti-solape existe con el nombre `trg_booking_no_overlap`.
- RLS está activo en las 22 tablas.
- La constraint de exclusión `bookings_no_overlap_same_pitch` cubre solo `pending` y `confirmed`. Los borradores dependen del trigger y de `unique_pitch_time`, y eso se prueba en la Fase 2.

**Cómo se reprodujo F1-3:**
```bash
curl "$SUPABASE_URL/rest/v1/bookings_confirmed_full?select=*" -H "apikey: <clave anónima>"
```
Esperado: `401` o 0 filas. Obtenido: `200` con 38 filas. Prueba: `loadtest/rls.mjs`, "la vista bookings_confirmed_full no expone reservas ajenas". Hoy falla y debe pasar a ✅ tras la migración.

Tras la migración: `rls.mjs` dio **103 correctas, 4 advertencias y 1 falla**. La falla era un falso positivo de la prueba: `/api/owner-requests` le devuelve a un usuario normal solo su propia solicitud. La prueba ya está corregida para validar eso.

**Fase 1 cerrada.** Las 4 advertencias son las 2 de `profiles`, repetidas para anónimo y para jugador: el celular, aceptado, y que se puede identificar la cuenta superadmin por `role`, de gravedad baja.

### Fase 2 — Nunca una hora reservada por dos personas (en curso)

Script nuevo: `loadtest/doble-reserva-escenarios.mjs`. Detecta reservas activas que chocan en la misma cancha o en canchas unidas (A+B contra A o B), y también la **sobrescritura**: dos clientes distintos reciben la misma fila.

**Corrida 1 — producción, 2026-11-18 ~11:30–11:56, código anterior a las correcciones F2-x:**

| Escenario | Rondas | Dobles | 429 | 5xx | Ganadores |
|---|---|---|---|---|---|
| inv-inv | 20 | **0** | 0 | 0 | invitado ×20 (uno por ronda) |
| jug-jug | 20 | **0** | 0 | 0 | jugador1 ×12, jugador2 ×8 |
| jug-inv | 20 | **0** | 0 | 0 | invitado ×13, jugador1 ×7 |
| jug-manual | 20 | **0** | 0 | 0 | jugador1 ×20 |
| jug-turno | 20 | **0** | 0 | 0 | jugador1 ×20 |
| manual-turno (simultáneo) | 20 | **0** | 0 | 0 | manual ×2, turno fijo ×18 |
| combinada (A+B contra A) | 20 | **0** | 0 | 0 | jugador1 ×9, jugador2 ×11 |
| combinada-rev (B contra A+B) | 20 | **0** | 0 | 0 | jugador1 ×11, jugador2 ×9 |
| manual-combinada (manual A+B contra A y B) | 20 | **0** | 0 | 0 | los dos jugadores, en A y en B; la manual A+B pierde, que es lo correcto |
| dos-pestanas | 20 | **0** | 0 | 0 | jugador1 ×21 (en una ronda las dos pestañas recibieron la misma fila: es válido) |
| cancelar-reintentar | 20 | **0** | 0 | 0 | 20/20 vuelve a apartar al instante; 20/20 otra persona toma la hora liberada al instante |
| **Total** | **220** | **0** | 0 | 0 | |

**Tolerancia** (11:56 hora de Bogotá):
- La hora de las 11:00 (minuto 56) y la de las 10:00 se rechazan para jugador e invitado, con un mensaje claro y sin error de la BD.
- La reserva manual del dueño en hora pasada se permite, como se decidió.
- **Dentro de la tolerancia** (corridas a las 12:03, 12:05 y 12:08): la hora de las 12:00 se acepta para jugador e invitado (`200`), y la de las 11:00 se rechaza (`400`, con mensaje claro). 3 de 3 corridas correctas.

**Latencia de apartar una hora** (desde Pasto hasta Vercel): invitado p95 1,1 s, jugador p95 1,1–1,2 s, manual p95 1,4 s (máximo 2,8 s), turno fijo p95 1,1 s. Está por encima de la meta de 0,8 s para APIs; se analiza en la Fase 5.

**No cubierto todavía:**
- `DB_RACE` (40 inserciones directas): necesita la service role en `.env.test`. La garantía de la base (exclusión + trigger + `unique_pitch_time`) ya quedó demostrada de forma indirecta en las 220 rondas.
- `turno-sobre-manual`: escenario nuevo, en orden y no simultáneo, para F2-3.

Revisando el código del dueño (`/api/admin-actions`) encontré:

| # | Gravedad | Qué pasa | Estado |
|---|---|---|---|
| F2-1 | **Alto** | Al reutilizar una fila cancelada, la reserva manual y el turno fijo la actualizaban solo por `id`, sin comprobar que siguiera cancelada. Si en ese instante un jugador la tomó como borrador, el dueño se la quitaba sin aviso: el jugador cree tener la hora y luego falla al pagar | Corregido en local: la actualización exige el mismo estado leído; si cambió, responde "hora ocupada" (409) |
| F2-2 | Medio | Una reserva manual de varias horas en la que una hora estaba ocupada respondía error, pero **dejaba confirmadas** las horas anteriores. El dueño cree que no se guardó nada y quedan horas bloqueadas | Corregido en local: todo o nada (se cancelan las horas ya guardadas) y 409 en vez de 400 |
| F2-3 | **Alto** (decisión tuya) | El turno fijo **sobrescribe sin avisar** una reserva manual del dueño en la misma cancha y hora (cualquier `owner_panel` confirmada). Ejemplo: "Juan, martes 8 pm", y luego un turno fijo de los martes a las 8 pm: Juan desaparece | Corregido en local (decisión del 2026-11-18: el turno fijo respeta toda reserva activa, también las del propio dueño). El escenario `manual-turno` lo detecta como sobrescritura |
| F2-5 | Medio | En modo "todo o nada" (`strict`, el que usa el modal), si una fecha chocaba se borraban las filas nuevas, pero las filas canceladas que se habían reutilizado **quedaban confirmadas**: un turno fijo a medias. El error tampoco decía qué fechas chocaban | Corregido en local: esas filas vuelven a quedar canceladas, y el mensaje lista hasta 5 fechas y horas en conflicto |
| F2-4 | Info | n8n v8 (producción) **no crea reservas**: solo consulta disponibilidad (`check_pitch_availability_n8nn`) y aprueba o rechaza pendientes (`resolve_pending_booking`). Los workflows viejos que usaban `create_booking` ya no funcionan (la función estaba rota y ahora está bloqueada) | El choque "WhatsApp contra web" no aplica. Confirmar que en n8n solo está activa la v8 |

### Verificación de la rotación de claves (2026-11-18, después de que la reportaste)

| Clave | Resultado | Cómo se comprobó |
|---|---|---|
| Supabase (claves JWT antiguas) | **NO rotada** | La clave anónima antigua que está en el repositorio sigue respondiendo `200`. Producción todavía la usa (el JavaScript público tiene esa misma clave y no tiene `sb_publishable_`). La service role filtrada está firmada con el mismo secreto y vence el **2036-08-20**, así que sigue siendo válida. Rotar la clave `sb_secret_…` no la invalida |
| Supabase — **re-verificado 2026-11-18 15:10** | **CERRADO** | Claves antiguas desactivadas (Supabase responde `401 Legacy API keys are disabled` a la anónima y a la service role filtradas). La página publicada ya usa `sb_publishable_…` (0 claves `eyJ…` en el JavaScript) y Supabase la acepta (`200`). Las rutas del servidor que usan la `sb_secret_…` nueva responden bien (`/api/promotions` devuelve datos). n8n usa credenciales Header Auth en lugar de `$env` |
| Evolution | **Sin confirmar** | La `EVOLUTION_API_KEY` de `.env.local` sigue siendo idéntica a la que está en 4 JSON del repositorio. No la probé contra el servidor (sería usar la llave filtrada). Si la cambiaste solo en Vercel y en Evolution, avísame |

### Fase 3 — Nadie cambia precios, promociones ni pagos (cerrada 2026-11-18)

Revisión de código:
- **Precio.** `create_booking` ignora `total_price` y `deposit_amount` del cliente: los recalcula `submit_booking_secure` en la base desde la cancha (por hora, o tarifa base y porcentaje o anticipo fijo). El esquema además rechaza los negativos.
- **Abonos.** `remaining-payment` exige ser dueño de **todas** las canchas, rechaza montos negativos y solo acepta comprobantes de la carpeta del propio usuario.
- **Promociones.** Crear y finalizar exigen dueño aprobado del complejo, con canchas del mismo complejo. Se valida el `Origin` (anti-CSRF), hay límite de 15 por minuto por usuario, y el canje pasa por `redeem_complex_reward` con bloqueo.
- **Reserva manual, turno fijo y canchas.** `verifyPitchOwnership` en cada acción.

| # | Gravedad | Qué pasa | Estado |
|---|---|---|---|
| F3-1 | **Alto** | Un dueño aprobado podía leer comprobantes de clientes de **otros complejos**. Así funcionaba la cadena: (1) el comprobante de una reserva en línea se guardaba como `receipts/guest_<milisegundos>.jpeg`, adivinable; (2) esa hora casi coincide con `expires_at - 10 min`, que es público vía `get_pitch_occupancy`; (3) el dueño podía poner esa ruta en `payment_proof_url` de una reserva suya (columna editable desde el navegador); (4) `/api/receipts` autoriza a quien tenga "una reserva que use esa ruta" y le firmaba el archivo. No se explotó contra clientes reales | **Corregido**: commit `abf274e` (nombres UUID) y migración `2026-12-03_comprobante_solo_propio.sql` ejecutada. El dueño que intenta adoptar un comprobante ajeno recibe `403` |
| F3-2 | Bajo | `update_pitch` aceptaba cualquier precio (`-5`) y porcentaje de anticipo (`500`) | **Corregido** (commit `abf274e`) |
| F3-3 | Bajo | `create_pitch` y `update_pitch` aceptaban en `linked_pitch_ids` canchas de **otro** complejo. La base no bloquea al otro complejo, porque el trigger solo busca combinadas del mismo complejo, pero quedaban datos inconsistentes | **Corregido** (commit `abf274e`) |
| F3-4 | Medio (Fase 6) | Los avisos de WhatsApp van al celular que escribe el cliente y, si el complejo no tiene WhatsApp propio, salen por la **línea central**. Cualquiera puede poner el número de otra persona y el sistema le escribe. Lo limita la cuota anti-acaparamiento | Se analiza en la Fase 6 |

| F3-5 | Bajo | `lock_booking` con una cancha que no existe responde `500` (mensaje genérico, sin detalles de Postgres). Debería ser `404`. El precio enviado como texto devuelve el mensaje técnico en inglés del validador ("Invalid input: expected number…") | Pendiente (cosmético) |

**Resultado de `precios-pagos.mjs` en producción (2026-11-18, tras el despliegue): 30 correctas, 0 advertencias, 0 fallas.**
- **Precio manipulado.** Con `1`, decimales raros (`0.0001`) o números gigantes (`1e15`), la reserva quedó guardada con el precio de la cancha (100.000) y el anticipo correcto (50.000). Texto y negativos: rechazados (`400`) sin crear la reserva.
- **Reservas ajenas.** Otro jugador no puede liberar, usar ni cancelar el borrador o la reserva ajena (`409`/`403`). Un jugador no puede confirmarse, registrarse abonos ni disparar el WhatsApp de "confirmada" (`403`).
- **Acciones de dueño con sesión de jugador.** Reserva manual, turno fijo, cambiar precio, borrar cancha y estadísticas: todas `403`.
- **Promociones.** El jugador no crea ni finaliza promociones. Un bono inexistente da `409` y una petición desde otro sitio da `403` (CSRF).
- **Comprobantes.** Sin sesión: `401`. Otro jugador: `403`. El cliente y el dueño de la cancha: `302` (acceso firmado). Adoptar un comprobante ajeno: `403`. Abonos negativos, comprobante de otra cuenta y URL externa: `400`.
- **Pendiente.** El canje de un bono dos veces en paralelo necesita un bono real ganado (promoción + reserva confirmada). La función `redeem_complex_reward` usa bloqueo de fila. Se puede montar con las cuentas de prueba si lo quieres.

Prueba: `loadtest/precios-pagos.mjs`. Cubre precio manipulado (5 variantes, verificando lo **guardado**), reservas ajenas, acciones de dueño con sesión de jugador, promociones, CSRF, comprobantes y abonos. Usa celular vacío para no enviar WhatsApp a nadie.

### Fase 4 — Bots y acaparamiento (en curso)

**Pruebas hechas por mí contra producción** (solo peticiones inválidas, que no escriben nada):

| Prueba | Resultado |
|---|---|
| 60 peticiones **seguidas** desde una IP a `/api/bookings` | Funciona: el `429` aparece en la petición 24 (límite de 25/min) |
| 40 peticiones **simultáneas** desde una IP | **0 de 40 frenadas**: Vercel las reparte entre varias instancias y cada una cuenta aparte en su memoria |
| 60 seguidas con IP falsa distinta en `X-Forwarded-For`, `X-Real-IP`, `x-vercel-forwarded-for` y `cf-connecting-ip` | No se evade: `429` en la petición 26. Vercel sobrescribe esas cabeceras; el dominio va directo a Vercel, sin Cloudflare |
| Invitado apartando sin token de Turnstile, y con un token falso | Pasa la verificación: **Turnstile no está activo en producción** |

| # | Gravedad | Qué pasa | Estado |
|---|---|---|---|
| F4-1 | **Alto** | El límite de peticiones vive en la memoria de cada instancia. Un bot que manda en paralelo (lo normal) no recibe `429`. Lo único que de verdad frena hoy son los límites de la base (cuota) | Requiere acción tuya: reglas del Vercel Firewall (abajo) |
| F4-2 | **Alto** | Sin CAPTCHA, un invitado cambia de "dispositivo" (cookie) cuando quiere. Una sola red retiene 10 horas apartadas renovables y **8 reservas por aprobar por complejo y por día** con cualquier imagen como comprobante. El límite es por día, sin tope total: en 7 días serían ~56 horas en un complejo desde una sola red, y con varias IPs (datos móviles, proxies) no hay tope | Requiere acción tuya: activar Turnstile. Propuesta de código: Turnstile también al enviar, y tope total por red |
| F4-3 | **Alto** (por confirmar) | La migración 2026-11-12 programa la tarea `pg_cron` `expire-stale-pending`, que cancela **reservas pendientes con comprobante** 10 minutos después de enviadas si el dueño no las aprobó. Guarda `payment_status='expired'`, que la constraint actual **rechaza**: si la tarea existe, falla cada 10 minutos y no expira nada (las pendientes retienen la hora indefinidamente). Si alguien "arregla" la constraint, empezaría a cancelar reservas pagadas | Pendiente: `loadtest/verificar_bd_fase4.sql` muestra si la tarea existe y cómo terminó |
| F4-4 | Bajo | La "sal" del hash de IP es, por defecto, la service role key. Al rotarla, los contadores por red empiezan de cero | Recomendación: definir `BOOKING_IP_SALT` en Vercel |

Prueba nueva: `loadtest/acaparamiento.mjs`. Cubre invitado con un dispositivo, invitado rotando cookies, jugador, pendientes con comprobante falso (2 días) y bloqueo de celulares solo por superadmin.

**Configuración recomendada del Vercel Firewall** (Project → Firewall → Configure → New rule; ver https://vercel.com/docs/vercel-firewall):

| Regla | Condición | Acción |
|---|---|---|
| Reservas | Path empieza por `/api/bookings` y método `POST` | Rate limit: 20 peticiones / 60 s por IP → `429` (Deny) |
| Subidas | Path empieza por `/api/upload` | Rate limit: 10 / 60 s por IP |
| API en general | Path empieza por `/api/` | Rate limit: 120 / 60 s por IP |
| Proxy de imágenes | Path = `/api/image-proxy` | Rate limit: 60 / 60 s por IP |
| Bots conocidos | Bot Protection / "Managed rules → Bot filter" | Challenge |
| En un ataque | Attack Challenge Mode (botón en Firewall) | Activar solo mientras dure |
| País (opcional) | Si todos los clientes están en Colombia: país ≠ CO en `/api/bookings` | Challenge (no Deny, por turistas) |

## 3. Acciones que solo tú puedes hacer (en orden)

0. ~~Ejecutar `migrations/2026-12-02_cerrar_vistas_y_permisos_sobrantes.sql`~~ **Hecho el 2026-11-18.**

1. **Supabase → Settings → API Keys.**
   - Pasa el frontend a la clave nueva `sb_publishable_…`: cambia `NEXT_PUBLIC_SUPABASE_ANON_KEY` en Vercel y redespliega.
   - Luego **desactiva las claves JWT antiguas** ("Disable legacy API keys"), o rota el JWT secret. Eso mata la service role filtrada. Ojo: también deja sin servicio cualquier n8n o script que siga usando las claves viejas, así que actualiza n8n primero (paso 3).
   - Si ya desactivaste las claves antiguas, dímelo y lo marco como mitigado.
2. **Evolution API.** Cambia `AUTHENTICATION_API_KEY` en el servidor de Evolution, actualiza `EVOLUTION_API_KEY` / `EVOLUTION_GLOBAL_APIKEY` en Vercel y en n8n, y redespliega. Si es posible, restringe Evolution para que solo lo alcancen Vercel y n8n (firewall o túnel).
3. **n8n.** Pon las claves en *Credentials* (tipo "Header Auth" o "Supabase API"), no pegadas en los nodos. Después exporta los workflows **sin** credenciales.
4. **New Relic.** Regenera la *license key* y ponla solo en una variable de entorno (`NEW_RELIC_LICENSE_KEY`); `newrelic.js` debe leerla de `process.env`.
5. **Repositorio.** Decide si lo haces privado. Cuando rotes las claves, autorízame a sacar los 19 JSON del repositorio (`git rm --cached` + `.gitignore`; te quedan copias locales).

## 4. Pendiente

Fases 1 a 8, resultados de carga y de doble reserva, y cómo repetir todo con un solo comando.
