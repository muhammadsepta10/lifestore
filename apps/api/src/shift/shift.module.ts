import { Body, ConflictException, Controller, Get, HttpCode, Module, Param, Post, Res, UseGuards } from '@nestjs/common';
import { and, asc, count, desc, eq, inArray, sql, sum } from 'drizzle-orm';
import type { Response } from 'express';
import { Database, type TxDb } from '../database/database';
import { anggota, kasShift, outlet, pembayaran, pengguna, perangkatTerdaftar, shift, tagihan } from '../database/schema';
import { JENIS_METODE_BAYAR } from '../pembayaran/metode-bayar.module';
import { SesiGuard } from '../identitas/sesi.guard';
import { type Pelaku, PelakuAktif, PerluIzin } from '../izin/izin';
import { KaryawanModule } from '../karyawan/karyawan.module';
import { Perangkat, type PerangkatAktif, PerangkatGuard } from '../karyawan/perangkat';
import { Jam } from '../umum/jam';
import { angka, type Masukan, objek, pilihan, teks, tidakDitemukan, tidakValid } from '../umum/validasi';

type BarisShift = typeof shift.$inferSelect;

const MAKS_RUPIAH = 1_000_000_000_000;
const JENIS_KAS = ['masuk', 'keluar'] as const;

function rupiah(m: Masukan, kolom: string, opsi: { min?: number } = {}): number {
  const v = angka(m, kolom, { min: opsi.min ?? 0, maks: MAKS_RUPIAH });
  if (!Number.isInteger(v)) throw tidakValid(kolom, 'Harus rupiah bulat.');
  return v;
}

/** ID buatan klien (opsional) untuk perintah idempoten dari kasir. */
function idKlien(m: Masukan): string | undefined {
  if (m.id === undefined) return undefined;
  return teks(m, 'id', { maks: 64 });
}

async function namaAnggota(tx: TxDb, ids: (string | null)[]): Promise<Map<string, string>> {
  const unik = [...new Set(ids.filter((x): x is string => x !== null))];
  if (unik.length === 0) return new Map();
  const baris = await tx
    .select({ id: anggota.id, nama: anggota.nama, email: pengguna.email })
    .from(anggota)
    .leftJoin(pengguna, eq(pengguna.id, anggota.penggunaId))
    .where(inArray(anggota.id, unik));
  return new Map(baris.map((b) => [b.id, b.nama ?? b.email ?? '']));
}

async function ringkasKas(tx: TxDb, shiftId: string) {
  const kas = await tx.select().from(kasShift).where(eq(kasShift.shiftId, shiftId)).orderBy(asc(kasShift.createdAt), asc(kasShift.id));
  const total = (jenis: string) => kas.filter((k) => k.jenis === jenis).reduce((s, k) => s + k.jumlah, 0);
  return { kas, kasMasuk: total('masuk'), kasKeluar: total('keluar') };
}

/**
 * Penjualan per Metode Bayar di Shift, dari Pembayaran yang diterima selama Shift itu
 * (`jumlah` = banyaknya Pembayaran, `nilai` = rupiah yang melunasi Tagihan, tanpa kembalian).
 * Void: Tagihan yang di-void dari perangkat ini selama Shift (`nilai` = total Tagihan sebelum void).
 */
async function penjualanShift(tx: TxDb, shiftId: string) {
  const baris = await tx
    .select({
      jenis: pembayaran.metode,
      jumlah: count(),
      nilai: sum(sql`${pembayaran.jumlah} - ${pembayaran.pembulatan}`).mapWith(Number),
      pembulatan: sum(pembayaran.pembulatan).mapWith(Number),
    })
    .from(pembayaran)
    .where(eq(pembayaran.shiftId, shiftId))
    .groupBy(pembayaran.metode);
  const [v] = await tx
    .select({ jumlah: count(), nilai: sum(tagihan.total).mapWith(Number) })
    .from(tagihan)
    .where(and(eq(tagihan.voidShiftId, shiftId), eq(tagihan.status, 'void')));
  const urutan = (jenis: string) => (JENIS_METODE_BAYAR as readonly string[]).indexOf(jenis);
  const penjualanPerMetodeBayar = baris.map((b) => ({ jenis: b.jenis, jumlah: b.jumlah, nilai: b.nilai ?? 0 })).sort((a, b) => urutan(a.jenis) - urutan(b.jenis));
  return {
    penjualanPerMetodeBayar,
    penjualanTunai: penjualanPerMetodeBayar.find((x) => x.jenis === 'tunai')?.nilai ?? 0,
    /** Pembulatan Tunai: ikut masuk laci, tetapi bukan penjualan. */
    pembulatanTunai: baris.reduce((s, b) => s + (b.pembulatan ?? 0), 0),
    void: { jumlah: v?.jumlah ?? 0, nilai: v?.nilai ?? 0 },
  };
}

