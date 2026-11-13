import { Body, Controller, Param, Post, Res, UseGuards } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { Response } from 'express';
import { Database, type TxDb } from '../database/database';
import { itemPesanan, kejadianItemPesanan, pesanan } from '../database/schema';
import { type Pelaku, PelakuAktif, PerluIzin } from '../izin/izin';
import { Perangkat, type PerangkatAktif, PerangkatGuard } from '../karyawan/perangkat';
import { type PermintaanItemPesanan, siapkanItemPesanan } from '../menu/item-pesanan';
import { Jam } from '../umum/jam';
import { angka, objek, teksOpsional, tidakValid } from '../umum/validasi';
import { kunciPesanan, nomorBerikut, tanggalOperasional } from './nomor';
import { idDipakai, idKlien, itemTagihan, STATUS_ITEM_AWAL, tagihanDiOutlet, tagihanSudahDitutup, tampilkanPesanan } from './tagihan';

const MAKS_ITEM_PER_PESANAN = 100;
const MAKS_JUMLAH = 999;

interface ItemDiminta extends PermintaanItemPesanan {
  id: string | undefined;
  jumlah: number;
  catatan: string | null;
}

function bacaItem(body: unknown): ItemDiminta[] {
  const daftar = objek(body).item;
  if (!Array.isArray(daftar) || daftar.length === 0) throw tidakValid('item', 'Pesanan harus berisi minimal satu item.');
  if (daftar.length > MAKS_ITEM_PER_PESANAN) throw tidakValid('item', `Paling banyak ${MAKS_ITEM_PER_PESANAN} item per Pesanan.`);
  return daftar.map((mentah) => {
    const m = objek(mentah);
    const jumlah = m.jumlah === undefined ? 1 : angka(m, 'jumlah', { min: 1, maks: MAKS_JUMLAH });
    if (!Number.isInteger(jumlah)) throw tidakValid('jumlah', 'Harus bilangan bulat.');
    return {
      id: idKlien(m),
      menuId: m.menuId as string,
      varianId: m.varianId as string | null | undefined,
      pilihanIds: m.pilihanIds as string[] | undefined,
      jumlah,
      catatan: teksOpsional(m, 'catatan', { maks: 200 }) ?? null,
    };
  });
}

async function pesananTersimpan(tx: TxDb, id: string) {
  const [p] = await tx.select().from(pesanan).where(eq(pesanan.id, id));
  return p;
}

/** Kirim Pesanan dari kasir. */
@Controller('tagihan/:tagihanId/pesanan')
@UseGuards(PerangkatGuard)
export class PesananController {
  constructor(
    private readonly db: Database,
    private readonly jam: Jam,
  ) {}

  /**
   * Kirim item sebagai satu Pesanan. Nama, Varian, harga, pilihan, tanda bebas pajak, dan Stasiun
   * disalin dari Menu saat ini; sesudah terkirim Item Pesanan tidak bisa diubah.
   * Pesanan mendapat Nomor Pesanan harian berawalan perangkat. Mengirim ulang dengan `id` yang sama
   * mengembalikan Pesanan yang sudah tersimpan tanpa menggandakannya.
   */
  @Post()
  @PerluIzin('kasir.buka')
  async kirim(
    @Perangkat() p: PerangkatAktif,
    @PelakuAktif() pelaku: Pelaku,
    @Param('tagihanId') tagihanId: string,
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
  ) {
    const id = idKlien(objek(body));
    const diminta = bacaItem(body);
    const tx = this.db.tenant();
    // Kunci Tagihan: kiriman ulang yang datang bersamaan antre di sini, bukan menggandakan Pesanan.
    const t = await tagihanDiOutlet(tx, p.outletId, tagihanId, { kunci: true });
    if (id) {
      const lama = await pesananTersimpan(tx, id);
      if (lama) {
        if (lama.tagihanId !== t.id) throw idDipakai();
        res.status(200);
        return tampilkanPesanan(lama, await itemTagihan(tx, [t.id]));
      }
    }
    if (t.status !== 'terbuka') throw tagihanSudahDitutup();

    const salinan = [];
    for (const d of diminta) salinan.push({ diminta: d, menu: await siapkanItemPesanan(tx, p.outletId, d) });

    const sekarang = this.jam.sekarang();
    const tanggal = tanggalOperasional(sekarang);
    const urutan = await nomorBerikut(tx, p, kunciPesanan(tanggal, p.awalan));
    const [baru] = await tx
      .insert(pesanan)
      .values({
        ...(id ? { id } : {}),
        tenantId: p.tenantId,
        outletId: p.outletId,
        tagihanId: t.id,
        perangkatId: p.id,
        nomorPesanan: `${p.awalan}-${String(urutan).padStart(3, '0')}`,
        tanggal,
        dikirimOlehAnggotaId: pelaku.anggotaId,
        dikirimPada: sekarang,
      })
      .onConflictDoNothing()
      .returning();
    if (!baru) throw idDipakai();
    const item = await tx
      .insert(itemPesanan)
      .values(
        salinan.map(({ diminta: d, menu }, i) => ({
          ...(d.id ? { id: d.id } : {}),
          tenantId: p.tenantId,
          outletId: p.outletId,
          tagihanId: t.id,
          pesananId: baru.id,
          urutan: i,
          menuId: menu.menuId,
          nama: menu.nama,
          varianId: menu.varianId,
          namaVarian: menu.namaVarian,
          hargaSatuan: menu.hargaSatuan,
          jumlah: d.jumlah,
          pilihan: menu.pilihan,
          bebasPajak: menu.bebasPajak,
          stasiunId: menu.stasiunId,
          catatan: d.catatan,
        })),
      )
      .onConflictDoNothing()
      .returning();
    if (item.length !== salinan.length) throw idDipakai();
    await tx.insert(kejadianItemPesanan).values(
      item.map((i) => ({
        tenantId: p.tenantId,
        outletId: p.outletId,
        itemPesananId: i.id,
        status: STATUS_ITEM_AWAL,
        anggotaId: pelaku.anggotaId,
        perangkatId: p.id,
      })),
    );
    res.status(201);
    return tampilkanPesanan(
      baru,
      item.sort((a, b) => a.urutan - b.urutan).map((i) => ({ ...i, status: STATUS_ITEM_AWAL })),
    );
  }
}
