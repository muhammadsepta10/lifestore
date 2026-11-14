import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buatDuniaTes, type DuniaTes } from './support/dunia-tes';

describe('Shift dan Hitung Buta', () => {
  let dunia: DuniaTes;
  beforeAll(async () => {
    dunia = await buatDuniaTes();
  });
  afterAll(() => dunia?.tutup());

  it('kasir membuka Shift, mencatat kas masuk/keluar, lalu menutup dengan Hitung Buta: Laporan Shift menunjukkan selisihnya', async () => {
    const pemilik = await dunia.daftarTenant();
    const kasir = await pemilik.bukaKasir({ nama: 'Rina' });

    const buka = await kasir.post('/v1/shift', { kasAwal: 300_000 }).expect(201);
    expect(buka.body).toMatchObject({ status: 'terbuka', kasAwal: 300_000, dibukaOleh: { id: kasir.anggotaId, nama: 'Rina' } });
    const shiftId: string = buka.body.id;

    await kasir.post(`/v1/shift/${shiftId}/kas`, { jenis: 'masuk', jumlah: 50_000, alasan: 'Tambahan uang receh' }).expect(201);
    await kasir.post(`/v1/shift/${shiftId}/kas`, { jenis: 'keluar', jumlah: 25_000, alasan: 'Beli es batu' }).expect(201);
    await kasir.post(`/v1/shift/${shiftId}/kas`, { jenis: 'keluar', jumlah: 10_000, alasan: 'Parkir kurir' }).expect(201);

    // Seharusnya 300.000 + 50.000 − 25.000 − 10.000 = 315.000; laci dihitung 310.000 → kurang 5.000.
    const tutup = await kasir.post(`/v1/shift/${shiftId}/tutup`, { hitungButa: 310_000 }).expect(200);
    expect(tutup.body).toMatchObject({
      id: shiftId,
      status: 'ditutup',
      kasAwal: 300_000,
      kasMasuk: 50_000,
      kasKeluar: 35_000,
      penjualanTunai: 0,
      penjualanPerMetodeBayar: [],
      void: { jumlah: 0, nilai: 0 },
      kasSeharusnya: 315_000,
      hitungButa: 310_000,
      selisih: -5_000,
      ditutupOleh: { id: kasir.anggotaId, nama: 'Rina' },
    });
    expect(tutup.body.kas.map((k: { jenis: string; jumlah: number; alasan: string }) => [k.jenis, k.jumlah, k.alasan])).toEqual([
      ['masuk', 50_000, 'Tambahan uang receh'],
      ['keluar', 25_000, 'Beli es batu'],
      ['keluar', 10_000, 'Parkir kurir'],
    ]);

    // Laporan yang sama tersimpan di riwayat dan bisa dibuka Pemilik dari dashboard.
    const riwayat = (await pemilik.get(`/v1/outlet/${pemilik.outletId}/shift`).expect(200)).body;
    expect(riwayat.map((s: { id: string; status: string; selisih: number }) => [s.id, s.status, s.selisih])).toEqual([[shiftId, 'ditutup', -5_000]]);
    const laporan = (await pemilik.get(`/v1/outlet/${pemilik.outletId}/shift/${shiftId}/laporan`).expect(200)).body;
    expect(laporan).toEqual(tutup.body);
  });

  it('Hitung Buta yang pas menghasilkan selisih nol, dan lebih menghasilkan selisih positif', async () => {
    const pemilik = await dunia.daftarTenant();
    const kasir = await pemilik.bukaKasir();
    const pas = await kasir.bukaShift(200_000);
    expect((await kasir.post(`/v1/shift/${pas}/tutup`, { hitungButa: 200_000 }).expect(200)).body.selisih).toBe(0);
    const lebih = await kasir.bukaShift(200_000);
    expect((await kasir.post(`/v1/shift/${lebih}/tutup`, { hitungButa: 202_500 }).expect(200)).body.selisih).toBe(2_500);
  });

  it('perangkat yang sudah punya Shift terbuka tidak bisa membuka Shift kedua, perangkat lain bisa', async () => {
    const pemilik = await dunia.daftarTenant();
    const kasir = await pemilik.bukaKasir();
    const pertama = await kasir.bukaShift(100_000);

    const kedua = await kasir.post('/v1/shift', { kasAwal: 50_000 });
    expect(kedua.status).toBe(409);
    expect(kedua.body).toMatchObject({ kode: 'shift_sudah_terbuka', shiftId: pertama });

    // Kasir lain yang masuk di perangkat yang sama juga tidak bisa.
    const kasirLain = await pemilik.tambahKaryawan({ pin: '4321', penugasan: [{ outletId: pemilik.outletId, peran: 'kasir' }] });
    await kasir.masukPin(kasirLain, '4321').expect(200);
    expect((await kasir.post('/v1/shift', { kasAwal: 50_000 })).status).toBe(409);

    // Perangkat lain di Outlet yang sama punya lacinya sendiri.
    const tabletLain = await pemilik.bukaKasir();
    await tabletLain.post('/v1/shift', { kasAwal: 75_000 }).expect(201);

    // Setelah ditutup, perangkat pertama boleh membuka Shift baru.
    await kasir.post(`/v1/shift/${pertama}/tutup`, { hitungButa: 100_000 }).expect(200);
    await kasir.post('/v1/shift', { kasAwal: 120_000 }).expect(201);
  });

  it('dua permintaan buka Shift bersamaan dari satu perangkat menghasilkan satu Shift', async () => {
    const pemilik = await dunia.daftarTenant();
    const kasir = await pemilik.bukaKasir();
    const hasil = await Promise.all([1, 2, 3].map(() => kasir.post('/v1/shift', { kasAwal: 100_000 })));
    expect(hasil.map((r) => r.status).sort()).toEqual([201, 409, 409]);
  });

  it('buka Shift dan kas masuk/keluar dengan ID buatan klien bersifat idempoten', async () => {
    const pemilik = await dunia.daftarTenant();
    const kasir = await pemilik.bukaKasir();
    const id = crypto.randomUUID();
    const a = await kasir.post('/v1/shift', { id, kasAwal: 100_000 }).expect(201);
    const b = await kasir.post('/v1/shift', { id, kasAwal: 100_000 }).expect(200);
    expect(b.body).toEqual(a.body);

    const kasId = crypto.randomUUID();
    await kasir.post(`/v1/shift/${id}/kas`, { id: kasId, jenis: 'keluar', jumlah: 20_000, alasan: 'Beli gas' }).expect(201);
    await kasir.post(`/v1/shift/${id}/kas`, { id: kasId, jenis: 'keluar', jumlah: 20_000, alasan: 'Beli gas' }).expect(200);
    const laporan = (await kasir.post(`/v1/shift/${id}/tutup`, { hitungButa: 80_000 }).expect(200)).body;
    expect(laporan).toMatchObject({ kasKeluar: 20_000, kasSeharusnya: 80_000, selisih: 0 });
    expect(laporan.kas).toHaveLength(1);
  });

  it('kasir tidak pernah melihat kas seharusnya sebelum Hitung Buta dikirim', async () => {
    const pemilik = await dunia.daftarTenant();
    const kasir = await pemilik.bukaKasir();
    const id = await kasir.bukaShift(123_000);
    await kasir.post(`/v1/shift/${id}/kas`, { jenis: 'masuk', jumlah: 4_000, alasan: 'Receh' }).expect(201);
    const seharusnya = '127000';
    const bocor = (res: { body: unknown }) => {
      const teks = JSON.stringify(res.body);
      expect(teks).not.toContain('kasSeharusnya');
      expect(teks).not.toContain('selisih');
      expect(teks).not.toContain(seharusnya);
    };

    const aktif = await kasir.get('/v1/shift/aktif').expect(200);
    expect(aktif.body.shift).toMatchObject({ id, status: 'terbuka', kasAwal: 123_000 });
    bocor(aktif);
    bocor(await kasir.get('/v1/kasir').expect(200));

    // Menutup tanpa hasil Hitung Buta ditolak tanpa membocorkan angka sistem.
    for (const body of [{}, { hitungButa: null }, { hitungButa: '127000' }, { hitungButa: -1 }]) {
      const res = await kasir.post(`/v1/shift/${id}/tutup`, body);
      expect(res.status).toBe(400);
      bocor(res);
    }
    // Shift tetap terbuka.
    expect((await kasir.get('/v1/shift/aktif').expect(200)).body.shift.id).toBe(id);
    // Laporan Shift belum tersedia selama Shift terbuka, bahkan untuk Pemilik.
    const dini = await pemilik.get(`/v1/outlet/${pemilik.outletId}/shift/${id}/laporan`);
    expect(dini.status).toBe(409);
    bocor(dini);
    bocor(await pemilik.get(`/v1/outlet/${pemilik.outletId}/shift`).expect(200));

    const tutup = await kasir.post(`/v1/shift/${id}/tutup`, { hitungButa: 127_000 }).expect(200);
    expect(tutup.body).toMatchObject({ kasSeharusnya: 127_000, selisih: 0 });
  });

  it('Shift yang sudah ditutup tidak menerima kas atau penutupan lagi', async () => {
    const pemilik = await dunia.daftarTenant();
    const kasir = await pemilik.bukaKasir();
    const id = await kasir.bukaShift(50_000);
    await kasir.post(`/v1/shift/${id}/tutup`, { hitungButa: 50_000 }).expect(200);
    expect((await kasir.post(`/v1/shift/${id}/kas`, { jenis: 'keluar', jumlah: 1_000, alasan: 'x' })).body.kode).toBe('shift_sudah_ditutup');
    expect((await kasir.post(`/v1/shift/${id}/tutup`, { hitungButa: 0 })).body.kode).toBe('shift_sudah_ditutup');
    expect((await kasir.get('/v1/shift/aktif').expect(200)).body.shift).toBeNull();
  });

  it('kas masuk/keluar wajib punya alasan dan jumlah positif', async () => {
    const pemilik = await dunia.daftarTenant();
    const kasir = await pemilik.bukaKasir();
    const id = await kasir.bukaShift(50_000);
    for (const body of [
      { jenis: 'keluar', jumlah: 1_000 },
      { jenis: 'keluar', jumlah: 1_000, alasan: '  ' },
      { jenis: 'keluar', jumlah: 0, alasan: 'x' },
      { jenis: 'pinjam', jumlah: 1_000, alasan: 'x' },
    ]) {
      expect((await kasir.post(`/v1/shift/${id}/kas`, body)).status).toBe(400);
    }
  });

  it('perangkat lain tidak bisa mencatat kas atau menutup Shift milik perangkat ini', async () => {
    const pemilik = await dunia.daftarTenant();
    const kasir = await pemilik.bukaKasir();
    const lain = await pemilik.bukaKasir();
    const id = await kasir.bukaShift(50_000);
    expect((await lain.post(`/v1/shift/${id}/kas`, { jenis: 'keluar', jumlah: 1_000, alasan: 'x' })).status).toBe(404);
    expect((await lain.post(`/v1/shift/${id}/tutup`, { hitungButa: 0 })).status).toBe(404);
  });

  it('Shift butuh kasir yang masuk dengan PIN dan berizin membuka kasir', async () => {
    const pemilik = await dunia.daftarTenant();
    const tablet = await pemilik.daftarkanPerangkat({ awalan: 'D' });
    expect((await tablet.post('/v1/shift', { kasAwal: 1 })).body.kode).toBe('perlu_pin');
    const dapur = await pemilik.bukaKasir({ peran: 'dapur' });
    const res = await dapur.post('/v1/shift', { kasAwal: 1 });
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ kode: 'tidak_berizin', izin: 'kasir.buka' });
  });

  it('perangkat bisa membuka lagi Laporan Shift miliknya setelah ditutup (untuk dicetak), tidak sebelumnya', async () => {
    const pemilik = await dunia.daftarTenant();
    const kasir = await pemilik.bukaKasir();
    const lain = await pemilik.bukaKasir();
    const id = await kasir.bukaShift(40_000);
    const dini = await kasir.get(`/v1/shift/${id}/laporan`);
    expect(dini.status).toBe(409);
    expect(JSON.stringify(dini.body)).not.toContain('kasSeharusnya');
    const tutup = await kasir.post(`/v1/shift/${id}/tutup`, { hitungButa: 39_000 }).expect(200);
    expect((await kasir.get(`/v1/shift/${id}/laporan`).expect(200)).body).toEqual(tutup.body);
    expect((await lain.get(`/v1/shift/${id}/laporan`)).status).toBe(404);
  });

  it('manajer Outlet melihat Laporan Shift, kasir tidak', async () => {
    const pemilik = await dunia.daftarTenant();
    const kasirTablet = await pemilik.bukaKasir();
    const id = await kasirTablet.bukaShift(10_000);
    await kasirTablet.post(`/v1/shift/${id}/tutup`, { hitungButa: 9_000 }).expect(200);

    const stamp = Date.now().toString(36);
    await pemilik.tambahKaryawan({ email: `m-${stamp}@lifestore.test`, penugasan: [{ outletId: pemilik.outletId, peran: 'manajer_outlet' }] });
    await pemilik.tambahKaryawan({ email: `k-${stamp}@lifestore.test`, penugasan: [{ outletId: pemilik.outletId, peran: 'kasir' }] });
    const manajer = await dunia.terimaUndangan(`m-${stamp}@lifestore.test`);
    const kasir = await dunia.terimaUndangan(`k-${stamp}@lifestore.test`);
    const url = `/v1/outlet/${pemilik.outletId}/shift/${id}/laporan`;
    expect((await manajer.get(url).expect(200)).body.selisih).toBe(-1_000);
    expect((await kasir.get(url)).status).toBe(403);
  });
});
