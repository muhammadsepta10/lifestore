import { Body, Controller, Get, HttpCode, Param, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { and, asc, eq, inArray, notInArray } from 'drizzle-orm';
import { PenulisLogAudit } from '../audit/audit.module';
import { Database, type TxDb } from '../database/database';
import { grupPilihan, hargaOutlet, menu, pilihan, varian } from '../database/schema';
import { PerluIzin } from '../izin/izin';
import { Sesi, SesiGuard, type SesiPengguna } from '../identitas/sesi.guard';
import { boolean, type Masukan, objek, teks, teksOpsional, tidakDitemukan, tidakValid } from '../umum/validasi';
import { aturUrutan, bulat, idDaftar, pastikanKategori, pastikanMenu, pastikanMerek, rupiah, urlOpsional, urutanBerikutnya } from './bersama';

type BarisMenu = typeof menu.$inferSelect;

export interface VarianMenu {
  id: string;
  nama: string;
  harga: number;
}
export interface PilihanMenu {
  id: string;
  nama: string;
  harga: number;
}
export interface GrupPilihanMenu {
  id: string;
  nama: string;
  minimum: number;
  maksimum: number;
  pilihan: PilihanMenu[];
}
export interface MenuLengkap {
  id: string;
  merekId: string;
  kategoriId: string;
  nama: string;
  harga: number;
  deskripsi: string | null;
  fotoUrl: string | null;
  urutan: number;
  aktif: boolean;
  bebasPajak: boolean;
  varian: VarianMenu[];
  grupPilihan: GrupPilihanMenu[];
}

/** Memuat Menu beserta Varian dan Grup Pilihan-nya, urutan baris dipertahankan. */
export async function muatMenuLengkap(tx: TxDb, baris: BarisMenu[]): Promise<MenuLengkap[]> {
  if (baris.length === 0) return [];
  const ids = baris.map((m) => m.id);
  const semuaVarian = await tx.select().from(varian).where(inArray(varian.menuId, ids)).orderBy(asc(varian.urutan), asc(varian.createdAt));
  const semuaGrup = await tx
    .select()
    .from(grupPilihan)
    .where(inArray(grupPilihan.menuId, ids))
    .orderBy(asc(grupPilihan.urutan), asc(grupPilihan.createdAt));
  const semuaPilihan =
    semuaGrup.length === 0
      ? []
      : await tx
          .select()
          .from(pilihan)
          .where(
            inArray(
              pilihan.grupPilihanId,
              semuaGrup.map((g) => g.id),
            ),
          )
          .orderBy(asc(pilihan.urutan), asc(pilihan.createdAt));
  return baris.map((m) => ({
    id: m.id,
    merekId: m.merekId,
    kategoriId: m.kategoriId,
    nama: m.nama,
    harga: m.harga,
    deskripsi: m.deskripsi,
    fotoUrl: m.fotoUrl,
    urutan: m.urutan,
    aktif: m.aktif,
    bebasPajak: m.bebasPajak,
    varian: semuaVarian.filter((v) => v.menuId === m.id).map((v) => ({ id: v.id, nama: v.nama, harga: v.harga })),
    grupPilihan: semuaGrup
      .filter((g) => g.menuId === m.id)
      .map((g) => ({
        id: g.id,
        nama: g.nama,
        minimum: g.minimum,
        maksimum: g.maksimum,
        pilihan: semuaPilihan.filter((p) => p.grupPilihanId === g.id).map((p) => ({ id: p.id, nama: p.nama, harga: p.harga })),
      })),
  }));
}

/** Bentuk harga di Log Audit (`ubah_harga_menu`, `ubah_harga_outlet`). */
export function ringkasanHarga(m: { harga: number; varian: { id: string; harga: number }[] }) {
  return { harga: m.harga, varian: m.varian.map((v) => ({ varianId: v.id, harga: v.harga })) };
}

export async function muatSatuMenu(tx: TxDb, id: string): Promise<MenuLengkap> {
  const [m] = await muatMenuLengkap(tx, [await pastikanMenu(tx, id)]);
  return m!;
}

interface MasukanVarian {
  id?: string;
  nama: string;
  harga: number;
}
interface MasukanGrup {
  id?: string;
  nama: string;
  minimum: number;
  maksimum: number;
  pilihan: { id?: string; nama: string; harga: number }[];
}

function idOpsional(o: Masukan, kolom: string): string | undefined {
  const v = o.id;
  if (v === undefined) return undefined;
  if (typeof v !== 'string' || v === '') throw tidakValid(`${kolom}.id`, 'Harus teks.');
  return v;
}

export function varianValid(v: unknown): MasukanVarian[] {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) throw tidakValid('varian', 'Harus daftar { nama, harga }.');
  return v.map((x, i) => {
    const o = objek(x);
    return { id: idOpsional(o, `varian[${i}]`), nama: teks(o, 'nama', { maks: 100 }), harga: rupiah(o.harga, `varian[${i}].harga`) };
  });
}

