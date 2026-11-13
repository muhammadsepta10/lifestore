'use client';

import { hitungTagihan } from '@lifestore/domain';
import { PASTEL_KATEGORI, type PastelKategori } from '@lifestore/ui';
import { useRouter } from 'next/navigation';
import { createContext, type CSSProperties, type ReactNode, useContext, useMemo, useState } from 'react';
import { t } from '../../i18n/id';
import { bayarTunai, type ItemKiriman, kirimPesanan } from './aksi';
import type { KategoriJual, MenuJual, TagihanLengkap } from './tipe';

/**
 * Bagian interaktif kasir varian B: keranjang (item yang belum dikirim) hidup di perangkat,
 * total diperbarui langsung dengan Hitung Tagihan dari paket domain (fungsi yang sama dengan API),
 * lalu dikirim sebagai satu Pesanan. Angka di layar hanya tampilan; API selalu menghitung ulang.
 */

const k = t().kasir;
const p = k.pos;
const rp = (n: number) => `Rp${new Intl.NumberFormat('id-ID').format(n)}`;
const tint = (warna: string | undefined): CSSProperties => ({ ['--tint' as string]: PASTEL_KATEGORI[warna as PastelKategori] ?? PASTEL_KATEGORI.sand });

interface BarisKeranjang {
  kunci: string;
  menuId: string;
  nama: string;
  varianId?: string;
  namaVarian?: string;
  hargaSatuan: number;
  pilihan: { id: string; nama: string; harga: number }[];
  bebasPajak: boolean;
  jumlah: number;
  catatan: string;
}

interface KeadaanPos {
  tagihan: TagihanLengkap | null;
  keranjang: BarisKeranjang[];
  tambah(baris: Omit<BarisKeranjang, 'kunci'>): void;
  ubahJumlah(kunci: string, selisih: number): void;
  kosongkan(): void;
}

const KonteksPos = createContext<KeadaanPos | null>(null);

function usePos(): KeadaanPos {
  const pos = useContext(KonteksPos);
  if (!pos) throw new Error('Komponen kasir harus berada di dalam <PenyediaPos>.');
  return pos;
}

const kunciBaris = (b: Omit<BarisKeranjang, 'kunci' | 'jumlah'>) => [b.menuId, b.varianId ?? '', b.pilihan.map((x) => x.id).join(','), b.catatan].join('|');

/** Menyimpan keranjang Tagihan terpilih. Beri `key` = ID Tagihan supaya keranjang tidak terbawa ke Tagihan lain. */
export function PenyediaPos({ tagihan, children }: { tagihan: TagihanLengkap | null; children: ReactNode }) {
  const [keranjang, setKeranjang] = useState<BarisKeranjang[]>([]);
  const nilai = useMemo<KeadaanPos>(
    () => ({
      tagihan,
      keranjang,
      tambah(baris) {
        const kunci = kunciBaris(baris);
        setKeranjang((lama) =>
          lama.some((b) => b.kunci === kunci)
            ? lama.map((b) => (b.kunci === kunci ? { ...b, jumlah: b.jumlah + baris.jumlah } : b))
            : [...lama, { ...baris, kunci }],
        );
      },
      ubahJumlah(kunci, selisih) {
        setKeranjang((lama) => lama.map((b) => (b.kunci === kunci ? { ...b, jumlah: b.jumlah + selisih } : b)).filter((b) => b.jumlah > 0));
      },
      kosongkan: () => setKeranjang([]),
    }),
    [tagihan, keranjang],
  );
  return <KonteksPos.Provider value={nilai}>{children}</KonteksPos.Provider>;
}

