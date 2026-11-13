export type Kanal = 'dine_in' | 'bawa_pulang';

/** Harga satu pilihan Grup Pilihan yang tersalin ke Item Pesanan (per satuan item). */
export interface PilihanItem {
  harga: number;
}

/** Item Pesanan sebagaimana tersalin ke Tagihan: harga dan pilihan sudah dibekukan saat dipesan. */
export interface ItemTagihan {
  hargaSatuan: number;
  jumlah: number;
  pilihan?: readonly PilihanItem[];
  /** Item Pesanan berstatus batal tidak ikut dihitung. */
  batal?: boolean;
  /** Menu bertanda bebas pajak: tidak masuk Dasar Pajak. */
  bebasPajak?: boolean;
}

export interface ProfilPajak {
  jenis: 'PBJT' | 'PPN' | 'tidak_dipungut';
  tarifPersen: number;
  hargaTermasukPajak: boolean;
}

export interface AturanServiceCharge {
  tarifPersen: number;
  /** Kanal yang dikenai Service Charge. Default: hanya dine-in. */
  kanal?: readonly Kanal[];
}

/** Diskon Manual pada tingkat Tagihan. */
export type DiskonTagihan = { jenis: 'persen'; nilai: number } | { jenis: 'nominal'; nilai: number };

/** Aturan Pembulatan Tunai Outlet; hanya diberikan bila Tagihan dibayar tunai. */
export interface AturanPembulatanTunai {
  kelipatan: number;
  arah: 'bawah' | 'terdekat' | 'atas';
}

export interface MasukanTagihan {
  items: readonly ItemTagihan[];
  kanal: Kanal;
  profilPajak: ProfilPajak;
  serviceCharge?: AturanServiceCharge | null;
  diskon?: DiskonTagihan | null;
  pembulatanTunai?: AturanPembulatanTunai | null;
}

export interface RincianTagihan {
  subtotal: number;
  diskon: number;
  serviceCharge: number;
  dasarPajak: number;
  pajak: number;
  total: number;
  pembulatanTunai: number;
  totalDibayar: number;
}

export const KANAL_SERVICE_CHARGE_DEFAULT: readonly Kanal[] = ['dine_in'];

/**
 * Hitung Tagihan: satu-satunya tempat angka Tagihan dihitung, dipakai API (sumber kebenaran)
 * dan kasir (tampilan langsung, nanti offline).
 *
 * Urutan: diskon → Service Charge (dari harga setelah diskon, default dine-in saja) → pajak
 * atas Dasar Pajak, dibulatkan ke rupiah sekali per Tagihan.
 *
 * - Item bebas pajak: diskon dan Service Charge dibagi proporsional; hanya bagian item kena
 *   pajak yang masuk Dasar Pajak.
 * - Harga inklusif (`hargaTermasukPajak`): harga Menu sudah termasuk pajak dan Service Charge
 *   (harga nett), sehingga total = subtotal − diskon dan pajak serta Service Charge dihitung mundur.
 *   Pada mode ini `subtotal` adalah jumlah harga bruto.
 * - Pembulatan Tunai hanya diterapkan bila aturannya diberikan (Tagihan dibayar tunai) dan
 *   tidak mengubah `total`; selisihnya dilaporkan terpisah.
 */
export function hitungTagihan(masukan: MasukanTagihan): RincianTagihan {
  const aktif = masukan.items.filter((i) => !i.batal);
  const subtotal = jumlahkan(aktif);
  const subtotalKenaPajak = jumlahkan(aktif.filter((i) => !i.bebasPajak));

  const diskon = hitungDiskon(subtotal, masukan.diskon);
  const setelahDiskon = subtotal - diskon;
  const setelahDiskonKenaPajak = bagiProporsional(setelahDiskon, subtotalKenaPajak, subtotal);

  const sc = masukan.serviceCharge;
  const kenaSc = sc != null && (sc.kanal ?? KANAL_SERVICE_CHARGE_DEFAULT).includes(masukan.kanal);
  const tarifSc = kenaSc ? sc.tarifPersen : 0;
  const { profilPajak } = masukan;
  const tarifPajak = profilPajak.jenis === 'tidak_dipungut' ? 0 : profilPajak.tarifPersen;

  const rincian = profilPajak.hargaTermasukPajak
    ? hitungInklusif(setelahDiskon, setelahDiskonKenaPajak, tarifSc, tarifPajak)
    : hitungEksklusif(setelahDiskon, setelahDiskonKenaPajak, tarifSc, tarifPajak);
  const dasarPajak = tarifPajak === 0 ? 0 : rincian.dasarPajak;

  const totalDibayar = bulatkanTunai(rincian.total, masukan.pembulatanTunai);
  return {
    subtotal,
    diskon,
    serviceCharge: rincian.serviceCharge,
    dasarPajak,
    pajak: rincian.pajak,
    total: rincian.total,
    pembulatanTunai: totalDibayar - rincian.total,
    totalDibayar,
  };
}

