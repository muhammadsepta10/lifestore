import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buatDuniaTes, type DuniaTes } from './support/dunia-tes';

// Seam (#40): cara bayar lengkap lewat HTTP terhadap Postgres sungguhan.
// Angka dihitung tangan dari Profil Pajak default (PBJT 10%, harga belum termasuk pajak, tanpa Service Charge).

type ItemTampil = { id: string; nama: string; status: string };

describe('Cara bayar lengkap', () => {
  let dunia: DuniaTes;
  beforeAll(async () => {
    dunia = await buatDuniaTes();
  });
  afterAll(() => dunia?.tutup());

  it('Bayar Terpisah: satu Tagihan dilunasi dengan QRIS statis lalu tunai, dan tercatat per Metode Bayar di Laporan Shift', async () => {
    const pemilik = await dunia.daftarTenant();
    await pemilik.aktifkanMetodeBayar('tunai');
    await pemilik.aktifkanMetodeBayar('qris_statis');
    const nasgor = await pemilik.buatMenu({ nama: 'Nasi Goreng', harga: 45_000 });
    const kasir = await pemilik.bukaKasir();
    const shiftId = await kasir.bukaShift(100_000);
    const tagihanId = await kasir.bukaTagihan();
    await kasir.kirimPesanan(tagihanId, [{ menuId: nasgor }]).expect(201); // total 49.500

    // Non-tunai tidak boleh melebihi sisa (tidak ada kembalian).
    expect((await kasir.bayar(tagihanId, { metode: 'qris_statis', jumlah: 50_000 }).expect(409)).body).toMatchObject({ kode: 'pembayaran_lebih', sisa: 49_500 });
    // Metode Bayar yang tidak aktif di Outlet ditolak.
    expect((await kasir.bayar(tagihanId, { metode: 'edc', jumlah: 10_000 }).expect(409)).body.kode).toBe('metode_bayar_nonaktif');

    const qris = (await kasir.bayar(tagihanId, { metode: 'qris_statis', jumlah: 20_000, referensi: 'QR-778899' }).expect(201)).body;
    expect(qris.pembayaran).toMatchObject({ metode: 'qris_statis', jumlah: 20_000, diterima: 20_000, kembalian: 0, referensi: 'QR-778899' });
    expect(qris.tagihan).toMatchObject({ status: 'terbuka', nomorNota: null, dibayar: 20_000, sisa: 29_500 });
    // Tagihan yang baru dibayar sebagian tetap ada di daftar Tagihan terbuka.
    expect((await kasir.get('/v1/tagihan').expect(200)).body).toMatchObject([{ id: tagihanId, dibayar: 20_000, sisa: 29_500 }]);

    // Tunai yang kurang dari sisa ditolak kecuali kasir menyebut jumlahnya (Bayar Terpisah).
    expect((await kasir.bayarTunai(tagihanId, 20_000).expect(409)).body).toMatchObject({ kode: 'pembayaran_kurang', sisa: 29_500 });
    const tunai = (await kasir.bayarTunai(tagihanId, 30_000).expect(201)).body;
    expect(tunai.pembayaran).toMatchObject({ metode: 'tunai', jumlah: 29_500, diterima: 30_000, kembalian: 500 });
    expect(tunai.tagihan).toMatchObject({ status: 'lunas', nomorNota: 1, total: 49_500, dibayar: 49_500, sisa: 0 });
    expect(tunai.tagihan.pembayaran.map((p: { metode: string; jumlah: number }) => [p.metode, p.jumlah])).toEqual([
      ['qris_statis', 20_000],
      ['tunai', 29_500],
    ]);

    const laporan = (await kasir.post(`/v1/shift/${shiftId}/tutup`, { hitungButa: 129_500 }).expect(200)).body;
    expect(laporan).toMatchObject({
      penjualanPerMetodeBayar: [
        { jenis: 'tunai', jumlah: 1, nilai: 29_500 },
        { jenis: 'qris_statis', jumlah: 1, nilai: 20_000 },
      ],
      penjualanTunai: 29_500,
      kasSeharusnya: 129_500,
      selisih: 0,
    });
  });

  it('tunai sebagian dengan jumlah yang disebut, lalu EDC dan transfer dengan nomor referensi opsional, tanpa Shift untuk non-tunai', async () => {
    const pemilik = await dunia.daftarTenant();
    for (const jenis of ['tunai', 'edc', 'transfer']) await pemilik.aktifkanMetodeBayar(jenis);
    const nasgor = await pemilik.buatMenu({ nama: 'Nasi Goreng', harga: 100_000 });
    const kasir = await pemilik.bukaKasir();
    const tagihanId = await kasir.bukaTagihan();
    await kasir.kirimPesanan(tagihanId, [{ menuId: nasgor }]).expect(201); // total 110.000

    // Belum ada Shift: EDC dan transfer tetap bisa, tunai tidak.
    const kunci = randomUUID();
    const edc = await kasir.bayar(tagihanId, { id: kunci, metode: 'edc', jumlah: 40_000, referensi: 'APPR 0012' }).expect(201);
    expect((await kasir.bayar(tagihanId, { id: kunci, metode: 'edc', jumlah: 40_000, referensi: 'APPR 0012' }).expect(200)).body.pembayaran).toEqual(
      edc.body.pembayaran,
    );
    expect((await kasir.bayar(tagihanId, { metode: 'tunai', jumlah: 10_000, diterima: 10_000 }).expect(409)).body.kode).toBe('perlu_shift');
    await kasir.bukaShift(0);
    const tunai = (await kasir.bayar(tagihanId, { metode: 'tunai', jumlah: 30_000, diterima: 50_000 }).expect(201)).body;
    expect(tunai.pembayaran).toMatchObject({ jumlah: 30_000, diterima: 50_000, kembalian: 20_000 });
    expect(tunai.tagihan).toMatchObject({ status: 'terbuka', dibayar: 70_000, sisa: 40_000 });
    // Transfer tanpa `jumlah` melunasi sisanya; referensi boleh kosong.
    const transfer = (await kasir.bayar(tagihanId, { metode: 'transfer' }).expect(201)).body;
    expect(transfer.pembayaran).toMatchObject({ metode: 'transfer', jumlah: 40_000, referensi: null });
    expect(transfer.tagihan).toMatchObject({ status: 'lunas', nomorNota: 1, dibayar: 110_000, sisa: 0 });
    expect(transfer.tagihan.pembayaran).toHaveLength(3);
  });

  it('Pisah Tagihan menghasilkan dua Tagihan dengan total benar, masing-masing lunas dengan Nomor Nota sendiri', async () => {
    const pemilik = await dunia.daftarTenant();
    await pemilik.aktifkanMetodeBayar('tunai');
    const [meja] = await pemilik.buatMeja(1, 1);
    const nasgor = await pemilik.buatMenu({ nama: 'Nasi Goreng', harga: 20_000 });
    const esTeh = await pemilik.buatMenu({ nama: 'Es Teh', harga: 5_000 });
    const sate = await pemilik.buatMenu({ nama: 'Sate', harga: 30_000 });
    const kasir = await pemilik.bukaKasir({ awalan: 'A' });
    await kasir.bukaShift(0);
    const asal = await kasir.bukaTagihanDineIn(meja!);
    const p1 = (await kasir.kirimPesanan(asal, [{ menuId: nasgor }, { menuId: esTeh, jumlah: 2 }]).expect(201)).body;
    const p2 = (await kasir.kirimPesanan(asal, [{ menuId: sate }]).expect(201)).body;
    const idEsTeh = p1.item[1].id as string;
    const idSate = p2.item[0].id as string;

    const kunci = randomUUID();
    const pisah = (await kasir.post(`/v1/tagihan/${asal}/pisah`, { id: kunci, itemIds: [idEsTeh, idSate], namaPelanggan: 'Pak Budi' }).expect(201)).body;
    // Asal: Nasi Goreng 20.000 + 10% = 22.000. Baru: Es Teh 2 × 5.000 + Sate 30.000 = 40.000 + 10% = 44.000.
    expect(pisah.asal).toMatchObject({ id: asal, rincian: { subtotal: 20_000, pajak: 2_000, total: 22_000 } });
    expect(pisah.baru).toMatchObject({
      id: kunci,
      status: 'terbuka',
      kanal: 'dine_in',
      mejaId: meja,
      asalTagihanId: asal,
      namaPelanggan: 'Pak Budi',
      rincian: { subtotal: 40_000, pajak: 4_000, total: 44_000 },
    });
    const namaItem = (t: { pesanan: { nomorPesanan: string; item: ItemTampil[] }[] }) => t.pesanan.map((p) => [p.nomorPesanan, p.item.map((i) => i.nama)]);
    expect(namaItem(pisah.asal)).toEqual([['A-001', ['Nasi Goreng']]]);
    expect(namaItem(pisah.baru)).toEqual([
      ['A-001', ['Es Teh']],
      ['A-002', ['Sate']],
    ]);
    // Kiriman ulang tidak membuat Tagihan ketiga.
    const ulang = await kasir.post(`/v1/tagihan/${asal}/pisah`, { id: kunci, itemIds: [idEsTeh, idSate] }).expect(200);
    expect(ulang.body.baru.id).toBe(kunci);
    const terbuka = (await kasir.get('/v1/tagihan').expect(200)).body as { id: string; total: number }[];
    expect(terbuka.map((t) => [t.id, t.total])).toEqual([
      [asal, 22_000],
      [kunci, 44_000],
    ]);

    // Item Tagihan lain, semua item sekaligus, atau daftar kosong ditolak.
    await kasir.post(`/v1/tagihan/${asal}/pisah`, { itemIds: [idSate] }).expect(400);
    await kasir.post(`/v1/tagihan/${asal}/pisah`, { itemIds: [p1.item[0].id] }).expect(400);
    await kasir.post(`/v1/tagihan/${asal}/pisah`, { itemIds: [] }).expect(400);

    // Meja tetap Terisi sampai kedua Tagihan lunas.
    expect((await kasir.bayarTunai(asal, 22_000).expect(201)).body.tagihan).toMatchObject({ status: 'lunas', nomorNota: 1, total: 22_000 });
    expect((await kasir.get('/v1/kasir/meja').expect(200)).body[0]).toMatchObject({ status: 'terisi', tagihanId: kunci });
    expect((await kasir.bayarTunai(kunci, 44_000).expect(201)).body.tagihan).toMatchObject({ status: 'lunas', nomorNota: 2, total: 44_000 });
    expect((await kasir.get('/v1/kasir/meja').expect(200)).body[0]).toMatchObject({ status: 'kosong', tagihanId: null });
  });

  it('Pembulatan Tunai mengikuti aturan Outlet, tercatat terpisah, dan tidak menambah angka penjualan', async () => {
    const pemilik = await dunia.daftarTenant();
    await pemilik.aktifkanMetodeBayar('tunai');
    await pemilik.aktifkanMetodeBayar('qris_statis');
    await pemilik.aturOutlet({ pembulatanTunai: { kelipatan: 100, arah: 'terdekat' } });
    expect((await pemilik.get(`/v1/outlet/${pemilik.outletId}`).expect(200)).body.pembulatanTunai).toEqual({ kelipatan: 100, arah: 'terdekat' });
    const mie = await pemilik.buatMenu({ nama: 'Mie', harga: 7_140 }); // + 10% = 7.854
    const kasir = await pemilik.bukaKasir();
    const shiftId = await kasir.bukaShift(0);
    // Layar kasir tahu aturannya, untuk menampilkan jumlah tunai yang harus dibayar.
    expect((await kasir.get('/v1/kasir').expect(200)).body.outlet).toMatchObject({ pembulatanTunai: { kelipatan: 100, arah: 'terdekat' }, bayarDulu: false });

    // Tunai: 7.854 dibulatkan ke 7.900; selisih +46 dicatat sebagai Pembulatan Tunai.
    const tunaiId = await kasir.bukaTagihan();
    await kasir.kirimPesanan(tunaiId, [{ menuId: mie }]).expect(201);
    expect((await kasir.bayarTunai(tunaiId, 7_860).expect(409)).body).toMatchObject({ kode: 'pembayaran_kurang', sisa: 7_900 });
    const tunai = (await kasir.bayarTunai(tunaiId, 10_000).expect(201)).body;
    expect(tunai.pembayaran).toMatchObject({ jumlah: 7_900, pembulatan: 46, diterima: 10_000, kembalian: 2_100 });
    expect(tunai.tagihan).toMatchObject({ status: 'lunas', total: 7_854, dibayar: 7_854, sisa: 0, pembulatanTunai: 46, rincian: { total: 7_854 } });

    // QRIS statis tidak dibulatkan.
    const qrisId = await kasir.bukaTagihan();
    await kasir.kirimPesanan(qrisId, [{ menuId: mie }]).expect(201);
    const qris = (await kasir.bayar(qrisId, { metode: 'qris_statis' }).expect(201)).body;
    expect(qris.pembayaran).toMatchObject({ jumlah: 7_854, pembulatan: 0 });
    expect(qris.tagihan).toMatchObject({ status: 'lunas', total: 7_854, pembulatanTunai: 0 });

    // Laci berisi uang yang benar-benar diterima (7.900); penjualan tunai tetap 7.854.
    const laporan = (await kasir.post(`/v1/shift/${shiftId}/tutup`, { hitungButa: 7_900 }).expect(200)).body;
    expect(laporan).toMatchObject({
      penjualanPerMetodeBayar: [
        { jenis: 'tunai', jumlah: 1, nilai: 7_854 },
        { jenis: 'qris_statis', jumlah: 1, nilai: 7_854 },
      ],
      penjualanTunai: 7_854,
      pembulatanTunai: 46,
      kasSeharusnya: 7_900,
      selisih: 0,
    });

    // Aturan yang tidak masuk akal ditolak; null mematikan pembulatan.
    await pemilik.patch(`/v1/outlet/${pemilik.outletId}`, { pembulatanTunai: { kelipatan: 0, arah: 'terdekat' } }).expect(400);
    await pemilik.patch(`/v1/outlet/${pemilik.outletId}`, { pembulatanTunai: { kelipatan: 100, arah: 'samping' } }).expect(400);
    expect((await pemilik.patch(`/v1/outlet/${pemilik.outletId}`, { pembulatanTunai: null }).expect(200)).body.pembulatanTunai).toBeNull();
  });

  it('di Outlet bayar-dulu, Pesanan bawa pulang non-tunai tidak masuk dapur sebelum lunas', async () => {
    const pemilik = await dunia.daftarTenant();
    await pemilik.aktifkanMetodeBayar('tunai');
    await pemilik.aktifkanMetodeBayar('qris_statis');
    await pemilik.aturOutlet({ bayarDulu: true });
    const [meja] = await pemilik.buatMeja(1, 1);
    const bakso = await pemilik.buatMenu({ nama: 'Bakso', harga: 10_000 });
    const kasir = await pemilik.bukaKasir();
    const status = async (tagihanId: string) =>
      ((await kasir.get(`/v1/tagihan/${tagihanId}`).expect(200)).body.pesanan as { item: ItemTampil[] }[]).flatMap((p) => p.item.map((i) => i.status));

    const bawaPulang = await kasir.bukaTagihan();
    const pesanan = (await kasir.kirimPesanan(bawaPulang, [{ menuId: bakso, jumlah: 2 }, { menuId: bakso }]).expect(201)).body;
    expect(pesanan.item.map((i: ItemTampil) => i.status)).toEqual(['ditahan', 'ditahan']);
    // Dibayar sebagian dengan QRIS statis: belum lunas, masih ditahan.
    await kasir.bayar(bawaPulang, { metode: 'qris_statis', jumlah: 13_000 }).expect(201);
    expect(await status(bawaPulang)).toEqual(['ditahan', 'ditahan']);
    // Lunas: Pesanan masuk dapur.
    const lunas = (await kasir.bayar(bawaPulang, { metode: 'qris_statis' }).expect(201)).body;
    expect(lunas.tagihan.status).toBe('lunas');
    expect(await status(bawaPulang)).toEqual(['menunggu', 'menunggu']);

    // Pengecualian: pelanggan bayar tunai di kasir, Pesanan langsung masuk dapur.
    const tunai = await kasir.bukaTagihan();
    const langsung = (await kasir.kirimPesanan(tunai, [{ menuId: bakso }], { tunaiDiKasir: true }).expect(201)).body;
    expect(langsung.item.map((i: ItemTampil) => i.status)).toEqual(['menunggu']);
    // Dine-in tetap bayar di akhir: langsung masuk dapur.
    const dineIn = await kasir.bukaTagihanDineIn(meja!);
    expect((await kasir.kirimPesanan(dineIn, [{ menuId: bakso }]).expect(201)).body.item[0].status).toBe('menunggu');
  });
});
