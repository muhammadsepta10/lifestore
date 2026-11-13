-- Karyawan, Penugasan, dan Perangkat Terdaftar: tabel milik Tenant dengan RLS yang dipaksa.
-- kode_pendaftaran_perangkat sengaja global (tanpa tenant_id): perangkat baru belum punya konteks Tenant.
ALTER TABLE undangan_karyawan ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE undangan_karyawan FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY undangan_karyawan_isolasi_tenant ON undangan_karyawan
  USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());
--> statement-breakpoint
ALTER TABLE penugasan ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE penugasan FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY penugasan_isolasi_tenant ON penugasan
  USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());
--> statement-breakpoint
ALTER TABLE perangkat_terdaftar ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE perangkat_terdaftar FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY perangkat_terdaftar_isolasi_tenant ON perangkat_terdaftar
  USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());