/** Kas seharusnya di laci: modal awal + penjualan tunai + kas masuk − kas keluar. */
async function hitungKasSeharusnya(tx: TxDb, s: BarisShift): Promise<number> {
  const { kasMasuk, kasKeluar } = await ringkasKas(tx, s.id);
  const { penjualanTunai, pembulatanTunai } = await penjualanShift(tx, s.id);
  return s.kasAwal + penjualanTunai + pembulatanTunai + kasMasuk - kasKeluar;
}

/**
 * Tampilan Shift yang masih terbuka untuk kasir. Sengaja TANPA kas seharusnya, total kas,
 * atau penjualan: Hitung Buta berarti kasir tidak melihat angka sistem sebelum menghitung.
 */
async function tampilkanShiftTerbuka(tx: TxDb, s: BarisShift) {
  const nama = await namaAnggota(tx, [s.dibukaOlehAnggotaId]);
  return {
    id: s.id,
    status: s.status,
    perangkatId: s.perangkatId,
    kasAwal: s.kasAwal,
    dibukaPada: s.dibukaPada,
    dibukaOleh: { id: s.dibukaOlehAnggotaId, nama: nama.get(s.dibukaOlehAnggotaId) ?? '' },
  };
}

/** Laporan Shift (hanya untuk Shift yang sudah ditutup). */
async function laporanShift(tx: TxDb, s: BarisShift) {
  const { kas, kasMasuk, kasKeluar } = await ringkasKas(tx, s.id);
  const penjualan = await penjualanShift(tx, s.id);
  const nama = await namaAnggota(tx, [s.dibukaOlehAnggotaId, s.ditutupOlehAnggotaId, ...kas.map((k) => k.anggotaId)]);
  const [p] = await tx.select({ id: perangkatTerdaftar.id, nama: perangkatTerdaftar.nama }).from(perangkatTerdaftar).where(eq(perangkatTerdaftar.id, s.perangkatId));
  const orang = (id: string | null) => (id ? { id, nama: nama.get(id) ?? '' } : null);
  return {
    id: s.id,
    status: s.status,
    outletId: s.outletId,
    perangkat: p ?? null,
    dibukaOleh: orang(s.dibukaOlehAnggotaId),
    dibukaPada: s.dibukaPada,
    ditutupOleh: orang(s.ditutupOlehAnggotaId),
    ditutupPada: s.ditutupPada,
    kasAwal: s.kasAwal,
    ...penjualan,
    kasMasuk,
    kasKeluar,
    kasSeharusnya: s.kasSeharusnya,
    hitungButa: s.hitungButa,
    selisih: s.selisih,
    kas: kas.map((k) => ({ id: k.id, jenis: k.jenis, jumlah: k.jumlah, alasan: k.alasan, oleh: orang(k.anggotaId), dicatatPada: k.createdAt })),
  };
}

/** Shift terbuka di Perangkat Terdaftar ini, bila ada. */
export async function shiftTerbuka(tx: TxDb, perangkatId: string) {
  const [s] = await tx
    .select()
    .from(shift)
    .where(and(eq(shift.perangkatId, perangkatId), eq(shift.status, 'terbuka')));
  return s ? tampilkanShiftTerbuka(tx, s) : null;
}

/**
 * ID Shift terbuka di perangkat ini (atau null), dengan barisnya dikunci bersama (FOR SHARE) sampai
 * transaksi selesai. Dipakai saat menerima Pembayaran: Tutup Shift menunggu Pembayaran yang sedang
 * berjalan, sehingga kas seharusnya yang dibekukan selalu memuat semua Pembayaran Shift itu.
 */
export async function kunciShiftTerbuka(tx: TxDb, perangkatId: string): Promise<string | null> {
  const [s] = await tx
    .select({ id: shift.id })
    .from(shift)
    .where(and(eq(shift.perangkatId, perangkatId), eq(shift.status, 'terbuka')))
    .for('share');
  return s?.id ?? null;
}

function shiftSudahTerbuka(id: string): ConflictException {
  return new ConflictException({ kode: 'shift_sudah_terbuka', shiftId: id, pesan: 'Perangkat ini sudah punya Shift terbuka. Tutup dulu sebelum membuka Shift baru.' });
}

/** Shift dari layar kasir di Perangkat Terdaftar. */
@Controller('shift')
@UseGuards(PerangkatGuard)
export class ShiftKasirController {
  constructor(
    private readonly db: Database,
    private readonly jam: Jam,
  ) {}

