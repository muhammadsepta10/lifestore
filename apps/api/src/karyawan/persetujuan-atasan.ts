import { ForbiddenException, Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { Database } from '../database/database';
import { type Izin, muatAnggota, type Pelaku, punyaIzin } from '../izin/izin';
import { Jam } from '../umum/jam';
import { objek, teks, tidakValid } from '../umum/validasi';
import { pinValid, verifikasiPin } from './pin';

/** Bukti Persetujuan Atasan: Anggota berwenang memasukkan PIN-nya di perangkat yang sama. */
export interface BuktiPersetujuan {
  anggotaId: string;
  pin: string;
}

/** Baca `persetujuanAtasan: { anggotaId, pin }` dari body (opsional). */
export function buktiPersetujuanDari(v: unknown): BuktiPersetujuan | undefined {
  if (v === undefined || v === null) return undefined;
  const m = objek(v);
  if (typeof m.anggotaId !== 'string') throw tidakValid('persetujuanAtasan.anggotaId', 'Wajib diisi.');
  return { anggotaId: teks(m, 'anggotaId', { maks: 64 }), pin: pinValid(m, 'pin') };
}

/**
 * Persetujuan Atasan untuk aksi sensitif (void, batal setelah dimasak, Diskon Manual di atas
 * batas, buka laci tanpa transaksi). Dipanggil di dalam transaksi request; PIN diperiksa di
 * transaksinya sendiri sehingga kunci PIN tetap berlaku walau aksi ditolak.
 * Hasilnya `penyetujuAnggotaId` untuk `PenulisLogAudit.catat`.
 */
@Injectable()
export class PersetujuanAtasan {
  constructor(
    private readonly db: Database,
    private readonly jam: Jam,
  ) {}

  /**
   * Pastikan aksi bersensitif `izin` di `outletId` disetujui. Pelaku yang punya izin itu sendiri
   * tidak perlu bukti (penyetujunya dirinya). Selain itu wajib `bukti` dari Anggota berwenang.
   * Melempar 403 `perlu_persetujuan_atasan`, 401 `pin_salah`, 423 `pin_terkunci`, atau
   * 403 `persetujuan_ditolak`.
   */
  async pastikan(pelaku: Pelaku, izin: Izin, outletId: string, bukti?: BuktiPersetujuan): Promise<{ penyetujuAnggotaId: string }> {
    if (!bukti) {
      if (punyaIzin(pelaku, izin, outletId)) return { penyetujuAnggotaId: pelaku.anggotaId };
      throw new ForbiddenException({ kode: 'perlu_persetujuan_atasan', izin, pesan: 'Aksi ini butuh Persetujuan Atasan (PIN).' });
    }
    return this.periksa(bukti, izin, outletId);
  }

  /** Periksa bukti PIN atasan: PIN benar, Anggota aktif, dan Perannya di Outlet itu memuat `izin`. */
  async periksa(bukti: BuktiPersetujuan, izin: Izin, outletId: string): Promise<{ penyetujuAnggotaId: string }> {
    const tx = this.db.tenant();
    const [{ tenantId } = { tenantId: null }] = (await tx.execute<{ tenantId: string }>(sql`select app_tenant_id() as "tenantId"`)).rows;
    if (!tenantId) throw new Error('Persetujuan Atasan harus dipanggil di dalam transaksi Tenant.');
    await verifikasiPin(this.db, { tenantId, outletId }, bukti.anggotaId, bukti.pin, this.jam.sekarang());
    const penyetuju = await muatAnggota(tx, { anggotaId: bukti.anggotaId });
    if (!penyetuju || !punyaIzin(penyetuju, izin, outletId)) {
      throw new ForbiddenException({ kode: 'persetujuan_ditolak', izin, pesan: 'Anggota ini tidak berwenang menyetujui aksi ini.' });
    }
    return { penyetujuAnggotaId: penyetuju.anggotaId };
  }
}
