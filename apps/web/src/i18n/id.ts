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
  beranda: { daftar: 'Coba gratis 14 hari', masuk: 'Masuk' },
  daftar: {
    judul: 'Coba Lifestore gratis',
    sub: '14 hari semua fitur Pro, tanpa kartu kredit.',
    email: 'Email',
    kataSandi: 'Kata sandi (min. 8 karakter)',
    namaUsaha: 'Nama usaha',
    kota: 'Kota',
    kirim: 'Daftar',
    terkirimJudul: 'Cek email Anda',
    terkirim: 'Kami mengirim tautan verifikasi ke email Anda. Klik tautan itu untuk mulai.',
    sudahPunya: 'Sudah punya akun? Masuk',
    gagal: 'Pendaftaran gagal. Periksa kembali isian Anda.',
    emailTerdaftar: 'Email sudah terdaftar. Silakan masuk.',
  },
  verifikasi: {
    berhasilJudul: 'Email terverifikasi',
    berhasil: 'Usaha Anda sudah siap. Masa Coba 14 hari dimulai hari ini.',
    gagalJudul: 'Tautan tidak valid',
    gagal: 'Tautan verifikasi tidak valid, sudah dipakai, atau kedaluwarsa.',
    lanjut: 'Masuk sekarang',
  },
  masuk: {
    judul: 'Masuk',
    email: 'Email',
    kataSandi: 'Kata sandi',
    kirim: 'Masuk',
    salah: 'Email atau kata sandi salah.',
    belumVerifikasi: 'Verifikasi email terlebih dahulu lewat tautan yang kami kirim.',
    belumPunya: 'Belum punya akun? Daftar',
  },
  pilihTenant: { judul: 'Pilih usaha', sub: 'Akun Anda terdaftar di beberapa usaha.' },
  dashboard: {
    masaCoba: (sisa: number) => `Masa Coba Pro: sisa ${sisa} hari`,
    masaCobaHabis: 'Masa Coba telah berakhir',
    siapJualan: 'Siap Jualan',
    kemajuan: (selesai: number, total: number) => `${selesai} dari ${total} langkah selesai`,
    kasirSiap: 'Kasir siap dipakai.',
    kasirBelum: 'Kasir bisa dipakai setelah ada Menu, Profil Pajak, dan satu Perangkat Terdaftar.',
    lewati: 'Lewati',
    batalLewati: 'Batalkan',
    keluar: 'Keluar',
    gantiUsaha: 'Ganti usaha',
    status: { selesai: 'Selesai', belum: 'Belum', dilewati: 'Dilewati' } as Record<string, string>,
    wajibKasir: 'Wajib untuk kasir',
    langkah: {
      profil_outlet: 'Profil Outlet (alamat, jam buka, logo)',
      profil_pajak: 'Profil Pajak',
      menu: 'Menu',
      stasiun: 'Stasiun dapur',
      metode_bayar: 'Metode Bayar',
      meja: 'Meja',
      karyawan: 'Karyawan dan PIN',
      perangkat: 'Perangkat Terdaftar',
    } as Record<string, string>,
  },
} as const;

export type Kamus = typeof id;

export function t(): Kamus {
  return id;
}