  /** Shift terbuka di perangkat ini (`null` bila belum ada), tanpa angka sistem. */
  @Get('aktif')
  @PerluIzin('kasir.buka')
  async aktif(@Perangkat() p: PerangkatAktif) {
    return { shift: await shiftTerbuka(this.db.tenant(), p.id) };
  }

  /**
   * Buka Shift dengan modal awal laci. Satu Shift terbuka per Perangkat Terdaftar.
   * Mengirim ulang dengan `id` yang sama mengembalikan Shift yang sudah dibuka (idempoten).
   */
  @Post()
  @PerluIzin('kasir.buka')
  async buka(@Perangkat() p: PerangkatAktif, @PelakuAktif() pelaku: Pelaku, @Body() body: unknown, @Res({ passthrough: true }) res: Response) {
    const m = objek(body);
    const id = idKlien(m);
    const kasAwal = rupiah(m, 'kasAwal');
    const tx = this.db.tenant();
    // ON CONFLICT DO NOTHING menangkap ID ganda dan indeks unik "satu Shift terbuka per perangkat",
    // termasuk saat dua permintaan buka datang bersamaan.
    const [baru] = await tx
      .insert(shift)
      .values({
        ...(id ? { id } : {}),
        tenantId: p.tenantId,
        outletId: p.outletId,
        perangkatId: p.id,
        kasAwal,
        dibukaOlehAnggotaId: pelaku.anggotaId,
        dibukaPada: this.jam.sekarang(),
      })
      .onConflictDoNothing()
      .returning();
    if (baru) {
      res.status(201);
      return tampilkanShiftTerbuka(tx, baru);
    }
    if (id) {
      const [lama] = await tx.select().from(shift).where(eq(shift.id, id));
      if (lama && lama.perangkatId === p.id && lama.status === 'terbuka') {
        res.status(200);
        return tampilkanShiftTerbuka(tx, lama);
      }
      if (lama && lama.status === 'terbuka' && lama.perangkatId !== p.id) throw new ConflictException({ kode: 'id_dipakai', pesan: 'ID sudah dipakai.' });
    }
    const terbuka = await shiftTerbuka(tx, p.id);
    if (terbuka) throw shiftSudahTerbuka(terbuka.id);
    throw new ConflictException({ kode: 'id_dipakai', pesan: 'ID sudah dipakai.' });
  }

  /** Catat kas masuk atau kas keluar dengan alasan. Idempoten dengan `id` buatan klien. */
  @Post(':id/kas')
  @PerluIzin('kasir.buka')
  async kas(
    @Perangkat() p: PerangkatAktif,
    @PelakuAktif() pelaku: Pelaku,
    @Param('id') shiftId: string,
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
  ) {
    const m = objek(body);
    const id = idKlien(m);
    const jenis = pilihan(m, 'jenis', JENIS_KAS);
    const jumlah = rupiah(m, 'jumlah', { min: 1 });
    const alasan = teks(m, 'alasan', { maks: 200 });
    const tx = this.db.tenant();
    const s = await this.shiftPerangkat(tx, p, shiftId);
    if (id) {
      const [lama] = await tx.select().from(kasShift).where(eq(kasShift.id, id));
      if (lama) {
        if (lama.shiftId !== s.id) throw new ConflictException({ kode: 'id_dipakai', pesan: 'ID sudah dipakai.' });
        res.status(200);
        return tampilkanKas(lama);
      }
    }
    if (s.status !== 'terbuka') throw shiftDitutup();
    const [baru] = await tx
      .insert(kasShift)
      .values({ ...(id ? { id } : {}), tenantId: p.tenantId, shiftId: s.id, jenis, jumlah, alasan, anggotaId: pelaku.anggotaId })
      .returning();
    res.status(201);
    return tampilkanKas(baru!);
  }

  /**
   * Tutup Shift dengan Hitung Buta. Kasir mengirim hasil hitung uang di laci TANPA pernah melihat
   * angka sistem; kas seharusnya dan selisih dihitung, dibekukan, lalu dikembalikan sebagai Laporan Shift.
   */
  @Post(':id/tutup')
  @HttpCode(200)
  @PerluIzin('kasir.buka')
  async tutup(@Perangkat() p: PerangkatAktif, @PelakuAktif() pelaku: Pelaku, @Param('id') shiftId: string, @Body() body: unknown) {
    const m = objek(body);
    const hitungButa = rupiah(m, 'hitungButa');
    const tx = this.db.tenant();
    // Kunci Shift dulu: Pembayaran yang sedang berjalan selesai sebelum kas seharusnya dihitung.
    const s = await this.shiftPerangkat(tx, p, shiftId, { kunci: true });
    if (s.status !== 'terbuka') throw shiftDitutup();
    const kasSeharusnya = await hitungKasSeharusnya(tx, s);
    const [ditutup] = await tx
      .update(shift)
      .set({
        status: 'ditutup',
        ditutupOlehAnggotaId: pelaku.anggotaId,
        ditutupPada: this.jam.sekarang(),
        hitungButa,
        kasSeharusnya,
        selisih: hitungButa - kasSeharusnya,
      })
      .where(and(eq(shift.id, s.id), eq(shift.status, 'terbuka')))
      .returning();
    if (!ditutup) throw shiftDitutup();
    return laporanShift(tx, ditutup);
  }

