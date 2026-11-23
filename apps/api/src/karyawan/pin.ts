import { HttpException, HttpStatus, UnauthorizedException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import type { Database } from '../database/database';
import type { KonteksTenant } from '../database/konteks-tenant';
import { anggota } from '../database/schema';
import { cocokKataSandi, hashKataSandi } from '../identitas/kripto';
import { tidakValid, type Masukan } from '../umum/validasi';

/** Jumlah PIN salah berturut-turut sebelum PIN dikunci sementara. */
export const BATAS_PIN_SALAH = 5;
/** Lama kunci sementara setelah batas PIN salah tercapai. */
export const LAMA_KUNCI_PIN_MS = 5 * 60 * 1000;

/** PIN 4–6 digit. */
export function pinValid(m: Masukan, kolom = 'pin'): string {
  const v = m[kolom];
  if (typeof v !== 'string' || !/^\d{4,6}$/.test(v)) throw tidakValid(kolom, 'PIN harus 4–6 digit angka.');
  return v;
}

export const hashPin = (pin: string) => hashKataSandi(pin);

export function pinTerkunci(sampai: Date): HttpException {
  return new HttpException(
    { kode: 'pin_terkunci', terkunciSampai: sampai.toISOString(), pesan: 'PIN dikunci sementara karena terlalu banyak salah.' },
    HttpStatus.LOCKED,
  );
}

type HasilPin = { ok: true } | { ok: false; sisaPercobaan: number } | { ok: false; terkunciSampai: Date };

/**
 * Periksa PIN Anggota di transaksi SENDIRI, supaya hitungan PIN salah tetap tersimpan walau
 * request-nya gagal (transaksi request dibatalkan saat error). Melempar 401 `pin_salah`
 * atau 423 `pin_terkunci`; mengembalikan normal bila PIN benar.
 */
export async function verifikasiPin(db: Database, konteks: KonteksTenant, anggotaId: string, pin: string, sekarang: Date): Promise<void> {
  const hasil = await db.denganTenant(konteks, async (tx): Promise<HasilPin> => {
    const [a] = await tx
      .select({ hashPin: anggota.hashPin, pinSalah: anggota.pinSalah, pinTerkunciSampai: anggota.pinTerkunciSampai })
      .from(anggota)
      .where(and(eq(anggota.id, anggotaId), eq(anggota.aktif, true)))
      .for('update');
    if (!a?.hashPin) return { ok: false, sisaPercobaan: 0 };
    if (a.pinTerkunciSampai && a.pinTerkunciSampai > sekarang) return { ok: false, terkunciSampai: a.pinTerkunciSampai };
    if (await cocokKataSandi(pin, a.hashPin)) {
      await tx.update(anggota).set({ pinSalah: 0, pinTerkunciSampai: null }).where(eq(anggota.id, anggotaId));
      return { ok: true };
    }
    const salah = a.pinSalah + 1;
    if (salah >= BATAS_PIN_SALAH) {
      const terkunciSampai = new Date(sekarang.getTime() + LAMA_KUNCI_PIN_MS);
      await tx.update(anggota).set({ pinSalah: 0, pinTerkunciSampai: terkunciSampai }).where(eq(anggota.id, anggotaId));
      return { ok: false, terkunciSampai };
    }
    await tx.update(anggota).set({ pinSalah: salah }).where(eq(anggota.id, anggotaId));
    return { ok: false, sisaPercobaan: BATAS_PIN_SALAH - salah };
  });
  if (hasil.ok) return;
  if ('terkunciSampai' in hasil) throw pinTerkunci(hasil.terkunciSampai);
  throw new UnauthorizedException({ kode: 'pin_salah', sisaPercobaan: hasil.sisaPercobaan, pesan: 'PIN salah.' });
}
