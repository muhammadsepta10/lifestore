import { eq } from 'drizzle-orm';
import { idDipakai } from '../umum/validasi';
import type { TxDb } from './database';
import { perintahKlien } from './schema';

export interface PerintahKlien {
  tenantId: string;
  outletId: string;
  /** Nama perintah, misal `void_tagihan`. */
  jenis: string;
  /** Entitas sasaran perintah (ID Tagihan, Shift, atau perangkat). */
  entitasId: string;
  /** Jawaban yang tidak bisa dibaca ulang dari data; dikembalikan apa adanya saat kiriman ulang. */
  hasil?: unknown;
}

/**
 * Klaim `id` buatan klien untuk satu perintah kasir (kunci idempoten). Panggil di dalam transaksi
 * perintah itu, sesudah entitas sasarannya dikunci dan sebelum mengubah apa pun:
 *
 * - `'baru'`: perintah belum pernah dijalankan (atau klien tidak mengirim `id`); lanjutkan. Bila
 *   perintahnya kemudian gagal, klaim ikut dibatalkan bersama transaksinya.
 * - `{ hasil }`: perintah yang sama sudah dijalankan; jangan jalankan lagi, kembalikan keadaan
 *   sekarang (atau `hasil` yang tersimpan).
 *
 * `id` yang sudah dipakai untuk perintah atau entitas lain, termasuk oleh Tenant lain, ditolak
 * dengan 409 `id_dipakai`.
 */
export async function klaimPerintah(tx: TxDb, id: string | undefined, p: PerintahKlien): Promise<'baru' | { hasil: unknown }> {
  if (!id) return 'baru';
  const [baru] = await tx
    .insert(perintahKlien)
    .values({ id, tenantId: p.tenantId, outletId: p.outletId, jenis: p.jenis, entitasId: p.entitasId, hasil: p.hasil ?? null })
    .onConflictDoNothing()
    .returning({ id: perintahKlien.id });
  if (baru) return 'baru';
  const [lama] = await tx.select().from(perintahKlien).where(eq(perintahKlien.id, id));
  if (!lama || lama.jenis !== p.jenis || lama.entitasId !== p.entitasId) throw idDipakai();
  return { hasil: lama.hasil };
}
