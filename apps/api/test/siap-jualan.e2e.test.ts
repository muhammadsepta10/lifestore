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

  it('dashboard menampilkan checklist untuk setiap Outlet', async () => {
    const pemilik = await dunia.daftarTenant();
    await pemilik.tambahOutlet({ nama: 'Cabang Dua' });
    const res = (await pemilik.get('/v1/dashboard').expect(200)).body;
    expect(res.outlet.map((o: { nama: string }) => o.nama)).toEqual([expect.any(String), 'Cabang Dua']);
  });
});
