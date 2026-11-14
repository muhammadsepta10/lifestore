import './kds.css';
import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { t } from '../../i18n/id';
import { COOKIE_PERANGKAT, panggilApi } from '../../lib/api';
import { keluarKds, majukanStatus, masukPinKds, pilihStasiun, stasiunTersimpan } from './aksi';
import { type Kelompok, kelompokkan, type LayarKds, umurChip } from './kelompok';
import { JamDinding, PenyegarKds } from './klien';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: `${t().kds.judul} · ${t().aplikasi.nama}` };

type Kamus = ReturnType<typeof t>['kds'];

interface LayarPin {
  perangkat: { nama: string };
  outlet: { nama: string };
  anggotaAktif: { id: string } | null;
  karyawan: { id: string; nama: string }[];
}

/**
 * Layar dapur (KDS) varian B "Per item per stasiun" di Perangkat Terdaftar. Dirender di server dari
 * `GET /v1/kds`; komponen klien kecil mendengarkan aliran kejadian dan menyegarkan layar.
 * Setiap ketukan adalah formulir, jadi layar tetap berfungsi tanpa JavaScript klien.
 */
export default async function HalamanKds({ searchParams }: { searchParams: Promise<{ galat?: string }> }) {
  const k = t().kds;
  const cari = await searchParams;
  if (!(await cookies()).get(COOKIE_PERANGKAT)?.value) return <BelumTerdaftar k={k} />;
  const saya = await panggilApi<LayarPin>('/v1/perangkat/saya', { perangkat: true });
  if (saya.status === 401) return <BelumTerdaftar k={k} />;
  if (!saya.ok) throw new Error(`Gagal memuat perangkat (${saya.status})`);
  if (!saya.body.anggotaAktif) return <LayarPinKds k={k} layar={saya.body} galat={cari.galat === 'pin'} />;

  const dipilih = await stasiunTersimpan();
  let layar = await panggilApi<LayarKds>(`/v1/kds${dipilih ? `?stasiun=${encodeURIComponent(dipilih)}` : ''}`, { perangkat: true });
  // Stasiun tersimpan sudah tidak ada: tampilkan semua Stasiun.
  if (layar.status === 404 && dipilih) layar = await panggilApi<LayarKds>('/v1/kds', { perangkat: true });
  if (layar.status === 401) return <LayarPinKds k={k} layar={saya.body} galat={false} />;
  if (layar.status === 403) {
    return (
      <Tengah>
        <p className="galat" role="alert">
          {k.tidakBerizin}
        </p>
        <form action={keluarKds}>
          <button className="btn utama" type="submit">
            {k.keluar}
          </button>
        </form>
      </Tengah>
    );
  }
  if (!layar.ok) throw new Error(`Gagal memuat layar dapur (${layar.status})`);
  const d = layar.body;
  const nama = saya.body.karyawan.find((x) => x.id === saya.body.anggotaAktif?.id)?.nama ?? saya.body.perangkat.nama;

  const kolom = [
    ...d.stasiun.map((s, i) => ({ id: s.id as string | null, nama: s.nama, pastel: `p-${i % 6}` })),
    // Menu yang belum dipetakan ke Stasiun tetap harus terlihat di layar "Semua".
    ...(d.item.some((i) => i.stasiunId === null) ? [{ id: null, nama: k.tanpaStasiun, pastel: 'p-x' }] : []),
  ].filter((s) => !d.stasiunId || s.id === d.stasiunId);
  const antre = (stasiunId: string | null) => d.item.filter((i) => i.stasiunId === stasiunId && i.status !== 'batal').length;

  return (
    <main className="kds">
      <header className="top">
        <div className="hello">
          <h1>{k.sapa(saya.body.outlet.nama)}</h1>
          <p>{k.sub(nama)}</p>
        </div>
        <div className="tools">
          <JamDinding />
          <PenyegarKds stasiunId={d.stasiunId} sejak={d.urutan} label={{ online: k.online, offline: k.offline }} />
          <form action={keluarKds}>
            <button className="btn" type="submit">
              {k.keluar}
            </button>
          </form>
        </div>
      </header>

      <nav className="stations" aria-label={k.judul}>
        <form action={pilihStasiun}>
          <input type="hidden" name="stasiun" value="" />
          <button className="tile all" type="submit" aria-pressed={d.stasiunId === null}>
            <b>{k.semua}</b>
            <small>{k.jumlahAntre(d.stasiunId === null ? d.item.filter((i) => i.status !== 'batal').length : 0)}</small>
          </button>
        </form>
        {d.stasiun.map((s, i) => (
          <form key={s.id} action={pilihStasiun}>
            <input type="hidden" name="stasiun" value={s.id} />
            <button className={`tile p-${i % 6}`} type="submit" aria-pressed={d.stasiunId === s.id} data-stasiun={s.nama}>
              <b>{s.nama}</b>
              <small>{d.stasiunId === null || d.stasiunId === s.id ? k.jumlahAntre(antre(s.id)) : ' '}</small>
            </button>
          </form>
        ))}
      </nav>

      <div className="vb">
        {kolom.map((s) => {
          const milik = d.item.filter((i) => i.stasiunId === s.id);
          const grup = kelompokkan(milik);
          const dimasak = grup.filter((g) => g.status === 'dimasak');
          const menunggu = grup.filter((g) => g.status === 'menunggu');
          const batal = grup.filter((g) => g.status === 'batal');
          const porsi = grup.filter((g) => g.status !== 'batal').reduce((n, g) => n + g.jumlah, 0);
          return (
            <section key={s.id ?? 'tanpa'} className={`stn ${s.pastel}`} aria-label={s.nama} data-kolom={s.nama}>
              <div className="stn-h">
                <h2>{s.nama}</h2>
                <span className="cnt num">{k.porsi(porsi)}</span>
              </div>
              <div className="stn-b">
                {grup.length === 0 ? <p className="empty">✨ {k.stasiunKosong}</p> : null}
                <Grup k={k} judul={k.dimasak} pil="dimasak" grup={dimasak} sekarang={d.sekarang} />
                <Grup k={k} judul={k.antre} pil="antre" grup={menunggu} sekarang={d.sekarang} />
                <Grup k={k} judul={k.dibatalkan} pil="batal" grup={batal} sekarang={d.sekarang} />
              </div>
            </section>
          );
        })}
      </div>

      <section className="handoff" aria-label={k.siapDiserahkan}>
        <div className="hd">
          <h2>
            {k.siapDiserahkan} <span className="pill siap num">{d.siapDiserahkan.length}</span>
          </h2>
          <span className="muted" style={{ fontSize: 14, fontWeight: 500 }}>
            {k.semuaItemSelesai}
          </span>
        </div>
        <div className="list">
          {d.siapDiserahkan.length === 0 ? (
            <span className="muted" style={{ padding: '8px 4px' }}>
              {k.belumAdaYangLengkap}
            </span>
          ) : null}
          {d.siapDiserahkan.map((ps) => (
            <form key={ps.pesananId} action={majukanStatus}>
              <input type="hidden" name="status" value="disajikan" />
              <input
                type="hidden"
                name="itemIds"
                value={ps.item
                  .filter((i) => i.status === 'siap')
                  .map((i) => i.id)
                  .join(',')}
              />
              <button className="hcard" type="submit" data-siap={ps.nomorPesanan}>
                <b className="num">{ps.nomorPesanan}</b>
                <span className="pill siap">{t().kasir.pos.statusItem.siap}</span>
                <span className={`ch${ps.kanal === 'dine_in' ? ' dine' : ''}`}>
                  {ps.kanal === 'dine_in' ? k.dineIn : [k.bawaPulang, ps.namaPelanggan].filter(Boolean).join(' · ')}
                </span>
                <span className="isi">{ps.item.map((i) => `${i.jumlah}× ${i.nama}`).join(', ')}</span>
                <span className="go">{k.ketukSaatDiserahkan}</span>
              </button>
            </form>
          ))}
        </div>
      </section>
    </main>
  );
}

