import { PASTEL_KATEGORI, type PastelKategori } from '@lifestore/ui';
import type { CSSProperties, ReactNode } from 'react';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { t } from '../../i18n/id';
import { COOKIE_PERANGKAT, panggilApi } from '../../lib/api';
import { bukaShift, bukaTagihan, catatKas, daftarPerangkat, keluarKasir, lupakanPerangkat, masukPin, tutupShift, ubahMeja } from './aksi';
import { Ikon, type NamaIkon } from './ikon';
import { TombolCetak, TombolTema } from './klien';
import { type PesananSiap, SiapDiambil, TombolBukaLaci } from './kendali';
import { GridMenu, PanelPesanan, PenyediaPos } from './pos';
import type { DaftarJual, TagihanLengkap, TagihanTerbuka } from './tipe';

export const dynamic = 'force-dynamic';

type Kamus = ReturnType<typeof t>['kasir'];

interface LayarPin {
  perangkat: { id: string; nama: string; awalan: string };
  outlet: { id: string; nama: string };
  anggotaAktif: { id: string } | null;
  karyawan: { id: string; nama: string }[];
}

interface ShiftTerbuka {
  id: string;
  status: 'terbuka';
  kasAwal: number;
  dibukaPada: string;
  dibukaOleh: { id: string; nama: string };
}

interface LayarKasir {
  perangkat: { id: string; nama: string; awalan: string };
  outlet: { id: string; nama: string };
  anggota: { id: string; nama: string; peran: string };
  izin: string[];
  shift: ShiftTerbuka | null;
  metodeBayar: { jenis: string; nama: string; keterangan: string | null }[];
}

interface Meja {
  id: string;
  label: string;
  kapasitas: number;
  aktif: boolean;
  status: string;
}

interface LaporanShift {
  id: string;
  dibukaOleh: { nama: string };
  ditutupOleh: { nama: string } | null;
  dibukaPada: string;
  ditutupPada: string;
  kasAwal: number;
  penjualanTunai: number;
  penjualanPerMetodeBayar: { jenis: string; nilai: number }[];
  kasMasuk: number;
  kasKeluar: number;
  kasSeharusnya: number;
  hitungButa: number;
  selisih: number;
  void: { jumlah: number; nilai: number };
  kas: { id: string; jenis: string; jumlah: number; alasan: string }[];
}

type Cari = { galat?: string; modal?: string; laporan?: string; kategori?: string; info?: string; tagihan?: string; struk?: string };

const rp = (n: number) => `Rp${new Intl.NumberFormat('id-ID').format(n)}`;
const jam = (iso: string) => new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' }).format(new Date(iso));
const tanggalJam = (iso: string) =>
  new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Jakarta' }).format(new Date(iso));
const inisial = (nama: string) =>
  nama
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]!.toUpperCase())
    .join('') || '?';
const tint = (warna: string): CSSProperties => ({ ['--tint' as string]: PASTEL_KATEGORI[warna as PastelKategori] ?? PASTEL_KATEGORI.sand });

/**
 * Kasir PWA di Perangkat Terdaftar. Alurnya: daftarkan perangkat (kode sekali pakai) → layar PIN
 * → kerangka kasir varian B dengan status Shift. Modal (buka/tutup Shift, kas) dirender di server
 * lewat `?modal=`, jadi kasir tetap jalan tanpa JavaScript klien.
 */
