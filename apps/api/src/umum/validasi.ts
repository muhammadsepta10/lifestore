import { BadRequestException, NotFoundException } from '@nestjs/common';

/**
 * Validasi masukan JSON yang kecil dan eksplisit. Setiap kegagalan menjadi 400 dengan
 * `{ kode: 'masukan_tidak_valid', kolom, pesan }`.
 */
export function tidakValid(kolom: string, pesan: string): BadRequestException {
  return new BadRequestException({ kode: 'masukan_tidak_valid', kolom, pesan });
}

export function tidakDitemukan(apa: string): NotFoundException {
  return new NotFoundException({ kode: 'tidak_ditemukan', pesan: `${apa} tidak ditemukan.` });
}

export type Masukan = Record<string, unknown>;

export function objek(body: unknown): Masukan {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) throw tidakValid('body', 'Harus berupa objek JSON.');
  return body as Masukan;
}

export function teks(m: Masukan, kolom: string, opsi: { maks?: number } = {}): string {
  const v = m[kolom];
  if (typeof v !== 'string' || v.trim() === '') throw tidakValid(kolom, 'Wajib diisi.');
  if (v.length > (opsi.maks ?? 200)) throw tidakValid(kolom, 'Terlalu panjang.');
  return v.trim();
}

/** Teks opsional: `undefined` bila tidak dikirim, `null` bila dikosongkan. */
export function teksOpsional(m: Masukan, kolom: string, opsi: { maks?: number } = {}): string | null | undefined {
  const v = m[kolom];
  if (v === undefined) return undefined;
  if (v === null || v === '') return null;
  if (typeof v !== 'string') throw tidakValid(kolom, 'Harus berupa teks.');
  if (v.length > (opsi.maks ?? 500)) throw tidakValid(kolom, 'Terlalu panjang.');
  return v.trim() === '' ? null : v.trim();
}

export function email(m: Masukan, kolom: string): string {
  const v = teks(m, kolom, { maks: 254 }).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) throw tidakValid(kolom, 'Email tidak valid.');
  return v;
}

export function angka(m: Masukan, kolom: string, opsi: { min: number; maks: number }): number {
  const v = m[kolom];
  if (typeof v !== 'number' || !Number.isFinite(v)) throw tidakValid(kolom, 'Harus berupa angka.');
  if (v < opsi.min || v > opsi.maks) throw tidakValid(kolom, `Harus di antara ${opsi.min} dan ${opsi.maks}.`);
  return v;
}

export function pilihan<T extends string>(m: Masukan, kolom: string, daftar: readonly T[]): T {
  const v = m[kolom];
  if (typeof v !== 'string' || !(daftar as readonly string[]).includes(v)) {
    throw tidakValid(kolom, `Harus salah satu dari: ${daftar.join(', ')}.`);
  }
  return v as T;
}

export function boolean(m: Masukan, kolom: string): boolean {
  const v = m[kolom];
  if (typeof v !== 'boolean') throw tidakValid(kolom, 'Harus true atau false.');
  return v;
}

/** Tanggal kalender `YYYY-MM-DD` yang benar-benar ada. */
export function tanggal(v: unknown, kolom: string): string {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw tidakValid(kolom, 'Format tanggal YYYY-MM-DD.');
  const d = new Date(`${v}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v) throw tidakValid(kolom, 'Tanggal tidak ada.');
  return v;
}

/** Tanggal hari ini di Indonesia bagian barat (zona operasional default). */
export function hariIni(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date());
}
