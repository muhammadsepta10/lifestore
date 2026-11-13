import { Module } from '@nestjs/common';
import { KaryawanModule } from '../karyawan/karyawan.module';
import { PembayaranController } from './pembayaran.controller';
import { PesananController } from './pesanan.controller';
import { TagihanController } from './tagihan.controller';

/** Penjualan dari kasir: Tagihan, Pesanan dengan Item Pesanan, dan Pembayaran sampai Nomor Nota. */
@Module({
  imports: [KaryawanModule],
  controllers: [TagihanController, PesananController, PembayaranController],
})
export class PenjualanModule {}
