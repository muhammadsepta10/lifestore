import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { tanggalOperasional } from '../src/penjualan/nomor';
import { buatDuniaTes, type DuniaTes, type PemilikTes } from './support/dunia-tes';

// Seam (#40): dine-in dengan Meja lewat HTTP terhadap Postgres sungguhan.
// Angka dihitung tangan: PBJT 10% (harga belum termasuk pajak), Service Charge 5% hanya dine-in.

const SATU_HARI = 24 * 60 * 60 * 1000;

async function aturServiceCharge(pemilik: PemilikTes, tarifPersen: number) {
  await pemilik
    .post(`/v1/outlet/${pemilik.outletId}/profil-pajak`, {
      berlakuMulai: tanggalOperasional(new Date()),
      jenis: 'PBJT',
      tarifPersen: 10,
      serviceCharge: { tarifPersen },
    })
    .expect(201);
}

type MejaKasir = { id: string; label: string; status: string; tagihanId: string | null };

describe('Dine-in dengan Meja', () => {
  let dunia: DuniaTes;
  beforeAll(async () => {
    dunia = await buatDuniaTes();
  });
  afterAll(() => dunia?.tutup());

  it('Tagihan dine-in dikenai Service Charge, bawa pulang tidak, dan Meja menjadi Terisi sampai lunas', async () => {
    const pemilik = await dunia.daftarTenant();
    await pemilik.aktifkanMetodeBayar('tunai');
    await aturServiceCharge(pemilik, 5);
    const [meja1, meja2] = await pemilik.buatMeja(1, 2);
    const soto = await pemilik.buatMenu({ nama: 'Soto', harga: 100_000 });
    const kasir = await pemilik.bukaKasir();
    await kasir.bukaShift(0);

    const dineIn = await kasir.bukaTagihanDineIn(meja1!);
    await kasir.kirimPesanan(dineIn, [{ menuId: soto }]).expect(201);
    const bawaPulang = await kasir.bukaTagihan();
    await kasir.kirimPesanan(bawaPulang, [{ menuId: soto }]).expect(201);

    // Dine-in: SC 5% = 5.000, pajak 10% × 105.000 = 10.500.
    expect((await kasir.get(`/v1/tagihan/${dineIn}`).expect(200)).body).toMatchObject({
      kanal: 'dine_in',
      mejaId: meja1,
      meja: [{ id: meja1, label: '1' }],
      rincian: { subtotal: 100_000, serviceCharge: 5_000, dasarPajak: 105_000, pajak: 10_500, total: 115_500 },
    });
    expect((await kasir.get(`/v1/tagihan/${bawaPulang}`).expect(200)).body).toMatchObject({
      kanal: 'bawa_pulang',
      mejaId: null,
      meja: [],
      rincian: { subtotal: 100_000, serviceCharge: 0, dasarPajak: 100_000, pajak: 10_000, total: 110_000 },
    });

    const status = async () =>
      ((await kasir.get('/v1/kasir/meja').expect(200)).body as MejaKasir[]).map((m) => [m.label, m.status, m.tagihanId]);
    expect(await status()).toEqual([
      ['1', 'terisi', dineIn],
      ['2', 'kosong', null],
    ]);
    // Pemilik melihat status yang sama dari dashboard.
    const dariDashboard = (await pemilik.get(`/v1/outlet/${pemilik.outletId}/meja`).expect(200)).body as MejaKasir[];
    expect(dariDashboard.map((m) => [m.label, m.status])).toEqual([
      ['1', 'terisi'],
      ['2', 'kosong'],
    ]);

    // Pesanan berikutnya masuk ke Tagihan yang sama.
    await kasir.kirimPesanan(dineIn, [{ menuId: soto }]).expect(201);
    const sesudah = (await kasir.get(`/v1/tagihan/${dineIn}`).expect(200)).body;
    expect(sesudah.pesanan).toHaveLength(2);
    expect(sesudah.total).toBe(231_000);

    // Meja yang terisi tidak bisa dibuka lagi; Meja nonaktif tidak bisa dipilih.
    const bentrok = await kasir.post('/v1/tagihan', { kanal: 'dine_in', mejaId: meja1 }).expect(409);
    expect(bentrok.body).toMatchObject({ kode: 'meja_terisi', tagihanId: dineIn });
    await kasir.post(`/v1/kasir/meja/${meja2}/nonaktifkan`).expect(200);
    expect((await kasir.post('/v1/tagihan', { kanal: 'dine_in', mejaId: meja2 }).expect(409)).body.kode).toBe('meja_nonaktif');
    // Dine-in wajib punya Meja; bawa pulang tidak boleh.
    await kasir.post('/v1/tagihan', { kanal: 'dine_in' }).expect(400);
    await kasir.post('/v1/tagihan', { kanal: 'bawa_pulang', mejaId: meja1 }).expect(400);

    await kasir.bayarTunai(dineIn, 231_000).expect(201);
    expect((await status())[0]).toEqual(['1', 'kosong', null]);
  });

  it('dua perangkat membuka Meja yang sama bersamaan: hanya satu Tagihan yang terbuka', async () => {
    const pemilik = await dunia.daftarTenant();
    const [meja] = await pemilik.buatMeja(1, 1);
    const a = await pemilik.bukaKasir();
    const b = await pemilik.bukaKasir();
    const hasil = await Promise.all([a, b].map((k) => k.post('/v1/tagihan', { kanal: 'dine_in', mejaId: meja })));
    expect(hasil.map((r) => r.status).sort()).toEqual([201, 409]);
    expect((await a.get('/v1/tagihan').expect(200)).body).toHaveLength(1);
  });

  it('pindah Meja mempertahankan satu Tagihan dan status Meja ikut pindah', async () => {
    const pemilik = await dunia.daftarTenant();
    const [meja1, meja2, meja3] = await pemilik.buatMeja(1, 3);
    const soto = await pemilik.buatMenu({ nama: 'Soto', harga: 10_000 });
    const kasir = await pemilik.bukaKasir();
    const tagihanId = await kasir.bukaTagihanDineIn(meja1!);
    await kasir.kirimPesanan(tagihanId, [{ menuId: soto }]).expect(201);
    const lain = await kasir.bukaTagihanDineIn(meja3!);

    const pindah = (await kasir.post(`/v1/tagihan/${tagihanId}/pindah-meja`, { mejaId: meja2 }).expect(200)).body;
    expect(pindah).toMatchObject({ id: tagihanId, mejaId: meja2, meja: [{ id: meja2, label: '2' }], total: 11_000 });
    const daftar = (await kasir.get('/v1/kasir/meja').expect(200)).body as MejaKasir[];
    expect(daftar.map((m) => [m.label, m.status, m.tagihanId])).toEqual([
      ['1', 'kosong', null],
      ['2', 'terisi', tagihanId],
      ['3', 'terisi', lain],
    ]);
    expect((await kasir.get('/v1/tagihan').expect(200)).body).toHaveLength(2);
    // Pindah ke Meja yang terisi Tagihan lain ditolak.
    expect((await kasir.post(`/v1/tagihan/${tagihanId}/pindah-meja`, { mejaId: meja3 }).expect(409)).body.kode).toBe('meja_terisi');
    // Tagihan bawa pulang tidak punya Meja untuk dipindah.
    const bawaPulang = await kasir.bukaTagihan();
    await kasir.post(`/v1/tagihan/${bawaPulang}/pindah-meja`, { mejaId: meja1 }).expect(409);
  });

  it('gabung Meja: Meja kosong ikut ditempati, dan Tagihan di Meja terisi dilebur menjadi satu Tagihan', async () => {
    const pemilik = await dunia.daftarTenant();
    await pemilik.aktifkanMetodeBayar('tunai');
    const [meja1, meja2, meja3] = await pemilik.buatMeja(1, 3);
    const soto = await pemilik.buatMenu({ nama: 'Soto', harga: 10_000 });
    const teh = await pemilik.buatMenu({ nama: 'Teh', harga: 5_000 });
    const kasir = await pemilik.bukaKasir();
    await kasir.bukaShift(0);
    const utama = await kasir.bukaTagihanDineIn(meja1!);
    await kasir.kirimPesanan(utama, [{ menuId: soto }]).expect(201);
    const kedua = await kasir.bukaTagihanDineIn(meja3!);
    await kasir.kirimPesanan(kedua, [{ menuId: teh, jumlah: 2 }]).expect(201);

    // Meja 2 kosong: Tagihan sekarang menempati Meja 1 dan 2.
    const duaMeja = (await kasir.post(`/v1/tagihan/${utama}/gabung-meja`, { mejaId: meja2 }).expect(200)).body;
    expect(duaMeja.meja.map((m: { label: string }) => m.label)).toEqual(['1', '2']);
    expect(duaMeja.mejaId).toBe(meja1);

    // Meja 3 terisi Tagihan lain: itemnya pindah ke Tagihan utama, Tagihan kedua berstatus digabung.
    const gabung = (await kasir.post(`/v1/tagihan/${utama}/gabung-meja`, { mejaId: meja3 }).expect(200)).body;
    expect(gabung.meja.map((m: { label: string }) => m.label)).toEqual(['1', '2', '3']);
    expect(gabung.rincian).toMatchObject({ subtotal: 20_000, pajak: 2_000, total: 22_000 });
    expect(gabung.pesanan.flatMap((p: { item: { nama: string }[] }) => p.item.map((i) => i.nama))).toEqual(['Soto', 'Teh']);

    const terbuka = (await kasir.get('/v1/tagihan').expect(200)).body as { id: string }[];
    expect(terbuka.map((t) => t.id)).toEqual([utama]);
    expect((await kasir.get(`/v1/tagihan/${kedua}`).expect(200)).body).toMatchObject({ status: 'digabung', digabungKeTagihanId: utama, total: 0 });
    const meja = (await kasir.get('/v1/kasir/meja').expect(200)).body as MejaKasir[];
    expect(meja.map((m) => [m.status, m.tagihanId])).toEqual([
      ['terisi', utama],
      ['terisi', utama],
      ['terisi', utama],
    ]);
    // Tagihan yang sudah digabung tidak bisa diisi atau dibayar lagi.
    expect((await kasir.kirimPesanan(kedua, [{ menuId: teh }]).expect(409)).body.kode).toBe('tagihan_sudah_ditutup');

    // Lunas: satu Nomor Nota, ketiga Meja kosong lagi.
    const bayar = (await kasir.bayarTunai(utama, 22_000).expect(201)).body;
    expect(bayar.tagihan).toMatchObject({ status: 'lunas', nomorNota: 1 });
    expect(((await kasir.get('/v1/kasir/meja').expect(200)).body as MejaKasir[]).map((m) => m.status)).toEqual(['kosong', 'kosong', 'kosong']);
  });

  it('Meja dan Tagihan Tenant atau Outlet lain tidak bisa dipakai, dipindah, digabung, atau dipisah', async () => {
    const a = await dunia.daftarTenant();
    const b = await dunia.daftarTenant();
    const [mejaA] = await a.buatMeja(1, 1);
    const [mejaB1, mejaB2] = await b.buatMeja(1, 2);
    const outletKeduaA = await a.tambahOutlet();
    const [mejaLainOutlet] = await a.buatMeja(1, 1, outletKeduaA);
    const menuB = await b.buatMenu({ nama: 'Soto', harga: 10_000 });
    const kasirA = await a.bukaKasir();
    const kasirB = await b.bukaKasir();
    const tagihanB = await kasirB.bukaTagihanDineIn(mejaB1!);
    const pesananB = (await kasirB.kirimPesanan(tagihanB, [{ menuId: menuB }, { menuId: menuB }]).expect(201)).body;
    const sebelum = (await kasirB.get(`/v1/tagihan/${tagihanB}`).expect(200)).body;

    const tagihanA = await kasirA.bukaTagihanDineIn(mejaA!);
    for (const coba of [
      () => kasirA.post('/v1/tagihan', { kanal: 'dine_in', mejaId: mejaB2 }),
      () => kasirA.post('/v1/tagihan', { kanal: 'dine_in', mejaId: mejaLainOutlet }),
      () => kasirA.post(`/v1/tagihan/${tagihanA}/pindah-meja`, { mejaId: mejaB2 }),
      () => kasirA.post(`/v1/tagihan/${tagihanA}/gabung-meja`, { mejaId: mejaB1 }),
      () => kasirA.post(`/v1/tagihan/${tagihanA}/gabung-meja`, { mejaId: mejaLainOutlet }),
      () => kasirA.post(`/v1/tagihan/${tagihanB}/pindah-meja`, { mejaId: mejaA }),
      () => kasirA.post(`/v1/tagihan/${tagihanB}/gabung-meja`, { mejaId: mejaA }),
      () => kasirA.post(`/v1/tagihan/${tagihanB}/pisah`, { itemIds: [pesananB.item[0].id] }),
    ]) {
      expect((await coba()).status).toBe(404);
    }
    // Item Pesanan Tenant lain tidak bisa ditarik ke Tagihan sendiri lewat Pisah Tagihan.
    await kasirA.post(`/v1/tagihan/${tagihanA}/pisah`, { itemIds: [pesananB.item[0].id] }).expect(400);
    expect((await kasirB.get(`/v1/tagihan/${tagihanB}`).expect(200)).body).toEqual(sebelum);
    expect(((await kasirB.get('/v1/kasir/meja').expect(200)).body as MejaKasir[]).map((m) => [m.status, m.tagihanId])).toEqual([
      ['terisi', tagihanB],
      ['kosong', null],
    ]);
  });
});

