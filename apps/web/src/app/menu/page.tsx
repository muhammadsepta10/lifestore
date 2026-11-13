import { PASTEL_KATEGORI } from '@lifestore/ui';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { CSSProperties, ReactNode } from 'react';
import { t } from '../../i18n/id';
import { panggilApi } from '../../lib/api';
import { gayaInput, gayaTombol, gayaTombolSekunder, Kolom, Pesan } from '../kartu';

export const dynamic = 'force-dynamic';

interface Kategori {
  id: string;
  nama: string;
  warna: keyof typeof PASTEL_KATEGORI;
  ikon: string | null;
}
interface Menu {
  id: string;
  kategoriId: string;
  nama: string;
  harga: number;
  aktif: boolean;
  bebasPajak: boolean;
  varian: { id: string; nama: string; harga: number }[];
  grupPilihan: { id: string; nama: string; minimum: number; maksimum: number; pilihan: { nama: string; harga: number }[] }[];
}
interface MenuDiOutlet extends Menu {
  stasiunId: string | null;
  habis: boolean;
}
interface Outlet {
  id: string;
  merekId: string;
  nama: string;
}

const rupiah = (n: number) => `Rp${n.toLocaleString('id-ID')}`;
const teks = (f: FormData, k: string) => String(f.get(k) ?? '').trim();

/** Kembali ke halaman dengan pesan galat API (bila ada). */
async function lanjut(outletId: string, res?: { ok: boolean; body: unknown }): Promise<never> {
  const q = new URLSearchParams({ outlet: outletId });
  if (res && !res.ok) q.set('galat', String((res.body as { pesan?: string } | null)?.pesan ?? 'error'));
  redirect(`/menu?${q.toString()}`);
}

/** "Reguler = 18000" per baris. */
function bacaVarian(isi: string) {
  return isi
    .split('\n')
    .map((b) => b.trim())
    .filter(Boolean)
    .map((b) => {
      const [nama, harga] = b.split('=');
      return { nama: (nama ?? '').trim(), harga: Number((harga ?? '').trim()) };
    });
}

/** "Topping | 0 | 2 | Boba=5000, Cincau=4000" per baris. */
function bacaGrupPilihan(isi: string) {
  return isi
    .split('\n')
    .map((b) => b.trim())
    .filter(Boolean)
    .map((b) => {
      const [nama, min, maks, daftar] = b.split('|').map((x) => x.trim());
      return {
        nama,
        minimum: Number(min),
        maksimum: Number(maks),
        pilihan: (daftar ?? '')
          .split(',')
          .map((p) => p.trim())
          .filter(Boolean)
          .map((p) => {
            const [n, h] = p.split('=');
            return { nama: (n ?? '').trim(), harga: Number((h ?? '0').trim()) };
          }),
      };
    });
}

async function tambahKategori(f: FormData) {
  'use server';
  const res = await panggilApi(`/v1/merek/${encodeURIComponent(teks(f, 'merekId'))}/kategori`, {
    method: 'POST',
    body: { nama: teks(f, 'nama'), warna: teks(f, 'warna'), ikon: teks(f, 'ikon') || undefined },
  });
  await lanjut(teks(f, 'outletId'), res);
}

async function urutkanKategori(f: FormData) {
  'use server';
  const res = await panggilApi(`/v1/merek/${encodeURIComponent(teks(f, 'merekId'))}/kategori/urutan`, {
    method: 'PUT',
    body: { ids: teks(f, 'ids').split(',') },
  });
  await lanjut(teks(f, 'outletId'), res);
}

async function tambahMenu(f: FormData) {
  'use server';
  const res = await panggilApi(`/v1/merek/${encodeURIComponent(teks(f, 'merekId'))}/menu`, {
    method: 'POST',
    body: {
      kategoriId: teks(f, 'kategoriId'),
      nama: teks(f, 'nama'),
      harga: Number(teks(f, 'harga')),
      deskripsi: teks(f, 'deskripsi') || undefined,
      fotoUrl: teks(f, 'fotoUrl') || undefined,
      bebasPajak: f.get('bebasPajak') === 'on',
      varian: bacaVarian(teks(f, 'varian')),
      grupPilihan: bacaGrupPilihan(teks(f, 'grupPilihan')),
    },
  });
  await lanjut(teks(f, 'outletId'), res);
}