/**
 * Aturan Grup Pilihan: minimal satu pilihan, 0 ≤ minimum ≤ maksimum, 1 ≤ maksimum ≤ jumlah pilihan.
 * Harga pilihan 0 = gratis.
 */
export function grupPilihanValid(v: unknown): MasukanGrup[] {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) throw tidakValid('grupPilihan', 'Harus daftar Grup Pilihan.');
  return v.map((x, i) => {
    const o = objek(x);
    const kolom = `grupPilihan[${i}]`;
    if (!Array.isArray(o.pilihan) || o.pilihan.length === 0) throw tidakValid(`${kolom}.pilihan`, 'Minimal satu pilihan.');
    const daftarPilihan = o.pilihan.map((p, j) => {
      const po = objek(p);
      return { id: idOpsional(po, `${kolom}.pilihan[${j}]`), nama: teks(po, 'nama', { maks: 100 }), harga: rupiah(po.harga, `${kolom}.pilihan[${j}].harga`) };
    });
    const maksimum = bulat(o.maksimum, `${kolom}.maksimum`, { min: 1, maks: daftarPilihan.length });
    const minimum = o.minimum === undefined ? 0 : bulat(o.minimum, `${kolom}.minimum`, { min: 0, maks: maksimum });
    return { id: idOpsional(o, kolom), nama: teks(o, 'nama', { maks: 100 }), minimum, maksimum, pilihan: daftarPilihan };
  });
}

/**
 * Menyamakan Varian Menu dengan daftar baru: entri ber-`id` diperbarui, tanpa `id` ditambah, yang
 * tidak disebut dihapus (beserta override harga Outlet-nya). Item Pesanan menyalin nama dan harga,
 * jadi menghapus Varian tidak mengubah Tagihan lama.
 */
async function samakanVarian(tx: TxDb, tenantId: string, menuId: string, daftar: MasukanVarian[]) {
  const lama = new Set((await tx.select({ id: varian.id }).from(varian).where(eq(varian.menuId, menuId))).map((v) => v.id));
  for (const v of daftar) if (v.id !== undefined && !lama.has(v.id)) throw tidakDitemukan('Varian');
  const dipertahankan = daftar.flatMap((v) => (v.id ? [v.id] : []));
  const dihapus = [...lama].filter((id) => !dipertahankan.includes(id));
  if (dihapus.length > 0) {
    await tx.delete(hargaOutlet).where(inArray(hargaOutlet.varianId, dihapus));
    await tx.delete(varian).where(inArray(varian.id, dihapus));
  }
  for (const [i, v] of daftar.entries()) {
    if (v.id) await tx.update(varian).set({ nama: v.nama, harga: v.harga, urutan: i }).where(eq(varian.id, v.id));
    else await tx.insert(varian).values({ tenantId, menuId, nama: v.nama, harga: v.harga, urutan: i });
  }
}

