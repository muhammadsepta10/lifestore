import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { tanggalOperasional } from '../src/penjualan/nomor';
import { buatDuniaTes, type DuniaTes, type KasirTes, type PemilikTes } from './support/dunia-tes';

// Seam (#40): dashboard hari ini dan Tagihan tertutup lewat HTTP terhadap Postgres sungguhan.
// Angka dihitung tangan dari Profil Pajak default (PBJT 10%, harga belum termasuk pajak).

const SATU_HARI = 24 * 60 * 60 * 1000;

async function jual(kasir: KasirTes, menuId: string, jumlah: number, metode: string): Promise<string> {
  const tagihanId = await kasir.bukaTagihan();
  await kasir.kirimPesanan(tagihanId, [{ menuId, jumlah }]).expect(201);
  await kasir.bayar(tagihanId, metode === 'tunai' ? { metode, diterima: 10_000_000 } : { metode }).expect(201);
  return tagihanId;
}

async function siapkan(dunia: DuniaTes, harga: number): Promise<{ pemilik: PemilikTes; kasir: KasirTes; menuId: string }> {
  const pemilik = await dunia.daftarTenant();
  await pemilik.aktifkanMetodeBayar('tunai');
  await pemilik.aktifkanMetodeBayar('qris_statis');
  const menuId = await pemilik.buatMenu({ nama: 'Mie', harga });
  const kasir = await pemilik.bukaKasir();
  await kasir.bukaShift(0);
  return { pemilik, kasir, menuId };
}

