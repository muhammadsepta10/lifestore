-- Meja yang ditempati Tagihan: tabel milik Tenant dengan RLS yang dipaksa.
ALTER TABLE tagihan_meja ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE tagihan_meja FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tagihan_meja_isolasi_tenant ON tagihan_meja
  USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());
--> statement-breakpoint
REVOKE TRUNCATE ON tagihan_meja FROM lifestore_app;
--> statement-breakpoint
-- Pisah Tagihan dan gabung Meja memindahkan Item Pesanan ke Tagihan lain. Item Pesanan tetap
-- append-only: hanya kolom `tagihan_id` yang boleh diubah, isi itemnya tidak.
GRANT UPDATE (tagihan_id) ON item_pesanan TO lifestore_app;
