import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import { and, asc, eq } from 'drizzle-orm';
import { PenulisLogAudit } from '../audit/audit.module';
import { Database, type TxDb } from '../database/database';
import { hargaOutlet, kategori, menu, menuHabis, menuStasiun } from '../database/schema';
import { PerluIzin } from '../izin/izin';
import { Sesi, SesiGuard, type SesiPengguna } from '../identitas/sesi.guard';
import { boolean, objek, teks, tidakDitemukan, tidakValid } from '../umum/validasi';
import { pastikanMenuDiOutlet, pastikanOutlet, pastikanStasiun, rupiah } from './bersama';
import { tampilkanKategori } from './kategori.controller';
import { type MenuLengkap, muatMenuLengkap, ringkasanHarga } from './menu.controller';

/** Menu sebagaimana dijual di satu Outlet. */
export interface MenuDiOutlet extends MenuLengkap {
  /** Stasiun yang menerima Item Pesanan Menu ini di Outlet, atau null bila belum dipetakan. */
  stasiunId: string | null;
  /** Habis di Outlet ini: tampil redup di kasir dan tidak bisa dipesan. */
  habis: boolean;
}

/**
 * Menerapkan pengaturan Outlet ke Menu Merek: override harga (Menu dan per Varian), Stasiun, Habis.
 * `harga` dan `varian[].harga` di hasilnya adalah harga yang berlaku di Outlet itu.
 */
async function terapkanOutlet(tx: TxDb, outletId: string, daftar: MenuLengkap[]): Promise<MenuDiOutlet[]> {
  const pemetaan = new Map(
    (await tx.select().from(menuStasiun).where(eq(menuStasiun.outletId, outletId))).map((p) => [p.menuId, p.stasiunId]),
  );
  const override = new Map(
    (await tx.select().from(hargaOutlet).where(eq(hargaOutlet.outletId, outletId))).map((h) => [`${h.menuId}:${h.varianId ?? ''}`, h.harga]),
  );
  const habis = new Set((await tx.select({ menuId: menuHabis.menuId }).from(menuHabis).where(eq(menuHabis.outletId, outletId))).map((h) => h.menuId));
  return daftar.map((m) => ({
    ...m,
    harga: override.get(`${m.id}:`) ?? m.harga,
    varian: m.varian.map((v) => ({ ...v, harga: override.get(`${m.id}:${v.id}`) ?? v.harga })),
    stasiunId: pemetaan.get(m.id) ?? null,
    habis: habis.has(m.id),
  }));
}

/** Satu Menu dengan harga dan pengaturan Outlet (aktif maupun tidak). */
export async function menuDiOutlet(tx: TxDb, outletId: string, menuId: string): Promise<MenuDiOutlet> {
  const { menu: baris } = await pastikanMenuDiOutlet(tx, outletId, menuId);
  const [m] = await terapkanOutlet(tx, outletId, await muatMenuLengkap(tx, [baris]));
  return m!;
}

/** Tandai Menu Habis (`{habis: true}`) atau tersedia lagi di satu Outlet. */
export async function aturHabis(tx: TxDb, outletId: string, menuId: string, body: unknown): Promise<MenuDiOutlet> {
  const { outlet } = await pastikanMenuDiOutlet(tx, outletId, menuId);
  const habis = boolean(objek(body), 'habis');
  if (habis) await tx.insert(menuHabis).values({ tenantId: outlet.tenantId, outletId, menuId }).onConflictDoNothing();
  else await tx.delete(menuHabis).where(and(eq(menuHabis.outletId, outletId), eq(menuHabis.menuId, menuId)));
  return menuDiOutlet(tx, outletId, menuId);
}

/** Apakah Merek Outlet punya minimal satu Menu aktif (langkah Siap Jualan `menu`). */
export async function adaMenuAktif(tx: TxDb, o: { merekId: string }): Promise<boolean> {
  const [m] = await tx
    .select({ id: menu.id })
    .from(menu)
    .where(and(eq(menu.merekId, o.merekId), eq(menu.aktif, true)))
    .limit(1);
  return m !== undefined;
}

/** Menu aktif Merek Outlet, berurutan seperti di kasir. */
export async function menuDijualDiOutlet(tx: TxDb, outletId: string) {
  const o = await pastikanOutlet(tx, outletId);
  const baris = await tx
    .select()
    .from(menu)
    .where(and(eq(menu.merekId, o.merekId), eq(menu.aktif, true)))
    .orderBy(asc(menu.urutan), asc(menu.createdAt));
  const daftarKategori = await tx
    .select()
    .from(kategori)
    .where(eq(kategori.merekId, o.merekId))
    .orderBy(asc(kategori.urutan), asc(kategori.createdAt));
  return {
    kategori: daftarKategori.map(tampilkanKategori),
    menu: await terapkanOutlet(tx, outletId, await muatMenuLengkap(tx, baris)),
  };
}

