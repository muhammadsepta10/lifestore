import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buatDuniaTes, type DuniaTes } from './support/dunia-tes';

describe('Layar kasir di Perangkat Terdaftar', () => {
  let dunia: DuniaTes;
  beforeAll(async () => {
    dunia = await buatDuniaTes();
  });
  afterAll(() => dunia?.tutup());

  it('layar kasir terbuka setelah masuk dengan PIN dan menampilkan status Shift', async () => {
    const pemilik = await dunia.daftarTenant();
    await pemilik.put(`/v1/outlet/${pemilik.outletId}/metode-bayar/tunai`, { aktif: true }).expect(200);
    const kasirId = await pemilik.tambahKaryawan({ nama: 'Rina', pin: '1111', penugasan: [{ outletId: pemilik.outletId, peran: 'kasir' }] });
    const tablet = await pemilik.daftarkanPerangkat({ awalan: 'A' });

    // Sebelum PIN: layar PIN, bukan layar kasir.
    expect((await tablet.get('/v1/kasir')).body.kode).toBe('perlu_pin');
    const layarPin = (await tablet.get('/v1/perangkat/saya').expect(200)).body;
    expect(layarPin.karyawan).toContainEqual({ id: kasirId, nama: 'Rina' });

    await tablet.masukPin(kasirId, '1111').expect(200);
    const belum = (await tablet.get('/v1/kasir').expect(200)).body;
    expect(belum).toMatchObject({
      perangkat: { id: tablet.id, awalan: 'A' },
      outlet: { id: pemilik.outletId },
      anggota: { id: kasirId, nama: 'Rina', peran: 'karyawan' },
      shift: null,
      metodeBayar: [{ jenis: 'tunai' }],
    });

    const shiftId = (await tablet.post('/v1/shift', { kasAwal: 200_000 }).expect(201)).body.id;
    const terbuka = (await tablet.get('/v1/kasir').expect(200)).body;
    expect(terbuka.shift).toMatchObject({ id: shiftId, status: 'terbuka', kasAwal: 200_000, dibukaOleh: { nama: 'Rina' } });

    // Keluar: kembali ke layar PIN, Shift tetap terbuka di perangkat untuk kasir berikutnya.
    await tablet.post('/v1/perangkat/keluar').expect(204);
    expect((await tablet.get('/v1/kasir')).status).toBe(401);
    await tablet.masukPin(kasirId, '1111').expect(200);
    expect((await tablet.get('/v1/kasir').expect(200)).body.shift.id).toBe(shiftId);
  });
});
