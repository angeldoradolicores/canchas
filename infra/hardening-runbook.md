# Runbook de hardening — EC2 (n8n + Evolution API)

Ejecuta esto **en tu EC2 por SSH**, en orden. No lo ejecuto yo: no tengo acceso
a esa máquina ni a tu cuenta de AWS. Cada bloque dice qué revisar antes de seguir.

---

## 0. Antes de nada: identifica tu instancia y Security Group

```bash
# En tu máquina local, con el AWS CLI configurado (aws configure):
aws ec2 describe-instances \
  --query "Reservations[].Instances[].{Id:InstanceId,Type:InstanceType,SGs:SecurityGroups[].GroupId,PublicIp:PublicIpAddress}" \
  --output table
```

Anota `InstanceId`, el `GroupId` del Security Group que tiene las reglas 80/443/22,
y el tipo de instancia (lo necesitas para la sección de capacidad del informe).

---

## 1. Migrar a Cloudflare Tunnel (elimina el vector de IP expuesta de raíz)

### 1.1 Crear el túnel (una vez, desde el dashboard de Cloudflare)
1. Cloudflare Dashboard → **Zero Trust** → **Networks** → **Tunnels** → **Create a tunnel**.
2. Nómbralo p. ej. `cancheros-ec2`. Copia el **token** que te da (es largo, tipo `eyJhbGci...`).
3. En **Public Hostnames**, agrega:
   - `n8n.cancheros.site` → Service `HTTP` → `nginx-proxy-manager:80` (o `n8n:5678` si prefieres saltarte NPM para este host)
   - `evolution.cancheros.site` → Service `HTTP` → `nginx-proxy-manager:80`
4. En **Access** (opcional pero recomendado para n8n): crea una **Application** sobre
   `n8n.cancheros.site` que exija login (tu email / Google / OTP) antes de llegar al editor.
   Así nadie en internet ve siquiera la pantalla de login de n8n.

### 1.2 Guardar el token en el servidor (NUNCA en el repo)
```bash
# En el EC2:
echo 'CLOUDFLARE_TUNNEL_TOKEN=<pega-aqui-el-token>' >> /ruta/a/tu/.env
```

### 1.3 Configurar los Proxy Hosts dentro de NPM
Dentro de NPM (vía el túnel de SSH al puerto 81, ver sección 4), crea/edita los
Proxy Hosts para que apunten a los contenedores por su nombre interno:
- `n8n.cancheros.site` → `n8n:5678`
- `evolution.cancheros.site` → `evolution-api:8080`

Y en **Advanced** de cada Proxy Host, añade para que los logs/rate-limit vean
la IP real del visitante (no la del edge de Cloudflare):
```nginx
set_real_ip_from 10.0.0.0/8;      # rango interno de cancheros-edge-net (ajusta si cambia)
real_ip_header CF-Connecting-IP;
real_ip_recursive on;
```

### 1.4 Desplegar el compose blindado
```bash
cd /ruta/del/proyecto
docker compose -f infra/docker.hardened.yml pull
docker compose -f infra/docker.hardened.yml up -d
docker compose -f infra/docker.hardened.yml ps   # todo "healthy"
docker logs -f cloudflared                        # debe decir "Connection established"
```
Prueba `https://n8n.cancheros.site` y `https://evolution.cancheros.site` — deben
responder normal, ahora pasando por Cloudflare.

### 1.5 Migrar el DNS (apenas confirmes que el túnel funciona)
En Cloudflare DNS (zona `cancheros.site`), crea:
- `n8n` → CNAME → `<tunnel-id>.cfargotunnel.com` (proxied, nube **naranja**)
- `evolution` → CNAME → `<tunnel-id>.cfargotunnel.com` (proxied, nube **naranja**)

Actualiza en tu `.env` de Vercel: `EVOLUTION_API_URL=https://evolution.cancheros.site`
y redeploy. Cuando confirmes que todo funciona por 24-48h, **borra** los registros
en DuckDNS (`n8n.cancheros.duckdns.org`, `evolution.cancheros.duckdns.org`) —
dejarlos vivos, aunque no los uses, sigue filtrando la IP real del EC2 a quien
los consulte.

---

## 2. Cerrar el Security Group de AWS (solo cuando el Tunnel ya esté activo)

Con el Tunnel funcionando, **no necesitas ningún puerto de entrada abierto**
para web. Cierra 80/443 por completo:

