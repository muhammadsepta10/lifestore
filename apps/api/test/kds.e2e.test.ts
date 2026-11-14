import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buatDuniaTes, type DuniaTes, type PerangkatTes } from './support/dunia-tes';

// Seam (#39): layar dapur (KDS) lewat HTTP terhadap Postgres sungguhan. Kasir mengirim Pesanan,
// dapur membacanya per Stasiun (snapshot dan aliran SSE) dan memajukan status Item Pesanan.

type ItemKds = { id: string; nama: string; jumlah: number; status: string; stasiunId: string | null; nomorPesanan: string; catatan: string | null };
type Kds = {
  stasiun: { id: string; nama: string }[];
  item: ItemKds[];
  siapDiserahkan: { pesananId: string; nomorPesanan: string; item: { id: string }[] }[];
  urutan: number;
};

async function restoDuaStasiun(dunia: DuniaTes) {
  const pemilik = await dunia.daftarTenant();
  const dapur = await pemilik.buatStasiun('Dapur');
  const bar = await pemilik.buatStasiun('Bar');
  const nasgor = await pemilik.buatMenu({ nama: 'Nasi Goreng', harga: 20_000 });
  const esTeh = await pemilik.buatMenu({ nama: 'Es Teh', harga: 5_000 });
  await pemilik.put(`/v1/outlet/${pemilik.outletId}/menu/${nasgor}/stasiun`, { stasiunId: dapur }).expect(200);
  await pemilik.put(`/v1/outlet/${pemilik.outletId}/menu/${esTeh}/stasiun`, { stasiunId: bar }).expect(200);
  const kasir = await pemilik.bukaKasir({ awalan: 'A' });
  const layar = await pemilik.bukaKasir({ peran: 'dapur' });
  return { pemilik, dapur, bar, nasgor, esTeh, kasir, layar };
}

const kds = async (layar: PerangkatTes, stasiun?: string): Promise<Kds> => (await layar.get(`/v1/kds${stasiun ? `?stasiun=${stasiun}` : ''}`).expect(200)).body;
const ringkas = (k: Kds) => k.item.map((i) => [i.nomorPesanan, i.nama, i.jumlah, i.status]);

/** Buka aliran SSE dan kumpulkan kejadian `item` sampai `berhenti()` dipanggil. */
async function bukaAliran(dunia: DuniaTes, layar: PerangkatTes, query: string) {
  const { port } = dunia.app.getHttpServer().address() as AddressInfo;
  const pemutus = new AbortController();
  const res = await fetch(`http://127.0.0.1:${port}/v1/kds/aliran${query}`, {
    headers: { Authorization: `Perangkat ${layar.token}`, Accept: 'text/event-stream' },
    signal: pemutus.signal,
  });
  const kejadian: { urutan: number; itemPesananId: string; status: string; stasiunId: string | null }[] = [];
  const baca = (async () => {
    const pembaca = res.body!.pipeThrough(new TextDecoderStream()).getReader();
    let sisa = '';
    try {
      for (;;) {
        const { value, done } = await pembaca.read();
        if (done) return;
        sisa += value;
        const blok = sisa.split('\n\n');
        sisa = blok.pop()!;
        for (const b of blok) {
          const data = b.split('\n').find((l) => l.startsWith('data: '));
          if (b.includes('event: item') && data) kejadian.push(JSON.parse(data.slice(6)));
        }
      }
    } catch {
      /* diputus */
    }
  })();
  return {
    status: res.status,
    tipe: res.headers.get('content-type'),
    kejadian,
    async tunggu(n: number) {
      const batas = Date.now() + 8_000;
      while (kejadian.length < n && Date.now() < batas) await new Promise((r) => setTimeout(r, 50));
    },
    async berhenti() {
      pemutus.abort();
      await baca;
    },
  };
}

