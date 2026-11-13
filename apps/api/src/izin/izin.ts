import { createParamDecorator, type ExecutionContext, ForbiddenException, SetMetadata, UnauthorizedException } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { and, eq } from 'drizzle-orm';
import type { TxDb } from '../database/database';
import type { RequestBertenant } from '../database/konteks-tenant';
import { anggota, penugasan } from '../database/schema';

/**
 * Daftar izin. Satu pemeriksa izin (`punyaIzin`) dipakai semua endpoint, lewat `@PerluIzin`
 * (dibaca SesiGuard dan PerangkatGuard) atau `pastikanIzin` di dalam handler.
 * Izin berlingkup Outlet diperiksa terhadap Peran di Penugasan Outlet itu.
 */
export const IZIN = [
  'dashboard.lihat',
  'log_audit.lihat',
  'outlet.lihat',
  'outlet.tambah',
  'outlet.ubah',
  'merek.ubah',
  'profil_pajak.lihat',
  'profil_pajak.ubah',
  'menu.lihat',
  'menu.ubah',
  'menu.harga_outlet',
  'menu.habis',
  'stasiun.kelola',
  'meja.kelola',
  'meja.nonaktifkan',
  'metode_bayar.kelola',
  'karyawan.kelola',
  'perangkat.kelola',
  'kasir.buka',
  'kds.buka',
  'shift.laporan',
  'tagihan.void',
  'item.batal_setelah_dimasak',
  'diskon.di_atas_batas',
  'laci.buka_tanpa_transaksi',
] as const;
export type Izin = (typeof IZIN)[number];

/** Peran tingkat Tenant di kolom `anggota.peran`. */
export const PERAN_PEMILIK = 'pemilik';
export const PERAN_KARYAWAN = 'karyawan';

/** Peran bawaan yang bisa diberikan lewat Penugasan. Peran custom ditunda. */
export const PERAN_BAWAAN = ['manajer_outlet', 'kasir', 'pelayan', 'dapur'] as const;
export type PeranBawaan = (typeof PERAN_BAWAAN)[number];

/** Daftar izin per Peran bawaan. Pemilik selalu punya semua izin di semua Outlet. */
export const IZIN_PERAN: Record<PeranBawaan, readonly Izin[]> = {
  manajer_outlet: [
    'dashboard.lihat',
    'log_audit.lihat',
    'outlet.lihat',
    'outlet.ubah',
    'profil_pajak.lihat',
    'menu.lihat',
    'menu.harga_outlet',
    'menu.habis',
    'stasiun.kelola',
    'meja.kelola',
    'meja.nonaktifkan',
    'metode_bayar.kelola',
    'perangkat.kelola',
    'kasir.buka',
    'kds.buka',
    'shift.laporan',
    'tagihan.void',
    'item.batal_setelah_dimasak',
    'diskon.di_atas_batas',
    'laci.buka_tanpa_transaksi',
  ],
  kasir: ['menu.lihat', 'menu.habis', 'meja.nonaktifkan', 'kasir.buka'],
  pelayan: ['menu.lihat', 'kasir.buka', 'kds.buka'],
  dapur: ['menu.lihat', 'menu.habis', 'kds.buka'],
};

/** Anggota yang sedang beraksi (lewat sesi dashboard atau PIN di Perangkat Terdaftar). */
export interface Pelaku {
  anggotaId: string;
  penggunaId: string | null;
  /** Terisi bila aksi datang dari Perangkat Terdaftar. */
  perangkatId: string | null;
  /** Outlet Perangkat Terdaftar; null untuk sesi dashboard. */
  outletId: string | null;
  peran: string;
  penugasan: { outletId: string; peran: string }[];
}

/**
 * Pemeriksa izin tunggal. Dengan `outletId`: Peran di Penugasan Outlet itu harus memuat izinnya.
 * Tanpa `outletId` (sumber daya tingkat Tenant): cukup salah satu Penugasan memuatnya.
 */
export function punyaIzin(p: Pick<Pelaku, 'peran' | 'penugasan'>, izin: Izin, outletId?: string | null): boolean {
  if (p.peran === PERAN_PEMILIK) return true;
  const relevan = outletId ? p.penugasan.filter((t) => t.outletId === outletId) : p.penugasan;
  return relevan.some((t) => (IZIN_PERAN[t.peran as PeranBawaan] ?? []).includes(izin));
}

