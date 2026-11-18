#!/usr/bin/env bash
# Ejecuta toda la batería de pruebas.
#
#   bash loadtest/ejecutar.sh                 → seguridad + doble reserva + carga "humo"
#   bash loadtest/ejecutar.sh carga           → ... + carga de 10 min (100 usuarios)
#   bash loadtest/ejecutar.sh estres bots     → ... + estrés hasta 400 usuarios + ataque de bots
#
# Perfiles de carga: humo | carga | estres | pico | resistencia
set -uo pipefail
cd "$(dirname "$0")/.."

ENV_FILE="loadtest/.env.test"
if [ ! -f "$ENV_FILE" ]; then
  echo "Falta $ENV_FILE. Cópialo de loadtest/env.example y complétalo."; exit 2
fi
set -a; . "$ENV_FILE"; set +a

PROFILE="${1:-humo}"
WITH_BOTS="${2:-}"
mkdir -p loadtest/resultados
FAILS=0

command -v node >/dev/null || { echo "Instala Node 20+"; exit 2; }
command -v k6 >/dev/null || { echo "Instala k6: brew install k6"; exit 2; }

echo "Objetivo: $BASE_URL"
if ! curl -s -o /dev/null -m 15 "$BASE_URL"; then
  echo "No responde $BASE_URL. Para local: pnpm build && pnpm start (no uses 'pnpm dev': es lento y no representa producción)."; exit 2
fi

echo; echo "═══════ 1/4 SEGURIDAD ═══════"
node loadtest/seguridad.mjs || FAILS=$((FAILS+1))
node loadtest/rls.mjs || FAILS=$((FAILS+1))

echo; echo "═══════ 2/4 DOBLE RESERVA ═══════"
node loadtest/doble-reserva.mjs || FAILS=$((FAILS+1))
node loadtest/doble-reserva-escenarios.mjs || FAILS=$((FAILS+1))
node loadtest/precios-pagos.mjs || FAILS=$((FAILS+1))
node loadtest/acaparamiento.mjs || FAILS=$((FAILS+1))

echo; echo "═══════ 3/4 CARGA ($PROFILE) ═══════"
k6 run --quiet -e PROFILE="$PROFILE" loadtest/carga.k6.js || FAILS=$((FAILS+1))

if [ "$WITH_BOTS" = "bots" ]; then
  echo; echo "═══════ 4/4 ATAQUE DE BOTS ═══════"
  k6 run --quiet loadtest/bots.k6.js || FAILS=$((FAILS+1))
else
  echo; echo "(4/4 bots omitido: agrega 'bots' como segundo argumento)"
fi

echo
if [ "$FAILS" -eq 0 ]; then echo "✅ Todas las pruebas pasaron. Resultados detallados en loadtest/resultados/"
else echo "❌ $FAILS etapa(s) con fallas. Revisa arriba y loadtest/resultados/"; fi
exit "$FAILS"
