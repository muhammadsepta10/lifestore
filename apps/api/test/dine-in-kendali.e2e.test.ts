import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buatDuniaTes, type DuniaTes, type PerangkatTes } from './support/dunia-tes';

// Seam (#40 × #39): Diskon Manual, batal, dan void bersama Bayar Terpisah, Pisah Tagihan, gabung Meja,
// dan Outlet bayar-dulu, lewat HTTP terhadap Postgres sungguhan.
// Angka dihitung tangan dari Profil Pajak default (PBJT 10%, harga belum termasuk pajak).

describe('Kendali kasir bersama dine-in dan cara bayar lengkap', () => {
  let dunia: DuniaTes;
  beforeAll(async () => {
    dunia = await buatDuniaTes();
  });
  afterAll(() => dunia?.tutup());

  const kirim = (p: PerangkatTes, metode: 'put' | 'delete', path: string, body?: object) =>
    dunia.http[metode](path).set('Authorization', `Perangkat ${p.token}`).send(body ?? {});

  it('Diskon Manual ikut dalam total Bayar Terpisah; diskon atau batal yang membuat total tidak lagi di atas yang sudah dibayar ditolak', async () => {
    const pemilik = await dunia.daftarTenant();
    await pemilik.aktifkanMetodeBayar('tunai');
    await pemilik.aktifkanMetodeBayar('qris_statis');
    const nasgor = await pemilik.buatMenu({ nama: 'Nasi Goreng', harga: 20_000 });
    const steak = await pemilik.buatMenu({ nama: 'Steak', harga: 100_000 });
    const kasir = await pemilik.bukaKasir();
    await kasir.bukaShift(0);
    const id = await kasir.bukaTagihan();
    const pesanan = (await kasir.kirimPesanan(id, [{ menuId: nasgor, jumlah: 2 }, { menuId: steak }]).expect(201)).body;
    const [idNasgor, idSteak] = pesanan.item.map((i: { id: string }) => i.id) as string[];

    // Subtotal 140.000, diskon 10% = 14.000, pajak 10% × 126.000 = 12.600, total 138.600.
    const diskon = (await kirim(kasir, 'put', `/v1/tagihan/${id}/diskon`, { jenis: 'persen', nilai: 10, alasan: 'Pelanggan tetap' }).expect(200)).body;
    expect(diskon.rincian).toMatchObject({ subtotal: 140_000, diskon: 14_000, pajak: 12_600, total: 138_600 });
    const qris = (await kasir.bayar(id, { metode: 'qris_statis', jumlah: 50_000 }).expect(201)).body;
    expect(qris.tagihan).toMatchObject({ status: 'terbuka', dibayar: 50_000, sisa: 88_600 });

    // Membatalkan Steak membuat total 39.600, di bawah 50.000 yang sudah dibayar: ditolak (refund belum ada).
    const batal = await kasir.post(`/v1/tagihan/${id}/item/${idSteak}/batal`, { alasan: 'Salah input' }).expect(409);
    expect(batal.body.kode).toBe('pembayaran_melebihi_total');
    // Diskon nominal 100.000 membuat total 44.000: juga ditolak, bahkan dengan Persetujuan Atasan pemilik.
    await pemilik.aturPin(await pemilik.anggotaSaya(), '4321');
    const atasan = { persetujuanAtasan: { anggotaId: await pemilik.anggotaSaya(), pin: '4321' } };
    const terlaluBesar = await kirim(kasir, 'put', `/v1/tagihan/${id}/diskon`, { jenis: 'nominal', nilai: 100_000, alasan: 'Komplain', ...atasan }).expect(409);
    expect(terlaluBesar.body.kode).toBe('pembayaran_melebihi_total');
    // Void tetap ditolak untuk Tagihan yang sudah menerima Pembayaran.
    expect((await kasir.post(`/v1/tagihan/${id}/void`, { alasan: 'Batal', ...atasan }).expect(409)).body.kode).toBe('tagihan_sudah_dibayar');
    // Membatalkan Nasi Goreng masih menyisakan total di atas yang dibayar: boleh. 100.000 − 10.000 + 9.000 = 99.000.
    const batalNasgor = (await kasir.post(`/v1/tagihan/${id}/item/${idNasgor}/batal`).expect(200)).body;
    expect(batalNasgor).toMatchObject({ rincian: { subtotal: 100_000, diskon: 10_000, total: 99_000 }, dibayar: 50_000, sisa: 49_000 });
    // Melepas diskon menaikkan total: selalu boleh.
    expect((await kirim(kasir, 'delete', `/v1/tagihan/${id}/diskon`).expect(200)).body).toMatchObject({ total: 110_000, sisa: 60_000 });
    await kirim(kasir, 'put', `/v1/tagihan/${id}/diskon`, { jenis: 'persen', nilai: 10, alasan: 'Pelanggan tetap' }).expect(200);

    const lunas = (await kasir.bayarTunai(id, 50_000).expect(201)).body;
    expect(lunas.pembayaran).toMatchObject({ jumlah: 49_000, kembalian: 1_000 });
    expect(lunas.tagihan).toMatchObject({ status: 'lunas', nomorNota: 1, rincian: { subtotal: 100_000, diskon: 10_000, pajak: 9_000, total: 99_000 }, dibayar: 99_000, sisa: 0 });
    // Dashboard memakai total setelah diskon.
    expect((await pemilik.get(`/v1/outlet/${pemilik.outletId}/penjualan/hari-ini`).expect(200)).body).toMatchObject({
      penjualan: 99_000,
      jumlahTagihan: 1,
      perMetodeBayar: [
        { jenis: 'tunai', nilai: 49_000 },
        { jenis: 'qris_statis', nilai: 50_000 },
      ],
    });
  });

  it('Tagihan ber-Diskon Manual tidak bisa dipisah atau dilebur sebelum diskonnya dilepas; setelah itu total kedua Tagihan benar', async () => {
    const pemilik = await dunia.daftarTenant();
    const [meja1, meja2] = await pemilik.buatMeja(1, 2);
    const nasgor = await pemilik.buatMenu({ nama: 'Nasi Goreng', harga: 20_000 });
    const steak = await pemilik.buatMenu({ nama: 'Steak', harga: 100_000 });
    const kasir = await pemilik.bukaKasir();
    const asal = await kasir.bukaTagihanDineIn(meja1!);
    const pesanan = (await kasir.kirimPesanan(asal, [{ menuId: nasgor }, { menuId: steak }]).expect(201)).body;
    const idSteak = pesanan.item[1].id as string;
    await kirim(kasir, 'put', `/v1/tagihan/${asal}/diskon`, { jenis: 'nominal', nilai: 10_000, alasan: 'Promo pembukaan' }).expect(200);

    expect((await kasir.post(`/v1/tagihan/${asal}/pisah`, { itemIds: [idSteak] }).expect(409)).body.kode).toBe('tagihan_berdiskon');
    // Tagihan lain yang ber-diskon juga tidak bisa dilebur lewat gabung Meja.
    const lain = await kasir.bukaTagihanDineIn(meja2!);
    await kasir.kirimPesanan(lain, [{ menuId: nasgor }]).expect(201);
    expect((await kasir.post(`/v1/tagihan/${lain}/gabung-meja`, { mejaId: meja1 }).expect(409)).body.kode).toBe('tagihan_berdiskon');
    expect((await kasir.get('/v1/tagihan').expect(200)).body).toHaveLength(2);

    await kirim(kasir, 'delete', `/v1/tagihan/${asal}/diskon`).expect(200);
    const pisah = (await kasir.post(`/v1/tagihan/${asal}/pisah`, { itemIds: [idSteak] }).expect(201)).body;
    expect(pisah.asal).toMatchObject({ diskonManual: null, rincian: { subtotal: 20_000, total: 22_000 } });
    expect(pisah.baru).toMatchObject({ diskonManual: null, rincian: { subtotal: 100_000, total: 110_000 } });
    // Diskon dipasang per Tagihan sesudah dipisah: hanya Tagihan baru yang berubah.
    const baru = (await kirim(kasir, 'put', `/v1/tagihan/${pisah.baru.id}/diskon`, { jenis: 'persen', nilai: 10, alasan: 'Pelanggan tetap' }).expect(200)).body;
    expect(baru.rincian).toMatchObject({ subtotal: 100_000, diskon: 10_000, total: 99_000 });
    expect((await kasir.get(`/v1/tagihan/${asal}`).expect(200)).body.total).toBe(22_000);
  });

  it('void atau pembatalan Tagihan dine-in mengosongkan Mejanya dan tidak masuk penjualan hari ini', async () => {
    const pemilik = await dunia.daftarTenant();
    const [meja1, meja2] = await pemilik.buatMeja(1, 2);
    const nasgor = await pemilik.buatMenu({ nama: 'Nasi Goreng', harga: 20_000 });
    const kasir = await pemilik.bukaKasir({ peran: 'manajer_outlet' });
    const berisi = await kasir.bukaTagihanDineIn(meja1!);
    await kasir.kirimPesanan(berisi, [{ menuId: nasgor }]).expect(201);
    const kosong = await kasir.bukaTagihanDineIn(meja2!);
    const status = async () => ((await kasir.get('/v1/kasir/meja').expect(200)).body as { status: string }[]).map((m) => m.status);
    expect(await status()).toEqual(['terisi', 'terisi']);

    expect((await kasir.post(`/v1/tagihan/${berisi}/void`, { alasan: 'Pelanggan pergi' }).expect(200)).body.status).toBe('void');
    expect((await kirim(kasir, 'delete', `/v1/tagihan/${kosong}`).expect(200)).body.status).toBe('batal');
    expect(await status()).toEqual(['kosong', 'kosong']);
    expect((await pemilik.get(`/v1/outlet/${pemilik.outletId}/penjualan/hari-ini`).expect(200)).body).toMatchObject({ penjualan: 0, jumlahTagihan: 0 });
    expect((await pemilik.get(`/v1/outlet/${pemilik.outletId}/tagihan`).expect(200)).body).toEqual([]);
    // Meja yang sudah kosong bisa langsung dipakai lagi.
    await kasir.bukaTagihanDineIn(meja1!);
  });

  it('Pesanan yang ditahan di Outlet bayar-dulu tidak tampil dan tidak bisa dimasak di KDS sampai lunas, dan dibatalkan tanpa persetujuan', async () => {
    const pemilik = await dunia.daftarTenant();
    await pemilik.aktifkanMetodeBayar('qris_statis');
    await pemilik.aturOutlet({ bayarDulu: true });
    const bakso = await pemilik.buatMenu({ nama: 'Bakso', harga: 10_000 });
    const kasir = await pemilik.bukaKasir();
    const dapur = await pemilik.bukaKasir({ peran: 'dapur' });
    const id = await kasir.bukaTagihan();
    const pesanan = (await kasir.kirimPesanan(id, [{ menuId: bakso }, { menuId: bakso, jumlah: 2 }]).expect(201)).body;
    const [satu, dua] = pesanan.item.map((i: { id: string }) => i.id) as string[];
    expect(pesanan.status).toBe('ditahan');

    const diDapur = async () => ((await dapur.get('/v1/kds').expect(200)).body.item as { id: string; status: string }[]).filter((i) => [satu, dua].includes(i.id)).map((i) => i.status);
    expect(await diDapur()).toEqual([]);
    // Dapur tidak bisa memajukan item yang masih ditahan.
    const maju = (await dapur.post('/v1/kds/status', { itemIds: [satu], status: 'dimasak' }).expect(200)).body;
    expect(maju.item).toEqual([{ id: satu, status: 'ditahan' }]);
    // Belum masuk dapur, jadi pembatalannya tidak butuh alasan atau Persetujuan Atasan dan bukan Waste.
    const batal = (await kasir.post(`/v1/tagihan/${id}/item/${satu}/batal`).expect(200)).body;
    expect(batal.pesanan[0].item.map((i: { status: string }) => i.status)).toEqual(['batal', 'ditahan']);
    expect(batal.total).toBe(22_000);

    await kasir.bayar(id, { metode: 'qris_statis' }).expect(201);
    expect((await diDapur()).filter((s) => s !== 'batal')).toEqual(['menunggu']);
    expect((await kasir.get(`/v1/tagihan/${id}`).expect(200)).body.pesanan[0].status).toBe('menunggu');
  });
});
