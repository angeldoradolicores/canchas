#!/bin/bash
# =============================================================================
# Bootstrap de EC2 para Cancheros (n8n + Evolution API) — hardened.
# Esto se pega en "Advanced details -> User data" al lanzar la instancia.
# Se ejecuta UNA SOLA VEZ, automaticamente, como root, en el primer arranque.
#
# Que SI hace solo:
#   - Instala Docker + el plugin de Compose
#   - Instala y activa UFW (firewall) y fail2ban
#   - Escribe /opt/cancheros/docker-compose.yml (el compose blindado completo)
#   - Escribe /opt/cancheros/.env.template (SIN secretos, para que tu los llenes)
#
# Que NO hace (a proposito, por seguridad):
#   - No arranca los contenedores todavia (faltan tus secretos reales)
#   - No descarga ni conoce ningun secreto tuyo
# =============================================================================
set -euo pipefail
exec > >(tee -a /var/log/cancheros-bootstrap.log) 2>&1
echo "=== Cancheros bootstrap iniciado: $(date -u) ==="

export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get upgrade -y
apt-get install -y ufw fail2ban curl ca-certificates

# --- Docker Engine + Compose plugin (metodo oficial) -------------------------
curl -fsSL https://get.docker.com -o /tmp/get-docker.sh
sh /tmp/get-docker.sh
rm -f /tmp/get-docker.sh
systemctl enable docker
systemctl start docker
usermod -aG docker ubuntu 2>/dev/null || true

# --- Firewall: todo cerrado salvo SSH con rate-limit --------------------------
# (80/443 NO se necesitan: el compose blindado no publica esos puertos al host;
#  todo el trafico web entra por el tunel saliente de Cloudflare.)
ufw default deny incoming
ufw default allow outgoing
ufw limit 22/tcp
ufw --force enable

systemctl enable fail2ban
systemctl restart fail2ban

mkdir -p /opt/cancheros
cd /opt/cancheros

# --- Compose blindado (identico a infra/docker.hardened.yml del repo) --------
cat > docker-compose.yml <<'COMPOSE_EOF'
# =============================================================================
# DOCKER COMPOSE BLINDADO — Cancheros infra (n8n + Evolution API)
# Fecha: 2026-11-12
#
# Cambio de arquitectura principal: Cloudflare Tunnel (cloudflared) sustituye
# los puertos públicos 80/443 en el Security Group y en npm. El EC2 queda SIN
# ningún puerto de entrada abierto a internet (ni siquiera 80/443): cloudflared
# abre una conexión SALIENTE hacia el borde de Cloudflare, así que no hay IP:puerto
# público que escanear, filtrar ni atacar con DDoS L4/L7. Todo el tráfico entra
# por el edge de Cloudflare igual que cancheros.site.
#
# Segmentación de red: se reemplaza la única red "cancheros-net" (bridge plano,
# donde CUALQUIER contenedor puede hablar con CUALQUIER otro en CUALQUIER puerto)
# por tres redes:
#   - edge-net  : cloudflared <-> npm                         (nadie más)
#   - app-net   : npm <-> n8n, npm <-> evolution-api            (proxy inverso)
#   - data-net  : evolution-api <-> postgres, evolution-api <-> redis (interna,
#                 sin salida a internet; n8n NO está aquí, no la necesita)
#
# Requiere añadir a tu .env (o .env.local en el servidor, NO en el repo):
#   CLOUDFLARE_TUNNEL_TOKEN=<token del túnel creado en Zero Trust>
#
# Aplicar:
#   docker compose -f infra/docker.hardened.yml up -d
#   (revisa primero la sección "MIGRACIÓN" en el informe antes de aplicar)
# =============================================================================

networks:
  edge-net:
    name: cancheros-edge-net
    driver: bridge
  app-net:
    name: cancheros-app-net
    driver: bridge
  data-net:
    name: cancheros-data-net
    driver: bridge
    internal: true   # sin salida a internet: ni evolution-api ni postgres/redis
                      # pueden iniciar conexiones salientes por esta red.

volumes:
  npm_data:
  npm_letsencrypt:
  postgres_data:
  redis_data:
  evolution_instances:
  evolution_store:
  n8n_data:

x-logging: &default-logging
  driver: json-file
  options:
    max-size: "10m"
    max-file: "5"
  # Evita que logs de alto volumen (mensajes de WhatsApp, ejecuciones de n8n)
  # llenen el disco del EC2 y tumben TODOS los contenedores por falta de espacio.

