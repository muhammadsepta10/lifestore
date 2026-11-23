import Link from 'next/link';
import { redirect } from 'next/navigation';
import { t } from '../../i18n/id';
import { panggilApi } from '../../lib/api';
import { gayaInput, gayaTombol, gayaTombolSekunder, Kolom, Pesan } from '../kartu';

export const dynamic = 'force-dynamic';

interface Karyawan {
  id: string;
  nama: string;
  email: string | null;
  peran: string;
  aktif: boolean;
  punyaPin: boolean;
  undanganDiterima: boolean;
  penugasan: { outletId: string; peran: string }[];
}

interface Perangkat {
  id: string;
  nama: string;
  awalan: string;
  status: string;
}

interface OutletRingkas {
  id: string;
  nama: string;
}

const kartu = { background: 'var(--surface)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', padding: 24 } as const;
const teks = (form: FormData, kolom: string) => String(form.get(kolom) ?? '').trim();
const PERAN_PENUGASAN = ['manajer_outlet', 'kasir', 'pelayan', 'dapur'] as const;

const kembali = (outletId: string, ok: boolean, tambahan = '') =>
  `/karyawan?outlet=${encodeURIComponent(outletId)}&${ok ? 'info=tersimpan' : 'galat=1'}${tambahan}`;

async function tambahKaryawan(form: FormData) {
  'use server';
  const outletId = teks(form, 'outletId');
  const email = teks(form, 'email');
  const pin = teks(form, 'pin');
  const res = await panggilApi('/v1/karyawan', {
    method: 'POST',
    body: {
      nama: teks(form, 'nama'),
      ...(email ? { email } : {}),
      ...(pin ? { pin } : {}),
      penugasan: [{ outletId, peran: teks(form, 'peran') }],
    },
  });
  redirect(kembali(outletId, res.ok));
}

async function aturPin(form: FormData) {
  'use server';
  const res = await panggilApi(`/v1/karyawan/${encodeURIComponent(teks(form, 'id'))}/pin`, { method: 'PUT', body: { pin: teks(form, 'pin') } });
  redirect(kembali(teks(form, 'outletId'), res.ok));
}

async function nonaktifkan(form: FormData) {
  'use server';
  const res = await panggilApi(`/v1/karyawan/${encodeURIComponent(teks(form, 'id'))}/nonaktifkan`, { method: 'POST' });
  redirect(kembali(teks(form, 'outletId'), res.ok));
}

async function siapkanPerangkat(form: FormData) {
  'use server';
  const outletId = teks(form, 'outletId');
  const res = await panggilApi<{ kodePendaftaran?: string }>(`/v1/outlet/${encodeURIComponent(outletId)}/perangkat`, {
    method: 'POST',
    body: { nama: teks(form, 'nama'), awalan: teks(form, 'awalan') },
  });
  const kode = res.ok && res.body.kodePendaftaran ? `&kode=${encodeURIComponent(res.body.kodePendaftaran)}` : '';
  redirect(kembali(outletId, res.ok, kode));
}

async function cabutPerangkat(form: FormData) {
  'use server';
  const outletId = teks(form, 'outletId');
  const res = await panggilApi(`/v1/outlet/${encodeURIComponent(outletId)}/perangkat/${encodeURIComponent(teks(form, 'id'))}/cabut`, { method: 'POST' });
  redirect(kembali(outletId, res.ok));
}

