import Link from 'next/link';
import { redirect } from 'next/navigation';
import { t } from '../../i18n/id';
import { panggilApi } from '../../lib/api';
import { gayaInput, gayaTombol, gayaTombolSekunder, Kolom, Pesan } from '../kartu';

export const dynamic = 'force-dynamic';

interface TagihanTertutup {
  id: string;
  kanal: string;
  meja: { id: string; label: string }[];
  namaPelanggan: string | null;
  nomorNota: number | null;
  ditutupPada: string | null;
  total: number;
  pembulatanTunai: number;
  jumlahItem: number;
  metodeBayar: string[];
}

interface DetailTagihan {
  id: string;
  kanal: string;
  meja: { id: string; label: string }[];
  namaPelanggan: string | null;
  nomorNota: number | null;
  ditutupPada: string | null;
  profilPajak: { jenis: string; tarifPersen: number; labelStruk: string };
  rincian: { subtotal: number; diskon: number; serviceCharge: number; pajak: number; total: number };
  pembulatanTunai: number;
  pesanan: {
    id: string;
    nomorPesanan: string;
    item: { id: string; nama: string; namaVarian: string | null; jumlah: number; hargaSatuan: number; pilihan: { nama: string; harga: number }[]; status: string }[];
  }[];
  pembayaran: { id: string; metode: string; jumlah: number; diterima: number; kembalian: number; referensi: string | null }[];
}

const kartu = { background: 'var(--surface)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', padding: 24 } as const;
const angka = { fontVariantNumeric: 'tabular-nums' } as const;
const rp = (n: number) => `Rp${new Intl.NumberFormat('id-ID').format(n)}`;
const jam = (iso: string | null) => (iso ? new Intl.DateTimeFormat('id-ID', { timeStyle: 'short', timeZone: 'Asia/Jakarta' }).format(new Date(iso)) : '');

