import { Controller, Delete, Get, HttpCode, Module, Param, Post, UseGuards } from '@nestjs/common';
import { and, asc, eq } from 'drizzle-orm';
import { Database, type TxDb } from '../database/database';
import { outlet, siapJualanDilewati, tenant } from '../database/schema';
import { SesiGuard } from '../identitas/sesi.guard';
import { adaKaryawanSiap } from '../karyawan/karyawan.module';
import { adaPerangkatAktif } from '../karyawan/perangkat';
import { profilPajakBerlaku } from '../pajak/pajak.module';
import { hariIni, tidakDitemukan, tidakValid } from '../umum/validasi';
import { PerluIzin } from '../izin/izin';

type BarisOutlet = typeof outlet.$inferSelect;

/** Langkah checklist Siap Jualan, berurutan seperti di dashboard. */
export const LANGKAH_SIAP_JUALAN = [
  'profil_outlet',
  'profil_pajak',
  'menu',
  'stasiun',
  'metode_bayar',
  'meja',
  'karyawan',
  'perangkat',
] as const;
export type LangkahSiapJualan = (typeof LANGKAH_SIAP_JUALAN)[number];

/** Kasir baru bisa dipakai setelah ada Menu, Profil Pajak, dan satu Perangkat Terdaftar. */
export const WAJIB_UNTUK_KASIR: readonly LangkahSiapJualan[] = ['menu', 'profil_pajak', 'perangkat'];

/**
 * Pemeriksa selesai/belum setiap langkah, dihitung dari data (tidak pernah disimpan).
 * Langkah yang modulnya belum ada selalu `false`; tiket Menu (#35), Karyawan/Perangkat (#36), dst.
 * mengganti pemeriksanya di sini.
 */
const PEMERIKSA: Record<LangkahSiapJualan, (tx: TxDb, o: BarisOutlet) => Promise<boolean>> = {
  profil_outlet: async (_tx, o) => Boolean(o.alamat) && (o.jamBuka?.length ?? 0) > 0,
  profil_pajak: async (tx, o) => (await profilPajakBerlaku(tx, o.id, hariIni())) !== undefined,
  menu: async () => false,
  stasiun: async () => false,
  metode_bayar: async () => false,
  meja: async () => false,
  karyawan: (tx, o) => adaKaryawanSiap(tx, o.id),
  perangkat: (tx, o) => adaPerangkatAktif(tx, o.id),
};

export async function hitungSiapJualan(tx: TxDb, o: BarisOutlet) {
  const dilewati = new Set(
    (await tx.select({ langkah: siapJualanDilewati.langkah }).from(siapJualanDilewati).where(eq(siapJualanDilewati.outletId, o.id))).map(
      (r) => r.langkah,
    ),
  );
  const langkah = [];
  for (const nama of LANGKAH_SIAP_JUALAN) {
    const selesai = await PEMERIKSA[nama](tx, o);
    langkah.push({
      langkah: nama,
      status: selesai ? 'selesai' : dilewati.has(nama) ? 'dilewati' : 'belum',
      wajibUntukKasir: WAJIB_UNTUK_KASIR.includes(nama),
    } as const);
  }
  const kurangUntukKasir = langkah.filter((l) => l.wajibUntukKasir && l.status !== 'selesai').map((l) => l.langkah);
  return {
    selesai: langkah.filter((l) => l.status === 'selesai').length,
    total: langkah.length,
    langkah,
    kasir: { siap: kurangUntukKasir.length === 0, wajib: WAJIB_UNTUK_KASIR, kurang: kurangUntukKasir },
  };
}

function sisaHari(berakhir: Date, sekarang = new Date()): number {
  return Math.max(0, Math.ceil((berakhir.getTime() - sekarang.getTime()) / (24 * 60 * 60 * 1000)));
}

@Controller()
@UseGuards(SesiGuard)
export class DashboardController {
  constructor(private readonly db: Database) {}

  /** Dashboard: sisa Masa Coba dan checklist Siap Jualan per Outlet. */
  @Get('dashboard')
  @PerluIzin('dashboard.lihat')
  async dashboard() {
    const tx = this.db.tenant();
    const [t] = await tx.select().from(tenant);
    const daftarOutlet = await tx.select().from(outlet).orderBy(asc(outlet.createdAt), asc(outlet.id));
    const hasilOutlet = [];
    for (const o of daftarOutlet) hasilOutlet.push({ id: o.id, nama: o.nama, siapJualan: await hitungSiapJualan(tx, o) });
    return {
      tenant: { id: t!.id, nama: t!.nama },
      masaCoba: t!.masaCobaBerakhirPada
        ? { paketLangganan: 'Pro', berakhirPada: t!.masaCobaBerakhirPada, sisaHari: sisaHari(t!.masaCobaBerakhirPada) }
        : null,
      outlet: hasilOutlet,
    };
  }

  @Get('outlet/:id/siap-jualan')
  @PerluIzin('dashboard.lihat', { outletParam: 'id' })
  async siapJualan(@Param('id') id: string) {
    return hitungSiapJualan(this.db.tenant(), await this.outlet(id));
  }

  /** Lewati satu langkah. Langkah tetap dihitung selesai begitu datanya ada. */
  @Post('outlet/:id/siap-jualan/:langkah/lewati')
  @HttpCode(200)
  @PerluIzin('outlet.ubah', { outletParam: 'id' })
  async lewati(@Param('id') id: string, @Param('langkah') langkah: string) {
    const o = await this.outlet(id);
    const tx = this.db.tenant();
    await tx
      .insert(siapJualanDilewati)
      .values({ tenantId: o.tenantId, outletId: o.id, langkah: langkahValid(langkah) })
      .onConflictDoNothing();
    return hitungSiapJualan(tx, o);
  }

  @Delete('outlet/:id/siap-jualan/:langkah/lewati')
  @PerluIzin('outlet.ubah', { outletParam: 'id' })
  async batalLewati(@Param('id') id: string, @Param('langkah') langkah: string) {
    const o = await this.outlet(id);
    const tx = this.db.tenant();
    await tx
      .delete(siapJualanDilewati)
      .where(and(eq(siapJualanDilewati.outletId, o.id), eq(siapJualanDilewati.langkah, langkahValid(langkah))));
    return hitungSiapJualan(tx, o);
  }

  private async outlet(id: string): Promise<BarisOutlet> {
    const [o] = await this.db.tenant().select().from(outlet).where(eq(outlet.id, id));
    if (!o) throw tidakDitemukan('Outlet');
    return o;
  }
}

function langkahValid(v: string): LangkahSiapJualan {
  if (!(LANGKAH_SIAP_JUALAN as readonly string[]).includes(v)) throw tidakValid('langkah', 'Langkah Siap Jualan tidak dikenal.');
  return v as LangkahSiapJualan;
}

@Module({ controllers: [DashboardController] })
export class DashboardModule {}
