import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buatDuniaTes, type DuniaTes } from './support/dunia-tes';

describe('Metode Bayar manual per Outlet', () => {
  let dunia: DuniaTes;
  beforeAll(async () => {
    dunia = await buatDuniaTes();
  });
  afterAll(() => dunia?.tutup());

  it('Outlet baru belum punya Metode Bayar aktif; keempat jenis manual tersedia untuk diaktifkan', async () => {
    const pemilik = await dunia.daftarTenant();
    const daftar = (await pemilik.get(`/v1/outlet/${pemilik.outletId}/metode-bayar`).expect(200)).body;
    expect(daftar.map((m: { jenis: string; aktif: boolean }) => [m.jenis, m.aktif])).toEqual([
      ['tunai', false],
      ['qris_statis', false],
      ['edc', false],
      ['transfer', false],
    ]);
  });

  it('Metode Bayar nonaktif tidak tersedia di kasir Outlet itu', async () => {
    const pemilik = await dunia.daftarTenant();
    const outletKedua = await pemilik.tambahOutlet();
    const url = `/v1/outlet/${pemilik.outletId}/metode-bayar`;
    await pemilik.put(`${url}/tunai`, { aktif: true }).expect(200);
    await pemilik.put(`${url}/qris_statis`, { aktif: true, keterangan: 'QRIS Warung Daun' }).expect(200);
    await pemilik.put(`${url}/transfer`, { aktif: true, keterangan: 'BCA 123 a.n. Warung' }).expect(200);
    await pemilik.put(`/v1/outlet/${outletKedua}/metode-bayar/edc`, { aktif: true }).expect(200);

    const kasir = await pemilik.tambahKaryawan({ pin: '1111', penugasan: [{ outletId: pemilik.outletId, peran: 'kasir' }] });
    const tablet = await pemilik.daftarkanPerangkat();
    await tablet.masukPin(kasir, '1111').expect(200);
    const jenis = async () => (await tablet.get('/v1/kasir/metode-bayar').expect(200)).body.map((m: { jenis: string }) => m.jenis);
    expect(await jenis()).toEqual(['tunai', 'qris_statis', 'transfer']);

    // Manajer menonaktifkan transfer: kasir tidak melihatnya lagi. EDC Outlet lain tidak pernah muncul.
    await pemilik.put(`${url}/transfer`, { aktif: false }).expect(200);
    expect(await jenis()).toEqual(['tunai', 'qris_statis']);
    const qris = (await tablet.get('/v1/kasir/metode-bayar').expect(200)).body[1];
    expect(qris).toMatchObject({ jenis: 'qris_statis', nama: 'QRIS statis', keterangan: 'QRIS Warung Daun' });
  });

  it('manajer Outlet boleh mengatur Metode Bayar, kasir tidak', async () => {
    const pemilik = await dunia.daftarTenant();
    const alamatManajer = `manajer-${Date.now().toString(36)}@lifestore.test`;
    const alamatKasir = `kasir-${Date.now().toString(36)}@lifestore.test`;
    await pemilik.tambahKaryawan({ email: alamatManajer, penugasan: [{ outletId: pemilik.outletId, peran: 'manajer_outlet' }] });
    await pemilik.tambahKaryawan({ email: alamatKasir, penugasan: [{ outletId: pemilik.outletId, peran: 'kasir' }] });
    const manajer = await dunia.terimaUndangan(alamatManajer);
    const kasir = await dunia.terimaUndangan(alamatKasir);
    const url = `/v1/outlet/${pemilik.outletId}/metode-bayar`;

    await manajer.put(`${url}/edc`, { aktif: true, keterangan: 'EDC BRI' }).expect(200);
    expect((await kasir.put(`${url}/edc`, { aktif: false })).status).toBe(403);
    const edc = (await pemilik.get(url).expect(200)).body.find((m: { jenis: string }) => m.jenis === 'edc');
    expect(edc).toMatchObject({ aktif: true, keterangan: 'EDC BRI' });
  });

  it('jenis Metode Bayar di luar daftar manual ditolak', async () => {
    const pemilik = await dunia.daftarTenant();
    const res = await pemilik.put(`/v1/outlet/${pemilik.outletId}/metode-bayar/piutang`, { aktif: true });
    expect(res.status).toBe(400);
  });
});
