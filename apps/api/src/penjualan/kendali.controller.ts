import { Body, Controller, Delete, ForbiddenException, HttpCode, Param, Post, Put, UseGuards } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { PenulisLogAudit } from '../audit/audit.module';
import { Database } from '../database/database';
import { klaimPerintah } from '../database/perintah-klien';
import { kejadianItemPesanan, pembayaran, tagihan } from '../database/schema';
import { type Pelaku, PelakuAktif, PERAN_PEMILIK, PerluIzin, punyaIzin } from '../izin/izin';
import { Perangkat, type PerangkatAktif, PerangkatGuard } from '../karyawan/perangkat';
import { type BuktiPersetujuan, buktiPersetujuanDari, PersetujuanAtasan } from '../karyawan/persetujuan-atasan';
import { kunciShiftTerbuka } from '../shift/shift.module';
import { Jam } from '../umum/jam';
import { angka, ditolak, idKlien, objek, pilihan, rupiah, teks, teksOpsional, tidakDitemukan, tidakValid } from '../umum/validasi';
import { type BarisTagihan, belumDimasak, itemTagihan, pastikanTotalDiAtasDibayar, pelakuAudit, pernahBerisiItem, rincianTagihan, tagihanDiOutlet, tagihanLengkap, tagihanSudahDitutup } from './tagihan';

/**
 * Batas Diskon Manual (persen dari subtotal) per Peran. Di atas batas butuh Persetujuan Atasan
 * dari Anggota berizin `diskon.di_atas_batas`. Peran custom dan batas yang bisa diatur menyusul.
 */
export const BATAS_DISKON_PERSEN: Record<string, number> = { manajer_outlet: 100, kasir: 10, pelayan: 0, dapur: 0 };

const JENIS_DISKON = ['persen', 'nominal'] as const;

/** Batas Diskon Manual Pelaku di satu Outlet: batas tertinggi dari Perannya di Outlet itu. */
export function batasDiskonPersen(pelaku: Pick<Pelaku, 'peran' | 'penugasan'>, outletId: string): number {
  if (pelaku.peran === PERAN_PEMILIK) return 100;
  return Math.max(0, ...pelaku.penugasan.filter((t) => t.outletId === outletId).map((t) => BATAS_DISKON_PERSEN[t.peran] ?? 0));
}

/** Diskon Manual sebagai persen dari subtotal; nominal dinilai terhadap subtotal itu. */
function persenDiskon(d: { jenis: 'persen' | 'nominal'; nilai: number }, subtotal: number): number {
  return d.jenis === 'persen' ? d.nilai : (d.nilai / subtotal) * 100;
}

function diskonTerpasang(t: BarisTagihan) {
  return t.diskonJenis && t.diskonNilai !== null ? { jenis: t.diskonJenis, nilai: t.diskonNilai, alasan: t.diskonAlasan } : null;
}

/**
 * Kendali kasir atas Tagihan terbuka: batal Item Pesanan, batal Tagihan kosong, void, dan
 * Diskon Manual. Setiap aksi mengunci Tagihan dulu, memeriksa Persetujuan Atasan bila perlu, dan
 * tercatat di Log Audit dalam transaksi yang sama (aksi yang ditolak tidak meninggalkan catatan).
 */
@Controller('tagihan/:tagihanId')
@UseGuards(PerangkatGuard)
export class KendaliController {
  constructor(
    private readonly db: Database,
    private readonly jam: Jam,
    private readonly persetujuan: PersetujuanAtasan,
    private readonly audit: PenulisLogAudit,
  ) {}

  /**
   * Diskon Manual sebesar `persen` dari subtotal oleh Pelaku: dalam batas Perannya tidak butuh
   * apa-apa (hasil `null`); di atas batas wajib Persetujuan Atasan `diskon.di_atas_batas`.
   */
  private async persetujuanDiskon(pelaku: Pelaku, outletId: string, persen: number, bukti: BuktiPersetujuan | undefined): Promise<string | null> {
    const batasPersen = batasDiskonPersen(pelaku, outletId);
    if (persen <= batasPersen) return null;
    if (!bukti && !punyaIzin(pelaku, 'diskon.di_atas_batas', outletId)) {
      throw new ForbiddenException({
        kode: 'perlu_persetujuan_atasan',
        izin: 'diskon.di_atas_batas',
        batasPersen,
        pesan: `Diskon Manual di atas ${batasPersen}% butuh Persetujuan Atasan (PIN).`,
      });
    }
    return (await this.persetujuan.pastikan(pelaku, 'diskon.di_atas_batas', outletId, bukti)).penyetujuAnggotaId;
  }