@Controller('outlet/:outletId/menu')
@UseGuards(SesiGuard)
export class MenuOutletController {
  constructor(
    private readonly db: Database,
    private readonly audit: PenulisLogAudit,
  ) {}

  /** Daftar jual Outlet: Kategori dan Menu aktif dengan Stasiun, harga Outlet, dan tanda Habis. */
  @Get()
  @PerluIzin('menu.lihat', { outletParam: 'outletId' })
  async daftar(@Param('outletId') outletId: string) {
    return menuDijualDiOutlet(this.db.tenant(), outletId);
  }

  /** Petakan Menu ke Stasiun Outlet ini; `stasiunId: null` melepas pemetaan. */
  @Put(':menuId/stasiun')
  @PerluIzin('stasiun.kelola', { outletParam: 'outletId' })
  async petakanStasiun(@Param('outletId') outletId: string, @Param('menuId') menuId: string, @Body() body: unknown) {
    const tx = this.db.tenant();
    const { outlet } = await pastikanMenuDiOutlet(tx, outletId, menuId);
    const m = objek(body);
    await tx.delete(menuStasiun).where(and(eq(menuStasiun.outletId, outletId), eq(menuStasiun.menuId, menuId)));
    if (m.stasiunId !== null) {
      const s = await pastikanStasiun(tx, teks(m, 'stasiunId', { maks: 64 }));
      if (s.outletId !== outletId) throw tidakDitemukan('Stasiun');
      await tx.insert(menuStasiun).values({ tenantId: outlet.tenantId, outletId, menuId, stasiunId: s.id });
    }
    return { menuId, outletId, stasiunId: m.stasiunId === null ? null : (m.stasiunId as string) };
  }

  /** Tandai Menu Habis (atau tersedia lagi) di Outlet ini. Outlet lain tidak terpengaruh. */
  @Put(':menuId/habis')
  @PerluIzin('menu.habis', { outletParam: 'outletId' })
  async aturHabis(@Param('outletId') outletId: string, @Param('menuId') menuId: string, @Body() body: unknown) {
    return aturHabis(this.db.tenant(), outletId, menuId, body);
  }

  /**
   * Override harga Menu untuk Outlet ini. `harga: null` kembali ke harga Merek; `varian` berisi
   * override per Varian (Varian yang tidak disebut memakai harga Merek). Menggantikan seluruh
   * override Menu ini di Outlet. Tercatat di Log Audit sebagai `ubah_harga_outlet`.
   */
  @Put(':menuId/harga')
  @PerluIzin('menu.harga_outlet', { outletParam: 'outletId' })
  async aturHarga(
    @Param('outletId') outletId: string,
    @Param('menuId') menuId: string,
    @Body() body: unknown,
    @Sesi() sesi: SesiPengguna,
  ) {
    const tx = this.db.tenant();
    const sebelum = await menuDiOutlet(tx, outletId, menuId);
    const m = objek(body);
    const harga = m.harga === null || m.harga === undefined ? null : rupiah(m.harga, 'harga');
    const varianOverride = varianOverrideValid(m.varian, new Set(sebelum.varian.map((v) => v.id)));

    await tx.delete(hargaOutlet).where(and(eq(hargaOutlet.outletId, outletId), eq(hargaOutlet.menuId, menuId)));
    const { outlet } = await pastikanMenuDiOutlet(tx, outletId, menuId);
    const baris = [
      ...(harga === null ? [] : [{ varianId: null, harga }]),
      ...varianOverride.filter((v): v is { varianId: string; harga: number } => v.harga !== null),
    ];
    for (const b of baris) await tx.insert(hargaOutlet).values({ tenantId: outlet.tenantId, outletId, menuId, ...b });

    const sesudah = await menuDiOutlet(tx, outletId, menuId);
    await this.audit.catat({
      aksi: 'ubah_harga_outlet',
      entitas: 'menu',
      entitasId: menuId,
      outletId,
      pelaku: { penggunaId: sesi.penggunaId },
      sebelum: ringkasanHarga(sebelum),
      sesudah: ringkasanHarga(sesudah),
    });
    return sesudah;
  }
}

function varianOverrideValid(v: unknown, varianMenu: Set<string>): { varianId: string; harga: number | null }[] {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) throw tidakValid('varian', 'Harus daftar { varianId, harga }.');
  return v.map((x, i) => {
    const o = objek(x);
    const varianId = teks(o, 'varianId', { maks: 64 });
    if (!varianMenu.has(varianId)) throw tidakDitemukan('Varian');
    return { varianId, harga: o.harga === null ? null : rupiah(o.harga, `varian[${i}].harga`) };
  });
}
