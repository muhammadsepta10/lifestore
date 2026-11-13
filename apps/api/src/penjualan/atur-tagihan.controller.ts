import { Body, ConflictException, Controller, HttpCode, Param, Post, Res, UseGuards } from '@nestjs/common';
import { and, eq, inArray } from 'drizzle-orm';
import type { Response } from 'express';
import { Database, type TxDb } from '../database/database';
import { itemPesanan, pembayaran, tagihan, tagihanMeja } from '../database/schema';
import { type Pelaku, PelakuAktif, PerluIzin } from '../izin/izin';
import { Perangkat, type PerangkatAktif, PerangkatGuard } from '../karyawan/perangkat';
import { Jam } from '../umum/jam';
import { objek, teks, teksOpsional, tidakValid } from '../umum/validasi';
import { kunciMeja, mejaTerisi, penghuniMeja } from './meja-tagihan';
import { type BarisTagihan, idDipakai, idKlien, itemTagihan, tagihanDiOutlet, tagihanLengkap, tagihanSudahDitutup } from './tagihan';

const MAKS_ITEM_PISAH = 500;

function ditolak(kode: string, pesan: string): ConflictException {
  return new ConflictException({ kode, pesan });
}

/** Tagihan dine-in terbuka milik Outlet, terkunci; selain itu 404/409. */
async function tagihanDineInTerbuka(tx: TxDb, outletId: string, id: string): Promise<BarisTagihan> {
  const t = await tagihanDiOutlet(tx, outletId, id, { kunci: true });
  if (t.status !== 'terbuka') throw tagihanSudahDitutup();
  if (t.kanal !== 'dine_in') throw ditolak('bukan_dine_in', 'Hanya Tagihan dine-in yang menempati Meja.');
  return t;
}

async function sudahAdaPembayaran(tx: TxDb, tagihanId: string): Promise<boolean> {
  const [p] = await tx.select({ id: pembayaran.id }).from(pembayaran).where(eq(pembayaran.tagihanId, tagihanId)).limit(1);
  return p !== undefined;
}

/**
 * Mengatur ulang Tagihan terbuka dari kasir: pindah Meja, gabung Meja, dan Pisah Tagihan.
 * Semuanya mengunci Tagihan dulu, lalu Meja, supaya perintah paralel antre.
 */
@Controller('tagihan/:tagihanId')
@UseGuards(PerangkatGuard)
export class AturTagihanController {
  constructor(
    private readonly db: Database,
    private readonly jam: Jam,
  ) {}

  /** Pindah Tagihan ke Meja lain yang Kosong. Tagihannya tetap satu; Meja lama menjadi Kosong. */
  @Post('pindah-meja')
  @HttpCode(200)
  @PerluIzin('kasir.buka')
  async pindahMeja(@Perangkat() p: PerangkatAktif, @Param('tagihanId') tagihanId: string, @Body() body: unknown) {
    const mejaId = teks(objek(body), 'mejaId', { maks: 64 });
    const tx = this.db.tenant();
    const t = await tagihanDineInTerbuka(tx, p.outletId, tagihanId);
    const tujuan = await kunciMeja(tx, p.outletId, mejaId);
    const orangLain = (await penghuniMeja(tx, tujuan.id)).find((id) => id !== t.id);
    if (orangLain) throw mejaTerisi(tujuan.label, orangLain);
    await tx.delete(tagihanMeja).where(eq(tagihanMeja.tagihanId, t.id));
    await tx.insert(tagihanMeja).values({ tenantId: t.tenantId, outletId: t.outletId, tagihanId: t.id, mejaId: tujuan.id });
    const [baru] = await tx.update(tagihan).set({ mejaId: tujuan.id }).where(eq(tagihan.id, t.id)).returning();
    return tagihanLengkap(tx, baru!);
  }

  /**
   * Gabung Meja ke Tagihan ini. Meja Kosong langsung ikut ditempati. Bila Meja itu terisi Tagihan
   * lain, Item Pesanan dan Meja Tagihan lain dipindahkan ke Tagihan ini dan Tagihan lain berstatus
   * `digabung`, sehingga rombongan tetap satu Tagihan.
   */
  @Post('gabung-meja')
  @HttpCode(200)
  @PerluIzin('kasir.buka')
  async gabungMeja(@Perangkat() p: PerangkatAktif, @PelakuAktif() pelaku: Pelaku, @Param('tagihanId') tagihanId: string, @Body() body: unknown) {
    const mejaId = teks(objek(body), 'mejaId', { maks: 64 });
    const tx = this.db.tenant();
    const t = await tagihanDineInTerbuka(tx, p.outletId, tagihanId);
    const tujuan = await kunciMeja(tx, p.outletId, mejaId);
    const penghuni = await penghuniMeja(tx, tujuan.id);
    if (penghuni.length === 0) {
      await tx.insert(tagihanMeja).values({ tenantId: t.tenantId, outletId: t.outletId, tagihanId: t.id, mejaId: tujuan.id });
      return tagihanLengkap(tx, t);
    }
    for (const lainId of penghuni.filter((id) => id !== t.id)) {
      const lain = await tagihanDiOutlet(tx, p.outletId, lainId, { kunci: true });
      if (lain.status !== 'terbuka') continue;
      if (await sudahAdaPembayaran(tx, lain.id)) {
        throw ditolak('tagihan_sudah_dibayar', 'Tagihan di Meja itu sudah menerima Pembayaran, jadi tidak bisa digabung.');
      }
      await tx.update(itemPesanan).set({ tagihanId: t.id }).where(eq(itemPesanan.tagihanId, lain.id));
      // Meja Tagihan lain ikut pindah, kecuali yang sudah ditempati Tagihan ini juga.
      const mejaSendiri = (await tx.select({ mejaId: tagihanMeja.mejaId }).from(tagihanMeja).where(eq(tagihanMeja.tagihanId, t.id))).map((m) => m.mejaId);
      const mejaLain = await tx.select().from(tagihanMeja).where(eq(tagihanMeja.tagihanId, lain.id));
      await tx.delete(tagihanMeja).where(eq(tagihanMeja.tagihanId, lain.id));
      const pindahan = mejaLain.filter((m) => !mejaSendiri.includes(m.mejaId));
      if (pindahan.length > 0) {
        await tx.insert(tagihanMeja).values(pindahan.map((m) => ({ tenantId: t.tenantId, outletId: t.outletId, tagihanId: t.id, mejaId: m.mejaId })));
      }
      await tx
        .update(tagihan)
        .set({
          status: 'digabung',
          digabungKeTagihanId: t.id,
          ditutupPada: this.jam.sekarang(),
          ditutupOlehAnggotaId: pelaku.anggotaId,
          subtotal: 0,
          diskon: 0,
          serviceCharge: 0,
          dasarPajak: 0,
          pajak: 0,
          total: 0,
        })
        .where(eq(tagihan.id, lain.id));
    }
    return tagihanLengkap(tx, t);
  }