/** Grid kartu Menu. Menu Habis tampil redup dan tidak bisa ditambahkan. */
export function GridMenu({ menu, kategori }: { menu: MenuJual[]; kategori: KategoriJual[] }) {
  const pos = usePos();
  const [dipilih, setDipilih] = useState<MenuJual | null>(null);
  const kat = new Map(kategori.map((x) => [x.id, x]));
  const bisaTambah = pos.tagihan !== null;

  function ketuk(m: MenuJual) {
    if (m.varian.length > 0 || m.grupPilihan.length > 0) setDipilih(m);
    else pos.tambah({ menuId: m.id, nama: m.nama, hargaSatuan: m.harga, pilihan: [], bebasPajak: m.bebasPajak, jumlah: 1, catatan: '' });
  }

  return (
    <>
      {bisaTambah ? null : (
        <p className="pesan info" role="status">
          {p.pilihTagihanDulu}
        </p>
      )}
      <div className="mgrid">
        {menu.map((m) => {
          const x = kat.get(m.kategoriId);
          return (
            <button
              key={m.id}
              type="button"
              className={`mcard${m.habis ? ' habis' : ''}`}
              style={tint(x?.warna)}
              disabled={m.habis || !bisaTambah}
              onClick={() => ketuk(m)}
              data-menu={m.nama}
            >
              <span className="mvis">
                <span aria-hidden="true">{x?.ikon ?? '🍴'}</span>
                {m.habis ? <span className="pil danger">{k.habis}</span> : null}
              </span>
              <span className="mbody">
                <b>{m.nama}</b>
                <span className="harga">{rp(m.varian.length > 0 ? Math.min(...m.varian.map((v) => v.harga)) : m.harga)}</span>
                <small>{x?.nama}</small>
              </span>
            </button>
          );
        })}
      </div>
      {dipilih ? (
        <ModalPilih
          menu={dipilih}
          tutup={() => setDipilih(null)}
          tambah={(baris) => {
            pos.tambah(baris);
            setDipilih(null);
          }}
        />
      ) : null}
    </>
  );
}

/** Pilih Varian (wajib tepat satu), pilihan Grup Pilihan (mengikuti minimum/maksimum), catatan, dan jumlah. */
function ModalPilih({ menu, tutup, tambah }: { menu: MenuJual; tutup(): void; tambah(b: Omit<BarisKeranjang, 'kunci'>): void }) {
  const [varianId, setVarianId] = useState<string | undefined>(menu.varian[0]?.id);
  const [pilihanIds, setPilihanIds] = useState<string[]>([]);
  const [catatan, setCatatan] = useState('');
  const [jumlah, setJumlah] = useState(1);

  const varian = menu.varian.find((v) => v.id === varianId);
  const semuaPilihan = menu.grupPilihan.flatMap((g) => g.pilihan);
  const terpilih = semuaPilihan.filter((x) => pilihanIds.includes(x.id));
  const jumlahDi = (g: MenuJual['grupPilihan'][number]) => g.pilihan.filter((x) => pilihanIds.includes(x.id)).length;
  const sah = (menu.varian.length === 0 || varian !== undefined) && menu.grupPilihan.every((g) => jumlahDi(g) >= g.minimum && jumlahDi(g) <= g.maksimum);
  const hargaSatuan = varian?.harga ?? menu.harga;
  const hargaUnit = hargaSatuan + terpilih.reduce((s, x) => s + x.harga, 0);

  function ganti(g: MenuJual['grupPilihan'][number], id: string) {
    setPilihanIds((lama) => {
      if (lama.includes(id)) return lama.filter((x) => x !== id);
      // Grup dengan maksimum 1 berperilaku seperti radio: pilihan baru menggantikan yang lama.
      if (g.maksimum === 1) return [...lama.filter((x) => !g.pilihan.some((y) => y.id === x)), id];
      return jumlahDi(g) >= g.maksimum ? lama : [...lama, id];
    });
  }

  return (
    <div className="scrim">
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="judul-pilih">
        <div className="mh">
          <span className="thumb">🍽️</span>
          <div>
            <h2 id="judul-pilih">{menu.nama}</h2>
            <p className="muted">{p.pilihJudul}</p>
          </div>
        </div>
        {menu.varian.length > 0 ? (
          <fieldset className="opsi">
            <legend>{p.varian}</legend>
            {menu.varian.map((v) => (
              <label key={v.id}>
                <input type="radio" name="varian" checked={varianId === v.id} onChange={() => setVarianId(v.id)} />
                <span>{v.nama}</span>
                <span className="harga">{rp(v.harga)}</span>
              </label>
            ))}
          </fieldset>
        ) : null}
        {menu.grupPilihan.map((g) => (
          <fieldset key={g.id} className="opsi">
            <legend>
              {g.nama} <small className="muted">· {p.aturanPilihan(g.minimum, g.maksimum)}</small>
            </legend>
            {g.pilihan.map((x) => (
              <label key={x.id}>
                <input type="checkbox" checked={pilihanIds.includes(x.id)} onChange={() => ganti(g, x.id)} />
                <span>{x.nama}</span>
                <span className="harga">{x.harga === 0 ? p.gratis : `+${rp(x.harga)}`}</span>
              </label>
            ))}
          </fieldset>
        ))}
        <label className="label">
          {p.catatan}
          <input className="isian" value={catatan} onChange={(e) => setCatatan(e.target.value)} maxLength={200} placeholder={p.contohCatatan} />
        </label>
        <div className="baris-jumlah">
          <span className="label">{p.jumlah}</span>
          <Langkah nama={menu.nama} jumlah={jumlah} ubah={(d) => setJumlah((n) => Math.max(1, n + d))} />
        </div>
        <div className="baris">
          <button type="button" className="tombol tenang" onClick={tutup}>
            {p.batal}
          </button>
          <button
            type="button"
            className="tombol"
            disabled={!sah}
            onClick={() =>
              tambah({
                menuId: menu.id,
                nama: menu.nama,
                varianId: varian?.id,
                namaVarian: varian?.nama,
                hargaSatuan,
                pilihan: terpilih,
                bebasPajak: menu.bebasPajak,
                jumlah,
                catatan: catatan.trim(),
              })
            }
          >
            {p.tambahKePesanan} · {rp(hargaUnit * jumlah)}
          </button>
        </div>
      </div>
    </div>
  );
}