interface RincianPajak {
  serviceCharge: number;
  dasarPajak: number;
  pajak: number;
  total: number;
}

function hitungEksklusif(setelahDiskon: number, kenaPajak: number, tarifSc: number, tarifPajak: number): RincianPajak {
  const serviceCharge = persenDari(setelahDiskon, tarifSc);
  const dasarPajak = kenaPajak + persenDari(kenaPajak, tarifSc);
  const pajak = persenDari(dasarPajak, tarifPajak);
  return { serviceCharge, dasarPajak, pajak, total: setelahDiskon + serviceCharge + pajak };
}

function hitungInklusif(setelahDiskon: number, kenaPajak: number, tarifSc: number, tarifPajak: number): RincianPajak {
  const dasarPajak = hitungMundur(kenaPajak, tarifPajak);
  const pajak = kenaPajak - dasarPajak;
  const termasukSc = setelahDiskon - pajak;
  const serviceCharge = termasukSc - hitungMundur(termasukSc, tarifSc);
  return { serviceCharge, dasarPajak, pajak, total: setelahDiskon };
}

function nilaiItem(item: ItemTagihan): number {
  const hargaPilihan = (item.pilihan ?? []).reduce((s, p) => s + p.harga, 0);
  return (item.hargaSatuan + hargaPilihan) * item.jumlah;
}

function hitungDiskon(subtotal: number, diskon: DiskonTagihan | null | undefined): number {
  if (diskon == null) return 0;
  const nilai = diskon.jenis === 'persen' ? persenDari(subtotal, diskon.nilai) : diskon.nilai;
  return Math.min(nilai, subtotal);
}

/** Basis poin (1% = 100) agar tarif seperti 2,5% atau 11% dihitung dengan bilangan bulat. */
function basisPoin(persen: number): number {
  return Math.round(persen * 100);
}

/** `persen`% dari `nilai`, dibulatkan ke rupiah terdekat (setengah ke atas), tanpa galat floating point. */
function persenDari(nilai: number, persen: number): number {
  return Math.floor((nilai * basisPoin(persen) + 5_000) / 10_000);
}

function jumlahkan(items: readonly ItemTagihan[]): number {
  return items.reduce((s, i) => s + nilaiItem(i), 0);
}

/** `nilai × bagian / keseluruhan`, dibulatkan ke rupiah terdekat. */
function bagiProporsional(nilai: number, bagian: number, keseluruhan: number): number {
  if (keseluruhan === 0) return 0;
  if (bagian === keseluruhan) return nilai;
  return Math.floor((2 * nilai * bagian + keseluruhan) / (2 * keseluruhan));
}

function bulatkanTunai(total: number, aturan: AturanPembulatanTunai | null | undefined): number {
  if (aturan == null || aturan.kelipatan <= 1) return total;
  const k = aturan.kelipatan;
  const bawah = Math.floor(total / k) * k;
  if (bawah === total) return total;
  if (aturan.arah === 'bawah') return bawah;
  if (aturan.arah === 'atas') return bawah + k;
  return total - bawah >= k / 2 ? bawah + k : bawah;
}

/** Nilai sebelum ditambah `persen`%: `nilai / (1 + persen/100)`, dibulatkan ke rupiah terdekat. */
function hitungMundur(nilai: number, persen: number): number {
  const penyebut = 10_000 + basisPoin(persen);
  return Math.floor((2 * nilai * 10_000 + penyebut) / (2 * penyebut));
}
