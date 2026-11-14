-- Penjualan (Tagihan, Pesanan, Item Pesanan, kejadiannya, Pembayaran, penghitung nomor):
-- tabel milik Tenant dengan RLS yang dipaksa.
ALTER TABLE tagihan ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE tagihan FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tagihan_isolasi_tenant ON tagihan
  USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());
--> statement-breakpoint
ALTER TABLE penghitung_nomor ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE penghitung_nomor FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY penghitung_nomor_isolasi_tenant ON penghitung_nomor
  USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());
--> statement-breakpoint
ALTER TABLE pesanan ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE pesanan FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY pesanan_isolasi_tenant ON pesanan
  USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());
--> statement-breakpoint
ALTER TABLE item_pesanan ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE item_pesanan FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY item_pesanan_isolasi_tenant ON item_pesanan
  USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());
--> statement-breakpoint
ALTER TABLE kejadian_item_pesanan ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE kejadian_item_pesanan FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY kejadian_item_pesanan_isolasi_tenant ON kejadian_item_pesanan
  USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());
--> statement-breakpoint
ALTER TABLE pembayaran ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE pembayaran FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY pembayaran_isolasi_tenant ON pembayaran
  USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());
--> statement-breakpoint
-- Pesanan, Item Pesanan, kejadiannya, dan Pembayaran append-only: perubahan status dicatat
-- sebagai kejadian baru, bukan update yang menimpa riwayat.
REVOKE UPDATE, DELETE, TRUNCATE ON pesanan FROM lifestore_app;
--> statement-breakpoint
REVOKE UPDATE, DELETE, TRUNCATE ON item_pesanan FROM lifestore_app;
--> statement-breakpoint
REVOKE UPDATE, DELETE, TRUNCATE ON kejadian_item_pesanan FROM lifestore_app;
--> statement-breakpoint
REVOKE UPDATE, DELETE, TRUNCATE ON pembayaran FROM lifestore_app;
--> statement-breakpoint
-- Tagihan tidak pernah dihapus: Tagihan berisi item hanya bisa di-void.
REVOKE DELETE, TRUNCATE ON tagihan FROM lifestore_app;
