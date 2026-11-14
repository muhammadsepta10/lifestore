import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buatDuniaTes, type DuniaTes, type KasirTes, type PemilikTes, type PerangkatTes } from './support/dunia-tes';

// Seam (#39): pembatalan, void, Diskon Manual, dan buka laci dari kasir, lewat HTTP terhadap
// Postgres sungguhan. Angka dihitung tangan dari Profil Pajak default (PBJT 10%, harga belum termasuk pajak).

type Log = { aksi: string; entitas: string; entitasId: string; outletId: string; alasan: string | null; penyetujuAnggotaId: string | null; pelaku: { perangkatId: string | null; anggotaId: string | null }; sebelum: unknown; sesudah: unknown };

describe('Kendali kasir: batal, void, Diskon Manual, buka laci', () => {
  let dunia: DuniaTes;
  let pemilik: PemilikTes;
  let kasir: KasirTes;
  let layar: KasirTes;
  let manajer: string;
  let kasirLain: string;
  let nasgor: string;
  let steak: string;
  const PIN_MANAJER = '9876';

  const kirim = (p: PerangkatTes, metode: 'put' | 'delete', path: string, body?: object) =>
    dunia.http[metode](path).set('Authorization', `Perangkat ${p.token}`).send(body ?? {});
  const atasan = () => ({ persetujuanAtasan: { anggotaId: manajer, pin: PIN_MANAJER } });
  const logAudit = async (aksi: string): Promise<Log[]> => ((await pemilik.get('/v1/log-audit').expect(200)).body as Log[]).filter((l) => l.aksi === aksi);
  const tagihan = async (id: string) => (await kasir.get(`/v1/tagihan/${id}`).expect(200)).body;
  const majukan = (itemIds: string[], status: string) => layar.post('/v1/kds/status', { itemIds, status }).expect(200);

  async function tagihanBerisi(item: { menuId: string; jumlah?: number }[]) {
    const id = await kasir.bukaTagihan();
    const pesanan = (await kasir.kirimPesanan(id, item).expect(201)).body;
    return { id, itemIds: pesanan.item.map((i: { id: string }) => i.id) as string[] };
  }

  beforeAll(async () => {
    dunia = await buatDuniaTes();
    pemilik = await dunia.daftarTenant();
    await pemilik.aktifkanMetodeBayar('tunai');
    nasgor = await pemilik.buatMenu({ nama: 'Nasi Goreng', harga: 20_000 });
    steak = await pemilik.buatMenu({ nama: 'Steak', harga: 100_000 });
    const o = pemilik.outletId;
    manajer = await pemilik.tambahKaryawan({ nama: 'Manajer', pin: PIN_MANAJER, penugasan: [{ outletId: o, peran: 'manajer_outlet' }] });
    kasirLain = await pemilik.tambahKaryawan({ nama: 'Kasir Lain', pin: '2222', penugasan: [{ outletId: o, peran: 'kasir' }] });
    kasir = await pemilik.bukaKasir({ awalan: 'A' });
    layar = await pemilik.bukaKasir({ peran: 'dapur' });
  });
  afterAll(() => dunia?.tutup());

  it('Item Pesanan yang masih menunggu dibatalkan tanpa persetujuan dan langsung tercoret di KDS', async () => {
    const { id, itemIds } = await tagihanBerisi([{ menuId: nasgor, jumlah: 2 }, { menuId: steak }]);
    expect((await tagihan(id)).total).toBe(154_000);

    const res = await kasir.post(`/v1/tagihan/${id}/item/${itemIds[0]}/batal`, { alasan: 'Salah input' }).expect(200);
    expect(res.body.pesanan[0].item.map((i: { status: string }) => i.status)).toEqual(['batal', 'menunggu']);
    expect(res.body.rincian).toMatchObject({ subtotal: 100_000, pajak: 10_000, total: 110_000 });

    const diDapur = (await layar.get('/v1/kds').expect(200)).body.item.filter((i: { id: string }) => itemIds.includes(i.id));
    expect(diDapur.map((i: { nama: string; status: string }) => [i.nama, i.status])).toEqual([
      ['Nasi Goreng', 'batal'],
      ['Steak', 'menunggu'],
    ]);
    // Dapur tidak bisa memasak item yang sudah batal.
    expect((await majukan([itemIds[0]!], 'dimasak')).body.item).toEqual([{ id: itemIds[0], status: 'batal' }]);

    const [log] = (await logAudit('batal_item_pesanan')).filter((l) => l.entitasId === itemIds[0]);
    expect(log).toMatchObject({
      entitas: 'item_pesanan',
      outletId: pemilik.outletId,
      alasan: 'Salah input',
      penyetujuAnggotaId: null,
      pelaku: { perangkatId: kasir.id, anggotaId: kasir.anggotaId },
      sebelum: { status: 'menunggu' },
      sesudah: { status: 'batal', waste: false },
    });
    // Membatalkan lagi tidak mengubah apa pun dan tidak menambah catatan.
    await kasir.post(`/v1/tagihan/${id}/item/${itemIds[0]}/batal`).expect(200);
    expect((await logAudit('batal_item_pesanan')).filter((l) => l.entitasId === itemIds[0])).toHaveLength(1);
  });

  it('batal setelah dimasak ditolak tanpa PIN atasan, dan tercatat sebagai Waste di Log Audit bila disetujui', async () => {
    const { id, itemIds } = await tagihanBerisi([{ menuId: nasgor }, { menuId: steak }]);
    await majukan([itemIds[0]!], 'dimasak');
    const batal = (body?: object) => kasir.post(`/v1/tagihan/${id}/item/${itemIds[0]}/batal`, { alasan: 'Pelanggan pergi', ...body });

    const tanpaPin = await batal();
    expect(tanpaPin.status).toBe(403);
    expect(tanpaPin.body).toMatchObject({ kode: 'perlu_persetujuan_atasan', izin: 'item.batal_setelah_dimasak' });
    const pinKasir = await batal({ persetujuanAtasan: { anggotaId: kasirLain, pin: '2222' } });
    expect(pinKasir.status).toBe(403);
    expect(pinKasir.body.kode).toBe('persetujuan_ditolak');
    expect((await batal({ persetujuanAtasan: { anggotaId: manajer, pin: '0000' } })).status).toBe(401);
    expect((await tagihan(id)).pesanan[0].item[0].status).toBe('dimasak');
    expect((await logAudit('batal_item_pesanan')).filter((l) => l.entitasId === itemIds[0])).toEqual([]);
    // Alasan wajib untuk pembatalan setelah dimasak.
    expect((await kasir.post(`/v1/tagihan/${id}/item/${itemIds[0]}/batal`, atasan())).status).toBe(400);

    const ok = await batal(atasan()).expect(200);
    expect(ok.body.pesanan[0].item[0].status).toBe('batal');
    expect(ok.body.total).toBe(110_000);
    const [log] = (await logAudit('batal_item_pesanan')).filter((l) => l.entitasId === itemIds[0]);
    expect(log).toMatchObject({
      alasan: 'Pelanggan pergi',
      penyetujuAnggotaId: manajer,
      pelaku: { perangkatId: kasir.id, anggotaId: kasir.anggotaId },
      sebelum: { status: 'dimasak' },
      sesudah: { status: 'batal', waste: true },
    });

    // Item yang sudah disajikan tidak bisa dibatalkan, dengan PIN atasan sekalipun.
    await majukan([itemIds[1]!], 'disajikan');
    const disajikan = await kasir.post(`/v1/tagihan/${id}/item/${itemIds[1]}/batal`, { alasan: 'x', ...atasan() });
    expect(disajikan.status).toBe(409);
    expect(disajikan.body.kode).toBe('item_sudah_disajikan');
  });

  it('Tagihan tanpa item boleh dibatalkan; Tagihan berisi item tidak bisa dihapus, hanya di-void', async () => {
    const kosong = await kasir.bukaTagihan();
    expect((await kirim(kasir, 'delete', `/v1/tagihan/${kosong}`).expect(200)).body).toMatchObject({ id: kosong, status: 'batal' });
    expect((await kasir.get('/v1/tagihan').expect(200)).body.map((t: { id: string }) => t.id)).not.toContain(kosong);
    expect((await kasir.kirimPesanan(kosong, [{ menuId: nasgor }])).status).toBe(409);
    expect(await logAudit('batal_tagihan')).toMatchObject([{ entitasId: kosong, pelaku: { anggotaId: kasir.anggotaId } }]);

    const { id, itemIds } = await tagihanBerisi([{ menuId: nasgor }]);
    const hapus = await kirim(kasir, 'delete', `/v1/tagihan/${id}`);
    expect(hapus.status).toBe(409);
    expect(hapus.body.kode).toBe('tagihan_berisi_item');
    // Membatalkan semua itemnya tidak membuat Tagihan bisa dihapus: jejaknya harus tetap ada.
    await kasir.post(`/v1/tagihan/${id}/item/${itemIds[0]}/batal`).expect(200);
    expect((await kirim(kasir, 'delete', `/v1/tagihan/${id}`)).status).toBe(409);
    expect((await tagihan(id)).status).toBe('terbuka');
    // Peran aplikasi di database pun tidak bisa menghapus Tagihan.
    const klien = await dunia.db.admin.connect();
    try {
      await klien.query('SET ROLE lifestore_app');
      await expect(klien.query('DELETE FROM tagihan WHERE id = $1', [id])).rejects.toThrow(/permission denied/);
    } finally {
      await klien.query('RESET ROLE').catch(() => undefined);
      klien.release();
    }
  });

  it('void butuh alasan dan PIN atasan, tercatat di Log Audit, dan muncul di Laporan Shift', async () => {
    const shiftId = await kasir.bukaShift(50_000);
    const { id, itemIds } = await tagihanBerisi([{ menuId: nasgor, jumlah: 2 }, { menuId: steak }]);
    await majukan([itemIds[1]!], 'dimasak');

    const tanpaPin = await kasir.post(`/v1/tagihan/${id}/void`, { alasan: 'Pelanggan batal' });
    expect(tanpaPin.status).toBe(403);
    expect(tanpaPin.body).toMatchObject({ kode: 'perlu_persetujuan_atasan', izin: 'tagihan.void' });
    expect((await kasir.post(`/v1/tagihan/${id}/void`, atasan())).status).toBe(400);
    expect((await tagihan(id)).status).toBe('terbuka');
    expect(await logAudit('void_tagihan')).toEqual([]);

    const res = await kasir.post(`/v1/tagihan/${id}/void`, { alasan: 'Pelanggan batal', ...atasan() }).expect(200);
    expect(res.body).toMatchObject({ status: 'void', nomorNota: null, total: 154_000, alasanTutup: 'Pelanggan batal' });
    expect(res.body.pesanan[0].item.map((i: { status: string }) => i.status)).toEqual(['batal', 'batal']);
    expect(await logAudit('void_tagihan')).toMatchObject([
      {
        entitas: 'tagihan',
        entitasId: id,
        alasan: 'Pelanggan batal',
        penyetujuAnggotaId: manajer,
        pelaku: { perangkatId: kasir.id, anggotaId: kasir.anggotaId },
        sebelum: { status: 'terbuka', total: 154_000 },
        sesudah: { status: 'void' },
      },
    ]);
    // Tagihan void keluar dari daftar terbuka, tidak bisa dibayar atau diisi lagi, dan tidak memakai Nomor Nota.
    expect((await kasir.get('/v1/tagihan').expect(200)).body.map((t: { id: string }) => t.id)).not.toContain(id);
    expect((await kasir.bayarTunai(id, 200_000)).body.kode).toBe('tagihan_sudah_ditutup');
    expect((await kasir.kirimPesanan(id, [{ menuId: nasgor }])).body.kode).toBe('tagihan_sudah_ditutup');
    expect((await kasir.post(`/v1/tagihan/${id}/void`, { alasan: 'lagi', ...atasan() })).body.kode).toBe('tagihan_sudah_ditutup');

    const lunas = await tagihanBerisi([{ menuId: nasgor }]);
    expect((await kasir.bayarTunai(lunas.id, 22_000).expect(201)).body.tagihan.nomorNota).toBe(1);
    const laporan = (await kasir.post(`/v1/shift/${shiftId}/tutup`, { hitungButa: 72_000 }).expect(200)).body;
    expect(laporan).toMatchObject({ void: { jumlah: 1, nilai: 154_000 }, penjualanTunai: 22_000, kasSeharusnya: 72_000, selisih: 0 });
  });

  it('Diskon Manual wajib beralasan, dibatasi per Peran, dan di atas batas butuh PIN atasan', async () => {
    const { id } = await tagihanBerisi([{ menuId: steak }]);
    const diskon = (body: object) => kirim(kasir, 'put', `/v1/tagihan/${id}/diskon`, body);

    expect((await diskon({ jenis: 'persen', nilai: 10 })).status).toBe(400);
    // Batas Kasir 10%: tepat di batas tidak butuh persetujuan.
    const sepuluh = await diskon({ jenis: 'persen', nilai: 10, alasan: 'Pelanggan tetap' }).expect(200);
    expect(sepuluh.body.rincian).toMatchObject({ subtotal: 100_000, diskon: 10_000, dasarPajak: 90_000, pajak: 9_000, total: 99_000 });
    expect(sepuluh.body.diskonManual).toMatchObject({ jenis: 'persen', nilai: 10, alasan: 'Pelanggan tetap' });

    const duaPuluh = await diskon({ jenis: 'persen', nilai: 20, alasan: 'Komplain' });
    expect(duaPuluh.status).toBe(403);
    expect(duaPuluh.body).toMatchObject({ kode: 'perlu_persetujuan_atasan', izin: 'diskon.di_atas_batas', batasPersen: 10 });
    // Nominal dinilai sebagai persen dari subtotal: Rp15.000 dari Rp100.000 = 15%, di atas batas.
    expect((await diskon({ jenis: 'nominal', nilai: 15_000, alasan: 'Komplain' })).status).toBe(403);
    expect((await diskon({ jenis: 'persen', nilai: 20, alasan: 'Komplain', persetujuanAtasan: { anggotaId: kasirLain, pin: '2222' } })).body.kode).toBe('persetujuan_ditolak');
    expect((await tagihan(id)).rincian.diskon).toBe(10_000);

    const disetujui = await diskon({ jenis: 'persen', nilai: 20, alasan: 'Komplain', ...atasan() }).expect(200);
    expect(disetujui.body.rincian).toMatchObject({ diskon: 20_000, pajak: 8_000, total: 88_000 });
    const log = (await logAudit('diskon_manual')).filter((l) => l.entitasId === id);
    // Terbaru dulu.
    expect(log).toMatchObject([
      { alasan: 'Komplain', penyetujuAnggotaId: manajer, pelaku: { anggotaId: kasir.anggotaId }, sebelum: { jenis: 'persen', nilai: 10 }, sesudah: { jenis: 'persen', nilai: 20, diskon: 20_000 } },
      { alasan: 'Pelanggan tetap', penyetujuAnggotaId: null, sebelum: null, sesudah: { jenis: 'persen', nilai: 10, diskon: 10_000 } },
    ]);

    const nominal = await diskon({ jenis: 'nominal', nilai: 5_000, alasan: 'Promo kasir' }).expect(200);
    expect(nominal.body.rincian).toMatchObject({ diskon: 5_000, dasarPajak: 95_000, pajak: 9_500, total: 104_500 });
    expect((await diskon({ jenis: 'persen', nilai: 101, alasan: 'x', ...atasan() })).status).toBe(400);

    // Diskon ikut dibekukan saat Tagihan lunas.
    await kasir.bukaShift(0);
    const bayar = (await kasir.bayarTunai(id, 104_500).expect(201)).body;
    expect(bayar.tagihan).toMatchObject({ status: 'lunas', rincian: { diskon: 5_000, total: 104_500 } });
    expect((await diskon({ jenis: 'persen', nilai: 5, alasan: 'telat' })).body.kode).toBe('tagihan_sudah_ditutup');

    // Hapus diskon mengembalikan total penuh.
    const lain = await tagihanBerisi([{ menuId: steak }]);
    await kirim(kasir, 'put', `/v1/tagihan/${lain.id}/diskon`, { jenis: 'persen', nilai: 5, alasan: 'Coba' }).expect(200);
    const dihapus = await kirim(kasir, 'delete', `/v1/tagihan/${lain.id}/diskon`).expect(200);
    expect(dihapus.body).toMatchObject({ diskonManual: null, total: 110_000 });
  });

  it('Manajer yang sedang masuk di kasir tidak perlu PIN atasan lagi', async () => {
    const tablet = await pemilik.bukaKasir({ peran: 'manajer_outlet' });
    const id = await tablet.bukaTagihan();
    await tablet.kirimPesanan(id, [{ menuId: steak }]).expect(201);
    await kirim(tablet, 'put', `/v1/tagihan/${id}/diskon`, { jenis: 'persen', nilai: 50, alasan: 'Tamu pemilik' }).expect(200);
    const res = await tablet.post(`/v1/tagihan/${id}/void`, { alasan: 'Uji coba' }).expect(200);
    expect(res.body.status).toBe('void');
    const [log] = (await logAudit('void_tagihan')).filter((l) => l.entitasId === id);
    expect(log).toMatchObject({ penyetujuAnggotaId: tablet.anggotaId, pelaku: { anggotaId: tablet.anggotaId } });
  });

  it('buka laci tanpa transaksi butuh PIN atasan dan tercatat di Log Audit', async () => {
    const tanpaPin = await kasir.post('/v1/laci/buka', { alasan: 'Tukar uang kecil' });
    expect(tanpaPin.status).toBe(403);
    expect(tanpaPin.body).toMatchObject({ kode: 'perlu_persetujuan_atasan', izin: 'laci.buka_tanpa_transaksi' });
    expect((await kasir.post('/v1/laci/buka', atasan())).status).toBe(400);
    expect(await logAudit('buka_laci_tanpa_transaksi')).toEqual([]);

    await kasir.post('/v1/laci/buka', { alasan: 'Tukar uang kecil', ...atasan() }).expect(200);
    expect(await logAudit('buka_laci_tanpa_transaksi')).toMatchObject([
      {
        entitas: 'perangkat',
        entitasId: kasir.id,
        outletId: pemilik.outletId,
        alasan: 'Tukar uang kecil',
        penyetujuAnggotaId: manajer,
        pelaku: { perangkatId: kasir.id, anggotaId: kasir.anggotaId },
      },
    ]);
  });

  it('kendali kasir tidak menjangkau Tagihan Outlet lain', async () => {
    const { id, itemIds } = await tagihanBerisi([{ menuId: nasgor }]);
    const outletLain = await pemilik.tambahOutlet();
    const asing = await pemilik.bukaKasir({ outletId: outletLain, peran: 'manajer_outlet' });
    const percobaan = [
      await asing.post(`/v1/tagihan/${id}/item/${itemIds[0]}/batal`),
      await asing.post(`/v1/tagihan/${id}/void`, { alasan: 'x' }),
      await kirim(asing, 'put', `/v1/tagihan/${id}/diskon`, { jenis: 'persen', nilai: 5, alasan: 'x' }),
      await kirim(asing, 'delete', `/v1/tagihan/${id}/diskon`),
      await kirim(asing, 'delete', `/v1/tagihan/${id}`),
    ];
    expect(percobaan.map((r) => r.status)).toEqual([404, 404, 404, 404, 404]);
    expect(await tagihan(id)).toMatchObject({ status: 'terbuka', total: 22_000, diskonManual: null });
    // Item milik Tagihan lain di Outlet yang sama juga tidak bisa dibatalkan lewat Tagihan ini.
    const lain = await tagihanBerisi([{ menuId: nasgor }]);
    expect((await kasir.post(`/v1/tagihan/${id}/item/${lain.itemIds[0]}/batal`)).status).toBe(404);
  });
});