async function ubahAktif(f: FormData) {
  'use server';
  const res = await panggilApi(`/v1/menu/${encodeURIComponent(teks(f, 'menuId'))}`, {
    method: 'PATCH',
    body: { aktif: teks(f, 'aktif') === '1' },
  });
  await lanjut(teks(f, 'outletId'), res);
}

async function tambahStasiun(f: FormData) {
  'use server';
  const res = await panggilApi(`/v1/outlet/${encodeURIComponent(teks(f, 'outletId'))}/stasiun`, {
    method: 'POST',
    body: { nama: teks(f, 'nama') },
  });
  await lanjut(teks(f, 'outletId'), res);
}

/** Simpan pengaturan satu Menu di Outlet: Stasiun dan harga Outlet. */
async function simpanMenuOutlet(f: FormData) {
  'use server';
  const outletId = teks(f, 'outletId');
  const url = `/v1/outlet/${encodeURIComponent(outletId)}/menu/${encodeURIComponent(teks(f, 'menuId'))}`;
  const s = await panggilApi(`${url}/stasiun`, { method: 'PUT', body: { stasiunId: teks(f, 'stasiunId') || null } });
  if (!s.ok) await lanjut(outletId, s);
  const hargaBaru = teks(f, 'harga');
  if (hargaBaru !== teks(f, 'hargaLama')) {
    const h = await panggilApi(`${url}/harga`, { method: 'PUT', body: { harga: hargaBaru === '' ? null : Number(hargaBaru) } });
    if (!h.ok) await lanjut(outletId, h);
  }
  await lanjut(outletId);
}

async function ubahHabis(f: FormData) {
  'use server';
  const outletId = teks(f, 'outletId');
  const res = await panggilApi(`/v1/outlet/${encodeURIComponent(outletId)}/menu/${encodeURIComponent(teks(f, 'menuId'))}/habis`, {
    method: 'PUT',
    body: { habis: teks(f, 'habis') === '1' },
  });
  await lanjut(outletId, res);
}

const gayaKartu: CSSProperties = { background: 'var(--surface)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', padding: 24 };

function Kartu({ judul, children }: { judul: string; children: ReactNode }) {
  return (
    <section style={gayaKartu}>
      <h2 style={{ margin: '0 0 12px', fontSize: 18, fontWeight: 800 }}>{judul}</h2>
      {children}
    </section>
  );
}