/** Seperti `samakanVarian`, untuk Grup Pilihan dan pilihan di dalamnya. */
async function samakanGrupPilihan(tx: TxDb, tenantId: string, menuId: string, daftar: MasukanGrup[]) {
  const grupLama = new Set((await tx.select({ id: grupPilihan.id }).from(grupPilihan).where(eq(grupPilihan.menuId, menuId))).map((g) => g.id));
  for (const g of daftar) if (g.id !== undefined && !grupLama.has(g.id)) throw tidakDitemukan('Grup Pilihan');
  const grupTetap = daftar.flatMap((g) => (g.id ? [g.id] : []));
  const grupDihapus = [...grupLama].filter((id) => !grupTetap.includes(id));
  if (grupDihapus.length > 0) {
    await tx.delete(pilihan).where(inArray(pilihan.grupPilihanId, grupDihapus));
    await tx.delete(grupPilihan).where(inArray(grupPilihan.id, grupDihapus));
  }
  for (const [i, g] of daftar.entries()) {
    let grupId = g.id;
    if (grupId) {
      await tx.update(grupPilihan).set({ nama: g.nama, minimum: g.minimum, maksimum: g.maksimum, urutan: i }).where(eq(grupPilihan.id, grupId));
    } else {
      const [baru] = await tx
        .insert(grupPilihan)
        .values({ tenantId, menuId, nama: g.nama, minimum: g.minimum, maksimum: g.maksimum, urutan: i })
        .returning({ id: grupPilihan.id });
      grupId = baru!.id;
    }
    const pilihanLama = new Set((await tx.select({ id: pilihan.id }).from(pilihan).where(eq(pilihan.grupPilihanId, grupId))).map((p) => p.id));
    for (const p of g.pilihan) if (p.id !== undefined && !pilihanLama.has(p.id)) throw tidakDitemukan('Pilihan');
    const tetap = g.pilihan.flatMap((p) => (p.id ? [p.id] : []));
    await tx
      .delete(pilihan)
      .where(tetap.length > 0 ? and(eq(pilihan.grupPilihanId, grupId), notInArray(pilihan.id, tetap)) : eq(pilihan.grupPilihanId, grupId));
    for (const [j, p] of g.pilihan.entries()) {
      if (p.id) await tx.update(pilihan).set({ nama: p.nama, harga: p.harga, urutan: j }).where(eq(pilihan.id, p.id));
      else await tx.insert(pilihan).values({ tenantId, grupPilihanId: grupId, nama: p.nama, harga: p.harga, urutan: j });
    }
  }
}

@Controller()
@UseGuards(SesiGuard)
export class MenuController {
  constructor(
    private readonly db: Database,
    private readonly audit: PenulisLogAudit,
  ) {}

  /** Semua Menu Merek untuk pengelolaan, termasuk yang nonaktif. */
  @Get('merek/:merekId/menu')
  @PerluIzin('menu.lihat')
  async daftar(@Param('merekId') merekId: string) {
    const tx = this.db.tenant();
    await pastikanMerek(tx, merekId);
    const baris = await tx.select().from(menu).where(eq(menu.merekId, merekId)).orderBy(asc(menu.urutan), asc(menu.createdAt));
    return muatMenuLengkap(tx, baris);
  }

  @Post('merek/:merekId/menu')
  @PerluIzin('menu.ubah')
  @HttpCode(201)
  async tambah(@Param('merekId') merekId: string, @Body() body: unknown) {
    const tx = this.db.tenant();
    const mk = await pastikanMerek(tx, merekId);
    const m = objek(body);
    const nama = teks(m, 'nama', { maks: 150 });
    const harga = rupiah(m.harga, 'harga');
    const deskripsi = teksOpsional(m, 'deskripsi', { maks: 1000 }) ?? null;
    const fotoUrl = urlOpsional(m, 'fotoUrl') ?? null;
    const bebasPajak = m.bebasPajak === undefined ? false : boolean(m, 'bebasPajak');
    const daftarVarian = varianValid(m.varian);
    const daftarGrup = grupPilihanValid(m.grupPilihan);
    const kategoriId = teks(m, 'kategoriId', { maks: 64 });
    await pastikanKategori(tx, kategoriId, merekId);

    const [baru] = await tx
      .insert(menu)
      .values({
        tenantId: mk.tenantId,
        merekId,
        kategoriId,
        nama,
        harga,
        deskripsi,
        fotoUrl,
        bebasPajak,
        urutan: await urutanBerikutnya(tx, menu, eq(menu.merekId, merekId)),
      })
      .returning();
    await samakanVarian(tx, mk.tenantId, baru!.id, daftarVarian);
    await samakanGrupPilihan(tx, mk.tenantId, baru!.id, daftarGrup);
    return muatSatuMenu(tx, baru!.id);
  }