export default async function HalamanKasir({ searchParams }: { searchParams: Promise<Cari> }) {
  const k = t().kasir;
  const cari = await searchParams;
  const punyaToken = Boolean((await cookies()).get(COOKIE_PERANGKAT)?.value);
  if (!punyaToken) return <LayarDaftar k={k} galat={cari.galat === 'kode' ? k.daftarPerangkat.gagal : undefined} />;

  const saya = await panggilApi<LayarPin>('/v1/perangkat/saya', { perangkat: true });
  if (saya.status === 401) return <LayarDicabut k={k} />;
  if (!saya.ok) throw new Error(`Gagal memuat perangkat (${saya.status})`);
  if (!saya.body.anggotaAktif) return <LayarPinMasuk k={k} layar={saya.body} galat={cari.galat} />;

  const kasir = await panggilApi<LayarKasir & { kode?: string }>('/v1/kasir', { perangkat: true });
  if (kasir.status === 401) redirect('/kasir');
  if (kasir.status === 403) return <LayarTidakBerizin k={k} />;
  if (!kasir.ok) throw new Error(`Gagal memuat kasir (${kasir.status})`);
  const detailTagihan = (id: string | undefined) =>
    id ? panggilApi<TagihanLengkap>(`/v1/tagihan/${encodeURIComponent(id)}`, { perangkat: true }) : Promise.resolve(undefined);
  const [meja, jual, terbuka, dipilih, struk, siapDiambil] = await Promise.all([
    panggilApi<Meja[]>('/v1/kasir/meja', { perangkat: true }),
    panggilApi<DaftarJual>('/v1/kasir/menu', { perangkat: true }),
    panggilApi<TagihanTerbuka[]>('/v1/tagihan', { perangkat: true }),
    detailTagihan(cari.tagihan),
    detailTagihan(cari.struk),
    panggilApi<PesananSiap[]>('/v1/siap-diambil', { perangkat: true }),
  ]);
  const laporan = cari.laporan
    ? await panggilApi<LaporanShift>(`/v1/shift/${encodeURIComponent(cari.laporan)}/laporan`, { perangkat: true })
    : undefined;

  return (
    <LayarKasirB
      k={k}
      d={kasir.body}
      meja={meja.ok ? meja.body : []}
      jual={jual.ok ? jual.body : { kategori: [], menu: [] }}
      cari={cari}
      laporan={laporan?.ok ? laporan.body : undefined}
      terbuka={terbuka.ok ? terbuka.body : []}
      tagihan={dipilih?.ok && dipilih.body.status === 'terbuka' ? dipilih.body : null}
      struk={struk?.ok && struk.body.status === 'lunas' ? struk.body : undefined}
      siapDiambil={siapDiambil.ok ? siapDiambil.body : []}
      atasan={saya.body.karyawan.filter((x) => x.id !== kasir.body.anggota.id)}
    />
  );
}

function Merek() {
  return (
    <span className="merek">
      <span className="logo">
        <Ikon nama="daun" />
      </span>
      <b>Lifestore</b>
    </span>
  );
}

function Tengah({ children }: { children: ReactNode }) {
  return (
    <main className="kasir">
      <section className="kartu tengah">
        <Merek />
        {children}
      </section>
    </main>
  );
}

function LayarDaftar({ k, galat }: { k: Kamus; galat?: string }) {
  return (
    <Tengah>
      <div>
        <h1>{k.daftarPerangkat.judul}</h1>
        <p className="muted">{k.daftarPerangkat.sub}</p>
      </div>
      {galat ? (
        <p className="pesan galat" role="alert">
          {galat}
        </p>
      ) : null}
      <form action={daftarPerangkat} style={{ display: 'grid', gap: 14 }}>
        <label className="label">
          {k.daftarPerangkat.kode}
          <input className="isian angka" name="kode" required autoComplete="off" autoCapitalize="characters" placeholder="ABCD2345" />
        </label>
        <button className="tombol besar lebar" type="submit">
          {k.daftarPerangkat.kirim}
        </button>
      </form>
    </Tengah>
  );
}

function LayarDicabut({ k }: { k: Kamus }) {
  return (
    <Tengah>
      <p className="pesan galat" role="alert">
        {k.daftarPerangkat.dicabut}
      </p>
      <form action={lupakanPerangkat}>
        <button className="tombol besar lebar" type="submit">
          {k.daftarPerangkat.judul}
        </button>
      </form>
    </Tengah>
  );
}

const PESAN_PIN: Record<string, keyof Kamus['pin']> = {
  salah: 'salah',
  terkunci: 'terkunci',
  tidak_ditugaskan: 'tidakDitugaskan',
  gagal: 'gagal',
};

