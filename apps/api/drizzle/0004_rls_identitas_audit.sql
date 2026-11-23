-- Pengguna aktif per transaksi (login, pilih Tenant): set_config('app.pengguna_id', <id>, true).
-- Dipakai kebijakan baca tambahan supaya Pengguna bisa melihat daftar Tenant tempat ia menjadi Anggota.
CREATE OR REPLACE FUNCTION app_pengguna_id() RETURNS text
  LANGUAGE sql STABLE
  AS $$ SELECT nullif(current_setting('app.pengguna_id', true), '') $$;
--> statement-breakpoint
ALTER TABLE anggota ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE anggota FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY anggota_isolasi_tenant ON anggota
  USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());
--> statement-breakpoint
-- Hanya baca: Pengguna melihat keanggotaannya sendiri di semua Tenant (untuk memilih Tenant).
CREATE POLICY anggota_milik_pengguna ON anggota FOR SELECT
  USING (pengguna_id = app_pengguna_id());
--> statement-breakpoint
CREATE POLICY tenant_milik_pengguna ON tenant FOR SELECT
  USING (EXISTS (SELECT 1 FROM anggota a WHERE a.tenant_id = tenant.id AND a.pengguna_id = app_pengguna_id()));
--> statement-breakpoint
ALTER TABLE outlet ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE outlet FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY outlet_isolasi_tenant ON outlet
  USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());
--> statement-breakpoint
ALTER TABLE profil_pajak ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE profil_pajak FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY profil_pajak_isolasi_tenant ON profil_pajak
  USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());
--> statement-breakpoint
ALTER TABLE siap_jualan_dilewati ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE siap_jualan_dilewati FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY siap_jualan_dilewati_isolasi_tenant ON siap_jualan_dilewati
  USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());
--> statement-breakpoint
ALTER TABLE log_audit ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE log_audit FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY log_audit_isolasi_tenant ON log_audit
  USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());
--> statement-breakpoint
-- Log Audit append-only: peran aplikasi tidak boleh mengubah atau menghapus.
REVOKE UPDATE, DELETE, TRUNCATE ON log_audit FROM lifestore_app;
