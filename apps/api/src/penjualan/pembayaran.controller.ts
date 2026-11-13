import { Body, ConflictException, Controller, Param, Post, Res, UseGuards } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { Response } from 'express';
import { Database, type TxDb } from '../database/database';
import { pembayaran, tagihan } from '../database/schema';
import { type Pelaku, PelakuAktif, PerluIzin } from '../izin/izin';
import { Perangkat, type PerangkatAktif, PerangkatGuard } from '../karyawan/perangkat';
import { type JenisMetodeBayar, metodeBayarAktif } from '../pembayaran/metode-bayar.module';
import { kunciShiftTerbuka } from '../shift/shift.module';
import { Jam } from '../umum/jam';
import { angka, objek, pilihan, tidakValid } from '../umum/validasi';
import { KUNCI_NOTA, nomorBerikut } from './nomor';
import {
  type BarisTagihan,
  idDipakai,
  idKlien,
  itemTagihan,
  rincianTagihan,
  tagihanDiOutlet,
  tagihanLengkap,
  tagihanSudahDitutup,
  tampilkanPembayaran,
} from './tagihan';

/** Metode Bayar yang diterima endpoint ini saat ini. QRIS statis, EDC, dan transfer menyusul. */
const METODE_DITERIMA: readonly JenisMetodeBayar[] = ['tunai'];
const MAKS_RUPIAH = 1_000_000_000_000;

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
  rincian: { subtotal: number; diskon: number; serviceCharge: number; dasarPajak: number; pajak: number; total: number },
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
   * Terima Pembayaran tunai. Total dihitung ulang di sini dari Item Pesanan; angka total dari klien
   * diabaikan. Tunai butuh Shift terbuka di perangkat ini. Saat lunas, Tagihan tertutup otomatis
   * dan mendapat Nomor Nota. Mengirim ulang dengan `id` yang sama mengembalikan Pembayaran yang
   * sudah tersimpan tanpa menggandakannya.
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
    const metode = pilihan(m, 'metode', METODE_DITERIMA);
    const diterima = angka(m, 'diterima', { min: 1, maks: MAKS_RUPIAH });
    if (!Number.isInteger(diterima)) throw tidakValid('diterima', 'Harus rupiah bulat.');
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
    const sudahDibayar = (await tx.select({ jumlah: pembayaran.jumlah }).from(pembayaran).where(eq(pembayaran.tagihanId, t.id))).reduce(
      (s, x) => s + x.jumlah,
      0,
    );
    const sisa = rincian.total - sudahDibayar;
    if (diterima < sisa) throw ditolak('pembayaran_kurang', 'Uang yang diterima kurang dari total Tagihan.', { sisa });

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
        jumlah: sisa,
        diterima,
        kembalian: diterima - sisa,
        anggotaId: pelaku.anggotaId,
        dibayarPada: sekarang,
      })
      .onConflictDoNothing()
      .returning();
    if (!baru) throw idDipakai();
    const ditutup = await tutupTagihanLunas(tx, t, rincian, { anggotaId: pelaku.anggotaId, pada: sekarang });
    res.status(201);
    return { pembayaran: tampilkanPembayaran(baru), tagihan: await tagihanLengkap(tx, ditutup) };
  }
}
