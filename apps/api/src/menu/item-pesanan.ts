import { ConflictException } from '@nestjs/common';
import type { TxDb } from '../database/database';
import { tidakValid } from '../umum/validasi';
import { menuDiOutlet } from './menu-outlet.controller';

/** Permintaan kasir untuk satu Menu: Varian (wajib bila Menu punya Varian) dan pilihan Grup Pilihan. */
export interface PermintaanItemPesanan {
  menuId: string;
  varianId?: string | null;
  pilihanIds?: string[];
}

/**
 * Salinan Menu untuk Item Pesanan: nama dan harga yang berlaku di Outlet saat ini. Disimpan apa
 * adanya di Item Pesanan, sehingga perubahan Menu atau harga sesudahnya tidak mengubah Tagihan.
 * `hargaSatuan`, `pilihan[].harga`, dan `bebasPajak` langsung cocok dengan item `hitungTagihan`.
 */
export interface SalinanItemPesanan {
  menuId: string;
  nama: string;
  varianId: string | null;
  namaVarian: string | null;
  /** Harga satu unit: harga Varian (atau Menu) yang berlaku di Outlet, sudah termasuk override. */
  hargaSatuan: number;
  /** Pilihan Grup Pilihan per unit; harga 0 = gratis. */
  pilihan: { pilihanId: string; grupPilihanId: string; nama: string; harga: number }[];
  bebasPajak: boolean;
  /** Stasiun yang menerima item ini di Outlet, atau null bila Menu belum dipetakan. */
  stasiunId: string | null;
}

function pesananDitolak(kode: string, pesan: string): ConflictException {
  return new ConflictException({ kode, pesan });
}

/**
 * Memeriksa bahwa Menu bisa dipesan di Outlet dan menyalin harganya.
 * - 404 bila Menu tidak ada / bukan milik Merek Outlet (termasuk milik Tenant lain).
 * - 409 `menu_nonaktif` atau `menu_habis`.
 * - 400 bila Varian tidak tepat satu atau jumlah pilihan melanggar minimum/maksimum Grup Pilihan.
 * Harus dipanggil di dalam transaksi Tenant.
 */
export async function siapkanItemPesanan(tx: TxDb, outletId: string, p: PermintaanItemPesanan): Promise<SalinanItemPesanan> {
  if (typeof p?.menuId !== 'string' || p.menuId === '') throw tidakValid('menuId', 'Wajib diisi.');
  const m = await menuDiOutlet(tx, outletId, p.menuId);
  if (!m.aktif) throw pesananDitolak('menu_nonaktif', `${m.nama} sudah tidak dijual.`);
  if (m.habis) throw pesananDitolak('menu_habis', `${m.nama} sedang habis di Outlet ini.`);

  let varianDipilih: { id: string; nama: string; harga: number } | null = null;
  if (m.varian.length > 0) {
    varianDipilih = m.varian.find((v) => v.id === p.varianId) ?? null;
    if (!varianDipilih) throw tidakValid('varianId', 'Pilih tepat satu Varian Menu ini.');
  } else if (p.varianId !== undefined && p.varianId !== null) {
    throw tidakValid('varianId', 'Menu ini tidak punya Varian.');
  }

  const pilihanIds = p.pilihanIds ?? [];
  if (!Array.isArray(pilihanIds) || pilihanIds.some((id) => typeof id !== 'string')) throw tidakValid('pilihanIds', 'Harus daftar ID.');
  if (new Set(pilihanIds).size !== pilihanIds.length) throw tidakValid('pilihanIds', 'Pilihan tidak boleh berulang.');
  const semuaPilihan = new Map(m.grupPilihan.flatMap((g) => g.pilihan.map((pl) => [pl.id, { ...pl, grupPilihanId: g.id }] as const)));
  const dipilih = pilihanIds.map((id) => {
    const pl = semuaPilihan.get(id);
    if (!pl) throw tidakValid('pilihanIds', 'Pilihan bukan milik Menu ini.');
    return pl;
  });
  for (const g of m.grupPilihan) {
    const jumlah = dipilih.filter((pl) => pl.grupPilihanId === g.id).length;
    if (jumlah < g.minimum || jumlah > g.maksimum) {
      throw tidakValid('pilihanIds', `${g.nama}: pilih ${g.minimum === g.maksimum ? g.minimum : `${g.minimum}–${g.maksimum}`}.`);
    }
  }

  // Urutan pilihan mengikuti urutan Grup Pilihan dan pilihan di Menu, bukan urutan permintaan.
  const urutan = [...semuaPilihan.keys()];
  dipilih.sort((a, b) => urutan.indexOf(a.id) - urutan.indexOf(b.id));
  return {
    menuId: m.id,
    nama: m.nama,
    varianId: varianDipilih?.id ?? null,
    namaVarian: varianDipilih?.nama ?? null,
    hargaSatuan: varianDipilih?.harga ?? m.harga,
    pilihan: dipilih.map((pl) => ({ pilihanId: pl.id, grupPilihanId: pl.grupPilihanId, nama: pl.nama, harga: pl.harga })),
    bebasPajak: m.bebasPajak,
    stasiunId: m.stasiunId,
  };
}
