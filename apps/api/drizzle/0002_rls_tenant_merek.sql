-- RLS (ADR 0001). FORCE supaya pemilik tabel pun tunduk; hanya superuser/BYPASSRLS yang lolos.
-- Pola untuk setiap tabel milik Tenant baru:
--   ALTER TABLE x ENABLE ROW LEVEL SECURITY;
--   ALTER TABLE x FORCE ROW LEVEL SECURITY;
--   CREATE POLICY x_isolasi_tenant ON x
--     USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());
ALTER TABLE tenant ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE tenant FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
-- Tenant baru dibuat dengan memasang app.tenant_id ke ID (UUID buatan klien/server) Tenant itu
-- sebelum INSERT, di transaksi yang sama.
CREATE POLICY tenant_isolasi_tenant ON tenant
  USING (id = app_tenant_id())
  WITH CHECK (id = app_tenant_id());
--> statement-breakpoint
ALTER TABLE merek ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE merek FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY merek_isolasi_tenant ON merek
  USING (tenant_id = app_tenant_id())
  WITH CHECK (tenant_id = app_tenant_id());
