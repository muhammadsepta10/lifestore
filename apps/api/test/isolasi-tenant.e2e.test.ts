import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buatDuniaTes, type DuniaTes, type PemilikTes, type PerangkatTes } from './support/dunia-tes';

// Tes isolasi di seam HTTP: dua Tenant; setiap endpoint baca/tulis dari Tenant A tidak pernah
// mengembalikan atau mengubah data Tenant B, termasuk saat ID Tenant B ditebak atau diketahui.
// Endpoint baru yang memakai ID wajib ditambahkan ke tes ini.

describe('Isolasi Tenant lewat API', () => {
  let dunia: DuniaTes;
  let a: PemilikTes;
  let b: PemilikTes;
  let outletKeduaB: string;
  // Menu Tenant B
  let kategoriB: string;
  let menuB: string;
  let varianB: string;
  let pilihanB: string;
  let stasiunB: string;
  // Menu Tenant A, untuk mencoba mereferensikan ID Tenant B
  let menuA: string;
  let karyawanB: string;
  let tabletA: PerangkatTes;
  let tabletB: PerangkatTes;
  // Meja, Metode Bayar, dan Shift Tenant B
  let mejaB: string;
  let shiftTerbukaB: string;
  let shiftDitutupB: string;

  beforeAll(async () => {
    dunia = await buatDuniaTes();
    a = await dunia.daftarTenant({ namaUsaha: 'Warung A', kota: 'Bandung' });
    b = await dunia.daftarTenant({ namaUsaha: 'Warung B', kota: 'Medan' });
    outletKeduaB = await b.tambahOutlet({ nama: 'Warung B Dua', kota: 'Binjai' });
    await b
      .post(`/v1/outlet/${b.outletId}/profil-pajak`, { berlakuMulai: '2030-01-01', jenis: 'PPN', tarifPersen: 11 })
      .expect(201);
    await b.post(`/v1/outlet/${b.outletId}/siap-jualan/meja/lewati`).expect(200);

    kategoriB = await b.buatKategori({ nama: 'Kategori Warung B' });
    menuB = await b.buatMenu({
      kategoriId: kategoriB,
      nama: 'Menu Warung B',
      harga: 10000,
      varian: [{ nama: 'Varian Warung B', harga: 10000 }],
      grupPilihan: [{ nama: 'Grup Warung B', maksimum: 1, pilihan: [{ nama: 'Pilihan Warung B', harga: 0 }] }],
    });
    const detailB = (await b.get(`/v1/menu/${menuB}`).expect(200)).body;
    varianB = detailB.varian[0].id;
    pilihanB = detailB.grupPilihan[0].pilihan[0].id;
    stasiunB = await b.buatStasiun('Stasiun Warung B');
    await b.put(`/v1/outlet/${b.outletId}/menu/${menuB}/stasiun`, { stasiunId: stasiunB }).expect(200);
    await b.put(`/v1/outlet/${b.outletId}/menu/${menuB}/harga`, { harga: 12000 }).expect(200);
    await b.put(`/v1/outlet/${b.outletId}/menu/${menuB}/habis`, { habis: true }).expect(200);

    menuA = await a.buatMenu({ nama: 'Menu Warung A', harga: 5000 });
    karyawanB = await b.tambahKaryawan({ nama: 'Kasir B', pin: '1234', penugasan: [{ outletId: b.outletId, peran: 'kasir' }] });
    tabletB = await b.daftarkanPerangkat({ awalan: 'B' });
    tabletA = await a.daftarkanPerangkat({ awalan: 'A' });

    mejaB = (await b.post(`/v1/outlet/${b.outletId}/meja/massal`, { dari: 1, sampai: 2, kapasitas: 4 }).expect(201)).body[0].id;
    await b.put(`/v1/outlet/${b.outletId}/metode-bayar/qris_statis`, { aktif: true, keterangan: 'QRIS Warung B' }).expect(200);
    await tabletB.masukPin(karyawanB, '1234').expect(200);
    shiftDitutupB = (await tabletB.post('/v1/shift', { kasAwal: 1_000 }).expect(201)).body.id;
    await tabletB.post(`/v1/shift/${shiftDitutupB}/kas`, { jenis: 'keluar', jumlah: 500, alasan: 'Kas Warung B' }).expect(201);
    await tabletB.post(`/v1/shift/${shiftDitutupB}/tutup`, { hitungButa: 500 }).expect(200);
    shiftTerbukaB = (await tabletB.post('/v1/shift', { kasAwal: 2_000 }).expect(201)).body.id;
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
      kategori: (await b.get(`/v1/merek/${b.merekId}/kategori`).expect(200)).body,
      menu: (await b.get(`/v1/merek/${b.merekId}/menu`).expect(200)).body,
      menuOutlet: (await b.get(`/v1/outlet/${b.outletId}/menu`).expect(200)).body,
      stasiun: (await b.get(`/v1/outlet/${b.outletId}/stasiun`).expect(200)).body,
      karyawan: (await b.get('/v1/karyawan').expect(200)).body,
      perangkat: (await b.get(`/v1/outlet/${b.outletId}/perangkat`).expect(200)).body,
      meja: (await b.get(`/v1/outlet/${b.outletId}/meja`).expect(200)).body,
      metodeBayar: (await b.get(`/v1/outlet/${b.outletId}/metode-bayar`).expect(200)).body,
      shift: (await b.get(`/v1/outlet/${b.outletId}/shift`).expect(200)).body,
      laporanShift: (await b.get(`/v1/outlet/${b.outletId}/shift/${shiftDitutupB}/laporan`).expect(200)).body,
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
    const menuA_ = (await a.get(`/v1/merek/${a.merekId}/menu`).expect(200)).body;
    expect(menuA_.map((m: { id: string }) => m.id)).toEqual([menuA]);
    expect(JSON.stringify((await a.get(`/v1/merek/${a.merekId}/kategori`).expect(200)).body)).not.toContain('Warung B');
    expect(JSON.stringify((await a.get(`/v1/outlet/${a.outletId}/menu`).expect(200)).body)).not.toContain('Warung B');
    expect((await a.get(`/v1/outlet/${a.outletId}/stasiun`).expect(200)).body).toEqual([]);
  });

  it('Tenant A tidak bisa membaca data Tenant B dengan ID yang diketahui', async () => {
    for (const path of [
      `/v1/outlet/${b.outletId}`,
      `/v1/outlet/${outletKeduaB}`,
      `/v1/outlet/${b.outletId}/profil-pajak`,
      `/v1/outlet/${b.outletId}/profil-pajak?tanggal=2030-06-01`,
      `/v1/outlet/${b.outletId}/profil-pajak/riwayat`,
      `/v1/outlet/${b.outletId}/siap-jualan`,
      `/v1/merek/${b.merekId}/kategori`,
      `/v1/merek/${b.merekId}/menu`,
      `/v1/menu/${menuB}`,
      `/v1/outlet/${b.outletId}/menu`,
      `/v1/outlet/${b.outletId}/stasiun`,
      `/v1/outlet/${b.outletId}/perangkat`,
      `/v1/outlet/${b.outletId}/meja`,
      `/v1/outlet/${b.outletId}/metode-bayar`,
      `/v1/outlet/${b.outletId}/shift`,
      `/v1/outlet/${b.outletId}/shift/${shiftDitutupB}/laporan`,
      `/v1/outlet/${a.outletId}/shift/${shiftDitutupB}/laporan`,
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
      // Menu Tenant B
      () => a.post(`/v1/merek/${b.merekId}/kategori`, { nama: 'Selundupan', warna: 'mint' }),
      () => a.patch(`/v1/kategori/${kategoriB}`, { nama: 'Diretas' }),
      () => a.put(`/v1/merek/${b.merekId}/kategori/urutan`, { ids: [kategoriB] }),
      () => a.post(`/v1/merek/${b.merekId}/menu`, { kategoriId: kategoriB, nama: 'Selundupan', harga: 1 }),
      () => a.patch(`/v1/menu/${menuB}`, { nama: 'Diretas', harga: 1, aktif: false }),
      () => a.put(`/v1/merek/${b.merekId}/menu/urutan`, { ids: [menuB] }),
      () => a.post(`/v1/outlet/${b.outletId}/stasiun`, { nama: 'Selundupan' }),
      () => a.patch(`/v1/stasiun/${stasiunB}`, { nama: 'Diretas' }),
      () => a.put(`/v1/outlet/${b.outletId}/menu/${menuB}/stasiun`, { stasiunId: null }),
      () => a.put(`/v1/outlet/${b.outletId}/menu/${menuB}/harga`, { harga: 1 }),
      () => a.put(`/v1/outlet/${b.outletId}/menu/${menuB}/habis`, { habis: false }),
      // ID Tenant B dipakai sebagai referensi dari data Tenant A sendiri
      () => a.post(`/v1/merek/${a.merekId}/menu`, { kategoriId: kategoriB, nama: 'Selundupan', harga: 1 }),
      () => a.patch(`/v1/menu/${menuA}`, { kategoriId: kategoriB }),
      () => a.put(`/v1/merek/${a.merekId}/menu/urutan`, { ids: [menuA, menuB] }),
      () => a.put(`/v1/outlet/${a.outletId}/menu/${menuA}/stasiun`, { stasiunId: stasiunB }),
      () => a.put(`/v1/outlet/${a.outletId}/menu/${menuB}/habis`, { habis: true }),
      () => a.put(`/v1/outlet/${a.outletId}/menu/${menuA}/harga`, { varian: [{ varianId: varianB, harga: 1 }] }),
      () => a.patch(`/v1/menu/${menuA}`, { varian: [{ id: varianB, nama: 'Curian', harga: 1 }] }),
      () => a.patch(`/v1/menu/${menuA}`, { grupPilihan: [{ nama: 'G', maksimum: 1, pilihan: [{ id: pilihanB, nama: 'Curian', harga: 1 }] }] }),
      () => a.put(`/v1/karyawan/${karyawanB}/penugasan`, { penugasan: [] }),
      () => a.put(`/v1/karyawan/${karyawanB}/pin`, { pin: '0000' }),
      () => a.post(`/v1/karyawan/${karyawanB}/nonaktifkan`),
      () => a.post('/v1/karyawan', { nama: 'Selundupan', pin: '1234', penugasan: [{ outletId: b.outletId, peran: 'kasir' }] }),
      () => a.post(`/v1/outlet/${b.outletId}/perangkat`, { nama: 'Selundupan', awalan: 'X' }),
      () => a.post(`/v1/outlet/${b.outletId}/perangkat/${tabletB.id}/cabut`),
      () => a.post(`/v1/outlet/${a.outletId}/perangkat/${tabletB.id}/cabut`),
      // Meja dan Metode Bayar Tenant B
      () => a.post(`/v1/outlet/${b.outletId}/meja/massal`, { dari: 10, sampai: 11, kapasitas: 2 }),
      () => a.patch(`/v1/outlet/${b.outletId}/meja/${mejaB}`, { aktif: false }),
      () => a.patch(`/v1/outlet/${a.outletId}/meja/${mejaB}`, { aktif: false }),
      () => a.put(`/v1/outlet/${b.outletId}/metode-bayar/qris_statis`, { aktif: false }),
    ];
    for (const [i, coba] of percobaan.entries()) {
      const res = await coba();
      expect({ percobaan: i, status: res.status }).toEqual({ percobaan: i, status: 404 });
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
      expect((await a.get(`/v1/menu/${enc}`)).status).toBe(404);
      expect((await a.patch(`/v1/kategori/${enc}`, { nama: 'x' })).status).toBe(404);
      expect((await a.patch(`/v1/stasiun/${enc}`, { nama: 'x' })).status).toBe(404);
      expect((await a.get(`/v1/merek/${enc}/menu`)).status).toBe(404);
      expect((await a.put(`/v1/outlet/${a.outletId}/menu/${enc}/habis`, { habis: true })).status).toBe(404);
    }
  });

  it('Tenant A tidak bisa beralih ke Tenant B', async () => {
    await a.post('/v1/sesi/tenant', { tenantId: b.tenantId }).expect(403);
    const sesi = (await a.get('/v1/sesi').expect(200)).body;
    expect(sesi.tenant).toEqual([{ id: a.tenantId, nama: 'Warung A' }]);
  });

  it('karyawan dan Perangkat Terdaftar Tenant B tidak terlihat atau terpakai dari Tenant A', async () => {
    const karyawanA = (await a.get('/v1/karyawan').expect(200)).body;
    expect(karyawanA.map((k: { peran: string }) => k.peran)).toEqual(['pemilik']);
    // Perangkat Tenant A tidak menampilkan, dan tidak bisa memakai PIN, karyawan Tenant B.
    expect((await tabletA.get('/v1/perangkat/saya').expect(200)).body.karyawan).toEqual([]);
    expect((await tabletA.masukPin(karyawanB, '1234')).status).toBe(401);
    // Token perangkat B yang ditempeli ID Tenant A tidak dikenal.
    const tokenPalsu = `${a.tenantId}.${tabletB.token.split('.')[1]}`;
    expect((await dunia.http.get('/v1/perangkat/saya').set('Authorization', `Perangkat ${tokenPalsu}`)).status).toBe(401);
    // Perangkat B tetap berfungsi.
    await tabletB.masukPin(karyawanB, '1234').expect(200);
  });

  it('Perangkat Terdaftar Tenant A tidak melihat atau menandai Habis Menu Tenant B', async () => {
    await a.aturPin(await a.anggotaSaya(), '4321');
    await tabletA.masukPin(await a.anggotaSaya(), '4321').expect(200);
    const dijual = (await tabletA.get('/v1/kasir/menu').expect(200)).body;
    expect(dijual.menu.map((m: { id: string }) => m.id)).toEqual([menuA]);
    expect(JSON.stringify(dijual)).not.toContain('Warung B');
    const sebelum = (await b.get(`/v1/outlet/${b.outletId}/menu`).expect(200)).body;
    expect((await tabletA.post(`/v1/kasir/menu/${menuB}/habis`, { habis: false })).status).toBe(404);
    expect((await b.get(`/v1/outlet/${b.outletId}/menu`).expect(200)).body).toEqual(sebelum);
  });

  it('Perangkat Terdaftar Tenant A tidak menyentuh Meja, Metode Bayar, atau Shift Tenant B', async () => {
    const sebelum = await dataB();
    await a.aturPin(await a.anggotaSaya(), '4321');
    await tabletA.masukPin(await a.anggotaSaya(), '4321').expect(200);

    const layar = (await tabletA.get('/v1/kasir').expect(200)).body;
    expect(layar.shift).toBeNull();
    expect(layar.metodeBayar).toEqual([]);
    expect((await tabletA.get('/v1/kasir/meja').expect(200)).body).toEqual([]);
    expect((await tabletA.get('/v1/kasir/metode-bayar').expect(200)).body).toEqual([]);
    expect((await tabletA.get('/v1/shift/aktif').expect(200)).body.shift).toBeNull();

    for (const coba of [
      () => tabletA.post(`/v1/kasir/meja/${mejaB}/nonaktifkan`),
      () => tabletA.post(`/v1/kasir/meja/${mejaB}/aktifkan`),
      () => tabletA.post(`/v1/shift/${shiftTerbukaB}/kas`, { jenis: 'keluar', jumlah: 1, alasan: 'Diretas' }),
      () => tabletA.post(`/v1/shift/${shiftTerbukaB}/tutup`, { hitungButa: 0 }),
      () => tabletA.get(`/v1/shift/${shiftDitutupB}/laporan`),
    ]) {
      expect((await coba()).status).toBe(404);
    }
    // ID Shift Tenant B yang dipakai ulang sebagai ID buatan klien tidak membuka atau membocorkan Shift itu.
    const bentrok = await tabletA.post('/v1/shift', { id: shiftTerbukaB, kasAwal: 1 });
    expect(bentrok.status).toBe(409);
    expect(JSON.stringify(bentrok.body)).not.toContain('2000');
    expect(await dataB()).toEqual(sebelum);
    expect((await tabletB.get('/v1/shift/aktif').expect(200)).body.shift.id).toBe(shiftTerbukaB);
  });
});