```bash
SG_ID="sg-xxxxxxxx"   # el que anotaste en el paso 0

# Ver reglas actuales
aws ec2 describe-security-groups --group-ids "$SG_ID" \
  --query "SecurityGroups[0].IpPermissions"

# Quitar 80/443 abiertos a 0.0.0.0/0 (ajusta los valores si los tuyos difieren)
aws ec2 revoke-security-group-ingress --group-id "$SG_ID" \
  --ip-permissions 'IpProtocol=tcp,FromPort=80,ToPort=80,IpRanges=[{CidrIp=0.0.0.0/0}]'
aws ec2 revoke-security-group-ingress --group-id "$SG_ID" \
  --ip-permissions 'IpProtocol=tcp,FromPort=443,ToPort=443,IpRanges=[{CidrIp=0.0.0.0/0}]'
```

### 2.1 SSH: restringir a tu IP (mínimo) o eliminar el puerto (ideal)

**Mínimo** — solo tu IP puede entrar por SSH:
```bash
MY_IP=$(curl -s https://checkip.amazonaws.com)
aws ec2 revoke-security-group-ingress --group-id "$SG_ID" \
  --ip-permissions 'IpProtocol=tcp,FromPort=22,ToPort=22,IpRanges=[{CidrIp=0.0.0.0/0}]'
aws ec2 authorize-security-group-ingress --group-id "$SG_ID" \
  --ip-permissions "IpProtocol=tcp,FromPort=22,ToPort=22,IpRanges=[{CidrIp=${MY_IP}/32}]"
```

**Ideal** — cierra el 22 del todo y usa AWS Systems Manager Session Manager
(requiere el agente SSM, que ya viene preinstalado en la mayoría de AMIs de
Amazon Linux/Ubuntu oficiales, y un rol IAM con la policy `AmazonSSMManagedInstanceCore`
asociado a la instancia):
```bash
aws ec2 revoke-security-group-ingress --group-id "$SG_ID" \
  --ip-permissions "IpProtocol=tcp,FromPort=22,ToPort=22,IpRanges=[{CidrIp=${MY_IP}/32}]"
# Conectarte sin SSH abierto:
aws ssm start-session --target <instance-id>
```

### 2.2 Verifica el resultado final
```bash
aws ec2 describe-security-groups --group-ids "$SG_ID" \
  --query "SecurityGroups[0].IpPermissions"
# Debe quedar: sin reglas de 80/443, y 22 ausente (si usas SSM) o restringido a tu /32.
```

---

## 3. UFW en el propio EC2 (defensa en profundidad, además del Security Group)

Útil si todavía no migraste al Tunnel, o como segunda capa aunque ya lo tengas.

```bash
sudo apt-get update && sudo apt-get install -y ufw

sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw limit 22/tcp        # rate-limit SSH (bloquea fuerza bruta básica)

# Si TODAVÍA no migraste al Tunnel: permitir 80/443 SOLO desde los rangos de Cloudflare
for ip in $(curl -s https://www.cloudflare.com/ips-v4); do
  sudo ufw allow from "$ip" to any port 80,443 proto tcp
done
for ip in $(curl -s https://www.cloudflare.com/ips-v6); do
  sudo ufw allow from "$ip" to any port 80,443 proto tcp
done

sudo ufw enable
sudo ufw status numbered
```

> Nota: los rangos de Cloudflare cambian de vez en cuando. Si usas esta opción,
> agenda un cron mensual que vuelva a descargar `ips-v4`/`ips-v6` y actualice las
> reglas. **Esto es innecesario una vez migres al Tunnel** (sección 1): ahí
> directamente no abres 80/443, ni en UFW ni en el Security Group.

---

## 4. Acceso al panel de NPM (puerto 81) sin abrirlo a internet

```bash
# Desde tu máquina local, túnel SSH al puerto 81 (que ya está bound a 127.0.0.1 en el EC2):
ssh -L 8181:127.0.0.1:81 usuario@<ip-o-host-del-ec2>
# Abre http://localhost:8181 en tu navegador local.

# Si usas SSM en vez de SSH:
aws ssm start-session --target <instance-id> \
  --document-name AWS-StartPortForwardingSession \
  --parameters '{"portNumber":["81"],"localPortNumber":["8181"]}'
```

---

## 5. Fail2ban para los logs de NPM

