import { Body, Controller, Get, HttpCode, Module, Param, Post, Query, UseGuards } from '@nestjs/common';
import type { Kanal } from '@lifestore/domain';
import { and, desc, eq, lte } from 'drizzle-orm';
import { PenulisLogAudit } from '../audit/audit.module';
import { Database, type TxDb } from '../database/database';
import { outlet, profilPajak } from '../database/schema';
import { Sesi, SesiGuard, type SesiPengguna } from '../identitas/sesi.guard';
import { PerluIzin } from '../izin/izin';
import {
  angka,
  boolean,
  hariIni,
  objek,
  pilihan,
  tanggal,
  teksOpsional,
  tidakDitemukan,
  tidakValid,
} from '../umum/validasi';

const JENIS_PAJAK = ['PBJT', 'PPN', 'tidak_dipungut'] as const;
const KANAL: readonly Kanal[] = ['dine_in', 'bawa_pulang'];
const LABEL_DEFAULT: Record<(typeof JENIS_PAJAK)[number], string> = { PBJT: 'PBJT', PPN: 'PPN', tidak_dipungut: '' };

type BarisProfilPajak = typeof profilPajak.$inferSelect;

/** Bentuk Profil Pajak di API; `serviceCharge` cocok dengan `AturanServiceCharge` di paket domain. */
export function tampilkanProfilPajak(p: BarisProfilPajak) {
  return {
    id: p.id,
    outletId: p.outletId,
    berlakuMulai: p.berlakuMulai,
    jenis: p.jenis,
    tarifPersen: p.tarifPersen,
    labelStruk: p.labelStruk,
    hargaTermasukPajak: p.hargaTermasukPajak,
    serviceCharge: { tarifPersen: p.serviceChargePersen, kanal: p.serviceChargeKanal as Kanal[] },
  };
}

/** Profil Pajak default Outlet baru: PBJT 10%, tanpa Service Charge, harga belum termasuk pajak. */
export async function buatProfilPajakDefault(tx: TxDb, o: { tenantId: string; outletId: string }): Promise<void> {
  await tx.insert(profilPajak).values({
    tenantId: o.tenantId,
    outletId: o.outletId,
    berlakuMulai: hariIni(),
    jenis: 'PBJT',
    tarifPersen: 10,
    labelStruk: 'PBJT',
    serviceChargePersen: 0,
    serviceChargeKanal: ['dine_in'],
    hargaTermasukPajak: false,
  });
}

/** Profil Pajak yang berlaku untuk Outlet pada tanggal tertentu, atau undefined. */
export async function profilPajakBerlaku(tx: TxDb, outletId: string, pada: string): Promise<BarisProfilPajak | undefined> {
  const [p] = await tx
    .select()
    .from(profilPajak)
    .where(and(eq(profilPajak.outletId, outletId), lte(profilPajak.berlakuMulai, pada)))
    .orderBy(desc(profilPajak.berlakuMulai), desc(profilPajak.createdAt))
    .limit(1);
  return p;
}

@Controller('outlet/:outletId/profil-pajak')
@UseGuards(SesiGuard)
export class ProfilPajakController {
  constructor(
    private readonly db: Database,
    private readonly audit: PenulisLogAudit,
  ) {}

  private async pastikanOutlet(outletId: string): Promise<{ id: string; tenantId: string }> {
    const [o] = await this.db.tenant().select({ id: outlet.id, tenantId: outlet.tenantId }).from(outlet).where(eq(outlet.id, outletId));
    if (!o) throw tidakDitemukan('Outlet');
    return o;
  }

  /** Profil Pajak yang berlaku pada `tanggal` (default hari ini). */
  @Get()
  @PerluIzin('profil_pajak.lihat', { outletParam: 'outletId' })
  async berlaku(@Param('outletId') outletId: string, @Query('tanggal') tanggalQuery?: string) {
    await this.pastikanOutlet(outletId);
    const pada = tanggalQuery === undefined ? hariIni() : tanggal(tanggalQuery, 'tanggal');
    const p = await profilPajakBerlaku(this.db.tenant(), outletId, pada);
    if (!p) throw tidakDitemukan('Profil Pajak pada tanggal itu');
    return tampilkanProfilPajak(p);
  }

  @Get('riwayat')
  @PerluIzin('profil_pajak.lihat', { outletParam: 'outletId' })
  async riwayat(@Param('outletId') outletId: string) {
    await this.pastikanOutlet(outletId);
    const baris = await this.db
      .tenant()
      .select()
      .from(profilPajak)
      .where(eq(profilPajak.outletId, outletId))
      .orderBy(desc(profilPajak.berlakuMulai), desc(profilPajak.createdAt));
    return baris.map(tampilkanProfilPajak);
  }

  /**
   * Perubahan Profil Pajak mulai `berlakuMulai`. Menambah baris baru (tidak menimpa), jadi tarif
   * sebelum tanggal itu tidak berubah. Tercatat di Log Audit dengan profil yang digantikan.
   */
  @Post()
  @HttpCode(201)
  @PerluIzin('profil_pajak.ubah', { outletParam: 'outletId' })
  async ubah(@Param('outletId') outletId: string, @Body() body: unknown, @Sesi() sesi: SesiPengguna) {
    const o = await this.pastikanOutlet(outletId);
    const m = objek(body);
    const berlakuMulai = tanggal(m.berlakuMulai, 'berlakuMulai');
    const jenis = pilihan(m, 'jenis', JENIS_PAJAK);
    const tarifPersen = jenis === 'tidak_dipungut' ? 0 : angka(m, 'tarifPersen', { min: 0, maks: 100 });
    const labelStruk = teksOpsional(m, 'labelStruk', { maks: 20 }) ?? LABEL_DEFAULT[jenis];
    const hargaTermasukPajak = m.hargaTermasukPajak === undefined ? false : boolean(m, 'hargaTermasukPajak');
    const sc = m.serviceCharge === undefined || m.serviceCharge === null ? {} : objek(m.serviceCharge);
    const serviceChargePersen = sc.tarifPersen === undefined ? 0 : angka(sc, 'tarifPersen', { min: 0, maks: 100 });
    const serviceChargeKanal = sc.kanal === undefined ? ['dine_in'] : kanalValid(sc.kanal);

    const tx = this.db.tenant();
    const sebelum = await profilPajakBerlaku(tx, outletId, berlakuMulai);
    const [baru] = await tx
      .insert(profilPajak)
      .values({
        tenantId: o.tenantId,
        outletId,
        berlakuMulai,
        jenis,
        tarifPersen,
        labelStruk,
        serviceChargePersen,
        serviceChargeKanal,
        hargaTermasukPajak,
      })
      .returning();
    const sesudah = tampilkanProfilPajak(baru!);
    await this.audit.catat({
      aksi: 'ubah_profil_pajak',
      entitas: 'profil_pajak',
      entitasId: baru!.id,
      outletId,
      pelaku: { penggunaId: sesi.penggunaId },
      sebelum: sebelum ? tampilkanProfilPajak(sebelum) : null,
      sesudah,
    });
    return sesudah;
  }
}

function kanalValid(v: unknown): Kanal[] {
  if (!Array.isArray(v) || v.some((k) => !KANAL.includes(k as Kanal))) {
    throw tidakValid('serviceCharge.kanal', `Harus daftar dari: ${KANAL.join(', ')}.`);
  }
  return [...new Set(v as Kanal[])];
}

@Module({ controllers: [ProfilPajakController] })
export class PajakModule {}
