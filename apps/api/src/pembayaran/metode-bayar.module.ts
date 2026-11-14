import { Body, Controller, Get, Module, Param, Put, UseGuards } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { Database, type TxDb } from '../database/database';
import { metodeBayar, outlet } from '../database/schema';
import { SesiGuard } from '../identitas/sesi.guard';
import { PerluIzin } from '../izin/izin';
import { KaryawanModule } from '../karyawan/karyawan.module';
import { Perangkat, type PerangkatAktif, PerangkatGuard } from '../karyawan/perangkat';
import { boolean, objek, teksOpsional, tidakDitemukan, tidakValid } from '../umum/validasi';

/** Metode Bayar manual di irisan ini, berurutan seperti di kasir. Gateway dan Piutang menyusul. */
export const JENIS_METODE_BAYAR = ['tunai', 'qris_statis', 'edc', 'transfer'] as const;
export type JenisMetodeBayar = (typeof JENIS_METODE_BAYAR)[number];

/** Nama tampilan default (UI kasir boleh menerjemahkan lewat i18n berdasarkan `jenis`). */
const NAMA: Record<JenisMetodeBayar, string> = {
  tunai: 'Tunai',
  qris_statis: 'QRIS statis',
  edc: 'EDC',
  transfer: 'Transfer bank',
};

/** Semua jenis manual untuk satu Outlet; jenis tanpa baris dianggap nonaktif. */
export async function daftarMetodeBayar(tx: TxDb, outletId: string) {
  const baris = await tx.select().from(metodeBayar).where(eq(metodeBayar.outletId, outletId));
  return JENIS_METODE_BAYAR.map((jenis) => {
    const b = baris.find((x) => x.jenis === jenis);
    return { jenis, nama: NAMA[jenis], keterangan: b?.keterangan ?? null, aktif: b?.aktif ?? false };
  });
}

/** Metode Bayar yang boleh dipakai kasir di Outlet ini. */
export async function metodeBayarAktif(tx: TxDb, outletId: string) {
  return (await daftarMetodeBayar(tx, outletId)).filter((m) => m.aktif);
}

/** Siap Jualan: Outlet punya minimal satu Metode Bayar aktif. */
export async function adaMetodeBayarAktif(tx: TxDb, outletId: string): Promise<boolean> {
  const [m] = await tx
    .select({ id: metodeBayar.id })
    .from(metodeBayar)
    .where(and(eq(metodeBayar.outletId, outletId), eq(metodeBayar.aktif, true)))
    .limit(1);
  return m !== undefined;
}

function jenisValid(v: string): JenisMetodeBayar {
  if (!(JENIS_METODE_BAYAR as readonly string[]).includes(v)) {
    throw tidakValid('jenis', `Harus salah satu dari: ${JENIS_METODE_BAYAR.join(', ')}.`);
  }
  return v as JenisMetodeBayar;
}

/** Atur Metode Bayar per Outlet dari dashboard (manajer atau Pemilik). */
@Controller('outlet/:outletId/metode-bayar')
@UseGuards(SesiGuard)
export class MetodeBayarController {
  constructor(private readonly db: Database) {}

  @Get()
  @PerluIzin('metode_bayar.kelola', { outletParam: 'outletId' })
  async daftar(@Param('outletId') outletId: string) {
    await this.pastikanOutlet(outletId);
    return daftarMetodeBayar(this.db.tenant(), outletId);
  }

  /** Aktifkan/nonaktifkan satu jenis Metode Bayar, dengan keterangan opsional (bank, nama EDC). */
  @Put(':jenis')
  @PerluIzin('metode_bayar.kelola', { outletParam: 'outletId' })
  async atur(@Param('outletId') outletId: string, @Param('jenis') jenisMentah: string, @Body() body: unknown) {
    const o = await this.pastikanOutlet(outletId);
    const jenis = jenisValid(jenisMentah);
    const m = objek(body);
    const aktif = boolean(m, 'aktif');
    const keterangan = teksOpsional(m, 'keterangan', { maks: 200 });
    const set = keterangan === undefined ? { aktif } : { aktif, keterangan };
    const tx = this.db.tenant();
    await tx
      .insert(metodeBayar)
      .values({ tenantId: o.tenantId, outletId, jenis, aktif, keterangan: keterangan ?? null })
      .onConflictDoUpdate({ target: [metodeBayar.outletId, metodeBayar.jenis], set });
    return (await daftarMetodeBayar(tx, outletId)).find((x) => x.jenis === jenis);
  }

  private async pastikanOutlet(outletId: string) {
    const [o] = await this.db.tenant().select({ id: outlet.id, tenantId: outlet.tenantId }).from(outlet).where(eq(outlet.id, outletId));
    if (!o) throw tidakDitemukan('Outlet');
    return o;
  }
}

/** Metode Bayar aktif di Outlet Perangkat Terdaftar. */
@Controller('kasir/metode-bayar')
@UseGuards(PerangkatGuard)
export class MetodeBayarKasirController {
  constructor(private readonly db: Database) {}

  @Get()
  @PerluIzin('kasir.buka')
  async daftar(@Perangkat() p: PerangkatAktif) {
    return metodeBayarAktif(this.db.tenant(), p.outletId);
  }
}

@Module({
  imports: [KaryawanModule],
  controllers: [MetodeBayarController, MetodeBayarKasirController],
})
export class MetodeBayarModule {}
