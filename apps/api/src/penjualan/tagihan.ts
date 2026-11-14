import { ConflictException } from '@nestjs/common';
import { hitungTagihan, type Kanal, type RincianTagihan } from '@lifestore/domain';
import { and, asc, eq, inArray, or, sql } from 'drizzle-orm';
import type { TxDb } from '../database/database';
import { itemPesanan, kejadianItemPesanan, meja, pembayaran, pesanan, tagihan, tagihanMeja } from '../database/schema';
import { type Masukan, teks, tidakDitemukan } from '../umum/validasi';

/**
 * Model baca Tagihan yang dipakai semua endpoint penjualan. Angka Tagihan SELALU dihitung di sini
 * dari Item Pesanan tersalin lewat Hitung Tagihan (`@lifestore/domain`); angka dari klien tidak pernah dipakai.
 */

export type BarisTagihan = typeof tagihan.$inferSelect;
export type BarisItemPesanan = typeof itemPesanan.$inferSelect;
export type BarisPembayaran = typeof pembayaran.$inferSelect;
export type StatusItemPesanan = (typeof kejadianItemPesanan.$inferSelect)['status'];

export const STATUS_ITEM_AWAL: StatusItemPesanan = 'menunggu';

/** ID buatan klien (opsional), sekaligus kunci idempoten perintah kasir. */
export function idKlien(m: Masukan): string | undefined {
  if (m.id === undefined || m.id === null) return undefined;
  return teks(m, 'id', { maks: 64 });
}

/** ID buatan klien sudah dipakai untuk hal lain (termasuk oleh Tenant lain; tidak membocorkan apa pun). */
export function idDipakai(): ConflictException {
  return new ConflictException({ kode: 'id_dipakai', pesan: 'ID sudah dipakai.' });
}

/** Item Pesanan yang belum masuk dapur: masih menunggu, atau ditahan sampai lunas (Outlet bayar-dulu). */
export function belumDimasak(status: StatusItemPesanan): boolean {
  return status === 'menunggu' || status === 'ditahan';
}

/**
 * Tolak perubahan (batal item, Diskon Manual) yang membuat total Tagihan tidak lagi di atas jumlah
 * yang sudah dibayar: Tagihan itu tidak akan bisa ditutup, dan refund belum ada.
 */
export async function pastikanTotalDiAtasDibayar(tx: TxDb, tagihanId: string, totalBaru: number): Promise<void> {
  const bayar = await tx.select({ jumlah: pembayaran.jumlah, pembulatan: pembayaran.pembulatan }).from(pembayaran).where(eq(pembayaran.tagihanId, tagihanId));
  if (bayar.length === 0) return;
  const dibayar = bayar.reduce((s, p) => s + nilaiMelunasi(p), 0);
  if (totalBaru <= dibayar) {
    throw new ConflictException({
      kode: 'pembayaran_melebihi_total',
      dibayar,
      total: totalBaru,
      pesan: 'Tagihan sudah dibayar sebagian; perubahan ini membuat totalnya tidak lagi di atas yang sudah dibayar.',
    });
  }
}

export function tagihanSudahDitutup(): ConflictException {
  return new ConflictException({ kode: 'tagihan_sudah_ditutup', pesan: 'Tagihan ini sudah ditutup.' });
}

/**
 * Tagihan milik Outlet perangkat, atau 404. `kunci: true` mengunci barisnya (FOR UPDATE) sampai
 * transaksi selesai; pakai untuk setiap perintah yang mengubah Tagihan supaya perintah paralel antre.
 */
export async function tagihanDiOutlet(tx: TxDb, outletId: string, id: string, opsi: { kunci?: boolean } = {}): Promise<BarisTagihan> {
  const q = tx
    .select()
    .from(tagihan)
    .where(and(eq(tagihan.id, id), eq(tagihan.outletId, outletId)));
  const [t] = opsi.kunci ? await q.for('update') : await q;
  if (!t) throw tidakDitemukan('Tagihan');
  return t;
}

