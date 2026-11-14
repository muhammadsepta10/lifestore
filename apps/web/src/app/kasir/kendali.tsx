'use client';

import { useRouter } from 'next/navigation';
import { type ReactNode, useState } from 'react';
import { t } from '../../i18n/id';
import { batalItem, batalTagihan, bukaLaci, hapusDiskon, type HasilKendali, pasangDiskon, type Persetujuan, tandaiDiambil, voidTagihan } from './aksi-kendali';

const kd = t().kasir.kendali;
const rp = (n: number) => `Rp${new Intl.NumberFormat('id-ID').format(n)}`;

export interface Atasan {
  id: string;
  nama: string;
}

/**
 * Modal aksi sensitif. Aksi dicoba dulu tanpa bukti; bila API menjawab `perlu_persetujuan_atasan`
 * modal meminta atasan memilih namanya dan mengetik PIN di perangkat yang sama, lalu mengulang aksi.
 */
function ModalKendali({
  judul,
  sub,
  emoji,
  atasan,
  jalankan,
  siap = true,
  labelLanjut,
  tutup,
  selesai,
  children,
}: {
  judul: string;
  sub: string;
  emoji: string;
  atasan: Atasan[];
  jalankan(persetujuan?: Persetujuan): Promise<HasilKendali>;
  siap?: boolean;
  labelLanjut?: string;
  tutup(): void;
  selesai(): void;
  children?: ReactNode;
}) {
  const [sibuk, setSibuk] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);
  const [perluPin, setPerluPin] = useState(false);
  const [anggotaId, setAnggotaId] = useState(atasan[0]?.id ?? '');
  const [pin, setPin] = useState('');

  async function kirim() {
    setSibuk(true);
    setGalat(null);
    const hasil = await jalankan(perluPin ? { anggotaId, pin } : undefined);
    setSibuk(false);
    if (hasil.ok) {
      selesai();
      return;
    }
    if (hasil.kode === 'perlu_persetujuan_atasan') {
      setPerluPin(true);
      setGalat(hasil.batasPersen !== undefined ? kd.persetujuanBatas(hasil.batasPersen) : null);
      return;
    }
    setPin('');
    setGalat(kd.galat[hasil.kode] ?? kd.galat.gagal!);
  }

  return (
    <div className="scrim">
      <div className="modal" role="dialog" aria-modal="true" aria-label={judul} data-modal-kendali>
        <div className="mh">
          <span className="thumb">{emoji}</span>
          <div>
            <h2>{judul}</h2>
            <p className="muted">{sub}</p>
          </div>
        </div>
        {galat ? (
          <p className="pesan galat" role="alert">
            {galat}
          </p>
        ) : null}
        {children}
        {perluPin ? (
          <fieldset className="persetujuan" data-persetujuan>
            <legend>{kd.persetujuan}</legend>
            <p className="muted">{kd.persetujuanSub}</p>
            <label className="label">
              {kd.atasan}
              <select className="isian" name="atasan" value={anggotaId} onChange={(e) => setAnggotaId(e.target.value)}>
                {atasan.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.nama}
                  </option>
                ))}
              </select>
            </label>
            <label className="label">
              {kd.pinAtasan}
              <input
                className="isian angka"
                name="pinAtasan"
                type="password"
                inputMode="numeric"
                autoComplete="off"
                autoFocus
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
              />
            </label>
          </fieldset>
        ) : null}
        <div className="baris">
          <button type="button" className="tombol tenang" onClick={tutup} disabled={sibuk}>
            {kd.tutup}
          </button>
          <button type="button" className="tombol" onClick={kirim} disabled={sibuk || !siap || (perluPin && pin.length < 4)} data-lanjut>
            {sibuk ? kd.memproses : perluPin ? kd.setujui : (labelLanjut ?? kd.lanjut)}
          </button>
        </div>
      </div>
    </div>
  );
}

function IsianAlasan({ nilai, ubah }: { nilai: string; ubah(v: string): void }) {
  return (
    <label className="label">
      {kd.alasan}
      <input className="isian" name="alasan" autoComplete="off" maxLength={200} value={nilai} onChange={(e) => ubah(e.target.value)} />
    </label>
  );
}

