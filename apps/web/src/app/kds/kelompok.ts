/** Bentuk respons `GET /v1/kds` dan pengelompokan varian B "Per item per stasiun". */

export interface ItemKds {
  id: string;
  pesananId: string;
  nomorPesanan: string;
  dikirimPada: string;
  kanal: 'dine_in' | 'bawa_pulang';
  namaPelanggan: string | null;
  nama: string;
  namaVarian: string | null;
  pilihan: string[];
  jumlah: number;
  catatan: string | null;
  stasiunId: string | null;
  status: 'menunggu' | 'dimasak' | 'siap' | 'disajikan' | 'batal';
}

export interface LayarKds {
  stasiunId: string | null;
  stasiun: { id: string; nama: string }[];
  sekarang: string;
  urutan: number;
  item: ItemKds[];
  siapDiserahkan: {
    pesananId: string;
    nomorPesanan: string;
    kanal: 'dine_in' | 'bawa_pulang';
    namaPelanggan: string | null;
    item: { id: string; nama: string; jumlah: number; status: string }[];
  }[];
}

/** Satu baris gabungan: item yang sama (Menu, Varian, pilihan, status) dijumlahkan lintas Pesanan. */
export interface Kelompok {
  kunci: string;
  status: ItemKds['status'];
  nama: string;
  rincian: string;
  catatan: string | null;
  alergi: boolean;
  jumlah: number;
  /** Item penyusunnya, terlama dulu; tiap item menjadi chip Nomor Pesanan. */
  item: ItemKds[];
  tertua: number;
}

const ALERGI = /alergi/i;

/**
 * Kelompokkan item satu Stasiun. Item bercatatan tidak digabung dengan Pesanan lain, supaya
 * catatan (misal alergi) tidak tertukar. Baris alergi di atas, lalu yang paling lama menunggu.
 */
export function kelompokkan(item: readonly ItemKds[]): Kelompok[] {
  const peta = new Map<string, Kelompok>();
  for (const i of item) {
    const rincian = [i.namaVarian, ...i.pilihan.map((x) => `+ ${x}`)].filter(Boolean).join(' · ');
    const kunci = [i.status, i.nama, rincian, i.catatan ?? '', i.catatan ? i.pesananId : ''].join('|');
    const waktu = new Date(i.dikirimPada).getTime();
    const k = peta.get(kunci) ?? { kunci, status: i.status, nama: i.nama, rincian, catatan: i.catatan, alergi: ALERGI.test(i.catatan ?? ''), jumlah: 0, item: [], tertua: waktu };
    k.jumlah += i.jumlah;
    k.item.push(i);
    k.tertua = Math.min(k.tertua, waktu);
    peta.set(kunci, k);
  }
  return [...peta.values()].sort((a, b) => Number(b.alergi) - Number(a.alergi) || a.tertua - b.tertua);
}

/** Menit sejak Pesanan dikirim, dan tingkat chip: kuning setelah 10 menit, merah setelah 15 menit. */
export function umurChip(dikirimPada: string, sekarang: string): { menit: number; tingkat: '' | 'warn' | 'late' } {
  const menit = Math.max(0, Math.floor((new Date(sekarang).getTime() - new Date(dikirimPada).getTime()) / 60_000));
  return { menit, tingkat: menit >= 15 ? 'late' : menit >= 10 ? 'warn' : '' };
}
