import { ConflictException } from '@nestjs/common';
import { and, asc, eq } from 'drizzle-orm';
import type { TxDb } from '../database/database';
import { meja, tagihan, tagihanMeja } from '../database/schema';
import { tidakDitemukan } from '../umum/validasi';

/**
 * Meja aktif milik Outlet, dengan barisnya dikunci (FOR UPDATE) sampai transaksi selesai, supaya
 * dua perangkat yang memilih Meja yang sama antre dan hanya satu yang menempatinya.
 */
export async function kunciMeja(tx: TxDb, outletId: string, mejaId: string) {
  const [m] = await tx
    .select()
    .from(meja)
    .where(and(eq(meja.id, mejaId), eq(meja.outletId, outletId)))
    .for('update');
  if (!m) throw tidakDitemukan('Meja');
  if (!m.aktif) throw new ConflictException({ kode: 'meja_nonaktif', pesan: `Meja ${m.label} sedang dinonaktifkan.` });
  return m;
}

/** Tagihan terbuka yang menempati Meja ini (terlama dulu); kosong berarti Meja Kosong. */
export async function penghuniMeja(tx: TxDb, mejaId: string): Promise<string[]> {
  const baris = await tx
    .select({ tagihanId: tagihanMeja.tagihanId })
    .from(tagihanMeja)
    .innerJoin(tagihan, eq(tagihan.id, tagihanMeja.tagihanId))
    .where(and(eq(tagihanMeja.mejaId, mejaId), eq(tagihan.status, 'terbuka')))
    .orderBy(asc(tagihan.dibukaPada), asc(tagihan.id));
  return baris.map((b) => b.tagihanId);
}

export function mejaTerisi(label: string, tagihanId: string): ConflictException {
  return new ConflictException({ kode: 'meja_terisi', tagihanId, pesan: `Meja ${label} sedang terisi.` });
}
