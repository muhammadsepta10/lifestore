import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buatDuniaTes, type DuniaTes } from './support/dunia-tes';

// Seam: Peran berlingkup Outlet (Penugasan) hanya melihat data Outlet tempat ia ditugaskan,
// lewat HTTP terhadap Postgres sungguhan.

describe('Lingkup Outlet untuk Peran yang ditugaskan ke Outlet tertentu', () => {
  let dunia: DuniaTes;
  beforeAll(async () => {
    dunia = await buatDuniaTes();
  });
  afterAll(() => dunia?.tutup());

  it('Manajer Outlet hanya melihat penjualan, Siap Jualan, dan Log Audit Outlet-nya sendiri', async () => {
    const pemilik = await dunia.daftarTenant();
    const outletB = await pemilik.tambahOutlet({ nama: 'Outlet B' });
    await pemilik.aktifkanMetodeBayar('tunai');
    await pemilik.aktifkanMetodeBayar('tunai', outletB);
    const soto = await pemilik.buatMenu({ nama: 'Soto', harga: 10_000 });
    // Penjualan 11.000 di Outlet A dan 22.000 di Outlet B.
    for (const [outletId, jumlah] of [
      [pemilik.outletId, 1],
      [outletB, 2],
    ] as const) {
      const kasir = await pemilik.bukaKasir({ outletId });
      await kasir.bukaShift(0);
      const id = await kasir.bukaTagihan();
      await kasir.kirimPesanan(id, [{ menuId: soto, jumlah }]).expect(201);
      await kasir.bayarTunai(id, 11_000 * jumlah).expect(201);
    }
    await pemilik.tambahKaryawan({ email: 'manajer-b@lifestore.test', penugasan: [{ outletId: outletB, peran: 'manajer_outlet' }] });
    const manajer = await dunia.terimaUndangan('manajer-b@lifestore.test');

    const dashboard = (await manajer.get('/v1/dashboard').expect(200)).body;
    expect(dashboard.outlet.map((o: { id: string }) => o.id)).toEqual([outletB]);
    expect(dashboard.penjualanHariIni).toMatchObject({ penjualan: 22_000, jumlahTagihan: 1 });
    // Pemilik tetap melihat semua Outlet.
    const semua = (await pemilik.get('/v1/dashboard').expect(200)).body;
    expect(semua.outlet).toHaveLength(2);
    expect(semua.penjualanHariIni).toMatchObject({ penjualan: 33_000, jumlahTagihan: 2 });

    // Perubahan Profil Pajak di kedua Outlet tercatat di Log Audit.
    for (const outletId of [pemilik.outletId, outletB]) {
      await pemilik.post(`/v1/outlet/${outletId}/profil-pajak`, { berlakuMulai: '2030-01-01', jenis: 'PBJT', tarifPersen: 12 }).expect(201);
    }
    const logPemilik = (await pemilik.get('/v1/log-audit').expect(200)).body as { aksi: string; outletId: string | null }[];
    expect(logPemilik.filter((l) => l.aksi === 'ubah_profil_pajak').map((l) => l.outletId).sort()).toEqual([pemilik.outletId, outletB].sort());
    const logManajer = (await manajer.get('/v1/log-audit').expect(200)).body as { aksi: string; outletId: string | null }[];
    expect(logManajer.map((l) => [l.aksi, l.outletId])).toEqual([['ubah_profil_pajak', outletB]]);
  });
});
