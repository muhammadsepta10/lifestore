import Link from 'next/link';
import { redirect } from 'next/navigation';
import { t } from '../../i18n/id';
import { panggilApi } from '../../lib/api';
import { gayaInput, gayaTombol, gayaTombolSekunder, Kolom, Pesan } from '../kartu';

export const dynamic = 'force-dynamic';

interface Meja {
  id: string;
  label: string;
  kapasitas: number;
  aktif: boolean;
}

interface MetodeBayar {
  jenis: string;
  nama: string;
  keterangan: string | null;
  aktif: boolean;
}

const kartu = { background: 'var(--surface)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', padding: 24 } as const;

async function buatMejaMassal(form: FormData) {
  'use server';
  const outletId = String(form.get('outletId') ?? '');
  const res = await panggilApi(`/v1/outlet/${encodeURIComponent(outletId)}/meja/massal`, {
    method: 'POST',
    body: { dari: Number(form.get('dari')), sampai: Number(form.get('sampai')), kapasitas: Number(form.get('kapasitas')) },
  });
  redirect(`/meja-bayar?outlet=${encodeURIComponent(outletId)}${res.ok ? '' : '&galat=meja'}`);
}

async function ubahMeja(form: FormData) {
  'use server';
  const outletId = String(form.get('outletId') ?? '');
  await panggilApi(`/v1/outlet/${encodeURIComponent(outletId)}/meja/${encodeURIComponent(String(form.get('mejaId') ?? ''))}`, {
    method: 'PATCH',
    body: { aktif: form.get('aktif') === '1' },
  });
  redirect(`/meja-bayar?outlet=${encodeURIComponent(outletId)}`);
}

async function aturMetodeBayar(form: FormData) {
  'use server';
  const outletId = String(form.get('outletId') ?? '');
  const jenis = String(form.get('jenis') ?? '');
  const res = await panggilApi(`/v1/outlet/${encodeURIComponent(outletId)}/metode-bayar/${encodeURIComponent(jenis)}`, {
    method: 'PUT',
    body: { aktif: form.get('aktif') === '1', keterangan: String(form.get('keterangan') ?? '') },
  });
  redirect(`/meja-bayar?outlet=${encodeURIComponent(outletId)}${res.ok ? '' : '&galat=metode'}`);
}

interface PengaturanOutlet {
  pembulatanTunai: { kelipatan: number; arah: string } | null;
  bayarDulu: boolean;
}

const KELIPATAN = [100, 500, 1000] as const;
const ARAH = ['terdekat', 'bawah', 'atas'] as const;

async function aturPembayaranOutlet(form: FormData) {
  'use server';
  const outletId = String(form.get('outletId') ?? '');
  const kelipatan = Number(form.get('kelipatan') ?? 0);
  const res = await panggilApi(`/v1/outlet/${encodeURIComponent(outletId)}`, {
    method: 'PATCH',
    body: {
      pembulatanTunai: kelipatan > 0 ? { kelipatan, arah: String(form.get('arah') ?? 'terdekat') } : null,
      bayarDulu: form.get('bayarDulu') === 'on',
    },
  });
  redirect(`/meja-bayar?outlet=${encodeURIComponent(outletId)}${res.ok ? '' : '&galat=pengaturan'}`);
}

