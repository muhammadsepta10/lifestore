import { describe, expect, it } from 'vitest';
import { hitungTagihan, type ProfilPajak } from './index.js';

// Semua angka harapan di file ini dihitung manual (lihat komentar tiap kasus),
// bukan diturunkan dengan rumus yang sama seperti implementasi.

const pbjt10: ProfilPajak = { jenis: 'PBJT', tarifPersen: 10, hargaTermasukPajak: false };

const nasiGoreng = { hargaSatuan: 25_000, jumlah: 2 };
const esTeh = { hargaSatuan: 18_000, jumlah: 1 };

describe('Hitung Tagihan', () => {
  it('bawa pulang dengan harga eksklusif: PBJT 10% dari subtotal, tanpa Service Charge', () => {
    // 25.000×2 + 18.000 = 68.000; pajak 6.800; total 74.800
    const hasil = hitungTagihan({
      items: [nasiGoreng, esTeh],
      kanal: 'bawa_pulang',
      profilPajak: pbjt10,
    });
    expect(hasil).toEqual({
      subtotal: 68_000,
      diskon: 0,
      serviceCharge: 0,
      dasarPajak: 68_000,
      pajak: 6_800,
      total: 74_800,
      pembulatanTunai: 0,
      totalDibayar: 74_800,
    });
  });

  const sc5 = { tarifPersen: 5 };

  it('Service Charge hanya untuk dine-in secara default', () => {
    // dine-in: SC 5% × 68.000 = 3.400; Dasar Pajak 71.400; pajak 7.140; total 78.540
    expect(
      hitungTagihan({ items: [nasiGoreng, esTeh], kanal: 'dine_in', profilPajak: pbjt10, serviceCharge: sc5 }),
    ).toMatchObject({ subtotal: 68_000, serviceCharge: 3_400, dasarPajak: 71_400, pajak: 7_140, total: 78_540 });
    // bawa pulang dengan aturan yang sama: tanpa Service Charge
    expect(
      hitungTagihan({ items: [nasiGoreng, esTeh], kanal: 'bawa_pulang', profilPajak: pbjt10, serviceCharge: sc5 }),
    ).toMatchObject({ serviceCharge: 0, dasarPajak: 68_000, pajak: 6_800, total: 74_800 });
  });

  it('Service Charge bisa diberlakukan untuk Kanal lain bila Outlet mengaturnya', () => {
    expect(
      hitungTagihan({
        items: [nasiGoreng, esTeh],
        kanal: 'bawa_pulang',
        profilPajak: pbjt10,
        serviceCharge: { tarifPersen: 5, kanal: ['dine_in', 'bawa_pulang'] },
      }),
    ).toMatchObject({ serviceCharge: 3_400, total: 78_540 });
  });

  it('harga pilihan (Grup Pilihan) ikut dikalikan jumlah, item batal tidak dihitung', () => {
    // Nasi Goreng 25.000 + telur 5.000 + level pedas 0, ×2 = 60.000
    // Es Teh 18.000 batal → tidak dihitung; pajak 6.000; total 66.000
    expect(
      hitungTagihan({
        items: [
          { hargaSatuan: 25_000, jumlah: 2, pilihan: [{ harga: 5_000 }, { harga: 0 }] },
          { hargaSatuan: 18_000, jumlah: 1, batal: true },
        ],
        kanal: 'bawa_pulang',
        profilPajak: pbjt10,
      }),
    ).toMatchObject({ subtotal: 60_000, dasarPajak: 60_000, pajak: 6_000, total: 66_000 });
  });

  it('Diskon Manual persen dikurangkan sebelum Service Charge dan pajak', () => {
    // 68.000 − 10% (6.800) = 61.200; SC 5% = 3.060; Dasar Pajak 64.260; pajak 6.426; total 70.686
    expect(
      hitungTagihan({
        items: [nasiGoreng, esTeh],
        kanal: 'dine_in',
        profilPajak: pbjt10,
        serviceCharge: sc5,
        diskon: { jenis: 'persen', nilai: 10 },
      }),
    ).toMatchObject({
      subtotal: 68_000,
      diskon: 6_800,
      serviceCharge: 3_060,
      dasarPajak: 64_260,
      pajak: 6_426,
      total: 70_686,
    });
  });

  it('Diskon Manual nominal, tidak pernah melebihi subtotal', () => {
    // 68.000 − 10.000 = 58.000; pajak 5.800; total 63.800
    expect(
      hitungTagihan({
        items: [nasiGoreng, esTeh],
        kanal: 'bawa_pulang',
        profilPajak: pbjt10,
        diskon: { jenis: 'nominal', nilai: 10_000 },
      }),
    ).toMatchObject({ diskon: 10_000, dasarPajak: 58_000, pajak: 5_800, total: 63_800 });
    expect(
      hitungTagihan({
        items: [esTeh],
        kanal: 'bawa_pulang',
        profilPajak: pbjt10,
        diskon: { jenis: 'nominal', nilai: 50_000 },
      }),
    ).toMatchObject({ subtotal: 18_000, diskon: 18_000, dasarPajak: 0, pajak: 0, total: 0 });
  });

  it('pajak dibulatkan ke rupiah sekali per Tagihan, bukan per item', () => {
    // 3 item @1.005: pajak per item 100,5 → kalau dibulatkan per item jadi 303.
    // Per Tagihan: 10% × 3.015 = 301,5 → 302 (setengah dibulatkan ke atas); total 3.317
    expect(
      hitungTagihan({
        items: [
          { hargaSatuan: 1_005, jumlah: 1 },
          { hargaSatuan: 1_005, jumlah: 1 },
          { hargaSatuan: 1_005, jumlah: 1 },
        ],
        kanal: 'bawa_pulang',
        profilPajak: pbjt10,
      }),
    ).toMatchObject({ subtotal: 3_015, pajak: 302, total: 3_317 });
    // 12.345 × 11% (PPN) = 1.357,95 → 1.358
    expect(
      hitungTagihan({
        items: [{ hargaSatuan: 12_345, jumlah: 1 }],
        kanal: 'bawa_pulang',
        profilPajak: { jenis: 'PPN', tarifPersen: 11, hargaTermasukPajak: false },
      }),
    ).toMatchObject({ pajak: 1_358, total: 13_703 });
  });

  it('Profil Pajak "tidak dipungut": tanpa pajak dan tanpa Dasar Pajak, Service Charge tetap berlaku', () => {
    // 68.000 + SC 5% 3.400 = 71.400; tarif yang tersisa di profil diabaikan
    expect(
      hitungTagihan({
        items: [nasiGoreng, esTeh],
        kanal: 'dine_in',
        profilPajak: { jenis: 'tidak_dipungut', tarifPersen: 10, hargaTermasukPajak: false },
        serviceCharge: sc5,
      }),
    ).toMatchObject({ serviceCharge: 3_400, dasarPajak: 0, pajak: 0, total: 71_400 });
  });

  it('item bebas pajak tidak masuk Dasar Pajak', () => {
    // kena pajak 50.000, bebas pajak 10.000 → Dasar Pajak 50.000; pajak 5.000; total 65.000
    expect(
      hitungTagihan({
        items: [
          { hargaSatuan: 50_000, jumlah: 1 },
          { hargaSatuan: 10_000, jumlah: 1, bebasPajak: true },
        ],
        kanal: 'bawa_pulang',
        profilPajak: pbjt10,
      }),
    ).toMatchObject({ subtotal: 60_000, dasarPajak: 50_000, pajak: 5_000, total: 65_000 });
  });

  it('diskon dan Service Charge dibagi proporsional antara item kena pajak dan bebas pajak', () => {
    // kena pajak 60.000, bebas pajak 40.000; diskon 10% = 10.000 → setelah diskon 90.000
    // bagian kena pajak 54.000; SC 5%: total 4.500, bagian kena pajak 2.700
    // Dasar Pajak 56.700; pajak 5.670; total 90.000 + 4.500 + 5.670 = 100.170
    expect(
      hitungTagihan({
        items: [
          { hargaSatuan: 30_000, jumlah: 2 },
          { hargaSatuan: 40_000, jumlah: 1, bebasPajak: true },
        ],
        kanal: 'dine_in',
        profilPajak: pbjt10,
        serviceCharge: sc5,
        diskon: { jenis: 'persen', nilai: 10 },
      }),
    ).toMatchObject({
      subtotal: 100_000,
      diskon: 10_000,
      serviceCharge: 4_500,
      dasarPajak: 56_700,
      pajak: 5_670,
      total: 100_170,
    });
  });

  describe('Pembulatan Tunai mengikuti aturan Outlet dan dicatat terpisah dari total', () => {
    // Tagihan dine-in di atas: total 78.540
    const dasar = { items: [nasiGoreng, esTeh], kanal: 'dine_in', profilPajak: pbjt10, serviceCharge: sc5 } as const;

    it.each([
      { aturan: { kelipatan: 100, arah: 'bawah' }, pembulatanTunai: -40, totalDibayar: 78_500 },
      { aturan: { kelipatan: 500, arah: 'terdekat' }, pembulatanTunai: -40, totalDibayar: 78_500 },
      { aturan: { kelipatan: 1_000, arah: 'terdekat' }, pembulatanTunai: 460, totalDibayar: 79_000 },
      { aturan: { kelipatan: 1_000, arah: 'atas' }, pembulatanTunai: 460, totalDibayar: 79_000 },
      { aturan: { kelipatan: 20, arah: 'bawah' }, pembulatanTunai: 0, totalDibayar: 78_540 },
    ] as const)('kelipatan $aturan.kelipatan ke $aturan.arah', ({ aturan, pembulatanTunai, totalDibayar }) => {
      expect(hitungTagihan({ ...dasar, pembulatanTunai: aturan })).toMatchObject({
        total: 78_540,
        pembulatanTunai,
        totalDibayar,
      });
    });

    it('tanpa aturan (bukan tunai) tidak ada pembulatan', () => {
      expect(hitungTagihan(dasar)).toMatchObject({ total: 78_540, pembulatanTunai: 0, totalDibayar: 78_540 });
    });
  });

  describe('harga inklusif: harga Menu sudah termasuk pajak dan Service Charge, dihitung mundur', () => {
    const pbjt10Inklusif: ProfilPajak = { jenis: 'PBJT', tarifPersen: 10, hargaTermasukPajak: true };

    it('dine-in: total tetap sama dengan harga, pajak dan Service Charge diurai dari dalamnya', () => {
      // 115.500 = 100.000 + SC 5.000 + pajak 10% × 105.000 = 10.500
      expect(
        hitungTagihan({
          items: [{ hargaSatuan: 115_500, jumlah: 1 }],
          kanal: 'dine_in',
          profilPajak: pbjt10Inklusif,
          serviceCharge: sc5,
        }),
      ).toEqual({
        subtotal: 115_500,
        diskon: 0,
        serviceCharge: 5_000,
        dasarPajak: 105_000,
        pajak: 10_500,
        total: 115_500,
        pembulatanTunai: 0,
        totalDibayar: 115_500,
      });
    });

    it('bawa pulang: tanpa Service Charge, pajak diurai dari harga', () => {
      // 55.000 = 50.000 + 5.000
      expect(
        hitungTagihan({
          items: [{ hargaSatuan: 27_500, jumlah: 2 }],
          kanal: 'bawa_pulang',
          profilPajak: pbjt10Inklusif,
          serviceCharge: sc5,
        }),
      ).toMatchObject({ serviceCharge: 0, dasarPajak: 50_000, pajak: 5_000, total: 55_000 });
    });

    it('dengan diskon dan item bebas pajak', () => {
      // kena pajak 22.000 + bebas pajak 10.000 = 32.000; diskon nominal 8.000 → 24.000
      // bagian kena pajak 16.500 → Dasar Pajak 15.000, pajak 1.500; total 24.000
      expect(
        hitungTagihan({
          items: [
            { hargaSatuan: 11_000, jumlah: 2 },
            { hargaSatuan: 10_000, jumlah: 1, bebasPajak: true },
          ],
          kanal: 'bawa_pulang',
          profilPajak: pbjt10Inklusif,
          diskon: { jenis: 'nominal', nilai: 8_000 },
        }),
      ).toMatchObject({ subtotal: 32_000, diskon: 8_000, dasarPajak: 15_000, pajak: 1_500, total: 24_000 });
    });

    it('pembulatan rupiah saat menghitung mundur', () => {
      // 10.000 / 1,1 = 9.090,9… → Dasar Pajak 9.091; pajak 909
      expect(
        hitungTagihan({
          items: [{ hargaSatuan: 10_000, jumlah: 1 }],
          kanal: 'bawa_pulang',
          profilPajak: pbjt10Inklusif,
        }),
      ).toMatchObject({ dasarPajak: 9_091, pajak: 909, total: 10_000 });
    });
  });
});
