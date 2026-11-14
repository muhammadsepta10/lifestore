import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buatDuniaTes, type DuniaTes, type KasirTes, type PemilikTes, type PerangkatTes } from './support/dunia-tes';

// Seam: perintah kasir yang mengubah data menerima `id` buatan klien sebagai kunci idempoten;
// kiriman ulang dengan `id` yang sama tidak dijalankan dua kali. Lewat HTTP terhadap Postgres sungguhan.

describe('Perintah kasir idempoten dengan id buatan klien', () => {
  let dunia: DuniaTes;
  let pemilik: PemilikTes;
  let kasir: KasirTes;
  let soto: string;
  let meja: string[];
  beforeAll(async () => {
    dunia = await buatDuniaTes();
    pemilik = await dunia.daftarTenant();
    soto = await pemilik.buatMenu({ nama: 'Soto', harga: 10_000 });
    meja = await pemilik.buatMeja(1, 4);
    kasir = await pemilik.bukaKasir({ peran: 'manajer_outlet' });
  });
  afterAll(() => dunia?.tutup());

  const put = (p: PerangkatTes, path: string, body: object) => dunia.http.put(path).set('Authorization', `Perangkat ${p.token}`).send(body);
  const jumlahLog = async (aksi: string, entitasId: string) =>
    ((await pemilik.get('/v1/log-audit').expect(200)).body as { aksi: string; entitasId: string }[]).filter((l) => l.aksi === aksi && l.entitasId === entitasId).length;
  const tagihanBerisi = async (mejaId?: string) => {
    const id = mejaId ? await kasir.bukaTagihanDineIn(mejaId) : await kasir.bukaTagihan();
    await kasir.kirimPesanan(id, [{ menuId: soto }]).expect(201);
    return id;
  };

  it('void yang dikirim ulang dengan id yang sama mengembalikan Tagihan void yang sama, tanpa catatan ganda', async () => {
    const tagihanId = await tagihanBerisi();
    const id = randomUUID();
    const pertama = (await kasir.post(`/v1/tagihan/${tagihanId}/void`, { id, alasan: 'Salah input' }).expect(200)).body;
    const ulang = (await kasir.post(`/v1/tagihan/${tagihanId}/void`, { id, alasan: 'Salah input' }).expect(200)).body;
    expect(ulang).toEqual(pertama);
    expect(pertama.status).toBe('void');
    expect(await jumlahLog('void_tagihan', tagihanId)).toBe(1);
    // Tanpa id, void kedua tetap ditolak; id yang sama untuk Tagihan lain juga ditolak.
    expect((await kasir.post(`/v1/tagihan/${tagihanId}/void`, { alasan: 'Salah input' }).expect(409)).body.kode).toBe('tagihan_sudah_ditutup');
    const lain = await tagihanBerisi();
    expect((await kasir.post(`/v1/tagihan/${lain}/void`, { id, alasan: 'Salah input' }).expect(409)).body.kode).toBe('id_dipakai');
    expect((await kasir.get(`/v1/tagihan/${lain}`).expect(200)).body.status).toBe('terbuka');
  });

  it('Diskon Manual yang dikirim ulang dengan id yang sama tercatat sekali, dan tidak menimpa diskon yang dipasang sesudahnya', async () => {
    const tagihanId = await tagihanBerisi();
    const id = randomUUID();
    await put(kasir, `/v1/tagihan/${tagihanId}/diskon`, { id, jenis: 'persen', nilai: 10, alasan: 'Promo' }).expect(200);
    await put(kasir, `/v1/tagihan/${tagihanId}/diskon`, { jenis: 'persen', nilai: 20, alasan: 'Komplain' }).expect(200);
    // Kiriman ulang perintah pertama (misal dari antrean yang tertunda) tidak mengembalikan diskon ke 10%.
    const ulang = (await put(kasir, `/v1/tagihan/${tagihanId}/diskon`, { id, jenis: 'persen', nilai: 10, alasan: 'Promo' }).expect(200)).body;
    expect(ulang.diskonManual).toMatchObject({ jenis: 'persen', nilai: 20 });
    expect(await jumlahLog('diskon_manual', tagihanId)).toBe(2);
  });

  it('pindah Meja dan gabung Meja yang dikirim ulang dengan id yang sama tidak dijalankan dua kali', async () => {
    const tagihanId = await tagihanBerisi(meja[0]);
    const idPindah = randomUUID();
    await kasir.post(`/v1/tagihan/${tagihanId}/pindah-meja`, { id: idPindah, mejaId: meja[1] }).expect(200);
    await kasir.post(`/v1/tagihan/${tagihanId}/pindah-meja`, { mejaId: meja[2] }).expect(200);
    // Kiriman ulang pindah pertama tidak menarik Tagihan kembali ke Meja 2.
    const ulang = (await kasir.post(`/v1/tagihan/${tagihanId}/pindah-meja`, { id: idPindah, mejaId: meja[1] }).expect(200)).body;
    expect(ulang.meja.map((m: { id: string }) => m.id)).toEqual([meja[2]]);
    expect(await jumlahLog('pindah_meja', tagihanId)).toBe(2);

    const idGabung = randomUUID();
    await kasir.post(`/v1/tagihan/${tagihanId}/gabung-meja`, { id: idGabung, mejaId: meja[3] }).expect(200);
    const gabungUlang = (await kasir.post(`/v1/tagihan/${tagihanId}/gabung-meja`, { id: idGabung, mejaId: meja[3] }).expect(200)).body;
    expect(gabungUlang.meja.map((m: { id: string }) => m.id)).toEqual([meja[2], meja[3]]);
    expect(await jumlahLog('gabung_meja', tagihanId)).toBe(1);
    // id pindah Meja tidak bisa dipakai untuk perintah lain.
    expect((await kasir.post(`/v1/tagihan/${tagihanId}/gabung-meja`, { id: idPindah, mejaId: meja[0] }).expect(409)).body.kode).toBe('id_dipakai');
  });

  it('buka laci yang dikirim ulang dengan id yang sama mengembalikan jawaban yang sama dan tercatat sekali', async () => {
    const id = randomUUID();
    const pertama = (await kasir.post('/v1/laci/buka', { id, alasan: 'Tukar uang kecil' }).expect(200)).body;
    dunia.jam.maju(60_000);
    const ulang = (await kasir.post('/v1/laci/buka', { id, alasan: 'Tukar uang kecil' }).expect(200)).body;
    expect(ulang).toEqual(pertama);
    expect(await jumlahLog('buka_laci_tanpa_transaksi', kasir.id)).toBe(1);
    await kasir.post('/v1/laci/buka', { alasan: 'Tukar uang kecil' }).expect(200);
    expect(await jumlahLog('buka_laci_tanpa_transaksi', kasir.id)).toBe(2);
  });

  it('tutup Shift yang dikirim ulang dengan id yang sama mengembalikan Laporan Shift yang sama', async () => {
    const shiftId = await kasir.bukaShift(50_000);
    const id = randomUUID();
    const laporan = (await kasir.post(`/v1/shift/${shiftId}/tutup`, { id, hitungButa: 50_000 }).expect(200)).body;
    const ulang = (await kasir.post(`/v1/shift/${shiftId}/tutup`, { id, hitungButa: 50_000 }).expect(200)).body;
    expect(ulang).toEqual(laporan);
    expect(laporan).toMatchObject({ status: 'ditutup', selisih: 0 });
    // Tanpa id (atau dengan id lain) Shift yang sudah ditutup tetap ditolak.
    await kasir.post(`/v1/shift/${shiftId}/tutup`, { hitungButa: 1 }).expect(409);
    await kasir.post(`/v1/shift/${shiftId}/tutup`, { id: randomUUID(), hitungButa: 1 }).expect(409);
  });

  it('id perintah milik Tenant lain tidak bisa dipakai ulang dan tidak membocorkan apa pun', async () => {
    const tagihanId = await tagihanBerisi();
    const id = randomUUID();
    await kasir.post(`/v1/tagihan/${tagihanId}/void`, { id, alasan: 'Salah input' }).expect(200);
    const lain = await dunia.daftarTenant();
    const menuLain = await lain.buatMenu({ nama: 'Bakso', harga: 10_000 });
    const kasirLain = await lain.bukaKasir({ peran: 'manajer_outlet' });
    const tagihanLain = await kasirLain.bukaTagihan();
    await kasirLain.kirimPesanan(tagihanLain, [{ menuId: menuLain }]).expect(201);
    const res = await kasirLain.post(`/v1/tagihan/${tagihanLain}/void`, { id, alasan: 'Coba' }).expect(409);
    expect(res.body).toEqual({ kode: 'id_dipakai', pesan: 'ID sudah dipakai.' });
    expect((await kasirLain.get(`/v1/tagihan/${tagihanLain}`).expect(200)).body.status).toBe('terbuka');
  });
});