/** Karyawan (email atau khusus PIN) dan Perangkat Terdaftar untuk satu Outlet. */
export default async function HalamanKaryawan({
  searchParams,
}: {
  searchParams: Promise<{ outlet?: string; galat?: string; info?: string; kode?: string }>;
}) {
  const k = t().karyawan;
  const { outlet, galat, info, kode } = await searchParams;
  if (!outlet) redirect('/dashboard');
  const [daftar, perangkat, dash] = await Promise.all([
    panggilApi<Karyawan[]>('/v1/karyawan'),
    panggilApi<Perangkat[]>(`/v1/outlet/${encodeURIComponent(outlet)}/perangkat`),
    panggilApi<{ outlet: OutletRingkas[] }>('/v1/dashboard'),
  ]);
  if (daftar.status === 401) redirect('/masuk');
  const namaOutlet = dash.ok ? (dash.body.outlet.find((o) => o.id === outlet)?.nama ?? '') : '';

  return (
    <main style={{ maxWidth: 760, margin: '32px auto', padding: '0 16px', display: 'grid', gap: 16 }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, flex: 1 }}>
          {k.judul}
          {namaOutlet ? ` · ${namaOutlet}` : ''}
        </h1>
        <Link href="/dashboard" style={gayaTombolSekunder}>
          {k.kembali}
        </Link>
      </header>
      {galat ? <Pesan jenis="galat">{k.galat}</Pesan> : null}
      {info ? <Pesan jenis="info">{k.tersimpan}</Pesan> : null}

      {!daftar.ok ? (
        <Pesan jenis="galat">{k.hanyaPemilik}</Pesan>
      ) : (
        <section style={kartu} data-karyawan>
          <h2 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 800 }}>{k.karyawan}</h2>
          <p style={{ color: 'var(--muted)', margin: '0 0 12px' }}>{k.karyawanSub}</p>
          <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 16px', display: 'grid', gap: 10 }}>
            {daftar.body.map((a) => {
              const tugas = a.penugasan.find((p) => p.outletId === outlet);
              return (
                <li key={a.id} style={{ borderTop: '1px solid var(--line)', paddingTop: 10, display: 'grid', gap: 6 }} data-karyawan-baris={a.nama}>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'baseline' }}>
                    <b>{a.nama}</b>
                    <span style={{ color: 'var(--muted)' }}>
                      {k.peranPilihan[a.peran === 'pemilik' ? 'pemilik' : (tugas?.peran ?? 'karyawan')] ?? a.peran}
                      {a.email ? ` · ${a.email}` : ''}
                    </span>
                  </div>
                  <div style={{ color: 'var(--muted)', fontSize: 14 }}>
                    {[
                      a.aktif ? null : k.nonaktif,
                      a.punyaPin ? k.punyaPin : k.belumPin,
                      a.email && !a.undanganDiterima && a.peran !== 'pemilik' ? k.menungguUndangan : null,
                      a.peran !== 'pemilik' && a.penugasan.length === 0 ? k.tanpaPenugasan : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </div>
                  {a.aktif ? (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <form action={aturPin} style={{ display: 'flex', gap: 8 }}>
                        <input type="hidden" name="id" value={a.id} />
                        <input type="hidden" name="outletId" value={outlet} />
                        <input name="pin" inputMode="numeric" pattern="[0-9]{4,6}" required placeholder={k.pinBaru} aria-label={k.pinBaru} style={{ ...gayaInput, width: 130 }} />
                        <button type="submit" style={gayaTombolSekunder}>
                          {k.aturPin}
                        </button>
                      </form>
                      {a.peran !== 'pemilik' ? (
                        <form action={nonaktifkan}>
                          <input type="hidden" name="id" value={a.id} />
                          <input type="hidden" name="outletId" value={outlet} />
                          <button type="submit" style={gayaTombolSekunder}>
                            {k.nonaktifkan}
                          </button>
                        </form>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
          <form action={tambahKaryawan} data-tambah-karyawan>
            <input type="hidden" name="outletId" value={outlet} />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0 12px' }}>
              <Kolom label={k.nama}>
                <input name="nama" required maxLength={100} style={gayaInput} />
              </Kolom>
              <Kolom label={k.email}>
                <input name="email" type="email" style={gayaInput} />
              </Kolom>
              <Kolom label={k.pin}>
                <input name="pin" inputMode="numeric" pattern="[0-9]{4,6}" style={gayaInput} />
              </Kolom>
              <Kolom label={k.peran}>
                <select name="peran" style={gayaInput}>
                  {PERAN_PENUGASAN.map((p) => (
                    <option key={p} value={p}>
                      {k.peranPilihan[p]}
                    </option>
                  ))}
                </select>
              </Kolom>
            </div>
            <button type="submit" style={gayaTombol}>
              {k.tambah}
            </button>
          </form>
        </section>
      )}

      <section style={kartu} data-perangkat>
        <h2 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 800 }}>{k.perangkat}</h2>
        <p style={{ color: 'var(--muted)', margin: '0 0 12px' }}>{k.perangkatSub}</p>
        {kode ? (
          <Pesan jenis="info">
            <b data-kode-pendaftaran>{k.kode(kode)}</b>
            <br />
            {k.kodeSub}
          </Pesan>
        ) : null}
        {perangkat.ok ? (
          <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 16px', display: 'grid', gap: 8 }}>
            {perangkat.body.map((p) => (
              <li key={p.id} style={{ display: 'flex', gap: 12, alignItems: 'center', borderTop: '1px solid var(--line)', paddingTop: 8 }} data-perangkat-baris={p.nama}>
                <span style={{ flex: 1 }}>
                  <b>{p.nama}</b> ({p.awalan}) · {k.statusPerangkat[p.status] ?? p.status}
                </span>
                {p.status !== 'dicabut' ? (
                  <form action={cabutPerangkat}>
                    <input type="hidden" name="id" value={p.id} />
                    <input type="hidden" name="outletId" value={outlet} />
                    <button type="submit" style={gayaTombolSekunder}>
                      {k.cabut}
                    </button>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
        <form action={siapkanPerangkat} data-tambah-perangkat>
          <input type="hidden" name="outletId" value={outlet} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0 12px' }}>
            <Kolom label={k.namaPerangkat}>
              <input name="nama" required maxLength={100} style={gayaInput} />
            </Kolom>
            <Kolom label={k.awalan}>
              <input name="awalan" required maxLength={3} pattern="[A-Za-z]{1,3}" style={gayaInput} />
            </Kolom>
          </div>
          <button type="submit" style={gayaTombol}>
            {k.siapkan}
          </button>
        </form>
      </section>
    </main>
  );
}