  @Get('menu/:id')
  @PerluIzin('menu.lihat')
  async detail(@Param('id') id: string) {
    return muatSatuMenu(this.db.tenant(), id);
  }

  @Put('merek/:merekId/menu/urutan')
  @PerluIzin('menu.ubah')
  async urutkan(@Param('merekId') merekId: string, @Body() body: unknown) {
    const tx = this.db.tenant();
    await pastikanMerek(tx, merekId);
    await aturUrutan(tx, menu, menu.merekId, merekId, idDaftar(objek(body), 'ids'));
    return this.daftar(merekId);
  }

  /**
   * Ubah Menu. Field yang tidak dikirim tidak berubah. `varian` dan `grupPilihan`, bila dikirim,
   * menggantikan seluruh daftar (sertakan `id` untuk mempertahankan entri yang ada).
   * `aktif: false` menonaktifkan tanpa menghapus.
   */
  @Patch('menu/:id')
  @PerluIzin('menu.ubah')
  async ubah(@Param('id') id: string, @Body() body: unknown, @Sesi() sesi: SesiPengguna) {
    const tx = this.db.tenant();
    const lama = await pastikanMenu(tx, id);
    const hargaSebelum = ringkasanHarga(await muatSatuMenu(tx, id));
    const m = objek(body);
    const perubahan: Partial<typeof menu.$inferInsert> = {};
    if (m.nama !== undefined) perubahan.nama = teks(m, 'nama', { maks: 150 });
    if (m.harga !== undefined) perubahan.harga = rupiah(m.harga, 'harga');
    if (m.deskripsi !== undefined) perubahan.deskripsi = teksOpsional(m, 'deskripsi', { maks: 1000 });
    if (m.fotoUrl !== undefined) perubahan.fotoUrl = urlOpsional(m, 'fotoUrl');
    if (m.aktif !== undefined) perubahan.aktif = boolean(m, 'aktif');
    if (m.bebasPajak !== undefined) perubahan.bebasPajak = boolean(m, 'bebasPajak');
    if (m.kategoriId !== undefined) {
      perubahan.kategoriId = (await pastikanKategori(tx, teks(m, 'kategoriId', { maks: 64 }), lama.merekId)).id;
    }
    const daftarVarian = m.varian === undefined ? undefined : varianValid(m.varian);
    const daftarGrup = m.grupPilihan === undefined ? undefined : grupPilihanValid(m.grupPilihan);

    if (Object.keys(perubahan).length > 0) await tx.update(menu).set(perubahan).where(eq(menu.id, id));
    if (daftarVarian) await samakanVarian(tx, lama.tenantId, id, daftarVarian);
    if (daftarGrup) await samakanGrupPilihan(tx, lama.tenantId, id, daftarGrup);
    const hasil = await muatSatuMenu(tx, id);
    const hargaSesudah = ringkasanHarga(hasil);
    if (JSON.stringify(hargaSebelum) !== JSON.stringify(hargaSesudah)) {
      await this.audit.catat({
        aksi: 'ubah_harga_menu',
        entitas: 'menu',
        entitasId: id,
        pelaku: { penggunaId: sesi.penggunaId },
        sebelum: hargaSebelum,
        sesudah: hargaSesudah,
      });
    }
    return hasil;
  }
}
