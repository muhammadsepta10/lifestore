import Link from 'next/link';
import { redirect } from 'next/navigation';
import { t } from '../../i18n/id';
import { panggilApi } from '../../lib/api';
import { gayaInput, gayaTombol, KartuTengah, Kolom, Pesan } from '../kartu';

export const dynamic = 'force-dynamic';

async function daftar(form: FormData) {
  'use server';
  const res = await panggilApi('/v1/daftar', {
    method: 'POST',
    tanpaSesi: true,
    body: {
      email: String(form.get('email') ?? ''),
      kataSandi: String(form.get('kataSandi') ?? ''),
      namaUsaha: String(form.get('namaUsaha') ?? ''),
      kota: String(form.get('kota') ?? ''),
    },
  });
  redirect(res.ok ? '/daftar?terkirim=1' : `/daftar?galat=${res.status === 409 ? 'terdaftar' : 'gagal'}`);
}

export default async function HalamanDaftar({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const k = t().daftar;
  const q = await searchParams;
  if (q.terkirim) {
    return (
      <KartuTengah judul={k.terkirimJudul}>
        <p>{k.terkirim}</p>
      </KartuTengah>
    );
  }
  return (
    <KartuTengah judul={k.judul} sub={k.sub}>
      {q.galat ? <Pesan jenis="galat">{q.galat === 'terdaftar' ? k.emailTerdaftar : k.gagal}</Pesan> : null}
      <form action={daftar}>
        <Kolom label={k.namaUsaha}>
          <input name="namaUsaha" required maxLength={100} style={gayaInput} />
        </Kolom>
        <Kolom label={k.kota}>
          <input name="kota" required maxLength={100} style={gayaInput} />
        </Kolom>
        <Kolom label={k.email}>
          <input name="email" type="email" required autoComplete="email" style={gayaInput} />
        </Kolom>
        <Kolom label={k.kataSandi}>
          <input name="kataSandi" type="password" required minLength={8} autoComplete="new-password" style={gayaInput} />
        </Kolom>
        <button type="submit" style={{ ...gayaTombol, width: '100%' }}>
          {k.kirim}
        </button>
      </form>
      <p style={{ marginTop: 16, fontSize: 14 }}>
        <Link href="/masuk">{k.sudahPunya}</Link>
      </p>
    </KartuTengah>
  );
}
