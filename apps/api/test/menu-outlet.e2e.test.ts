import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buatDuniaTes, type DuniaTes, type KasirTes, type PemilikTes } from './support/dunia-tes';

type MenuDijual = { id: string; nama: string; harga: number; habis: boolean; stasiunId: string | null; varian: { id: string; harga: number }[] };

async function menuDiOutlet(pemilik: PemilikTes, outletId: string, menuId: string): Promise<MenuDijual> {
  const daftar: MenuDijual[] = (await pemilik.get(`/v1/outlet/${outletId}/menu`).expect(200)).body.menu;
  const m = daftar.find((x) => x.id === menuId);
  if (!m) throw new Error(`Menu ${menuId} tidak dijual di Outlet ${outletId}`);
  return m;
}

describe('Menu di Outlet: Stasiun, override harga, Habis', () => {
  let dunia: DuniaTes;
  beforeAll(async () => {
    dunia = await buatDuniaTes();
  });
  afterAll(() => dunia?.tutup());

  it('manajer membuat Stasiun Outlet dan memetakan setiap Menu ke Stasiun', async () => {
    const pemilik = await dunia.daftarTenant();
    const dapur = await pemilik.buatStasiun('Dapur');
    const bar = await pemilik.buatStasiun('Bar');
    const stasiun = (await pemilik.get(`/v1/outlet/${pemilik.outletId}/stasiun`).expect(200)).body;
    expect(stasiun.map((s: { id: string; nama: string }) => [s.id, s.nama])).toEqual([
      [dapur, 'Dapur'],
      [bar, 'Bar'],
    ]);
    await pemilik.patch(`/v1/stasiun/${bar}`, { nama: 'Bar Kopi' }).expect(200);

    const nasgor = await pemilik.buatMenu({ nama: 'Nasi Goreng', harga: 20000 });
    const kopi = await pemilik.buatMenu({ nama: 'Kopi Tubruk', harga: 8000 });
    expect((await menuDiOutlet(pemilik, pemilik.outletId, nasgor)).stasiunId).toBeNull();

    await pemilik.put(`/v1/outlet/${pemilik.outletId}/menu/${nasgor}/stasiun`, { stasiunId: dapur }).expect(200);
    await pemilik.put(`/v1/outlet/${pemilik.outletId}/menu/${kopi}/stasiun`, { stasiunId: bar }).expect(200);
    expect((await menuDiOutlet(pemilik, pemilik.outletId, nasgor)).stasiunId).toBe(dapur);
    expect((await menuDiOutlet(pemilik, pemilik.outletId, kopi)).stasiunId).toBe(bar);

    // Pindah Stasiun, lalu lepas pemetaan.
    await pemilik.put(`/v1/outlet/${pemilik.outletId}/menu/${kopi}/stasiun`, { stasiunId: dapur }).expect(200);
    expect((await menuDiOutlet(pemilik, pemilik.outletId, kopi)).stasiunId).toBe(dapur);
    await pemilik.put(`/v1/outlet/${pemilik.outletId}/menu/${kopi}/stasiun`, { stasiunId: null }).expect(200);
    expect((await menuDiOutlet(pemilik, pemilik.outletId, kopi)).stasiunId).toBeNull();

    // Stasiun Outlet lain tidak bisa dipakai, dan pemetaan berlaku per Outlet.
    const outletDua = await pemilik.tambahOutlet();
    const dapurDua = await pemilik.buatStasiun('Dapur Dua', outletDua);
    await pemilik.put(`/v1/outlet/${pemilik.outletId}/menu/${nasgor}/stasiun`, { stasiunId: dapurDua }).expect(404);
    await pemilik.put(`/v1/outlet/${outletDua}/menu/${nasgor}/stasiun`, { stasiunId: dapurDua }).expect(200);
    expect((await menuDiOutlet(pemilik, pemilik.outletId, nasgor)).stasiunId).toBe(dapur);
    expect((await menuDiOutlet(pemilik, outletDua, nasgor)).stasiunId).toBe(dapurDua);
  });

  it('harga override Outlet dipakai untuk Outlet itu saja, dan setiap perubahan harga tercatat di Log Audit', async () => {
    const pemilik = await dunia.daftarTenant();
    const mall = await pemilik.tambahOutlet({ nama: 'Outlet Mall' });
    const kopi = await pemilik.buatMenu({
      nama: 'Kopi Susu',
      harga: 18000,
      varian: [
        { nama: 'Reguler', harga: 18000 },
        { nama: 'Jumbo', harga: 24000 },
      ],
    });
    const [reguler, jumbo] = (await pemilik.get(`/v1/menu/${kopi}`).expect(200)).body.varian.map((v: { id: string }) => v.id);

    await pemilik
      .put(`/v1/outlet/${mall}/menu/${kopi}/harga`, {
        harga: 22000,
        varian: [
          { varianId: reguler, harga: 22000 },
          { varianId: jumbo, harga: 28000 },
        ],
      })
      .expect(200);

    const diMall = await menuDiOutlet(pemilik, mall, kopi);
    expect([diMall.harga, diMall.varian.map((v) => v.harga)]).toEqual([22000, [22000, 28000]]);
    const diPusat = await menuDiOutlet(pemilik, pemilik.outletId, kopi);
    expect([diPusat.harga, diPusat.varian.map((v) => v.harga)]).toEqual([18000, [18000, 24000]]);

    // Kembali ke harga Merek untuk Varian Jumbo saja.
    await pemilik.put(`/v1/outlet/${mall}/menu/${kopi}/harga`, { harga: 22000, varian: [{ varianId: reguler, harga: 22000 }] }).expect(200);
    expect((await menuDiOutlet(pemilik, mall, kopi)).varian.map((v) => v.harga)).toEqual([22000, 24000]);

    // Ubah harga dasar Merek: Outlet tanpa override ikut, Outlet dengan override tidak.
    await pemilik.patch(`/v1/menu/${kopi}`, { harga: 19000, varian: [{ id: reguler, nama: 'Reguler', harga: 19000 }, { id: jumbo, nama: 'Jumbo', harga: 25000 }] }).expect(200);
    expect((await menuDiOutlet(pemilik, pemilik.outletId, kopi)).varian.map((v) => v.harga)).toEqual([19000, 25000]);
    expect((await menuDiOutlet(pemilik, mall, kopi)).varian.map((v) => v.harga)).toEqual([22000, 25000]);

    // Perubahan non-harga tidak dicatat sebagai perubahan harga.
    await pemilik.patch(`/v1/menu/${kopi}`, { deskripsi: 'Enak' }).expect(200);

    const audit = (await pemilik.get('/v1/log-audit').expect(200)).body
      .filter((l: { aksi: string }) => l.aksi.startsWith('ubah_harga'))
      .reverse();
    expect(audit.map((l: { aksi: string; outletId: string | null }) => [l.aksi, l.outletId])).toEqual([
      ['ubah_harga_outlet', mall],
      ['ubah_harga_outlet', mall],
      ['ubah_harga_menu', null],
    ]);
    expect(audit[0]).toMatchObject({
      entitas: 'menu',
      entitasId: kopi,
      pelaku: { email: pemilik.email },
      sebelum: { harga: 18000, varian: [{ varianId: reguler, harga: 18000 }, { varianId: jumbo, harga: 24000 }] },
      sesudah: { harga: 22000, varian: [{ varianId: reguler, harga: 22000 }, { varianId: jumbo, harga: 28000 }] },
    });
    expect(audit[2]).toMatchObject({
      sebelum: { harga: 18000, varian: [{ varianId: reguler, harga: 18000 }, { varianId: jumbo, harga: 24000 }] },
      sesudah: { harga: 19000, varian: [{ varianId: reguler, harga: 19000 }, { varianId: jumbo, harga: 25000 }] },
    });

    await pemilik.put(`/v1/outlet/${mall}/menu/${kopi}/harga`, { harga: -5 }).expect(400);
    await pemilik.put(`/v1/outlet/${mall}/menu/${kopi}/harga`, { harga: null, varian: [{ varianId: 'varian-lain', harga: 1 }] }).expect(404);
  });

  it('Menu Habis di satu Outlet tidak bisa dipesan di Outlet itu dan tetap tersedia di Outlet lain', async () => {
    const pemilik = await dunia.daftarTenant();
    const cabang = await pemilik.tambahOutlet({ nama: 'Cabang' });
    const ayam = await pemilik.buatMenu({ nama: 'Ayam Bakar', harga: 25000 });

    await pemilik.put(`/v1/outlet/${pemilik.outletId}/menu/${ayam}/habis`, { habis: true }).expect(200);
    expect((await menuDiOutlet(pemilik, pemilik.outletId, ayam)).habis).toBe(true);
    expect((await menuDiOutlet(pemilik, cabang, ayam)).habis).toBe(false);

    const kasirPusat = await pemilik.bukaKasir();
    const kasirCabang = await pemilik.bukaKasir({ outletId: cabang });
    const tagihanPusat = await kasirPusat.bukaTagihan();
    const habis = await kasirPusat.kirimPesanan(tagihanPusat, [{ menuId: ayam }]).expect(409);
    expect(habis.body.kode).toBe('menu_habis');
    await kasirCabang.kirimPesanan(await kasirCabang.bukaTagihan(), [{ menuId: ayam }]).expect(201);

    await pemilik.put(`/v1/outlet/${pemilik.outletId}/menu/${ayam}/habis`, { habis: false }).expect(200);
    expect((await menuDiOutlet(pemilik, pemilik.outletId, ayam)).habis).toBe(false);
    await kasirPusat.kirimPesanan(tagihanPusat, [{ menuId: ayam }]).expect(201);
  });
});