Los logs de NPM viven dentro del volumen `npm_data` (ruta real en el host):
```bash
docker volume inspect npm_data --format '{{ .Mountpoint }}'
# ej: /var/lib/docker/volumes/npm_data/_data
```
Dentro de esa ruta, en `/data/logs/`, hay archivos `*_access.log` y `*_error.log`
por cada Proxy Host.

```bash
sudo apt-get install -y fail2ban

sudo tee /etc/fail2ban/filter.d/npm-404.conf >/dev/null <<'EOF'
[Definition]
failregex = ^<HOST> .* "(GET|POST|HEAD).*" (404|444) 
ignoreregex =
EOF

sudo tee /etc/fail2ban/filter.d/npm-auth.conf >/dev/null <<'EOF'
[Definition]
failregex = ^<HOST> .* "(GET|POST) /api/(auth|users|tokens).*" (401|403) 
ignoreregex =
EOF

NPM_LOG_DIR="$(docker volume inspect npm_data --format '{{ .Mountpoint }}')/logs"

sudo tee /etc/fail2ban/jail.local >/dev/null <<EOF
[sshd]
enabled = true
port    = 22
maxretry = 4
bantime  = 3600

[npm-404]
enabled  = true
filter   = npm-404
logpath  = ${NPM_LOG_DIR}/*_access.log
maxretry = 20
findtime = 60
bantime  = 1800
action   = iptables-allports[name=npm-404]

[npm-auth]
enabled  = true
filter   = npm-auth
logpath  = ${NPM_LOG_DIR}/*_access.log
maxretry = 5
findtime = 300
bantime  = 3600
action   = iptables-allports[name=npm-auth]
EOF

sudo systemctl restart fail2ban
sudo fail2ban-client status
```

> **Importante:** si ya migraste al Tunnel y configuraste `real_ip_header
> CF-Connecting-IP` (paso 1.3), estos bans serán sobre la IP real del atacante.
> Si NO lo configuraste, todas las peticiones aparentan venir de las IPs del
> edge de Cloudflare y fail2ban terminaría baneando a Cloudflare — no actives
> esto sin haber hecho 1.3 primero.

---

## 6. Fijar versiones por digest (elimina el riesgo de "latest" moviéndose solo)

`cloudflared`, `nginx-proxy-manager` y `n8n` en el compose usan tags que AWS/Docker
Hub pueden actualizar en cualquier momento sin avisar (`:latest`). Un `docker compose
pull` futuro podría traerte una versión nueva con un bug o una brecha sin que tú lo
pidieras. La forma correcta de fijarlos no es adivinar un número de versión — es
capturar el **digest exacto** que ya probaste y que sabes que funciona:

```bash
cd /opt/cancheros
docker compose pull
docker compose up -d
docker compose ps   # confirma que todo quedó "healthy" con esta versión

# Captura el digest real de cada imagen que corre ahora:
docker inspect --format '{{.RepoDigests}}' cloudflared nginx-proxy-manager n8n evolution-postgres evolution-redis evolution-api
```

Reemplaza en `docker-compose.yml` cada `image:` por su digest exacto, por ejemplo:
```yaml
image: cloudflare/cloudflared@sha256:<el-digest-que-copiaste>
```

Así el stack queda **congelado** a esa versión exacta hasta que tú decidas actualizar
a propósito (repitiendo este mismo proceso). Repite esto cada 1-2 meses como mantenimiento
deliberado, no dejes que pase un año sin revisar — las imágenes viejas acumulan CVEs sin parchar.

---

## 7. Retención y limpieza automática (mensajes y medios) — para que el disco no se llene

Evolution API con `DATABASE_SAVE_DATA_NEW_MESSAGE=true` guarda **cada mensaje** en
Postgres para siempre, y además descarga medios (audios, imágenes, PDFs de
comprobantes) a `/evolution/store` dentro del contenedor. Sin limpieza, esto crece
sin límite y en algún momento llena el disco de 30 GiB y tumba todo el stack
(Postgres no puede escribir con disco lleno). Esto no viene resuelto por defecto
en el compose — hay que agregarlo.

### 7.1 Verifica el esquema real antes de borrar nada (una sola vez)

```bash
docker exec -it evolution-postgres psql -U "$EVO_DB_USER" -d "$EVO_DB_NAME" -c '\dt'
docker exec -it evolution-postgres psql -U "$EVO_DB_USER" -d "$EVO_DB_NAME" -c '\d "Message"'
```