/** Layar PIN di Perangkat Terdaftar: pilih karyawan, ketik PIN. */
function LayarPinMasuk({ k, layar, galat }: { k: Kamus; layar: LayarPin; galat?: string }) {
  const kunciPesan = galat ? PESAN_PIN[galat] : undefined;
  return (
    <Tengah>
      <div>
        <h1>{k.pin.judul}</h1>
        <p className="muted">{k.pin.sub(layar.outlet.nama, layar.perangkat.nama)}</p>
      </div>
      {kunciPesan ? (
        <p className="pesan galat" role="alert">
          {k.pin[kunciPesan] as string}
        </p>
      ) : null}
      {layar.karyawan.length === 0 ? (
        <p className="pesan info">{k.pin.kosong}</p>
      ) : (
        <form action={masukPin} style={{ display: 'grid', gap: 16 }}>
          <fieldset className="daftar-orang">
            <legend className="label" style={{ marginBottom: 8 }}>
              {k.pin.pilih}
            </legend>
            {layar.karyawan.map((o, i) => (
              <label key={o.id} className="orang">
                <input type="radio" name="anggotaId" value={o.id} required defaultChecked={i === 0 && layar.karyawan.length === 1} />
                <span className="av">{inisial(o.nama)}</span>
                {o.nama}
              </label>
            ))}
          </fieldset>
          <label className="label">
            {k.pin.pin}
            <input
              className="isian angka"
              name="pin"
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              minLength={4}
              maxLength={6}
              required
              autoComplete="off"
            />
          </label>
          <button className="tombol besar lebar" type="submit">
            {k.pin.kirim}
          </button>
        </form>
      )}
    </Tengah>
  );
}

function LayarTidakBerizin({ k }: { k: Kamus }) {
  return (
    <Tengah>
      <p className="pesan galat" role="alert">
        {k.tidakBerizin}
      </p>
      <Link className="tombol besar lebar" href="/kds">
        {k.bukaDapur}
      </Link>
      <form action={keluarKasir}>
        <button className="tombol tinta besar lebar" type="submit">
          {k.keluar}
        </button>
      </form>
    </Tengah>
  );
}

function Sidebar({ k, d }: { k: Kamus; d: LayarKasir }) {
  const nav: [NamaIkon, string, boolean][] = [
    ['rumah', k.nav.beranda, false],
    ['tas', k.nav.kasir, true],
    ['kisi', k.nav.meja, false],
    ['papan', k.nav.pesanan, false],
    ['grafik', k.nav.laporan, false],
  ];
  return (
    <aside className="sb kartu" aria-label="Navigasi kasir">
      <Merek />
      {nav.map(([ikon, label, aktif]) => (
        <span key={label} className={`sb-i${aktif ? ' aktif' : ''}`} title={label} aria-current={aktif ? 'page' : undefined}>
          <Ikon nama={ikon} />
          <span>{label}</span>
        </span>
      ))}
      <div className="sb-user">
        <span className="av">{inisial(d.anggota.nama)}</span>
        <span>
          <b>{d.anggota.nama}</b>
          <small>
            {k.peran[d.anggota.peran] ?? d.anggota.peran} · {d.outlet.nama}
          </small>
        </span>
      </div>
    </aside>
  );
}

function StatusShift({ k, shift }: { k: Kamus; shift: ShiftTerbuka | null }) {
  return (
    <section className="kartu shift-kartu" aria-label="Status Shift" data-status-shift={shift ? 'terbuka' : 'belum'}>
      <span className={`bulat ${shift ? 'ok' : 'warn'}`}>
        <Ikon nama={shift ? 'dompet' : 'kunci'} />
      </span>
      <span className="isi">
        <b>{shift ? k.shift.terbuka(jam(shift.dibukaPada)) : k.shift.belum}</b>
        <small>{shift ? `${shift.dibukaOleh.nama} · ${k.laporan.kasAwal} ${rp(shift.kasAwal)}` : k.shift.perluShift}</small>
      </span>
      <span className={`pil ${shift ? 'ok' : 'warn'}`}>
        <span className="titik" />
        {shift ? k.shift.pilTerbuka : k.shift.pilBelum}
      </span>
    </section>
  );
}

