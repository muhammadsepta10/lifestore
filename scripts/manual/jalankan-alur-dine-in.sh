#!/usr/bin/env bash
# Menjalankan skrip Playwright manual alur dine-in dan cara bayar lengkap (scripts/manual/alur-dine-in.mjs)
# terhadap api + web hasil build di atas database baru. Variabel dan kebutuhannya sama dengan
# jalankan-alur-kasir.sh.
#
#   bash scripts/manual/jalankan-alur-dine-in.sh
set -euo pipefail
SKRIP=scripts/manual/alur-dine-in.mjs exec bash "$(dirname "$0")/jalankan-alur-kasir.sh"
