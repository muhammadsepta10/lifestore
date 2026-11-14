import { Controller, Get, Module, UseGuards } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { Database } from '../database/database';
import { anggota, outlet, pengguna } from '../database/schema';
import { daftarIzin, type Pelaku, PelakuAktif, PerluIzin } from '../izin/izin';
import { KaryawanModule } from '../karyawan/karyawan.module';
import { Perangkat, type PerangkatAktif, PerangkatGuard } from '../karyawan/perangkat';
import { metodeBayarAktif } from '../pembayaran/metode-bayar.module';
import { shiftTerbuka } from '../shift/shift.module';

/** Layar kasir di Perangkat Terdaftar. */
@Controller('kasir')
@UseGuards(PerangkatGuard)
export class KasirController {
  constructor(private readonly db: Database) {}

  /**
   * Buka kasir: butuh Anggota yang masuk dengan PIN dan izin `kasir.buka` di Outlet perangkat.
   * Memuat semua yang dibutuhkan kerangka layar: perangkat, Outlet, Anggota aktif dan izinnya,
   * status Shift perangkat ini (tanpa angka sistem), dan Metode Bayar aktif.
   */
  @Get()
  @PerluIzin('kasir.buka')
  async kasir(@Perangkat() p: PerangkatAktif, @PelakuAktif() pelaku: Pelaku) {
    const tx = this.db.tenant();
    const [o] = await tx.select().from(outlet).where(eq(outlet.id, p.outletId));
    const [a] = await tx
      .select({ nama: anggota.nama, email: pengguna.email })
      .from(anggota)
      .leftJoin(pengguna, eq(pengguna.id, anggota.penggunaId))
      .where(eq(anggota.id, pelaku.anggotaId));
    return {
      perangkat: { id: p.id, nama: p.nama, awalan: p.awalan },
      /** Termasuk aturan Pembulatan Tunai dan bayar-dulu, supaya kasir menampilkan jumlah tunai yang benar. */
      outlet: o
        ? {
            id: o.id,
            nama: o.nama,
            pembulatanTunai: o.pembulatanTunaiKelipatan && o.pembulatanTunaiArah ? { kelipatan: o.pembulatanTunaiKelipatan, arah: o.pembulatanTunaiArah } : null,
            bayarDulu: o.bayarDulu,
          }
        : undefined,
      anggota: { id: pelaku.anggotaId, nama: a?.nama ?? a?.email ?? '', peran: pelaku.peran },
      izin: daftarIzin(pelaku, p.outletId),
      shift: await shiftTerbuka(tx, p.id),
      metodeBayar: await metodeBayarAktif(tx, p.outletId),
    };
  }
}

@Module({
  imports: [KaryawanModule],
  controllers: [KasirController],
})
export class KasirModule {}
