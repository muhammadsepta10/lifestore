import { Body, Controller, Get, HttpCode, Param, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';
import { Database } from '../database/database';
import { kategori } from '../database/schema';
import { SesiGuard } from '../identitas/sesi.guard';
import { objek, pilihan as pilihanDari, teks, teksOpsional } from '../umum/validasi';
import { aturUrutan, idDaftar, pastikanKategori, pastikanMerek, urlOpsional, urutanBerikutnya } from './bersama';

/** Kunci warna pastel Kategori desain v3; sama dengan `PASTEL_KATEGORI` di `@lifestore/ui`. */
export const WARNA_KATEGORI = ['peach', 'lemon', 'sky', 'lilac', 'mint', 'pink', 'sand'] as const;

type BarisKategori = typeof kategori.$inferSelect;

export function tampilkanKategori(k: BarisKategori) {
  return {
    id: k.id,
    merekId: k.merekId,
    nama: k.nama,
    warna: k.warna,
    ikon: k.ikon,
    gambarUrl: k.gambarUrl,
    urutan: k.urutan,
  };
}

@Controller()
@UseGuards(SesiGuard)
export class KategoriController {
  constructor(private readonly db: Database) {}

  @Get('merek/:merekId/kategori')
  async daftar(@Param('merekId') merekId: string) {
    const tx = this.db.tenant();
    await pastikanMerek(tx, merekId);
    const baris = await tx.select().from(kategori).where(eq(kategori.merekId, merekId)).orderBy(asc(kategori.urutan), asc(kategori.createdAt));
    return baris.map(tampilkanKategori);
  }

  @Post('merek/:merekId/kategori')
  @HttpCode(201)
  async tambah(@Param('merekId') merekId: string, @Body() body: unknown) {
    const tx = this.db.tenant();
    const mk = await pastikanMerek(tx, merekId);
    const m = objek(body);
    const [k] = await tx
      .insert(kategori)
      .values({
        tenantId: mk.tenantId,
        merekId,
        nama: teks(m, 'nama', { maks: 100 }),
        warna: pilihanDari(m, 'warna', WARNA_KATEGORI),
        ikon: teksOpsional(m, 'ikon', { maks: 16 }) ?? null,
        gambarUrl: urlOpsional(m, 'gambarUrl') ?? null,
        urutan: await urutanBerikutnya(tx, kategori, eq(kategori.merekId, merekId)),
      })
      .returning();
    return tampilkanKategori(k!);
  }

  /** Atur urutan: `ids` berisi semua (atau sebagian) Kategori Merek dari depan ke belakang. */
  @Put('merek/:merekId/kategori/urutan')
  async urutkan(@Param('merekId') merekId: string, @Body() body: unknown) {
    const tx = this.db.tenant();
    await pastikanMerek(tx, merekId);
    await aturUrutan(tx, kategori, kategori.merekId, merekId, idDaftar(objek(body), 'ids'));
    return this.daftar(merekId);
  }

  @Patch('kategori/:id')
  async ubah(@Param('id') id: string, @Body() body: unknown) {
    const tx = this.db.tenant();
    await pastikanKategori(tx, id);
    const m = objek(body);
    const perubahan: Partial<typeof kategori.$inferInsert> = {};
    if (m.nama !== undefined) perubahan.nama = teks(m, 'nama', { maks: 100 });
    if (m.warna !== undefined) perubahan.warna = pilihanDari(m, 'warna', WARNA_KATEGORI);
    if (m.ikon !== undefined) perubahan.ikon = teksOpsional(m, 'ikon', { maks: 16 });
    if (m.gambarUrl !== undefined) perubahan.gambarUrl = urlOpsional(m, 'gambarUrl');
    const [k] =
      Object.keys(perubahan).length === 0
        ? await tx.select().from(kategori).where(eq(kategori.id, id))
        : await tx.update(kategori).set(perubahan).where(eq(kategori.id, id)).returning();
    return tampilkanKategori(k!);
  }
}
