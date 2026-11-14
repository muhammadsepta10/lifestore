CREATE TABLE "tagihan_meja" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"tenant_id" text NOT NULL,
	"outlet_id" text NOT NULL,
	"tagihan_id" text NOT NULL,
	"meja_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "outlet" ADD COLUMN "pembulatan_tunai_kelipatan" integer;--> statement-breakpoint
ALTER TABLE "outlet" ADD COLUMN "pembulatan_tunai_arah" text;--> statement-breakpoint
ALTER TABLE "outlet" ADD COLUMN "bayar_dulu" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "pembayaran" ADD COLUMN "pembulatan" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "tagihan" ADD COLUMN "asal_tagihan_id" text;--> statement-breakpoint
ALTER TABLE "tagihan" ADD COLUMN "digabung_ke_tagihan_id" text;--> statement-breakpoint
ALTER TABLE "tagihan" ADD COLUMN "pembulatan_tunai" bigint;--> statement-breakpoint
ALTER TABLE "tagihan_meja" ADD CONSTRAINT "tagihan_meja_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tagihan_meja" ADD CONSTRAINT "tagihan_meja_outlet_id_outlet_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlet"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tagihan_meja" ADD CONSTRAINT "tagihan_meja_tagihan_id_tagihan_id_fk" FOREIGN KEY ("tagihan_id") REFERENCES "public"."tagihan"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tagihan_meja" ADD CONSTRAINT "tagihan_meja_meja_id_meja_id_fk" FOREIGN KEY ("meja_id") REFERENCES "public"."meja"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tagihan_meja_tenant_id_index" ON "tagihan_meja" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "tagihan_meja_meja_id_index" ON "tagihan_meja" USING btree ("meja_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tagihan_meja_tagihan_id_meja_id_index" ON "tagihan_meja" USING btree ("tagihan_id","meja_id");