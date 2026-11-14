CREATE TABLE "item_pesanan" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"tenant_id" text NOT NULL,
	"outlet_id" text NOT NULL,
	"tagihan_id" text NOT NULL,
	"pesanan_id" text NOT NULL,
	"urutan" integer NOT NULL,
	"menu_id" text NOT NULL,
	"nama" text NOT NULL,
	"varian_id" text,
	"nama_varian" text,
	"harga_satuan" bigint NOT NULL,
	"jumlah" integer NOT NULL,
	"pilihan" jsonb NOT NULL,
	"bebas_pajak" boolean NOT NULL,
	"stasiun_id" text,
	"catatan" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kejadian_item_pesanan" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"tenant_id" text NOT NULL,
	"urutan" bigint GENERATED ALWAYS AS IDENTITY (sequence name "kejadian_item_pesanan_urutan_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"outlet_id" text NOT NULL,
	"item_pesanan_id" text NOT NULL,
	"status" text NOT NULL,
	"anggota_id" text,
	"perangkat_id" text,
	"alasan" text,
	"waste" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pembayaran" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"tenant_id" text NOT NULL,
	"outlet_id" text NOT NULL,
	"tagihan_id" text NOT NULL,
	"shift_id" text,
	"perangkat_id" text NOT NULL,
	"metode" text NOT NULL,
	"jumlah" bigint NOT NULL,
	"diterima" bigint NOT NULL,
	"kembalian" bigint NOT NULL,
	"referensi" text,
	"anggota_id" text NOT NULL,
	"dibayar_pada" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "penghitung_nomor" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"tenant_id" text NOT NULL,
	"outlet_id" text NOT NULL,
	"kunci" text NOT NULL,
	"nilai" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pesanan" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"tenant_id" text NOT NULL,
	"outlet_id" text NOT NULL,
	"tagihan_id" text NOT NULL,
	"perangkat_id" text NOT NULL,
	"nomor_pesanan" text NOT NULL,
	"tanggal" date NOT NULL,
	"dikirim_oleh_anggota_id" text NOT NULL,
	"dikirim_pada" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tagihan" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"tenant_id" text NOT NULL,
	"outlet_id" text NOT NULL,
	"perangkat_id" text NOT NULL,
	"kanal" text NOT NULL,
	"meja_id" text,
	"nama_pelanggan" text,
	"status" text DEFAULT 'terbuka' NOT NULL,
	"dibuka_oleh_anggota_id" text NOT NULL,
	"dibuka_pada" timestamp with time zone NOT NULL,
	"pajak_jenis" text NOT NULL,
	"pajak_tarif_persen" numeric(5, 2) NOT NULL,
	"pajak_label" text NOT NULL,
	"harga_termasuk_pajak" boolean NOT NULL,
	"service_charge_persen" numeric(5, 2) NOT NULL,
	"service_charge_kanal" text[] NOT NULL,
	"nomor_nota" integer,
	"ditutup_pada" timestamp with time zone,
	"ditutup_oleh_anggota_id" text,
	"subtotal" bigint,
	"diskon" bigint,
	"service_charge" bigint,
	"dasar_pajak" bigint,
	"pajak" bigint,
	"total" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "item_pesanan" ADD CONSTRAINT "item_pesanan_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_pesanan" ADD CONSTRAINT "item_pesanan_outlet_id_outlet_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlet"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_pesanan" ADD CONSTRAINT "item_pesanan_tagihan_id_tagihan_id_fk" FOREIGN KEY ("tagihan_id") REFERENCES "public"."tagihan"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_pesanan" ADD CONSTRAINT "item_pesanan_pesanan_id_pesanan_id_fk" FOREIGN KEY ("pesanan_id") REFERENCES "public"."pesanan"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_pesanan" ADD CONSTRAINT "item_pesanan_menu_id_menu_id_fk" FOREIGN KEY ("menu_id") REFERENCES "public"."menu"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_pesanan" ADD CONSTRAINT "item_pesanan_stasiun_id_stasiun_id_fk" FOREIGN KEY ("stasiun_id") REFERENCES "public"."stasiun"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kejadian_item_pesanan" ADD CONSTRAINT "kejadian_item_pesanan_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kejadian_item_pesanan" ADD CONSTRAINT "kejadian_item_pesanan_outlet_id_outlet_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlet"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kejadian_item_pesanan" ADD CONSTRAINT "kejadian_item_pesanan_item_pesanan_id_item_pesanan_id_fk" FOREIGN KEY ("item_pesanan_id") REFERENCES "public"."item_pesanan"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kejadian_item_pesanan" ADD CONSTRAINT "kejadian_item_pesanan_anggota_id_anggota_id_fk" FOREIGN KEY ("anggota_id") REFERENCES "public"."anggota"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kejadian_item_pesanan" ADD CONSTRAINT "kejadian_item_pesanan_perangkat_id_perangkat_terdaftar_id_fk" FOREIGN KEY ("perangkat_id") REFERENCES "public"."perangkat_terdaftar"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pembayaran" ADD CONSTRAINT "pembayaran_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pembayaran" ADD CONSTRAINT "pembayaran_outlet_id_outlet_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlet"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pembayaran" ADD CONSTRAINT "pembayaran_tagihan_id_tagihan_id_fk" FOREIGN KEY ("tagihan_id") REFERENCES "public"."tagihan"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pembayaran" ADD CONSTRAINT "pembayaran_shift_id_shift_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."shift"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pembayaran" ADD CONSTRAINT "pembayaran_perangkat_id_perangkat_terdaftar_id_fk" FOREIGN KEY ("perangkat_id") REFERENCES "public"."perangkat_terdaftar"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pembayaran" ADD CONSTRAINT "pembayaran_anggota_id_anggota_id_fk" FOREIGN KEY ("anggota_id") REFERENCES "public"."anggota"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "penghitung_nomor" ADD CONSTRAINT "penghitung_nomor_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "penghitung_nomor" ADD CONSTRAINT "penghitung_nomor_outlet_id_outlet_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlet"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pesanan" ADD CONSTRAINT "pesanan_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pesanan" ADD CONSTRAINT "pesanan_outlet_id_outlet_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlet"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pesanan" ADD CONSTRAINT "pesanan_tagihan_id_tagihan_id_fk" FOREIGN KEY ("tagihan_id") REFERENCES "public"."tagihan"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pesanan" ADD CONSTRAINT "pesanan_perangkat_id_perangkat_terdaftar_id_fk" FOREIGN KEY ("perangkat_id") REFERENCES "public"."perangkat_terdaftar"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pesanan" ADD CONSTRAINT "pesanan_dikirim_oleh_anggota_id_anggota_id_fk" FOREIGN KEY ("dikirim_oleh_anggota_id") REFERENCES "public"."anggota"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tagihan" ADD CONSTRAINT "tagihan_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tagihan" ADD CONSTRAINT "tagihan_outlet_id_outlet_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlet"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tagihan" ADD CONSTRAINT "tagihan_perangkat_id_perangkat_terdaftar_id_fk" FOREIGN KEY ("perangkat_id") REFERENCES "public"."perangkat_terdaftar"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tagihan" ADD CONSTRAINT "tagihan_meja_id_meja_id_fk" FOREIGN KEY ("meja_id") REFERENCES "public"."meja"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tagihan" ADD CONSTRAINT "tagihan_dibuka_oleh_anggota_id_anggota_id_fk" FOREIGN KEY ("dibuka_oleh_anggota_id") REFERENCES "public"."anggota"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tagihan" ADD CONSTRAINT "tagihan_ditutup_oleh_anggota_id_anggota_id_fk" FOREIGN KEY ("ditutup_oleh_anggota_id") REFERENCES "public"."anggota"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "item_pesanan_tenant_id_index" ON "item_pesanan" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "item_pesanan_tagihan_id_index" ON "item_pesanan" USING btree ("tagihan_id");--> statement-breakpoint
CREATE INDEX "item_pesanan_pesanan_id_index" ON "item_pesanan" USING btree ("pesanan_id");--> statement-breakpoint
CREATE INDEX "kejadian_item_pesanan_tenant_id_index" ON "kejadian_item_pesanan" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "kejadian_item_pesanan_item_pesanan_id_urutan_index" ON "kejadian_item_pesanan" USING btree ("item_pesanan_id","urutan");--> statement-breakpoint
CREATE INDEX "kejadian_item_pesanan_outlet_id_urutan_index" ON "kejadian_item_pesanan" USING btree ("outlet_id","urutan");--> statement-breakpoint
CREATE INDEX "pembayaran_tenant_id_index" ON "pembayaran" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "pembayaran_tagihan_id_index" ON "pembayaran" USING btree ("tagihan_id");--> statement-breakpoint
CREATE INDEX "pembayaran_shift_id_index" ON "pembayaran" USING btree ("shift_id");--> statement-breakpoint
CREATE INDEX "penghitung_nomor_tenant_id_index" ON "penghitung_nomor" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "penghitung_nomor_outlet_id_kunci_index" ON "penghitung_nomor" USING btree ("outlet_id","kunci");--> statement-breakpoint
CREATE INDEX "pesanan_tenant_id_index" ON "pesanan" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "pesanan_tagihan_id_index" ON "pesanan" USING btree ("tagihan_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pesanan_outlet_id_tanggal_nomor_pesanan_index" ON "pesanan" USING btree ("outlet_id","tanggal","nomor_pesanan");--> statement-breakpoint
CREATE INDEX "tagihan_tenant_id_index" ON "tagihan" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "tagihan_outlet_id_status_index" ON "tagihan" USING btree ("outlet_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "tagihan_outlet_id_nomor_nota_index" ON "tagihan" USING btree ("outlet_id","nomor_nota");