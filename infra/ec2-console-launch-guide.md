# Guía de consola — lanzar el EC2 desde cero (m7i-flex.large)

Hecha para el asistente "Launch an instance" que ya tienes abierto en AWS Console.
Yo no toco tu cuenta de AWS ni veo tu llave SSH ni tus claves de acceso — esto es
una guía para que tú hagas clic en cada paso. Las partes marcadas **TÚ** son las
que haces solo, sin pegarme nada de eso en el chat.

---

## 0. Antes de lanzar: confirma el costo

Pestaña **Billing and Cost Management → Credits** (en el menú de tu cuenta, arriba
a la derecha): confirma que tienes crédito promocional activo y que cubre el costo
de `m7i-flex.large` (~$0.096/h Linux ≈ $69/mes si la dejas prendida 24/7). Si el
crédito se agota, AWS empieza a cobrar a la tarjeta asociada a la cuenta.

> Nota aparte, sin ánimo de sermonear: usar varias cuentas nuevas solo para
> reclamar crédito gratis repetidamente va contra los términos de AWS y puede
> terminar en suspensión de la cuenta (y de todo lo que corra en ella). Si esta
> cuenta es "de verdad" tuya para este proyecto a largo plazo, perfecto; si es
> una cuenta desechable, ten un plan B antes de depender de ella en producción.

---

## 1. Nombre y AMI

- **Name**: `cancheros-infra` (o el que prefieras).
- **Application and OS Images (AMI)**: elige **Ubuntu Server 24.04 LTS** (x86_64).
  El script de arranque que preparé asume Ubuntu (`apt-get`, usuario `ubuntu`).
  Si prefieres Amazon Linux, dímelo y te adapto el script.

## 2. Instance type

Ya lo tienes seleccionado: **m7i-flex.large** (2 vCPU / 8 GiB). Está bien para
este stack: los límites de memoria de los 6 contenedores suman ~3.6 GiB, así que
sobra margen holgado.

## 3. Key pair (login) — **TÚ**

1. Clic en **Create new key pair**.
2. Tipo: **RSA**, formato: **.pem** (si vas a conectar desde macOS/Linux con `ssh`)
   o **.ppk** si usas PuTTY en Windows.
3. Nómbrala, p. ej. `cancheros-ec2-key`.
4. **Create key pair** → se descarga automáticamente. Guárdala en un lugar seguro
   de tu Mac, por ejemplo:
   ```bash
   mkdir -p ~/.ssh/aws
   mv ~/Downloads/cancheros-ec2-key.pem ~/.ssh/aws/
   chmod 400 ~/.ssh/aws/cancheros-ec2-key.pem
   ```
   **No me pegues el contenido de este archivo en el chat, ni ahora ni nunca.**

## 4. Network settings

1. **Edit** (o el VPC/subnet por defecto está bien para empezar).
2. **Firewall (security groups)** → **Create security group**, nombre `cancheros-sg`.
3. Reglas de entrada — deja **solo esta por ahora** (la cerraremos del todo cuando
   el Tunnel esté funcionando, según `hardening-runbook.md` sección 2.1):
   - Type: `SSH`, Port: `22`, Source: **My IP** (que AWS detecta solo — NO "Anywhere").
4. **No agregues reglas para 80 ni 443.** El compose blindado no publica esos
   puertos al host, así que no hace falta abrirlos — y abrirlos sin necesidad es
   exactamente el tipo de superficie que estamos eliminando.

## 5. Configure storage

Sube el disco raíz de 8 GiB (default) a **30 GiB**, tipo `gp3`. Con Docker
images + logs + historial de mensajes de WhatsApp, 8 GiB se queda corto rápido.

## 6. Advanced details — **aquí va el script** (la parte importante)

1. Baja hasta **Advanced details** → despliega la sección.
2. Busca el campo **User data** (al final de todo).
3. Abre el archivo `infra/user-data.sh` de este repo, cópialo **completo** (desde
   `#!/bin/bash` hasta la última línea) y pégalo en ese campo.
4. No contiene ningún secreto tuyo — solo instala software y deja una plantilla
   vacía para que tú completes las contraseñas después, por SSH.

## 7. Launch instance

Revisa el resumen y lanza. Espera 2-3 minutos: el script de arranque corre solo
en segundo plano (instala Docker, UFW, fail2ban, escribe los archivos).

---

## 8. Verificar que el bootstrap terminó bien

```bash
# Con tu IP pública (la ves en la consola EC2, pestaña "Instances")
ssh -i ~/.ssh/aws/cancheros-ec2-key.pem ubuntu@<IP-PUBLICA-DEL-EC2>
```

Al conectar verás el banner con los próximos pasos (viene del script). Si quieres
confirmar que todo instaló bien:
```bash
sudo tail -40 /var/log/cancheros-bootstrap.log   # debe terminar en "bootstrap completo"
docker --version && docker compose version        # ambos deben responder
sudo ufw status                                    # debe mostrar 22/tcp LIMIT
sudo systemctl status fail2ban --no-pager          # debe estar "active (running)"
ls -la /opt/cancheros                              # docker-compose.yml y .env.template
```

---

## 9. Completar tus secretos (esto SÍ lo haces tú, por SSH, nunca en el chat)

```bash
cd /opt/cancheros
cp .env.template .env
nano .env
```

Completa:
- `EVO_DB_PASSWORD` → una contraseña nueva y fuerte (genera una con `openssl rand -hex 24`).
- `REDIS_PASSWORD` → igual, otra contraseña nueva y distinta.
- `EVOLUTION_API_KEY` → reutiliza la misma que ya tienes en tu `.env.local` de Vercel
  (la variable `EVOLUTION_API_KEY`), para que tu app siga autenticándose igual.
- `CLOUDFLARE_TUNNEL_TOKEN` → lo obtienes en el paso siguiente (sección 10).

Guarda con `Ctrl+O`, `Enter`, `Ctrl+X`.

## 10. Crear el Cloudflare Tunnel y arrancar todo

Sigue `infra/hardening-runbook.md` desde la **sección 1.1** (crear el túnel en
el dashboard de Cloudflare) hasta el final. Cuando tengas el token en tu `.env`:

```bash
cd /opt/cancheros
docker compose up -d
docker compose ps                 # todos "healthy" en un par de minutos
docker logs -f cloudflared        # "Connection established" = funcionando
```

## 11. Cuando confirmes que el Tunnel funciona: cierra SSH también

Con el Tunnel activo no necesitas ni siquiera el puerto 22 abierto permanentemente.
Sigue la sección 2.1 "Ideal" de `infra/hardening-runbook.md` (AWS Systems Manager
Session Manager) para administrar la instancia sin ningún puerto de entrada.
