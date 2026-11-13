#!/usr/bin/env bash
# Satu perintah untuk menyalakan stack lokal: build, nyalakan, lalu jalankan migrasi.
# (Di staging/production migrasi tetap dijalankan manual, ADR 0005.)
set -euo pipefail
cd "$(dirname "$0")/.."

docker compose up -d --build --wait postgres
docker compose --profile tools run --rm migrate
docker compose up -d --build

echo
echo "Stack lokal menyala: http://localhost:8080 (API: http://localhost:8080/api/v1/health)"
