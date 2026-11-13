ALTER TABLE "tagihan" ADD COLUMN "diskon_jenis" text;--> statement-breakpoint
ALTER TABLE "tagihan" ADD COLUMN "diskon_nilai" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "tagihan" ADD COLUMN "diskon_alasan" text;--> statement-breakpoint
ALTER TABLE "tagihan" ADD COLUMN "diskon_oleh_anggota_id" text;--> statement-breakpoint
ALTER TABLE "tagihan" ADD COLUMN "diskon_penyetuju_anggota_id" text;--> statement-breakpoint
ALTER TABLE "tagihan" ADD COLUMN "alasan_tutup" text;--> statement-breakpoint
ALTER TABLE "tagihan" ADD COLUMN "void_shift_id" text;--> statement-breakpoint
ALTER TABLE "tagihan" ADD COLUMN "void_penyetuju_anggota_id" text;--> statement-breakpoint
ALTER TABLE "tagihan" ADD CONSTRAINT "tagihan_diskon_oleh_anggota_id_anggota_id_fk" FOREIGN KEY ("diskon_oleh_anggota_id") REFERENCES "public"."anggota"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tagihan" ADD CONSTRAINT "tagihan_diskon_penyetuju_anggota_id_anggota_id_fk" FOREIGN KEY ("diskon_penyetuju_anggota_id") REFERENCES "public"."anggota"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tagihan" ADD CONSTRAINT "tagihan_void_shift_id_shift_id_fk" FOREIGN KEY ("void_shift_id") REFERENCES "public"."shift"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tagihan" ADD CONSTRAINT "tagihan_void_penyetuju_anggota_id_anggota_id_fk" FOREIGN KEY ("void_penyetuju_anggota_id") REFERENCES "public"."anggota"("id") ON DELETE no action ON UPDATE no action;