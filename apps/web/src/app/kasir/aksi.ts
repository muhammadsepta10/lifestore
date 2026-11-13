'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { COOKIE_PERANGKAT, panggilApi } from '../../lib/api';

type Galat = { kode?: string };

/** "Rp 1.250.000" atau "1250000" → 1250000; kosong → null (API menolak dengan 400). */
function rupiah(v: FormDataEntryValue | null): number | null {
  const angka = String(v ?? '').replace(/\D/g, '');
  return angka ? Number(angka) : null;
}

const teks = (form: FormData, kolom: string) => String(form.get(kolom) ?? '');

/** Tukar kode pendaftaran sekali pakai dengan token perangkat, disimpan sebagai cookie httpOnly. */
export async function daftarPerangkat(form: FormData) {
  const res = await panggilApi<{ tokenPerangkat: string }>('/v1/perangkat/daftar', {
    method: 'POST',
    tanpaSesi: true,
    body: { kode: teks(form, 'kode') },
  });
  if (!res.ok) redirect('/kasir?galat=kode');
  (await cookies()).set(COOKIE_PERANGKAT, res.body.tokenPerangkat, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 365 * 24 * 3600,
  });
  redirect('/kasir');
}

/** Lupakan token perangkat yang sudah dicabut atau tidak dikenal. */
export async function lupakanPerangkat() {
  (await cookies()).delete(COOKIE_PERANGKAT);
  redirect('/kasir');
}

export async function masukPin(form: FormData) {
  const res = await panggilApi<Galat>('/v1/perangkat/masuk', {
    method: 'POST',
    perangkat: true,
    body: { anggotaId: teks(form, 'anggotaId'), pin: teks(form, 'pin') },
  });
  if (!res.ok) {
    const kode = res.body?.kode;
    const galat = kode === 'pin_terkunci' ? 'terkunci' : kode === 'tidak_ditugaskan' ? 'tidak_ditugaskan' : kode === 'pin_salah' ? 'salah' : 'gagal';
    redirect(`/kasir?galat=${galat}`);
  }
  redirect('/kasir');
}

export async function keluarKasir() {
  await panggilApi('/v1/perangkat/keluar', { method: 'POST', perangkat: true });
  redirect('/kasir');
}

/** Buka Shift. `id` dibuat saat formulir dirender, jadi kirim ulang tidak membuka Shift kedua. */
export async function bukaShift(form: FormData) {
  const res = await panggilApi<Galat>('/v1/shift', {
    method: 'POST',
    perangkat: true,
    body: { id: teks(form, 'id'), kasAwal: rupiah(form.get('kasAwal')) },
  });
  if (res.status === 409) redirect('/kasir?galat=sudah_terbuka');
  if (!res.ok) redirect('/kasir?modal=buka-shift&galat=shift');
  redirect('/kasir');
}

export async function catatKas(form: FormData) {
  const shiftId = encodeURIComponent(teks(form, 'shiftId'));
  const res = await panggilApi(`/v1/shift/${shiftId}/kas`, {
    method: 'POST',
    perangkat: true,
    body: { id: teks(form, 'id'), jenis: teks(form, 'jenis'), jumlah: rupiah(form.get('jumlah')), alasan: teks(form, 'alasan') },
  });
  if (!res.ok) redirect('/kasir?modal=kas&galat=shift');
  redirect('/kasir?info=tersimpan');
}

/** Tutup Shift dengan Hitung Buta, lalu tampilkan Laporan Shift. */
export async function tutupShift(form: FormData) {
  const shiftId = teks(form, 'shiftId');
  const res = await panggilApi(`/v1/shift/${encodeURIComponent(shiftId)}/tutup`, {
    method: 'POST',
    perangkat: true,
    body: { hitungButa: rupiah(form.get('hitungButa')) },
  });
  if (!res.ok) redirect('/kasir?modal=tutup-shift&galat=shift');
  redirect(`/kasir?laporan=${encodeURIComponent(shiftId)}`);
}

export async function ubahMeja(form: FormData) {
  const mejaId = encodeURIComponent(teks(form, 'mejaId'));
  const aksi = teks(form, 'aktif') === '1' ? 'aktifkan' : 'nonaktifkan';
  await panggilApi(`/v1/kasir/meja/${mejaId}/${aksi}`, { method: 'POST', perangkat: true });
  redirect('/kasir');
}
