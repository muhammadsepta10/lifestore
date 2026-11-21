import Link from 'next/link';
import { redirect } from 'next/navigation';
import { t } from '../../i18n/id';
import { panggilApi } from '../../lib/api';
import { gayaInput, gayaTombol, gayaTombolSekunder, Kolom, Pesan } from '../kartu';

export const dynamic = 'force-dynamic';

interface Outlet {
  id: string;
  nama: string;
  kota: string;
  alamat: string | null;
  logoUrl: string | null;
  jamBuka: { hari: number; buka: string; tutup: string }[];
}

interface ProfilPajak {
  id: string;
  berlakuMulai: string;
  jenis: string;
  tarifPersen: number;
  labelStruk: string;
  hargaTermasukPajak: boolean;
  serviceCharge: { tarifPersen: number; kanal: string[] };
}

const kartu = { background: 'var(--surface)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', padding: 24 } as const;
const teks = (form: FormData, kolom: string) => String(form.get(kolom) ?? '').trim();
const JENIS_PAJAK = ['PBJT', 'PPN', 'tidak_dipungut'] as const;
const KANAL = ['dine_in', 'bawa_pulang'] as const;
const HARI = [1, 2, 3, 4, 5, 6, 7] as const;

const kembali = (outletId: string, ok: boolean) => `/outlet?outlet=${encodeURIComponent(outletId)}&${ok ? 'info=tersimpan' : 'galat=1'}`;

async function simpanProfil(form: FormData) {
  'use server';
  const outletId = teks(form, 'outletId');
  const buka = teks(form, 'buka');
  const tutup = teks(form, 'tutup');
  const hari = form.getAll('hari').map(Number);
  const res = await panggilApi(`/v1/outlet/${encodeURIComponent(outletId)}`, {
    method: 'PATCH',
    body: {
      nama: teks(form, 'nama'),
      kota: teks(form, 'kota'),
      alamat: teks(form, 'alamat') || null,
      logoUrl: teks(form, 'logoUrl') || null,
      jamBuka: buka && tutup ? hari.map((h) => ({ hari: h, buka, tutup })) : [],
    },
  });
  redirect(kembali(outletId, res.ok));
}

async function simpanPajak(form: FormData) {
  'use server';
  const outletId = teks(form, 'outletId');
  const jenis = teks(form, 'jenis');
  const res = await panggilApi(`/v1/outlet/${encodeURIComponent(outletId)}/profil-pajak`, {
    method: 'POST',
    body: {
      berlakuMulai: teks(form, 'berlakuMulai'),
      jenis,
      tarifPersen: jenis === 'tidak_dipungut' ? 0 : Number(teks(form, 'tarifPersen').replace(',', '.')),
      labelStruk: teks(form, 'labelStruk') || undefined,
      hargaTermasukPajak: form.get('hargaTermasukPajak') === 'on',
      serviceCharge: { tarifPersen: Number(teks(form, 'serviceCharge').replace(',', '.') || 0), kanal: form.getAll('kanal').map(String) },
    },
  });
  redirect(kembali(outletId, res.ok));
}

