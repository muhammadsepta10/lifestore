import type { Kamus } from '../../i18n/id';
import { gabungMeja, pindahMeja, pisahTagihan } from './aksi-dinein';
import type { MejaKasir, TagihanLengkap } from './tipe';

/**
 * Atur Tagihan terbuka yang sedang dipilih: pindah Meja, gabung Meja, dan Pisah Tagihan.
 * Semuanya formulir biasa (server action), jadi tetap jalan tanpa JavaScript klien.
 */
export function AturTagihan({ k, tagihan, meja, galat }: { k: Kamus['kasir']; tagihan: TagihanLengkap; meja: MejaKasir[]; galat: boolean }) {
  const a = k.dineIn;
  const item = tagihan.pesanan.flatMap((p) => p.item.map((i) => ({ ...i, nomorPesanan: p.nomorPesanan }))).filter((i) => i.status !== 'batal');
  const dineIn = tagihan.kanal === 'dine_in';
  const milikSendiri = new Set(tagihan.meja.map((m) => m.id));
  const mejaKosong = meja.filter((m) => m.aktif && m.status === 'kosong');
  const mejaLain = meja.filter((m) => m.aktif && !milikSendiri.has(m.id));
  const bisaPisah = item.length > 1 && tagihan.dibayar === 0;
  if (!dineIn && !bisaPisah) return null;

  return (
    <section data-atur-tagihan={tagihan.id}>
      <div className="sec-h">
        <h2>{a.aturJudul}</h2>
        {dineIn ? <small>{a.diMeja(tagihan.meja.map((m) => m.label).join(' + '))}</small> : null}
      </div>
      {galat ? (
        <p className="pesan galat" role="alert">
          {a.aturGagal}
        </p>
      ) : null}
      <div className="atur-grid">
        {dineIn ? (
          <form action={pindahMeja} className="kartu atur">
            <input type="hidden" name="tagihanId" value={tagihan.id} />
            <label className="label">
              {a.pindahMeja}
              <select className="isian" name="mejaId" required defaultValue="">
                <option value="" disabled>
                  {a.pilihMeja}
                </option>
                {mejaKosong.map((m) => (
                  <option key={m.id} value={m.id}>
                    {a.meja(m.label)}
                  </option>
                ))}
              </select>
            </label>
            <button className="tombol tenang" type="submit" disabled={mejaKosong.length === 0}>
              {a.pindah}
            </button>
          </form>
        ) : null}
        {dineIn ? (
          <form action={gabungMeja} className="kartu atur">
            <input type="hidden" name="tagihanId" value={tagihan.id} />
            <label className="label">
              {a.gabungMeja}
              <select className="isian" name="mejaId" required defaultValue="">
                <option value="" disabled>
                  {a.pilihMeja}
                </option>
                {mejaLain.map((m) => (
                  <option key={m.id} value={m.id}>
                    {a.meja(m.label)} · {k.statusMeja[m.status] ?? m.status}
                  </option>
                ))}
              </select>
            </label>
            <small className="muted">{a.gabungBantuan}</small>
            <button className="tombol tenang" type="submit" disabled={mejaLain.length === 0}>
              {a.gabung}
            </button>
          </form>
        ) : null}
        {bisaPisah ? (
          <form action={pisahTagihan} className="kartu atur">
            <input type="hidden" name="tagihanId" value={tagihan.id} />
            {/* ID Tagihan baru dibuat saat formulir dirender: kirim ulang tidak membuat Tagihan ketiga. */}
            <input type="hidden" name="id" value={crypto.randomUUID()} />
            <fieldset className="pisah-item">
              <legend className="label">{a.pisahTagihan}</legend>
              {item.map((i) => (
                <label key={i.id} className="centang">
                  <input type="checkbox" name="itemId" value={i.id} />
                  <span>
                    {i.jumlah}× {i.nama}
                    {i.namaVarian ? ` · ${i.namaVarian}` : ''} <small className="muted">{i.nomorPesanan}</small>
                  </span>
                </label>
              ))}
            </fieldset>
            <label className="label">
              {a.namaTagihanBaru}
              <input className="isian" name="namaPelanggan" maxLength={100} autoComplete="off" />
            </label>
            <small className="muted">{a.pisahBantuan}</small>
            <button className="tombol tenang" type="submit">
              {a.pisah}
            </button>
          </form>
        ) : null}
      </div>
    </section>
  );
}
