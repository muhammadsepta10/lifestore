# 0005: Hosting di VPS dengan Docker Compose, deploy dan migrasi manual

Tanggal: 2026-10-04 · Status: diterima · Tiket: #29

## Konteks

Pemilik ingin biaya awal seminimal mungkin dan memilih VPS, bukan layanan cloud terkelola. Pemilik juga tidak ingin CI/CD dan ingin migrasi database di production dijalankan manual.

## Keputusan

- **Hosting**: satu VPS production di Jakarta (atau Singapura bila lebih murah), mulai sekitar 2 vCPU / 4 GB RAM dan dinaikkan sesuai beban. Semua layanan jalan dengan Docker Compose:
  - Caddy sebagai reverse proxy dengan TLS otomatis
  - `web` (dashboard, kasir PWA, KDS)
  - `order` (QR meja, pesan online, reservasi)
  - `api` (NestJS)
  - PostgreSQL
- **Monorepo**: pnpm workspaces + Turborepo dengan `apps/web`, `apps/order`, `apps/api`, `apps/print-agent`, `packages/domain`, `packages/escpos`, `packages/ui`.
- **Database**: Drizzle ORM. Migrasi berupa SQL yang di-commit ke repo. Setiap request membuka transaksi yang memasang `tenant_id` untuk RLS (ADR 0001).
- **Tanpa CI/CD**: build dan deploy lewat satu skrip yang dijalankan manual. Lint, typecheck, dan tes dijalankan lokal sebelum deploy.
- **Migrasi production dijalankan manual** dengan perintah terpisah, tidak otomatis saat deploy. Migrasi wajib kompatibel ke belakang karena kasir offline bisa memakai versi lama sampai 72 jam (ADR 0003).
- **Lingkungan**:
  - lokal: Docker Compose
  - staging: proyek Compose terpisah di VPS yang sama, dengan data contoh dan Xendit mode test
  - production
- **Backup**: fitur backup (dump harian + WAL untuk point-in-time recovery, ke storage S3-compatible) sudah disiapkan di kode tetapi **mati secara default**. Fitur ini menyala setelah pemilik memasukkan kredensial bucket. Selama mati, data hanya ada di disk VPS.
- **Observability**:
  - Sentry tier gratis untuk web, API, dan Agen Cetak
  - log JSON terstruktur dari Docker dengan rotasi
  - uptime check dari layanan gratis
  - alarm lewat email dan push
  - pantauan antrean Sinkron per perangkat
- **File**: foto menu, logo, dan selfie Absensi disimpan di disk VPS di balik Caddy. Lapisan penyimpanan dibuat agar bisa dipindah ke S3-compatible.
- **Email** transaksional lewat Resend (tier gratis di awal) dari domain platform, dengan nama Merek sebagai pengirim.
- **Biaya** ditekan: tanpa HA database, tanpa layanan berbayar selain VPS, domain, dan Resend bila melewati tier gratis. Code signing Agen Cetak ditunda (ADR 0004).

## Alternatif yang ditolak

- **Cloud terkelola (Cloud Run + Cloud SQL)**: lebih andal dan mudah diskalakan, tetapi lebih mahal di awal.
- **CI/CD otomatis dan migrasi otomatis saat deploy**: ditolak pemilik.

## Konsekuensi

- VPS adalah titik gagal tunggal. Kasir tetap jalan offline saat server mati (ADR 0003), tetapi QR meja, pesan online, dan dashboard ikut mati.
- Tanpa backup eksternal yang dinyalakan, kerusakan disk VPS berarti kehilangan data. Halaman admin menampilkan peringatan selama backup mati.
- Karena tidak ada CI, tes harus dijalankan lokal sebelum setiap deploy. Ini diatur di skrip deploy.
- Default branch GitHub dipindah ke `main` saat mulai membangun.