  /**
   * Batalkan satu Item Pesanan. Yang masih `menunggu` tanpa persetujuan; yang sudah `dimasak` atau
   * `siap` butuh alasan dan Persetujuan Atasan, dan ditandai Waste. Item `disajikan` tidak bisa dibatalkan.
   */
  @Post('item/:itemId/batal')
  @HttpCode(200)
  @PerluIzin('kasir.buka')
  async batalItem(@Perangkat() p: PerangkatAktif, @PelakuAktif() pelaku: Pelaku, @Param('tagihanId') tagihanId: string, @Param('itemId') itemId: string, @Body() body: unknown) {
    const m = objek(body ?? {});
    const bukti = buktiPersetujuanDari(m.persetujuanAtasan);
    const tx = this.db.tenant();
    const t = await tagihanDiOutlet(tx, p.outletId, tagihanId, { kunci: true });
    const item = (await itemTagihan(tx, [t.id])).find((i) => i.id === itemId);
    if (!item) throw tidakDitemukan('Item Pesanan');
    if (item.status === 'batal') return tagihanLengkap(tx, t);
    if (t.status !== 'terbuka') throw tagihanSudahDitutup();
    if (item.status === 'disajikan') throw ditolak('item_sudah_disajikan', 'Item Pesanan yang sudah disajikan tidak bisa dibatalkan.');

    // Bayar Terpisah: sisa item harus tetap bernilai di atas yang sudah dibayar.
    const sisa = rincianTagihan(t, (await itemTagihan(tx, [t.id])).map((i) => (i.id === item.id ? { ...i, status: 'batal' as const } : i)));
    await pastikanTotalDiAtasDibayar(tx, t.id, sisa.total);

    // Diskon Manual nominal membesar persentasenya ketika subtotal menyusut: batas Peran diperiksa
    // lagi terhadap subtotal yang tersisa. Diskon persen tidak berubah, jadi tidak diperiksa ulang.
    const diskonLama = diskonTerpasang(t);
    const penyetujuDiskon =
      diskonLama?.jenis === 'nominal' && sisa.subtotal > 0 ? await this.persetujuanDiskon(pelaku, p.outletId, persenDiskon(diskonLama, sisa.subtotal), bukti) : null;

    // Item yang ditahan (Outlet bayar-dulu) belum masuk dapur, sama seperti yang masih menunggu.
    const sudahDimasak = !belumDimasak(item.status);
    const alasan = sudahDimasak ? teks(m, 'alasan', { maks: 200 }) : (teksOpsional(m, 'alasan', { maks: 200 }) ?? null);
    const penyetujuAnggotaId = sudahDimasak ? (await this.persetujuan.pastikan(pelaku, 'item.batal_setelah_dimasak', p.outletId, bukti)).penyetujuAnggotaId : penyetujuDiskon;
    await tx.insert(kejadianItemPesanan).values({
      tenantId: p.tenantId,
      outletId: p.outletId,
      itemPesananId: item.id,
      status: 'batal',
      anggotaId: pelaku.anggotaId,
      perangkatId: p.id,
      alasan,
      waste: sudahDimasak,
    });
    await this.audit.catat({
      aksi: 'batal_item_pesanan',
      entitas: 'item_pesanan',
      entitasId: item.id,
      outletId: p.outletId,
      pelaku: pelakuAudit(pelaku, p),
      sebelum: { status: item.status },
      sesudah: { status: 'batal', waste: sudahDimasak, tagihanId: t.id, nama: item.nama, jumlah: item.jumlah },
      alasan,
      penyetujuAnggotaId,
    });
    return tagihanLengkap(tx, t);
  }

