import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buatDuniaTes, type DuniaTes } from './support/dunia-tes';

describe('Karyawan: undangan, Penugasan, dan Peran bawaan', () => {
  let dunia: DuniaTes;
  beforeAll(async () => {
    dunia = await buatDuniaTes();
  });
  afterAll(() => dunia?.tutup());

  it('pemilik mengundang kasir lewat email; kasir menerima undangan dan mendapat Penugasan dengan Peran', async () => {
    const pemilik = await dunia.daftarTenant({ namaUsaha: 'Soto Pak Kumis' });
    const undangan = await pemilik
      .post('/v1/karyawan', {
        nama: 'Rina',
        email: 'Rina@Contoh.test',
        penugasan: [{ outletId: pemilik.outletId, peran: 'kasir' }],
      })
      .expect(201);
    expect(undangan.body).toMatchObject({
      nama: 'Rina',
      email: 'rina@contoh.test',
      undanganDiterima: false,
      penugasan: [{ outletId: pemilik.outletId, peran: 'kasir' }],
    });

    // Undangan sampai lewat email; karyawan baru membuat kata sandi saat menerima.
    expect(dunia.email.terakhirUntuk('rina@contoh.test').subjek).toContain('Soto Pak Kumis');
    const rina = await dunia.terimaUndangan('rina@contoh.test', { kataSandi: 'sandi-rina-123' });
    expect(rina.tenant).toEqual([{ id: pemilik.tenantId, nama: 'Soto Pak Kumis' }]);

    const daftar = (await pemilik.get('/v1/karyawan').expect(200)).body;
    expect(daftar.find((k: { id: string }) => k.id === undangan.body.id)).toMatchObject({
      nama: 'Rina',
      undanganDiterima: true,
      penugasan: [{ outletId: pemilik.outletId, peran: 'kasir' }],
    });
    // Undangan hanya bisa diterima sekali.
    await dunia.http.post('/v1/undangan/terima').send({ token: dunia.email.tokenUndanganUntuk('rina@contoh.test') }).expect(400);
  });

  it('Kasir yang masuk dashboard tidak bisa mengubah Profil Pajak, Merek, Outlet, atau karyawan', async () => {
    const pemilik = await dunia.daftarTenant();
    await pemilik.tambahKaryawan({ email: 'kasir-dash@contoh.test', penugasan: [{ outletId: pemilik.outletId, peran: 'kasir' }] });
    const kasir = await dunia.terimaUndangan('kasir-dash@contoh.test');

    const ditolak = [
      kasir.post(`/v1/outlet/${pemilik.outletId}/profil-pajak`, { berlakuMulai: '2030-01-01', jenis: 'PBJT', tarifPersen: 5 }),
      kasir.patch(`/v1/merek/${pemilik.merekId}`, { nama: 'Diganti Kasir' }),
      kasir.patch(`/v1/outlet/${pemilik.outletId}`, { nama: 'Diganti Kasir' }),
      kasir.post('/v1/karyawan', { nama: 'Teman', pin: '1234' }),
      kasir.get('/v1/log-audit'),
    ];
    for (const r of ditolak) {
      const res = await r;
      expect(res.status).toBe(403);
      expect(res.body.kode).toBe('tidak_berizin');
    }
    const pajak = (await pemilik.get(`/v1/outlet/${pemilik.outletId}/profil-pajak/riwayat`).expect(200)).body;
    expect(pajak).toHaveLength(1);
    expect((await pemilik.get('/v1/merek').expect(200)).body[0].nama).not.toBe('Diganti Kasir');
  });

  it('Manajer Outlet berwenang di Outletnya saja', async () => {
    const pemilik = await dunia.daftarTenant();
    const outletKedua = await pemilik.tambahOutlet({ nama: 'Cabang Dua' });
    await pemilik.tambahKaryawan({ email: 'manajer@contoh.test', penugasan: [{ outletId: pemilik.outletId, peran: 'manajer_outlet' }] });
    const manajer = await dunia.terimaUndangan('manajer@contoh.test');

    await manajer.patch(`/v1/outlet/${pemilik.outletId}`, { alamat: 'Jl. Manajer 1' }).expect(200);
    await manajer.get(`/v1/outlet/${pemilik.outletId}/profil-pajak`).expect(200);
    expect((await manajer.patch(`/v1/outlet/${outletKedua}`, { alamat: 'Jl. Lain' })).status).toBe(403);
    expect((await manajer.get(`/v1/outlet/${outletKedua}/profil-pajak`)).status).toBe(403);
    // Profil Pajak hanya diubah Pemilik.
    expect((await manajer.post(`/v1/outlet/${pemilik.outletId}/profil-pajak`, { berlakuMulai: '2030-01-01', jenis: 'PPN', tarifPersen: 11 })).status).toBe(403);
  });

  it('Pengguna yang sudah punya akun menerima undangan tanpa kata sandi baru dan melihat kedua Tenant', async () => {
    const pemilikA = await dunia.daftarTenant({ namaUsaha: 'Kedai A' });
    const pemilikB = await dunia.daftarTenant({ namaUsaha: 'Kedai B' });
    await pemilikA.tambahKaryawan({ email: pemilikB.email, penugasan: [{ outletId: pemilikA.outletId, peran: 'pelayan' }] });
    await dunia.http.post('/v1/undangan/terima').send({ token: dunia.email.tokenUndanganUntuk(pemilikB.email) }).expect(200);
    const masuk = await dunia.masuk(pemilikB.email, pemilikB.kataSandi);
    expect(masuk.tenant.map((t) => t.nama).sort()).toEqual(['Kedai A', 'Kedai B']);
  });

  it('karyawan yang dinonaktifkan kehilangan akses ke Tenant', async () => {
    const pemilik = await dunia.daftarTenant();
    const id = await pemilik.tambahKaryawan({ email: 'keluar@contoh.test', penugasan: [{ outletId: pemilik.outletId, peran: 'manajer_outlet' }] });
    const manajer = await dunia.terimaUndangan('keluar@contoh.test');
    await manajer.get('/v1/outlet').expect(200);
    await pemilik.post(`/v1/karyawan/${id}/nonaktifkan`).expect(200);
    const res = await manajer.get('/v1/outlet');
    expect(res.status).toBe(403);
    expect(res.body.kode).toBe('bukan_anggota');
  });

  it('karyawan khusus PIN dibuat tanpa email, dan Penugasannya bisa diganti', async () => {
    const pemilik = await dunia.daftarTenant();
    const outletKedua = await pemilik.tambahOutlet();
    const res = await pemilik.post('/v1/karyawan', { nama: 'Ujang', pin: '4321', penugasan: [{ outletId: pemilik.outletId, peran: 'dapur' }] }).expect(201);
    expect(res.body).toMatchObject({ nama: 'Ujang', email: null, punyaPin: true, undanganDiterima: false });

    const ganti = await pemilik
      .put(`/v1/karyawan/${res.body.id}/penugasan`, { penugasan: [{ outletId: outletKedua, peran: 'kasir' }] })
      .expect(200);
    expect(ganti.body.penugasan).toEqual([{ outletId: outletKedua, peran: 'kasir' }]);

    await pemilik.post('/v1/karyawan', { nama: 'Tanpa PIN' }).expect(400);
    await pemilik.post('/v1/karyawan', { nama: 'PIN Pendek', pin: '12' }).expect(400);
    await pemilik.post('/v1/karyawan', { nama: 'Peran Aneh', pin: '1234', penugasan: [{ outletId: pemilik.outletId, peran: 'raja' }] }).expect(400);
  });
});