/** Status dapur terkini setiap Item Pesanan: kejadian terakhirnya. */
export async function statusItemPesanan(tx: TxDb, itemIds: string[]): Promise<Map<string, StatusItemPesanan>> {
  if (itemIds.length === 0) return new Map();
  const baris = await tx
    .selectDistinctOn([kejadianItemPesanan.itemPesananId], { itemPesananId: kejadianItemPesanan.itemPesananId, status: kejadianItemPesanan.status })
    .from(kejadianItemPesanan)
    .where(inArray(kejadianItemPesanan.itemPesananId, itemIds))
    .orderBy(kejadianItemPesanan.itemPesananId, sql`${kejadianItemPesanan.urutan} desc`);
  return new Map(baris.map((b) => [b.itemPesananId, b.status]));
}

export interface ItemBerstatus extends BarisItemPesanan {
  status: StatusItemPesanan;
}

/** Item Pesanan sebuah Tagihan beserta status dapurnya, urut kiriman. */
export async function itemTagihan(tx: TxDb, tagihanIds: string[]): Promise<ItemBerstatus[]> {
  if (tagihanIds.length === 0) return [];
  const baris = await tx
    .select()
    .from(itemPesanan)
    .where(inArray(itemPesanan.tagihanId, tagihanIds))
    .orderBy(asc(itemPesanan.createdAt), asc(itemPesanan.pesananId), asc(itemPesanan.urutan));
  const status = await statusItemPesanan(
    tx,
    baris.map((b) => b.id),
  );
  return baris.map((b) => ({ ...b, status: status.get(b.id) ?? STATUS_ITEM_AWAL }));
}

/** Hitung Tagihan dari Item Pesanan tersalin dan Profil Pajak yang tersalin di Tagihan. */
export function rincianTagihan(t: BarisTagihan, item: readonly ItemBerstatus[]): RincianTagihan {
  return hitungTagihan({
    items: item.map((i) => ({
      hargaSatuan: i.hargaSatuan,
      jumlah: i.jumlah,
      pilihan: i.pilihan,
      batal: i.status === 'batal',
      bebasPajak: i.bebasPajak,
    })),
    kanal: t.kanal,
    profilPajak: { jenis: t.pajakJenis, tarifPersen: t.pajakTarifPersen, hargaTermasukPajak: t.hargaTermasukPajak },
    serviceCharge: { tarifPersen: t.serviceChargePersen, kanal: t.serviceChargeKanal as Kanal[] },
    diskon: t.diskonJenis && t.diskonNilai !== null ? { jenis: t.diskonJenis, nilai: t.diskonNilai } : null,
  });
}

export function tampilkanItem(i: ItemBerstatus) {
  return {
    id: i.id,
    pesananId: i.pesananId,
    menuId: i.menuId,
    nama: i.nama,
    varianId: i.varianId,
    namaVarian: i.namaVarian,
    hargaSatuan: i.hargaSatuan,
    jumlah: i.jumlah,
    pilihan: i.pilihan,
    bebasPajak: i.bebasPajak,
    stasiunId: i.stasiunId,
    catatan: i.catatan,
    status: i.status,
  };
}

/**
 * Status Pesanan, diturunkan dari Item Pesanan di dalamnya (item batal diabaikan):
 * `batal` bila semua itemnya batal, `disajikan` bila semua sudah disajikan, `siap` bila semua
 * sudah siap atau disajikan, `dimasak` bila ada yang sudah mulai dikerjakan, `ditahan` bila semuanya
 * masih ditahan (Outlet bayar-dulu, belum lunas), selain itu `menunggu`.
 */
export function statusPesanan(status: readonly StatusItemPesanan[]): StatusItemPesanan {
  const aktif = status.filter((s) => s !== 'batal');
  if (aktif.length === 0) return status.length > 0 ? 'batal' : 'menunggu';
  if (aktif.every((s) => s === 'disajikan')) return 'disajikan';
  if (aktif.every((s) => s === 'siap' || s === 'disajikan')) return 'siap';
  if (aktif.every((s) => s === 'ditahan')) return 'ditahan';
  if (aktif.some((s) => s !== 'menunggu' && s !== 'ditahan')) return 'dimasak';
  return 'menunggu';
}