  /**
   * Batalkan Tagihan yang belum pernah berisi Item Pesanan. Tagihan berisi item (walau semuanya
   * batal) tidak bisa dihapus, hanya di-void, supaya jejaknya selalu ada.
   */
  @Delete()
  @PerluIzin('kasir.buka')
  async batalTagihan(@Perangkat() p: PerangkatAktif, @PelakuAktif() pelaku: Pelaku, @Param('tagihanId') tagihanId: string) {
    const tx = this.db.tenant();
    const t = await tagihanDiOutlet(tx, p.outletId, tagihanId, { kunci: true });
    if (t.status === 'batal') return tagihanLengkap(tx, t);
    if (t.status !== 'terbuka') throw tagihanSudahDitutup();
    if (await pernahBerisiItem(tx, t.id)) throw ditolak('tagihan_berisi_item', 'Tagihan yang sudah berisi item tidak bisa dihapus, hanya di-void dengan Persetujuan Atasan.');
    const [dibatalkan] = await tx
      .update(tagihan)
      .set({ status: 'batal', ditutupPada: this.jam.sekarang(), ditutupOlehAnggotaId: pelaku.anggotaId })
      .where(eq(tagihan.id, t.id))
      .returning();
    await this.audit.catat({
      aksi: 'batal_tagihan',
      entitas: 'tagihan',
      entitasId: t.id,
      outletId: p.outletId,
      pelaku: pelakuAudit(pelaku, p),
      sebelum: { status: 'terbuka' },
      sesudah: { status: 'batal' },
    });
    return tagihanLengkap(tx, dibatalkan!);
  }

  /**
   * Void Tagihan terbuka yang berisi item: wajib alasan dan Persetujuan Atasan. Item yang belum
   * disajikan ikut batal (yang sudah dimasak ditandai Waste) supaya dapur berhenti. Angka Tagihan
   * dibekukan sebagai nilai void; Tagihan void tidak mendapat Nomor Nota.
   * Mengirim ulang dengan `id` yang sama mengembalikan Tagihan itu tanpa menjalankan void lagi.
   */
  @Post('void')
  @HttpCode(200)
  @PerluIzin('kasir.buka')
  async void(@Perangkat() p: PerangkatAktif, @PelakuAktif() pelaku: Pelaku, @Param('tagihanId') tagihanId: string, @Body() body: unknown) {
    const m = objek(body);
    const bukti = buktiPersetujuanDari(m.persetujuanAtasan);
    const alasan = teks(m, 'alasan', { maks: 200 });
    const tx = this.db.tenant();
    const t = await tagihanDiOutlet(tx, p.outletId, tagihanId, { kunci: true });
    if ((await klaimPerintah(tx, idKlien(m), { tenantId: p.tenantId, outletId: p.outletId, jenis: 'void_tagihan', entitasId: t.id })) !== 'baru') {
      return tagihanLengkap(tx, t);
    }
    if (t.status !== 'terbuka') throw tagihanSudahDitutup();
    const item = await itemTagihan(tx, [t.id]);
    if (item.length === 0) throw ditolak('tagihan_tanpa_item', 'Tagihan tanpa item cukup dibatalkan, tidak perlu void.');
    const [bayar] = await tx.select({ id: pembayaran.id }).from(pembayaran).where(eq(pembayaran.tagihanId, t.id)).limit(1);
    if (bayar) throw ditolak('tagihan_sudah_dibayar', 'Tagihan yang sudah menerima Pembayaran tidak bisa di-void.');
    const { penyetujuAnggotaId } = await this.persetujuan.pastikan(pelaku, 'tagihan.void', p.outletId, bukti);

    const rincian = rincianTagihan(t, item);
    const sekarang = this.jam.sekarang();
    const dibatalkan = item.filter((i) => i.status !== 'batal' && i.status !== 'disajikan');
    if (dibatalkan.length > 0) {
      await tx.insert(kejadianItemPesanan).values(
        dibatalkan.map((i) => ({
          tenantId: p.tenantId,
          outletId: p.outletId,
          itemPesananId: i.id,
          status: 'batal' as const,
          anggotaId: pelaku.anggotaId,
          perangkatId: p.id,
          alasan,
          waste: !belumDimasak(i.status),
        })),
      );
    }
    const [divoid] = await tx
      .update(tagihan)
      .set({
        status: 'void',
        ditutupPada: sekarang,
        ditutupOlehAnggotaId: pelaku.anggotaId,
        subtotal: rincian.subtotal,
        diskon: rincian.diskon,
        serviceCharge: rincian.serviceCharge,
        dasarPajak: rincian.dasarPajak,
        pajak: rincian.pajak,
        total: rincian.total,
        alasanTutup: alasan,
        voidShiftId: await kunciShiftTerbuka(tx, p.id),
        voidPenyetujuAnggotaId: penyetujuAnggotaId,
      })
      .where(eq(tagihan.id, t.id))
      .returning();
    await this.audit.catat({
      aksi: 'void_tagihan',
      entitas: 'tagihan',
      entitasId: t.id,
      outletId: p.outletId,
      pelaku: pelakuAudit(pelaku, p),
      sebelum: { status: 'terbuka', total: rincian.total, jumlahItem: item.length },
      sesudah: { status: 'void', itemWaste: dibatalkan.filter((i) => !belumDimasak(i.status)).length },
      alasan,
      penyetujuAnggotaId,
    });
    return tagihanLengkap(tx, divoid!);
  }

