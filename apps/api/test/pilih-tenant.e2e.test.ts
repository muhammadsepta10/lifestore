import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buatDuniaTes, type DuniaTes } from './support/dunia-tes';

describe('Pengguna dengan lebih dari satu Tenant memilih Tenant', () => {
  let dunia: DuniaTes;
  beforeAll(async () => {
    dunia = await buatDuniaTes();
  });
  afterAll(() => dunia?.tutup());

  it('setelah masuk, Pengguna dengan dua Tenant harus memilih Tenant, lalu hanya melihat data Tenant itu', async () => {
    const pemilik = await dunia.daftarTenant({ namaUsaha: 'Sate Pak Dul', kota: 'Bandung' });
    // Tenant kedua didapat lewat undangan: Pengguna yang sama menjadi Anggota di usaha orang lain.
    const pemilikLain = await dunia.daftarTenant({ namaUsaha: 'Kopi Pak Dul', kota: 'Garut' });
    await pemilikLain.tambahKaryawan({ email: pemilik.email, penugasan: [{ outletId: pemilikLain.outletId, peran: 'manajer_outlet' }] });
    await dunia.http.post('/v1/undangan/terima').send({ token: dunia.email.tokenUndanganUntuk(pemilik.email) }).expect(200);
    const tenantKedua = pemilikLain.tenantId;

    const sesi = await dunia.masuk(pemilik.email, pemilik.kataSandi);
    expect(sesi.tenant.map((t) => t.nama)).toEqual(['Sate Pak Dul', 'Kopi Pak Dul']);

    const belumPilih = await sesi.get('/v1/outlet');
    expect(belumPilih.status).toBe(403);
    expect(belumPilih.body.kode).toBe('tenant_belum_dipilih');

    await sesi.pilihTenant(tenantKedua);
    const outletKedua = await sesi.get('/v1/outlet').expect(200);
    expect(outletKedua.body.map((o: { nama: string; kota: string }) => [o.nama, o.kota])).toEqual([['Kopi Pak Dul', 'Garut']]);

    await sesi.pilihTenant(pemilik.tenantId);
    const outletPertama = await sesi.get('/v1/outlet').expect(200);
    expect(outletPertama.body.map((o: { nama: string }) => o.nama)).toEqual(['Sate Pak Dul']);

    const info = await sesi.get('/v1/sesi').expect(200);
    expect(info.body).toMatchObject({ pengguna: { email: pemilik.email }, tenantAktifId: pemilik.tenantId });
  });

  it('Pengguna yang sudah masuk tidak bisa mendirikan Tenant tambahan dengan Masa Coba baru', async () => {
    const pemilik = await dunia.daftarTenant();
    await pemilik.post('/v1/tenant', { namaUsaha: 'Usaha Kedua', kota: 'Surabaya' }).expect(404);
    expect((await dunia.masuk(pemilik.email, pemilik.kataSandi)).tenant).toHaveLength(1);
  });

  it('Pengguna tidak bisa memilih Tenant tempat ia bukan Anggota', async () => {
    const a = await dunia.daftarTenant();
    const b = await dunia.daftarTenant();
    await a.post('/v1/sesi/tenant', { tenantId: b.tenantId }).expect(403);
    await a.post('/v1/sesi/tenant', { tenantId: '00000000-0000-4000-8000-000000000000' }).expect(403);
    const outlet = await a.get('/v1/outlet').expect(200);
    expect(outlet.body.map((o: { id: string }) => o.id)).toEqual([a.outletId]);
  });

  it('keluar mengakhiri sesi', async () => {
    const pemilik = await dunia.daftarTenant();
    await pemilik.post('/v1/keluar').expect(204);
    await pemilik.get('/v1/dashboard').expect(401);
  });
});
