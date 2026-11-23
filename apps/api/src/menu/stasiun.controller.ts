import { Body, Controller, Get, HttpCode, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';
import { Database, type TxDb } from '../database/database';
import { stasiun } from '../database/schema';
import { type Pelaku, PelakuAktif, PerluIzin, pastikanIzin } from '../izin/izin';
import { SesiGuard } from '../identitas/sesi.guard';
import { objek, teks } from '../umum/validasi';
import { pastikanOutlet, pastikanStasiun, urutanBerikutnya } from './bersama';

type BarisStasiun = typeof stasiun.$inferSelect;

export function tampilkanStasiun(s: BarisStasiun) {
  return { id: s.id, outletId: s.outletId, nama: s.nama, urutan: s.urutan };
}

/** Apakah Outlet sudah punya minimal satu Stasiun (langkah Siap Jualan `stasiun`). */
export async function adaStasiun(tx: TxDb, outletId: string): Promise<boolean> {
  const [s] = await tx.select({ id: stasiun.id }).from(stasiun).where(eq(stasiun.outletId, outletId)).limit(1);
  return s !== undefined;
}

@Controller()
@UseGuards(SesiGuard)
export class StasiunController {
  constructor(private readonly db: Database) {}

  @Get('outlet/:outletId/stasiun')
  @PerluIzin('menu.lihat', { outletParam: 'outletId' })
  async daftar(@Param('outletId') outletId: string) {
    const tx = this.db.tenant();
    await pastikanOutlet(tx, outletId);
    const baris = await tx.select().from(stasiun).where(eq(stasiun.outletId, outletId)).orderBy(asc(stasiun.urutan), asc(stasiun.createdAt));
    return baris.map(tampilkanStasiun);
  }

  @Post('outlet/:outletId/stasiun')
  @PerluIzin('stasiun.kelola', { outletParam: 'outletId' })
  @HttpCode(201)
  async tambah(@Param('outletId') outletId: string, @Body() body: unknown) {
    const tx = this.db.tenant();
    const o = await pastikanOutlet(tx, outletId);
    const nama = teks(objek(body), 'nama', { maks: 100 });
    const [s] = await tx
      .insert(stasiun)
      .values({ tenantId: o.tenantId, outletId, nama, urutan: await urutanBerikutnya(tx, stasiun, eq(stasiun.outletId, outletId)) })
      .returning();
    return tampilkanStasiun(s!);
  }

  /** Izin dicek terhadap Outlet Stasiun itu (rute tidak membawa ID Outlet). */
  @Patch('stasiun/:id')
  @PerluIzin('stasiun.kelola')
  async ubah(@Param('id') id: string, @Body() body: unknown, @PelakuAktif() pelaku: Pelaku) {
    const tx = this.db.tenant();
    const lama = await pastikanStasiun(tx, id);
    pastikanIzin(pelaku, 'stasiun.kelola', lama.outletId);
    const nama = teks(objek(body), 'nama', { maks: 100 });
    const [s] = await tx.update(stasiun).set({ nama }).where(eq(stasiun.id, id)).returning();
    return tampilkanStasiun(s!);
  }
}