/** Daftar Tagihan tertutup per Outlet per tanggal (default hari ini) dengan detailnya. */
export default async function HalamanPenjualan({ searchParams }: { searchParams: Promise<{ outlet?: string; tanggal?: string; tagihan?: string }> }) {
  const k = t().penjualan;
  const { outlet, tanggal, tagihan } = await searchParams;
  if (!outlet) redirect('/dashboard');
  const dasar = `/v1/outlet/${encodeURIComponent(outlet)}/tagihan`;
  const tanggalSah = tanggal && /^\d{4}-\d{2}-\d{2}$/.test(tanggal) ? tanggal : undefined;
  const [daftar, detail] = await Promise.all([
    panggilApi<TagihanTertutup[]>(`${dasar}${tanggalSah ? `?tanggal=${tanggalSah}` : ''}`),
    tagihan ? panggilApi<DetailTagihan>(`${dasar}/${encodeURIComponent(tagihan)}`) : Promise.resolve(undefined),
  ]);
  if (daftar.status === 401) redirect('/masuk');
  if (!daftar.ok) redirect('/dashboard');
  const ke = (id?: string) => {
    const q = new URLSearchParams({ outlet });
    if (tanggalSah) q.set('tanggal', tanggalSah);
    if (id) q.set('tagihan', id);
    return `/penjualan?${q.toString()}`;
  };
  const siapa = (x: { meja: { label: string }[]; namaPelanggan: string | null; kanal: string }) =>
    [k.kanal[x.kanal] ?? x.kanal, x.meja.length > 0 ? k.meja(x.meja.map((m) => m.label).join(' + ')) : null, x.namaPelanggan].filter(Boolean).join(' · ');
  const total = daftar.body.reduce((s, x) => s + x.total, 0);

  return (
    <main style={{ maxWidth: 760, margin: '32px auto', padding: '0 16px', display: 'grid', gap: 16 }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, flex: 1 }}>{k.judul}</h1>
        <Link href="/dashboard" style={gayaTombolSekunder}>
          {k.kembali}
        </Link>
      </header>

      <section style={kartu}>
        <form method="get" action="/penjualan" style={{ display: 'flex', gap: 8, alignItems: 'end', flexWrap: 'wrap' }}>
          <input type="hidden" name="outlet" value={outlet} />
          <Kolom label={k.tanggal}>
            <input type="date" name="tanggal" defaultValue={tanggalSah} style={{ ...gayaInput, width: 180 }} />
          </Kolom>
          <button type="submit" style={{ ...gayaTombol, marginBottom: 12 }}>
            {k.tampilkan}
          </button>
          <b style={{ ...angka, marginLeft: 'auto', marginBottom: 12, fontSize: 20 }} data-total-hari={total}>
            {rp(total)}
          </b>
        </form>
        {daftar.body.length === 0 ? (
          <p style={{ color: 'var(--muted)', margin: 0 }}>{k.kosong}</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {daftar.body.map((x) => (
              <li key={x.id} style={{ borderTop: '1px solid var(--line)' }}>
                <Link
                  href={ke(x.id)}
                  data-tagihan={x.id}
                  aria-current={tagihan === x.id ? 'true' : undefined}
                  style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '12px 0', minHeight: 44, color: 'inherit', textDecoration: 'none', flexWrap: 'wrap' }}
                >
                  <b style={angka}>{k.nota(x.nomorNota ?? 0)}</b>
                  <small style={{ color: 'var(--muted)' }}>{jam(x.ditutupPada)}</small>
                  <span style={{ flex: 1, minWidth: 120 }}>{siapa(x)}</span>
                  <small style={{ color: 'var(--muted)' }}>
                    {k.jumlahItem(x.jumlahItem)} · {x.metodeBayar.map((m) => k.metode[m] ?? m).join(' + ')}
                  </small>
                  <b style={angka}>{rp(x.total)}</b>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {detail && !detail.ok ? <Pesan jenis="galat">{k.tidakDitemukan}</Pesan> : null}
      {detail?.ok ? (
        <section style={kartu} data-detail-tagihan={detail.body.id}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, flex: 1 }}>
              {k.detail} · {k.nota(detail.body.nomorNota ?? 0)}
            </h2>
            <Link href={ke()} style={gayaTombolSekunder}>
              {k.tutupDetail}
            </Link>
          </div>
          <p style={{ color: 'var(--muted)', margin: '4px 0 12px' }}>
            {siapa(detail.body)} · {jam(detail.body.ditutupPada)}
          </p>
          {detail.body.pesanan.map((p) => (
            <div key={p.id} style={{ borderTop: '1px solid var(--line)', padding: '8px 0' }}>
              <small style={{ color: 'var(--muted)', fontWeight: 600 }}>{k.pesanan(p.nomorPesanan)}</small>
              <ul style={{ listStyle: 'none', padding: 0, margin: '4px 0 0', display: 'grid', gap: 4 }}>
                {p.item.map((i) => (
                  <li key={i.id} style={{ display: 'flex', gap: 8, textDecoration: i.status === 'batal' ? 'line-through' : undefined }}>
                    <span style={{ flex: 1 }}>
                      {i.jumlah}× {i.nama}
                      {[i.namaVarian, ...i.pilihan.map((x) => x.nama)].filter(Boolean).length > 0 ? (
                        <small style={{ color: 'var(--muted)' }}> · {[i.namaVarian, ...i.pilihan.map((x) => x.nama)].filter(Boolean).join(' · ')}</small>
                      ) : null}
                      {i.status === 'batal' ? <small style={{ color: 'var(--danger)' }}> {k.batal}</small> : null}
                    </span>
                    <span style={angka}>{rp((i.hargaSatuan + i.pilihan.reduce((n, x) => n + x.harga, 0)) * i.jumlah)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <dl style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '4px 16px', margin: 0, borderTop: '1px solid var(--line)', paddingTop: 12 }}>
            <dt style={{ color: 'var(--muted)' }}>{k.subtotal}</dt>
            <dd style={{ ...angka, margin: 0, textAlign: 'right' }}>{rp(detail.body.rincian.subtotal)}</dd>
            {detail.body.rincian.diskon > 0 ? (
              <>
                <dt style={{ color: 'var(--muted)' }}>{k.diskon}</dt>
                <dd style={{ ...angka, margin: 0, textAlign: 'right' }}>−{rp(detail.body.rincian.diskon)}</dd>
              </>
            ) : null}
            {detail.body.rincian.serviceCharge > 0 ? (
              <>
                <dt style={{ color: 'var(--muted)' }}>{k.serviceCharge}</dt>
                <dd style={{ ...angka, margin: 0, textAlign: 'right' }}>{rp(detail.body.rincian.serviceCharge)}</dd>
              </>
            ) : null}
            {detail.body.profilPajak.jenis !== 'tidak_dipungut' ? (
              <>
                <dt style={{ color: 'var(--muted)' }}>
                  {detail.body.profilPajak.labelStruk} {detail.body.profilPajak.tarifPersen}%
                </dt>
                <dd style={{ ...angka, margin: 0, textAlign: 'right' }}>{rp(detail.body.rincian.pajak)}</dd>
              </>
            ) : null}
            <dt style={{ fontWeight: 800 }}>{k.total}</dt>
            <dd style={{ ...angka, margin: 0, textAlign: 'right', fontWeight: 800 }} data-total={detail.body.rincian.total}>
              {rp(detail.body.rincian.total)}
            </dd>
            {detail.body.pembulatanTunai !== 0 ? (
              <>
                <dt style={{ color: 'var(--muted)' }}>{k.pembulatan}</dt>
                <dd style={{ ...angka, margin: 0, textAlign: 'right' }}>
                  {detail.body.pembulatanTunai > 0 ? '+' : '−'}
                  {rp(Math.abs(detail.body.pembulatanTunai))}
                </dd>
              </>
            ) : null}
          </dl>
          <h3 style={{ fontSize: 15, fontWeight: 800, margin: '16px 0 4px' }}>{k.pembayaran}</h3>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 4 }}>
            {detail.body.pembayaran.map((b) => (
              <li key={b.id} style={{ display: 'flex', gap: 8 }} data-pembayaran={b.metode}>
                <span style={{ flex: 1 }}>
                  {k.metode[b.metode] ?? b.metode}
                  {b.referensi ? (
                    <small style={{ color: 'var(--muted)' }}>
                      {' '}
                      · {k.referensi} {b.referensi}
                    </small>
                  ) : null}
                  {b.kembalian > 0 ? (
                    <small style={{ color: 'var(--muted)' }}>
                      {' '}
                      · {k.kembalian} {rp(b.kembalian)}
                    </small>
                  ) : null}
                </span>
                <span style={angka}>{rp(b.jumlah)}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}
