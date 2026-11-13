import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt) as (sandi: string, garam: Buffer, panjang: number) => Promise<Buffer>;
const PANJANG_KUNCI = 64;

/** Hash kata sandi dengan scrypt: `scrypt$<garam>$<kunci>` (base64url). */
export async function hashKataSandi(kataSandi: string): Promise<string> {
  const garam = randomBytes(16);
  const kunci = await scryptAsync(kataSandi, garam, PANJANG_KUNCI);
  return `scrypt$${garam.toString('base64url')}$${kunci.toString('base64url')}`;
}

export async function cocokKataSandi(kataSandi: string, hash: string): Promise<boolean> {
  const [algo, garam, kunci] = hash.split('$');
  if (algo !== 'scrypt' || !garam || !kunci) return false;
  const harapan = Buffer.from(kunci, 'base64url');
  const hasil = await scryptAsync(kataSandi, Buffer.from(garam, 'base64url'), harapan.length);
  return timingSafeEqual(hasil, harapan);
}

/** Hash tetap yang dipakai saat email tidak dikenal, supaya waktu respons tidak membocorkannya. */
export const HASH_PALSU = 'scrypt$AAAAAAAAAAAAAAAAAAAAAA$' + Buffer.alloc(PANJANG_KUNCI).toString('base64url');

/** Token acak untuk sesi dan verifikasi email. Hanya hash-nya yang disimpan. */
export function buatToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
