import { Body, Controller, HttpCode, Module, Post, UseGuards } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PenulisLogAudit } from '../src/audit/audit.module';
import { SesiGuard } from '../src/identitas/sesi.guard';
import { type Pelaku, PelakuAktif, PerluIzin } from '../src/izin/izin';
import { KaryawanModule } from '../src/karyawan/karyawan.module';
import { Perangkat, type PerangkatAktif, PerangkatGuard } from '../src/karyawan/perangkat';
import { buktiPersetujuanDari, PersetujuanAtasan } from '../src/karyawan/persetujuan-atasan';
import { objek } from '../src/umum/validasi';
import { buatDuniaTes, type DuniaTes, type PemilikTes, type PerangkatTes } from './support/dunia-tes';

// Rute penguji: Menu (#35) dan aksi sensitif (void, #38+) belum ada di tiket ini, jadi pemeriksa
// izin dan Persetujuan Atasan diuji lewat rute yang memakai dekorator dan layanan yang sama.

@Controller('uji-menu')
@UseGuards(SesiGuard)
class UjiMenuDashboardController {
  @Post()
  @HttpCode(200)
  @PerluIzin('menu.ubah')
  ubah() {
    return { ok: true };
  }
}

@Controller('uji-kasir')
@UseGuards(PerangkatGuard)
class UjiKasirController {
  constructor(
    private readonly persetujuan: PersetujuanAtasan,
    private readonly audit: PenulisLogAudit,
  ) {}

  @Post('menu')
  @HttpCode(200)
  @PerluIzin('menu.ubah')
  ubahMenu() {
    return { ok: true };
  }

  /** Aksi sensitif tiruan: void Tagihan dengan Persetujuan Atasan, tercatat di Log Audit. */
  @Post('void')
  @HttpCode(200)
  @PerluIzin('kasir.buka')
  async void(@PelakuAktif() pelaku: Pelaku, @Perangkat() p: PerangkatAktif, @Body() body: unknown) {
    const { penyetujuAnggotaId } = await this.persetujuan.pastikan(
      pelaku,
      'tagihan.void',
      p.outletId,
      buktiPersetujuanDari(objek(body).persetujuanAtasan),
    );
    await this.audit.catat({
      aksi: 'void_tagihan',
      entitas: 'tagihan',
      entitasId: 'tagihan-uji',
      outletId: p.outletId,
      pelaku: { penggunaId: pelaku.penggunaId, perangkatId: pelaku.perangkatId },
      alasan: 'salah input',
      penyetujuAnggotaId,
    });
    return { penyetujuAnggotaId };
  }
}

@Module({ imports: [KaryawanModule], controllers: [UjiMenuDashboardController, UjiKasirController] })
class ModulUji {}

describe('Pemeriksa izin dan Persetujuan Atasan', () => {
  let dunia: DuniaTes;
  let pemilik: PemilikTes;
  let tablet: PerangkatTes;
  let kasir: string;
  let kasirLain: string;
  let manajer: string;

  beforeAll(async () => {
    dunia = await buatDuniaTes({ modulTambahan: [ModulUji] });
    pemilik = await dunia.daftarTenant();
    const o = pemilik.outletId;
    kasir = await pemilik.tambahKaryawan({ nama: 'Kasir', pin: '1111', penugasan: [{ outletId: o, peran: 'kasir' }] });
    kasirLain = await pemilik.tambahKaryawan({ nama: 'Kasir Lain', pin: '2222', penugasan: [{ outletId: o, peran: 'kasir' }] });
    manajer = await pemilik.tambahKaryawan({ nama: 'Manajer', pin: '9876', penugasan: [{ outletId: o, peran: 'manajer_outlet' }] });
    tablet = await pemilik.daftarkanPerangkat();
  });
  afterAll(() => dunia?.tutup());

  it('Kasir tidak bisa mengubah Menu, baik dari dashboard maupun dari Perangkat Terdaftar', async () => {
    await pemilik.tambahKaryawan({ email: 'kasir-menu@contoh.test', penugasan: [{ outletId: pemilik.outletId, peran: 'kasir' }] });
    const kasirDashboard = await dunia.terimaUndangan('kasir-menu@contoh.test');
    expect((await kasirDashboard.post('/v1/uji-menu')).status).toBe(403);
    await pemilik.post('/v1/uji-menu').expect(200);

    await tablet.masukPin(kasir, '1111').expect(200);
    const res = await tablet.post('/v1/uji-kasir/menu');
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ kode: 'tidak_berizin', izin: 'menu.ubah' });
  });

  it('aksi sensitif ditolak tanpa PIN atasan', async () => {
    await tablet.masukPin(kasir, '1111').expect(200);
    const res = await tablet.post('/v1/uji-kasir/void');
    expect(res.status).toBe(403);
    expect(res.body.kode).toBe('perlu_persetujuan_atasan');
  });

  it('PIN Kasir lain bukan Persetujuan Atasan', async () => {
    await tablet.masukPin(kasir, '1111').expect(200);
    const res = await tablet.post('/v1/uji-kasir/void', { persetujuanAtasan: { anggotaId: kasirLain, pin: '2222' } });
    expect(res.status).toBe(403);
    expect(res.body.kode).toBe('persetujuan_ditolak');
  });

  it('PIN Manajer Outlet menyetujui aksi, dan penyetujunya tercatat di Log Audit', async () => {
    await tablet.masukPin(kasir, '1111').expect(200);
    const res = await tablet.post('/v1/uji-kasir/void', { persetujuanAtasan: { anggotaId: manajer, pin: '9876' } }).expect(200);
    expect(res.body.penyetujuAnggotaId).toBe(manajer);

    const log = (await pemilik.get('/v1/log-audit').expect(200)).body;
    expect(log[0]).toMatchObject({
      aksi: 'void_tagihan',
      outletId: pemilik.outletId,
      pelaku: { perangkatId: tablet.id },
      alasan: 'salah input',
      penyetujuAnggotaId: manajer,
    });
  });

  it('Manajer yang sedang masuk tidak perlu PIN atasan lagi', async () => {
    await tablet.masukPin(manajer, '9876').expect(200);
    const res = await tablet.post('/v1/uji-kasir/void').expect(200);
    expect(res.body.penyetujuAnggotaId).toBe(manajer);
  });

  it('PIN atasan yang salah dihitung dan ikut terkunci walau aksinya ditolak', async () => {
    const atasan = await pemilik.tambahKaryawan({ nama: 'Atasan', pin: '4444', penugasan: [{ outletId: pemilik.outletId, peran: 'manajer_outlet' }] });
    await tablet.masukPin(kasir, '1111').expect(200);
    for (let i = 0; i < 4; i++) {
      expect((await tablet.post('/v1/uji-kasir/void', { persetujuanAtasan: { anggotaId: atasan, pin: '0000' } })).status).toBe(401);
    }
    expect((await tablet.post('/v1/uji-kasir/void', { persetujuanAtasan: { anggotaId: atasan, pin: '0000' } })).status).toBe(423);
    expect((await tablet.post('/v1/uji-kasir/void', { persetujuanAtasan: { anggotaId: atasan, pin: '4444' } })).status).toBe(423);
    // Aksi yang ditolak tidak meninggalkan catatan.
    const log = (await pemilik.get('/v1/log-audit').expect(200)).body;
    expect(log.filter((l: { penyetujuAnggotaId: string }) => l.penyetujuAnggotaId === atasan)).toEqual([]);
  });
});
