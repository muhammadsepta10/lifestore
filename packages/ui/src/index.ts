/**
 * Token desain v3 (prototype/desain-v3.md di branch prototype/kasir).
 * Nilai CSS ada di `@lifestore/ui/tokens.css`; konstanta di sini untuk logika (misal warna Kategori).
 */

/** Pastel per Kategori; sama di tema terang dan gelap, teks di atasnya selalu `#14201c`. */
export const PASTEL_KATEGORI = {
  peach: '#ffd9c2',
  lemon: '#fff0b3',
  sky: '#cfe6ff',
  lilac: '#e6d9ff',
  mint: '#c9f2df',
  pink: '#ffd6e7',
  sand: '#efe4d6',
} as const;

export type PastelKategori = keyof typeof PASTEL_KATEGORI;

export const WARNA_AKSEN = '#0f9f7f';

export const FONT_UTAMA = "'Plus Jakarta Sans', system-ui, sans-serif";
