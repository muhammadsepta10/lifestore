import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buatDuniaTes, type DuniaTes, type PerangkatTes } from './support/dunia-tes';

// Seam: batas Diskon Manual per Peran tetap berlaku ketika isi Tagihan berubah sesudah diskon
// dipasang (batal Item Pesanan, gabung Meja), lewat HTTP terhadap Postgres sungguhan.

describe('Batas Diskon Manual setelah isi Tagihan berubah', () => {
  let dunia: DuniaTes;
  beforeAll(async () => {
    dunia = await buatDuniaTes();
  });
  afterAll(() => dunia?.tutup());

  const pasangDiskon = (p: PerangkatTes, id: string, body: object) =>
    dunia.http.put(`/v1/tagihan/${id}/diskon`).set('Authorization', `Perangkat ${p.token}`).send(body);

  it('Kasir tidak bisa membesarkan Diskon Manual nominal di atas batasnya dengan membatalkan Item Pesanan', async () => {
    const pemilik = await dunia.daftarTenant();
    await pemilik.aturPin(await pemilik.anggotaSaya(), '4321');
    const nasgor = await pemilik.buatMenu({ nama: 'Nasi Goreng', harga: 20_000 });
    const steak = await pemilik.buatMenu({ nama: 'Steak', harga: 180_000 });
    const kasir = await pemilik.bukaKasir();
    const id = await kasir.bukaTagihan();
    const pesanan = (await kasir.kirimPesanan(id, [{ menuId: nasgor }, { menuId: steak }]).expect(201)).body;
    const [idNasgor, idSteak] = pesanan.item.map((i: { id: string }) => i.id) as string[];
    // 20.000 dari subtotal 200.000 = 10%: masih dalam batas Kasir.
    await pasangDiskon(kasir, id, { jenis: 'nominal', nilai: 20_000, alasan: 'Promo' }).expect(200);

    // Tanpa Steak, 20.000 menjadi 100% dari subtotal 20.000: di atas batas Kasir.
    const ditolak = await kasir.post(`/v1/tagihan/${id}/item/${idSteak}/batal`).expect(403);
    expect(ditolak.body).toMatchObject({ kode: 'perlu_persetujuan_atasan', izin: 'diskon.di_atas_batas', batasPersen: 10 });
    expect((await kasir.get(`/v1/tagihan/${id}`).expect(200)).body.rincian).toMatchObject({ subtotal: 200_000, diskon: 20_000 });

    // Membatalkan Nasi Goreng: 20.000 dari 180.000 = 11,1%, juga di atas batas.
    await kasir.post(`/v1/tagihan/${id}/item/${idNasgor}/batal`).expect(403);
    // Dengan Persetujuan Atasan boleh, dan persetujuannya tercatat di Log Audit.
    const atasan = { persetujuanAtasan: { anggotaId: await pemilik.anggotaSaya(), pin: '4321' } };
    const batal = (await kasir.post(`/v1/tagihan/${id}/item/${idSteak}/batal`, atasan).expect(200)).body;
    expect(batal.rincian).toMatchObject({ subtotal: 20_000, diskon: 20_000 });
    const log = (await pemilik.get('/v1/log-audit').expect(200)).body as { aksi: string; penyetujuAnggotaId: string | null }[];
    expect(log.find((l) => l.aksi === 'batal_item_pesanan')?.penyetujuAnggotaId).toBe(await pemilik.anggotaSaya());
  });

  it('Diskon Manual persen tidak berubah nilainya terhadap batas ketika Item Pesanan dibatalkan', async () => {
    const pemilik = await dunia.daftarTenant();
    const nasgor = await pemilik.buatMenu({ nama: 'Nasi Goreng', harga: 20_000 });
    const kasir = await pemilik.bukaKasir();
    const id = await kasir.bukaTagihan();
    const pesanan = (await kasir.kirimPesanan(id, [{ menuId: nasgor }, { menuId: nasgor }]).expect(201)).body;
    await pasangDiskon(kasir, id, { jenis: 'persen', nilai: 10, alasan: 'Promo' }).expect(200);
    const batal = (await kasir.post(`/v1/tagihan/${id}/item/${pesanan.item[0].id}/batal`).expect(200)).body;
    expect(batal.rincian).toMatchObject({ subtotal: 20_000, diskon: 2_000 });
  });

  it('gabung Meja ditolak bila Tagihan penerima ber-Diskon Manual, supaya diskonnya tidak membesar tanpa persetujuan baru', async () => {
    const pemilik = await dunia.daftarTenant();
    const [meja1, meja2, meja3] = await pemilik.buatMeja(1, 3);
    const nasgor = await pemilik.buatMenu({ nama: 'Nasi Goreng', harga: 20_000 });
    const steak = await pemilik.buatMenu({ nama: 'Steak', harga: 180_000 });
    const kasir = await pemilik.bukaKasir();
    const penerima = await kasir.bukaTagihanDineIn(meja1!);
    await kasir.kirimPesanan(penerima, [{ menuId: nasgor }]).expect(201);
    await pasangDiskon(kasir, penerima, { jenis: 'persen', nilai: 10, alasan: 'Promo' }).expect(200);
    const lain = await kasir.bukaTagihanDineIn(meja2!);
    await kasir.kirimPesanan(lain, [{ menuId: steak }]).expect(201);

    expect((await kasir.post(`/v1/tagihan/${penerima}/gabung-meja`, { mejaId: meja2 }).expect(409)).body.kode).toBe('tagihan_berdiskon');
    expect((await kasir.get(`/v1/tagihan/${penerima}`).expect(200)).body.rincian).toMatchObject({ subtotal: 20_000, diskon: 2_000 });
    expect((await kasir.get(`/v1/tagihan/${lain}`).expect(200)).body.status).toBe('terbuka');
    // Menambah Meja Kosong tidak memindahkan item, jadi tetap boleh.
    const gabung = (await kasir.post(`/v1/tagihan/${penerima}/gabung-meja`, { mejaId: meja3 }).expect(200)).body;
    expect(gabung.meja).toHaveLength(2);
  });
});
