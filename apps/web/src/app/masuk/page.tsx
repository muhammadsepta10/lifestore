import { cookies } from 'next/headers';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { t } from '../../i18n/id';
import { COOKIE_SESI, panggilApi } from '../../lib/api';
import { gayaInput, gayaTombol, KartuTengah, Kolom, Pesan } from '../kartu';

export const dynamic = 'force-dynamic';

async function masuk(form: FormData) {
  'use server';
  const res = await panggilApi<{ token: string; tenantAktifId: string | null; kode?: string }>('/v1/masuk', {
    method: 'POST',
    tanpaSesi: true,
    body: { email: String(form.get('email') ?? ''), kataSandi: String(form.get('kataSandi') ?? '') },
  });
  if (!res.ok) redirect(`/masuk?galat=${res.body?.kode === 'email_belum_terverifikasi' ? 'verifikasi' : 'salah'}`);
  (await cookies()).set(COOKIE_SESI, res.body.token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 30 * 24 * 3600,
  });
  redirect(res.body.tenantAktifId ? '/dashboard' : '/pilih-tenant');
}

export default async function HalamanMasuk({ searchParams }: { searchParams: Promise<{ galat?: string }> }) {
  const k = t().masuk;
  const { galat } = await searchParams;
  return (
    <KartuTengah judul={k.judul}>
      {galat ? <Pesan jenis="galat">{galat === 'verifikasi' ? k.belumVerifikasi : k.salah}</Pesan> : null}
      <form action={masuk}>
        <Kolom label={k.email}>
          <input name="email" type="email" required autoComplete="email" style={gayaInput} />
        </Kolom>
        <Kolom label={k.kataSandi}>
          <input name="kataSandi" type="password" required autoComplete="current-password" style={gayaInput} />
        </Kolom>
        <button type="submit" style={{ ...gayaTombol, width: '100%' }}>
          {k.kirim}
        </button>
      </form>
      <p style={{ marginTop: 16, fontSize: 14 }}>
        <Link href="/daftar">{k.belumPunya}</Link>
      </p>
    </KartuTengah>
  );
}
