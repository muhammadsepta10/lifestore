-- Peran grup aplikasi (ADR 0001). API login sebagai peran yang menjadi anggota lifestore_app.
-- Tanpa SUPERUSER dan tanpa BYPASSRLS, jadi kebijakan RLS selalu berlaku untuk API.
-- Peran login (dengan kata sandi) dibuat operator, bukan migrasi:
--   CREATE ROLE lifestore_api LOGIN NOBYPASSRLS PASSWORD '...' IN ROLE lifestore_app;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lifestore_app') THEN
    CREATE ROLE lifestore_app NOLOGIN NOSUPERUSER NOBYPASSRLS;
  END IF;
EXCEPTION WHEN duplicate_object OR unique_violation THEN
  NULL; -- dibuat bersamaan oleh proses lain
END
$$;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO lifestore_app;
--> statement-breakpoint
-- Tabel dan sequence baru yang dibuat pemilik skema otomatis bisa dipakai aplikasi.
-- Tabel append-only (misal Log Audit) wajib mencabut UPDATE/DELETE secara eksplisit di migrasinya.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO lifestore_app;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO lifestore_app;
--> statement-breakpoint
-- Konteks Tenant per request: API memasang setting sesi lokal-transaksi
--   set_config('app.tenant_id', <id>, true) dan set_config('app.outlet_id', <id>, true).
-- Fungsi ini mengembalikan NULL bila belum dipasang, sehingga kebijakan RLS tidak cocok dengan baris apa pun.
CREATE OR REPLACE FUNCTION app_tenant_id() RETURNS text
  LANGUAGE sql STABLE
  AS $$ SELECT nullif(current_setting('app.tenant_id', true), '') $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app_outlet_id() RETURNS text
  LANGUAGE sql STABLE
  AS $$ SELECT nullif(current_setting('app.outlet_id', true), '') $$;
