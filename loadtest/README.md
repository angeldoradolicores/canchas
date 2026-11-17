# Pruebas de carga, doble reserva, seguridad y bots

| Script | Qué prueba | ¿Escribe datos? |
|---|---|---|
| `seguridad.mjs` | 60 ataques típicos: datos privados sin sesión, escalada de rol, RPC internas, APIs sin sesión, jugador haciendo cosas de dueño, subida de archivos maliciosos, SSRF, redirección abierta, CSRF, inyección, cuerpos gigantes, ráfagas de bots, IP falsificada, fuerza bruta de login | No |
| `doble-reserva.mjs` | Invitados, jugadores, reserva manual y turno fijo (y opcionalmente 40 inserciones directas a la BD) tomando la **misma hora al mismo tiempo**. Verifica que nunca queden 2 reservas activas y limpia al final | Sí, en la cancha de prueba (y la limpia) |
| `carga.k6.js` | Tráfico realista: 70% visitantes, 20% jugadores, 10% dueños. Perfiles `humo`, `carga`, `estres`, `pico`, `resistencia` | Solo con `ALLOW_WRITES=1` (bloquea y libera horas) |
| `bots.k6.js` | Inundación de un bot mientras un cliente real navega: ¿lo frena?, ¿se cae?, ¿el cliente real lo nota? | No |

## 1. Preparación (una sola vez)

1. Instala k6: `brew install k6`
2. Crea **cuentas de prueba** (nunca uses cuentas reales):
   - dueño: `tucorreo+dueno@gmail.com`, apruébalo como dueño y crea un **complejo de prueba** con 1 o 2 canchas.
   - jugadores: `tucorreo+jugador1@gmail.com`, `tucorreo+jugador2@gmail.com`.
3. `cp loadtest/env.example loadtest/.env.test` y complétalo (este archivo no se sube a git).

## 2. Ejecutar

```bash
bash loadtest/ejecutar.sh               # seguridad + doble reserva + carga de 1 minuto
bash loadtest/ejecutar.sh carga         # + 10 minutos hasta 100 usuarios
bash loadtest/ejecutar.sh estres bots   # + hasta 400 usuarios + ataque de bots
```

O por separado:
```bash
set -a; . loadtest/.env.test; set +a
node loadtest/seguridad.mjs
node loadtest/doble-reserva.mjs
DB_RACE=1 node loadtest/doble-reserva.mjs        # también ataca la base directamente (requiere service role)
k6 run -e PROFILE=pico loadtest/carga.k6.js
k6 run -e BOT_RPS=80 -e DURACION=2m loadtest/bots.k6.js
```

Los resultados detallados quedan en `loadtest/resultados/` (JSON de k6).

## 3. ¿Local o producción?

| | Local (`pnpm build && pnpm start`) | Producción (`https://www.cancheros.site`) |
|---|---|---|
| Seguridad | ✅ | ✅ (no escribe nada) |
| Doble reserva | ✅ | ✅ solo con cancha de prueba + `I_UNDERSTAND_PRODUCTION=1` |
| Carga humo/carga | ✅ | ✅ de madrugada |
| Estrés/pico/bots | ✅ (mide tu PC, no Vercel) | ⚠️ cuesta dinero en Vercel y Supabase y afecta a usuarios reales. De madrugada y avisando |

Usa **`www.cancheros.site`**: sin `www` todo redirige (308) y las pruebas dan resultados falsos.
Local usa la misma base de Supabase que producción salvo que cambies `.env.local`: las reservas de prueba son reales en ambos casos.

## 4. Cómo leer los resultados

- **p95**: el 95% de las peticiones respondió en menos de ese tiempo. Meta: páginas < 1,5 s, APIs < 0,8 s.
- **429 / limitado**: el límite anti-bots funcionando (no es un error).
- **5xx / errores reales**: el servidor falló. Meta < 1%.
- En estrés, el punto de quiebre es donde la p95 se dispara o aparecen 5xx: ese es el máximo de usuarios simultáneos que aguanta.
- Desde un solo computador todo sale de una IP: `/api/bookings` deja pasar 25 por minuto. Para medir reservas masivas usa `DB_RACE=1`, o k6 Cloud con varias IPs.

## 5. Límites que el código no puede cubrir

- **Botnets (miles de IPs):** el límite está en la memoria de cada instancia de Vercel. Activa en Vercel › Firewall las *Rate Limiting rules* para `/api/*` y el *Attack Challenge Mode* cuando haya un ataque.
- **Fuerza bruta de login:** Supabase › Authentication › Rate Limits, y activa CAPTCHA (Cloudflare Turnstile) en Auth.

## 6. Límites anti-acaparamiento (migración 2026-11-27)

La base de datos limita cuántas horas puede ocupar una misma persona, dispositivo o red:
invitados 2 horas a la vez y 2 pendientes por complejo y día (por celular **y** por dispositivo),
usuarios con cuenta 4, y por red (IP) 10 apartadas / 8 pendientes. Los contratos, turnos fijos y
reservas manuales del dueño **no** cuentan.

Por eso `doble-reserva.mjs` con muchas rondas desde un solo computador puede recibir respuestas
`429` con códigos `QUOTA_*`: es el límite funcionando, no un error.
