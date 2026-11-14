import { Body, ConflictException, Controller, Param, Post, Res, UseGuards } from '@nestjs/common';
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
import { angka, type Masukan, objek, pilihan, teksOpsional, tidakValid } from '../umum/validasi';
import { KUNCI_NOTA, nomorBerikut } from './nomor';
import {
  type BarisTagihan,
  idDipakai,
  idKlien,
  itemTagihan,
  nilaiMelunasi,
  rincianTagihan,
  tagihanDiOutlet,
  tagihanLengkap,
  tagihanSudahDitutup,
  tampilkanPembayaran,
} from './tagihan';

const MAKS_RUPIAH = 1_000_000_000_000;

function rupiah(m: Masukan, kolom: string): number {
  const v = angka(m, kolom, { min: 1, maks: MAKS_RUPIAH });
  if (!Number.isInteger(v)) throw tidakValid(kolom, 'Harus rupiah bulat.');
  return v;
}

function ditolak(kode: string, pesan: string, tambahan: object = {}): ConflictException {
  return new ConflictException({ kode, pesan, ...tambahan });
}

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
   * - Tunai: wajib `diterima` dan Shift terbuka di perangkat ini; kembalian dihitung di sini.
   *   Pembayaran tunai yang melunasi dibulatkan menurut aturan Pembulatan Tunai Outlet; selisihnya
   *   disimpan di `pembulatan`, terpisah dari penjualan.
   * - Non-tunai tidak boleh melebihi sisa.
   * - Di Outlet bayar-dulu, Pesanan yang ditahan masuk dapur saat Tagihan lunas.
   *
   * Mengirim ulang dengan `id` yang sama mengembalikan Pembayaran yang sudah tersimpan.
   */
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
    const jumlahDiminta = m.jumlah === undefined || m.jumlah === null ? undefined : rupiah(m, 'jumlah');
    const diterimaTunai = metode === 'tunai' ? rupiah(m, 'diterima') : undefined;
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
    // Tunai masuk laci: wajib ada Shift terbuka di perangkat ini.
    const shiftId = await kunciShiftTerbuka(tx, p.id);
    if (metode === 'tunai' && !shiftId) throw ditolak('perlu_shift', 'Buka Shift dulu sebelum menerima tunai.');

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
    if (!lunas) {
      res.status(201);
      return { pembayaran: tampilkanPembayaran(baru), tagihan: await tagihanLengkap(tx, t) };
    }
    const semuaPembulatan = (await tx.select({ pembulatan: pembayaran.pembulatan }).from(pembayaran).where(eq(pembayaran.tagihanId, t.id))).reduce((s, x) => s + x.pembulatan, 0);
    const ditutup = await tutupTagihanLunas(tx, t, { ...rincian, pembulatanTunai: semuaPembulatan }, { anggotaId: pelaku.anggotaId, pada: sekarang });
    // Outlet bayar-dulu: Pesanan yang ditahan baru masuk dapur sekarang.
    const ditahan = item.filter((i) => i.status === 'ditahan');
    if (ditahan.length > 0) {
      await tx.insert(kejadianItemPesanan).values(
        ditahan.map((i) => ({ tenantId: p.tenantId, outletId: p.outletId, itemPesananId: i.id, status: 'menunggu' as const, anggotaId: pelaku.anggotaId, perangkatId: p.id })),
      );
    }
    res.status(201);
    return { pembayaran: tampilkanPembayaran(baru), tagihan: await tagihanLengkap(tx, ditutup) };
  }
}