  /**
   * Pasang Diskon Manual (persen atau nominal rupiah) dengan alasan wajib. Dibatasi persentase per
   * Peran; di atas batas butuh Persetujuan Atasan. Nominal dinilai sebagai persen dari subtotal saat ini.
   * Mengirim ulang dengan `id` yang sama tidak memasang diskon itu lagi (dan tidak menimpa diskon
   * yang dipasang sesudahnya); jawabannya Tagihan dalam keadaan sekarang.
   */
  @Put('diskon')
  @PerluIzin('kasir.buka')
  async diskon(@Perangkat() p: PerangkatAktif, @PelakuAktif() pelaku: Pelaku, @Param('tagihanId') tagihanId: string, @Body() body: unknown) {
    const m = objek(body);
    const bukti = buktiPersetujuanDari(m.persetujuanAtasan);
    const jenis = pilihan(m, 'jenis', JENIS_DISKON);
    const nilai = jenis === 'persen' ? angka(m, 'nilai', { min: 0.01, maks: 100 }) : rupiah(m, 'nilai', { min: 1 });
    const alasan = teks(m, 'alasan', { maks: 200 });
    const tx = this.db.tenant();
    const t = await tagihanDiOutlet(tx, p.outletId, tagihanId, { kunci: true });
    if ((await klaimPerintah(tx, idKlien(m), { tenantId: p.tenantId, outletId: p.outletId, jenis: 'diskon_manual', entitasId: t.id })) !== 'baru') {
      return tagihanLengkap(tx, t);
    }
    if (t.status !== 'terbuka') throw tagihanSudahDitutup();
    const item = await itemTagihan(tx, [t.id]);
    const { subtotal } = rincianTagihan({ ...t, diskonJenis: null, diskonNilai: null }, item);
    if (jenis === 'nominal' && nilai > subtotal) throw tidakValid('nilai', 'Diskon tidak boleh melebihi subtotal Tagihan.');

    // Bayar Terpisah: total setelah diskon harus tetap di atas yang sudah dibayar.
    await pastikanTotalDiAtasDibayar(tx, t.id, rincianTagihan({ ...t, diskonJenis: jenis, diskonNilai: nilai }, item).total);

    const batasPersen = batasDiskonPersen(pelaku, p.outletId);
    const penyetujuAnggotaId = await this.persetujuanDiskon(pelaku, p.outletId, persenDiskon({ jenis, nilai }, subtotal), bukti);
    const [diubah] = await tx
      .update(tagihan)
      .set({ diskonJenis: jenis, diskonNilai: nilai, diskonAlasan: alasan, diskonOlehAnggotaId: pelaku.anggotaId, diskonPenyetujuAnggotaId: penyetujuAnggotaId })
      .where(eq(tagihan.id, t.id))
      .returning();
    const lama = diskonTerpasang(t);
    await this.audit.catat({
      aksi: 'diskon_manual',
      entitas: 'tagihan',
      entitasId: t.id,
      outletId: p.outletId,
      pelaku: pelakuAudit(pelaku, p),
      sebelum: lama ? { jenis: lama.jenis, nilai: lama.nilai } : null,
      sesudah: { jenis, nilai, diskon: rincianTagihan(diubah!, item).diskon, subtotal, batasPersen },
      alasan,
      penyetujuAnggotaId,
    });
    return tagihanLengkap(tx, diubah!);
  }

