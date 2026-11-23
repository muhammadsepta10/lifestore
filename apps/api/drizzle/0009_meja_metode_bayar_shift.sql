CREATE TABLE "kas_shift" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"tenant_id" text NOT NULL,
	"shift_id" text NOT NULL,
	"jenis" text NOT NULL,
	"jumlah" bigint NOT NULL,
	"alasan" text NOT NULL,
	"anggota_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meja" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"tenant_id" text NOT NULL,
	"outlet_id" text NOT NULL,
	"label" text NOT NULL,
	"kapasitas" integer NOT NULL,
	"aktif" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "metode_bayar" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"tenant_id" text NOT NULL,
	"outlet_id" text NOT NULL,
	"jenis" text NOT NULL,
	"keterangan" text,
	"aktif" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shift" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"tenant_id" text NOT NULL,
	"outlet_id" text NOT NULL,
	"perangkat_id" text NOT NULL,
	"status" text DEFAULT 'terbuka' NOT NULL,
	"kas_awal" bigint NOT NULL,
	"dibuka_oleh_anggota_id" text NOT NULL,
	"dibuka_pada" timestamp with time zone NOT NULL,
	"ditutup_oleh_anggota_id" text,
	"ditutup_pada" timestamp with time zone,
	"kas_seharusnya" bigint,
	"hitung_buta" bigint,
	"selisih" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "kas_shift" ADD CONSTRAINT "kas_shift_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kas_shift" ADD CONSTRAINT "kas_shift_shift_id_shift_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."shift"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kas_shift" ADD CONSTRAINT "kas_shift_anggota_id_anggota_id_fk" FOREIGN KEY ("anggota_id") REFERENCES "public"."anggota"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meja" ADD CONSTRAINT "meja_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meja" ADD CONSTRAINT "meja_outlet_id_outlet_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlet"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metode_bayar" ADD CONSTRAINT "metode_bayar_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metode_bayar" ADD CONSTRAINT "metode_bayar_outlet_id_outlet_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlet"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift" ADD CONSTRAINT "shift_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift" ADD CONSTRAINT "shift_outlet_id_outlet_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlet"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift" ADD CONSTRAINT "shift_perangkat_id_perangkat_terdaftar_id_fk" FOREIGN KEY ("perangkat_id") REFERENCES "public"."perangkat_terdaftar"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift" ADD CONSTRAINT "shift_dibuka_oleh_anggota_id_anggota_id_fk" FOREIGN KEY ("dibuka_oleh_anggota_id") REFERENCES "public"."anggota"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift" ADD CONSTRAINT "shift_ditutup_oleh_anggota_id_anggota_id_fk" FOREIGN KEY ("ditutup_oleh_anggota_id") REFERENCES "public"."anggota"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "kas_shift_tenant_id_index" ON "kas_shift" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "kas_shift_shift_id_index" ON "kas_shift" USING btree ("shift_id");--> statement-breakpoint
CREATE INDEX "meja_tenant_id_index" ON "meja" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "meja_outlet_id_label_index" ON "meja" USING btree ("outlet_id","label");--> statement-breakpoint
CREATE INDEX "metode_bayar_tenant_id_index" ON "metode_bayar" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "metode_bayar_outlet_id_jenis_index" ON "metode_bayar" USING btree ("outlet_id","jenis");--> statement-breakpoint
CREATE INDEX "shift_tenant_id_index" ON "shift" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "shift_outlet_id_index" ON "shift" USING btree ("outlet_id");--> statement-breakpoint
CREATE UNIQUE INDEX "shift_terbuka_per_perangkat" ON "shift" USING btree ("perangkat_id") WHERE status = 'terbuka';