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

interface PenjualanHariIni {
  tanggal: string;
  penjualan: number;
  jumlahTagihan: number;
  pembulatanTunai: number;
  perMetodeBayar?: { jenis: string; jumlah: number; nilai: number }[];
}

const rp = (n: number) => `Rp${new Intl.NumberFormat('id-ID').format(n)}`;

interface Dashboard {
  tenant: { id: string; nama: string };
  penjualanHariIni: PenjualanHariIni;
  masaCoba: { paketLangganan: string; berakhirPada: string; sisaHari: number } | null;
  outlet: {
    id: string;
    nama: string;
    penjualanHariIni: PenjualanHariIni;
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

      <section style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', padding: 24 }} data-hari-ini>
        <h2 style={{ margin: '0 0 12px', fontSize: 18, fontWeight: 800 }}>
          {k.hariIni.judul}
          {d.outlet.length > 1 ? ` · ${k.hariIni.semuaOutlet}` : ''}
        </h2>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          <div>
            <small style={{ color: 'var(--muted)' }}>{k.hariIni.penjualan}</small>
            <div style={{ fontSize: 28, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }} data-penjualan={d.penjualanHariIni.penjualan}>
              {rp(d.penjualanHariIni.penjualan)}
            </div>
          </div>
          <div>
            <small style={{ color: 'var(--muted)' }}>{k.hariIni.jumlahTagihan}</small>
            <div style={{ fontSize: 28, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }} data-jumlah-tagihan={d.penjualanHariIni.jumlahTagihan}>
              {d.penjualanHariIni.jumlahTagihan}
            </div>
          </div>
        </div>
        <div style={{ display: 'grid', gap: 12, marginTop: 16 }}>
          {d.outlet.map((o) => (
            <div key={o.id} style={{ borderTop: '1px solid var(--line)', paddingTop: 12 }} data-outlet-hari-ini={o.id}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                <b style={{ flex: 1 }}>{o.nama}</b>
                <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>{rp(o.penjualanHariIni.penjualan)}</span>
                <small style={{ color: 'var(--muted)' }}>
                  {o.penjualanHariIni.jumlahTagihan} {k.hariIni.jumlahTagihan.toLowerCase()}
                </small>
                <Link href={`/penjualan?outlet=${o.id}`} style={gayaTombolSekunder}>
                  {k.hariIni.lihatTagihan}
                </Link>
              </div>
              {o.penjualanHariIni.jumlahTagihan === 0 ? (
                <small style={{ color: 'var(--muted)' }}>{k.hariIni.belumAda}</small>
              ) : (
                <ul style={{ listStyle: 'none', padding: 0, margin: '8px 0 0', display: 'flex', gap: 8, flexWrap: 'wrap' }} aria-label={k.hariIni.perMetode}>
                  {(o.penjualanHariIni.perMetodeBayar ?? []).map((m) => (
                    <li key={m.jenis} style={{ background: 'var(--surface-2)', borderRadius: 'var(--radius-sm)', padding: '6px 10px', fontSize: 14 }} data-metode={m.jenis}>
                      {t().kasir.namaMetodeBayar[m.jenis] ?? m.jenis} <b style={{ fontVariantNumeric: 'tabular-nums' }}>{rp(m.nilai)}</b>{' '}
                      <small style={{ color: 'var(--muted)' }}>{k.hariIni.kaliBayar(m.jumlah)}</small>
                    </li>
                  ))}
                  {o.penjualanHariIni.pembulatanTunai !== 0 ? (
                    <li style={{ background: 'var(--surface-2)', borderRadius: 'var(--radius-sm)', padding: '6px 10px', fontSize: 14 }}>
                      {k.hariIni.pembulatan} <b style={{ fontVariantNumeric: 'tabular-nums' }}>{rp(o.penjualanHariIni.pembulatanTunai)}</b>
                    </li>
                  ) : null}
                </ul>
              )}
            </div>
          ))}
        </div>
      </section>

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
                {l.langkah === 'menu' || l.langkah === 'stasiun' ? (
                  <Link href={`/menu?outlet=${o.id}`} style={gayaTombolSekunder}>
                    {k.atur}
                  </Link>
                ) : null}
                {l.langkah === 'meja' || l.langkah === 'metode_bayar' ? (
                  <Link href={`/meja-bayar?outlet=${o.id}`} style={gayaTombolSekunder}>
                    {k.atur}
                  </Link>
                ) : null}
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