describe('KDS: Item Pesanan per Stasiun', () => {
  let dunia: DuniaTes;
  beforeAll(async () => {
    dunia = await buatDuniaTes();
    await dunia.app.listen(0, '127.0.0.1');
  });
  afterAll(() => dunia?.tutup());

  it('Pesanan dari kasir muncul di Stasiun yang benar dan statusnya maju sampai disajikan', async () => {
    const { dapur, bar, nasgor, esTeh, kasir, layar } = await restoDuaStasiun(dunia);
    const tagihanId = await kasir.bukaTagihan({ namaPelanggan: 'Bu Sari' });
    await kasir
      .kirimPesanan(tagihanId, [
        { menuId: nasgor, jumlah: 2, catatan: 'Alergi udang' },
        { menuId: esTeh, jumlah: 1 },
      ])
      .expect(201);

    const semua = await kds(layar);
    expect(semua.stasiun.map((s) => s.nama)).toEqual(['Dapur', 'Bar']);
    expect(ringkas(semua)).toEqual([
      ['A-001', 'Nasi Goreng', 2, 'menunggu'],
      ['A-001', 'Es Teh', 1, 'menunggu'],
    ]);
    const layarDapur = await kds(layar, dapur);
    expect(ringkas(layarDapur)).toEqual([['A-001', 'Nasi Goreng', 2, 'menunggu']]);
    expect(layarDapur.item[0]).toMatchObject({ catatan: 'Alergi udang', stasiunId: dapur });
    // KDS di Stasiun Bar tidak menerima item Stasiun Dapur.
    expect(ringkas(await kds(layar, bar))).toEqual([['A-001', 'Es Teh', 1, 'menunggu']]);

    const idNasgor = layarDapur.item[0]!.id;
    const idTeh = semua.item[1]!.id;
    const maju = (itemIds: string[], status: string) => layar.post('/v1/kds/status', { itemIds, status });
    expect((await maju([idNasgor], 'dimasak').expect(200)).body.item).toEqual([{ id: idNasgor, status: 'dimasak' }]);
    expect(ringkas(await kds(layar, dapur))).toEqual([['A-001', 'Nasi Goreng', 2, 'dimasak']]);
    // Kasir melihat status dapur setiap Item Pesanan dan status Pesanan turunannya.
    const diKasir = (await kasir.get(`/v1/tagihan/${tagihanId}`).expect(200)).body;
    expect(diKasir.pesanan[0].item.map((i: { status: string }) => i.status)).toEqual(['dimasak', 'menunggu']);
    expect(diKasir.pesanan[0].status).toBe('dimasak');

    await maju([idNasgor], 'siap').expect(200);
    expect((await kds(layar)).siapDiserahkan).toEqual([]);
    expect((await kasir.get('/v1/siap-diambil').expect(200)).body).toEqual([]);
    await maju([idTeh], 'siap').expect(200);
    // Semua item siap: Pesanan masuk deret "Siap diserahkan" dan daftar Siap Diambil kasir.
    const siap = await kds(layar, dapur);
    expect(siap.item).toEqual([]);
    expect(siap.siapDiserahkan.map((p) => [p.nomorPesanan, p.item.length])).toEqual([['A-001', 2]]);
    const diambil = (await kasir.get('/v1/siap-diambil').expect(200)).body;
    expect(diambil.map((p: { nomorPesanan: string; namaPelanggan: string; tagihanId: string }) => [p.nomorPesanan, p.namaPelanggan, p.tagihanId])).toEqual([
      ['A-001', 'Bu Sari', tagihanId],
    ]);

    // Status tidak bisa mundur; kiriman ulang tidak mengubah apa pun.
    expect((await maju([idNasgor], 'dimasak').expect(200)).body.item).toEqual([{ id: idNasgor, status: 'siap' }]);

    // Kasir (tanpa izin KDS) boleh menandai diserahkan, tapi tidak boleh memasak.
    expect((await kasir.post('/v1/kds/status', { itemIds: [idTeh], status: 'siap' })).status).toBe(403);
    await kasir.post('/v1/kds/status', { itemIds: [idNasgor, idTeh], status: 'disajikan' }).expect(200);
    expect((await kds(layar)).siapDiserahkan).toEqual([]);
    expect((await kasir.get('/v1/siap-diambil').expect(200)).body).toEqual([]);
    const akhir = (await kasir.get(`/v1/tagihan/${tagihanId}`).expect(200)).body;
    expect(akhir.pesanan[0].status).toBe('disajikan');
  });

  it('aliran SSE Stasiun Bar hanya menerima kejadian item Bar, tanpa memuat ulang', async () => {
    const { dapur, bar, nasgor, esTeh, kasir, layar } = await restoDuaStasiun(dunia);
    const aliranBar = await bukaAliran(dunia, layar, `?stasiun=${bar}`);
    const aliranDapur = await bukaAliran(dunia, layar, `?stasiun=${dapur}`);
    try {
      expect(aliranBar.status).toBe(200);
      expect(aliranBar.tipe).toContain('text/event-stream');
      const tagihanId = await kasir.bukaTagihan();
      const pesanan = (await kasir.kirimPesanan(tagihanId, [{ menuId: nasgor }, { menuId: esTeh }]).expect(201)).body;
      const [idNasgor, idTeh] = pesanan.item.map((i: { id: string }) => i.id);
      await aliranBar.tunggu(1);
      await aliranDapur.tunggu(1);
      await layar.post('/v1/kds/status', { itemIds: [idNasgor], status: 'dimasak' }).expect(200);
      await aliranDapur.tunggu(2);
      // Beri waktu satu putaran lagi supaya kejadian nyasar (bila ada) sempat tiba.
      await new Promise((r) => setTimeout(r, 1_500));
      expect(aliranBar.kejadian.map((k) => [k.itemPesananId, k.status])).toEqual([[idTeh, 'menunggu']]);
      expect(aliranDapur.kejadian.map((k) => [k.itemPesananId, k.status])).toEqual([
        [idNasgor, 'menunggu'],
        [idNasgor, 'dimasak'],
      ]);

      // Menyambung ulang dengan `sejak` melanjutkan dari kejadian terakhir yang sudah dilihat.
      const ulang = await bukaAliran(dunia, layar, `?stasiun=${dapur}&sejak=${aliranDapur.kejadian[0]!.urutan}`);
      await ulang.tunggu(1);
      expect(ulang.kejadian.map((k) => k.status)).toEqual(['dimasak']);
      await ulang.berhenti();
    } finally {
      await aliranBar.berhenti();
      await aliranDapur.berhenti();
    }
  });

  it('layar dapur butuh izin KDS dan tidak melihat Outlet lain', async () => {
    const { pemilik, nasgor, kasir, layar } = await restoDuaStasiun(dunia);
    expect((await kasir.get('/v1/kds')).status).toBe(403);
    const tagihanId = await kasir.bukaTagihan();
    const pesanan = (await kasir.kirimPesanan(tagihanId, [{ menuId: nasgor }]).expect(201)).body;
    const outletLain = await pemilik.tambahOutlet();
    const layarLain = await pemilik.bukaKasir({ outletId: outletLain, peran: 'dapur' });
    expect((await kds(layarLain)).item).toEqual([]);
    expect((await layarLain.post('/v1/kds/status', { itemIds: [pesanan.item[0].id], status: 'dimasak' })).status).toBe(404);
    expect((await layarLain.get(`/v1/kds?stasiun=${(await kds(layar)).stasiun[0]!.id}`)).status).toBe(404);
  });
});
