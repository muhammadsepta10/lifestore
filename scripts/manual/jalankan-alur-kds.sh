#!/usr/bin/env bash
# Menjalankan skrip Playwright manual alur KDS (scripts/manual/alur-kds.mjs) terhadap api + web hasil
# build di atas database baru. Variabel dan kebutuhannya sama dengan jalankan-alur-kasir.sh.
#
#   bash scripts/manual/jalankan-alur-kds.sh
set -euo pipefail
SKRIP=scripts/manual/alur-kds.mjs exec bash "$(dirname "$0")/jalankan-alur-kasir.sh"
