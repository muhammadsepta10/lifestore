#!/usr/bin/env bash
# Menjalankan skrip Playwright manual alur kasir (scripts/manual/alur-kasir.mjs) terhadap api + web
# hasil build di atas database baru. Butuh Postgres lokal (superuser) dan paket `playwright`.
#
#   bash scripts/manual/jalankan-alur-kasir.sh
#
# Variabel: PG_ADMIN_URL (default postgres://postgres@localhost:5432), PORT_API (3141), PORT_WEB (3142),
# PW_CHANNEL (misal `chrome`), HEADED=1, SCREENSHOT_DIR, LEWATI_BUILD=1.
set -euo pipefail
cd "$(dirname "$0")/../.."

PG="${PG_ADMIN_URL:-postgres://postgres@localhost:5432}"
PORT_API="${PORT_API:-3141}"
PORT_WEB="${PORT_WEB:-3142}"
KERJA="$(mktemp -d)"
DB="alur_kasir_$$"
PERAN="alur_kasir_app_$$"

bersihkan() {
  [ -n "${PID_API:-}" ] && kill "$PID_API" 2>/dev/null || true
  [ -n "${PID_WEB:-}" ] && kill "$PID_WEB" 2>/dev/null || true
  sleep 1
  psql "$PG/postgres" -qc "DROP DATABASE IF EXISTS $DB WITH (FORCE)" -c "DROP ROLE IF EXISTS $PERAN" >/dev/null 2>&1 || true
  echo "Log: $KERJA"
}
trap bersihkan EXIT

if [ -z "${LEWATI_BUILD:-}" ]; then
  pnpm turbo run build >"$KERJA/build.log" 2>&1 || { tail -30 "$KERJA/build.log"; exit 1; }
fi

psql "$PG/postgres" -qc "CREATE DATABASE $DB"
DATABASE_ADMIN_URL="$PG/$DB" pnpm --silent db:migrate >"$KERJA/migrate.log" 2>&1
# Peran aplikasi tanpa BYPASSRLS, seperti di production.
psql "$PG/$DB" -qc "CREATE ROLE $PERAN LOGIN PASSWORD 'alur' IN ROLE lifestore_app" -c "GRANT CONNECT ON DATABASE $DB TO $PERAN"
URL_APP="$(echo "$PG" | sed -E "s#//[^@]*@#//$PERAN:alur@#")/$DB"

(cd apps/api && DATABASE_URL="$URL_APP" PORT="$PORT_API" WEB_URL="http://localhost:$PORT_WEB" exec node dist/main.js) >"$KERJA/api.log" 2>&1 &
PID_API=$!
(cd apps/web && API_INTERNAL_URL="http://localhost:$PORT_API" exec node_modules/.bin/next start -p "$PORT_WEB") >"$KERJA/web.log" 2>&1 &
PID_WEB=$!

for _ in $(seq 1 60); do
  if curl -sf "http://localhost:$PORT_API/v1/health" >/dev/null && curl -sf -o /dev/null "http://localhost:$PORT_WEB/kasir"; then break; fi
  sleep 1
done

NODE_PATH="${NODE_PATH:-$(npm root -g)}" WEB_URL="http://localhost:$PORT_WEB" API_URL="http://localhost:$PORT_API" API_LOG="$KERJA/api.log" \
  node scripts/manual/alur-kasir.mjs
