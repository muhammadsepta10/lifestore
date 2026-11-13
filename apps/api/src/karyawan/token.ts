import { randomInt } from 'node:crypto';
import { buatToken } from '../identitas/kripto';

/**
 * Token yang memuat ID Tenant di depannya (`<tenantId>.<acak>`), untuk token yang dipakai
 * sebelum ada konteks Tenant (token Perangkat Terdaftar, undangan karyawan). ID Tenant hanya
 * petunjuk tempat mencari: barisnya tetap dicari dengan hash token di bawah RLS Tenant itu.
 */
export function buatTokenBertenant(tenantId: string): string {
  return `${tenantId}.${buatToken()}`;
}

export function bacaTokenBertenant(token: string): string | null {
  const m = /^([0-9a-f-]{36})\.[\w-]{20,}$/.exec(token);
  return m ? m[1]! : null;
}

const HURUF_KODE = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** Kode pendaftaran perangkat: 8 karakter tanpa huruf yang mirip (O/0, I/1, L). */
export function buatKodePendaftaran(): string {
  let kode = '';
  for (let i = 0; i < 8; i++) kode += HURUF_KODE[randomInt(HURUF_KODE.length)];
  return kode;
}

/** Normalisasi kode yang diketik manajer: huruf besar, tanpa spasi atau tanda hubung. */
export function normalisasiKode(v: string): string {
  return v.toUpperCase().replace(/[\s-]/g, '');
}