function Langkah({ nama, jumlah, ubah }: { nama: string; jumlah: number; ubah(selisih: number): void }) {
  return (
    <span className="ostep">
      <button type="button" onClick={() => ubah(-1)} aria-label={p.kurangi(nama)}>
        −
      </button>
      <span className="angka-jumlah">{jumlah}</span>
      <button type="button" className="inc" onClick={() => ubah(1)} aria-label={p.tambah(nama)}>
        +
      </button>
    </span>
  );
}

function rincianBaris(b: { namaVarian?: string | null; pilihan: { nama: string }[]; catatan?: string | null }) {
  return [b.namaVarian, ...b.pilihan.map((x) => x.nama)].filter(Boolean).join(' · ');
}

/** Panel kanan: Pesanan terkirim, keranjang, rincian langsung, Kirim Pesanan, dan Bayar tunai. */
export function PanelPesanan({ adaShift, tunaiAktif }: { adaShift: boolean; tunaiAktif: boolean }) {
  const pos = usePos();
  const router = useRouter();
  const { tagihan, keranjang } = pos;
  const [kunciPesanan, setKunciPesanan] = useState(() => crypto.randomUUID());
  const [sibuk, setSibuk] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);
  const [bayar, setBayar] = useState(false);

  const terkirim = useMemo(() => tagihan?.pesanan.flatMap((x) => x.item) ?? [], [tagihan]);
  const rincian = useMemo(
    () =>
      tagihan
        ? hitungTagihan({
            items: [
              ...terkirim.map((i) => ({ hargaSatuan: i.hargaSatuan, jumlah: i.jumlah, pilihan: i.pilihan, bebasPajak: i.bebasPajak, batal: i.status === 'batal' })),
              ...keranjang,
            ],
            kanal: tagihan.kanal,
            profilPajak: tagihan.profilPajak,
            serviceCharge: tagihan.serviceCharge,
          })
        : null,
    [tagihan, terkirim, keranjang],
  );

  if (!tagihan || !rincian) {
    return (
      <aside className="order kartu" aria-label={k.pesananSaatIni}>
        <div className="ohead">
          <div>
            <h3>{k.pesananSaatIni}</h3>
            <small>{k.belumDipilih}</small>
          </div>
        </div>
        <div className="kosong-besar">
          <span className="besar">🧾</span>
          <b>{p.pilihTagihanJudul}</b>
          <span>{p.pilihTagihanDulu}</span>
        </div>
      </aside>
    );
  }

  async function kirim() {
    if (!tagihan) return;
    setSibuk(true);
    setGalat(null);
    const item: ItemKiriman[] = keranjang.map((b) => ({
      menuId: b.menuId,
      varianId: b.varianId,
      pilihanIds: b.pilihan.map((x) => x.id),
      jumlah: b.jumlah,
      catatan: b.catatan || undefined,
    }));
    const hasil = await kirimPesanan(tagihan.id, kunciPesanan, item);
    setSibuk(false);
    if (!hasil.ok) {
      setGalat(p.galat[hasil.kode] ?? p.galat.gagal!);
      // Ditolak API (misal Menu Habis): keranjang akan berubah, jadi kiriman berikutnya Pesanan baru.
      if (hasil.kode !== 'gagal') setKunciPesanan(crypto.randomUUID());
      router.refresh();
      return;
    }
    pos.kosongkan();
    setKunciPesanan(crypto.randomUUID());
    router.refresh();
  }

  const adaKeranjang = keranjang.length > 0;
  const adaTerkirim = terkirim.some((i) => i.status !== 'batal');
  const halangan = adaKeranjang || !adaTerkirim ? p.kirimDulu : !tunaiAktif ? p.tunaiNonaktif : !adaShift ? p.perluShift : null;
  const labelPajak = tagihan.profilPajak.hargaTermasukPajak ? p.pajakTermasuk(tagihan.profilPajak.labelStruk) : tagihan.profilPajak.labelStruk;

  return (
    <aside className="order kartu" aria-label={k.pesananSaatIni} data-tagihan={tagihan.id}>
      <div className="ohead">
        <div>
          <h3>{tagihan.namaPelanggan ?? p.tanpaNama}</h3>
          <small>{tagihan.pesanan.length > 0 ? tagihan.pesanan.map((x) => x.nomorPesanan).join(' · ') : p.belumAdaPesanan}</small>
        </div>
        <span className="pil info">{k.jenis[tagihan.kanal]}</span>
      </div>

      <div className="olines">
        {tagihan.pesanan.map((ps) => (
          <div key={ps.id} className="ogroup" data-pesanan={ps.nomorPesanan}>
            <div className="ogroup-h">
              <b>{p.pesananNomor(ps.nomorPesanan)}</b>
              <span className="pil ok">{p.terkirim}</span>
            </div>
            {ps.item.map((i) => (
              <div key={i.id} className={`oline${i.status === 'batal' ? ' batal' : ''}`}>
                <span className="oqty">{i.jumlah}×</span>
                <span className="oname">
                  <b>{i.nama}</b>
                  <small>{[rincianBaris(i), i.catatan].filter(Boolean).join(' — ')}</small>
                </span>
                <span className="oprice">{rp((i.hargaSatuan + i.pilihan.reduce((s, x) => s + x.harga, 0)) * i.jumlah)}</span>
                <span className="pil redup ostatus">{p.statusItem[i.status] ?? i.status}</span>
              </div>
            ))}
          </div>
        ))}
        {adaKeranjang ? (
          <div className="ogroup" data-keranjang>
            <div className="ogroup-h">
              <b>{p.belumDikirim}</b>
              <span className="pil warn">{p.jumlahItem(keranjang.reduce((s, b) => s + b.jumlah, 0))}</span>
            </div>
            {keranjang.map((b) => (
              <div key={b.kunci} className="oline">
                <Langkah nama={b.nama} jumlah={b.jumlah} ubah={(d) => pos.ubahJumlah(b.kunci, d)} />
                <span className="oname">
                  <b>{b.nama}</b>
                  <small>{[rincianBaris(b), b.catatan].filter(Boolean).join(' — ')}</small>
                </span>
                <span className="oprice">{rp((b.hargaSatuan + b.pilihan.reduce((s, x) => s + x.harga, 0)) * b.jumlah)}</span>
              </div>
            ))}
          </div>
        ) : tagihan.pesanan.length === 0 ? (
          <p className="muted" style={{ fontSize: 14 }}>
            {p.keranjangKosong}
          </p>
        ) : null}
      </div>

      <div className="osum" data-rincian>
        <span>{p.subtotal}</span>
        <span data-subtotal>{rp(rincian.subtotal)}</span>
        {rincian.serviceCharge > 0 ? (
          <>
            <span>{p.serviceCharge}</span>
            <span>{rp(rincian.serviceCharge)}</span>
          </>
        ) : null}
        {tagihan.profilPajak.jenis !== 'tidak_dipungut' ? (
          <>
            <span>
              {labelPajak} {tagihan.profilPajak.tarifPersen}%
            </span>
            <span data-pajak>{rp(rincian.pajak)}</span>
          </>
        ) : null}
      </div>
      <div className="ototal">
        <span>{p.total}</span>
        <b data-total>{rp(rincian.total)}</b>
      </div>

      {galat ? (
        <p className="pesan galat" role="alert">
          {galat}
        </p>
      ) : null}
      {adaKeranjang ? (
        <button className="tombol tinta besar lebar" type="button" onClick={kirim} disabled={sibuk}>
          {sibuk ? p.mengirim : p.kirimPesanan}
        </button>
      ) : null}
      <button className="tombol besar lebar" type="button" disabled={halangan !== null} onClick={() => setBayar(true)} title={halangan ?? undefined}>
        {p.bayarTunai(rp(rincian.total))}
      </button>
      {halangan && adaTerkirim && !adaKeranjang ? (
        <p className="muted" style={{ fontSize: 13 }} role="status">
          {halangan}
        </p>
      ) : null}
      {bayar ? <ModalBayar tagihanId={tagihan.id} total={tagihan.sisa} tutup={() => setBayar(false)} /> : null}
    </aside>
  );
}

