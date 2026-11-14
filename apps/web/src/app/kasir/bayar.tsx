'use client';

import { type AturanPembulatanTunai, bulatkanTunai } from '@lifestore/domain';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { t } from '../../i18n/id';
import { bayar } from './aksi-dinein';

const k = t().kasir;
const p = k.pos;
const b = k.bayarLengkap;
const rp = (n: number) => `Rp${new Intl.NumberFormat('id-ID').format(n)}`;
const angka = (teks: string) => Number(teks.replace(/\D/g, '') || 0);

export interface MetodeBayarAktif {
  jenis: string;
  nama: string;
  keterangan: string | null;
}

/**
 * Terima Pembayaran: pilih Metode Bayar, isi jumlah (boleh sebagian = Bayar Terpisah), lalu uang
 * diterima (tunai) atau nomor referensi (QRIS statis, EDC, transfer). Angka di sini hanya tampilan;
 * API menghitung ulang sisa, Pembulatan Tunai, dan kembalian. Kunci idempoten dipakai ulang saat
 * mencoba lagi dan diganti setelah Pembayaran berhasil.
 */
export function ModalBayar({
  tagihanId,
  sisa,
  metode,
  adaShift,
  pembulatanTunai,
  tutup,
}: {
  tagihanId: string;
  sisa: number;
  metode: MetodeBayarAktif[];
  adaShift: boolean;
  pembulatanTunai: AturanPembulatanTunai | null;
  tutup(): void;
}) {
  const router = useRouter();
  const bisa = (jenis: string) => jenis !== 'tunai' || adaShift;
  const [kunci, setKunci] = useState(() => crypto.randomUUID());
  const [dipilih, setDipilih] = useState(() => (metode.find((m) => bisa(m.jenis)) ?? metode[0])?.jenis ?? 'tunai');
  const [teksJumlah, setTeksJumlah] = useState('');
  const [teksDiterima, setTeksDiterima] = useState('');
  const [referensi, setReferensi] = useState('');
  const [sibuk, setSibuk] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);

  const tunai = dipilih === 'tunai';
  const sisaTunai = bulatkanTunai(sisa, pembulatanTunai);
  const penuh = tunai ? sisaTunai : sisa;
  const jumlahDiisi = teksJumlah.trim() === '' ? null : angka(teksJumlah);
  const sebagian = jumlahDiisi !== null && jumlahDiisi < Math.min(sisa, penuh);
  const harusDibayar = sebagian ? jumlahDiisi : penuh;
  const pembulatan = tunai && !sebagian ? sisaTunai - sisa : 0;
  const diterima = angka(teksDiterima);
  const selisih = diterima - harusDibayar;
  const cepat = [...new Set([harusDibayar, ...[10_000, 20_000, 50_000, 100_000].map((n) => Math.ceil(harusDibayar / n) * n)])].slice(0, 4);
  const jumlahTidakValid = jumlahDiisi !== null && (jumlahDiisi < 1 || jumlahDiisi > Math.max(sisa, penuh));
  const bolehTerima = !sibuk && bisa(dipilih) && !jumlahTidakValid && (!tunai || selisih >= 0);

  async function terima() {
    setSibuk(true);
    setGalat(null);
    const hasil = await bayar(tagihanId, kunci, {
      metode: dipilih,
      ...(sebagian ? { jumlah: jumlahDiisi } : {}),
      ...(tunai ? { diterima } : { referensi: referensi.trim() || undefined }),
    });
    if (!hasil.ok) {
      setSibuk(false);
      setGalat(p.galat[hasil.kode] ?? p.galat.gagal!);
      return;
    }
    if (hasil.lunas) {
      router.push(`/kasir?struk=${encodeURIComponent(tagihanId)}`);
      return;
    }
    // Bayar Terpisah: Tagihan belum lunas, lanjut ke Pembayaran berikutnya dengan kunci baru.
    setKunci(crypto.randomUUID());
    setTeksJumlah('');
    setTeksDiterima('');
    setReferensi('');
    setSibuk(false);
    router.refresh();
  }

  return (
    <div className="scrim">
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="judul-bayar">
        <div className="mh">
          <span className="thumb">💵</span>
          <div>
            <h2 id="judul-bayar">{b.judul}</h2>
            <p className="muted" data-sisa={sisa}>
              {b.sisa(rp(sisa))}
            </p>
          </div>
        </div>
        {galat ? (
          <p className="pesan galat" role="alert">
            {galat}
          </p>
        ) : null}
        <div className="cepat" role="radiogroup" aria-label={b.metode}>
          {metode.map((m) => (
            <button
              key={m.jenis}
              type="button"
              role="radio"
              aria-checked={dipilih === m.jenis}
              data-metode={m.jenis}
              className={`tombol ${dipilih === m.jenis ? 'tinta' : 'tenang'}`}
              disabled={!bisa(m.jenis)}
              title={bisa(m.jenis) ? (m.keterangan ?? undefined) : p.perluShift}
              onClick={() => setDipilih(m.jenis)}
            >
              {m.nama}
            </button>
          ))}
        </div>
        {!adaShift && metode.some((m) => m.jenis === 'tunai') ? (
          <p className="muted" style={{ fontSize: 13 }}>
            {p.perluShift}
          </p>
        ) : null}
        <label className="label">
          {b.jumlah}
          <input
            className="isian angka"
            name="jumlah"
            inputMode="numeric"
            autoComplete="off"
            placeholder={rp(penuh)}
            value={teksJumlah}
            onChange={(e) => setTeksJumlah(e.target.value)}
          />
          <small className="muted">{jumlahTidakValid ? b.jumlahLebih : b.jumlahBantuan}</small>
        </label>
        {pembulatan !== 0 ? (
          <div className="osum" data-pembulatan={pembulatan}>
            <span>{b.pembulatan}</span>
            <span>
              {pembulatan > 0 ? '+' : '−'}
              {rp(Math.abs(pembulatan))}
            </span>
          </div>
        ) : null}
        {tunai ? (
          <>
            <label className="label">
              {p.diterima}
              <input
                className="isian angka"
                name="diterima"
                inputMode="numeric"
                autoFocus
                autoComplete="off"
                value={teksDiterima}
                onChange={(e) => setTeksDiterima(e.target.value)}
              />
            </label>
            <div className="cepat">
              {cepat.map((n, i) => (
                <button key={n} type="button" className="tombol tenang" onClick={() => setTeksDiterima(String(n))}>
                  {i === 0 ? p.uangPas : rp(n)}
                </button>
              ))}
            </div>
            <div className="ototal" data-kembalian={selisih}>
              <span>{selisih < 0 ? p.kurang : p.kembalian}</span>
              <b className={selisih < 0 ? 'selisih-kurang' : undefined}>{rp(Math.abs(selisih))}</b>
            </div>
          </>
        ) : (
          <>
            <label className="label">
              {b.referensi}
              <input className="isian" name="referensi" autoComplete="off" maxLength={100} value={referensi} onChange={(e) => setReferensi(e.target.value)} />
            </label>
            <div className="ototal" data-harus-dibayar={harusDibayar}>
              <span>{b.harusDibayar}</span>
              <b>{rp(harusDibayar)}</b>
            </div>
          </>
        )}
        <div className="baris">
          <button type="button" className="tombol tenang" onClick={tutup} disabled={sibuk}>
            {p.batal}
          </button>
          <button type="button" className="tombol" onClick={terima} disabled={!bolehTerima}>
            {sibuk ? p.memproses : p.terimaPembayaran}
          </button>
        </div>
      </div>
    </div>
  );
}
