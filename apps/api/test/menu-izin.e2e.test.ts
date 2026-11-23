import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buatDuniaTes, type DuniaTes, type PemilikTes, type PenggunaMasuk } from './support/dunia-tes';

describe('Izin Menu: Kasir tidak bisa mengubah Menu; Kasir dan Manajer bisa menandai Habis', () => {
  let dunia: DuniaTes;
  let pemilik: PemilikTes;
  let cabang: string;
  let kategori: string;
  let menu: string;
  let kasir: PenggunaMasuk;
  let manajer: PenggunaMasuk;

  beforeAll(async () => {
    dunia = await buatDuniaTes();
    pemilik = await dunia.daftarTenant();
    cabang = await pemilik.tambahOutlet({ nama: 'Cabang' });
    kategori = await pemilik.buatKategori({ nama: 'Bakso' });
    menu = await pemilik.buatMenu({ kategoriId: kategori, nama: 'Bakso Urat', harga: 20000 });
    await pemilik.tambahKaryawan({ email: 'kasir@menu.test', pin: '1111', penugasan: [{ outletId: pemilik.outletId, peran: 'kasir' }] });
    kasir = await dunia.terimaUndangan('kasir@menu.test');
    await pemilik.tambahKaryawan({ email: 'manajer@menu.test', penugasan: [{ outletId: pemilik.outletId, peran: 'manajer_outlet' }] });
    manajer = await dunia.terimaUndangan('manajer@menu.test');
  });
  afterAll(() => dunia?.tutup());

  it('Kasir tidak bisa mengubah Menu, Kategori, harga, atau Stasiun lewat API Menu', async () => {
    const o = pemilik.outletId;
    const percobaan = [
      () => kasir.post(`/v1/merek/${pemilik.merekId}/kategori`, { nama: 'Kasir', warna: 'mint' }),
      () => kasir.patch(`/v1/kategori/${kategori}`, { nama: 'Diubah Kasir' }),
      () => kasir.put(`/v1/merek/${pemilik.merekId}/kategori/urutan`, { ids: [kategori] }),
      () => kasir.post(`/v1/merek/${pemilik.merekId}/menu`, { kategoriId: kategori, nama: 'Menu Kasir', harga: 1 }),
      () => kasir.patch(`/v1/menu/${menu}`, { harga: 1 }),
      () => kasir.patch(`/v1/menu/${menu}`, { aktif: false }),
      () => kasir.put(`/v1/merek/${pemilik.merekId}/menu/urutan`, { ids: [menu] }),
      () => kasir.put(`/v1/outlet/${o}/menu/${menu}/harga`, { harga: 1 }),
      () => kasir.post(`/v1/outlet/${o}/stasiun`, { nama: 'Stasiun Kasir' }),
      () => kasir.put(`/v1/outlet/${o}/menu/${menu}/stasiun`, { stasiunId: null }),
    ];
    for (const [i, coba] of percobaan.entries()) {
      const res = await coba();
      expect({ percobaan: i, status: res.status, kode: res.body.kode }).toEqual({ percobaan: i, status: 403, kode: 'tidak_berizin' });
    }
    const m = (await pemilik.get(`/v1/menu/${menu}`).expect(200)).body;
    expect(m).toMatchObject({ nama: 'Bakso Urat', harga: 20000, aktif: true });
    expect((await pemilik.get(`/v1/merek/${pemilik.merekId}/menu`).expect(200)).body).toHaveLength(1);
  });

  it('Kasir melihat Menu dan menandai Habis di Outletnya saja', async () => {
    const dijual = (await kasir.get(`/v1/outlet/${pemilik.outletId}/menu`).expect(200)).body;
    expect(dijual.menu.map((x: { nama: string }) => x.nama)).toEqual(['Bakso Urat']);

    await kasir.put(`/v1/outlet/${pemilik.outletId}/menu/${menu}/habis`, { habis: true }).expect(200);
    await kasir.put(`/v1/outlet/${cabang}/menu/${menu}/habis`, { habis: true }).expect(403);
    const habisDi = async (o: string) =>
      (await pemilik.get(`/v1/outlet/${o}/menu`).expect(200)).body.menu.find((x: { id: string }) => x.id === menu).habis;
    expect([await habisDi(pemilik.outletId), await habisDi(cabang)]).toEqual([true, false]);
    await kasir.put(`/v1/outlet/${pemilik.outletId}/menu/${menu}/habis`, { habis: false }).expect(200);
  });

  it('Kasir di Perangkat Terdaftar menandai Habis untuk Outlet perangkat', async () => {
    const tablet = await pemilik.daftarkanPerangkat({ outletId: cabang, awalan: 'C' });
    await pemilik.tambahKaryawan({ nama: 'Kasir Cabang', pin: '2222', penugasan: [{ outletId: cabang, peran: 'kasir' }] });
    const kasirCabang = (await pemilik.get('/v1/karyawan').expect(200)).body.find((k: { nama: string }) => k.nama === 'Kasir Cabang').id;
    await tablet.masukPin(kasirCabang, '2222').expect(200);

    const dijual = (await tablet.get('/v1/kasir/menu').expect(200)).body;
    expect(dijual.menu.map((x: { id: string; habis: boolean }) => [x.id, x.habis])).toEqual([[menu, false]]);
    await tablet.post(`/v1/kasir/menu/${menu}/habis`, { habis: true }).expect(200);

    const habisDi = async (o: string) =>
      (await pemilik.get(`/v1/outlet/${o}/menu`).expect(200)).body.menu.find((x: { id: string }) => x.id === menu).habis;
    expect([await habisDi(cabang), await habisDi(pemilik.outletId)]).toEqual([true, false]);
    await tablet.post(`/v1/kasir/menu/${menu}/habis`, { habis: false }).expect(200);
  });

  it('Manajer Outlet mengatur harga Outlet dan Stasiun di Outletnya, tetapi tidak mengubah Menu Merek', async () => {
    const o = pemilik.outletId;
    await manajer.put(`/v1/outlet/${o}/menu/${menu}/harga`, { harga: 22000 }).expect(200);
    const dapur = (await manajer.post(`/v1/outlet/${o}/stasiun`, { nama: 'Dapur' }).expect(201)).body.id;
    await manajer.patch(`/v1/stasiun/${dapur}`, { nama: 'Dapur Utama' }).expect(200);
    await manajer.put(`/v1/outlet/${o}/menu/${menu}/stasiun`, { stasiunId: dapur }).expect(200);
    await manajer.put(`/v1/outlet/${o}/menu/${menu}/habis`, { habis: false }).expect(200);

    await manajer.put(`/v1/outlet/${cabang}/menu/${menu}/harga`, { harga: 1 }).expect(403);
    await manajer.post(`/v1/outlet/${cabang}/stasiun`, { nama: 'Bukan Outletku' }).expect(403);
    const stasiunCabang = await pemilik.buatStasiun('Dapur Cabang', cabang);
    await manajer.patch(`/v1/stasiun/${stasiunCabang}`, { nama: 'Diubah' }).expect(403);
    await manajer.patch(`/v1/menu/${menu}`, { harga: 1 }).expect(403);
    await manajer.post(`/v1/merek/${pemilik.merekId}/menu`, { kategoriId: kategori, nama: 'X', harga: 1 }).expect(403);
  });
});