describe('Item Pesanan menyalin harga Menu yang berlaku di Outlet', () => {
  let dunia: DuniaTes;
  let pemilik: PemilikTes;
  let mall: string;
  let kopi: string;
  let varian: { id: string; nama: string }[];
  let grup: { id: string; pilihan: { id: string; nama: string }[] }[];

  beforeAll(async () => {
    dunia = await buatDuniaTes();
    pemilik = await dunia.daftarTenant();
    mall = await pemilik.tambahOutlet({ nama: 'Outlet Mall' });
    kopi = await pemilik.buatMenu({
      nama: 'Kopi Susu',
      harga: 18000,
      bebasPajak: true,
      varian: [
        { nama: 'Reguler', harga: 18000 },
        { nama: 'Jumbo', harga: 24000 },
      ],
      grupPilihan: [
        { nama: 'Level Manis', minimum: 1, maksimum: 1, pilihan: [{ nama: 'Normal', harga: 0 }, { nama: 'Kurang', harga: 0 }] },
        { nama: 'Topping', minimum: 0, maksimum: 2, pilihan: [{ nama: 'Boba', harga: 5000 }, { nama: 'Cincau', harga: 4000 }, { nama: 'Jelly', harga: 3000 }] },
      ],
    });
    const m = (await pemilik.get(`/v1/menu/${kopi}`).expect(200)).body;
    varian = m.varian;
    grup = m.grupPilihan;
    const [jumboId] = [varian[1]!.id];
    await pemilik.put(`/v1/outlet/${mall}/menu/${kopi}/harga`, { harga: 20000, varian: [{ varianId: jumboId, harga: 27000 }] }).expect(200);
  });
  afterAll(() => dunia?.tutup());

  // Kasir mengirim satu Item Pesanan lewat endpoint kirim Pesanan yang sungguhan; satu kasir dan satu
  // Tagihan per Outlet. Respons sukses diringkas menjadi Item Pesanan pertamanya.
  const kasirDi = new Map<string, { kasir: KasirTes; tagihanId: string }>();
  async function pesan(outletId: string, body: { menuId: string; varianId?: string; pilihanIds?: (string | undefined)[] }) {
    let k = kasirDi.get(outletId);
    if (!k) {
      const kasir = await pemilik.bukaKasir({ outletId });
      k = { kasir, tagihanId: await kasir.bukaTagihan() };
      kasirDi.set(outletId, k);
    }
    const res = await k.kasir.post(`/v1/tagihan/${k.tagihanId}/pesanan`, { item: [body] });
    return { status: res.status, body: res.status === 201 ? res.body.item[0] : res.body };
  }

  it('menyalin nama, harga Varian Outlet, pilihan berbayar, tanda bebas pajak, dan Stasiun', async () => {
    const bar = await pemilik.buatStasiun('Bar', mall);
    await pemilik.put(`/v1/outlet/${mall}/menu/${kopi}/stasiun`, { stasiunId: bar }).expect(200);
    const res = await pesan(mall, {
      menuId: kopi,
      varianId: varian[1]!.id,
      pilihanIds: [grup[0]!.pilihan[1]!.id, grup[1]!.pilihan[0]!.id, grup[1]!.pilihan[2]!.id],
    });
    expect(res.body).toMatchObject({
      menuId: kopi,
      nama: 'Kopi Susu',
      varianId: varian[1]!.id,
      namaVarian: 'Jumbo',
      hargaSatuan: 27000,
      pilihan: [
        { pilihanId: grup[0]!.pilihan[1]!.id, grupPilihanId: grup[0]!.id, nama: 'Kurang', harga: 0 },
        { pilihanId: grup[1]!.pilihan[0]!.id, grupPilihanId: grup[1]!.id, nama: 'Boba', harga: 5000 },
        { pilihanId: grup[1]!.pilihan[2]!.id, grupPilihanId: grup[1]!.id, nama: 'Jelly', harga: 3000 },
      ],
      bebasPajak: true,
      stasiunId: bar,
    });

    // Outlet tanpa override memakai harga Merek; Varian Reguler tidak di-override di mall.
    const pusat = await pesan(pemilik.outletId, { menuId: kopi, varianId: varian[1]!.id, pilihanIds: [grup[0]!.pilihan[0]!.id] });
    expect([pusat.body.hargaSatuan, pusat.body.stasiunId]).toEqual([24000, null]);
    const reguler = await pesan(mall, { menuId: kopi, varianId: varian[0]!.id, pilihanIds: [grup[0]!.pilihan[0]!.id] });
    expect(reguler.body.hargaSatuan).toBe(18000);
  });

  it('Varian wajib tepat satu dan jumlah pilihan mengikuti minimum/maksimum Grup Pilihan', async () => {
    const manisNormal = grup[0]!.pilihan[0]!.id;
    const [boba, cincau, jelly] = grup[1]!.pilihan.map((p) => p.id);
    const kasus: [string, { menuId: string; varianId?: string; pilihanIds?: (string | undefined)[] }][] = [
      ['tanpa Varian', { menuId: kopi, pilihanIds: [manisNormal] }],
      ['Varian Menu lain', { menuId: kopi, varianId: 'varian-asing', pilihanIds: [manisNormal] }],
      ['kurang dari minimum', { menuId: kopi, varianId: varian[0]!.id, pilihanIds: [] }],
      ['lebih dari maksimum', { menuId: kopi, varianId: varian[0]!.id, pilihanIds: [manisNormal, boba, cincau, jelly] }],
      ['pilihan berulang', { menuId: kopi, varianId: varian[0]!.id, pilihanIds: [manisNormal, boba, boba] }],
      ['pilihan Menu lain', { menuId: kopi, varianId: varian[0]!.id, pilihanIds: [manisNormal, 'pilihan-asing'] }],
    ];
    for (const [nama, body] of kasus) {
      const res = await pesan(mall, body);
      expect({ nama, status: res.status }).toEqual({ nama, status: 400 });
    }

    const tanpaVarian = await pemilik.buatMenu({ nama: 'Air Mineral', harga: 4000 });
    expect((await pesan(mall, { menuId: tanpaVarian, varianId: varian[0]!.id })).status).toBe(400);
    expect((await pesan(mall, { menuId: tanpaVarian })).body).toMatchObject({ varianId: null, namaVarian: null, hargaSatuan: 4000, pilihan: [] });
  });

  it('Menu nonaktif tidak bisa dipesan', async () => {
    const lama = await pemilik.buatMenu({ nama: 'Menu Lama', harga: 10000 });
    await pemilik.patch(`/v1/menu/${lama}`, { aktif: false }).expect(200);
    const res = await pesan(mall, { menuId: lama });
    expect([res.status, res.body.kode]).toEqual([409, 'menu_nonaktif']);
  });
});
