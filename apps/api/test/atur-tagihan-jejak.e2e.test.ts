import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buatDuniaTes, type DuniaTes } from './support/dunia-tes';

// Seam: pindah Meja, gabung Meja, dan Pisah Tagihan meninggalkan jejak (Log Audit), dan Item Pesanan
// yang berpindah Tagihan tetap terbaca benar di kasir dan KDS, lewat HTTP terhadap Postgres sungguhan.

interface Catatan {
  aksi: string;
  entitas: string;
  entitasId: string;
  outletId: string;
  pelaku: { anggotaId: string; perangkatId: string };
  sebelum: unknown;
  sesudah: unknown;
}

describe('Jejak pindah Meja, gabung Meja, dan Pisah Tagihan', () => {
  let dunia: DuniaTes;
  beforeAll(async () => {
    dunia = await buatDuniaTes();
  });
  afterAll(() => dunia?.tutup());

  it('setiap pindah Meja, gabung Meja, dan Pisah Tagihan tercatat di Log Audit dengan asal dan tujuannya', async () => {
    const pemilik = await dunia.daftarTenant();
    const [meja1, meja2, meja3, meja4] = await pemilik.buatMeja(1, 4);
    const soto = await pemilik.buatMenu({ nama: 'Soto', harga: 10_000 });
    const teh = await pemilik.buatMenu({ nama: 'Teh', harga: 5_000 });
    const kasir = await pemilik.bukaKasir();
    const utama = await kasir.bukaTagihanDineIn(meja1!);
    const pesanan = (await kasir.kirimPesanan(utama, [{ menuId: soto }, { menuId: teh }]).expect(201)).body;
    const idTeh = pesanan.item[1].id as string;
    const kedua = await kasir.bukaTagihanDineIn(meja3!);
    const pesananKedua = (await kasir.kirimPesanan(kedua, [{ menuId: teh, jumlah: 2 }]).expect(201)).body;

    await kasir.post(`/v1/tagihan/${utama}/pindah-meja`, { mejaId: meja2 }).expect(200);
    await kasir.post(`/v1/tagihan/${utama}/gabung-meja`, { mejaId: meja4 }).expect(200);
    await kasir.post(`/v1/tagihan/${utama}/gabung-meja`, { mejaId: meja3 }).expect(200);
    const pisah = (await kasir.post(`/v1/tagihan/${utama}/pisah`, { itemIds: [idTeh] }).expect(201)).body;

    const log = ((await pemilik.get('/v1/log-audit').expect(200)).body as Catatan[]).filter((l) => ['pindah_meja', 'gabung_meja', 'pisah_tagihan'].includes(l.aksi)).reverse();
    const pelaku = { anggotaId: kasir.anggotaId, perangkatId: kasir.id };
    expect(log).toMatchObject([
      { aksi: 'pindah_meja', entitas: 'tagihan', entitasId: utama, outletId: pemilik.outletId, pelaku, sebelum: { mejaIds: [meja1] }, sesudah: { mejaIds: [meja2] } },
      { aksi: 'gabung_meja', entitas: 'tagihan', entitasId: utama, pelaku, sebelum: { mejaIds: [meja2] }, sesudah: { mejaIds: [meja2, meja4], tagihanDigabung: [], itemIds: [] } },
      {
        aksi: 'gabung_meja',
        entitas: 'tagihan',
        entitasId: utama,
        pelaku,
        sebelum: { mejaIds: [meja2, meja4] },
        sesudah: { mejaIds: [meja2, meja4, meja3], tagihanDigabung: [kedua], itemIds: [pesananKedua.item[0].id] },
      },
      { aksi: 'pisah_tagihan', entitas: 'tagihan', entitasId: utama, pelaku, sesudah: { tagihanBaruId: pisah.baru.id, itemIds: [idTeh] } },
    ]);
  });

  it('Item Pesanan yang berpindah Tagihan tampil di KDS dan kasir dengan Tagihan barunya, dan bisa dipindah lagi', async () => {
    const pemilik = await dunia.daftarTenant();
    await pemilik.aktifkanMetodeBayar('tunai');
    const [meja1, meja2] = await pemilik.buatMeja(1, 2);
    const soto = await pemilik.buatMenu({ nama: 'Soto', harga: 10_000 });
    const teh = await pemilik.buatMenu({ nama: 'Teh', harga: 5_000 });
    const kasir = await pemilik.bukaKasir();
    await kasir.bukaShift(0);
    const dapur = await pemilik.bukaKasir({ peran: 'dapur' });
    const asal = await kasir.bukaTagihanDineIn(meja1!, { namaPelanggan: 'Bu Sari' });
    const pesanan = (await kasir.kirimPesanan(asal, [{ menuId: soto }, { menuId: teh }]).expect(201)).body;
    const [idSoto, idTeh] = pesanan.item.map((i: { id: string }) => i.id) as string[];

    const pisah = (await kasir.post(`/v1/tagihan/${asal}/pisah`, { itemIds: [idTeh], namaPelanggan: 'Pak Budi' }).expect(201)).body;
    const diDapur = async () =>
      Object.fromEntries(((await dapur.get('/v1/kds').expect(200)).body.item as { id: string; tagihanId: string; namaPelanggan: string }[]).map((i) => [i.id, [i.tagihanId, i.namaPelanggan]]));
    expect(await diDapur()).toEqual({ [idSoto!]: [asal, 'Bu Sari'], [idTeh!]: [pisah.baru.id, 'Pak Budi'] });

    // Tagihan hasil pisah pindah ke Meja 2, lalu dilebur lagi ke Tagihan asal: Teh kembali ke Tagihan asal.
    await kasir.post(`/v1/tagihan/${pisah.baru.id}/pindah-meja`, { mejaId: meja2 }).expect(200);
    const gabung = (await kasir.post(`/v1/tagihan/${asal}/gabung-meja`, { mejaId: meja2 }).expect(200)).body;
    expect(gabung.pesanan).toHaveLength(1);
    expect(gabung.pesanan[0].item.map((i: { nama: string }) => i.nama)).toEqual(['Soto', 'Teh']);
    expect(gabung.total).toBe(16_500);
    expect(await diDapur()).toEqual({ [idSoto!]: [asal, 'Bu Sari'], [idTeh!]: [asal, 'Bu Sari'] });
    expect((await kasir.get(`/v1/tagihan/${pisah.baru.id}`).expect(200)).body).toMatchObject({ status: 'digabung', pesanan: [] });
    // Tagihan asal lunas dengan total gabungan.
    expect((await kasir.bayarTunai(asal, 16_500).expect(201)).body.tagihan).toMatchObject({ status: 'lunas', total: 16_500 });
  });
});
