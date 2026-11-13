/** Teks UI Bahasa Indonesia (bahasa utama). Semua teks UI lewat kamus ini agar siap i18n. */
export const id = {
  aplikasi: { nama: 'Lifestore', judul: 'Lifestore', deskripsi: 'Manajemen restoran: kasir, dapur, dan laporan.' },
  status: {
    judul: 'Status sistem',
    api: 'API',
    database: 'Database',
    sehat: 'Sehat',
    gagal: 'Bermasalah',
    tidakTerhubung: 'Tidak terhubung',
  },
} as const;

export type Kamus = typeof id;

export function t(): Kamus {
  return id;
}
