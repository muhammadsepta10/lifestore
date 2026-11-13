import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buatDuniaTes, type DuniaTes, type PemilikTes } from './support/dunia-tes';

// Tes isolasi di seam HTTP: dua Tenant; setiap endpoint baca/tulis dari Tenant A tidak pernah
// mengembalikan atau mengubah data Tenant B, termasuk saat ID Tenant B ditebak atau diketahui.
// Endpoint baru yang memakai ID wajib ditambahkan ke tes ini.

describe('Isolasi Tenant lewat API', () => {
  let dunia: DuniaTes;
  let a: PemilikTes;
  let b: PemilikTes;
  let outletKeduaB: string;

  beforeAll(async () => {
    dunia = await buatDuniaTes();
    a = await dunia.daftarTenant({ namaUsaha: 'Warung A', kota: 'Bandung' });
    b = await dunia.daftarTenant({ namaUsaha: 'Warung B', kota: 'Medan' });
    outletKeduaB = await b.tambahOutlet({ nama: 'Warung B Dua', kota: 'Binjai' });
    await b
      .post(`/v1/outlet/${b.outletId}/profil-pajak`, { berlakuMulai: '2030-01-01', jenis: 'PPN', tarifPersen: 11 })
      .expect(201);
    await b.post(`/v1/outlet/${b.outletId}/siap-jualan/meja/lewati`).expect(200);
  });
  afterAll(() => dunia?.tutup());

  /** Snapshot semua data Tenant B yang terlihat oleh B sendiri. */
  async function dataB() {
    return {
      merek: (await b.get('/v1/merek').expect(200)).body,
      outlet: (await b.get('/v1/outlet').expect(200)).body,
      pajak: (await b.get(`/v1/outlet/${b.outletId}/profil-pajak/riwayat`).expect(200)).body,
      audit: (await b.get('/v1/log-audit').expect(200)).body,
      dashboard: (await b.get('/v1/dashboard').expect(200)).body,
    };
  }

  it('daftar milik Tenant A tidak pernah memuat data Tenant B', async () => {
    const merek = (await a.get('/v1/merek').expect(200)).body;
    expect(merek.map((m: { id: string }) => m.id)).toEqual([a.merekId]);
    const outlet = (await a.get('/v1/outlet').expect(200)).body;
    expect(outlet.map((o: { id: string }) => o.id)).toEqual([a.outletId]);
    expect((await a.get('/v1/log-audit').expect(200)).body).toEqual([]);
    const dashboard = (await a.get('/v1/dashboard').expect(200)).body;
    expect(dashboard.tenant).toEqual({ id: a.tenantId, nama: 'Warung A' });
    expect(dashboard.outlet.map((o: { id: string }) => o.id)).toEqual([a.outletId]);
  });

  it('Tenant A tidak bisa membaca data Tenant B dengan ID yang diketahui', async () => {
    for (const path of [
      `/v1/outlet/${b.outletId}`,
      `/v1/outlet/${outletKeduaB}`,
      `/v1/outlet/${b.outletId}/profil-pajak`,
      `/v1/outlet/${b.outletId}/profil-pajak?tanggal=2030-06-01`,
      `/v1/outlet/${b.outletId}/profil-pajak/riwayat`,
      `/v1/outlet/${b.outletId}/siap-jualan`,
    ]) {
      const res = await a.get(path);
      expect({ path, status: res.status }).toEqual({ path, status: 404 });
      expect(JSON.stringify(res.body)).not.toContain('Warung B');
    }
  });

  it('Tenant A tidak bisa mengubah data Tenant B dengan ID yang diketahui', async () => {
    const sebelum = await dataB();
    const percobaan = [
      () => a.patch(`/v1/merek/${b.merekId}`, { nama: 'Diretas' }),
      () => a.patch(`/v1/outlet/${b.outletId}`, { nama: 'Diretas', alamat: 'Diretas' }),
      () => a.post('/v1/outlet', { nama: 'Outlet Selundupan', kota: 'Medan', merekId: b.merekId }),
      () => a.post(`/v1/outlet/${b.outletId}/profil-pajak`, { berlakuMulai: '2026-01-01', jenis: 'PBJT', tarifPersen: 99 }),
      () => a.post(`/v1/outlet/${b.outletId}/siap-jualan/menu/lewati`),
      () => a.delete(`/v1/outlet/${b.outletId}/siap-jualan/meja/lewati`),
    ];
    for (const coba of percobaan) {
      const res = await coba();
      expect(res.status).toBe(404);
    }
    expect(await dataB()).toEqual(sebelum);
    // Tidak ada yang bocor ke Tenant A juga.
    expect((await a.get('/v1/outlet').expect(200)).body.map((o: { id: string }) => o.id)).toEqual([a.outletId]);
  });

  it('ID tebakan (format UUID atau acak) tidak pernah menemukan apa pun', async () => {
    for (const id of ['00000000-0000-4000-8000-000000000001', 'bukan-uuid', "' OR '1'='1"]) {
      const enc = encodeURIComponent(id);
      expect((await a.get(`/v1/outlet/${enc}`)).status).toBe(404);
      expect((await a.patch(`/v1/merek/${enc}`, { nama: 'x' })).status).toBe(404);
      expect((await a.get(`/v1/outlet/${enc}/profil-pajak`)).status).toBe(404);
    }
  });

  it('Tenant A tidak bisa beralih ke Tenant B', async () => {
    await a.post('/v1/sesi/tenant', { tenantId: b.tenantId }).expect(403);
    const sesi = (await a.get('/v1/sesi').expect(200)).body;
    expect(sesi.tenant).toEqual([{ id: a.tenantId, nama: 'Warung A' }]);
  });
});
