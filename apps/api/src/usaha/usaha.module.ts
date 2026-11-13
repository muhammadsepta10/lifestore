import { Body, Controller, Get, HttpCode, Module, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';
import { Database, type TxDb } from '../database/database';
import { type JamBukaHari, merek, outlet } from '../database/schema';
import { SesiGuard } from '../identitas/sesi.guard';
import { buatProfilPajakDefault } from '../pajak/pajak.module';
import { objek, teks, teksOpsional, tidakDitemukan, tidakValid } from '../umum/validasi';

type BarisOutlet = typeof outlet.$inferSelect;

export function tampilkanOutlet(o: BarisOutlet) {
  return {
    id: o.id,
    merekId: o.merekId,
    nama: o.nama,
    alamat: o.alamat,
    kota: o.kota,
    jamBuka: o.jamBuka ?? [],
    logoUrl: o.logoUrl,
  };
}

/** Membuat Outlet beserta Profil Pajak default-nya. Dipakai saat pendirian Tenant dan tambah Outlet. */
export async function buatOutlet(
  tx: TxDb,
  data: { tenantId: string; merekId: string; nama: string; kota: string; alamat?: string | null },
): Promise<BarisOutlet> {
  const [o] = await tx
    .insert(outlet)
    .values({ tenantId: data.tenantId, merekId: data.merekId, nama: data.nama, kota: data.kota, alamat: data.alamat ?? null })
    .returning();
  await buatProfilPajakDefault(tx, { tenantId: data.tenantId, outletId: o!.id });
  return o!;
}

@Controller('merek')
@UseGuards(SesiGuard)
export class MerekController {
  constructor(private readonly db: Database) {}

  @Get()
  async daftar() {
    return this.db
      .tenant()
      .select({ id: merek.id, nama: merek.nama, utama: merek.utama })
      .from(merek)
      .orderBy(asc(merek.createdAt), asc(merek.id));
  }

  @Patch(':id')
  async ubah(@Param('id') id: string, @Body() body: unknown) {
    const nama = teks(objek(body), 'nama', { maks: 100 });
    const [m] = await this.db
      .tenant()
      .update(merek)
      .set({ nama })
      .where(eq(merek.id, id))
      .returning({ id: merek.id, nama: merek.nama, utama: merek.utama });
    if (!m) throw tidakDitemukan('Merek');
    return m;
  }
}

@Controller('outlet')
@UseGuards(SesiGuard)
export class OutletController {
  constructor(private readonly db: Database) {}

  @Get()
  async daftar() {
    const baris = await this.db.tenant().select().from(outlet).orderBy(asc(outlet.createdAt), asc(outlet.id));
    return baris.map(tampilkanOutlet);
  }

  @Get(':id')
  async detail(@Param('id') id: string) {
    const [o] = await this.db.tenant().select().from(outlet).where(eq(outlet.id, id));
    if (!o) throw tidakDitemukan('Outlet');
    return tampilkanOutlet(o);
  }

  /** Tambah Outlet. Tanpa `merekId`, Outlet masuk ke Merek default. */
  @Post()
  @HttpCode(201)
  async tambah(@Body() body: unknown) {
    const m = objek(body);
    const nama = teks(m, 'nama', { maks: 100 });
    const kota = teks(m, 'kota', { maks: 100 });
    const alamat = teksOpsional(m, 'alamat');
    const merekId = teksOpsional(m, 'merekId', { maks: 64 });

    const tx = this.db.tenant();
    // Merek dicari lewat transaksi Tenant (RLS), jadi ID Merek Tenant lain tidak ditemukan.
    const [mk] = await tx
      .select({ id: merek.id, tenantId: merek.tenantId })
      .from(merek)
      .where(merekId ? eq(merek.id, merekId) : eq(merek.utama, true))
      .limit(1);
    if (!mk) throw tidakDitemukan('Merek');
    return tampilkanOutlet(await buatOutlet(tx, { tenantId: mk.tenantId, merekId: mk.id, nama, kota, alamat }));
  }

  /** Ubah profil Outlet: nama, alamat, kota, jam buka, logo. */
  @Patch(':id')
  async ubah(@Param('id') id: string, @Body() body: unknown) {
    const m = objek(body);
    const perubahan: Partial<typeof outlet.$inferInsert> = {};
    if (m.nama !== undefined) perubahan.nama = teks(m, 'nama', { maks: 100 });
    if (m.kota !== undefined) perubahan.kota = teks(m, 'kota', { maks: 100 });
    if (m.alamat !== undefined) perubahan.alamat = teksOpsional(m, 'alamat');
    if (m.logoUrl !== undefined) perubahan.logoUrl = urlLogo(teksOpsional(m, 'logoUrl', { maks: 2000 }));
    if (m.jamBuka !== undefined) perubahan.jamBuka = jamBukaValid(m.jamBuka);

    const tx = this.db.tenant();
    const [o] =
      Object.keys(perubahan).length === 0
        ? await tx.select().from(outlet).where(eq(outlet.id, id))
        : await tx.update(outlet).set(perubahan).where(eq(outlet.id, id)).returning();
    if (!o) throw tidakDitemukan('Outlet');
    return tampilkanOutlet(o);
  }
}

function urlLogo(v: string | null | undefined): string | null {
  if (!v) return null;
  if (!/^https?:\/\//.test(v)) throw tidakValid('logoUrl', 'Harus URL http(s).');
  return v;
}

const JAM = /^([01]\d|2[0-3]):[0-5]\d$/;

function jamBukaValid(v: unknown): JamBukaHari[] {
  if (v === null) return [];
  if (!Array.isArray(v)) throw tidakValid('jamBuka', 'Harus daftar { hari, buka, tutup }.');
  return v.map((h, i) => {
    const o = objek(h);
    if (typeof o.hari !== 'number' || !Number.isInteger(o.hari) || o.hari < 1 || o.hari > 7) {
      throw tidakValid(`jamBuka[${i}].hari`, 'Hari 1 (Senin) sampai 7 (Minggu).');
    }
    if (typeof o.buka !== 'string' || !JAM.test(o.buka)) throw tidakValid(`jamBuka[${i}].buka`, 'Format HH:MM.');
    if (typeof o.tutup !== 'string' || !JAM.test(o.tutup)) throw tidakValid(`jamBuka[${i}].tutup`, 'Format HH:MM.');
    return { hari: o.hari, buka: o.buka, tutup: o.tutup };
  });
}

@Module({ controllers: [MerekController, OutletController] })
export class UsahaModule {}