/** Semua izin Pelaku di satu Outlet (untuk UI kasir). */
export function daftarIzin(p: Pick<Pelaku, 'peran' | 'penugasan'>, outletId: string | null): Izin[] {
  return IZIN.filter((i) => punyaIzin(p, i, outletId));
}

export function tidakBerizin(izin: Izin): ForbiddenException {
  return new ForbiddenException({ kode: 'tidak_berizin', izin, pesan: 'Peran Anda tidak punya izin untuk aksi ini.' });
}

export function pastikanIzin(p: Pelaku, izin: Izin, outletId?: string | null): void {
  if (!punyaIzin(p, izin, outletId)) throw tidakBerizin(izin);
}

const META_IZIN = 'lifestore:izin';

export interface AturanIzin {
  /** null = semua Anggota yang sudah masuk (lihat `SemuaAnggota`). */
  izin: Izin | null;
  /** Nama parameter rute yang berisi ID Outlet, untuk izin berlingkup Outlet. */
  outletParam?: string;
}

/**
 * Izin yang dibutuhkan rute. Rute dashboard TANPA `@PerluIzin` hanya bisa dibuka Pemilik.
 * Di rute Perangkat Terdaftar, izin selalu diperiksa terhadap Outlet perangkat.
 */
export const PerluIzin = (izin: Izin, opsi: { outletParam?: string } = {}) =>
  SetMetadata(META_IZIN, { izin, outletParam: opsi.outletParam } satisfies AturanIzin);

/** Rute yang boleh dibuka setiap Anggota yang sudah masuk, tanpa izin khusus. */
export const SemuaAnggota = () => SetMetadata(META_IZIN, { izin: null } satisfies AturanIzin);

export function aturanIzin(reflector: Reflector, ctx: ExecutionContext): AturanIzin | undefined {
  return reflector.getAllAndOverride<AturanIzin | undefined>(META_IZIN, [ctx.getHandler(), ctx.getClass()]);
}

export type RequestBerpelaku = RequestBertenant & { pelaku?: Pelaku };

/** Parameter handler: Anggota yang sedang beraksi. */
export const PelakuAktif = createParamDecorator((_: unknown, ctx: ExecutionContext): Pelaku => {
  const p = ctx.switchToHttp().getRequest<RequestBerpelaku>().pelaku;
  if (!p) throw new UnauthorizedException({ kode: 'belum_masuk', pesan: 'Silakan masuk.' });
  return p;
});

/** Memuat Anggota aktif beserta Penugasannya. `tx` harus transaksi Tenant. */
export async function muatAnggota(
  tx: TxDb,
  kondisi: { anggotaId: string } | { penggunaId: string },
): Promise<Omit<Pelaku, 'perangkatId' | 'outletId'> | undefined> {
  const [a] = await tx
    .select({ id: anggota.id, penggunaId: anggota.penggunaId, peran: anggota.peran })
    .from(anggota)
    .where(
      and(
        'anggotaId' in kondisi ? eq(anggota.id, kondisi.anggotaId) : eq(anggota.penggunaId, kondisi.penggunaId),
        eq(anggota.aktif, true),
      ),
    );
  if (!a) return undefined;
  const tugas = await tx.select({ outletId: penugasan.outletId, peran: penugasan.peran }).from(penugasan).where(eq(penugasan.anggotaId, a.id));
  return { anggotaId: a.id, penggunaId: a.penggunaId, peran: a.peran, penugasan: tugas };
}

/** Pemeriksaan izin rute (dipakai kedua guard). Tanpa `@PerluIzin`, hanya Pemilik yang lolos. */
export function periksaIzinRute(
  reflector: Reflector,
  ctx: ExecutionContext,
  pelaku: Pelaku,
): void {
  const aturan = aturanIzin(reflector, ctx);
  if (!aturan) {
    if (pelaku.peran !== PERAN_PEMILIK) {
      throw new ForbiddenException({ kode: 'tidak_berizin', pesan: 'Hanya Pemilik yang bisa membuka ini.' });
    }
    return;
  }
  if (aturan.izin === null) return;
  const req = ctx.switchToHttp().getRequest<RequestBerpelaku>();
  const outletId = pelaku.outletId ?? (aturan.outletParam ? (req.params as Record<string, string>)[aturan.outletParam] : undefined);
  pastikanIzin(pelaku, aturan.izin, outletId);
}
