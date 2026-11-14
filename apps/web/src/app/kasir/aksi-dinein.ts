'use server';

import { redirect } from 'next/navigation';
import { panggilApi } from '../../lib/api';
import type { HasilPerintah } from './aksi';

type Galat = { kode?: string };

const teks = (form: FormData, kolom: string) => String(form.get(kolom) ?? '');
const keTagihan = (id: string, tambahan = '') => `/kasir?tagihan=${encodeURIComponent(id)}${tambahan}`;

/** Buka Tagihan dine-in di Meja yang dipilih. `id` dari formulir membuat kirim ulang aman. */
export async function bukaTagihanDineIn(form: FormData) {
  const res = await panggilApi<{ id: string } & Galat>('/v1/tagihan', {
    method: 'POST',
    perangkat: true,
    body: { id: teks(form, 'id'), kanal: 'dine_in', mejaId: teks(form, 'mejaId') },
  });
  if (!res.ok) redirect(`/kasir?galat=${res.body?.kode === 'meja_terisi' ? 'meja_terisi' : 'tagihan'}`);
  redirect(keTagihan(res.body.id));
}

/** Pindah Tagihan ke Meja lain yang Kosong. */
export async function pindahMeja(form: FormData) {
  const tagihanId = teks(form, 'tagihanId');
  const res = await panggilApi(`/v1/tagihan/${encodeURIComponent(tagihanId)}/pindah-meja`, {
    method: 'POST',
    perangkat: true,
    body: { mejaId: teks(form, 'mejaId') },
  });
  redirect(keTagihan(tagihanId, res.ok ? '' : '&galat=atur'));
}

/** Gabung Meja (kosong atau terisi Tagihan lain) ke Tagihan ini. */
export async function gabungMeja(form: FormData) {
  const tagihanId = teks(form, 'tagihanId');
  const res = await panggilApi(`/v1/tagihan/${encodeURIComponent(tagihanId)}/gabung-meja`, {
    method: 'POST',
    perangkat: true,
    body: { mejaId: teks(form, 'mejaId') },
  });
  redirect(keTagihan(tagihanId, res.ok ? '' : '&galat=atur'));
}

/** Pisah Tagihan: item yang dicentang pindah ke Tagihan baru, lalu Tagihan baru itu dipilih. */
export async function pisahTagihan(form: FormData) {
  const tagihanId = teks(form, 'tagihanId');
  const res = await panggilApi<{ baru: { id: string } }>(`/v1/tagihan/${encodeURIComponent(tagihanId)}/pisah`, {
    method: 'POST',
    perangkat: true,
    body: { id: teks(form, 'id'), itemIds: form.getAll('itemId').map(String), namaPelanggan: teks(form, 'namaPelanggan') || undefined },
  });
  if (!res.ok) redirect(keTagihan(tagihanId, '&galat=atur'));
  redirect(keTagihan(res.body.baru.id));
}

export interface PermintaanBayar {
  metode: string;
  /** Bagian Tagihan yang dibayar; kosong = melunasi sisanya. */
  jumlah?: number;
  /** Uang yang diterima (tunai). */
  diterima?: number;
  referensi?: string;
}

export type HasilBayar = (HasilPerintah & { ok: true; lunas: boolean }) | (HasilPerintah & { ok: false });

/**
 * Terima satu Pembayaran dengan Metode Bayar apa pun. Total dan kembalian dihitung ulang di API.
 * `id` dibuat di perangkat dan dipakai lagi saat mencoba ulang, sehingga Pembayaran tidak tergandakan.
 */
export async function bayar(tagihanId: string, id: string, data: PermintaanBayar): Promise<HasilBayar> {
  try {
    const res = await panggilApi<{ tagihan?: { status: string } } & Galat>(`/v1/tagihan/${encodeURIComponent(tagihanId)}/pembayaran`, {
      method: 'POST',
      perangkat: true,
      body: { id, ...data },
    });
    if (!res.ok) return { ok: false, kode: res.body?.kode ?? 'gagal' };
    return { ok: true, lunas: res.body.tagihan?.status === 'lunas' };
  } catch {
    return { ok: false, kode: 'gagal' };
  }
}
