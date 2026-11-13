import { Body, Controller, Get, Param, Post, Res, UseGuards } from '@nestjs/common';
import type { Kanal } from '@lifestore/domain';
import { eq } from 'drizzle-orm';
import type { Response } from 'express';
import { Database } from '../database/database';
import { tagihan } from '../database/schema';
import { type Pelaku, PelakuAktif, PerluIzin } from '../izin/izin';
import { Perangkat, type PerangkatAktif, PerangkatGuard } from '../karyawan/perangkat';
import { profilPajakBerlaku } from '../pajak/pajak.module';
import { Jam } from '../umum/jam';
import { objek, pilihan, teksOpsional, tidakDitemukan } from '../umum/validasi';
import { tanggalOperasional } from './nomor';
import { idDipakai, idKlien, tagihanDiOutlet, tagihanLengkap, tagihanTerbuka } from './tagihan';

/** Kanal yang bisa dibuka dari kasir saat ini. Dine-in (dengan Meja) menyusul. */
const KANAL_KASIR: readonly Kanal[] = ['bawa_pulang'];

/** Tagihan dari layar kasir di Perangkat Terdaftar. Tagihan milik Outlet: semua kasir Outlet melihatnya. */
@Controller('tagihan')
@UseGuards(PerangkatGuard)
export class TagihanController {
  constructor(
    private readonly db: Database,
    private readonly jam: Jam,
  ) {}

  /** Daftar Tagihan terbuka di Outlet perangkat. */
  @Get()
  @PerluIzin('kasir.buka')
  async terbuka(@Perangkat() p: PerangkatAktif) {
    return tagihanTerbuka(this.db.tenant(), p.outletId);
  }

  /**
   * Buka Tagihan baru. Profil Pajak yang berlaku hari ini disalin ke Tagihan.
   * Mengirim ulang dengan `id` yang sama mengembalikan Tagihan yang sudah dibuka (idempoten).
   */
  @Post()
  @PerluIzin('kasir.buka')
  async buka(@Perangkat() p: PerangkatAktif, @PelakuAktif() pelaku: Pelaku, @Body() body: unknown, @Res({ passthrough: true }) res: Response) {
    const m = objek(body);
    const id = idKlien(m);
    const kanal = pilihan(m, 'kanal', KANAL_KASIR);
    const namaPelanggan = teksOpsional(m, 'namaPelanggan', { maks: 100 }) ?? null;
    const tx = this.db.tenant();
    const sekarang = this.jam.sekarang();
    const pajak = await profilPajakBerlaku(tx, p.outletId, tanggalOperasional(sekarang));
    if (!pajak) throw tidakDitemukan('Profil Pajak');
    const [baru] = await tx
      .insert(tagihan)
      .values({
        ...(id ? { id } : {}),
        tenantId: p.tenantId,
        outletId: p.outletId,
        perangkatId: p.id,
        kanal,
        namaPelanggan,
        dibukaOlehAnggotaId: pelaku.anggotaId,
        dibukaPada: sekarang,
        pajakJenis: pajak.jenis,
        pajakTarifPersen: pajak.tarifPersen,
        pajakLabel: pajak.labelStruk,
        hargaTermasukPajak: pajak.hargaTermasukPajak,
        serviceChargePersen: pajak.serviceChargePersen,
        serviceChargeKanal: pajak.serviceChargeKanal,
      })
      .onConflictDoNothing()
      .returning();
    if (baru) {
      res.status(201);
      return tagihanLengkap(tx, baru);
    }
    const [lama] = await tx.select().from(tagihan).where(eq(tagihan.id, id!));
    if (!lama || lama.outletId !== p.outletId) throw idDipakai();
    res.status(200);
    return tagihanLengkap(tx, lama);
  }

  /** Detail Tagihan (terbuka atau sudah ditutup, untuk struk): Pesanan, rincian, Pembayaran. */
  @Get(':id')
  @PerluIzin('kasir.buka')
  async detail(@Perangkat() p: PerangkatAktif, @Param('id') id: string) {
    const tx = this.db.tenant();
    return tagihanLengkap(tx, await tagihanDiOutlet(tx, p.outletId, id));
  }
}
