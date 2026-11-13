import { Body, ConflictException, Controller, Get, HttpCode, Module, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { Database, type TxDb } from '../database/database';
import { meja, outlet } from '../database/schema';
import { SesiGuard } from '../identitas/sesi.guard';
import { PerluIzin } from '../izin/izin';
import { KaryawanModule } from '../karyawan/karyawan.module';
import { Perangkat, type PerangkatAktif, PerangkatGuard } from '../karyawan/perangkat';
import { angka, boolean, objek, tidakDitemukan, tidakValid } from '../umum/validasi';

type BarisMeja = typeof meja.$inferSelect;

const MAKS_MEJA_SEKALIGUS = 200;

/** Status Meja diturunkan dari Tagihan terbuka; sebelum ada Tagihan (#38) semua Meja Kosong. */
function tampilkanMeja(m: BarisMeja) {
  return { id: m.id, outletId: m.outletId, label: m.label, kapasitas: m.kapasitas, aktif: m.aktif, status: 'kosong' as const };
}

/** Urutkan label angka secara numerik (2 sebelum 10), lalu label lain menurut abjad. */
function urutLabel(a: BarisMeja, b: BarisMeja): number {
  const na = /^\d+$/.test(a.label) ? Number(a.label) : Number.POSITIVE_INFINITY;
  const nb = /^\d+$/.test(b.label) ? Number(b.label) : Number.POSITIVE_INFINITY;
  return na !== nb ? na - nb : a.label.localeCompare(b.label);
}

export async function daftarMeja(tx: TxDb, outletId: string) {
  const baris = await tx.select().from(meja).where(eq(meja.outletId, outletId)).orderBy(asc(meja.createdAt));
  return baris.sort(urutLabel).map(tampilkanMeja);
}

/** Siap Jualan: Outlet punya minimal satu Meja aktif. */
export async function adaMejaAktif(tx: TxDb, outletId: string): Promise<boolean> {
  const [m] = await tx
    .select({ id: meja.id })
    .from(meja)
    .where(and(eq(meja.outletId, outletId), eq(meja.aktif, true)))
    .limit(1);
  return m !== undefined;
}

async function ubahAktif(tx: TxDb, outletId: string, id: string, aktif: boolean) {
  const [m] = await tx
    .update(meja)
    .set({ aktif })
    .where(and(eq(meja.id, id), eq(meja.outletId, outletId)))
    .returning();
  if (!m) throw tidakDitemukan('Meja');
  return tampilkanMeja(m);
}

/** Kelola Meja dari dashboard. */
@Controller('outlet/:outletId/meja')
@UseGuards(SesiGuard)
export class MejaController {
  constructor(private readonly db: Database) {}

  @Get()
  @PerluIzin('meja.kelola', { outletParam: 'outletId' })
  async daftar(@Param('outletId') outletId: string) {
    await this.pastikanOutlet(outletId);
    return daftarMeja(this.db.tenant(), outletId);
  }

  /** Buat Meja massal berlabel angka `dari`..`sampai` dengan kapasitas yang sama. */
  @Post('massal')
  @HttpCode(201)
  @PerluIzin('meja.kelola', { outletParam: 'outletId' })
  async massal(@Param('outletId') outletId: string, @Body() body: unknown) {
    const o = await this.pastikanOutlet(outletId);
    const m = objek(body);
    const dari = angka(m, 'dari', { min: 1, maks: 9999 });
    const sampai = angka(m, 'sampai', { min: 1, maks: 9999 });
    const kapasitas = angka(m, 'kapasitas', { min: 1, maks: 100 });
    if (!Number.isInteger(dari) || !Number.isInteger(sampai) || !Number.isInteger(kapasitas)) {
      throw tidakValid('dari', 'Nomor Meja dan kapasitas harus bilangan bulat.');
    }
    if (sampai < dari) throw tidakValid('sampai', 'Harus sama atau lebih besar dari `dari`.');
    if (sampai - dari + 1 > MAKS_MEJA_SEKALIGUS) throw tidakValid('sampai', `Paling banyak ${MAKS_MEJA_SEKALIGUS} Meja sekaligus.`);

    const label = Array.from({ length: sampai - dari + 1 }, (_, i) => String(dari + i));
    const tx = this.db.tenant();
    const bentrok = await tx
      .select({ label: meja.label })
      .from(meja)
      .where(and(eq(meja.outletId, outletId), inArray(meja.label, label)));
    if (bentrok.length > 0) {
      throw new ConflictException({
        kode: 'meja_sudah_ada',
        label: bentrok.map((b) => b.label),
        pesan: `Meja ${bentrok.map((b) => b.label).join(', ')} sudah ada di Outlet ini.`,
      });
    }
    const baru = await tx
      .insert(meja)
      .values(label.map((l) => ({ tenantId: o.tenantId, outletId, label: l, kapasitas })))
      .returning();
    return baru.sort(urutLabel).map(tampilkanMeja);
  }

  /** Ubah kapasitas atau aktifkan/nonaktifkan Meja. */
  @Patch(':id')
  @PerluIzin('meja.kelola', { outletParam: 'outletId' })
  async ubah(@Param('outletId') outletId: string, @Param('id') id: string, @Body() body: unknown) {
    const m = objek(body);
    const perubahan: Partial<Pick<BarisMeja, 'kapasitas' | 'aktif'>> = {};
    if (m.kapasitas !== undefined) perubahan.kapasitas = angka(m, 'kapasitas', { min: 1, maks: 100 });
    if (m.aktif !== undefined) perubahan.aktif = boolean(m, 'aktif');
    if (Object.keys(perubahan).length === 0) throw tidakValid('body', 'Tidak ada yang diubah.');
    const [baris] = await this.db
      .tenant()
      .update(meja)
      .set(perubahan)
      .where(and(eq(meja.id, id), eq(meja.outletId, outletId)))
      .returning();
    if (!baris) throw tidakDitemukan('Meja');
    return tampilkanMeja(baris);
  }

  private async pastikanOutlet(outletId: string) {
    const [o] = await this.db.tenant().select({ id: outlet.id, tenantId: outlet.tenantId }).from(outlet).where(eq(outlet.id, outletId));
    if (!o) throw tidakDitemukan('Outlet');
    return o;
  }
}

/** Meja dari layar kasir di Perangkat Terdaftar (Outlet perangkat). */
@Controller('kasir/meja')
@UseGuards(PerangkatGuard)
export class MejaKasirController {
  constructor(private readonly db: Database) {}

  @Get()
  @PerluIzin('kasir.buka')
  async daftar(@Perangkat() p: PerangkatAktif) {
    return daftarMeja(this.db.tenant(), p.outletId);
  }

  /** Nonaktifkan Meja (misal rusak) supaya tidak bisa dipilih. */
  @Post(':id/nonaktifkan')
  @HttpCode(200)
  @PerluIzin('meja.nonaktifkan')
  async nonaktifkan(@Perangkat() p: PerangkatAktif, @Param('id') id: string) {
    return ubahAktif(this.db.tenant(), p.outletId, id, false);
  }

  @Post(':id/aktifkan')
  @HttpCode(200)
  @PerluIzin('meja.nonaktifkan')
  async aktifkan(@Perangkat() p: PerangkatAktif, @Param('id') id: string) {
    return ubahAktif(this.db.tenant(), p.outletId, id, true);
  }
}

@Module({
  imports: [KaryawanModule],
  controllers: [MejaController, MejaKasirController],
})
export class MejaModule {}
