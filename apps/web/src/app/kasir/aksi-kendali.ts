'use server';

import { panggilApi } from '../../lib/api';

/** Bukti Persetujuan Atasan: atasan memilih namanya dan mengetik PIN di perangkat yang sama. */
export interface Persetujuan {
  anggotaId: string;
  pin: string;
}

export type HasilKendali = { ok: true } | { ok: false; kode: string; batasPersen?: number };

async function perintah(path: string, method: 'POST' | 'PUT' | 'DELETE', body?: Record<string, unknown>): Promise<HasilKendali> {
  try {
    const res = await panggilApi<{ kode?: string; batasPersen?: number } | null>(path, { method, perangkat: true, body: body ?? {} });
    return res.ok ? { ok: true } : { ok: false, kode: res.body?.kode ?? 'gagal', batasPersen: res.body?.batasPersen };
  } catch {
    return { ok: false, kode: 'gagal' };
  }
}

const tagihanUrl = (id: string) => `/v1/tagihan/${encodeURIComponent(id)}`;

export async function batalItem(tagihanId: string, itemId: string, alasan: string, persetujuanAtasan?: Persetujuan) {
  return perintah(`${tagihanUrl(tagihanId)}/item/${encodeURIComponent(itemId)}/batal`, 'POST', { alasan: alasan || undefined, persetujuanAtasan });
}

export async function batalTagihan(tagihanId: string) {
  return perintah(tagihanUrl(tagihanId), 'DELETE');
}

/** `id` dibuat di perangkat dan dipakai lagi saat mencoba ulang, sehingga perintah tidak dijalankan dua kali. */
export async function voidTagihan(tagihanId: string, id: string, alasan: string, persetujuanAtasan?: Persetujuan) {
  return perintah(`${tagihanUrl(tagihanId)}/void`, 'POST', { id, alasan, persetujuanAtasan });
}

export async function pasangDiskon(tagihanId: string, id: string, jenis: 'persen' | 'nominal', nilai: number, alasan: string, persetujuanAtasan?: Persetujuan) {
  return perintah(`${tagihanUrl(tagihanId)}/diskon`, 'PUT', { id, jenis, nilai, alasan, persetujuanAtasan });
}

export async function hapusDiskon(tagihanId: string) {
  return perintah(`${tagihanUrl(tagihanId)}/diskon`, 'DELETE');
}

export async function bukaLaci(id: string, alasan: string, persetujuanAtasan?: Persetujuan) {
  return perintah('/v1/laci/buka', 'POST', { id, alasan, persetujuanAtasan });
}

/** Tandai Pesanan bawa pulang sudah diambil pelanggan (item siap → disajikan). */
export async function tandaiDiambil(itemIds: string[]) {
  return perintah('/v1/kds/status', 'POST', { itemIds, status: 'disajikan' });
}