/** Profil Outlet (nama, alamat, kota, jam buka, logo) dan Profil Pajak bertanggal berlaku. */
export default async function HalamanOutlet({ searchParams }: { searchParams: Promise<{ outlet?: string; galat?: string; info?: string }> }) {
  const k = t().profilOutlet;
  const { outlet, galat, info } = await searchParams;
  if (!outlet) redirect('/usaha');
  const id = encodeURIComponent(outlet);
  const [profil, pajak, riwayat] = await Promise.all([
    panggilApi<Outlet>(`/v1/outlet/${id}`),
    panggilApi<ProfilPajak>(`/v1/outlet/${id}/profil-pajak`),
    panggilApi<ProfilPajak[]>(`/v1/outlet/${id}/profil-pajak/riwayat`),
  ]);
  if (profil.status === 401) redirect('/masuk');
  if (!profil.ok) redirect('/dashboard');
  const o = profil.body;
  const jam = o.jamBuka[0];
  const hariBuka = new Set(o.jamBuka.map((j) => j.hari));
  const hariIni = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date());
  const ringkas = (p: ProfilPajak) =>
    `${k.ringkas(k.jenisPilihan[p.jenis] ?? p.jenis, p.tarifPersen, p.serviceCharge.tarifPersen)}${p.hargaTermasukPajak ? ` · ${k.termasuk}` : ''}`;

  return (
    <main style={{ maxWidth: 760, margin: '32px auto', padding: '0 16px', display: 'grid', gap: 16 }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, flex: 1 }}>
          {k.judul} · {o.nama}
        </h1>
        <Link href="/dashboard" style={gayaTombolSekunder}>
          {k.kembali}
        </Link>
      </header>
      {galat ? <Pesan jenis="galat">{k.galat}</Pesan> : null}
      {info ? <Pesan jenis="info">{k.tersimpan}</Pesan> : null}

      <section style={kartu} data-profil-outlet>
        <h2 style={{ margin: '0 0 12px', fontSize: 18, fontWeight: 800 }}>{k.profil}</h2>
        <form action={simpanProfil}>
          <input type="hidden" name="outletId" value={o.id} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0 12px' }}>
            <Kolom label={k.nama}>
              <input name="nama" defaultValue={o.nama} required maxLength={100} style={gayaInput} />
            </Kolom>
            <Kolom label={k.kota}>
              <input name="kota" defaultValue={o.kota} required maxLength={100} style={gayaInput} />
            </Kolom>
          </div>
          <Kolom label={k.alamat}>
            <input name="alamat" defaultValue={o.alamat ?? ''} maxLength={500} style={gayaInput} />
          </Kolom>
          <Kolom label={k.logoUrl}>
            <input name="logoUrl" type="url" defaultValue={o.logoUrl ?? ''} placeholder="https://" style={gayaInput} />
          </Kolom>
          <fieldset style={{ border: 'none', padding: 0, margin: '0 0 12px' }}>
            <legend style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{k.jamBuka}</legend>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <input name="buka" type="time" defaultValue={jam?.buka ?? ''} aria-label={k.buka} style={{ ...gayaInput, width: 130 }} />
              <input name="tutup" type="time" defaultValue={jam?.tutup ?? ''} aria-label={k.tutup} style={{ ...gayaInput, width: 130 }} />
              {HARI.map((h) => (
                <label key={h} style={{ display: 'flex', gap: 4, alignItems: 'center', minHeight: 44 }}>
                  <input type="checkbox" name="hari" value={h} defaultChecked={o.jamBuka.length === 0 || hariBuka.has(h)} />
                  {k.hari[h - 1]}
                </label>
              ))}
            </div>
          </fieldset>
          <button type="submit" style={gayaTombol}>
            {k.simpan}
          </button>
        </form>
      </section>

      {pajak.ok ? (
        <section style={kartu} data-profil-pajak>
          <h2 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 800 }}>{k.pajak}</h2>
          <p style={{ color: 'var(--muted)', margin: '0 0 12px' }}>{k.pajakSub}</p>
          <p data-pajak-berlaku>
            <b>{k.berlakuSekarang}:</b> {ringkas(pajak.body)}
          </p>
          <form action={simpanPajak}>
            <input type="hidden" name="outletId" value={o.id} />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0 12px' }}>
              <Kolom label={k.berlakuMulai}>
                <input name="berlakuMulai" type="date" defaultValue={hariIni} required style={gayaInput} />
              </Kolom>
              <Kolom label={k.jenis}>
                <select name="jenis" defaultValue={pajak.body.jenis} style={gayaInput}>
                  {JENIS_PAJAK.map((j) => (
                    <option key={j} value={j}>
                      {k.jenisPilihan[j]}
                    </option>
                  ))}
                </select>
              </Kolom>
              <Kolom label={k.tarif}>
                <input name="tarifPersen" inputMode="decimal" defaultValue={String(pajak.body.tarifPersen)} required style={gayaInput} />
              </Kolom>
              <Kolom label={k.labelStruk}>
                <input name="labelStruk" defaultValue={pajak.body.labelStruk} maxLength={20} style={gayaInput} />
              </Kolom>
              <Kolom label={k.serviceCharge}>
                <input name="serviceCharge" inputMode="decimal" defaultValue={String(pajak.body.serviceCharge.tarifPersen)} style={gayaInput} />
              </Kolom>
            </div>
            <fieldset style={{ border: 'none', padding: 0, margin: '0 0 12px' }}>
              <legend style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{k.serviceChargeKanal}</legend>
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                {KANAL.map((kn) => (
                  <label key={kn} style={{ display: 'flex', gap: 6, alignItems: 'center', minHeight: 44 }}>
                    <input type="checkbox" name="kanal" value={kn} defaultChecked={pajak.body.serviceCharge.kanal.includes(kn)} />
                    {k.kanal[kn]}
                  </label>
                ))}
              </div>
            </fieldset>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', minHeight: 44, marginBottom: 12 }}>
              <input type="checkbox" name="hargaTermasukPajak" defaultChecked={pajak.body.hargaTermasukPajak} style={{ width: 18, height: 18 }} />
              {k.hargaTermasukPajak}
            </label>
            <button type="submit" style={gayaTombol}>
              {k.simpanPajak}
            </button>
          </form>
          {riwayat.ok ? (
            <>
              <h3 style={{ margin: '20px 0 8px', fontSize: 16, fontWeight: 800 }}>{k.riwayat}</h3>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 6 }} data-riwayat-pajak>
                {riwayat.body.map((p) => (
                  <li key={p.id} style={{ display: 'flex', gap: 12, borderTop: '1px solid var(--line)', paddingTop: 6 }}>
                    <b style={{ fontVariantNumeric: 'tabular-nums' }}>{p.berlakuMulai}</b>
                    <span>{ringkas(p)}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </section>
      ) : null}
    </main>
  );
}
