import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buatDuniaTes, type DuniaTes } from './support/dunia-tes';

describe('Perangkat Terdaftar dan masuk dengan PIN', () => {
  let dunia: DuniaTes;
  beforeAll(async () => {
    dunia = await buatDuniaTes();
  });
  afterAll(() => dunia?.tutup());

  it('kode pendaftaran perangkat hanya bisa dipakai sekali', async () => {
    const pemilik = await dunia.daftarTenant();
    const siap = await pemilik.post(`/v1/outlet/${pemilik.outletId}/perangkat`, { nama: 'Tablet Kasir', awalan: 'a' }).expect(201);
    expect(siap.body).toMatchObject({ nama: 'Tablet Kasir', awalan: 'A', status: 'menunggu_pendaftaran' });
    expect(siap.body.kodePendaftaran).toMatch(/^[A-Z2-9]{8}$/);

    // Manajer boleh mengetik dengan huruf kecil atau spasi.
    const kodeDiketik = `${siap.body.kodePendaftaran.slice(0, 4).toLowerCase()} ${siap.body.kodePendaftaran.slice(4)}`;
    const daftar = await dunia.http.post('/v1/perangkat/daftar').send({ kode: kodeDiketik }).expect(200);
    expect(daftar.body.perangkat).toMatchObject({ id: siap.body.id, awalan: 'A', status: 'terdaftar' });

    const lagi = await dunia.http.post('/v1/perangkat/daftar').send({ kode: siap.body.kodePendaftaran });
    expect(lagi.status).toBe(400);

    const saya = await dunia.http.get('/v1/perangkat/saya').set('Authorization', `Perangkat ${daftar.body.tokenPerangkat}`).expect(200);
    expect(saya.body.perangkat).toEqual({ id: siap.body.id, nama: 'Tablet Kasir', awalan: 'A' });
    expect(saya.body.outlet.id).toBe(pemilik.outletId);
  });

  it('kode pendaftaran kedaluwarsa setelah 24 jam', async () => {
    const pemilik = await dunia.daftarTenant();
    const siap = await pemilik.post(`/v1/outlet/${pemilik.outletId}/perangkat`, { nama: 'PC Bar', awalan: 'B' }).expect(201);
    dunia.jam.maju(25 * 3600 * 1000);
    try {
      await dunia.http.post('/v1/perangkat/daftar').send({ kode: siap.body.kodePendaftaran }).expect(400);
    } finally {
      dunia.jam.maju(-25 * 3600 * 1000);
    }
  });

  it('perangkat yang dicabut ditolak, dan awalannya bisa dipakai lagi', async () => {
    const pemilik = await dunia.daftarTenant();
    const tablet = await pemilik.daftarkanPerangkat({ awalan: 'A' });
    await tablet.get('/v1/perangkat/saya').expect(200);
    const bentrok = await pemilik.post(`/v1/outlet/${pemilik.outletId}/perangkat`, { nama: 'Tablet Lain', awalan: 'A' });
    expect(bentrok.status).toBe(409);

    const cabut = await pemilik.post(`/v1/outlet/${pemilik.outletId}/perangkat/${tablet.id}/cabut`).expect(200);
    expect(cabut.body.status).toBe('dicabut');
    const ditolak = await tablet.get('/v1/perangkat/saya');
    expect(ditolak.status).toBe(401);
    expect(ditolak.body.kode).toBe('perangkat_dicabut');
    expect((await tablet.get('/v1/kasir')).status).toBe(401);

    await pemilik.daftarkanPerangkat({ awalan: 'A' });
    const daftar = (await pemilik.get(`/v1/outlet/${pemilik.outletId}/perangkat`).expect(200)).body;
    expect(daftar.map((p: { status: string }) => p.status)).toEqual(['dicabut', 'terdaftar']);
  });

  it('token perangkat palsu atau sesi dashboard tidak bisa membuka kasir', async () => {
    const pemilik = await dunia.daftarTenant();
    expect((await dunia.http.get('/v1/kasir')).status).toBe(401);
    expect((await dunia.http.get('/v1/kasir').set('Authorization', `Perangkat ${pemilik.tenantId}.palsu-palsu-palsu-palsu-palsu`)).status).toBe(401);
    expect((await pemilik.get('/v1/kasir')).status).toBe(401);
  });

  it('karyawan khusus PIN masuk di Perangkat Terdaftar tanpa akun Pengguna dan membuka kasir', async () => {
    const pemilik = await dunia.daftarTenant();
    const ujang = await pemilik.tambahKaryawan({ nama: 'Ujang', pin: '2468', penugasan: [{ outletId: pemilik.outletId, peran: 'kasir' }] });
    const tablet = await pemilik.daftarkanPerangkat({ awalan: 'K' });

    const layarPin = (await tablet.get('/v1/perangkat/saya').expect(200)).body;
    expect(layarPin.karyawan).toEqual([{ id: ujang, nama: 'Ujang' }]);
    expect(layarPin.anggotaAktif).toBeNull();

    const belumPin = await tablet.get('/v1/kasir');
    expect(belumPin.status).toBe(401);
    expect(belumPin.body.kode).toBe('perlu_pin');

    const masuk = await tablet.masukPin(ujang, '2468').expect(200);
    expect(masuk.body.anggota).toEqual({ id: ujang, peran: 'karyawan' });
    expect(masuk.body.izin).toContain('kasir.buka');
    expect(masuk.body.izin).not.toContain('menu.ubah');
    expect(masuk.body.izin).not.toContain('profil_pajak.ubah');

    const kasir = await tablet.get('/v1/kasir').expect(200);
    expect(kasir.body).toMatchObject({ perangkat: { id: tablet.id, awalan: 'K' }, outlet: { id: pemilik.outletId }, anggota: { id: ujang } });

    // Token perangkat bukan sesi dashboard: Profil Pajak tidak bisa diubah dari kasir.
    const pajak = await tablet.post(`/v1/outlet/${pemilik.outletId}/profil-pajak`, { berlakuMulai: '2030-01-01', jenis: 'PBJT', tarifPersen: 1 });
    expect(pajak.status).toBe(401);

    await tablet.post('/v1/perangkat/keluar').expect(204);
    expect((await tablet.get('/v1/kasir')).status).toBe(401);
  });

  it('Pemilik bisa memberi dirinya PIN dan masuk di perangkat Outlet mana pun', async () => {
    const pemilik = await dunia.daftarTenant();
    const saya = await pemilik.anggotaSaya();
    await pemilik.aturPin(saya, '135790');
    const tablet = await pemilik.daftarkanPerangkat();
    await tablet.masukPin(saya, '135790').expect(200);
    await tablet.get('/v1/kasir').expect(200);
  });

  it('PIN dikunci sementara setelah 5 kali salah', async () => {
    const pemilik = await dunia.daftarTenant();
    const rina = await pemilik.tambahKaryawan({ nama: 'Rina', pin: '1111', penugasan: [{ outletId: pemilik.outletId, peran: 'kasir' }] });
    const tablet = await pemilik.daftarkanPerangkat();

    for (let i = 1; i <= 4; i++) {
      const res = await tablet.masukPin(rina, '9999');
      expect(res.status).toBe(401);
      expect(res.body).toMatchObject({ kode: 'pin_salah', sisaPercobaan: 5 - i });
    }
    const kelima = await tablet.masukPin(rina, '9999');
    expect(kelima.status).toBe(423);
    expect(kelima.body.kode).toBe('pin_terkunci');

    // PIN benar pun ditolak selama terkunci.
    expect((await tablet.masukPin(rina, '1111')).status).toBe(423);

    dunia.jam.maju(5 * 60 * 1000 + 1000);
    try {
      await tablet.masukPin(rina, '1111').expect(200);
    } finally {
      dunia.jam.maju(-(5 * 60 * 1000 + 1000));
    }
  });

  it('Pemilik membuka PIN yang terkunci dengan mengatur PIN baru', async () => {
    const pemilik = await dunia.daftarTenant();
    const rina = await pemilik.tambahKaryawan({ nama: 'Rina', pin: '1111', penugasan: [{ outletId: pemilik.outletId, peran: 'kasir' }] });
    const tablet = await pemilik.daftarkanPerangkat();
    for (let i = 0; i < 5; i++) await tablet.masukPin(rina, '0000');
    expect((await tablet.masukPin(rina, '1111')).status).toBe(423);
    await pemilik.aturPin(rina, '2222');
    await tablet.masukPin(rina, '2222').expect(200);
  });

  it('Anggota tanpa Penugasan ke Outlet tidak bisa masuk kasir di Outlet itu', async () => {
    const pemilik = await dunia.daftarTenant();
    const outletKedua = await pemilik.tambahOutlet({ nama: 'Cabang Dua' });
    const rina = await pemilik.tambahKaryawan({ nama: 'Rina', pin: '1111', penugasan: [{ outletId: pemilik.outletId, peran: 'kasir' }] });
    const tabletCabang = await pemilik.daftarkanPerangkat({ outletId: outletKedua });

    expect((await tabletCabang.get('/v1/perangkat/saya').expect(200)).body.karyawan).toEqual([]);
    const res = await tabletCabang.masukPin(rina, '1111');
    expect(res.status).toBe(403);
    expect(res.body.kode).toBe('tidak_ditugaskan');
    expect((await tabletCabang.get('/v1/kasir')).status).toBe(401);
  });

  it('Penugasan yang dicabut setelah masuk langsung menutup akses kasir', async () => {
    const pemilik = await dunia.daftarTenant();
    const rina = await pemilik.tambahKaryawan({ nama: 'Rina', pin: '1111', penugasan: [{ outletId: pemilik.outletId, peran: 'kasir' }] });
    const tablet = await pemilik.daftarkanPerangkat();
    await tablet.masukPin(rina, '1111').expect(200);
    await tablet.get('/v1/kasir').expect(200);

    await pemilik.put(`/v1/karyawan/${rina}/penugasan`, { penugasan: [] }).expect(200);
    const res = await tablet.get('/v1/kasir');
    expect(res.status).toBe(403);
    expect(res.body.kode).toBe('tidak_ditugaskan');
  });

  it('Peran Dapur bisa masuk di perangkat tetapi tidak berizin membuka kasir', async () => {
    const pemilik = await dunia.daftarTenant();
    const koki = await pemilik.tambahKaryawan({ nama: 'Koki', pin: '5555', penugasan: [{ outletId: pemilik.outletId, peran: 'dapur' }] });
    const tablet = await pemilik.daftarkanPerangkat();
    const masuk = await tablet.masukPin(koki, '5555').expect(200);
    expect(masuk.body.izin).toContain('kds.buka');
    const res = await tablet.get('/v1/kasir');
    expect(res.status).toBe(403);
    expect(res.body.kode).toBe('tidak_berizin');
  });
});
