-- Kejadian pindah Item Pesanan dan perintah klien: tabel milik Tenant dengan RLS yang dipaksa,
-- keduanya append-only.
ALTER TABLE pemindahan_item_pesanan ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE pemindahan_item_pesanan FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY pemindahan_item_pesanan_isolasi_tenant ON pemindahan_item_pesanan
  USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());
--> statement-breakpoint
REVOKE UPDATE, DELETE, TRUNCATE ON pemindahan_item_pesanan FROM lifestore_app;
--> statement-breakpoint
ALTER TABLE perintah_klien ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE perintah_klien FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY perintah_klien_isolasi_tenant ON perintah_klien
  USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());
--> statement-breakpoint
REVOKE UPDATE, DELETE, TRUNCATE ON perintah_klien FROM lifestore_app;
--> statement-breakpoint
-- Item Pesanan kembali sepenuhnya append-only: Pisah Tagihan dan gabung Meja kini dicatat sebagai
-- kejadian di `pemindahan_item_pesanan`, bukan dengan menimpa `item_pesanan.tagihan_id`.
-- Baris yang `tagihan_id`-nya sudah ditimpa sebelum migrasi ini tetap benar: nilainya adalah
-- Tagihan item itu saat ini, dan belum punya kejadian pindah.
REVOKE UPDATE (tagihan_id) ON item_pesanan FROM lifestore_app;
