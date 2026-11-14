import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { and, count, desc, eq, gte, inArray, lt, sql, sum } from 'drizzle-orm';
import { Database, type TxDb } from '../database/database';
import { outlet, pembayaran, tagihan } from '../database/schema';
import { SesiGuard } from '../identitas/sesi.guard';
import { PerluIzin } from '../izin/izin';
import { JENIS_METODE_BAYAR } from '../pembayaran/metode-bayar.module';
import { Jam } from '../umum/jam';
import { tanggal as tanggalValid, tidakDitemukan } from '../umum/validasi';
import { tanggalOperasional } from './nomor';
import { itemTagihan, mejaTagihan, tagihanDiOutlet, tagihanLengkap } from './tagihan';

/** Rentang waktu satu tanggal operasional (Asia/Jakarta, UTC+7 tanpa DST). */
function rentangHari(tanggal: string): { mulai: Date; selesai: Date } {
  const mulai = new Date(`${tanggal}T00:00:00+07:00`);
  return { mulai, selesai: new Date(mulai.getTime() + 24 * 60 * 60 * 1000) };
}

function lunasPada(outletIds: string[], tanggal: string) {
  const { mulai, selesai } = rentangHari(tanggal);
  return and(inArray(tagihan.outletId, outletIds), eq(tagihan.status, 'lunas'), gte(tagihan.ditutupPada, mulai), lt(tagihan.ditutupPada, selesai));
}

export interface PenjualanHarian {
  outletId: string;
  tanggal: string;
  /** Jumlah `total` Tagihan lunas pada tanggal itu (Penjualan Diakui saat Tagihan ditutup). */
  penjualan: number;
  jumlahTagihan: number;
  /** Pembulatan Tunai dicatat terpisah, tidak termasuk `penjualan`. */
  pembulatanTunai: number;
  /** Per Metode Bayar: `jumlah` = banyaknya Pembayaran, `nilai` = rupiah yang melunasi Tagihan. */
  perMetodeBayar: { jenis: string; jumlah: number; nilai: number }[];
}

/**
 * Penjualan satu tanggal per Outlet, dihitung langsung dari Tagihan lunas dan Pembayarannya
 * (tanpa Rangkuman Harian). Tagihan yang masih terbuka belum dihitung, termasuk Pembayaran sebagiannya.
 */
export async function penjualanHarian(tx: TxDb, outletIds: string[], tanggal: string): Promise<PenjualanHarian[]> {
  if (outletIds.length === 0) return [];
  const perOutlet = await tx
    .select({
      outletId: tagihan.outletId,
      penjualan: sum(tagihan.total).mapWith(Number),
      jumlahTagihan: count(),
      pembulatanTunai: sum(tagihan.pembulatanTunai).mapWith(Number),
    })
    .from(tagihan)
    .where(lunasPada(outletIds, tanggal))
    .groupBy(tagihan.outletId);
  const perMetode = await tx
    .select({
      outletId: tagihan.outletId,
      jenis: pembayaran.metode,
      jumlah: count(),
      nilai: sum(sql`${pembayaran.jumlah} - ${pembayaran.pembulatan}`).mapWith(Number),
    })
    .from(pembayaran)
    .innerJoin(tagihan, eq(tagihan.id, pembayaran.tagihanId))
    .where(lunasPada(outletIds, tanggal))
    .groupBy(tagihan.outletId, pembayaran.metode);
  const urutan = (jenis: string) => (JENIS_METODE_BAYAR as readonly string[]).indexOf(jenis);
  return outletIds.map((outletId) => {
    const o = perOutlet.find((x) => x.outletId === outletId);
    return {
      outletId,
      tanggal,
      penjualan: o?.penjualan ?? 0,
      jumlahTagihan: o?.jumlahTagihan ?? 0,
      pembulatanTunai: o?.pembulatanTunai ?? 0,
      perMetodeBayar: perMetode
        .filter((x) => x.outletId === outletId)
        .map((x) => ({ jenis: x.jenis, jumlah: x.jumlah, nilai: x.nilai ?? 0 }))
        .sort((a, b) => urutan(a.jenis) - urutan(b.jenis)),
    };
  });
}

/** Penjualan dan Tagihan tertutup per Outlet untuk dashboard (sesi Pengguna). */
@Controller('outlet/:outletId')
@UseGuards(SesiGuard)
export class PenjualanDashboardController {
  constructor(
    private readonly db: Database,
    private readonly jam: Jam,
  ) {}

  /** Penjualan hari ini, jumlah Tagihan, dan penjualan per Metode Bayar, dari data langsung. */
  @Get('penjualan/hari-ini')
  @PerluIzin('dashboard.lihat', { outletParam: 'outletId' })
  async hariIni(@Param('outletId') outletId: string) {
    const tx = this.db.tenant();
    await this.pastikanOutlet(tx, outletId);
    const [hasil] = await penjualanHarian(tx, [outletId], tanggalOperasional(this.jam.sekarang()));
    return hasil!;
  }

  /** Tagihan tertutup (lunas) pada `tanggal` (default hari ini), terbaru dulu. */
  @Get('tagihan')
  @PerluIzin('dashboard.lihat', { outletParam: 'outletId' })
  async tertutup(@Param('outletId') outletId: string, @Query('tanggal') tanggalQuery?: string) {
    const tx = this.db.tenant();
    await this.pastikanOutlet(tx, outletId);
    const tanggal = tanggalQuery === undefined ? tanggalOperasional(this.jam.sekarang()) : tanggalValid(tanggalQuery, 'tanggal');
    const daftar = await tx
      .select()
      .from(tagihan)
      .where(lunasPada([outletId], tanggal))
      .orderBy(desc(tagihan.ditutupPada), desc(tagihan.nomorNota));
    const ids = daftar.map((t) => t.id);
    const item = await itemTagihan(tx, ids);
    const bayar = ids.length === 0 ? [] : await tx.select().from(pembayaran).where(inArray(pembayaran.tagihanId, ids));
    const mejanya = await mejaTagihan(tx, ids);
    return daftar.map((t) => ({
      id: t.id,
      outletId: t.outletId,
      status: t.status,
      kanal: t.kanal,
      meja: mejanya.filter((m) => m.tagihanId === t.id).map((m) => ({ id: m.id, label: m.label })),
      namaPelanggan: t.namaPelanggan,
      nomorNota: t.nomorNota,
      dibukaPada: t.dibukaPada,
      ditutupPada: t.ditutupPada,
      total: t.total ?? 0,
      pembulatanTunai: t.pembulatanTunai ?? 0,
      jumlahItem: item.filter((i) => i.tagihanId === t.id && i.status !== 'batal').reduce((s, i) => s + i.jumlah, 0),
      metodeBayar: [...new Set(bayar.filter((p) => p.tagihanId === t.id).map((p) => p.metode))],
    }));
  }

  /** Detail satu Tagihan Outlet ini: Pesanan, rincian, dan Pembayaran. */
  @Get('tagihan/:id')
  @PerluIzin('dashboard.lihat', { outletParam: 'outletId' })
  async detail(@Param('outletId') outletId: string, @Param('id') id: string) {
    const tx = this.db.tenant();
    await this.pastikanOutlet(tx, outletId);
    return tagihanLengkap(tx, await tagihanDiOutlet(tx, outletId, id));
  }

  private async pastikanOutlet(tx: TxDb, outletId: string): Promise<void> {
    const [o] = await tx.select({ id: outlet.id }).from(outlet).where(eq(outlet.id, outletId));
    if (!o) throw tidakDitemukan('Outlet');
  }
}