/** Tombol "×" di baris Item Pesanan terkirim: batal langsung bila masih menunggu, selain itu minta alasan dan PIN atasan. */
export function TombolBatalItem({ tagihanId, item, atasan }: { tagihanId: string; item: { id: string; nama: string; status: string }; atasan: Atasan[] }) {
  const router = useRouter();
  const [buka, setBuka] = useState(false);
  const [alasan, setAlasan] = useState('');
  if (item.status === 'batal' || item.status === 'disajikan') return null;
  const sudahDimasak = item.status !== 'menunggu';
  return (
    <>
      <button type="button" className="obatal" onClick={() => setBuka(true)} aria-label={kd.batalItem(item.nama)} title={kd.batalItem(item.nama)} data-batal-item={item.nama}>
        ×
      </button>
      {buka ? (
        <ModalKendali
          judul={kd.batalItemJudul}
          sub={kd.batalItemSub(item.nama)}
          emoji="🗑️"
          atasan={atasan}
          siap={!sudahDimasak || alasan.trim() !== ''}
          jalankan={(bukti) => batalItem(tagihanId, item.id, alasan.trim(), bukti)}
          tutup={() => setBuka(false)}
          selesai={() => {
            setBuka(false);
            router.refresh();
          }}
        >
          <IsianAlasan nilai={alasan} ubah={setAlasan} />
        </ModalKendali>
      ) : null}
    </>
  );
}

/** Kendali Tagihan terpilih: Diskon Manual, dan void (berisi item) atau batal (masih kosong). */
export function KendaliTagihan({
  tagihanId,
  berisiItem,
  diskon,
  atasan,
}: {
  tagihanId: string;
  berisiItem: boolean;
  diskon: { jenis: 'persen' | 'nominal'; nilai: number } | null;
  atasan: Atasan[];
}) {
  const router = useRouter();
  const [modal, setModal] = useState<'diskon' | 'void' | null>(null);
  const [alasan, setAlasan] = useState('');
  const [jenis, setJenis] = useState<'persen' | 'nominal'>('persen');
  const [nilai, setNilai] = useState('');
  const [galat, setGalat] = useState<string | null>(null);
  const angka = Number(nilai.replace(/[^\d.]/g, '') || 0);
  const tutup = () => {
    setModal(null);
    setAlasan('');
  };
  const selesai = (ke?: string) => {
    tutup();
    if (ke) router.push(ke);
    else router.refresh();
  };

  async function langsung(aksi: () => Promise<HasilKendali>, ke?: string) {
    setGalat(null);
    const hasil = await aksi();
    if (hasil.ok) selesai(ke);
    else setGalat(kd.galat[hasil.kode] ?? kd.galat.gagal!);
  }

  return (
    <div className="okendali" data-kendali-tagihan>
      {galat ? (
        <p className="pesan galat" role="alert">
          {galat}
        </p>
      ) : null}
      <button type="button" className="tombol tenang" disabled={!berisiItem} onClick={() => setModal('diskon')} data-aksi="diskon">
        {kd.diskon}
      </button>
      {diskon ? (
        <button type="button" className="tombol tenang" onClick={() => langsung(() => hapusDiskon(tagihanId))} data-aksi="hapus-diskon">
          {kd.hapusDiskon}
        </button>
      ) : null}
      {berisiItem ? (
        <button type="button" className="tombol tenang bahaya" onClick={() => setModal('void')} data-aksi="void">
          {kd.voidTagihan}
        </button>
      ) : (
        <button type="button" className="tombol tenang bahaya" onClick={() => langsung(() => batalTagihan(tagihanId), '/kasir')} data-aksi="batal-tagihan">
          {kd.batalTagihan}
        </button>
      )}
      {modal === 'diskon' ? (
        <ModalKendali
          judul={kd.diskonJudul}
          sub={kd.diskonSub}
          emoji="🏷️"
          atasan={atasan}
          siap={alasan.trim() !== '' && angka > 0}
          labelLanjut={kd.pasang}
          jalankan={(bukti) => pasangDiskon(tagihanId, jenis, angka, alasan.trim(), bukti)}
          tutup={tutup}
          selesai={() => selesai()}
        >
          <div className="cepat">
            {(['persen', 'nominal'] as const).map((j) => (
              <button key={j} type="button" className={`tombol ${jenis === j ? 'tinta' : 'tenang'}`} aria-pressed={jenis === j} onClick={() => setJenis(j)}>
                {kd[j]}
              </button>
            ))}
          </div>
          <label className="label">
            {kd.nilai}
            <input className="isian angka" name="nilaiDiskon" inputMode="decimal" autoComplete="off" autoFocus value={nilai} onChange={(e) => setNilai(e.target.value)} />
          </label>
          <IsianAlasan nilai={alasan} ubah={setAlasan} />
        </ModalKendali>
      ) : null}
      {modal === 'void' ? (
        <ModalKendali
          judul={kd.voidJudul}
          sub={kd.voidSub}
          emoji="⛔"
          atasan={atasan}
          siap={alasan.trim() !== ''}
          labelLanjut={kd.voidTagihan}
          jalankan={(bukti) => voidTagihan(tagihanId, alasan.trim(), bukti)}
          tutup={tutup}
          selesai={() => selesai('/kasir')}
        >
          <IsianAlasan nilai={alasan} ubah={setAlasan} />
        </ModalKendali>
      ) : null}
    </div>
  );
}

