import { Body, Controller, Param, Post, Res, UseGuards } from '@nestjs/common';
import { bulatkanTunai } from '@lifestore/domain';
import { eq } from 'drizzle-orm';
import type { Response } from 'express';
import { Database, type TxDb } from '../database/database';
import { kejadianItemPesanan, outlet, pembayaran, tagihan } from '../database/schema';
import { type Pelaku, PelakuAktif, PerluIzin } from '../izin/izin';
import { Perangkat, type PerangkatAktif, PerangkatGuard } from '../karyawan/perangkat';
import { JENIS_METODE_BAYAR, metodeBayarAktif } from '../pembayaran/metode-bayar.module';
import { kunciShiftTerbuka } from '../shift/shift.module';
import { Jam } from '../umum/jam';
import { ditolak, idDipakai, idKlien, objek, pilihan, rupiah, teksOpsional } from '../umum/validasi';
import { KUNCI_NOTA, nomorBerikut } from './nomor';
import { type BarisTagihan, itemTagihan, nilaiMelunasi, rincianTagihan, tagihanDiOutlet, tagihanLengkap, tagihanSudahDitutup, tampilkanPembayaran } from './tagihan';
import { Skema } from '../openapi-skema';

/**
 * Tutup Tagihan yang sudah lunas: beri Nomor Nota berikutnya dari penghitung Outlet dan bekukan
 * angkanya. Harus dipanggil di transaksi yang sama dengan Pembayaran terakhirnya, supaya nomor
 * berurutan tanpa celah (penutupan yang gagal tidak memakai nomor).
 */
export async function tutupTagihanLunas(
  tx: TxDb,
  t: BarisTagihan,
  rincian: { subtotal: number; diskon: number; serviceCharge: number; dasarPajak: number; pajak: number; total: number; pembulatanTunai?: number },
  oleh: { anggotaId: string; pada: Date },
): Promise<BarisTagihan> {
  const nomorNota = await nomorBerikut(tx, t, KUNCI_NOTA);
  const [ditutup] = await tx
    .update(tagihan)
    .set({
      status: 'lunas',
      nomorNota,
      ditutupPada: oleh.pada,
      ditutupOlehAnggotaId: oleh.anggotaId,
      subtotal: rincian.subtotal,
      diskon: rincian.diskon,
      serviceCharge: rincian.serviceCharge,
      dasarPajak: rincian.dasarPajak,
      pajak: rincian.pajak,
      total: rincian.total,
      pembulatanTunai: rincian.pembulatanTunai ?? 0,
    })
    .where(eq(tagihan.id, t.id))
    .returning();
  return ditutup!;
}

/** Pembayaran Tagihan dari kasir. */
@Controller('tagihan/:tagihanId/pembayaran')
@UseGuards(PerangkatGuard)
export class PembayaranController {
  constructor(
    private readonly db: Database,
    private readonly jam: Jam,
  ) {}