  /** Lepas Diskon Manual dari Tagihan terbuka. */
  @Delete('diskon')
  @PerluIzin('kasir.buka')
  async hapusDiskon(@Perangkat() p: PerangkatAktif, @PelakuAktif() pelaku: Pelaku, @Param('tagihanId') tagihanId: string) {
    const tx = this.db.tenant();
    const t = await tagihanDiOutlet(tx, p.outletId, tagihanId, { kunci: true });
    if (t.status !== 'terbuka') throw tagihanSudahDitutup();
    const lama = diskonTerpasang(t);
    if (!lama) return tagihanLengkap(tx, t);
    const [diubah] = await tx
      .update(tagihan)
      .set({ diskonJenis: null, diskonNilai: null, diskonAlasan: null, diskonOlehAnggotaId: null, diskonPenyetujuAnggotaId: null })
      .where(and(eq(tagihan.id, t.id)))
      .returning();
    await this.audit.catat({
      aksi: 'hapus_diskon_manual',
      entitas: 'tagihan',
      entitasId: t.id,
      outletId: p.outletId,
      pelaku: pelakuAudit(pelaku, p),
      sebelum: { jenis: lama.jenis, nilai: lama.nilai },
      sesudah: null,
      alasan: lama.alasan,
    });
    return tagihanLengkap(tx, diubah!);
  }
}

/** Buka laci kas tanpa transaksi: aksi sensitif yang selalu butuh alasan dan Persetujuan Atasan. */
@Controller('laci')
@UseGuards(PerangkatGuard)
export class LaciController {
  constructor(
    private readonly db: Database,
    private readonly jam: Jam,
    private readonly persetujuan: PersetujuanAtasan,
    private readonly audit: PenulisLogAudit,
  ) {}

  /**
   * Catat pembukaan laci tanpa transaksi. Laci fisik dibuka oleh perangkat (Agen Cetak, menyusul);
   * endpoint ini memberi izin dan menulis Log Audit. Mengirim ulang dengan `id` yang sama
   * mengembalikan jawaban pertama tanpa mencatat pembukaan kedua.
   */
  @Post('buka')
  @HttpCode(200)
  @PerluIzin('kasir.buka')
  async buka(@Perangkat() p: PerangkatAktif, @PelakuAktif() pelaku: Pelaku, @Body() body: unknown) {
    const m = objek(body);
    const bukti = buktiPersetujuanDari(m.persetujuanAtasan);
    const alasan = teks(m, 'alasan', { maks: 200 });
    const { penyetujuAnggotaId } = await this.persetujuan.pastikan(pelaku, 'laci.buka_tanpa_transaksi', p.outletId, bukti);
    const tx = this.db.tenant();
    const hasil = { dibuka: true, shiftId: await kunciShiftTerbuka(tx, p.id), dibukaPada: this.jam.sekarang(), penyetujuAnggotaId };
    const klaim = await klaimPerintah(tx, idKlien(m), { tenantId: p.tenantId, outletId: p.outletId, jenis: 'buka_laci_tanpa_transaksi', entitasId: p.id, hasil });
    if (klaim !== 'baru') return klaim.hasil;
    const { shiftId, dibukaPada } = hasil;
    await this.audit.catat({
      aksi: 'buka_laci_tanpa_transaksi',
      entitas: 'perangkat',
      entitasId: p.id,
      outletId: p.outletId,
      pelaku: pelakuAudit(pelaku, p),
      sesudah: { shiftId, dibukaPada },
      alasan,
      penyetujuAnggotaId,
    });
    return hasil;
  }
}