export function tampilkanPesanan(p: typeof pesanan.$inferSelect, item: readonly ItemBerstatus[]) {
  const itemnya = item.filter((i) => i.pesananId === p.id);
  return {
    id: p.id,
    tagihanId: p.tagihanId,
    nomorPesanan: p.nomorPesanan,
    dikirimPada: p.dikirimPada,
    status: statusPesanan(itemnya.map((i) => i.status)),
    item: itemnya.map(tampilkanItem),
  };
}

export function tampilkanPembayaran(p: BarisPembayaran) {
  return {
    id: p.id,
    tagihanId: p.tagihanId,
    metode: p.metode,
    jumlah: p.jumlah,
    diterima: p.diterima,
    kembalian: p.kembalian,
    /** Bagian `jumlah` dari Pembulatan Tunai; `jumlah − pembulatan` yang melunasi Tagihan. */
    pembulatan: p.pembulatan,
    referensi: p.referensi,
    dibayarPada: p.dibayarPada,
  };
}

/** Angka Tagihan: dibekukan bila sudah ditutup, dihitung ulang dari itemnya bila masih terbuka. */
function rincianBerlaku(t: BarisTagihan, item: readonly ItemBerstatus[]): Omit<RincianTagihan, 'pembulatanTunai' | 'totalDibayar'> {
  if (t.status !== 'terbuka' && t.total !== null) {
    return {
      subtotal: t.subtotal ?? 0,
      diskon: t.diskon ?? 0,
      serviceCharge: t.serviceCharge ?? 0,
      dasarPajak: t.dasarPajak ?? 0,
      pajak: t.pajak ?? 0,
      total: t.total,
    };
  }
  const { subtotal, diskon, serviceCharge, dasarPajak, pajak, total } = rincianTagihan(t, item);
  return { subtotal, diskon, serviceCharge, dasarPajak, pajak, total };
}

export interface MejaTagihan {
  tagihanId: string;
  id: string;
  label: string;
}

/** Meja yang ditempati Tagihan-Tagihan ini; Meja utama (`tagihan.mejaId`) dulu, lalu urut gabung. */
export async function mejaTagihan(tx: TxDb, tagihanIds: string[]): Promise<MejaTagihan[]> {
  if (tagihanIds.length === 0) return [];
  return tx
    .select({ tagihanId: tagihanMeja.tagihanId, id: meja.id, label: meja.label })
    .from(tagihanMeja)
    .innerJoin(meja, eq(meja.id, tagihanMeja.mejaId))
    .where(inArray(tagihanMeja.tagihanId, tagihanIds))
    .orderBy(asc(tagihanMeja.createdAt), asc(meja.label));
}

/** Nilai Pembayaran yang melunasi Tagihan: tanpa kembalian dan tanpa Pembulatan Tunai. */
export function nilaiMelunasi(p: Pick<BarisPembayaran, 'jumlah' | 'pembulatan'>): number {
  return p.jumlah - p.pembulatan;
}

/** Pesanan yang itemnya (masih) ada di Tagihan ini, termasuk Pesanan asal item hasil Pisah Tagihan atau gabung Meja. */
async function pesananTagihan(tx: TxDb, tagihanIds: string[], item: readonly ItemBerstatus[]) {
  const dariItem = [...new Set(item.map((i) => i.pesananId))];
  return tx
    .select()
    .from(pesanan)
    .where(dariItem.length > 0 ? or(inArray(pesanan.tagihanId, tagihanIds), inArray(pesanan.id, dariItem)) : inArray(pesanan.tagihanId, tagihanIds))
    .orderBy(asc(pesanan.createdAt), asc(pesanan.nomorPesanan));
}

