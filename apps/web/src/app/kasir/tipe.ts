/** Bentuk respons API yang dipakai layar kasir (server dan klien). */

export interface MenuJual {
  id: string;
  kategoriId: string;
  nama: string;
  harga: number;
  habis: boolean;
  bebasPajak: boolean;
  varian: { id: string; nama: string; harga: number }[];
  grupPilihan: { id: string; nama: string; minimum: number; maksimum: number; pilihan: { id: string; nama: string; harga: number }[] }[];
}

export interface KategoriJual {
  id: string;
  nama: string;
  warna: string;
  ikon: string | null;
}

export interface DaftarJual {
  kategori: KategoriJual[];
  menu: MenuJual[];
}

export interface ItemPesanan {
  id: string;
  nama: string;
  namaVarian: string | null;
  hargaSatuan: number;
  jumlah: number;
  pilihan: { nama: string; harga: number }[];
  bebasPajak: boolean;
  catatan: string | null;
  status: string;
}

export interface Rincian {
  subtotal: number;
  diskon: number;
  serviceCharge: number;
  dasarPajak: number;
  pajak: number;
  total: number;
}

export interface RingkasTagihan {
  id: string;
  status: 'terbuka' | 'lunas' | 'void' | 'batal' | 'digabung';
  kanal: 'dine_in' | 'bawa_pulang';
  /** Meja yang ditempati (dine-in); lebih dari satu setelah gabung Meja. */
  meja: { id: string; label: string }[];
  namaPelanggan: string | null;
  nomorNota: number | null;
  dibukaPada: string;
  ditutupPada: string | null;
  profilPajak: { jenis: 'PBJT' | 'PPN' | 'tidak_dipungut'; tarifPersen: number; labelStruk: string; hargaTermasukPajak: boolean };
  serviceCharge: { tarifPersen: number; kanal: ('dine_in' | 'bawa_pulang')[] };
  /** Diskon Manual yang terpasang (#39). */
  diskonManual?: { jenis: 'persen' | 'nominal'; nilai: number; alasan: string | null } | null;
  rincian: Rincian;
  total: number;
  dibayar: number;
  sisa: number;
  /** Pembulatan Tunai, dicatat terpisah dari total. */
  pembulatanTunai: number;
}

/** Baris di daftar Tagihan terbuka. */
export interface TagihanTerbuka extends RingkasTagihan {
  nomorPesanan: string[];
  jumlahItem: number;
}

export interface TagihanLengkap extends RingkasTagihan {
  pesanan: { id: string; nomorPesanan: string; dikirimPada: string; item: ItemPesanan[] }[];
  pembayaran: { id: string; metode: string; jumlah: number; diterima: number; kembalian: number; pembulatan: number; referensi: string | null }[];
}

export interface MejaKasir {
  id: string;
  label: string;
  kapasitas: number;
  aktif: boolean;
  status: string;
  /** Tagihan terbuka yang menempati Meja ini. */
  tagihanId: string | null;
}
