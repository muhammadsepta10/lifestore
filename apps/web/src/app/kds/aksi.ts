'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { panggilApi } from '../../lib/api';

/** Stasiun pilihan layar dapur ini, diingat per perangkat. Kosong = semua Stasiun. */
const COOKIE_STASIUN = 'lifestore_stasiun_kds';

const teks = (form: FormData, kolom: string) => String(form.get(kolom) ?? '');

export async function stasiunTersimpan(): Promise<string | undefined> {
  return (await cookies()).get(COOKIE_STASIUN)?.value || undefined;
}

/** Pilih Stasiun untuk layar ini (atau semua). Pilihan bertahan sampai diganti. */
export async function pilihStasiun(form: FormData) {
  const stasiun = teks(form, 'stasiun');
  const jar = await cookies();
  if (stasiun) jar.set(COOKIE_STASIUN, stasiun, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 365 * 24 * 3600 });
  else jar.delete(COOKIE_STASIUN);
  redirect('/kds');
}

export async function masukPinKds(form: FormData) {
  const res = await panggilApi('/v1/perangkat/masuk', {
    method: 'POST',
    perangkat: true,
    body: { anggotaId: teks(form, 'anggotaId'), pin: teks(form, 'pin') },
  });
  redirect(res.ok ? '/kds' : '/kds?galat=pin');
}

export async function keluarKds() {
  await panggilApi('/v1/perangkat/keluar', { method: 'POST', perangkat: true });
  redirect('/kds');
}

/** Majukan status sekumpulan Item Pesanan (satu baris gabungan, satu chip, atau satu Pesanan siap). */
export async function majukanStatus(form: FormData) {
  const itemIds = teks(form, 'itemIds').split(',').filter(Boolean);
  await panggilApi('/v1/kds/status', { method: 'POST', perangkat: true, body: { itemIds, status: teks(form, 'status') } });
  redirect('/kds');
}