function Tersembunyi({ nilai }: { nilai: Record<string, string> }) {
  return (
    <>
      {Object.entries(nilai).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
    </>
  );
}

export default async function HalamanMenu({ searchParams }: { searchParams: Promise<{ outlet?: string; galat?: string }> }) {
  const k = t().menu;
  const q = await searchParams;
  const daftarOutlet = await panggilApi<Outlet[]>('/v1/outlet');
  if (daftarOutlet.status === 401) redirect('/masuk');
  if (daftarOutlet.status === 403) redirect('/pilih-tenant');
  const outlet = daftarOutlet.body.find((o) => o.id === q.outlet) ?? daftarOutlet.body[0]!;
  const merekId = outlet.merekId;
  const [kategori, menu, dijual, stasiun] = await Promise.all([
    panggilApi<Kategori[]>(`/v1/merek/${merekId}/kategori`),
    panggilApi<Menu[]>(`/v1/merek/${merekId}/menu`),
    panggilApi<{ menu: MenuDiOutlet[] }>(`/v1/outlet/${outlet.id}/menu`),
    panggilApi<{ id: string; nama: string }[]>(`/v1/outlet/${outlet.id}/stasiun`),
  ]);
  const diOutlet = new Map(dijual.body.menu.map((m) => [m.id, m]));
  const dasar = { merekId, outletId: outlet.id };
  const idKategori = kategori.body.map((x) => x.id);

  return (
    <main style={{ maxWidth: 960, margin: '32px auto', padding: '0 16px', display: 'grid', gap: 16 }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <Link href="/dashboard">{k.kembali}</Link>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, flex: 1 }}>{k.judul}</h1>
        <nav style={{ display: 'flex', gap: 8 }}>
          {daftarOutlet.body.map((o) => (
            <Link key={o.id} href={`/menu?outlet=${o.id}`} style={{ fontWeight: o.id === outlet.id ? 800 : 400 }}>
              {o.nama}
            </Link>
          ))}
        </nav>
      </header>
      {q.galat ? <Pesan jenis="galat">{k.gagal(q.galat)}</Pesan> : null}

      <Kartu judul={k.kategori}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          {kategori.body.map((x, i) => (
            <span
              key={x.id}
              style={{ background: PASTEL_KATEGORI[x.warna], color: '#1f2933', borderRadius: 12, padding: '8px 12px', display: 'flex', gap: 6, alignItems: 'center' }}
            >
              {x.ikon} {x.nama}
              {i > 0 ? (
                <form action={urutkanKategori}>
                  <Tersembunyi nilai={{ ...dasar, ids: [...idKategori.slice(0, i - 1), x.id, idKategori[i - 1]!, ...idKategori.slice(i + 1)].join(',') }} />
                  <button type="submit" style={{ ...gayaTombolSekunder, padding: '0 6px' }} aria-label={k.naik}>
                    {k.naik}
                  </button>
                </form>
              ) : null}
            </span>
          ))}
        </div>
        <form action={tambahKategori} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: 8, alignItems: 'end' }}>
          <Tersembunyi nilai={dasar} />
          <Kolom label={k.nama}>
            <input name="nama" required style={gayaInput} />
          </Kolom>
          <Kolom label={k.warna}>
            <select name="warna" style={gayaInput}>
              {Object.keys(PASTEL_KATEGORI).map((w) => (
                <option key={w} value={w}>
                  {w}
                </option>
              ))}
            </select>
          </Kolom>
          <Kolom label={k.ikon}>
            <input name="ikon" style={gayaInput} />
          </Kolom>
          <button type="submit" style={{ ...gayaTombol, marginBottom: 12 }}>
            {k.tambahKategori}
          </button>
        </form>
      </Kartu>

      <Kartu judul={k.judul}>
        {menu.body.length === 0 ? <p style={{ color: 'var(--muted)' }}>{k.kosong}</p> : null}
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {menu.body.map((m) => (
            <li key={m.id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 0', borderTop: '1px solid var(--line)', opacity: m.aktif ? 1 : 0.5 }}>
              <span style={{ flex: 1 }}>
                <strong>{m.nama}</strong> · {rupiah(m.harga)}
                {m.bebasPajak ? ` · ${k.bebasPajak}` : ''}
                <br />
                <small style={{ color: 'var(--muted)' }}>
                  {m.varian.map((v) => `${v.nama} ${rupiah(v.harga)}`).join(' / ')}
                  {m.grupPilihan.map((g) => ` · ${g.nama} (${g.minimum}–${g.maksimum})`).join('')}
                </small>
              </span>
              <span>{m.aktif ? k.aktif : k.nonaktif}</span>
              <form action={ubahAktif}>
                <Tersembunyi nilai={{ ...dasar, menuId: m.id, aktif: m.aktif ? '0' : '1' }} />
                <button type="submit" style={gayaTombolSekunder}>
                  {m.aktif ? k.nonaktifkan : k.aktifkan}
                </button>
              </form>
            </li>
          ))}
        </ul>
        <h3 style={{ fontSize: 16, marginTop: 16 }}>{k.tambahMenu}</h3>
        {kategori.body.length === 0 ? (
          <p style={{ color: 'var(--muted)' }}>{k.belumAdaKategori}</p>
        ) : (
          <form action={tambahMenu}>
            <Tersembunyi nilai={dasar} />
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 8 }}>
              <Kolom label={k.nama}>
                <input name="nama" required style={gayaInput} />
              </Kolom>
              <Kolom label={k.harga}>
                <input name="harga" type="number" min={0} required style={gayaInput} />
              </Kolom>
              <Kolom label={k.kategori}>
                <select name="kategoriId" style={gayaInput}>
                  {kategori.body.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.nama}
                    </option>
                  ))}
                </select>
              </Kolom>
            </div>
            <Kolom label={k.deskripsi}>
              <input name="deskripsi" style={gayaInput} />
            </Kolom>
            <Kolom label={k.fotoUrl}>
              <input name="fotoUrl" type="url" style={gayaInput} />
            </Kolom>
            <Kolom label={k.varian}>
              <textarea name="varian" rows={2} placeholder="Reguler = 18000" style={gayaInput} />
            </Kolom>
            <Kolom label={k.grupPilihan}>
              <textarea name="grupPilihan" rows={2} placeholder="Topping | 0 | 2 | Boba=5000, Cincau=4000" style={gayaInput} />
            </Kolom>
            <label style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <input type="checkbox" name="bebasPajak" /> {k.bebasPajak}
            </label>
            <button type="submit" style={gayaTombol}>
              {k.tambahMenu}
            </button>
          </form>
        )}
      </Kartu>

      <Kartu judul={`${k.outlet} · ${outlet.nama}`}>
        <h3 style={{ fontSize: 16, margin: '0 0 8px' }}>{k.stasiun}</h3>
        <p>{stasiun.body.map((s) => s.nama).join(', ')}</p>
        <form action={tambahStasiun} style={{ display: 'flex', gap: 8, alignItems: 'end' }}>
          <Tersembunyi nilai={dasar} />
          <Kolom label={k.nama}>
            <input name="nama" required placeholder="Dapur" style={gayaInput} />
          </Kolom>
          <button type="submit" style={{ ...gayaTombol, marginBottom: 12 }}>
            {k.tambahStasiun}
          </button>
        </form>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {menu.body
            .filter((m) => m.aktif)
            .map((m) => {
              const o = diOutlet.get(m.id);
              const hargaOutlet = o && o.harga !== m.harga ? String(o.harga) : '';
              return (
                <li key={m.id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 0', borderTop: '1px solid var(--line)' }}>
                  <span style={{ flex: 1, opacity: o?.habis ? 0.5 : 1 }}>
                    <strong>{m.nama}</strong> · {rupiah(o?.harga ?? m.harga)} · {o?.habis ? k.habis : k.tersedia}
                  </span>
                  <form action={simpanMenuOutlet} style={{ display: 'flex', gap: 8 }}>
                    <Tersembunyi nilai={{ ...dasar, menuId: m.id, hargaLama: hargaOutlet }} />
                    <select name="stasiunId" defaultValue={o?.stasiunId ?? ''} style={gayaInput} aria-label={k.stasiun}>
                      <option value="">{k.tanpaStasiun}</option>
                      {stasiun.body.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.nama}
                        </option>
                      ))}
                    </select>
                    <input name="harga" type="number" min={0} defaultValue={hargaOutlet} placeholder={k.hargaOutlet} title={k.hargaOutlet} style={{ ...gayaInput, width: 140 }} />
                    <button type="submit" style={gayaTombolSekunder}>
                      {k.simpan}
                    </button>
                  </form>
                  <form action={ubahHabis}>
                    <Tersembunyi nilai={{ ...dasar, menuId: m.id, habis: o?.habis ? '0' : '1' }} />
                    <button type="submit" style={gayaTombolSekunder}>
                      {o?.habis ? k.tandaiTersedia : k.tandaiHabis}
                    </button>
                  </form>
                </li>
              );
            })}
        </ul>
      </Kartu>
    </main>
  );
}