  /**
   * Terima satu Pembayaran: tunai, QRIS statis, EDC, atau transfer (`referensi` opsional).
   * Total dihitung ulang di sini dari Item Pesanan; angka total dari klien diabaikan.
   *
   * - `jumlah` = bagian Tagihan yang dibayar; tanpa `jumlah` berarti melunasi sisanya. Beberapa
   *   Pembayaran untuk satu Tagihan = Bayar Terpisah. Tagihan baru tertutup (dan mendapat Nomor
   *   Nota) saat sisanya nol.
   * - Wajib ada Shift terbuka di perangkat ini, untuk Metode Bayar apa pun.
   * - Tunai: wajib `diterima`; kembalian dihitung di sini.
   *   Pembayaran tunai yang melunasi dibulatkan menurut aturan Pembulatan Tunai Outlet; selisihnya
   *   disimpan di `pembulatan`, terpisah dari penjualan.
   * - Non-tunai tidak boleh melebihi sisa.
   * - Di Outlet bayar-dulu, Pesanan yang ditahan masuk dapur saat Tagihan lunas, atau begitu ada
   *   Pembayaran tunai di kasir.
   *
   * Mengirim ulang dengan `id` yang sama mengembalikan Pembayaran yang sudah tersimpan.
   */
  @Skema('bayar')
  @Post()
  @PerluIzin('kasir.buka')
  async bayar(
    @Perangkat() p: PerangkatAktif,
    @PelakuAktif() pelaku: Pelaku,
    @Param('tagihanId') tagihanId: string,
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
  ) {
    const m = objek(body);
    const id = idKlien(m);
    const metode = pilihan(m, 'metode', JENIS_METODE_BAYAR);
    const jumlahDiminta = m.jumlah === undefined || m.jumlah === null ? undefined : rupiah(m, 'jumlah', { min: 1 });
    const diterimaTunai = metode === 'tunai' ? rupiah(m, 'diterima', { min: 1 }) : undefined;
    const referensi = teksOpsional(m, 'referensi', { maks: 100 }) ?? null;
    const tx = this.db.tenant();
    // Kunci Tagihan: Pembayaran paralel atau kiriman ulang untuk Tagihan yang sama antre di sini.
    const t = await tagihanDiOutlet(tx, p.outletId, tagihanId, { kunci: true });
    if (id) {
      const [lama] = await tx.select().from(pembayaran).where(eq(pembayaran.id, id));
      if (lama) {
        if (lama.tagihanId !== t.id) throw idDipakai();
        res.status(200);
        return { pembayaran: tampilkanPembayaran(lama), tagihan: await tagihanLengkap(tx, t) };
      }
    }
    if (t.status !== 'terbuka') throw tagihanSudahDitutup();
    if (!(await metodeBayarAktif(tx, p.outletId)).some((x) => x.jenis === metode)) {
      throw ditolak('metode_bayar_nonaktif', 'Metode Bayar ini tidak aktif di Outlet.');
    }
    // Setiap Pembayaran (tunai maupun bukan) tercatat pada Shift terbuka di perangkat ini, supaya
    // penjualan per Metode Bayar selalu muncul di sebuah Laporan Shift.
    const shiftId = await kunciShiftTerbuka(tx, p.id);
    if (!shiftId) throw ditolak('perlu_shift', 'Buka Shift dulu sebelum menerima Pembayaran.');

    const item = await itemTagihan(tx, [t.id]);
    if (!item.some((i) => i.status !== 'batal')) throw ditolak('tagihan_kosong', 'Tagihan belum berisi Pesanan.');
    const rincian = rincianTagihan(t, item);
    const sudahDibayar = (await tx.select({ jumlah: pembayaran.jumlah, pembulatan: pembayaran.pembulatan }).from(pembayaran).where(eq(pembayaran.tagihanId, t.id))).reduce(
      (s, x) => s + nilaiMelunasi(x),
      0,
    );
    const sisa = rincian.total - sudahDibayar;

    let jumlah: number;
    let pembulatan = 0;
    let diterima: number;
    if (diterimaTunai !== undefined) {
      const [o] = await tx.select({ kelipatan: outlet.pembulatanTunaiKelipatan, arah: outlet.pembulatanTunaiArah }).from(outlet).where(eq(outlet.id, p.outletId));
      const sisaTunai = bulatkanTunai(sisa, o?.kelipatan && o.arah ? { kelipatan: o.kelipatan, arah: o.arah } : null);
      if (jumlahDiminta !== undefined && jumlahDiminta > Math.max(sisa, sisaTunai)) {
        throw ditolak('pembayaran_lebih', 'Jumlah melebihi sisa Tagihan.', { sisa: sisaTunai });
      }
      if (jumlahDiminta === undefined || jumlahDiminta >= Math.min(sisa, sisaTunai)) {
        // Melunasi: Pembulatan Tunai berlaku atas sisa yang dibayar tunai.
        jumlah = sisaTunai;
        pembulatan = sisaTunai - sisa;
      } else {
        jumlah = jumlahDiminta;
      }
      if (diterimaTunai < jumlah) throw ditolak('pembayaran_kurang', 'Uang yang diterima kurang dari yang harus dibayar.', { sisa: jumlah });
      diterima = diterimaTunai;
    } else {
      jumlah = jumlahDiminta ?? sisa;
      if (jumlah > sisa) throw ditolak('pembayaran_lebih', 'Jumlah melebihi sisa Tagihan.', { sisa });
      if (jumlah < 1) throw ditolak('tagihan_kosong', 'Tidak ada yang perlu dibayar.');
      diterima = jumlah;
    }
    const lunas = sisa - (jumlah - pembulatan) === 0;

    const sekarang = this.jam.sekarang();
    const [baru] = await tx
      .insert(pembayaran)
      .values({
        ...(id ? { id } : {}),
        tenantId: p.tenantId,
        outletId: p.outletId,
        tagihanId: t.id,
        shiftId,
        perangkatId: p.id,
        metode,
        jumlah,
        diterima,
        kembalian: diterima - jumlah,
        pembulatan,
        referensi,
        anggotaId: pelaku.anggotaId,
        dibayarPada: sekarang,
      })
      .onConflictDoNothing()
      .returning();
    if (!baru) throw idDipakai();
    // Outlet bayar-dulu: Pesanan yang ditahan masuk dapur saat Tagihan lunas, atau begitu kasir
    // menerima Pembayaran tunai ("kecuali tunai di kasir").
    const ditahan = lunas || metode === 'tunai' ? item.filter((i) => i.status === 'ditahan') : [];
    if (ditahan.length > 0) {
      await tx.insert(kejadianItemPesanan).values(
        ditahan.map((i) => ({ tenantId: p.tenantId, outletId: p.outletId, itemPesananId: i.id, status: 'menunggu' as const, anggotaId: pelaku.anggotaId, perangkatId: p.id })),
      );
    }
    if (!lunas) {
      res.status(201);
      return { pembayaran: tampilkanPembayaran(baru), tagihan: await tagihanLengkap(tx, t) };
    }
    const semuaPembulatan = (await tx.select({ pembulatan: pembayaran.pembulatan }).from(pembayaran).where(eq(pembayaran.tagihanId, t.id))).reduce((s, x) => s + x.pembulatan, 0);
    const ditutup = await tutupTagihanLunas(tx, t, { ...rincian, pembulatanTunai: semuaPembulatan }, { anggotaId: pelaku.anggotaId, pada: sekarang });
    res.status(201);
    return { pembayaran: tampilkanPembayaran(baru), tagihan: await tagihanLengkap(tx, ditutup) };
  }
}
