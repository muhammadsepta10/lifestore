/** Format tampilan bersama untuk semua layar web. */

const angkaId = new Intl.NumberFormat('id-ID');

/** Rupiah untuk ditampilkan: `Rp12.500`. */
export const rp = (n: number): string => `Rp${angkaId.format(n)}`;
