import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buatDuniaTes, type DuniaTes } from './support/dunia-tes';

describe('Menu: Kategori, Menu, Varian, Grup Pilihan', () => {
  let dunia: DuniaTes;
  beforeAll(async () => {
    dunia = await buatDuniaTes();
  });
  afterAll(() => dunia?.tutup());

  it('pemilik membuat Kategori dengan warna pastel dan emoji, lalu mengatur urutannya', async () => {
    const pemilik = await dunia.daftarTenant();
    const url = `/v1/merek/${pemilik.merekId}/kategori`;
    const kopi = (await pemilik.post(url, { nama: 'Kopi', warna: 'peach', ikon: '☕' }).expect(201)).body;
    const makanan = (await pemilik.post(url, { nama: 'Makanan', warna: 'mint', ikon: '🍛' }).expect(201)).body;
    expect(kopi).toMatchObject({ id: expect.any(String), merekId: pemilik.merekId, nama: 'Kopi', warna: 'peach', ikon: '☕' });

    let daftar = (await pemilik.get(url).expect(200)).body;
    expect(daftar.map((k: { nama: string }) => k.nama)).toEqual(['Kopi', 'Makanan']);

    await pemilik.put(`${url}/urutan`, { ids: [makanan.id, kopi.id] }).expect(200);
    daftar = (await pemilik.get(url).expect(200)).body;
    expect(daftar.map((k: { nama: string }) => k.nama)).toEqual(['Makanan', 'Kopi']);

    const diubah = (await pemilik.patch(`/v1/kategori/${kopi.id}`, { nama: 'Kopi Susu', warna: 'sand', gambarUrl: 'https://cdn.test/kopi.png' }).expect(200)).body;
    expect(diubah).toMatchObject({ nama: 'Kopi Susu', warna: 'sand', ikon: '☕', gambarUrl: 'https://cdn.test/kopi.png' });

    await pemilik.post(url, { nama: 'Aneh', warna: 'hitam-pekat' }).expect(400);
  });

  it('Menu dengan Varian dan Grup Pilihan dibuat lalu dibaca kembali utuh', async () => {
    const pemilik = await dunia.daftarTenant();
    const kategoriId = (await pemilik.post(`/v1/merek/${pemilik.merekId}/kategori`, { nama: 'Kopi', warna: 'peach' }).expect(201)).body.id;
    const dibuat = (
      await pemilik
        .post(`/v1/merek/${pemilik.merekId}/menu`, {
          kategoriId,
          nama: 'Es Kopi Susu',
          harga: 18000,
          deskripsi: 'Kopi susu gula aren',
          fotoUrl: 'https://cdn.test/eskopi.jpg',
          varian: [
            { nama: 'Reguler', harga: 18000 },
            { nama: 'Jumbo', harga: 24000 },
          ],
          grupPilihan: [
            {
              nama: 'Level Manis',
              minimum: 1,
              maksimum: 1,
              pilihan: [
                { nama: 'Normal', harga: 0 },
                { nama: 'Kurang Manis', harga: 0 },
              ],
            },
            {
              nama: 'Topping',
              minimum: 0,
              maksimum: 2,
              pilihan: [
                { nama: 'Boba', harga: 5000 },
                { nama: 'Cincau', harga: 4000 },
                { nama: 'Jelly', harga: 3000 },
              ],
            },
          ],
        })
        .expect(201)
    ).body;

    const dibaca = (await pemilik.get(`/v1/menu/${dibuat.id}`).expect(200)).body;
    expect(dibaca).toEqual(dibuat);
    expect(dibaca).toMatchObject({
      merekId: pemilik.merekId,
      kategoriId,
      nama: 'Es Kopi Susu',
      harga: 18000,
      deskripsi: 'Kopi susu gula aren',
      fotoUrl: 'https://cdn.test/eskopi.jpg',
      aktif: true,
      bebasPajak: false,
      varian: [
        { id: expect.any(String), nama: 'Reguler', harga: 18000 },
        { id: expect.any(String), nama: 'Jumbo', harga: 24000 },
      ],
      grupPilihan: [
        {
          nama: 'Level Manis',
          minimum: 1,
          maksimum: 1,
          pilihan: [
            { nama: 'Normal', harga: 0 },
            { nama: 'Kurang Manis', harga: 0 },
          ],
        },
        {
          nama: 'Topping',
          minimum: 0,
          maksimum: 2,
          pilihan: [
            { nama: 'Boba', harga: 5000 },
            { nama: 'Cincau', harga: 4000 },
            { nama: 'Jelly', harga: 3000 },
          ],
        },
      ],
    });

    const daftar = (await pemilik.get(`/v1/merek/${pemilik.merekId}/menu`).expect(200)).body;
    expect(daftar.map((m: { id: string }) => m.id)).toEqual([dibuat.id]);
  });

  it('aturan minimum/maksimum Grup Pilihan ditolak bila tidak masuk akal', async () => {
    const pemilik = await dunia.daftarTenant();
    const kategoriId = (await pemilik.post(`/v1/merek/${pemilik.merekId}/kategori`, { nama: 'Mie', warna: 'lemon' }).expect(201)).body.id;
    const menuDengan = (grup: object) => ({ kategoriId, nama: 'Mie Ayam', harga: 15000, grupPilihan: [grup] });
    const dua = [
      { nama: 'A', harga: 0 },
      { nama: 'B', harga: 0 },
    ];
    for (const grup of [
      { nama: 'Min lebih dari maks', minimum: 2, maksimum: 1, pilihan: dua },
      { nama: 'Maks melebihi jumlah pilihan', minimum: 0, maksimum: 3, pilihan: dua },
      { nama: 'Maks nol', minimum: 0, maksimum: 0, pilihan: dua },
      { nama: 'Tanpa pilihan', minimum: 0, maksimum: 1, pilihan: [] },
      { nama: 'Harga negatif', minimum: 0, maksimum: 1, pilihan: [{ nama: 'X', harga: -1 }] },
    ]) {
      const res = await pemilik.post(`/v1/merek/${pemilik.merekId}/menu`, menuDengan(grup));
      expect({ grup: grup.nama, status: res.status }).toEqual({ grup: grup.nama, status: 400 });
    }
    await pemilik.post(`/v1/merek/${pemilik.merekId}/menu`, { kategoriId, nama: 'Tanpa harga' }).expect(400);
    await pemilik.post(`/v1/merek/${pemilik.merekId}/menu`, { kategoriId: 'tidak-ada', nama: 'X', harga: 1 }).expect(404);
    expect((await pemilik.get(`/v1/merek/${pemilik.merekId}/menu`).expect(200)).body).toEqual([]);
  });

  it('Menu nonaktif tidak muncul untuk dijual tetapi tetap ada untuk riwayat', async () => {
    const pemilik = await dunia.daftarTenant();
    const kategoriId = await pemilik.buatKategori({ nama: 'Gorengan' });
    const tahu = await pemilik.buatMenu({ kategoriId, nama: 'Tahu Isi', harga: 3000 });
    const tempe = await pemilik.buatMenu({ kategoriId, nama: 'Tempe Mendoan', harga: 2500 });

    const dijual = async () =>
      (await pemilik.get(`/v1/outlet/${pemilik.outletId}/menu`).expect(200)).body.menu.map((m: { nama: string }) => m.nama);
    expect(await dijual()).toEqual(['Tahu Isi', 'Tempe Mendoan']);

    await pemilik.patch(`/v1/menu/${tahu}`, { aktif: false }).expect(200);
    expect(await dijual()).toEqual(['Tempe Mendoan']);

    // Tetap ada: bisa dibaca dan muncul di daftar pengelolaan Merek.
    expect((await pemilik.get(`/v1/menu/${tahu}`).expect(200)).body).toMatchObject({ nama: 'Tahu Isi', aktif: false });
    const semua = (await pemilik.get(`/v1/merek/${pemilik.merekId}/menu`).expect(200)).body;
    expect(semua.map((m: { nama: string; aktif: boolean }) => [m.nama, m.aktif])).toEqual([
      ['Tahu Isi', false],
      ['Tempe Mendoan', true],
    ]);

    await pemilik.patch(`/v1/menu/${tahu}`, { aktif: true }).expect(200);
    expect(await dijual()).toEqual(['Tahu Isi', 'Tempe Mendoan']);
    void tempe;
  });

  it('pemilik mengubah Menu, Varian, dan Grup Pilihan, serta mengatur urutan Menu', async () => {
    const pemilik = await dunia.daftarTenant();
    const kategoriId = await pemilik.buatKategori({ nama: 'Minuman' });
    const kategoriLain = await pemilik.buatKategori({ nama: 'Jus' });
    const teh = await pemilik.buatMenu({
      kategoriId,
      nama: 'Es Teh',
      harga: 5000,
      varian: [
        { nama: 'Kecil', harga: 5000 },
        { nama: 'Besar', harga: 7000 },
      ],
    });
    const jeruk = await pemilik.buatMenu({ kategoriId, nama: 'Es Jeruk', harga: 8000 });
    const awal = (await pemilik.get(`/v1/menu/${teh}`).expect(200)).body;

    const diubah = (
      await pemilik
        .patch(`/v1/menu/${teh}`, {
          nama: 'Es Teh Manis',
          kategoriId: kategoriLain,
          bebasPajak: true,
          deskripsi: 'Teh melati',
          varian: [
            { id: awal.varian[1].id, nama: 'Besar', harga: 8000 },
            { nama: 'Jumbo', harga: 10000 },
          ],
          grupPilihan: [{ nama: 'Es', minimum: 1, maksimum: 1, pilihan: [{ nama: 'Normal', harga: 0 }, { nama: 'Sedikit', harga: 0 }] }],
        })
        .expect(200)
    ).body;
    expect(diubah).toMatchObject({
      nama: 'Es Teh Manis',
      kategoriId: kategoriLain,
      bebasPajak: true,
      deskripsi: 'Teh melati',
      varian: [
        { id: awal.varian[1].id, nama: 'Besar', harga: 8000 },
        { nama: 'Jumbo', harga: 10000 },
      ],
      grupPilihan: [{ nama: 'Es', minimum: 1, maksimum: 1 }],
    });
    expect((await pemilik.get(`/v1/menu/${teh}`).expect(200)).body).toEqual(diubah);
    await pemilik.patch(`/v1/menu/${teh}`, { grupPilihan: [{ nama: 'X', minimum: 2, maksimum: 1, pilihan: [{ nama: 'a', harga: 0 }] }] }).expect(400);

    await pemilik.put(`/v1/merek/${pemilik.merekId}/menu/urutan`, { ids: [jeruk, teh] }).expect(200);
    const daftar = (await pemilik.get(`/v1/merek/${pemilik.merekId}/menu`).expect(200)).body;
    expect(daftar.map((m: { nama: string }) => m.nama)).toEqual(['Es Jeruk', 'Es Teh Manis']);
  });
});
