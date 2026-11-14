import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buatDuniaTes, type DuniaTes } from './support/dunia-tes';

describe('Calon pemilik mendaftar sendiri', () => {
  let dunia: DuniaTes;
  beforeAll(async () => {
    dunia = await buatDuniaTes();
  });
  afterAll(() => dunia?.tutup());

  it('daftar → verifikasi → masuk menghasilkan Tenant, Merek default, Outlet pertama, dan Masa Coba', async () => {
    await dunia.http
      .post('/v1/daftar')
      .send({ email: 'sari@warung.test', kataSandi: 'rahasia-sekali', namaUsaha: 'Warung Sari', kota: 'Bandung' })
      .expect(201);

    const tokenVerifikasi = dunia.email.tokenVerifikasiUntuk('sari@warung.test');
    await dunia.http.post('/v1/verifikasi-email').send({ token: tokenVerifikasi }).expect(200);

    const masuk = await dunia.http
      .post('/v1/masuk')
      .send({ email: 'sari@warung.test', kataSandi: 'rahasia-sekali' })
      .expect(200);
    expect(masuk.body.tenant).toEqual([{ id: expect.any(String), nama: 'Warung Sari' }]);
    const auth = { Authorization: `Bearer ${masuk.body.token}` };

    const merek = await dunia.http.get('/v1/merek').set(auth).expect(200);
    expect(merek.body).toEqual([{ id: expect.any(String), nama: 'Warung Sari', utama: true }]);

    const outlet = await dunia.http.get('/v1/outlet').set(auth).expect(200);
    expect(outlet.body).toEqual([
      expect.objectContaining({ nama: 'Warung Sari', kota: 'Bandung', merekId: merek.body[0].id }),
    ]);

    const dashboard = await dunia.http.get('/v1/dashboard').set(auth).expect(200);
    expect(dashboard.body.masaCoba).toEqual({
      paketLangganan: 'Pro',
      berakhirPada: expect.any(String),
      sisaHari: 14,
    });
  });

  it('kata sandi salah tidak bisa masuk', async () => {
    await dunia.daftarTenant({ email: 'budi@warung.test', kataSandi: 'kata-sandi-budi' });
    await dunia.http.post('/v1/masuk').send({ email: 'budi@warung.test', kataSandi: 'salah-total' }).expect(401);
  });

  it('belum terverifikasi tidak bisa masuk', async () => {
    await dunia.http
      .post('/v1/daftar')
      .send({ email: 'tono@warung.test', kataSandi: 'rahasia-tono', namaUsaha: 'Bakso Tono', kota: 'Solo' })
      .expect(201);
    const res = await dunia.http.post('/v1/masuk').send({ email: 'tono@warung.test', kataSandi: 'rahasia-tono' });
    expect(res.status).toBe(403);
    expect(res.body.kode).toBe('email_belum_terverifikasi');
  });

  it('token verifikasi hanya bisa dipakai sekali dan tidak membuat Tenant kedua', async () => {
    await dunia.http
      .post('/v1/daftar')
      .send({ email: 'ani@warung.test', kataSandi: 'rahasia-ani', namaUsaha: 'Kopi Ani', kota: 'Malang' })
      .expect(201);
    const token = dunia.email.tokenVerifikasiUntuk('ani@warung.test');
    await dunia.http.post('/v1/verifikasi-email').send({ token }).expect(200);
    await dunia.http.post('/v1/verifikasi-email').send({ token }).expect(400);

    const masuk = await dunia.http.post('/v1/masuk').send({ email: 'ani@warung.test', kataSandi: 'rahasia-ani' }).expect(200);
    expect(masuk.body.tenant).toHaveLength(1);
  });

  it('email yang sudah terdaftar tidak bisa didaftarkan lagi', async () => {
    await dunia.daftarTenant({ email: 'dua@warung.test' });
    await dunia.http
      .post('/v1/daftar')
      .send({ email: 'DUA@warung.test', kataSandi: 'apa-saja-123', namaUsaha: 'Lain', kota: 'Bogor' })
      .expect(409);
  });

  it('data daftar yang tidak lengkap ditolak', async () => {
    await dunia.http.post('/v1/daftar').send({ email: 'bukan-email', kataSandi: 'pendek', namaUsaha: '', kota: '' }).expect(400);
  });

  it('endpoint dashboard butuh sesi', async () => {
    await dunia.http.get('/v1/dashboard').expect(401);
    await dunia.http.get('/v1/dashboard').set('Authorization', 'Bearer palsu').expect(401);
  });
});
