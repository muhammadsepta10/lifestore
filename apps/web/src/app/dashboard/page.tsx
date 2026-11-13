import { cookies } from 'next/headers';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { t } from '../../i18n/id';
import { COOKIE_SESI, panggilApi } from '../../lib/api';
import { gayaTombolSekunder } from '../kartu';

export const dynamic = 'force-dynamic';

interface LangkahSiapJualan {
  langkah: string;
  status: 'selesai' | 'belum' | 'dilewati';
  wajibUntukKasir: boolean;
}

interface Dashboard {
  tenant: { id: string; nama: string };
  masaCoba: { paketLangganan: string; berakhirPada: string; sisaHari: number } | null;
  outlet: {
    id: string;
    nama: string;
    siapJualan: { selesai: number; total: number; langkah: LangkahSiapJualan[]; kasir: { siap: boolean } };
  }[];
}

async function ubahLewati(form: FormData) {
  'use server';
  const outletId = encodeURIComponent(String(form.get('outletId') ?? ''));
  const langkah = encodeURIComponent(String(form.get('langkah') ?? ''));
  const batal = form.get('batal') === '1';
  await panggilApi(`/v1/outlet/${outletId}/siap-jualan/${langkah}/lewati`, { method: batal ? 'DELETE' : 'POST' });
  redirect('/dashboard');
}

async function keluar() {
  'use server';
  await panggilApi('/v1/keluar', { method: 'POST' });
  (await cookies()).delete(COOKIE_SESI);
  redirect('/masuk');
}

const WARNA_STATUS = {
  selesai: { bg: 'var(--ok-soft)', fg: 'var(--ok)' },
  belum: { bg: 'var(--surface-2)', fg: 'var(--muted)' },
  dilewati: { bg: 'var(--warn-soft)', fg: 'var(--warn)' },
} as const;

export default async function HalamanDashboard() {
  const k = t().dashboard;
  const res = await panggilApi<Dashboard & { kode?: string }>('/v1/dashboard');
  if (res.status === 401) redirect('/masuk');
  if (res.status === 403 && res.body.kode === 'tenant_belum_dipilih') redirect('/pilih-tenant');
  const d = res.body;

  return (
    <main style={{ maxWidth: 760, margin: '32px auto', padding: '0 16px', display: 'grid', gap: 16 }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, flex: 1 }}>{d.tenant.nama}</h1>
        {d.masaCoba ? (
          <span
            data-testid="masa-coba"
            style={{
              borderRadius: 999,
              padding: '6px 14px',
              fontWeight: 700,
              fontSize: 14,
              background: d.masaCoba.sisaHari > 0 ? 'var(--accent-soft)' : 'var(--danger-soft)',
              color: d.masaCoba.sisaHari > 0 ? 'var(--accent-strong)' : 'var(--danger)',
            }}
          >
            {d.masaCoba.sisaHari > 0 ? k.masaCoba(d.masaCoba.sisaHari) : k.masaCobaHabis}
          </span>
        ) : null}
        <Link href="/pilih-tenant" style={{ fontSize: 14 }}>
          {k.gantiUsaha}
        </Link>
        <form action={keluar}>
          <button type="submit" style={gayaTombolSekunder}>
            {k.keluar}
          </button>
        </form>
      </header>

      {d.outlet.map((o) => (
        <section
          key={o.id}
          style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', padding: 24 }}
        >
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>
            {k.siapJualan} · {o.nama}
          </h2>
          <p style={{ color: 'var(--muted)', margin: '4px 0 12px' }}>{k.kemajuan(o.siapJualan.selesai, o.siapJualan.total)}</p>
          <p
            style={{
              padding: '8px 12px',
              borderRadius: 'var(--radius-sm)',
              background: o.siapJualan.kasir.siap ? 'var(--ok-soft)' : 'var(--info-soft)',
              color: o.siapJualan.kasir.siap ? 'var(--ok)' : 'var(--info)',
            }}
          >
            {o.siapJualan.kasir.siap ? k.kasirSiap : k.kasirBelum}
          </p>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 }}>
            {o.siapJualan.langkah.map((l) => (
              <li key={l.langkah} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderTop: '1px solid var(--line)' }}>
                <span style={{ flex: 1 }}>
                  {k.langkah[l.langkah] ?? l.langkah}
                  {l.wajibUntukKasir ? <small style={{ color: 'var(--muted)', marginLeft: 8 }}>{k.wajibKasir}</small> : null}
                </span>
                <span
                  style={{
                    borderRadius: 999,
                    padding: '2px 10px',
                    fontSize: 13,
                    fontWeight: 600,
                    background: WARNA_STATUS[l.status].bg,
                    color: WARNA_STATUS[l.status].fg,
                  }}
                >
                  {k.status[l.status]}
                </span>
                {l.status !== 'selesai' ? (
                  <form action={ubahLewati}>
                    <input type="hidden" name="outletId" value={o.id} />
                    <input type="hidden" name="langkah" value={l.langkah} />
                    {l.status === 'dilewati' ? <input type="hidden" name="batal" value="1" /> : null}
                    <button type="submit" style={gayaTombolSekunder}>
                      {l.status === 'dilewati' ? k.batalLewati : k.lewati}
                    </button>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </main>
  );
}
