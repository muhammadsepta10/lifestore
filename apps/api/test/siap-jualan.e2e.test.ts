import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buatDuniaTes, type DuniaTes } from './support/dunia-tes';

type Langkah = { langkah: string; status: string; wajibUntukKasir: boolean };
const statusLangkah = (siap: { langkah: Langkah[] }) => Object.fromEntries(siap.langkah.map((l) => [l.langkah, l.status]));

describe('Dashboard: Masa Coba dan checklist Siap Jualan', () => {
  let dunia: DuniaTes;
  beforeAll(async () => {
    dunia = await buatDuniaTes();
  });
  afterAll(() => dunia?.tutup());

  it('Tenant baru: sisa Masa Coba 14 hari, Profil Pajak sudah selesai, langkah lain belum', async () => {
    const pemilik = await dunia.daftarTenant({ namaUsaha: 'Nasi Uduk Bu Imah' });
    const res = await pemilik.get('/v1/dashboard').expect(200);

    expect(res.body.masaCoba).toMatchObject({ paketLangganan: 'Pro', sisaHari: 14 });
    const berakhir = new Date(res.body.masaCoba.berakhirPada).getTime();
    expect(Math.abs(berakhir - (Date.now() + 14 * 24 * 3600 * 1000))).toBeLessThan(60_000);

    expect(res.body.outlet).toHaveLength(1);
    const siap = res.body.outlet[0].siapJualan;
    expect(statusLangkah(siap)).toEqual({
      profil_outlet: 'belum',
      profil_pajak: 'selesai',
      menu: 'belum',
      stasiun: 'belum',
      metode_bayar: 'belum',
      meja: 'belum',
      karyawan: 'belum',
      perangkat: 'belum',
    });
    expect(siap.kasir).toEqual({ siap: false, wajib: ['menu', 'profil_pajak', 'perangkat'], kurang: ['menu', 'perangkat'] });
  });

  it('checklist mencerminkan data: profil Outlet selesai setelah alamat dan jam buka diisi', async () => {
    const pemilik = await dunia.daftarTenant();
    await pemilik
      .patch(`/v1/outlet/${pemilik.outletId}`, { alamat: 'Jl. Merdeka 1', jamBuka: [{ hari: 1, buka: '07:00', tutup: '20:00' }] })
      .expect(200);
    const siap = (await pemilik.get(`/v1/outlet/${pemilik.outletId}/siap-jualan`).expect(200)).body;
    expect(statusLangkah(siap).profil_outlet).toBe('selesai');

    await pemilik.patch(`/v1/outlet/${pemilik.outletId}`, { alamat: null }).expect(200);
    const lagi = (await pemilik.get(`/v1/outlet/${pemilik.outletId}/siap-jualan`).expect(200)).body;
    expect(statusLangkah(lagi).profil_outlet).toBe('belum');
  });

  it('setiap langkah bisa dilewati, dan bisa dibatalkan', async () => {
    const pemilik = await dunia.daftarTenant();
    const url = `/v1/outlet/${pemilik.outletId}/siap-jualan`;
    const dilewati = (await pemilik.post(`${url}/meja/lewati`).expect(200)).body;
    expect(statusLangkah(dilewati).meja).toBe('dilewati');
    // Melewati langkah wajib tidak membuat kasir siap.
    const menuDilewati = (await pemilik.post(`${url}/menu/lewati`).expect(200)).body;
    expect(menuDilewati.kasir.siap).toBe(false);

    const dashboard = (await pemilik.get('/v1/dashboard').expect(200)).body;
    expect(statusLangkah(dashboard.outlet[0].siapJualan)).toMatchObject({ meja: 'dilewati', menu: 'dilewati' });

    const batal = (await pemilik.delete(`${url}/meja/lewati`).expect(200)).body;
    expect(statusLangkah(batal).meja).toBe('belum');
    await pemilik.post(`${url}/printer-ajaib/lewati`).expect(400);
  });

  it('langkah yang sudah selesai tetap selesai walau dilewati', async () => {
    const pemilik = await dunia.daftarTenant();
    const res = (await pemilik.post(`/v1/outlet/${pemilik.outletId}/siap-jualan/profil_pajak/lewati`).expect(200)).body;
    expect(statusLangkah(res).profil_pajak).toBe('selesai');
  });

  it('langkah Menu tercentang setelah ada Menu aktif, dan kembali belum bila semua Menu nonaktif', async () => {
    const pemilik = await dunia.daftarTenant();
    const outletDua = await pemilik.tambahOutlet();
    const siap = async (o = pemilik.outletId) => (await pemilik.get(`/v1/outlet/${o}/siap-jualan`).expect(200)).body;
    expect(statusLangkah(await siap()).menu).toBe('belum');

    const menu = await pemilik.buatMenu({ nama: 'Soto Ayam', harga: 15000 });
    const hasil = await siap();
    expect(statusLangkah(hasil).menu).toBe('selesai');
    expect(hasil.kasir.kurang).toEqual(['perangkat']);
    // Menu milik Merek, jadi semua Outlet Merek itu ikut tercentang.
    expect(statusLangkah(await siap(outletDua)).menu).toBe('selesai');

    await pemilik.patch(`/v1/menu/${menu}`, { aktif: false }).expect(200);
    expect(statusLangkah(await siap()).menu).toBe('belum');
  });

  it('langkah Stasiun tercentang setelah Outlet punya Stasiun', async () => {
    const pemilik = await dunia.daftarTenant();
    const outletDua = await pemilik.tambahOutlet();
    await pemilik.buatStasiun('Dapur');
    const siap = async (o: string) => statusLangkah((await pemilik.get(`/v1/outlet/${o}/siap-jualan`).expect(200)).body);
    expect((await siap(pemilik.outletId)).stasiun).toBe('selesai');
    expect((await siap(outletDua)).stasiun).toBe('belum');
  });

  it('dashboard menampilkan checklist untuk setiap Outlet', async () => {
    const pemilik = await dunia.daftarTenant();
    await pemilik.tambahOutlet({ nama: 'Cabang Dua' });
    const res = (await pemilik.get('/v1/dashboard').expect(200)).body;
    expect(res.outlet.map((o: { nama: string }) => o.nama)).toEqual([expect.any(String), 'Cabang Dua']);
  });

  it('langkah karyawan selesai saat ada karyawan ber-PIN yang ditugaskan ke Outlet', async () => {
    const pemilik = await dunia.daftarTenant();
    const outletKedua = await pemilik.tambahOutlet();
    const url = `/v1/outlet/${pemilik.outletId}/siap-jualan`;
    // Karyawan undangan tanpa PIN, atau ber-PIN di Outlet lain, belum cukup.
    await pemilik.tambahKaryawan({ email: 'belum-pin@contoh.test', penugasan: [{ outletId: pemilik.outletId, peran: 'kasir' }] });
    const id = await pemilik.tambahKaryawan({ pin: '1234', penugasan: [{ outletId: outletKedua, peran: 'kasir' }] });
    expect(statusLangkah((await pemilik.get(url).expect(200)).body).karyawan).toBe('belum');

    await pemilik.put(`/v1/karyawan/${id}/penugasan`, { penugasan: [{ outletId: pemilik.outletId, peran: 'kasir' }] }).expect(200);
    expect(statusLangkah((await pemilik.get(url).expect(200)).body).karyawan).toBe('selesai');

    await pemilik.post(`/v1/karyawan/${id}/nonaktifkan`).expect(200);
    expect(statusLangkah((await pemilik.get(url).expect(200)).body).karyawan).toBe('belum');
  });

  it('Pemilik yang memberi dirinya PIN juga menyelesaikan langkah karyawan', async () => {
    const pemilik = await dunia.daftarTenant();
    await pemilik.aturPin(await pemilik.anggotaSaya(), '8642');
    const siap = (await pemilik.get(`/v1/outlet/${pemilik.outletId}/siap-jualan`).expect(200)).body;
    expect(statusLangkah(siap).karyawan).toBe('selesai');
  });

  it('langkah Perangkat Terdaftar selesai setelah perangkat didaftarkan, dan kembali belum saat dicabut', async () => {
    const pemilik = await dunia.daftarTenant();
    const url = `/v1/outlet/${pemilik.outletId}/siap-jualan`;
    // Kode yang belum dipakai belum menghitung perangkat.
    await pemilik.post(`/v1/outlet/${pemilik.outletId}/perangkat`, { nama: 'Belum dipasang', awalan: 'Z' }).expect(201);
    let siap = (await pemilik.get(url).expect(200)).body;
    expect(statusLangkah(siap).perangkat).toBe('belum');
    expect(siap.kasir.kurang).toContain('perangkat');

    const tablet = await pemilik.daftarkanPerangkat({ awalan: 'A' });
    siap = (await pemilik.get(url).expect(200)).body;
    expect(statusLangkah(siap).perangkat).toBe('selesai');
    expect(siap.kasir.kurang).toEqual(['menu']);

    await pemilik.post(`/v1/outlet/${pemilik.outletId}/perangkat/${tablet.id}/cabut`).expect(200);
    expect(statusLangkah((await pemilik.get(url).expect(200)).body).perangkat).toBe('belum');
  });

  it('langkah Meja selesai saat Outlet punya Meja aktif', async () => {
    const pemilik = await dunia.daftarTenant();
    const url = `/v1/outlet/${pemilik.outletId}/siap-jualan`;
    const [m] = (await pemilik.post(`/v1/outlet/${pemilik.outletId}/meja/massal`, { dari: 1, sampai: 1, kapasitas: 4 }).expect(201)).body;
    expect(statusLangkah((await pemilik.get(url).expect(200)).body).meja).toBe('selesai');
    await pemilik.patch(`/v1/outlet/${pemilik.outletId}/meja/${m.id}`, { aktif: false }).expect(200);
    expect(statusLangkah((await pemilik.get(url).expect(200)).body).meja).toBe('belum');
  });

  it('langkah Metode Bayar selesai saat Outlet punya Metode Bayar aktif', async () => {
    const pemilik = await dunia.daftarTenant();
    const outletKedua = await pemilik.tambahOutlet();
    const url = `/v1/outlet/${pemilik.outletId}/siap-jualan`;
    await pemilik.put(`/v1/outlet/${outletKedua}/metode-bayar/tunai`, { aktif: true }).expect(200);
    expect(statusLangkah((await pemilik.get(url).expect(200)).body).metode_bayar).toBe('belum');
    await pemilik.put(`/v1/outlet/${pemilik.outletId}/metode-bayar/qris_statis`, { aktif: true }).expect(200);
    expect(statusLangkah((await pemilik.get(url).expect(200)).body).metode_bayar).toBe('selesai');
    await pemilik.put(`/v1/outlet/${pemilik.outletId}/metode-bayar/qris_statis`, { aktif: false }).expect(200);
    expect(statusLangkah((await pemilik.get(url).expect(200)).body).metode_bayar).toBe('belum');
  });
});
