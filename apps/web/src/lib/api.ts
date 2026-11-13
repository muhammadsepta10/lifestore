import { cookies } from 'next/headers';
import { urlApiInternal } from './status-api';

export const COOKIE_SESI = 'lifestore_sesi';

export interface HasilApi<T> {
  ok: boolean;
  status: number;
  body: T;
}

/** Panggil API dari server Next.js, membawa token sesi dari cookie bila ada. */
export async function panggilApi<T = unknown>(
  path: string,
  opsi: { method?: string; body?: unknown; tanpaSesi?: boolean } = {},
): Promise<HasilApi<T>> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (!opsi.tanpaSesi) {
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
