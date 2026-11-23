CREATE TABLE "pemindahan_item_pesanan" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"tenant_id" text NOT NULL,
	"urutan" bigint GENERATED ALWAYS AS IDENTITY (sequence name "pemindahan_item_pesanan_urutan_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"outlet_id" text NOT NULL,
	"item_pesanan_id" text NOT NULL,
	"dari_tagihan_id" text NOT NULL,
	"ke_tagihan_id" text NOT NULL,
	"sebab" text NOT NULL,
	"anggota_id" text NOT NULL,
	"perangkat_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "perintah_klien" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"outlet_id" text NOT NULL,
	"jenis" text NOT NULL,
	"entitas_id" text NOT NULL,
	"hasil" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pemindahan_item_pesanan" ADD CONSTRAINT "pemindahan_item_pesanan_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pemindahan_item_pesanan" ADD CONSTRAINT "pemindahan_item_pesanan_outlet_id_outlet_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlet"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pemindahan_item_pesanan" ADD CONSTRAINT "pemindahan_item_pesanan_item_pesanan_id_item_pesanan_id_fk" FOREIGN KEY ("item_pesanan_id") REFERENCES "public"."item_pesanan"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pemindahan_item_pesanan" ADD CONSTRAINT "pemindahan_item_pesanan_dari_tagihan_id_tagihan_id_fk" FOREIGN KEY ("dari_tagihan_id") REFERENCES "public"."tagihan"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pemindahan_item_pesanan" ADD CONSTRAINT "pemindahan_item_pesanan_ke_tagihan_id_tagihan_id_fk" FOREIGN KEY ("ke_tagihan_id") REFERENCES "public"."tagihan"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pemindahan_item_pesanan" ADD CONSTRAINT "pemindahan_item_pesanan_anggota_id_anggota_id_fk" FOREIGN KEY ("anggota_id") REFERENCES "public"."anggota"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pemindahan_item_pesanan" ADD CONSTRAINT "pemindahan_item_pesanan_perangkat_id_perangkat_terdaftar_id_fk" FOREIGN KEY ("perangkat_id") REFERENCES "public"."perangkat_terdaftar"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "perintah_klien" ADD CONSTRAINT "perintah_klien_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "perintah_klien" ADD CONSTRAINT "perintah_klien_outlet_id_outlet_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlet"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pemindahan_item_pesanan_tenant_id_index" ON "pemindahan_item_pesanan" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "pemindahan_item_pesanan_item_pesanan_id_urutan_index" ON "pemindahan_item_pesanan" USING btree ("item_pesanan_id","urutan");--> statement-breakpoint
CREATE INDEX "pemindahan_item_pesanan_ke_tagihan_id_index" ON "pemindahan_item_pesanan" USING btree ("ke_tagihan_id");--> statement-breakpoint
CREATE INDEX "perintah_klien_tenant_id_index" ON "perintah_klien" USING btree ("tenant_id");