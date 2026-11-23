import Link from 'next/link';
import { redirect } from 'next/navigation';
import { t } from '../../i18n/id';
import { panggilApi } from '../../lib/api';
import { gayaTombol, KartuTengah } from '../kartu';

export const dynamic = 'force-dynamic';

/**
 * Token verifikasi baru dipakai saat tombol ditekan (POST). Membuka tautannya saja (GET) tidak
 * memakainya, supaya pemindai tautan di email tidak menghabiskan token sebelum pemiliknya datang.
 */
async function konfirmasi(form: FormData) {
  'use server';
  const res = await panggilApi('/v1/verifikasi-email', { method: 'POST', tanpaSesi: true, body: { token: String(form.get('token') ?? '') } });
  redirect(`/verifikasi?hasil=${res.ok ? 'berhasil' : 'gagal'}`);
}

export default async function HalamanVerifikasi({ searchParams }: { searchParams: Promise<{ token?: string; hasil?: string }> }) {
  const k = t().verifikasi;
  const { token, hasil } = await searchParams;
  if (token && !hasil) {
    return (
      <KartuTengah judul={k.konfirmasiJudul}>
        <p>{k.konfirmasi}</p>
        <form action={konfirmasi}>
          <input type="hidden" name="token" value={token} />
          <button type="submit" style={gayaTombol} data-aksi="verifikasi">
            {k.konfirmasiTombol}
          </button>
        </form>
      </KartuTengah>
    );
  }
  const berhasil = hasil === 'berhasil';
  return (
    <KartuTengah judul={berhasil ? k.berhasilJudul : k.gagalJudul}>
      <p>{berhasil ? k.berhasil : k.gagal}</p>
      <Link href="/masuk" style={{ ...gayaTombol, display: 'inline-block', textDecoration: 'none' }}>
        {k.lanjut}
      </Link>
    </KartuTengah>
  );
}