/** Baris ringkasan Diskon Manual di rincian Tagihan. */
export function labelDiskon(diskon: { jenis: 'persen' | 'nominal'; nilai: number }): string {
  return kd.diskonTerpasang(diskon.jenis === 'persen' ? `${diskon.nilai}%` : rp(diskon.nilai));
}

/** Tombol buka laci tanpa transaksi di bilah atas. */
export function TombolBukaLaci({ atasan }: { atasan: Atasan[] }) {
  const [buka, setBuka] = useState(false);
  const [alasan, setAlasan] = useState('');
  const [info, setInfo] = useState(false);
  return (
    <>
      <button type="button" className="tombol tenang" onClick={() => setBuka(true)} data-aksi="buka-laci">
        {kd.bukaLaci}
      </button>
      {info ? (
        <span className="pil ok" role="status" data-laci-dibuka>
          {kd.laciDibuka}
        </span>
      ) : null}
      {buka ? (
        <ModalKendali
          judul={kd.bukaLaciJudul}
          sub={kd.bukaLaciSub}
          emoji="🗄️"
          atasan={atasan}
          siap={alasan.trim() !== ''}
          jalankan={(bukti) => bukaLaci(alasan.trim(), bukti)}
          tutup={() => setBuka(false)}
          selesai={() => {
            setBuka(false);
            setAlasan('');
            setInfo(true);
          }}
        >
          <IsianAlasan nilai={alasan} ubah={setAlasan} />
        </ModalKendali>
      ) : null}
    </>
  );
}

export interface PesananSiap {
  pesananId: string;
  nomorPesanan: string;
  namaPelanggan: string | null;
  item: { id: string; nama: string; jumlah: number; status: string }[];
}

/** Daftar Siap Diambil: Pesanan bawa pulang yang selesai dimasak dan menunggu pelanggan. */
export function SiapDiambil({ daftar }: { daftar: PesananSiap[] }) {
  const router = useRouter();
  const [sibuk, setSibuk] = useState<string | null>(null);
  async function diambil(ps: PesananSiap) {
    setSibuk(ps.pesananId);
    await tandaiDiambil(ps.item.filter((i) => i.status === 'siap').map((i) => i.id));
    setSibuk(null);
    router.refresh();
  }
  return (
    <section data-siap-diambil>
      <div className="sec-h">
        <h2>{kd.siapDiambil}</h2>
        <small>{daftar.length}</small>
      </div>
      {daftar.length === 0 ? (
        <p className="kosong">{kd.siapDiambilKosong}</p>
      ) : (
        <div className="ostrip">
          {daftar.map((ps) => (
            <div key={ps.pesananId} className="ocard siap" data-siap={ps.nomorPesanan}>
              <b>{ps.nomorPesanan}</b>
              <small>{ps.namaPelanggan ?? t().kasir.pos.tanpaNama}</small>
              <small>{ps.item.map((i) => `${i.jumlah}× ${i.nama}`).join(', ')}</small>
              <button type="button" className="tombol tenang" disabled={sibuk === ps.pesananId} onClick={() => diambil(ps)}>
                {kd.sudahDiambil}
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
