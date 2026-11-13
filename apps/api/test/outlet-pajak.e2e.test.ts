import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buatDuniaTes, type DuniaTes, type PemilikTes } from './support/dunia-tes';

const PROFIL_DEFAULT = {
  jenis: 'PBJT',
  tarifPersen: 10,
  labelStruk: 'PBJT',
  hargaTermasukPajak: false,
  serviceCharge: { tarifPersen: 0, kanal: ['dine_in'] },
};

/** Tanggal (YYYY-MM-DD) n hari dari hari ini di Asia/Jakarta. */
function tanggalDariHariIni(n: number): string {
  const hariIni = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date());
  const d = new Date(`${hariIni}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

describe('Pemilik menyiapkan Merek, Outlet, dan Profil Pajak', () => {
  let dunia: DuniaTes;
  let pemilik: PemilikTes;
  beforeAll(async () => {
    dunia = await buatDuniaTes();
    pemilik = await dunia.daftarTenant({ namaUsaha: 'Mie Ayam Jaya', kota: 'Bekasi' });
  });
  afterAll(() => dunia?.tutup());

  it('pemilik mengubah nama Merek default', async () => {
    const res = await pemilik.patch(`/v1/merek/${pemilik.merekId}`, { nama: 'Mie Jaya' }).expect(200);
    expect(res.body).toEqual({ id: pemilik.merekId, nama: 'Mie Jaya', utama: true });
    const daftar = await pemilik.get('/v1/merek').expect(200);
    expect(daftar.body).toEqual([{ id: pemilik.merekId, nama: 'Mie Jaya', utama: true }]);
  });

  it('pemilik menambah Outlet kedua di Merek default', async () => {
    const res = await pemilik.post('/v1/outlet', { nama: 'Mie Jaya Cikarang', kota: 'Cikarang' }).expect(201);
    expect(res.body).toMatchObject({ nama: 'Mie Jaya Cikarang', kota: 'Cikarang', merekId: pemilik.merekId });
    const daftar = await pemilik.get('/v1/outlet').expect(200);
    expect(daftar.body.map((o: { nama: string }) => o.nama)).toEqual(['Mie Ayam Jaya', 'Mie Jaya Cikarang']);
  });

  it('pemilik mengisi profil Outlet: nama, alamat, kota, jam buka, logo', async () => {
    const profil = {
      nama: 'Mie Ayam Jaya Pusat',
      alamat: 'Jl. Ahmad Yani No. 5',
      kota: 'Bekasi',
      jamBuka: [
        { hari: 1, buka: '08:00', tutup: '21:00' },
        { hari: 6, buka: '09:00', tutup: '22:00' },
      ],
      logoUrl: 'https://cdn.contoh.test/logo.png',
    };
    await pemilik.patch(`/v1/outlet/${pemilik.outletId}`, profil).expect(200);
    const res = await pemilik.get(`/v1/outlet/${pemilik.outletId}`).expect(200);
    expect(res.body).toEqual({ id: pemilik.outletId, merekId: pemilik.merekId, ...profil });
  });

  it('jam buka yang tidak valid ditolak', async () => {
    await pemilik.patch(`/v1/outlet/${pemilik.outletId}`, { jamBuka: [{ hari: 8, buka: '25:00', tutup: '21:00' }] }).expect(400);
  });

  it('Outlet baru memiliki Profil Pajak default PBJT 10% tanpa Service Charge', async () => {
    const outletBaru = await pemilik.tambahOutlet({ nama: 'Mie Jaya Bogor', kota: 'Bogor' });
    for (const outletId of [pemilik.outletId, outletBaru]) {
      const res = await pemilik.get(`/v1/outlet/${outletId}/profil-pajak`).expect(200);
      expect(res.body).toMatchObject({ ...PROFIL_DEFAULT, outletId });
    }
  });

  it('perubahan Profil Pajak bertanggal tidak mengubah tarif yang berlaku sebelum tanggal itu', async () => {
    const outletId = await pemilik.tambahOutlet({ nama: 'Mie Jaya Depok', kota: 'Depok' });
    const mulai = tanggalDariHariIni(10);
    const res = await pemilik
      .post(`/v1/outlet/${outletId}/profil-pajak`, {
        berlakuMulai: mulai,
        jenis: 'PBJT',
        tarifPersen: 11,
        labelStruk: 'PB1',
        serviceCharge: { tarifPersen: 5 },
        hargaTermasukPajak: true,
      })
      .expect(201);
    expect(res.body).toMatchObject({
      berlakuMulai: mulai,
      tarifPersen: 11,
      labelStruk: 'PB1',
      hargaTermasukPajak: true,
      serviceCharge: { tarifPersen: 5, kanal: ['dine_in'] },
    });

    const hariIni = await pemilik.get(`/v1/outlet/${outletId}/profil-pajak`).expect(200);
    expect(hariIni.body).toMatchObject(PROFIL_DEFAULT);
    const sehariSebelum = await pemilik.get(`/v1/outlet/${outletId}/profil-pajak?tanggal=${tanggalDariHariIni(9)}`).expect(200);
    expect(sehariSebelum.body).toMatchObject(PROFIL_DEFAULT);
    const padaTanggal = await pemilik.get(`/v1/outlet/${outletId}/profil-pajak?tanggal=${mulai}`).expect(200);
    expect(padaTanggal.body).toMatchObject({ tarifPersen: 11, labelStruk: 'PB1' });
    const sesudahnya = await pemilik.get(`/v1/outlet/${outletId}/profil-pajak?tanggal=${tanggalDariHariIni(40)}`).expect(200);
    expect(sesudahnya.body).toMatchObject({ tarifPersen: 11 });

    const riwayat = await pemilik.get(`/v1/outlet/${outletId}/profil-pajak/riwayat`).expect(200);
    expect(riwayat.body.map((p: { tarifPersen: number }) => p.tarifPersen)).toEqual([11, 10]);
  });

  it('Profil Pajak "tidak dipungut" bertarif 0 dan Service Charge bisa untuk semua Kanal', async () => {
    const outletId = await pemilik.tambahOutlet({ nama: 'Mie Jaya Tangerang', kota: 'Tangerang' });
    const res = await pemilik
      .post(`/v1/outlet/${outletId}/profil-pajak`, {
        berlakuMulai: tanggalDariHariIni(0),
        jenis: 'tidak_dipungut',
        serviceCharge: { tarifPersen: 5, kanal: ['dine_in', 'bawa_pulang'] },
      })
      .expect(201);
    expect(res.body).toMatchObject({
      jenis: 'tidak_dipungut',
      tarifPersen: 0,
      serviceCharge: { tarifPersen: 5, kanal: ['dine_in', 'bawa_pulang'] },
    });
  });

  it('Profil Pajak yang tidak valid ditolak', async () => {
    const url = `/v1/outlet/${pemilik.outletId}/profil-pajak`;
    await pemilik.post(url, { berlakuMulai: '2026-02-30', jenis: 'PBJT', tarifPersen: 10 }).expect(400);
    await pemilik.post(url, { berlakuMulai: tanggalDariHariIni(1), jenis: 'PPh', tarifPersen: 10 }).expect(400);
    await pemilik.post(url, { berlakuMulai: tanggalDariHariIni(1), jenis: 'PBJT', tarifPersen: 150 }).expect(400);
    await pemilik
      .post(url, { berlakuMulai: tanggalDariHariIni(1), jenis: 'PBJT', tarifPersen: 10, serviceCharge: { tarifPersen: 5, kanal: ['ojol'] } })
      .expect(400);
  });
});
