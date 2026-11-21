import Link from 'next/link';
import { redirect } from 'next/navigation';
import { t } from '../../i18n/id';
import { panggilApi } from '../../lib/api';
import { gayaInput, gayaTombol, KartuTengah, Kolom } from '../kartu';

export const dynamic = 'force-dynamic';

/**
 * Undangan baru diterima saat tombol ditekan (POST). Membuka tautannya saja (GET) tidak memakai
 * token, supaya pemindai tautan di email tidak menghabiskannya.
 */
async function terima(form: FormData) {
  'use server';
  const kataSandi = String(form.get('kataSandi') ?? '');
  const res = await panggilApi('/v1/undangan/terima', {
    method: 'POST',
    tanpaSesi: true,
    body: { token: String(form.get('token') ?? ''), ...(kataSandi ? { kataSandi } : {}) },
  });
  redirect(`/undangan?hasil=${res.ok ? 'berhasil' : 'gagal'}`);
}

export default async function HalamanUndangan({ searchParams }: { searchParams: Promise<{ token?: string; hasil?: string }> }) {
  const k = t().undangan;
  const { token, hasil } = await searchParams;
  if (token && !hasil) {
    return (
      <KartuTengah judul={k.judul} sub={k.sub}>
        <form action={terima}>
          <input type="hidden" name="token" value={token} />
          <Kolom label={k.kataSandi}>
            <input name="kataSandi" type="password" minLength={8} autoComplete="new-password" style={gayaInput} />
          </Kolom>
          <p style={{ color: 'var(--muted)', marginTop: 0 }}>{k.kataSandiSub}</p>
          <button type="submit" style={gayaTombol} data-aksi="terima-undangan">
            {k.terima}
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