  /** Laporan Shift perangkat ini untuk dicetak ulang; baru tersedia setelah Hitung Buta. */
  @Get(':id/laporan')
  @PerluIzin('kasir.buka')
  async laporan(@Perangkat() p: PerangkatAktif, @Param('id') shiftId: string) {
    const tx = this.db.tenant();
    const s = await this.shiftPerangkat(tx, p, shiftId);
    if (s.status !== 'ditutup') throw shiftMasihTerbuka();
    return laporanShift(tx, s);
  }

  private async shiftPerangkat(tx: TxDb, p: PerangkatAktif, shiftId: string, opsi: { kunci?: boolean } = {}): Promise<BarisShift> {
    const q = tx
      .select()
      .from(shift)
      .where(and(eq(shift.id, shiftId), eq(shift.perangkatId, p.id)));
    const [s] = opsi.kunci ? await q.for('update') : await q;
    if (!s) throw tidakDitemukan('Shift');
    return s;
  }
}

function shiftDitutup(): ConflictException {
  return new ConflictException({ kode: 'shift_sudah_ditutup', pesan: 'Shift ini sudah ditutup.' });
}

function shiftMasihTerbuka(): ConflictException {
  return new ConflictException({ kode: 'shift_masih_terbuka', pesan: 'Laporan Shift tersedia setelah Shift ditutup dengan Hitung Buta.' });
}

function tampilkanKas(k: typeof kasShift.$inferSelect) {
  return { id: k.id, shiftId: k.shiftId, jenis: k.jenis, jumlah: k.jumlah, alasan: k.alasan, dicatatPada: k.createdAt };
}

/** Riwayat dan Laporan Shift di dashboard (manajer dan Pemilik). */
@Controller('outlet/:outletId/shift')
@UseGuards(SesiGuard)
export class ShiftController {
  constructor(private readonly db: Database) {}

  /** Riwayat Shift Outlet, terbaru dulu. Shift yang masih terbuka tidak menampilkan angka penutupan. */
  @Get()
  @PerluIzin('shift.laporan', { outletParam: 'outletId' })
  async daftar(@Param('outletId') outletId: string) {
    const tx = this.db.tenant();
    await this.pastikanOutlet(tx, outletId);
    const baris = await tx.select().from(shift).where(eq(shift.outletId, outletId)).orderBy(desc(shift.dibukaPada), desc(shift.id)).limit(200);
    const nama = await namaAnggota(tx, baris.flatMap((s) => [s.dibukaOlehAnggotaId, s.ditutupOlehAnggotaId]));
    return baris.map((s) => ({
      id: s.id,
      status: s.status,
      perangkatId: s.perangkatId,
      dibukaOleh: { id: s.dibukaOlehAnggotaId, nama: nama.get(s.dibukaOlehAnggotaId) ?? '' },
      dibukaPada: s.dibukaPada,
      ditutupPada: s.ditutupPada,
      kasAwal: s.kasAwal,
      ...(s.status === 'ditutup' ? { hitungButa: s.hitungButa, selisih: s.selisih } : {}),
    }));
  }

  @Get(':id/laporan')
  @PerluIzin('shift.laporan', { outletParam: 'outletId' })
  async laporan(@Param('outletId') outletId: string, @Param('id') id: string) {
    const tx = this.db.tenant();
    const [s] = await tx
      .select()
      .from(shift)
      .where(and(eq(shift.id, id), eq(shift.outletId, outletId)));
    if (!s) throw tidakDitemukan('Shift');
    if (s.status !== 'ditutup') throw shiftMasihTerbuka();
    return laporanShift(tx, s);
  }

  private async pastikanOutlet(tx: TxDb, outletId: string) {
    const [o] = await tx.select({ id: outlet.id }).from(outlet).where(eq(outlet.id, outletId));
    if (!o) throw tidakDitemukan('Outlet');
  }
}

@Module({
  imports: [KaryawanModule],
  controllers: [ShiftKasirController, ShiftController],
})
export class ShiftModule {}
