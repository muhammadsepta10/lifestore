CREATE TABLE "anggota" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"tenant_id" text NOT NULL,
	"pengguna_id" text NOT NULL,
	"peran" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "log_audit" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"tenant_id" text NOT NULL,
	"outlet_id" text,
	"aksi" text NOT NULL,
	"entitas" text NOT NULL,
	"entitas_id" text NOT NULL,
	"pengguna_id" text,
	"perangkat_id" text,
	"sebelum" jsonb,
	"sesudah" jsonb,
	"alasan" text,
	"penyetuju_anggota_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outlet" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"tenant_id" text NOT NULL,
	"merek_id" text NOT NULL,
	"nama" text NOT NULL,
	"alamat" text,
	"kota" text NOT NULL,
	"jam_buka" jsonb,
	"logo_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pengguna" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"email" text NOT NULL,
	"hash_kata_sandi" text NOT NULL,
	"terverifikasi_pada" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pengguna_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "profil_pajak" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"tenant_id" text NOT NULL,
	"outlet_id" text NOT NULL,
	"berlaku_mulai" date NOT NULL,
	"jenis" text NOT NULL,
	"tarif_persen" numeric(5, 2) NOT NULL,
	"label_struk" text NOT NULL,
	"service_charge_persen" numeric(5, 2) DEFAULT 0 NOT NULL,
	"service_charge_kanal" text[] DEFAULT ARRAY['dine_in']::text[] NOT NULL,
	"harga_termasuk_pajak" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sesi" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"pengguna_id" text NOT NULL,
	"hash_token" text NOT NULL,
	"tenant_aktif_id" text,
	"kedaluwarsa_pada" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sesi_hashToken_unique" UNIQUE("hash_token")
);
--> statement-breakpoint
CREATE TABLE "siap_jualan_dilewati" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"tenant_id" text NOT NULL,
	"outlet_id" text NOT NULL,
	"langkah" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verifikasi_email" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"pengguna_id" text NOT NULL,
	"hash_token" text NOT NULL,
	"nama_usaha" text NOT NULL,
	"kota" text NOT NULL,
	"kedaluwarsa_pada" timestamp with time zone NOT NULL,
	"dipakai_pada" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "verifikasi_email_hashToken_unique" UNIQUE("hash_token")
);
--> statement-breakpoint
ALTER TABLE "merek" ADD COLUMN "utama" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "tenant" ADD COLUMN "masa_coba_berakhir_pada" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "anggota" ADD CONSTRAINT "anggota_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anggota" ADD CONSTRAINT "anggota_pengguna_id_pengguna_id_fk" FOREIGN KEY ("pengguna_id") REFERENCES "public"."pengguna"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "log_audit" ADD CONSTRAINT "log_audit_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outlet" ADD CONSTRAINT "outlet_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outlet" ADD CONSTRAINT "outlet_merek_id_merek_id_fk" FOREIGN KEY ("merek_id") REFERENCES "public"."merek"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profil_pajak" ADD CONSTRAINT "profil_pajak_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profil_pajak" ADD CONSTRAINT "profil_pajak_outlet_id_outlet_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlet"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sesi" ADD CONSTRAINT "sesi_pengguna_id_pengguna_id_fk" FOREIGN KEY ("pengguna_id") REFERENCES "public"."pengguna"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "siap_jualan_dilewati" ADD CONSTRAINT "siap_jualan_dilewati_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "siap_jualan_dilewati" ADD CONSTRAINT "siap_jualan_dilewati_outlet_id_outlet_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlet"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verifikasi_email" ADD CONSTRAINT "verifikasi_email_pengguna_id_pengguna_id_fk" FOREIGN KEY ("pengguna_id") REFERENCES "public"."pengguna"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "anggota_tenant_id_pengguna_id_index" ON "anggota" USING btree ("tenant_id","pengguna_id");--> statement-breakpoint
CREATE INDEX "anggota_pengguna_id_index" ON "anggota" USING btree ("pengguna_id");--> statement-breakpoint
CREATE INDEX "log_audit_tenant_id_created_at_index" ON "log_audit" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "outlet_tenant_id_index" ON "outlet" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "outlet_merek_id_index" ON "outlet" USING btree ("merek_id");--> statement-breakpoint
CREATE INDEX "profil_pajak_tenant_id_index" ON "profil_pajak" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "profil_pajak_outlet_id_berlaku_mulai_index" ON "profil_pajak" USING btree ("outlet_id","berlaku_mulai");--> statement-breakpoint
CREATE UNIQUE INDEX "siap_jualan_dilewati_outlet_id_langkah_index" ON "siap_jualan_dilewati" USING btree ("outlet_id","langkah");--> statement-breakpoint
CREATE INDEX "siap_jualan_dilewati_tenant_id_index" ON "siap_jualan_dilewati" USING btree ("tenant_id");