/** Meja, Metode Bayar, Pembulatan Tunai, dan bayar-dulu per Outlet. */
export default async function HalamanMejaBayar({ searchParams }: { searchParams: Promise<{ outlet?: string; galat?: string }> }) {
  const k = t().mejaBayar;
  const { outlet, galat } = await searchParams;
  if (!outlet) redirect('/dashboard');
  const [meja, metode, pengaturan] = await Promise.all([
    panggilApi<Meja[]>(`/v1/outlet/${encodeURIComponent(outlet)}/meja`),
    panggilApi<MetodeBayar[]>(`/v1/outlet/${encodeURIComponent(outlet)}/metode-bayar`),
    panggilApi<PengaturanOutlet>(`/v1/outlet/${encodeURIComponent(outlet)}`),
  ]);
  if (meja.status === 401) redirect('/masuk');

  return (
    <main style={{ maxWidth: 760, margin: '32px auto', padding: '0 16px', display: 'grid', gap: 16 }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, flex: 1 }}>{k.judul}</h1>
        <Link href="/dashboard" style={gayaTombolSekunder}>
          {k.kembali}
        </Link>
      </header>
      {galat ? <Pesan jenis="galat">{galat === 'meja' ? k.galatMeja : galat === 'pengaturan' ? k.galatPengaturan : k.galatMetode}</Pesan> : null}

      {metode.ok ? (
        <section style={kartu}>
          <h2 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 800 }}>{k.metodeBayar}</h2>
          <p style={{ color: 'var(--muted)', margin: '0 0 12px' }}>{k.metodeBayarSub}</p>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 }}>
            {metode.body.map((m) => (
              <li key={m.jenis} style={{ borderTop: '1px solid var(--line)', paddingTop: 8 }}>
                <form action={aturMetodeBayar} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <input type="hidden" name="outletId" value={outlet} />
                  <input type="hidden" name="jenis" value={m.jenis} />
                  <input type="hidden" name="aktif" value={m.aktif ? '0' : '1'} />
                  <b style={{ minWidth: 120 }}>{t().kasir.namaMetodeBayar[m.jenis] ?? m.nama}</b>
                  <input
                    name="keterangan"
                    defaultValue={m.keterangan ?? ''}
                    placeholder={k.keterangan}
                    aria-label={k.keterangan}
                    style={{ ...gayaInput, flex: 1, minWidth: 160, width: 'auto' }}
                  />
                  <span style={{ color: m.aktif ? 'var(--ok)' : 'var(--muted)', fontWeight: 600 }}>{m.aktif ? k.aktif : k.nonaktif}</span>
                  <button type="submit" style={m.aktif ? gayaTombolSekunder : gayaTombol}>
                    {m.aktif ? k.nonaktifkan : k.aktifkan}
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {pengaturan.ok ? (
        <section style={kartu} data-pengaturan-bayar>
          <h2 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 800 }}>{k.pengaturanBayar}</h2>
          <p style={{ color: 'var(--muted)', margin: '0 0 12px' }}>{k.pengaturanBayarSub}</p>
          <form action={aturPembayaranOutlet} style={{ display: 'flex', gap: 12, alignItems: 'end', flexWrap: 'wrap' }}>
            <input type="hidden" name="outletId" value={outlet} />
            <Kolom label={k.kelipatan}>
              <select name="kelipatan" defaultValue={String(pengaturan.body.pembulatanTunai?.kelipatan ?? 0)} style={{ ...gayaInput, width: 180 }}>
                <option value="0">{k.tanpaPembulatan}</option>
                {[...new Set([...KELIPATAN, ...(pengaturan.body.pembulatanTunai ? [pengaturan.body.pembulatanTunai.kelipatan] : [])])].map((n) => (
                  <option key={n} value={n}>
                    Rp{new Intl.NumberFormat('id-ID').format(n)}
                  </option>
                ))}
              </select>
            </Kolom>
            <Kolom label={k.arah}>
              <select name="arah" defaultValue={pengaturan.body.pembulatanTunai?.arah ?? 'terdekat'} style={{ ...gayaInput, width: 150 }}>
                {ARAH.map((a) => (
                  <option key={a} value={a}>
                    {k.arahPilihan[a]}
                  </option>
                ))}
              </select>
            </Kolom>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', minHeight: 44, marginBottom: 12 }}>
              <input type="checkbox" name="bayarDulu" defaultChecked={pengaturan.body.bayarDulu} style={{ width: 18, height: 18 }} />
              {k.bayarDulu}
            </label>
            <button type="submit" style={{ ...gayaTombol, marginBottom: 12 }}>
              {k.simpan}
            </button>
          </form>
        </section>
      ) : null}

      {meja.ok ? (
        <section style={kartu}>
          <h2 style={{ margin: '0 0 12px', fontSize: 18, fontWeight: 800 }}>{k.meja}</h2>
          <form action={buatMejaMassal} style={{ display: 'flex', gap: 8, alignItems: 'end', flexWrap: 'wrap' }}>
            <input type="hidden" name="outletId" value={outlet} />
            <Kolom label={k.dari}>
              <input name="dari" type="number" min={1} defaultValue={1} required style={{ ...gayaInput, width: 90 }} />
            </Kolom>
            <Kolom label={k.sampai}>
              <input name="sampai" type="number" min={1} defaultValue={20} required style={{ ...gayaInput, width: 90 }} />
            </Kolom>
            <Kolom label={k.kapasitas}>
              <input name="kapasitas" type="number" min={1} defaultValue={4} required style={{ ...gayaInput, width: 90 }} />
            </Kolom>
            <button type="submit" style={{ ...gayaTombol, marginBottom: 12 }}>
              {k.buatMassal}
            </button>
          </form>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8 }}>
            {meja.body.map((m) => (
              <li key={m.id} style={{ background: 'var(--surface-2)', borderRadius: 'var(--radius-md)', padding: 12, opacity: m.aktif ? 1 : 0.6 }}>
                <b style={{ fontSize: 18 }}>{m.label}</b> <small style={{ color: 'var(--muted)' }}>{t().kasir.kursi(m.kapasitas)}</small>
                <form action={ubahMeja} style={{ marginTop: 8 }}>
                  <input type="hidden" name="outletId" value={outlet} />
                  <input type="hidden" name="mejaId" value={m.id} />
                  <input type="hidden" name="aktif" value={m.aktif ? '0' : '1'} />
                  <button type="submit" style={gayaTombolSekunder}>
                    {m.aktif ? k.nonaktifkan : k.aktifkan}
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}
