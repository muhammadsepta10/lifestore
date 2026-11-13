import { sql } from 'drizzle-orm';
import type { TxDb } from '../database/database';
import { penghitungNomor } from '../database/schema';

/** Kunci penghitung Nomor Nota Outlet. */
export const KUNCI_NOTA = 'nota';

/** Kunci penghitung Nomor Pesanan harian per awalan Perangkat Terdaftar. */
export function kunciPesanan(tanggal: string, awalan: string): string {
  return `pesanan:${tanggal}:${awalan}`;
}

/**
 * Nomor berikutnya dari penghitung Outlet (mulai 1). Baris penghitung terkunci sampai transaksi
 * pemanggil selesai, sehingga pemakai paralel antre, dan kenaikannya ikut batal bila transaksi
 * gagal: nomor berurutan tanpa celah dan tanpa duplikat.
 */
export async function nomorBerikut(tx: TxDb, o: { tenantId: string; outletId: string }, kunci: string): Promise<number> {
  const [baris] = await tx
    .insert(penghitungNomor)
    .values({ tenantId: o.tenantId, outletId: o.outletId, kunci, nilai: 1 })
    .onConflictDoUpdate({ target: [penghitungNomor.outletId, penghitungNomor.kunci], set: { nilai: sql`${penghitungNomor.nilai} + 1` } })
    .returning({ nilai: penghitungNomor.nilai });
  return baris!.nilai;
}

/** Tanggal kalender operasional (Asia/Jakarta) dari sebuah waktu; dasar Nomor Pesanan harian. */
export function tanggalOperasional(waktu: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(waktu);
}
