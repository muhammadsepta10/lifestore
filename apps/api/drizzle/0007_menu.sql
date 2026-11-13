CREATE TABLE "grup_pilihan" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"tenant_id" text NOT NULL,
	"menu_id" text NOT NULL,
	"nama" text NOT NULL,
	"minimum" integer DEFAULT 0 NOT NULL,
	"maksimum" integer NOT NULL,
	"urutan" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "harga_outlet" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"tenant_id" text NOT NULL,
	"menu_id" text NOT NULL,
	"varian_id" text,
	"outlet_id" text NOT NULL,
	"harga" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "harga_outlet_outletId_menuId_varianId_unique" UNIQUE NULLS NOT DISTINCT("outlet_id","menu_id","varian_id")
);
--> statement-breakpoint
CREATE TABLE "kategori" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"tenant_id" text NOT NULL,
	"merek_id" text NOT NULL,
	"nama" text NOT NULL,
	"warna" text NOT NULL,
	"ikon" text,
	"gambar_url" text,
	"urutan" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "menu" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"tenant_id" text NOT NULL,
	"merek_id" text NOT NULL,
	"kategori_id" text NOT NULL,
	"nama" text NOT NULL,
	"harga" bigint NOT NULL,
	"deskripsi" text,
	"foto_url" text,
	"urutan" integer DEFAULT 0 NOT NULL,
	"aktif" boolean DEFAULT true NOT NULL,
	"bebas_pajak" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "menu_habis" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"tenant_id" text NOT NULL,
	"menu_id" text NOT NULL,
	"outlet_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "menu_stasiun" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"tenant_id" text NOT NULL,
	"menu_id" text NOT NULL,
	"outlet_id" text NOT NULL,
	"stasiun_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pilihan" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"tenant_id" text NOT NULL,
	"grup_pilihan_id" text NOT NULL,
	"nama" text NOT NULL,
	"harga" bigint NOT NULL,
	"urutan" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stasiun" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"tenant_id" text NOT NULL,
	"outlet_id" text NOT NULL,
	"nama" text NOT NULL,
	"urutan" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "varian" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"tenant_id" text NOT NULL,
	"menu_id" text NOT NULL,
	"nama" text NOT NULL,
	"harga" bigint NOT NULL,
	"urutan" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "grup_pilihan" ADD CONSTRAINT "grup_pilihan_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grup_pilihan" ADD CONSTRAINT "grup_pilihan_menu_id_menu_id_fk" FOREIGN KEY ("menu_id") REFERENCES "public"."menu"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "harga_outlet" ADD CONSTRAINT "harga_outlet_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "harga_outlet" ADD CONSTRAINT "harga_outlet_menu_id_menu_id_fk" FOREIGN KEY ("menu_id") REFERENCES "public"."menu"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "harga_outlet" ADD CONSTRAINT "harga_outlet_varian_id_varian_id_fk" FOREIGN KEY ("varian_id") REFERENCES "public"."varian"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "harga_outlet" ADD CONSTRAINT "harga_outlet_outlet_id_outlet_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlet"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kategori" ADD CONSTRAINT "kategori_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kategori" ADD CONSTRAINT "kategori_merek_id_merek_id_fk" FOREIGN KEY ("merek_id") REFERENCES "public"."merek"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu" ADD CONSTRAINT "menu_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu" ADD CONSTRAINT "menu_merek_id_merek_id_fk" FOREIGN KEY ("merek_id") REFERENCES "public"."merek"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu" ADD CONSTRAINT "menu_kategori_id_kategori_id_fk" FOREIGN KEY ("kategori_id") REFERENCES "public"."kategori"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_habis" ADD CONSTRAINT "menu_habis_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_habis" ADD CONSTRAINT "menu_habis_menu_id_menu_id_fk" FOREIGN KEY ("menu_id") REFERENCES "public"."menu"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_habis" ADD CONSTRAINT "menu_habis_outlet_id_outlet_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlet"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_stasiun" ADD CONSTRAINT "menu_stasiun_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_stasiun" ADD CONSTRAINT "menu_stasiun_menu_id_menu_id_fk" FOREIGN KEY ("menu_id") REFERENCES "public"."menu"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_stasiun" ADD CONSTRAINT "menu_stasiun_outlet_id_outlet_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlet"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_stasiun" ADD CONSTRAINT "menu_stasiun_stasiun_id_stasiun_id_fk" FOREIGN KEY ("stasiun_id") REFERENCES "public"."stasiun"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pilihan" ADD CONSTRAINT "pilihan_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pilihan" ADD CONSTRAINT "pilihan_grup_pilihan_id_grup_pilihan_id_fk" FOREIGN KEY ("grup_pilihan_id") REFERENCES "public"."grup_pilihan"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stasiun" ADD CONSTRAINT "stasiun_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stasiun" ADD CONSTRAINT "stasiun_outlet_id_outlet_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlet"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "varian" ADD CONSTRAINT "varian_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "varian" ADD CONSTRAINT "varian_menu_id_menu_id_fk" FOREIGN KEY ("menu_id") REFERENCES "public"."menu"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "grup_pilihan_tenant_id_index" ON "grup_pilihan" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "grup_pilihan_menu_id_index" ON "grup_pilihan" USING btree ("menu_id");--> statement-breakpoint
CREATE INDEX "harga_outlet_tenant_id_index" ON "harga_outlet" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "kategori_tenant_id_index" ON "kategori" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "kategori_merek_id_index" ON "kategori" USING btree ("merek_id");--> statement-breakpoint
CREATE INDEX "menu_tenant_id_index" ON "menu" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "menu_merek_id_index" ON "menu" USING btree ("merek_id");--> statement-breakpoint
CREATE INDEX "menu_kategori_id_index" ON "menu" USING btree ("kategori_id");--> statement-breakpoint
CREATE UNIQUE INDEX "menu_habis_outlet_id_menu_id_index" ON "menu_habis" USING btree ("outlet_id","menu_id");--> statement-breakpoint
CREATE INDEX "menu_habis_tenant_id_index" ON "menu_habis" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "menu_stasiun_menu_id_outlet_id_index" ON "menu_stasiun" USING btree ("menu_id","outlet_id");--> statement-breakpoint
CREATE INDEX "menu_stasiun_tenant_id_index" ON "menu_stasiun" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "menu_stasiun_stasiun_id_index" ON "menu_stasiun" USING btree ("stasiun_id");--> statement-breakpoint
CREATE INDEX "pilihan_tenant_id_index" ON "pilihan" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "pilihan_grup_pilihan_id_index" ON "pilihan" USING btree ("grup_pilihan_id");--> statement-breakpoint
CREATE INDEX "stasiun_tenant_id_index" ON "stasiun" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "stasiun_outlet_id_index" ON "stasiun" USING btree ("outlet_id");--> statement-breakpoint
CREATE INDEX "varian_tenant_id_index" ON "varian" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "varian_menu_id_index" ON "varian" USING btree ("menu_id");