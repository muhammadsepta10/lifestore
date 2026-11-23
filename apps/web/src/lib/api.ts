import { cookies } from 'next/headers';
import { urlApiInternal } from './status-api';

export const COOKIE_SESI = 'lifestore_sesi';
/** Token Perangkat Terdaftar (kasir/KDS), disimpan di perangkat sebagai cookie httpOnly. */
export const COOKIE_PERANGKAT = 'lifestore_perangkat';

export interface HasilApi<T> {
  ok: boolean;
  status: number;
  body: T;
}

/**
 * Panggil API dari server Next.js, membawa token sesi dari cookie bila ada.
 * `perangkat: true` memakai token Perangkat Terdaftar (`Authorization: Perangkat`) untuk layar kasir.
 */
export async function panggilApi<T = unknown>(
  path: string,
  opsi: { method?: string; body?: unknown; tanpaSesi?: boolean; perangkat?: boolean } = {},
): Promise<HasilApi<T>> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (opsi.perangkat) {
    const token = (await cookies()).get(COOKIE_PERANGKAT)?.value;
    if (token) headers.Authorization = `Perangkat ${token}`;
  } else if (!opsi.tanpaSesi) {
    const token = (await cookies()).get(COOKIE_SESI)?.value;
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  const res = await fetch(`${urlApiInternal()}${path}`, {
    method: opsi.method ?? 'GET',
    headers,
    body: opsi.body === undefined ? undefined : JSON.stringify(opsi.body),
    cache: 'no-store',
  });
  const teks = await res.text();
  return { ok: res.ok, status: res.status, body: (teks ? JSON.parse(teks) : null) as T };
}
