import { and, eq, type SQL, sql } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';
import type { TxDb } from '../database/database';
import { kategori, menu, merek, outlet, stasiun } from '../database/schema';
import { type Masukan, teksOpsional, tidakDitemukan, tidakValid } from '../umum/validasi';

// Pencarian lewat transaksi Tenant (RLS): ID milik Tenant lain tidak pernah ditemukan, sehingga
// tidak bisa dipakai sebagai referensi (cek FK Postgres sendiri melewati RLS).

export async function pastikanMerek(tx: TxDb, id: string) {
  const [m] = await tx.select({ id: merek.id, tenantId: merek.tenantId }).from(merek).where(eq(merek.id, id));
  if (!m) throw tidakDitemukan('Merek');
  return m;
}

export async function pastikanKategori(tx: TxDb, id: string, merekId?: string) {
  const [k] = await tx
    .select({ id: kategori.id, merekId: kategori.merekId })
    .from(kategori)
    .where(merekId ? and(eq(kategori.id, id), eq(kategori.merekId, merekId)) : eq(kategori.id, id));
  if (!k) throw tidakDitemukan('Kategori');
  return k;
}

export async function pastikanOutlet(tx: TxDb, id: string) {
  const [o] = await tx.select({ id: outlet.id, tenantId: outlet.tenantId, merekId: outlet.merekId }).from(outlet).where(eq(outlet.id, id));
  if (!o) throw tidakDitemukan('Outlet');
  return o;
}

export async function pastikanMenu(tx: TxDb, id: string) {
  const [m] = await tx.select().from(menu).where(eq(menu.id, id));
  if (!m) throw tidakDitemukan('Menu');
  return m;
}

/** Menu yang dijual di Outlet: hanya Menu milik Merek Outlet itu. */
export async function pastikanMenuDiOutlet(tx: TxDb, outletId: string, menuId: string) {
  const o = await pastikanOutlet(tx, outletId);
  const m = await pastikanMenu(tx, menuId);
  if (m.merekId !== o.merekId) throw tidakDitemukan('Menu');
  return { outlet: o, menu: m };
}

export async function pastikanStasiun(tx: TxDb, id: string) {
  const [s] = await tx.select().from(stasiun).where(eq(stasiun.id, id));
  if (!s) throw tidakDitemukan('Stasiun');
  return s;
}

/** URL http(s) opsional: `undefined` bila tidak dikirim, `null` bila dikosongkan. */
export function urlOpsional(m: Masukan, kolom: string): string | null | undefined {
  const v = teksOpsional(m, kolom, { maks: 2000 });
  if (v && !/^https?:\/\//.test(v)) throw tidakValid(kolom, 'Harus URL http(s).');
  return v;
}

/** Harga dalam rupiah bulat, tidak negatif. */
export function rupiah(v: unknown, kolom: string): number {
  if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < 0) throw tidakValid(kolom, 'Harus rupiah bulat, tidak negatif.');
  return v;
}

export function bulat(v: unknown, kolom: string, opsi: { min: number; maks: number }): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < opsi.min || v > opsi.maks) {
    throw tidakValid(kolom, `Harus bilangan bulat ${opsi.min} sampai ${opsi.maks}.`);
  }
  return v;
}

export function idDaftar(m: Masukan, kolom: string): string[] {
  const v = m[kolom];
  if (!Array.isArray(v) || v.length === 0 || v.some((x) => typeof x !== 'string')) throw tidakValid(kolom, 'Harus daftar ID.');
  if (new Set(v).size !== v.length) throw tidakValid(kolom, 'ID tidak boleh berulang.');
  return v as string[];
}

type TabelBerurutan = typeof kategori | typeof menu | typeof stasiun;

export async function urutanBerikutnya(tx: TxDb, tabel: TabelBerurutan, cakupan: SQL | undefined): Promise<number> {
  const [r] = await tx
    .select({ maks: sql<number | null>`max(${tabel.urutan})` })
    .from(tabel)
    .where(cakupan);
  return r?.maks === null || r?.maks === undefined ? 0 : Number(r.maks) + 1;
}

/** Menulis `urutan` sesuai posisi di `ids`. ID di luar cakupan → 404, tanpa mengubah apa pun. */
export async function aturUrutan(tx: TxDb, tabel: TabelBerurutan, kolomCakupan: PgColumn, nilaiCakupan: string, ids: string[]) {
  for (const [i, id] of ids.entries()) {
    const diubah = await tx
      .update(tabel)
      .set({ urutan: i })
      .where(and(eq(tabel.id, id), eq(kolomCakupan, nilaiCakupan)))
      .returning({ id: tabel.id });
    // Melempar di sini membatalkan seluruh transaksi request, termasuk baris yang sudah diubah.
    if (diubah.length === 0) throw tidakDitemukan('Salah satu ID');
  }
}
