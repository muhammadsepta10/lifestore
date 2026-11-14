-- Meja, Metode Bayar, Shift, dan kas Shift: tabel milik Tenant dengan RLS yang dipaksa.
ALTER TABLE meja ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE meja FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY meja_isolasi_tenant ON meja
  USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());
--> statement-breakpoint
ALTER TABLE metode_bayar ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE metode_bayar FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY metode_bayar_isolasi_tenant ON metode_bayar
  USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());
--> statement-breakpoint
ALTER TABLE shift ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE shift FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY shift_isolasi_tenant ON shift
  USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());
--> statement-breakpoint
ALTER TABLE kas_shift ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE kas_shift FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY kas_shift_isolasi_tenant ON kas_shift
  USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());
--> statement-breakpoint
-- Kas masuk/keluar adalah catatan laci: append-only.
REVOKE UPDATE, DELETE, TRUNCATE ON kas_shift FROM lifestore_app;