  /**
   * Pisah Tagihan: pindahkan sebagian Item Pesanan ke Tagihan baru (Kanal, Meja, dan salinan Profil
   * Pajak sama dengan Tagihan asal). Mengirim ulang dengan `id` yang sama mengembalikan Tagihan baru
   * yang sudah dibuat. Berbeda dari Bayar Terpisah (beberapa Pembayaran untuk satu Tagihan).
   */
  @Post('pisah')
  @PerluIzin('kasir.buka')
  async pisah(
    @Perangkat() p: PerangkatAktif,
    @PelakuAktif() pelaku: Pelaku,
    @Param('tagihanId') tagihanId: string,
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
  ) {
    const m = objek(body);
    const id = idKlien(m);
    const namaPelanggan = teksOpsional(m, 'namaPelanggan', { maks: 100 }) ?? null;
    const itemIds = m.itemIds;
    if (!Array.isArray(itemIds) || itemIds.length === 0 || itemIds.length > MAKS_ITEM_PISAH || itemIds.some((x) => typeof x !== 'string')) {
      throw tidakValid('itemIds', 'Pilih minimal satu Item Pesanan untuk dipisah.');
    }
    const dipilih = [...new Set(itemIds as string[])];
    const tx = this.db.tenant();
    const t = await tagihanDiOutlet(tx, p.outletId, tagihanId, { kunci: true });
    if (id) {
      const [lama] = await tx.select().from(tagihan).where(eq(tagihan.id, id));
      if (lama) {
        if (lama.outletId !== p.outletId || lama.asalTagihanId !== t.id) throw idDipakai();
        res.status(200);
        return { asal: await tagihanLengkap(tx, t), baru: await tagihanLengkap(tx, lama) };
      }
    }
    if (t.status !== 'terbuka') throw tagihanSudahDitutup();
    if (await sudahAdaPembayaran(tx, t.id)) {
      throw ditolak('tagihan_sudah_dibayar', 'Tagihan yang sudah menerima Pembayaran tidak bisa dipisah.');
    }
    const item = (await itemTagihan(tx, [t.id])).filter((i) => i.status !== 'batal');
    const milik = new Set(item.map((i) => i.id));
    if (dipilih.some((x) => !milik.has(x))) throw tidakValid('itemIds', 'Ada Item Pesanan yang bukan bagian dari Tagihan ini.');
    if (dipilih.length >= item.length) throw tidakValid('itemIds', 'Pisah Tagihan hanya untuk sebagian item; sisakan minimal satu di Tagihan asal.');

    const [baru] = await tx
      .insert(tagihan)
      .values({
        ...(id ? { id } : {}),
        tenantId: t.tenantId,
        outletId: t.outletId,
        perangkatId: p.id,
        kanal: t.kanal,
        mejaId: t.mejaId,
        namaPelanggan,
        asalTagihanId: t.id,
        dibukaOlehAnggotaId: pelaku.anggotaId,
        dibukaPada: this.jam.sekarang(),
        pajakJenis: t.pajakJenis,
        pajakTarifPersen: t.pajakTarifPersen,
        pajakLabel: t.pajakLabel,
        hargaTermasukPajak: t.hargaTermasukPajak,
        serviceChargePersen: t.serviceChargePersen,
        serviceChargeKanal: t.serviceChargeKanal,
      })
      .onConflictDoNothing()
      .returning();
    if (!baru) throw idDipakai();
    const mejanya = await tx.select().from(tagihanMeja).where(eq(tagihanMeja.tagihanId, t.id));
    if (mejanya.length > 0) {
      await tx.insert(tagihanMeja).values(mejanya.map((x) => ({ tenantId: t.tenantId, outletId: t.outletId, tagihanId: baru.id, mejaId: x.mejaId })));
    }
    await tx
      .update(itemPesanan)
      .set({ tagihanId: baru.id })
      .where(and(eq(itemPesanan.tagihanId, t.id), inArray(itemPesanan.id, dipilih)));
    res.status(201);
    return { asal: await tagihanLengkap(tx, t), baru: await tagihanLengkap(tx, baru) };
  }
}
