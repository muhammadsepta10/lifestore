import { Module } from '@nestjs/common';
import { KaryawanModule } from '../karyawan/karyawan.module';
import { KendaliController, LaciController } from './kendali.controller';
import { PembayaranController } from './pembayaran.controller';
import { PenjualanDashboardController } from './penjualan-dashboard.controller';
import { PesananController } from './pesanan.controller';
import { AturTagihanController } from './atur-tagihan.controller';
import { TagihanController } from './tagihan.controller';

/** Penjualan dari kasir: Tagihan, Pesanan dengan Item Pesanan, dan Pembayaran sampai Nomor Nota. */
@Module({
  imports: [KaryawanModule],
  controllers: [TagihanController, PesananController, PembayaranController, KendaliController, LaciController, AturTagihanController, PenjualanDashboardController],
})
export class PenjualanModule {}
