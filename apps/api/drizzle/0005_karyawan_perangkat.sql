CREATE TABLE "kode_pendaftaran_perangkat" (
	"hash_kode" text PRIMARY KEY NOT NULL,
	"perangkat_tenant_id" text NOT NULL,
	"perangkat_id" text NOT NULL,
	"kedaluwarsa_pada" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "penugasan" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"tenant_id" text NOT NULL,
	"anggota_id" text NOT NULL,
	"outlet_id" text NOT NULL,
	"peran" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "perangkat_terdaftar" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"tenant_id" text NOT NULL,
	"outlet_id" text NOT NULL,
	"nama" text NOT NULL,
	"awalan" text NOT NULL,
	"hash_token" text,
	"terdaftar_pada" timestamp with time zone,
	"dicabut_pada" timestamp with time zone,
	"anggota_aktif_id" text,
	"anggota_masuk_pada" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "perangkat_terdaftar_hashToken_unique" UNIQUE("hash_token")
);
--> statement-breakpoint
CREATE TABLE "undangan_karyawan" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"tenant_id" text NOT NULL,
	"anggota_id" text NOT NULL,
	"email" text NOT NULL,
	"hash_token" text NOT NULL,
	"kedaluwarsa_pada" timestamp with time zone NOT NULL,
	"diterima_pada" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "undangan_karyawan_hashToken_unique" UNIQUE("hash_token")
);
--> statement-breakpoint
ALTER TABLE "anggota" ALTER COLUMN "pengguna_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "anggota" ADD COLUMN "nama" text;--> statement-breakpoint
ALTER TABLE "anggota" ADD COLUMN "hash_pin" text;--> statement-breakpoint
ALTER TABLE "anggota" ADD COLUMN "pin_salah" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "anggota" ADD COLUMN "pin_terkunci_sampai" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "anggota" ADD COLUMN "aktif" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "penugasan" ADD CONSTRAINT "penugasan_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "penugasan" ADD CONSTRAINT "penugasan_anggota_id_anggota_id_fk" FOREIGN KEY ("anggota_id") REFERENCES "public"."anggota"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "penugasan" ADD CONSTRAINT "penugasan_outlet_id_outlet_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlet"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "perangkat_terdaftar" ADD CONSTRAINT "perangkat_terdaftar_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "perangkat_terdaftar" ADD CONSTRAINT "perangkat_terdaftar_outlet_id_outlet_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlet"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "perangkat_terdaftar" ADD CONSTRAINT "perangkat_terdaftar_anggota_aktif_id_anggota_id_fk" FOREIGN KEY ("anggota_aktif_id") REFERENCES "public"."anggota"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "undangan_karyawan" ADD CONSTRAINT "undangan_karyawan_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "undangan_karyawan" ADD CONSTRAINT "undangan_karyawan_anggota_id_anggota_id_fk" FOREIGN KEY ("anggota_id") REFERENCES "public"."anggota"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "penugasan_anggota_id_outlet_id_index" ON "penugasan" USING btree ("anggota_id","outlet_id");--> statement-breakpoint
CREATE INDEX "penugasan_tenant_id_index" ON "penugasan" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "penugasan_outlet_id_index" ON "penugasan" USING btree ("outlet_id");--> statement-breakpoint
CREATE INDEX "perangkat_terdaftar_tenant_id_index" ON "perangkat_terdaftar" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "perangkat_terdaftar_awalan_aktif" ON "perangkat_terdaftar" USING btree ("outlet_id","awalan") WHERE dicabut_pada IS NULL;--> statement-breakpoint
CREATE INDEX "undangan_karyawan_tenant_id_index" ON "undangan_karyawan" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "undangan_karyawan_anggota_id_index" ON "undangan_karyawan" USING btree ("anggota_id");