services:
  # -------------------------------------------------------------
  # 0. CLOUDFLARE TUNNEL — único componente con salida a internet.
  #    Sin puertos publicados: nada escucha en la IP pública del EC2.
  # -------------------------------------------------------------
  cloudflared:
    image: cloudflare/cloudflared:latest
    container_name: cloudflared
    restart: unless-stopped
    command: tunnel --no-autoupdate run --token ${CLOUDFLARE_TUNNEL_TOKEN}
    networks:
      - edge-net
    security_opt:
      - no-new-privileges:true
    mem_limit: 256m
    cpus: 0.5
    logging: *default-logging

  # -------------------------------------------------------------
  # 1. NGINX PROXY MANAGER — ya NO publica 80/443 al host.
  #    cloudflared lo alcanza por red interna (npm:80 / npm:443).
  # -------------------------------------------------------------
  npm:
    image: jc21/nginx-proxy-manager:latest
    container_name: nginx-proxy-manager
    restart: unless-stopped
    ports:
      - "127.0.0.1:81:81"   # Admin: solo localhost (acceso vía SSM port-forward o túnel SSH)
    volumes:
      - npm_data:/data
      - npm_letsencrypt:/etc/letsencrypt
    networks:
      - edge-net
      - app-net
    security_opt:
      - no-new-privileges:true
    mem_limit: 512m
    mem_reservation: 128m
    cpus: 1.0
    logging: *default-logging
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://127.0.0.1:81/api"]
      interval: 15s
      timeout: 5s
      retries: 5

  # -------------------------------------------------------------
  # 2. BASE DE DATOS (PostgreSQL para Evolution API) — solo en data-net,
  #    sin publicar puerto al host, sin salida a internet.
  # -------------------------------------------------------------
  postgres:
    image: postgres:15-alpine
    container_name: evolution-postgres
    restart: unless-stopped
    environment:
      POSTGRES_DB: ${EVO_DB_NAME}
      POSTGRES_USER: ${EVO_DB_USER}
      POSTGRES_PASSWORD: ${EVO_DB_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    networks:
      - data-net
    security_opt:
      - no-new-privileges:true
    mem_limit: 768m
    mem_reservation: 256m
    cpus: 1.0
    logging: *default-logging
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${EVO_DB_USER} -d ${EVO_DB_NAME}"]
      interval: 5s
      timeout: 5s
      retries: 5

  # -------------------------------------------------------------
  # 3. CACHÉ & COLAS (Redis) — con límite de memoria y política de
  #    expulsión. Sin esto, un pico de mensajes/sesiones puede agotar
  #    la RAM del EC2 y el OOM killer del kernel mata contenedores al
  #    azar (incluido Postgres), tumbando todo el stack.
  # -------------------------------------------------------------
  redis:
    image: redis:alpine
    container_name: evolution-redis
    restart: unless-stopped
    command: >
      redis-server
      --requirepass ${REDIS_PASSWORD}
      --appendonly yes
      --maxmemory 256mb
      --maxmemory-policy allkeys-lru
    volumes:
      - redis_data:/data
    networks:
      - data-net
    security_opt:
      - no-new-privileges:true
    mem_limit: 320m
    cpus: 0.5
    logging: *default-logging
    healthcheck:
      test: ["CMD", "redis-cli", "-a", "${REDIS_PASSWORD}", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

  # -------------------------------------------------------------
  # 4. EVOLUTION API v2 — en app-net (para que npm la alcance y la
  #    publiques como evolution.cancheros.site vía el Tunnel) y en
  #    data-net (para hablar con su Postgres/Redis). NO en edge-net:
  #    no puede hablar directo con cloudflared, solo a través de npm.
  # -------------------------------------------------------------
  evolution-api:
    image: evoapicloud/evolution-api:v2.3.7
    container_name: evolution-api
    restart: unless-stopped
    environment:
      - SERVER_TYPE=http
      - SERVER_PORT=8080
      # Dominio FINAL recomendado: subdominio de cancheros.site detrás del
      # Tunnel, no de duckdns.org (ver informe, sección "Migración de DNS").
      - SERVER_URL=https://evolution.cancheros.site
      - AUTHENTICATION_API_KEY=${EVOLUTION_API_KEY}
      # CORS restringido al dominio real de la app (nunca '*' con credentials:true)
      - CORS_ORIGIN=https://cancheros.site
      - CORS_METHODS=GET,POST,PUT,DELETE
      - CORS_CREDENTIALS=true
      - DATABASE_PROVIDER=postgresql
      - DATABASE_CONNECTION_URI=postgresql://${EVO_DB_USER}:${EVO_DB_PASSWORD}@evolution-postgres:5432/${EVO_DB_NAME}
      - DATABASE_SAVE_DATA_INSTANCE=true
      - DATABASE_SAVE_DATA_NEW_MESSAGE=true
      - DATABASE_SAVE_MESSAGE_UPDATE=true
      - DATABASE_SAVE_DATA_CONTACTS=true
      - DATABASE_SAVE_DATA_CHATS=true
      - CACHE_REDIS_ENABLED=true
      - CACHE_REDIS_URI=redis://:${REDIS_PASSWORD}@evolution-redis:6379/1
      - CACHE_REDIS_PREFIX_KEY=evolution
      - CACHE_REDIS_SAVE_INSTANCES=true
      - WEBSOCKET_ENABLED=true
      - WEBHOOK_GLOBAL_ENABLED=false
    volumes:
      - evolution_instances:/evolution/instances
      - evolution_store:/evolution/store
    networks:
      - app-net
      - data-net
    security_opt:
      - no-new-privileges:true
    mem_limit: 1g
    mem_reservation: 256m
    cpus: 1.5
    logging: *default-logging
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    healthcheck:
      test: ["CMD-SHELL", "wget -qO- http://127.0.0.1:8080/ || exit 1"]
      interval: 15s
      timeout: 5s
      retries: 5

  # -------------------------------------------------------------
  # 5. n8n — solo en app-net (no necesita hablar directo con el
  #    Postgres/Redis de Evolution; consume su API por HTTP vía npm).
  # -------------------------------------------------------------
  n8n:
    image: docker.n8n.io/n8nio/n8n:latest
    container_name: n8n
    user: "1000:1000"
    restart: unless-stopped
    environment:
      - N8N_HOST=n8n.cancheros.site
      - N8N_PORT=5678
      - N8N_PROTOCOL=https
      - WEBHOOK_URL=https://n8n.cancheros.site/
      - N8N_EDITOR_BASE_URL=https://n8n.cancheros.site/
      - NODE_ENV=production
      - GENERIC_TIMEZONE=America/Bogota
      - TZ=America/Bogota
      - EXECUTIONS_DATA_PRUNE=true
      - EXECUTIONS_DATA_MAX_AGE=168
      - EXECUTIONS_DATA_PRUNE_MAX_COUNT=50000
      # Secretos que el workflow de WhatsApp lee via {{ $env.VARIABLE }} en vez
      # de tenerlos quemados en texto plano dentro del JSON del workflow.
      - EVOLUTION_API_KEY=${EVOLUTION_API_KEY}
      - SUPABASE_URL=${SUPABASE_URL}
      - SUPABASE_ANON_KEY=${SUPABASE_ANON_KEY}
      - SUPABASE_SERVICE_ROLE_KEY=${SUPABASE_SERVICE_ROLE_KEY}
      # El editor de n8n queda detrás de Cloudflare Access (Zero Trust): solo
      # tu correo/equipo puede abrirlo, nadie más en internet llega siquiera
      # a la pantalla de login. Configúralo en el dashboard de Cloudflare
      # Zero Trust -> Access -> Applications, apuntando a este hostname.
    volumes:
      - n8n_data:/home/node/.n8n
    networks:
      - app-net
    security_opt:
      - no-new-privileges:true
    mem_limit: 2g
    mem_reservation: 256m
    cpus: 1.0
    logging: *default-logging
    healthcheck:
      test: ["CMD-SHELL", "wget -qO- http://127.0.0.1:5678/healthz || exit 1"]
      interval: 15s
      timeout: 5s
      retries: 5
COMPOSE_EOF

# --- Plantilla de secretos: TU la completas por SSH, nunca va prellenada -----
cat > .env.template <<'ENV_EOF'
# ==============================================================================
# Copia este archivo a .env y completa los valores reales TU MISMO por SSH:
#   cp .env.template .env && nano .env
# NUNCA subas .env a git, ni lo pegues en un chat, ni se lo des a nadie.
# ==============================================================================
EVO_DB_NAME=evolution
EVO_DB_USER=evolution
EVO_DB_PASSWORD=
REDIS_PASSWORD=
EVOLUTION_API_KEY=
CLOUDFLARE_TUNNEL_TOKEN=
# Usados por el workflow de n8n (antes quemados en el JSON, ver auditoria 2026-11-13)
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ENV_EOF

chown -R ubuntu:ubuntu /opt/cancheros

# --- Banner con los proximos pasos, visible al conectarte por SSH ------------
cat > /etc/motd <<'MOTD_EOF'

============================================================
  CANCHEROS EC2 - Bootstrap completo. Proximos pasos:
============================================================
  1) cd /opt/cancheros
  2) cp .env.template .env
  3) nano .env    -> completa EVO_DB_PASSWORD, REDIS_PASSWORD,
                      EVOLUTION_API_KEY (reusa la de tu .env.local
                      de Vercel) y CLOUDFLARE_TUNNEL_TOKEN (lo
                      generas en Cloudflare Zero Trust -> Tunnels)
  4) docker compose up -d
  5) docker compose ps        -> todos "healthy"
  6) docker logs -f cloudflared -> debe decir "Connection established"

  Guia completa: infra/ec2-console-launch-guide.md (seccion 5 en
  adelante) y infra/hardening-runbook.md del repositorio.
============================================================

MOTD_EOF

echo "=== Cancheros bootstrap completo: $(date -u) ==="