function Grup({ k, judul, pil, grup, sekarang }: { k: Kamus; judul: string; pil: string; grup: Kelompok[]; sekarang: string }) {
  if (grup.length === 0) return null;
  return (
    <>
      <h3 className="grp">
        <span className={`pill ${pil}`}>{judul}</span>
      </h3>
      {grup.map((g) => (
        <Baris key={g.kunci} k={k} g={g} sekarang={sekarang} />
      ))}
    </>
  );
}

/** Satu baris gabungan. Ketuk baris: semua itemnya maju satu langkah. Ketuk chip: hanya item Pesanan itu. */
function Baris({ k, g, sekarang }: { k: Kamus; g: Kelompok; sekarang: string }) {
  const batal = g.status === 'batal';
  const berikut = g.status === 'menunggu' ? 'dimasak' : 'siap';
  const isi = (
    <>
      <span className="big num">{g.jumlah}</span>
      <span className="nm">{g.nama}</span>
      {g.rincian ? <span className="sub">{g.rincian}</span> : null}
      {g.catatan ? <span className={g.alergi ? 'alg' : 'note'}>{g.alergi ? `⚠️ ${g.catatan}` : `📝 ${g.catatan}`}</span> : null}
    </>
  );
  return (
    <div className="agg-wrap" data-baris={g.nama} data-status={g.status} data-jumlah={g.jumlah}>
      {batal ? (
        <div className="agg batal">{isi}</div>
      ) : (
        <form action={majukanStatus}>
          <input type="hidden" name="status" value={berikut} />
          <input type="hidden" name="itemIds" value={g.item.map((i) => i.id).join(',')} />
          <button className={`agg ${g.status}`} type="submit" aria-label={g.status === 'menunggu' ? k.mulaiMasak(g.jumlah, g.nama) : k.tandaiSiap(g.jumlah, g.nama)}>
            {isi}
          </button>
        </form>
      )}
      <div className="orders">
        {g.item.map((i) => {
          const umur = umurChip(i.dikirimPada, sekarang);
          const chip = (
            <>
              <b className="num">{i.nomorPesanan}</b>
              <span>{i.jumlah}×</span>
              <span className="num">{k.menit(umur.menit)}</span>
            </>
          );
          return batal ? (
            <span key={i.id} className="ochip" data-chip={i.nomorPesanan}>
              {chip}
            </span>
          ) : (
            <form key={i.id} action={majukanStatus}>
              <input type="hidden" name="status" value={berikut} />
              <input type="hidden" name="itemIds" value={i.id} />
              <button className={`ochip ${umur.tingkat}`} type="submit" data-chip={i.nomorPesanan} data-tingkat={umur.tingkat || 'baru'}>
                {chip}
              </button>
            </form>
          );
        })}
      </div>
    </div>
  );
}

