#!/usr/bin/env bash
# Pengganti CI (ADR 0005): lint + typecheck + tes. Wajib lulus sebelum deploy.
# Tes api butuh Postgres; atur TEST_DATABASE_URL bila bukan postgres://postgres@localhost:5432/postgres.
set -euo pipefail
cd "$(dirname "$0")/.."

pnpm install --frozen-lockfile
pnpm turbo run lint typecheck test
