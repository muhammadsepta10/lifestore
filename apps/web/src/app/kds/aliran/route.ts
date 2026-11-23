import { cookies } from 'next/headers';
import { COOKIE_PERANGKAT } from '../../../lib/api';
import { urlApiInternal } from '../../../lib/status-api';

export const dynamic = 'force-dynamic';

/**
 * Meneruskan aliran kejadian dapur (SSE) dari API ke browser. Token Perangkat Terdaftar ada di
 * cookie httpOnly, jadi EventSource di browser tidak bisa memanggil API langsung.
 */
export async function GET(req: Request) {
  const token = (await cookies()).get(COOKIE_PERANGKAT)?.value;
  if (!token) return new Response(null, { status: 401 });
  const asal = new URL(req.url);
  const tujuan = new URL(`${urlApiInternal()}/v1/kds/aliran`);
  for (const kunci of ['stasiun', 'sejak']) {
    const v = asal.searchParams.get(kunci);
    if (v) tujuan.searchParams.set(kunci, v);
  }
  const headers: Record<string, string> = { Authorization: `Perangkat ${token}`, Accept: 'text/event-stream' };
  const terakhir = req.headers.get('last-event-id');
  if (terakhir) headers['Last-Event-ID'] = terakhir;
  const res = await fetch(tujuan, { headers, cache: 'no-store', signal: req.signal });
  if (!res.ok || !res.body) return new Response(null, { status: res.status === 200 ? 502 : res.status });
  return new Response(res.body, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no' },
  });
}
