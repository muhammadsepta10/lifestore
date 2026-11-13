import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buatDuniaTes, type DuniaTes } from './support/dunia-tes';

// Seam utama (#38): dari Tagihan bawa pulang sampai lunas tunai, lewat HTTP terhadap Postgres sungguhan.
// Angka yang diharapkan dihitung tangan dari Profil Pajak default (PBJT 10%, harga belum termasuk pajak).

describe('Penjualan: Tagihan bawa pulang sampai lunas tunai', () => {
  let dunia: DuniaTes;
  beforeAll(async () => {
    dunia = await buatDuniaTes();
  });
  afterAll(() => dunia?.tutup());

  it('kasir membuka Shift, menjual bawa pulang secara tunai, dan Laporan Shift berisi penjualannya', async () => {
    const pemilik = await dunia.daftarTenant();
    await pemilik.aktifkanMetodeBayar('tunai');
    const nasgor = await pemilik.buatMenu({ nama: 'Nasi Goreng', harga: 20_000 });
    const esTeh = await pemilik.buatMenu({ nama: 'Es Teh', harga: 5_000 });
    const kasir = await pemilik.bukaKasir({ awalan: 'A' });
    const shiftId = await kasir.bukaShift(100_000);

    const tagihanId = await kasir.bukaTagihan({ namaPelanggan: 'Bu Sari' });
    const pesanan = (
      await kasir
        .kirimPesanan(tagihanId, [
          { menuId: nasgor, jumlah: 2, catatan: 'Tidak pedas' },
          { menuId: esTeh, jumlah: 1 },
        ])
        .expect(201)
    ).body;
    expect(pesanan.nomorPesanan).toBe('A-001');
    type Baris = { nama: string; jumlah: number; hargaSatuan: number; catatan: string | null; status: string };
    expect(pesanan.item.map((i: Baris) => [i.nama, i.jumlah, i.hargaSatuan, i.catatan, i.status])).toEqual([
      ['Nasi Goreng', 2, 20_000, 'Tidak pedas', 'menunggu'],
      ['Es Teh', 1, 5_000, null, 'menunggu'],
    ]);

    const terbuka = (await kasir.get(`/v1/tagihan/${tagihanId}`).expect(200)).body;
    expect(terbuka).toMatchObject({
      id: tagihanId,
      status: 'terbuka',
      kanal: 'bawa_pulang',
      namaPelanggan: 'Bu Sari',
      nomorNota: null,
      rincian: { subtotal: 45_000, diskon: 0, serviceCharge: 0, dasarPajak: 45_000, pajak: 4_500, total: 49_500 },
      dibayar: 0,
      sisa: 49_500,
    });
    expect(terbuka.pesanan.map((p: { nomorPesanan: string; item: unknown[] }) => [p.nomorPesanan, p.item.length])).toEqual([['A-001', 2]]);
    const daftar = (await kasir.get('/v1/tagihan').expect(200)).body;
    expect(daftar.map((t: { id: string; total: number }) => [t.id, t.total])).toEqual([[tagihanId, 49_500]]);

    const bayar = (await kasir.bayarTunai(tagihanId, 50_000).expect(201)).body;
    expect(bayar.pembayaran).toMatchObject({ metode: 'tunai', jumlah: 49_500, diterima: 50_000, kembalian: 500 });
    expect(bayar.tagihan).toMatchObject({ status: 'lunas', nomorNota: 1, dibayar: 49_500, sisa: 0, rincian: { total: 49_500 } });
    // Tagihan lunas keluar dari daftar Tagihan terbuka, tapi detailnya (untuk struk) tetap bisa dibuka.
    expect((await kasir.get('/v1/tagihan').expect(200)).body).toEqual([]);
    expect((await kasir.get(`/v1/tagihan/${tagihanId}`).expect(200)).body).toMatchObject({ status: 'lunas', nomorNota: 1 });

    const laporan = (await kasir.post(`/v1/shift/${shiftId}/tutup`, { hitungButa: 149_500 }).expect(200)).body;
    expect(laporan).toMatchObject({
      penjualanPerMetodeBayar: [{ jenis: 'tunai', jumlah: 1, nilai: 49_500 }],
      penjualanTunai: 49_500,
      kasSeharusnya: 149_500,
      selisih: 0,
    });
  });

  it('mengirim ulang kirim Pesanan dan Pembayaran dengan kunci idempoten yang sama tidak menggandakan data', async () => {
    const pemilik = await dunia.daftarTenant();
    await pemilik.aktifkanMetodeBayar('tunai');
    const bakso = await pemilik.buatMenu({ nama: 'Bakso', harga: 15_000 });
    const kasir = await pemilik.bukaKasir({ awalan: 'A' });
    const shiftId = await kasir.bukaShift(0);
    const tagihanId = await kasir.bukaTagihan({ id: randomUUID() });

    const kunciPesanan = randomUUID();
    const item = [{ id: randomUUID(), menuId: bakso, jumlah: 2 }];
    const pertama = await kasir.kirimPesanan(tagihanId, item, { id: kunciPesanan }).expect(201);
    const ulang = await kasir.kirimPesanan(tagihanId, item, { id: kunciPesanan }).expect(200);
    expect(ulang.body).toEqual(pertama.body);

    // Dua kiriman yang sama datang bersamaan (jaringan lambat, tombol ditekan dua kali).
    const kunciKedua = randomUUID();
    const bersamaan = await Promise.all([1, 2].map(() => kasir.kirimPesanan(tagihanId, [{ menuId: bakso, jumlah: 1 }], { id: kunciKedua })));
    expect(bersamaan.map((r) => r.status).sort()).toEqual([200, 201]);
    expect(bersamaan[0]!.body.nomorPesanan).toBe(bersamaan[1]!.body.nomorPesanan);

    const sebelumBayar = (await kasir.get(`/v1/tagihan/${tagihanId}`).expect(200)).body;
    expect(sebelumBayar.pesanan.map((p: { nomorPesanan: string }) => p.nomorPesanan)).toEqual(['A-001', 'A-002']);
    expect(sebelumBayar.rincian).toMatchObject({ subtotal: 45_000, total: 49_500 });

    // Kunci Pesanan yang sama tidak bisa dipakai untuk Tagihan lain.
    const tagihanLain = await kasir.bukaTagihan();
    expect((await kasir.kirimPesanan(tagihanLain, [{ menuId: bakso }], { id: kunciPesanan }).expect(409)).body.kode).toBe('id_dipakai');
    // Membuka Tagihan dengan ID yang sama mengembalikan Tagihan yang sama.
    expect((await kasir.post('/v1/tagihan', { id: tagihanId, kanal: 'bawa_pulang' }).expect(200)).body.id).toBe(tagihanId);

    const kunciBayar = randomUUID();
    const bayar = await Promise.all([1, 2].map(() => kasir.bayarTunai(tagihanId, 50_000, { id: kunciBayar })));
    expect(bayar.map((r) => r.status).sort()).toEqual([200, 201]);
    const lagi = await kasir.bayarTunai(tagihanId, 50_000, { id: kunciBayar }).expect(200);
    expect(lagi.body.pembayaran).toEqual(bayar[0]!.body.pembayaran);
    expect(lagi.body.tagihan).toMatchObject({ status: 'lunas', nomorNota: 1, dibayar: 49_500 });
    expect(lagi.body.tagihan.pembayaran).toHaveLength(1);
    // Pembayaran baru (kunci lain) untuk Tagihan yang sudah lunas ditolak.
    expect((await kasir.bayarTunai(tagihanId, 50_000, { id: randomUUID() }).expect(409)).body.kode).toBe('tagihan_sudah_ditutup');

    const laporan = (await kasir.post(`/v1/shift/${shiftId}/tutup`, { hitungButa: 49_500 }).expect(200)).body;
    expect(laporan.penjualanPerMetodeBayar).toEqual([{ jenis: 'tunai', jumlah: 1, nilai: 49_500 }]);
  });

  it('penutupan Tagihan paralel di satu Outlet menghasilkan Nomor Nota berurutan tanpa celah dan tanpa duplikat', async () => {
    const pemilik = await dunia.daftarTenant();
    await pemilik.aktifkanMetodeBayar('tunai');
    const kopi = await pemilik.buatMenu({ nama: 'Kopi', harga: 10_000 });
    const depan = await pemilik.bukaKasir();
    const belakang = await pemilik.bukaKasir();
    await depan.bukaShift(0);
    await belakang.bukaShift(0);

    const siapkan = async (kasir: typeof depan) => {
      const id = await kasir.bukaTagihan();
      await kasir.kirimPesanan(id, [{ menuId: kopi }]).expect(201);
      return { kasir, id };
    };
    const antrean = [];
    for (let i = 0; i < 12; i++) antrean.push(await siapkan(i % 2 === 0 ? depan : belakang));
    // Satu Pembayaran gagal di tengah (uang kurang): tidak boleh memakai nomor.
    const gagal = await siapkan(depan);

    const hasil = await Promise.all([
      ...antrean.map(({ kasir, id }) => kasir.bayarTunai(id, 11_000)),
      gagal.kasir.bayarTunai(gagal.id, 5_000),
    ]);
    expect(hasil.pop()!.body).toMatchObject({ kode: 'pembayaran_kurang', sisa: 11_000 });
    expect(hasil.map((r) => r.status)).toEqual(Array(12).fill(201));
    const nomor = hasil.map((r) => r.body.tagihan.nomorNota as number).sort((a, b) => a - b);
    expect(nomor).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);

    expect((await gagal.kasir.bayarTunai(gagal.id, 11_000).expect(201)).body.tagihan.nomorNota).toBe(13);

    // Nomor Nota per Outlet: Outlet lain mulai dari 1.
    const cabang = await pemilik.tambahOutlet();
    await pemilik.aktifkanMetodeBayar('tunai', cabang);
    const kasirCabang = await pemilik.bukaKasir({ outletId: cabang });
    await kasirCabang.bukaShift(0);
    const diCabang = await siapkan(kasirCabang);
    expect((await kasirCabang.bayarTunai(diCabang.id, 11_000).expect(201)).body.tagihan.nomorNota).toBe(1);
  });

  it('total dan harga yang dikirim klien diabaikan; API menghitung ulang dari Menu', async () => {
    const pemilik = await dunia.daftarTenant();
    await pemilik.aktifkanMetodeBayar('tunai');
    const sate = await pemilik.buatMenu({ nama: 'Sate Ayam', harga: 30_000 });
    const kasir = await pemilik.bukaKasir();
    await kasir.bukaShift(0);
    const tagihanId = await kasir.bukaTagihan();

    const nakal = { menuId: sate, jumlah: 1, nama: 'Gratisan', hargaSatuan: 1, harga: 1, bebasPajak: true };
    const pesanan = (await kasir.kirimPesanan(tagihanId, [nakal]).expect(201)).body;
    expect(pesanan.item[0]).toMatchObject({ nama: 'Sate Ayam', hargaSatuan: 30_000, bebasPajak: false });

    // Klien mengaku totalnya Rp1.000: uang Rp1.000 tetap kurang.
    const kurang = await kasir.post(`/v1/tagihan/${tagihanId}/pembayaran`, { metode: 'tunai', diterima: 1_000, total: 1_000, jumlah: 1_000, sisa: 1_000 }).expect(409);
    expect(kurang.body).toMatchObject({ kode: 'pembayaran_kurang', sisa: 33_000 });
    const bayar = (
      await kasir
        .post(`/v1/tagihan/${tagihanId}/pembayaran`, { metode: 'tunai', diterima: 40_000, total: 1_000, jumlah: 1_000, kembalian: 39_000, rincian: { total: 1_000 } })
        .expect(201)
    ).body;
    expect(bayar.pembayaran).toMatchObject({ jumlah: 33_000, diterima: 40_000, kembalian: 7_000 });
    expect(bayar.tagihan.rincian).toEqual({ subtotal: 30_000, diskon: 0, serviceCharge: 0, dasarPajak: 30_000, pajak: 3_000, total: 33_000 });
  });

  it('Pembayaran tunai ditolak bila tidak ada Shift terbuka di perangkat', async () => {
    const pemilik = await dunia.daftarTenant();
    await pemilik.aktifkanMetodeBayar('tunai');
    const soto = await pemilik.buatMenu({ nama: 'Soto', harga: 18_000 });
    const kasir = await pemilik.bukaKasir();
    // Perangkat lain di Outlet yang sama punya Shift terbuka: tidak berlaku untuk perangkat ini.
    const lain = await pemilik.bukaKasir();
    await lain.bukaShift(0);

    const tagihanId = await kasir.bukaTagihan();
    await kasir.kirimPesanan(tagihanId, [{ menuId: soto }]).expect(201);
    expect((await kasir.bayarTunai(tagihanId, 20_000).expect(409)).body.kode).toBe('perlu_shift');
    expect((await kasir.get(`/v1/tagihan/${tagihanId}`).expect(200)).body).toMatchObject({ status: 'terbuka', dibayar: 0, pembayaran: [] });

    const shiftId = await kasir.bukaShift(50_000);
    await kasir.post(`/v1/shift/${shiftId}/tutup`, { hitungButa: 50_000 }).expect(200);
    expect((await kasir.bayarTunai(tagihanId, 20_000).expect(409)).body.kode).toBe('perlu_shift');

    const shiftBaru = await kasir.bukaShift(50_000);
    expect((await kasir.bayarTunai(tagihanId, 20_000).expect(201)).body.pembayaran.kembalian).toBe(200);
    const laporan = (await kasir.post(`/v1/shift/${shiftBaru}/tutup`, { hitungButa: 69_800 }).expect(200)).body;
    expect(laporan).toMatchObject({ penjualanTunai: 19_800, kasSeharusnya: 69_800, selisih: 0 });
    // Shift pertama (ditutup sebelum Pembayaran) tidak ikut mencatat penjualan itu.
    expect((await kasir.get(`/v1/shift/${shiftId}/laporan`).expect(200)).body).toMatchObject({ penjualanTunai: 0, penjualanPerMetodeBayar: [] });
  });

  it('Tagihan kosong tidak bisa dibayar, dan Metode Bayar yang nonaktif di Outlet ditolak', async () => {
    const pemilik = await dunia.daftarTenant();
    const teh = await pemilik.buatMenu({ nama: 'Teh', harga: 4_000 });
    const kasir = await pemilik.bukaKasir();
    await kasir.bukaShift(0);
    const tagihanId = await kasir.bukaTagihan();
    await kasir.kirimPesanan(tagihanId, []).expect(400);
    await kasir.kirimPesanan(tagihanId, [{ menuId: teh, jumlah: 0 }]).expect(400);

    await kasir.kirimPesanan(tagihanId, [{ menuId: teh }]).expect(201);
    expect((await kasir.bayarTunai(tagihanId, 10_000).expect(409)).body.kode).toBe('metode_bayar_nonaktif');
    await pemilik.aktifkanMetodeBayar('tunai');
    await kasir.post(`/v1/tagihan/${tagihanId}/pembayaran`, { metode: 'kartu_kredit', diterima: 10_000 }).expect(400);

    const kosong = await kasir.bukaTagihan();
    expect((await kasir.bayarTunai(kosong, 10_000).expect(409)).body.kode).toBe('tagihan_kosong');
    await kasir.bayarTunai(tagihanId, 10_000).expect(201);
    // Tagihan yang sudah lunas tidak menerima Pesanan baru.
    expect((await kasir.kirimPesanan(tagihanId, [{ menuId: teh }]).expect(409)).body.kode).toBe('tagihan_sudah_ditutup');
    await kasir.post('/v1/tagihan', { kanal: 'ojol' }).expect(400);
  });

  it('mengubah harga Menu atau Profil Pajak setelah Pesanan dikirim tidak mengubah Tagihan tersebut', async () => {
    const pemilik = await dunia.daftarTenant();
    await pemilik.aktifkanMetodeBayar('tunai');
    const kopi = await pemilik.buatMenu({
      nama: 'Kopi Susu',
      harga: 18_000,
      varian: [
        { nama: 'Reguler', harga: 18_000 },
        { nama: 'Jumbo', harga: 24_000 },
      ],
      grupPilihan: [{ nama: 'Topping', minimum: 0, maksimum: 1, pilihan: [{ nama: 'Boba', harga: 5_000 }] }],
    });
    const m = (await pemilik.get(`/v1/menu/${kopi}`).expect(200)).body;
    const [reguler, jumbo] = m.varian as { id: string }[];
    const boba = m.grupPilihan[0].pilihan[0].id as string;
    const kasir = await pemilik.bukaKasir();
    await kasir.bukaShift(0);

    const tagihanId = await kasir.bukaTagihan();
    await kasir.kirimPesanan(tagihanId, [{ menuId: kopi, varianId: jumbo!.id, pilihanIds: [boba], jumlah: 2 }]).expect(201);
    // (24.000 + 5.000) × 2 = 58.000; PBJT 10% = 5.800.
    const sebelum = (await kasir.get(`/v1/tagihan/${tagihanId}`).expect(200)).body;
    expect(sebelum.rincian).toMatchObject({ subtotal: 58_000, pajak: 5_800, total: 63_800 });

    // Harga Merek naik, Varian dan pilihan diganti, harga Outlet di-override, Menu bebas pajak, pajak jadi 5%.
    await pemilik
      .patch(`/v1/menu/${kopi}`, {
        nama: 'Kopi Susu Aren',
        harga: 30_000,
        bebasPajak: true,
        varian: [{ id: reguler!.id, nama: 'Biasa', harga: 30_000 }],
        grupPilihan: [{ nama: 'Topping Baru', maksimum: 1, pilihan: [{ nama: 'Jelly', harga: 9_000 }] }],
      })
      .expect(200);
    await pemilik.put(`/v1/outlet/${pemilik.outletId}/menu/${kopi}/harga`, { harga: 35_000, varian: [{ varianId: reguler!.id, harga: 35_000 }] }).expect(200);
    const hariIni = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date());
    await pemilik.post(`/v1/outlet/${pemilik.outletId}/profil-pajak`, { berlakuMulai: hariIni, jenis: 'PBJT', tarifPersen: 5 }).expect(201);

    const sesudah = (await kasir.get(`/v1/tagihan/${tagihanId}`).expect(200)).body;
    expect(sesudah).toEqual(sebelum);
    expect(sesudah.pesanan[0].item[0]).toMatchObject({
      nama: 'Kopi Susu',
      namaVarian: 'Jumbo',
      hargaSatuan: 24_000,
      pilihan: [{ nama: 'Boba', harga: 5_000 }],
      bebasPajak: false,
    });
    expect((await kasir.bayarTunai(tagihanId, 63_800).expect(201)).body.tagihan.rincian).toMatchObject({ subtotal: 58_000, pajak: 5_800, total: 63_800 });

    // Tagihan baru memakai harga Outlet dan Profil Pajak yang sekarang berlaku (Menu kini bebas pajak).
    const baru = await kasir.bukaTagihan();
    await kasir.kirimPesanan(baru, [{ menuId: kopi, varianId: reguler!.id }]).expect(201);
    expect((await kasir.get(`/v1/tagihan/${baru}`).expect(200)).body).toMatchObject({
      profilPajak: { tarifPersen: 5 },
      rincian: { subtotal: 35_000, dasarPajak: 0, pajak: 0, total: 35_000 },
    });
  });

  it('Menu Habis ditolak oleh API tanpa menyimpan apa pun dan tanpa memakai Nomor Pesanan', async () => {
    const pemilik = await dunia.daftarTenant();
    const ayam = await pemilik.buatMenu({ nama: 'Ayam Bakar', harga: 25_000 });
    const nasi = await pemilik.buatMenu({ nama: 'Nasi Putih', harga: 5_000 });
    const kasir = await pemilik.bukaKasir({ awalan: 'A' });
    const tagihanId = await kasir.bukaTagihan();

    await kasir.post(`/v1/kasir/menu/${ayam}/habis`, { habis: true }).expect(200);
    // Satu item Habis membatalkan seluruh kiriman, termasuk item lain yang tersedia.
    const ditolak = await kasir.kirimPesanan(tagihanId, [{ menuId: nasi }, { menuId: ayam }]).expect(409);
    expect(ditolak.body.kode).toBe('menu_habis');
    expect((await kasir.get(`/v1/tagihan/${tagihanId}`).expect(200)).body).toMatchObject({ pesanan: [], total: 0 });

    await kasir.post(`/v1/kasir/menu/${ayam}/habis`, { habis: false }).expect(200);
    expect((await kasir.kirimPesanan(tagihanId, [{ menuId: nasi }, { menuId: ayam }]).expect(201)).body.nomorPesanan).toBe('A-001');
  });

  it('Nomor Pesanan berurutan per hari per awalan perangkat', async () => {
    const pemilik = await dunia.daftarTenant();
    const roti = await pemilik.buatMenu({ nama: 'Roti Bakar', harga: 12_000 });
    const a = await pemilik.bukaKasir({ awalan: 'A' });
    const b = await pemilik.bukaKasir({ awalan: 'B' });
    const kirim = async (kasir: typeof a, tagihanId: string) => (await kasir.kirimPesanan(tagihanId, [{ menuId: roti }]).expect(201)).body.nomorPesanan as string;

    const tagihanA = await a.bukaTagihan();
    const tagihanB = await b.bukaTagihan();
    expect([await kirim(a, tagihanA), await kirim(a, tagihanA), await kirim(b, tagihanB), await kirim(a, tagihanB)]).toEqual(['A-001', 'A-002', 'B-001', 'A-003']);
    // Tagihan milik Outlet: perangkat lain melihat dan bisa menambah Pesanan ke Tagihan yang sama.
    expect((await b.get('/v1/tagihan').expect(200)).body.map((t: { nomorPesanan: string[] }) => t.nomorPesanan)).toEqual([
      ['A-001', 'A-002'],
      ['B-001', 'A-003'],
    ]);

    dunia.jam.maju(24 * 3600 * 1000);
    try {
      expect(await kirim(a, tagihanA)).toBe('A-001');
    } finally {
      dunia.jam.maju(-24 * 3600 * 1000);
    }
  });

  it('peran database aplikasi tidak bisa mengubah atau menghapus Pesanan, Item Pesanan, dan Pembayaran', async () => {
    const pemilik = await dunia.daftarTenant();
    await pemilik.aktifkanMetodeBayar('tunai');
    const mie = await pemilik.buatMenu({ nama: 'Mie Ayam', harga: 15_000 });
    const kasir = await pemilik.bukaKasir();
    await kasir.bukaShift(0);
    const tagihanId = await kasir.bukaTagihan();
    await kasir.kirimPesanan(tagihanId, [{ menuId: mie }]).expect(201);
    await kasir.bayarTunai(tagihanId, 20_000).expect(201);
    const sebelum = (await kasir.get(`/v1/tagihan/${tagihanId}`).expect(200)).body;

    const app = new pg.Pool({ connectionString: dunia.db.appUrl, max: 1 });
    try {
      for (const perintah of [
        `UPDATE item_pesanan SET harga_satuan = 1, jumlah = 99`,
        `DELETE FROM item_pesanan`,
        `UPDATE pesanan SET nomor_pesanan = 'X-999'`,
        `DELETE FROM pesanan`,
        `UPDATE kejadian_item_pesanan SET status = 'batal'`,
        `DELETE FROM kejadian_item_pesanan`,
        `UPDATE pembayaran SET jumlah = 1`,
        `DELETE FROM pembayaran`,
        `DELETE FROM tagihan`,
      ]) {
        const c = await app.connect();
        try {
          await c.query('BEGIN');
          await c.query(`SELECT set_config('app.tenant_id', $1, true)`, [pemilik.tenantId]);
          await expect(c.query(perintah), perintah).rejects.toMatchObject({ code: '42501' });
          await c.query('ROLLBACK');
        } finally {
          c.release();
        }
      }
    } finally {
      await app.end();
    }
    expect((await kasir.get(`/v1/tagihan/${tagihanId}`).expect(200)).body).toEqual(sebelum);
    // Lewat API pun tidak ada rute untuk mengubah item yang sudah dikirim.
    const itemId = sebelum.pesanan[0].item[0].id;
    for (const rute of [`/v1/tagihan/${tagihanId}/pesanan/${sebelum.pesanan[0].id}`, `/v1/item-pesanan/${itemId}`]) {
      expect((await dunia.http.patch(rute).set('Authorization', `Perangkat ${kasir.token}`).send({ jumlah: 9 })).status).toBe(404);
    }
  });
});
