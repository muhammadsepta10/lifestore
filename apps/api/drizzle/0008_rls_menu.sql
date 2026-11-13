-- RLS untuk tabel Menu (#35): setiap baris hanya terlihat di Tenant pemiliknya.
ALTER TABLE kategori ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE kategori FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY kategori_isolasi_tenant ON kategori
  USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());
--> statement-breakpoint
ALTER TABLE menu ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE menu FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY menu_isolasi_tenant ON menu
  USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());
--> statement-breakpoint
ALTER TABLE varian ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE varian FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY varian_isolasi_tenant ON varian
  USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());
--> statement-breakpoint
ALTER TABLE grup_pilihan ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE grup_pilihan FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY grup_pilihan_isolasi_tenant ON grup_pilihan
  USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());
--> statement-breakpoint
ALTER TABLE pilihan ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE pilihan FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY pilihan_isolasi_tenant ON pilihan
  USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());
--> statement-breakpoint
ALTER TABLE stasiun ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE stasiun FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY stasiun_isolasi_tenant ON stasiun
  USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());
--> statement-breakpoint
ALTER TABLE menu_stasiun ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE menu_stasiun FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY menu_stasiun_isolasi_tenant ON menu_stasiun
  USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());
--> statement-breakpoint
ALTER TABLE harga_outlet ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE harga_outlet FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY harga_outlet_isolasi_tenant ON harga_outlet
  USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());
--> statement-breakpoint
ALTER TABLE menu_habis ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE menu_habis FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY menu_habis_isolasi_tenant ON menu_habis
  USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());
