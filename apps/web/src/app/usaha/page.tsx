import Link from 'next/link';
import { redirect } from 'next/navigation';
import { t } from '../../i18n/id';
import { panggilApi } from '../../lib/api';
import { gayaInput, gayaTombol, gayaTombolSekunder, Kolom, Pesan } from '../kartu';

export const dynamic = 'force-dynamic';

interface Merek {
  id: string;
  nama: string;
  utama: boolean;
}

interface Outlet {
  id: string;
  merekId: string;
  nama: string;
  kota: string;
}

const kartu = { background: 'var(--surface)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', padding: 24 } as const;
const teks = (form: FormData, kolom: string) => String(form.get(kolom) ?? '').trim();

async function ubahMerek(form: FormData) {
  'use server';
  const res = await panggilApi(`/v1/merek/${encodeURIComponent(teks(form, 'merekId'))}`, { method: 'PATCH', body: { nama: teks(form, 'nama') } });
  redirect(`/usaha?${res.ok ? 'info=tersimpan' : 'galat=1'}`);
}

async function tambahOutlet(form: FormData) {
  'use server';
  const res = await panggilApi('/v1/outlet', { method: 'POST', body: { nama: teks(form, 'nama'), kota: teks(form, 'kota'), merekId: teks(form, 'merekId') || undefined } });
  redirect(`/usaha?${res.ok ? 'info=tersimpan' : 'galat=1'}`);
}

/** Merek (ubah nama) dan daftar Outlet (tambah Outlet kedua dan seterusnya). */
export default async function HalamanUsaha({ searchParams }: { searchParams: Promise<{ galat?: string; info?: string }> }) {
  const k = t().usaha;
  const { galat, info } = await searchParams;
  const [merek, outlet] = await Promise.all([panggilApi<Merek[]>('/v1/merek'), panggilApi<Outlet[]>('/v1/outlet')]);
  if (merek.status === 401) redirect('/masuk');
  if (!merek.ok || !outlet.ok) redirect('/dashboard');

  return (
    <main style={{ maxWidth: 760, margin: '32px auto', padding: '0 16px', display: 'grid', gap: 16 }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, flex: 1 }}>{k.judul}</h1>
        <Link href="/dashboard" style={gayaTombolSekunder}>
          {k.kembali}
        </Link>
      </header>
      {galat ? <Pesan jenis="galat">{k.galat}</Pesan> : null}
      {info ? <Pesan jenis="info">{k.tersimpan}</Pesan> : null}

      <section style={kartu} data-merek>
        <h2 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 800 }}>{k.merek}</h2>
        <p style={{ color: 'var(--muted)', margin: '0 0 12px' }}>{k.merekSub}</p>
        {merek.body.map((m) => (
          <form key={m.id} action={ubahMerek} style={{ display: 'flex', gap: 8, alignItems: 'end', flexWrap: 'wrap' }}>
            <input type="hidden" name="merekId" value={m.id} />
            <Kolom label={k.namaMerek}>
              <input name="nama" defaultValue={m.nama} required maxLength={100} style={{ ...gayaInput, width: 280 }} />
            </Kolom>
            <button type="submit" style={{ ...gayaTombol, marginBottom: 12 }}>
              {k.simpan}
            </button>
          </form>
        ))}
      </section>

      <section style={kartu} data-outlet>
        <h2 style={{ margin: '0 0 12px', fontSize: 18, fontWeight: 800 }}>{k.outlet}</h2>
        <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 16px', display: 'grid', gap: 8 }}>
          {outlet.body.map((o) => (
            <li key={o.id} style={{ display: 'flex', gap: 12, alignItems: 'center', borderTop: '1px solid var(--line)', paddingTop: 8 }} data-outlet-id={o.id}>
              <b style={{ flex: 1 }}>{o.nama}</b>
              <small style={{ color: 'var(--muted)' }}>{o.kota}</small>
              <Link href={`/outlet?outlet=${o.id}`} style={gayaTombolSekunder}>
                {k.atur}
              </Link>
            </li>
          ))}
        </ul>
        <h3 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 800 }}>{k.tambahOutlet}</h3>
        <p style={{ color: 'var(--muted)', margin: '0 0 12px' }}>{k.tambahOutletSub}</p>
        <form action={tambahOutlet} style={{ display: 'flex', gap: 8, alignItems: 'end', flexWrap: 'wrap' }}>
          <input type="hidden" name="merekId" value={merek.body.find((m) => m.utama)?.id ?? ''} />
          <Kolom label={k.nama}>
            <input name="nama" required maxLength={100} style={{ ...gayaInput, width: 220 }} />
          </Kolom>
          <Kolom label={k.kota}>
            <input name="kota" required maxLength={100} style={{ ...gayaInput, width: 180 }} />
          </Kolom>
          <button type="submit" style={{ ...gayaTombol, marginBottom: 12 }}>
            {k.tambah}
          </button>
        </form>
      </section>
    </main>
  );
}