describe('Dashboard hari ini dan Tagihan tertutup', () => {
  let dunia: DuniaTes;
  beforeAll(async () => {
    dunia = await buatDuniaTes();
  });
  afterAll(() => dunia?.tutup());

  it('angka hari ini per Outlet cocok dengan Tagihan lunas; Tagihan terbuka, kemarin, dan Pembulatan Tunai tidak ikut', async () => {
    const { pemilik, kasir, menuId } = await siapkan(dunia, 7_140); // 7.854 per porsi
    await pemilik.aturOutlet({ pembulatanTunai: { kelipatan: 100, arah: 'terdekat' } });
    const outletKedua = await pemilik.tambahOutlet({ nama: 'Outlet Kedua' });
    await pemilik.aktifkanMetodeBayar('tunai', outletKedua);
    const kasirKedua = await pemilik.bukaKasir({ outletId: outletKedua });
    await kasirKedua.bukaShift(0);

    // Kemarin: satu Tagihan lunas yang tidak boleh masuk angka hari ini.
    await jual(kasir, menuId, 1, 'tunai');
    dunia.jam.maju(SATU_HARI);
    const hariIni = tanggalOperasional(dunia.jam.sekarang());

    // Hari ini di Outlet pertama: tunai 7.854 (dibayar 7.900), QRIS 15.708, dan Bayar Terpisah 23.562 (QRIS 10.000 + tunai 13.562 → 13.600).
    const tunai = await jual(kasir, menuId, 1, 'tunai');
    const qris = await jual(kasir, menuId, 2, 'qris_statis');
    const campur = await kasir.bukaTagihan();
    await kasir.kirimPesanan(campur, [{ menuId, jumlah: 3 }]).expect(201);
    await kasir.bayar(campur, { metode: 'qris_statis', jumlah: 10_000 }).expect(201);
    await kasir.bayarTunai(campur, 13_600).expect(201);
    // Tagihan yang masih terbuka (baru dibayar sebagian) belum menjadi penjualan.
    const terbuka = await kasir.bukaTagihan();
    await kasir.kirimPesanan(terbuka, [{ menuId, jumlah: 5 }]).expect(201);
    await kasir.bayar(terbuka, { metode: 'qris_statis', jumlah: 1_000 }).expect(201);
    // Outlet kedua: satu Tagihan tunai tanpa pembulatan.
    const diKedua = await jual(kasirKedua, menuId, 1, 'tunai');

    const pertama = (await pemilik.get(`/v1/outlet/${pemilik.outletId}/penjualan/hari-ini`).expect(200)).body;
    expect(pertama).toEqual({
      outletId: pemilik.outletId,
      tanggal: hariIni,
      penjualan: 47_124,
      jumlahTagihan: 3,
      pembulatanTunai: 84,
      perMetodeBayar: [
        { jenis: 'tunai', jumlah: 2, nilai: 21_416 },
        { jenis: 'qris_statis', jumlah: 2, nilai: 25_708 },
      ],
    });
    // Angka dashboard = jumlah total Tagihan lunas hari ini.
    const tertutup = (await pemilik.get(`/v1/outlet/${pemilik.outletId}/tagihan`).expect(200)).body as { id: string; total: number; nomorNota: number }[];
    expect(tertutup.map((t) => [t.id, t.nomorNota, t.total])).toEqual([
      [campur, 4, 23_562],
      [qris, 3, 15_708],
      [tunai, 2, 7_854],
    ]);
    expect(tertutup.reduce((s, t) => s + t.total, 0)).toBe(pertama.penjualan);

    const dashboard = (await pemilik.get('/v1/dashboard').expect(200)).body;
    expect(dashboard.outlet.map((o: { id: string; penjualanHariIni: { penjualan: number; jumlahTagihan: number } }) => [o.id, o.penjualanHariIni.penjualan, o.penjualanHariIni.jumlahTagihan])).toEqual([
      [pemilik.outletId, 47_124, 3],
      [outletKedua, 7_854, 1],
    ]);
    expect(dashboard.penjualanHariIni).toMatchObject({ tanggal: hariIni, penjualan: 54_978, jumlahTagihan: 4 });

    // Daftar kemarin lewat `tanggal`, dan detail Tagihan tertutup dengan Pesanan dan Pembayaran.
    const kemarin = tanggalOperasional(new Date(dunia.jam.sekarang().getTime() - SATU_HARI));
    expect((await pemilik.get(`/v1/outlet/${pemilik.outletId}/tagihan?tanggal=${kemarin}`).expect(200)).body).toMatchObject([{ nomorNota: 1, total: 7_854 }]);
    await pemilik.get(`/v1/outlet/${pemilik.outletId}/tagihan?tanggal=kemarin`).expect(400);
    const detail = (await pemilik.get(`/v1/outlet/${pemilik.outletId}/tagihan/${campur}`).expect(200)).body;
    expect(detail).toMatchObject({ id: campur, status: 'lunas', nomorNota: 4, total: 23_562, pembulatanTunai: 38 });
    expect(detail.pesanan[0].item[0]).toMatchObject({ nama: 'Mie', jumlah: 3 });
    expect(detail.pembayaran.map((p: { metode: string; jumlah: number }) => [p.metode, p.jumlah])).toEqual([
      ['qris_statis', 10_000],
      ['tunai', 13_600],
    ]);
    // Tagihan Outlet lain tidak terbuka lewat Outlet ini.
    await pemilik.get(`/v1/outlet/${pemilik.outletId}/tagihan/${diKedua}`).expect(404);
  });

  it('daftar dan detail Tagihan tertutup hanya menampilkan data Tenant sendiri', async () => {
    const a = await siapkan(dunia, 10_000);
    const b = await siapkan(dunia, 20_000);
    const tagihanA = await jual(a.kasir, a.menuId, 1, 'tunai');
    const tagihanB = await jual(b.kasir, b.menuId, 1, 'tunai');

    expect(((await a.pemilik.get(`/v1/outlet/${a.pemilik.outletId}/tagihan`).expect(200)).body as { id: string }[]).map((t) => t.id)).toEqual([tagihanA]);
    expect((await a.pemilik.get(`/v1/outlet/${a.pemilik.outletId}/penjualan/hari-ini`).expect(200)).body).toMatchObject({ penjualan: 11_000, jumlahTagihan: 1 });
    expect((await a.pemilik.get('/v1/dashboard').expect(200)).body.penjualanHariIni).toMatchObject({ penjualan: 11_000, jumlahTagihan: 1 });
    // Outlet dan Tagihan Tenant B tidak ditemukan dari Tenant A, lewat jalur mana pun.
    for (const path of [
      `/v1/outlet/${b.pemilik.outletId}/tagihan`,
      `/v1/outlet/${b.pemilik.outletId}/penjualan/hari-ini`,
      `/v1/outlet/${b.pemilik.outletId}/tagihan/${tagihanB}`,
      `/v1/outlet/${a.pemilik.outletId}/tagihan/${tagihanB}`,
    ]) {
      expect((await a.pemilik.get(path)).status, path).toBe(404);
    }
    // Karyawan tanpa izin dashboard di Outlet itu ditolak.
    await a.pemilik.tambahKaryawan({ email: 'kasir-dash@lifestore.test', penugasan: [{ outletId: a.pemilik.outletId, peran: 'kasir' }] });
    const karyawan = await dunia.terimaUndangan('kasir-dash@lifestore.test');
    expect((await karyawan.get(`/v1/outlet/${a.pemilik.outletId}/tagihan`)).status).toBe(403);
    expect((await karyawan.get(`/v1/outlet/${a.pemilik.outletId}/penjualan/hari-ini`)).status).toBe(403);
  });
});