function Tengah({ children }: { children: ReactNode }) {
  return (
    <main className="kds">
      <div className="tengah">
        <div className="kotak">{children}</div>
      </div>
    </main>
  );
}

function BelumTerdaftar({ k }: { k: Kamus }) {
  return (
    <Tengah>
      <h1>{k.judul}</h1>
      <p className="muted">{k.belumTerdaftar}</p>
      <Link className="btn utama" href="/kasir">
        {k.keKasir}
      </Link>
    </Tengah>
  );
}

function LayarPinKds({ k, layar, galat }: { k: Kamus; layar: LayarPin; galat: boolean }) {
  return (
    <Tengah>
      <h1>{k.pinJudul}</h1>
      <p className="muted">
        {layar.outlet.nama} · {layar.perangkat.nama}
      </p>
      {galat ? (
        <p className="galat" role="alert">
          {k.pinSalah}
        </p>
      ) : null}
      <form action={masukPinKds} style={{ display: 'grid', gap: 14 }}>
        <label>
          {k.pilihNama}
          <select name="anggotaId" required>
            {layar.karyawan.map((x) => (
              <option key={x.id} value={x.id}>
                {x.nama}
              </option>
            ))}
          </select>
        </label>
        <label>
          {k.pin}
          <input name="pin" type="password" inputMode="numeric" autoComplete="off" pattern="[0-9]{4,6}" required />
        </label>
        <button className="btn utama" type="submit" style={{ justifyContent: 'center' }}>
          {k.masuk}
        </button>
      </form>
    </Tengah>
  );
}