Confirma el nombre exacto de la columna de fecha (en Evolution API v2 suele ser
`"messageTimestamp"` o `"createdAt"` según la versión) y su tipo (epoch numérico
o `timestamp`). El script de abajo asume `"messageTimestamp"` como epoch en
segundos — **ajusta la columna/conversión si tu `\d` muestra algo distinto antes
de ejecutar el borrado real.**

### 7.2 Script de limpieza (dry-run primero, sin excepciones)

```bash
sudo tee /opt/cancheros/cleanup-messages.sh >/dev/null <<'EOF'
#!/bin/bash
set -euo pipefail

RETENTION_DAYS=30   # ajusta según cuánto historial necesitas para soporte/trazabilidad
CUTOFF_EPOCH=$(date -d "-${RETENTION_DAYS} days" +%s)

echo "== Conteo de mensajes a borrar (más viejos que ${RETENTION_DAYS} días) =="
docker exec evolution-postgres psql -U "$EVO_DB_USER" -d "$EVO_DB_NAME" -t -c \
  "SELECT count(*) FROM \"Message\" WHERE \"messageTimestamp\" < ${CUTOFF_EPOCH};"

if [ "${1:-}" != "--confirm" ]; then
  echo "Dry-run. Para borrar de verdad: $0 --confirm"
  exit 0
fi

docker exec evolution-postgres psql -U "$EVO_DB_USER" -d "$EVO_DB_NAME" -c \
  "DELETE FROM \"Message\" WHERE \"messageTimestamp\" < ${CUTOFF_EPOCH};"
docker exec evolution-postgres psql -U "$EVO_DB_USER" -d "$EVO_DB_NAME" -c \
  "VACUUM (ANALYZE) \"Message\";"

echo "== Purgando medios descargados (audios/imágenes) más viejos que ${RETENTION_DAYS} días =="
# SOLO /evolution/store (medios). NUNCA /evolution/instances: ahí vive la sesión
# autenticada de WhatsApp — borrarla desconecta el número y hay que volver a escanear el QR.
docker exec evolution-api find /evolution/store -type f -mtime +${RETENTION_DAYS} -delete

echo "Limpieza completa: $(date)"
EOF

sudo chmod +x /opt/cancheros/cleanup-messages.sh
```

Primero pruébalo en modo lectura (no borra nada):
```bash
/opt/cancheros/cleanup-messages.sh
```

Si el conteo tiene sentido, ejecútalo de verdad una vez:
```bash
/opt/cancheros/cleanup-messages.sh --confirm
```

### 7.3 Automatízalo (cron diario, de madrugada)

```bash
( sudo crontab -l 2>/dev/null; echo "15 3 * * * /opt/cancheros/cleanup-messages.sh --confirm >> /var/log/cancheros-cleanup.log 2>&1" ) | sudo crontab -
sudo crontab -l   # confirma que quedó agendado
```

> Si necesitas conservar los comprobantes de pago más tiempo por trazabilidad
> contable, **eso ya vive en R2 vía tus rutas `/api/receipts/...`, no en este
> volumen** — este cleanup solo afecta el historial de mensajes de WhatsApp y los
> medios que Evolution API cachea localmente, no tus registros de reservas/pagos
> en Supabase. Puedes subir `RETENTION_DAYS` a 60-90 si quieres más margen de
> soporte antes de borrar.

---

## 8. Checklist final

- [ ] Túnel de Cloudflare activo y `docker logs cloudflared` muestra conexión establecida.
- [ ] `n8n.cancheros.site` y `evolution.cancheros.site` resuelven y funcionan vía Cloudflare.
- [ ] DNS en Cloudflare para esos dos hosts, proxied (nube naranja).
- [ ] Registros viejos en DuckDNS eliminados.
- [ ] Security Group sin reglas 80/443 abiertas; SSH restringido o cerrado (SSM).
- [ ] `docker compose -f infra/docker.hardened.yml ps` → todos los servicios `healthy`.
- [ ] `real_ip_header CF-Connecting-IP` configurado en los Proxy Hosts de NPM.
- [ ] Fail2ban activo y viendo IPs reales (no las de Cloudflare).
- [ ] Imágenes `cloudflared`/`npm`/`n8n` fijadas por digest (sección 6), no en `:latest`.
- [ ] Cron de limpieza de mensajes/medios agendado y probado con `--confirm` al menos una vez (sección 7).
- [ ] Alarma de CloudWatch en CPU/memoria/disco de la instancia (ver informe, sección de capacidad).