/** Bayar tunai: ketik uang diterima, kembalian langsung terlihat. Kunci idempoten dipakai ulang saat mencoba lagi. */
function ModalBayar({ tagihanId, total, tutup }: { tagihanId: string; total: number; tutup(): void }) {
  const router = useRouter();
  const [kunci] = useState(() => crypto.randomUUID());
  const [teks, setTeks] = useState('');
  const [sibuk, setSibuk] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);
  const diterima = Number(teks.replace(/\D/g, '') || 0);
  const selisih = diterima - total;
  const cepat = [...new Set([total, ...[10_000, 20_000, 50_000, 100_000].map((n) => Math.ceil(total / n) * n)])].slice(0, 4);

  async function terima() {
    setSibuk(true);
    setGalat(null);
    const hasil = await bayarTunai(tagihanId, kunci, diterima);
    if (hasil.ok) {
      router.push(`/kasir?struk=${encodeURIComponent(tagihanId)}`);
      return;
    }
    setSibuk(false);
    setGalat(p.galat[hasil.kode] ?? p.galat.gagal!);
  }

  return (
    <div className="scrim">
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="judul-bayar">
        <div className="mh">
          <span className="thumb">💵</span>
          <div>
            <h2 id="judul-bayar">{p.bayarJudul}</h2>
            <p className="muted">{p.bayarSub(rp(total))}</p>
          </div>
        </div>
        {galat ? (
          <p className="pesan galat" role="alert">
            {galat}
          </p>
        ) : null}
        <label className="label">
          {p.diterima}
          <input className="isian angka" name="diterima" inputMode="numeric" autoFocus autoComplete="off" value={teks} onChange={(e) => setTeks(e.target.value)} />
        </label>
        <div className="cepat">
          {cepat.map((n, i) => (
            <button key={n} type="button" className="tombol tenang" onClick={() => setTeks(String(n))}>
              {i === 0 ? p.uangPas : rp(n)}
            </button>
          ))}
        </div>
        <div className="ototal" data-kembalian={selisih}>
          <span>{selisih < 0 ? p.kurang : p.kembalian}</span>
          <b className={selisih < 0 ? 'selisih-kurang' : undefined}>{rp(Math.abs(selisih))}</b>
        </div>
        <div className="baris">
          <button type="button" className="tombol tenang" onClick={tutup} disabled={sibuk}>
            {p.batal}
          </button>
          <button type="button" className="tombol" onClick={terima} disabled={sibuk || selisih < 0}>
            {sibuk ? p.memproses : p.terimaPembayaran}
          </button>
        </div>
      </div>
    </div>
  );
}
