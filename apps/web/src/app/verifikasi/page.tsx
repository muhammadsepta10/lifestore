import Link from 'next/link';
import { t } from '../../i18n/id';
import { panggilApi } from '../../lib/api';
import { gayaTombol, KartuTengah } from '../kartu';

export const dynamic = 'force-dynamic';

export default async function HalamanVerifikasi({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const k = t().verifikasi;
  const { token } = await searchParams;
  const res = token
    ? await panggilApi('/v1/verifikasi-email', { method: 'POST', tanpaSesi: true, body: { token } })
    : { ok: false };
  return (
    <KartuTengah judul={res.ok ? k.berhasilJudul : k.gagalJudul}>
      <p>{res.ok ? k.berhasil : k.gagal}</p>
      <Link href="/masuk" style={{ ...gayaTombol, display: 'inline-block', textDecoration: 'none' }}>
        {k.lanjut}
      </Link>
    </KartuTengah>
  );
}