describe('Profil Pajak bertanggal pada Tagihan', () => {
  let dunia: DuniaTes;
  beforeAll(async () => {
    dunia = await buatDuniaTes();
  });
  afterAll(() => dunia?.tutup());

  it('Tagihan sebelum dan sesudah tanggal berlaku memakai tarif yang benar', async () => {
    const pemilik = await dunia.daftarTenant();
    const [meja1, meja2] = await pemilik.buatMeja(1, 2);
    const soto = await pemilik.buatMenu({ nama: 'Soto', harga: 100_000 });
    const kasir = await pemilik.bukaKasir();
    // Mulai besok: PPN 11% dengan Service Charge 5%.
    const besok = tanggalOperasional(new Date(dunia.jam.sekarang().getTime() + SATU_HARI));
    await pemilik
      .post(`/v1/outlet/${pemilik.outletId}/profil-pajak`, { berlakuMulai: besok, jenis: 'PPN', tarifPersen: 11, serviceCharge: { tarifPersen: 5 } })
      .expect(201);

    const hariIni = await kasir.bukaTagihanDineIn(meja1!);
    await kasir.kirimPesanan(hariIni, [{ menuId: soto }]).expect(201);
    dunia.jam.maju(SATU_HARI);
    const esok = await kasir.bukaTagihanDineIn(meja2!);
    await kasir.kirimPesanan(esok, [{ menuId: soto }]).expect(201);

    expect((await kasir.get(`/v1/tagihan/${esok}`).expect(200)).body).toMatchObject({
      profilPajak: { jenis: 'PPN', tarifPersen: 11 },
      rincian: { serviceCharge: 5_000, dasarPajak: 105_000, pajak: 11_550, total: 116_550 },
    });
    // Tagihan yang dibuka sebelum tanggal berlaku tetap memakai tarif lama, juga untuk Pesanan baru.
    await kasir.kirimPesanan(hariIni, [{ menuId: soto }]).expect(201);
    expect((await kasir.get(`/v1/tagihan/${hariIni}`).expect(200)).body).toMatchObject({
      profilPajak: { jenis: 'PBJT', tarifPersen: 10 },
      rincian: { subtotal: 200_000, serviceCharge: 0, pajak: 20_000, total: 220_000 },
    });
  });
});