function ringkasTagihan(t: BarisTagihan, item: readonly ItemBerstatus[], bayar: readonly BarisPembayaran[], mejanya: readonly MejaTagihan[]) {
  const rincian = rincianBerlaku(t, item);
  const dibayar = bayar.reduce((s, p) => s + nilaiMelunasi(p), 0);
  return {
    id: t.id,
    outletId: t.outletId,
    status: t.status,
    kanal: t.kanal,
    mejaId: t.mejaId,
    /** Semua Meja yang ditempati (lebih dari satu setelah gabung Meja). */
    meja: mejanya.map((m) => ({ id: m.id, label: m.label })),
    asalTagihanId: t.asalTagihanId,
    digabungKeTagihanId: t.digabungKeTagihanId,
    namaPelanggan: t.namaPelanggan,
    dibukaPada: t.dibukaPada,
    ditutupPada: t.ditutupPada,
    nomorNota: t.nomorNota,
    /** Salinan Profil Pajak; kasir memakainya untuk Hitung Tagihan langsung di layar. */
    profilPajak: { jenis: t.pajakJenis, tarifPersen: t.pajakTarifPersen, labelStruk: t.pajakLabel, hargaTermasukPajak: t.hargaTermasukPajak },
    serviceCharge: { tarifPersen: t.serviceChargePersen, kanal: t.serviceChargeKanal },
    /** Diskon Manual yang terpasang; kasir memakainya untuk Hitung Tagihan langsung di layar. */
    diskonManual: t.diskonJenis && t.diskonNilai !== null ? { jenis: t.diskonJenis, nilai: t.diskonNilai, alasan: t.diskonAlasan } : null,
    /** Alasan void atau pembatalan Tagihan. */
    alasanTutup: t.alasanTutup,
    rincian,
    total: rincian.total,
    dibayar,
    sisa: Math.max(rincian.total - dibayar, 0),
    /** Pembulatan Tunai tercatat terpisah; tidak termasuk `total` maupun `dibayar`. */
    pembulatanTunai: bayar.reduce((s, p) => s + p.pembulatan, 0),
  };
}

/** Tagihan lengkap: Pesanan dengan Item Pesanan, rincian, dan Pembayaran. */
export async function tagihanLengkap(tx: TxDb, t: BarisTagihan) {
  const item = await itemTagihan(tx, [t.id]);
  const daftarPesanan = await pesananTagihan(tx, [t.id], item);
  const bayar = await tx.select().from(pembayaran).where(eq(pembayaran.tagihanId, t.id)).orderBy(asc(pembayaran.createdAt), asc(pembayaran.id));
  return {
    ...ringkasTagihan(t, item, bayar, await mejaTagihan(tx, [t.id])),
    pesanan: daftarPesanan.map((p) => tampilkanPesanan(p, item)).filter((p) => p.item.length > 0),
    pembayaran: bayar.map(tampilkanPembayaran),
  };
}

/** Tagihan terbuka Outlet (strip di atas layar kasir), terlama dulu, dengan total dan Nomor Pesanan. */
export async function tagihanTerbuka(tx: TxDb, outletId: string) {
  const daftar = await tx
    .select()
    .from(tagihan)
    .where(and(eq(tagihan.outletId, outletId), eq(tagihan.status, 'terbuka')))
    .orderBy(asc(tagihan.dibukaPada), asc(tagihan.id));
  const ids = daftar.map((t) => t.id);
  if (ids.length === 0) return [];
  const item = await itemTagihan(tx, ids);
  const daftarPesanan = await pesananTagihan(tx, ids, item);
  const bayar = await tx.select().from(pembayaran).where(inArray(pembayaran.tagihanId, ids));
  const mejanya = await mejaTagihan(tx, ids);
  return daftar.map((t) => {
    const itemnya = item.filter((i) => i.tagihanId === t.id);
    const pesananIds = new Set(itemnya.map((i) => i.pesananId));
    return {
      ...ringkasTagihan(
        t,
        itemnya,
        bayar.filter((p) => p.tagihanId === t.id),
        mejanya.filter((m) => m.tagihanId === t.id),
      ),
      nomorPesanan: daftarPesanan.filter((p) => pesananIds.has(p.id)).map((p) => p.nomorPesanan),
      jumlahItem: itemnya.filter((i) => i.status !== 'batal').reduce((s, i) => s + i.jumlah, 0),
    };
  });
}
