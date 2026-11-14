import { Body, Controller, HttpCode, Param, Post, Res, UseGuards } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { PenulisLogAudit } from '../audit/audit.module';
import type { Response } from 'express';
import { Database, type TxDb } from '../database/database';
import { pembayaran, tagihan, tagihanMeja } from '../database/schema';
import { type Pelaku, PelakuAktif, PerluIzin } from '../izin/izin';
import { Perangkat, type PerangkatAktif, PerangkatGuard } from '../karyawan/perangkat';
import { Jam } from '../umum/jam';
import { ditolak, idDipakai, idKlien, objek, teks, teksOpsional, tidakValid } from '../umum/validasi';
import { kunciMeja, mejaTerisi, penghuniMeja } from './meja-tagihan';
import { type BarisTagihan, itemTagihan, mejaTagihan, pelakuAudit, pindahkanItem, tagihanDiOutlet, tagihanLengkap, tagihanSudahDitutup } from './tagihan';

const MAKS_ITEM_PISAH = 500;

/** Tagihan dine-in terbuka milik Outlet, terkunci; selain itu 404/409. */
async function tagihanDineInTerbuka(tx: TxDb, outletId: string, id: string): Promise<BarisTagihan> {
  const t = await tagihanDiOutlet(tx, outletId, id, { kunci: true });
  if (t.status !== 'terbuka') throw tagihanSudahDitutup();
  if (t.kanal !== 'dine_in') throw ditolak('bukan_dine_in', 'Hanya Tagihan dine-in yang menempati Meja.');
  return t;
}

/**
 * Diskon Manual melekat pada Tagihan, bukan pada item. Memindahkan item keluar-masuk Tagihan
 * ber-diskon akan mengubah nilai diskon tanpa alasan dan persetujuan baru, jadi diskonnya harus
 * dilepas dulu lalu dipasang lagi di Tagihan hasilnya.
 */
function pastikanTanpaDiskon(t: BarisTagihan): void {
  if (t.diskonJenis !== null) {
    throw ditolak('tagihan_berdiskon', 'Lepas Diskon Manual dulu, lalu pasang lagi setelah Tagihan dipisah atau digabung.');
  }
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
    private readonly audit: PenulisLogAudit,
  ) {}

  /** ID Meja yang ditempati Tagihan, urut ditempati. */
  private async mejaIds(tx: TxDb, tagihanId: string): Promise<string[]> {
    return (await mejaTagihan(tx, [tagihanId])).map((m) => m.id);
  }

  /** Pindah Tagihan ke Meja lain yang Kosong. Tagihannya tetap satu; Meja lama menjadi Kosong. */
  @Post('pindah-meja')
  @HttpCode(200)
  @PerluIzin('kasir.buka')
  async pindahMeja(@Perangkat() p: PerangkatAktif, @PelakuAktif() pelaku: Pelaku, @Param('tagihanId') tagihanId: string, @Body() body: unknown) {
    const mejaId = teks(objek(body), 'mejaId', { maks: 64 });
    const tx = this.db.tenant();
    const t = await tagihanDineInTerbuka(tx, p.outletId, tagihanId);
    const tujuan = await kunciMeja(tx, p.outletId, mejaId);
    const orangLain = (await penghuniMeja(tx, tujuan.id)).find((id) => id !== t.id);
    if (orangLain) throw mejaTerisi(tujuan.label, orangLain);
    const mejaSebelum = await this.mejaIds(tx, t.id);
    // Sudah di Meja itu saja: tidak ada yang berubah.
    if (mejaSebelum.length === 1 && mejaSebelum[0] === tujuan.id) return tagihanLengkap(tx, t);
    await tx.delete(tagihanMeja).where(eq(tagihanMeja.tagihanId, t.id));
    await tx.insert(tagihanMeja).values({ tenantId: t.tenantId, outletId: t.outletId, tagihanId: t.id, mejaId: tujuan.id });
    const [baru] = await tx.update(tagihan).set({ mejaId: tujuan.id }).where(eq(tagihan.id, t.id)).returning();
    await this.audit.catat({
      aksi: 'pindah_meja',
      entitas: 'tagihan',
      entitasId: t.id,
      outletId: p.outletId,
      pelaku: pelakuAudit(pelaku, p),
      sebelum: { mejaIds: mejaSebelum },
      sesudah: { mejaIds: [tujuan.id] },
    });
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
    const mejaSebelum = await this.mejaIds(tx, t.id);
    const digabung: string[] = [];
    const itemPindah: string[] = [];
    if (penghuni.length === 0) {
      await tx.insert(tagihanMeja).values({ tenantId: t.tenantId, outletId: t.outletId, tagihanId: t.id, mejaId: tujuan.id });
    }
    for (const lainId of penghuni.filter((id) => id !== t.id)) {
      const lain = await tagihanDiOutlet(tx, p.outletId, lainId, { kunci: true });
      if (lain.status !== 'terbuka') continue;
      // Diskon di Tagihan penerima akan membesar (persen) atau berubah persentasenya (nominal)
      // begitu item Tagihan lain masuk; diskon di Tagihan lain akan hilang. Keduanya ditolak.
      pastikanTanpaDiskon(t);
      pastikanTanpaDiskon(lain);
      if (await sudahAdaPembayaran(tx, lain.id)) {
        throw ditolak('tagihan_sudah_dibayar', 'Tagihan di Meja itu sudah menerima Pembayaran, jadi tidak bisa digabung.');
      }
      const itemLain = await itemTagihan(tx, [lain.id]);
      await pindahkanItem(tx, itemLain, t, { sebab: 'gabung_meja', anggotaId: pelaku.anggotaId, perangkatId: p.id });
      digabung.push(lain.id);
      itemPindah.push(...itemLain.map((i) => i.id));
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
    const mejaSesudah = await this.mejaIds(tx, t.id);
    // Meja itu sudah ditempati Tagihan ini dan tidak ada yang dilebur: tidak ada yang berubah.
    if (digabung.length > 0 || mejaSesudah.length !== mejaSebelum.length) {
      await this.audit.catat({
        aksi: 'gabung_meja',
        entitas: 'tagihan',
        entitasId: t.id,
        outletId: p.outletId,
        pelaku: pelakuAudit(pelaku, p),
        sebelum: { mejaIds: mejaSebelum },
        sesudah: { mejaIds: mejaSesudah, tagihanDigabung: digabung, itemIds: itemPindah },
      });
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
    pastikanTanpaDiskon(t);
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
    await pindahkanItem(
      tx,
      item.filter((i) => dipilih.includes(i.id)),
      baru,
      { sebab: 'pisah_tagihan', anggotaId: pelaku.anggotaId, perangkatId: p.id },
    );
    await this.audit.catat({
      aksi: 'pisah_tagihan',
      entitas: 'tagihan',
      entitasId: t.id,
      outletId: p.outletId,
      pelaku: pelakuAudit(pelaku, p),
      sesudah: { tagihanBaruId: baru.id, itemIds: dipilih },
    });
    res.status(201);
    return { asal: await tagihanLengkap(tx, t), baru: await tagihanLengkap(tx, baru) };
  }
}