function LayarKasirB({
  k,
  d,
  meja,
  jual,
  cari,
  laporan,
  terbuka,
  tagihan,
  struk,
  siapDiambil,
  atasan,
}: {
  k: Kamus;
  d: LayarKasir;
  meja: Meja[];
  jual: DaftarJual;
  cari: Cari;
  laporan?: LaporanShift;
  terbuka: TagihanTerbuka[];
  tagihan: TagihanLengkap | null;
  struk?: TagihanLengkap;
  siapDiambil: PesananSiap[];
  atasan: { id: string; nama: string }[];
}) {
  const bolehNonaktifkanMeja = d.izin.includes('meja.nonaktifkan');
  const kategoriAktif = jual.kategori.find((x) => x.id === cari.kategori);
  const menuTampil = kategoriAktif ? jual.menu.filter((m) => m.kategoriId === kategoriAktif.id) : jual.menu;
  /** Tautan di dalam layar kasir yang mempertahankan Tagihan terpilih. */
  const ke = (q: { kategori?: string; tagihan?: string | null }) => {
    const param = new URLSearchParams();
    const idTagihan = q.tagihan === undefined ? tagihan?.id : q.tagihan;
    if (idTagihan) param.set('tagihan', idTagihan);
    const kategori = 'kategori' in q ? q.kategori : kategoriAktif?.id;
    if (kategori) param.set('kategori', kategori);
    const teks = param.toString();
    return teks ? `/kasir?${teks}` : '/kasir';
  };

  return (
    <main className="kasir">
      <div className="shell">
        <Sidebar k={k} d={d} />
        <PenyediaPos key={tagihan?.id ?? 'tanpa-tagihan'} tagihan={tagihan}>
        <div className="vb">
          <header className="top">
            <div className="sapa">
              <h1>{k.sapa(d.anggota.nama)}</h1>
              <p>
                {d.outlet.nama} · {d.perangkat.nama} ({d.perangkat.awalan})
              </p>
            </div>
            <div className="aksi-top">
              <TombolTema label={k.tema} />
              {d.shift ? (
                <>
                  <Link className="tombol tenang" href="/kasir?modal=kas">
                    <Ikon nama="tukar" />
                    {k.shift.kas}
                  </Link>
                  <Link className="tombol tinta" href="/kasir?modal=tutup-shift">
                    <Ikon nama="kunci" />
                    {k.shift.tutup}
                  </Link>
                </>
              ) : (
                <Link className="tombol" href="/kasir?modal=buka-shift">
                  <Ikon nama="dompet" />
                  {k.shift.buka}
                </Link>
              )}
              <TombolBukaLaci atasan={atasan} />
              <form action={keluarKasir}>
                <button className="tombol tenang" type="submit">
                  <Ikon nama="keluar" />
                  {k.keluar}
                </button>
              </form>
            </div>
          </header>

          <div className="bmain">
            {cari.galat === 'sudah_terbuka' ? (
              <p className="pesan galat" role="alert">
                {k.shift.sudahTerbuka}
              </p>
            ) : null}
            {cari.galat === 'tagihan' ? (
              <p className="pesan galat" role="alert">
                {k.pos.tagihanGagal}
              </p>
            ) : null}
            {cari.info === 'tersimpan' ? (
              <p className="pesan info" role="status">
                {k.shift.tersimpan}
              </p>
            ) : null}
            <StatusShift k={k} shift={d.shift} />

            {siapDiambil.length > 0 ? <SiapDiambil daftar={siapDiambil} /> : null}
            <section>
              <div className="sec-h">
                <h2>{k.tagihanTerbuka}</h2>
                <small>{terbuka.length}</small>
              </div>
              <div className="ostrip">
                <form action={bukaTagihan}>
                  {/* ID buatan klien: kirim ulang formulir yang sama tidak membuka Tagihan kedua. */}
                  <input type="hidden" name="id" value={crypto.randomUUID()} />
                  <button className="addcard" type="submit">
                    + {k.pos.tagihanBaruBawaPulang}
                  </button>
                </form>
                {terbuka.length === 0 ? <p className="kosong">{k.belumAdaTagihan}</p> : null}
                {terbuka.map((x) => (
                  <Link key={x.id} className="ocard" href={ke({ tagihan: x.id })} aria-current={tagihan?.id === x.id ? 'true' : undefined} data-tagihan={x.id}>
                    <span className="ocard-h">
                      <b>{x.namaPelanggan ?? k.pos.tanpaNama}</b>
                      <span className="pil info">{k.jenis[x.kanal]}</span>
                    </span>
                    <small>{x.nomorPesanan.length > 0 ? x.nomorPesanan.join(' · ') : k.pos.belumAdaPesanan}</small>
                    <span className="ocard-f">
                      <small>{k.pos.jumlahItem(x.jumlahItem)}</small>
                      <b>{rp(x.total)}</b>
                    </span>
                  </Link>
                ))}
              </div>
            </section>

            <section>
              <div className="sec-h">
                <h2>{k.kategori}</h2>
              </div>
              <div className="ctiles" role="group" aria-label={k.kategori}>
                <Link className={`ctile${kategoriAktif ? '' : ' aktif'}`} href={ke({ kategori: undefined })} style={tint('sand')} aria-current={kategoriAktif ? undefined : 'true'}>
                  <span className="cemo">🍽️</span>
                  <b>{k.semuaMenu}</b>
                  <small>{k.jumlahMenu(jual.menu.length)}</small>
                </Link>
                {jual.kategori.map((x) => (
                  <Link
                    key={x.id}
                    className={`ctile${kategoriAktif?.id === x.id ? ' aktif' : ''}`}
                    href={ke({ kategori: x.id })}
                    style={tint(x.warna)}
                    aria-current={kategoriAktif?.id === x.id ? 'true' : undefined}
                  >
                    <span className="cemo">{x.ikon ?? '🍴'}</span>
                    <b>{x.nama}</b>
                    <small>{k.jumlahMenu(jual.menu.filter((m) => m.kategoriId === x.id).length)}</small>
                  </Link>
                ))}
              </div>
            </section>

            <section>
              <div className="sec-h">
                <h2>{kategoriAktif?.nama ?? k.semuaMenu}</h2>
                <small>{k.jumlahMenu(menuTampil.length)}</small>
              </div>
              {menuTampil.length === 0 ? (
                <p className="muted">{k.menuKosong}</p>
              ) : (
                <GridMenu menu={menuTampil} kategori={jual.kategori} />
              )}
            </section>

            <section>
              <div className="sec-h">
                <h2>{k.meja}</h2>
                <small>
                  {meja.filter((m) => m.aktif && m.status === 'kosong').length}/{meja.length} {k.statusMeja.kosong?.toLowerCase()}
                </small>
              </div>
              {meja.length === 0 ? (
                <p className="muted">{k.mejaKosong}</p>
              ) : (
                <div className="meja-grid">
                  {meja.map((m) => (
                    <div key={m.id} className={`meja${m.aktif ? '' : ' nonaktif'}`}>
                      <span className="nomor">{m.label}</span>
                      <small>{k.kursi(m.kapasitas)}</small>
                      <span className={`pil ${!m.aktif ? 'redup' : m.status === 'terisi' ? 'info' : 'ok'}`}>
                        {m.aktif ? k.statusMeja[m.status] ?? m.status : k.statusMeja.nonaktif}
                      </span>
                      {bolehNonaktifkanMeja ? (
                        <form action={ubahMeja}>
                          <input type="hidden" name="mejaId" value={m.id} />
                          <input type="hidden" name="aktif" value={m.aktif ? '0' : '1'} />
                          <button className="tombol tenang" type="submit">
                            {m.aktif ? k.nonaktifkan : k.aktifkan}
                          </button>
                        </form>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          <PanelPesanan adaShift={d.shift !== null} tunaiAktif={d.metodeBayar.some((m) => m.jenis === 'tunai')} atasan={atasan} />
        </div>
        </PenyediaPos>
      </div>

      {cari.modal === 'buka-shift' && !d.shift ? <ModalBukaShift k={k} galat={cari.galat === 'shift'} /> : null}
      {cari.modal === 'kas' && d.shift ? <ModalKas k={k} shift={d.shift} galat={cari.galat === 'shift'} /> : null}
      {cari.modal === 'tutup-shift' && d.shift ? <ModalTutupShift k={k} shift={d.shift} galat={cari.galat === 'shift'} /> : null}
      {laporan ? <ModalLaporan k={k} l={laporan} /> : null}
      {struk ? <ModalStruk k={k} outlet={d.outlet.nama} s={struk} /> : null}
    </main>
  );
}

function Modal({ judul, sub, emoji, children }: { judul: string; sub: string; emoji: string; children: ReactNode }) {
  return (
    <div className="scrim">
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="judul-modal">
        <div className="mh">
          <span className="thumb">{emoji}</span>
          <div>
            <h2 id="judul-modal">{judul}</h2>
            <p className="muted">{sub}</p>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}

function GalatShift({ k, tampil }: { k: Kamus; tampil: boolean }) {
  return tampil ? (
    <p className="pesan galat" role="alert">
      {k.shift.gagal}
    </p>
  ) : null;
}

function TombolBatal({ k }: { k: Kamus }) {
  return (
    <Link className="tombol tenang" href="/kasir">
      {k.shift.batal}
    </Link>
  );
}

function ModalBukaShift({ k, galat }: { k: Kamus; galat: boolean }) {
  return (
    <Modal judul={k.shift.bukaJudul} sub={k.shift.bukaSub} emoji="💵">
      <GalatShift k={k} tampil={galat} />
      <form action={bukaShift}>
        {/* ID buatan klien: kirim ulang formulir yang sama tidak membuka Shift kedua. */}
        <input type="hidden" name="id" value={crypto.randomUUID()} />
        <label className="label">
          {k.shift.kasAwal}
          <input className="isian angka" name="kasAwal" inputMode="numeric" required autoFocus placeholder="300000" autoComplete="off" />
        </label>
        <div className="baris">
          <TombolBatal k={k} />
          <button className="tombol" type="submit">
            {k.shift.buka}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ModalKas({ k, shift, galat }: { k: Kamus; shift: ShiftTerbuka; galat: boolean }) {
  return (
    <Modal judul={k.shift.kasJudul} sub={k.shift.kasSub} emoji="🔁">
      <GalatShift k={k} tampil={galat} />
      <form action={catatKas}>
        <input type="hidden" name="shiftId" value={shift.id} />
        <input type="hidden" name="id" value={crypto.randomUUID()} />
        <fieldset className="pilih-jenis">
          <label>
            <input type="radio" name="jenis" value="masuk" required />
            {k.shift.masuk}
          </label>
          <label>
            <input type="radio" name="jenis" value="keluar" defaultChecked />
            {k.shift.keluarKas}
          </label>
        </fieldset>
        <label className="label">
          {k.shift.jumlah}
          <input className="isian angka" name="jumlah" inputMode="numeric" required autoComplete="off" />
        </label>
        <label className="label">
          {k.shift.alasan}
          <input className="isian" name="alasan" required maxLength={200} placeholder={k.shift.contohAlasan} />
        </label>
        <div className="baris">
          <TombolBatal k={k} />
          <button className="tombol" type="submit">
            {k.shift.simpan}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** Hitung Buta: hanya isian hasil hitung, tanpa angka sistem apa pun. */
function ModalTutupShift({ k, shift, galat }: { k: Kamus; shift: ShiftTerbuka; galat: boolean }) {
  return (
    <Modal judul={k.shift.tutupJudul} sub={k.shift.tutupSub} emoji="🔒">
      <GalatShift k={k} tampil={galat} />
      <form action={tutupShift}>
        <input type="hidden" name="shiftId" value={shift.id} />
        <label className="label">
          {k.shift.hitungButa}
          <input className="isian angka" name="hitungButa" inputMode="numeric" required autoFocus autoComplete="off" placeholder="0" />
        </label>
        <div className="baris">
          <TombolBatal k={k} />
          <button className="tombol tinta" type="submit">
            {k.shift.kunci}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ModalLaporan({ k, l }: { k: Kamus; l: LaporanShift }) {
  const kelasSelisih = l.selisih < 0 ? 'selisih-kurang' : l.selisih > 0 ? 'selisih-lebih' : 'selisih-pas';
  return (
    <Modal judul={k.laporan.judul} sub={`${l.dibukaOleh.nama} · ${jam(l.dibukaPada)}–${jam(l.ditutupPada)}`} emoji="🧾">
      <div className="totals" data-laporan-shift={l.id}>
        <span className="muted">{k.laporan.kasAwal}</span>
        <span>{rp(l.kasAwal)}</span>
        <span className="muted">{k.laporan.penjualanTunai}</span>
        <span>{rp(l.penjualanTunai)}</span>
        <span className="muted">{k.laporan.kasMasuk}</span>
        <span>{rp(l.kasMasuk)}</span>
        <span className="muted">{k.laporan.kasKeluar}</span>
        <span>−{rp(l.kasKeluar)}</span>
        <span>{k.laporan.seharusnya}</span>
        <span>{rp(l.kasSeharusnya)}</span>
        <span>{k.laporan.dihitung}</span>
        <span>{rp(l.hitungButa)}</span>
        <span className="grand">{k.laporan.selisih}</span>
        <span className={`grand ${kelasSelisih}`}>
          {l.selisih > 0 ? '+' : l.selisih < 0 ? '−' : ''}
          {rp(Math.abs(l.selisih))}
        </span>
        <span className="muted">{k.laporan.penjualanPerMetode}</span>
        <span>
          {l.penjualanPerMetodeBayar.length === 0
            ? k.laporan.belumAdaPenjualan
            : l.penjualanPerMetodeBayar.map((p) => `${k.namaMetodeBayar[p.jenis] ?? p.jenis} ${rp(p.nilai)}`).join(' · ')}
        </span>
        <span className="muted">{k.laporan.void}</span>
        <span>
          {l.void.jumlah} · {rp(l.void.nilai)}
        </span>
      </div>
      {l.kas.length > 0 ? (
        <div>
          <div className="sec-h">
            <h2>{k.laporan.catatan}</h2>
          </div>
          <ul className="catatan-kas">
            {l.kas.map((c) => (
              <li key={c.id}>
                <span>{c.alasan}</span>
                <span>
                  {c.jenis === 'keluar' ? '−' : '+'}
                  {rp(c.jumlah)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="baris">
        <TombolCetak label={k.laporan.cetak} />
        <Link className="tombol" href="/kasir">
          {k.laporan.selesai}
        </Link>
      </div>
    </Modal>
  );
}

/** Struk Tagihan lunas, dicetak lewat dialog cetak browser. */
function ModalStruk({ k, outlet, s }: { k: Kamus; outlet: string; s: TagihanLengkap }) {
  const p = k.pos;
  const item = s.pesanan.flatMap((x) => x.item).filter((i) => i.status !== 'batal');
  const tunai = s.pembayaran.reduce((n, b) => n + b.diterima, 0);
  const kembalian = s.pembayaran.reduce((n, b) => n + b.kembalian, 0);
  const labelPajak = s.profilPajak.hargaTermasukPajak ? p.pajakTermasuk(s.profilPajak.labelStruk) : s.profilPajak.labelStruk;
  return (
    <Modal judul={outlet} sub={`${p.struk.nota(s.nomorNota ?? 0)} · ${s.ditutupPada ? tanggalJam(s.ditutupPada) : ''}`} emoji="🧾">
      <div className="struk" data-struk={s.id} data-nomor-nota={s.nomorNota}>
        <p className="muted">
          {k.jenis[s.kanal]}
          {s.namaPelanggan ? ` · ${s.namaPelanggan}` : ''} · {s.pesanan.map((x) => x.nomorPesanan).join(' · ')}
        </p>
        <ul className="catatan-kas">
          {item.map((i) => (
            <li key={i.id}>
              <span>
                {i.jumlah}× {i.nama}
                {[i.namaVarian, ...i.pilihan.map((x) => x.nama)].filter(Boolean).length > 0 ? (
                  <small className="muted"> · {[i.namaVarian, ...i.pilihan.map((x) => x.nama)].filter(Boolean).join(' · ')}</small>
                ) : null}
              </span>
              <span>{rp((i.hargaSatuan + i.pilihan.reduce((n, x) => n + x.harga, 0)) * i.jumlah)}</span>
            </li>
          ))}
        </ul>
        <div className="totals">
          <span className="muted">{p.subtotal}</span>
          <span>{rp(s.rincian.subtotal)}</span>
          {s.rincian.serviceCharge > 0 ? (
            <>
              <span className="muted">{p.serviceCharge}</span>
              <span>{rp(s.rincian.serviceCharge)}</span>
            </>
          ) : null}
          {s.profilPajak.jenis !== 'tidak_dipungut' ? (
            <>
              <span className="muted">
                {labelPajak} {s.profilPajak.tarifPersen}%
              </span>
              <span>{rp(s.rincian.pajak)}</span>
            </>
          ) : null}
          <span className="grand">{p.total}</span>
          <span className="grand" data-total>
            {rp(s.rincian.total)}
          </span>
          <span className="muted">{p.struk.tunai}</span>
          <span>{rp(tunai)}</span>
          <span className="muted">{p.struk.kembalian}</span>
          <span data-kembalian>{rp(kembalian)}</span>
        </div>
        <p className="muted" style={{ textAlign: 'center' }}>
          {p.struk.terimaKasih}
        </p>
      </div>
      <div className="baris">
        <TombolCetak label={p.struk.cetak} />
        <Link className="tombol" href="/kasir">
          {p.struk.selesai}
        </Link>
      </div>
    </Modal>
  );
}
