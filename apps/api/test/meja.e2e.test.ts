import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buatDuniaTes, type DuniaTes } from './support/dunia-tes';

describe('Meja', () => {
  let dunia: DuniaTes;
  beforeAll(async () => {
    dunia = await buatDuniaTes();
  });
  afterAll(() => dunia?.tutup());

  it('pemilik membuat Meja 1–20 sekaligus dengan kapasitas, semuanya Kosong', async () => {
    const pemilik = await dunia.daftarTenant();
    const res = await pemilik.post(`/v1/outlet/${pemilik.outletId}/meja/massal`, { dari: 1, sampai: 20, kapasitas: 4 }).expect(201);
    expect(res.body).toHaveLength(20);

    const meja = (await pemilik.get(`/v1/outlet/${pemilik.outletId}/meja`).expect(200)).body;
    expect(meja.map((m: { label: string }) => m.label)).toEqual(Array.from({ length: 20 }, (_, i) => String(i + 1)));
    expect(meja[0]).toMatchObject({ label: '1', kapasitas: 4, aktif: true, status: 'kosong' });
  });

  it('Meja yang sudah ada tidak dibuat ganda', async () => {
    const pemilik = await dunia.daftarTenant();
    const url = `/v1/outlet/${pemilik.outletId}/meja`;
    await pemilik.post(`${url}/massal`, { dari: 1, sampai: 5, kapasitas: 2 }).expect(201);
    const bentrok = await pemilik.post(`${url}/massal`, { dari: 4, sampai: 8, kapasitas: 2 }).expect(409);
    expect(bentrok.body).toMatchObject({ kode: 'meja_sudah_ada', label: ['4', '5'] });
    expect((await pemilik.get(url).expect(200)).body).toHaveLength(5);
  });

  it('kasir menonaktifkan Meja yang rusak dari kasir, tetapi tidak bisa membuat Meja', async () => {
    const pemilik = await dunia.daftarTenant();
    const [m1, m2] = (await pemilik.post(`/v1/outlet/${pemilik.outletId}/meja/massal`, { dari: 1, sampai: 2, kapasitas: 4 }).expect(201)).body;
    const kasir = await pemilik.tambahKaryawan({ pin: '1111', penugasan: [{ outletId: pemilik.outletId, peran: 'kasir' }] });
    const tablet = await pemilik.daftarkanPerangkat();
    await tablet.masukPin(kasir, '1111').expect(200);

    const nonaktif = await tablet.post(`/v1/kasir/meja/${m2.id}/nonaktifkan`).expect(200);
    expect(nonaktif.body).toMatchObject({ id: m2.id, aktif: false });
    const diKasir = (await tablet.get('/v1/kasir/meja').expect(200)).body;
    expect(diKasir.map((m: { label: string; aktif: boolean; status: string }) => [m.label, m.aktif, m.status])).toEqual([
      ['1', true, 'kosong'],
      ['2', false, 'kosong'],
    ]);
    // Pemilik melihat hal yang sama di dashboard.
    const diDashboard = (await pemilik.get(`/v1/outlet/${pemilik.outletId}/meja`).expect(200)).body;
    expect(diDashboard.find((m: { id: string }) => m.id === m2.id).aktif).toBe(false);

    await tablet.post(`/v1/kasir/meja/${m2.id}/aktifkan`).expect(200);
    expect((await tablet.get('/v1/kasir/meja').expect(200)).body.map((m: { id: string; aktif: boolean }) => [m.id, m.aktif])).toEqual([
      [m1.id, true],
      [m2.id, true],
    ]);
  });

  it('kasir yang masuk dashboard tidak bisa membuat Meja', async () => {
    const pemilik = await dunia.daftarTenant();
    const alamat = `kasir-${Date.now().toString(36)}@lifestore.test`;
    await pemilik.tambahKaryawan({ email: alamat, penugasan: [{ outletId: pemilik.outletId, peran: 'kasir' }] });
    const kasir = await dunia.terimaUndangan(alamat);
    await kasir.pilihTenant(pemilik.tenantId);
    const res = await kasir.post(`/v1/outlet/${pemilik.outletId}/meja/massal`, { dari: 1, sampai: 3, kapasitas: 2 });
    expect(res.status).toBe(403);
    expect((await pemilik.get(`/v1/outlet/${pemilik.outletId}/meja`).expect(200)).body).toEqual([]);
  });

  it('pelayan tidak berizin menonaktifkan Meja', async () => {
    const pemilik = await dunia.daftarTenant();
    const [m1] = (await pemilik.post(`/v1/outlet/${pemilik.outletId}/meja/massal`, { dari: 1, sampai: 1, kapasitas: 4 }).expect(201)).body;
    const pelayan = await pemilik.tambahKaryawan({ pin: '2222', penugasan: [{ outletId: pemilik.outletId, peran: 'pelayan' }] });
    const tablet = await pemilik.daftarkanPerangkat();
    await tablet.masukPin(pelayan, '2222').expect(200);
    const res = await tablet.post(`/v1/kasir/meja/${m1.id}/nonaktifkan`);
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ kode: 'tidak_berizin', izin: 'meja.nonaktifkan' });
  });

  it('manajer Outlet mengubah kapasitas dan menonaktifkan Meja dari dashboard', async () => {
    const pemilik = await dunia.daftarTenant();
    const [m1] = (await pemilik.post(`/v1/outlet/${pemilik.outletId}/meja/massal`, { dari: 1, sampai: 1, kapasitas: 4 }).expect(201)).body;
    const alamat = `manajer-${Date.now().toString(36)}@lifestore.test`;
    await pemilik.tambahKaryawan({ email: alamat, penugasan: [{ outletId: pemilik.outletId, peran: 'manajer_outlet' }] });
    const manajer = await dunia.terimaUndangan(alamat);
    await manajer.pilihTenant(pemilik.tenantId);
    const res = await manajer.patch(`/v1/outlet/${pemilik.outletId}/meja/${m1.id}`, { kapasitas: 6, aktif: false }).expect(200);
    expect(res.body).toMatchObject({ kapasitas: 6, aktif: false });
  });
});
