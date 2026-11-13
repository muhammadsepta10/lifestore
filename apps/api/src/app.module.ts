import { type DynamicModule, Module } from '@nestjs/common';
import { AuditModule } from './audit/audit.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { DatabaseModule } from './database/database.module';
import { EmailModule } from './email/email.module';
import { IdentitasModule } from './identitas/identitas.module';
import { KaryawanModule } from './karyawan/karyawan.module';
import { KasirModule } from './kasir/kasir.module';
import { KesehatanModule } from './kesehatan/kesehatan.module';
import { MejaModule } from './meja/meja.module';
import { MetodeBayarModule } from './pembayaran/metode-bayar.module';
import { MenuModule } from './menu/menu.module';
import type { KonfigurasiApi } from './konfigurasi';
import { PajakModule } from './pajak/pajak.module';
import { PenjualanModule } from './penjualan/penjualan.module';
import { ShiftModule } from './shift/shift.module';
import { JamModule } from './umum/jam';
import { UsahaModule } from './usaha/usaha.module';

@Module({})
export class AppModule {
  static register(konfigurasi: KonfigurasiApi): DynamicModule {
    return {
      module: AppModule,
      imports: [
        DatabaseModule.register(konfigurasi),
        JamModule,
        EmailModule,
        AuditModule,
        KesehatanModule,
        IdentitasModule,
        UsahaModule,
        PajakModule,
        MenuModule,
        DashboardModule,
        KaryawanModule,
        MejaModule,
        MetodeBayarModule,
        ShiftModule,
        KasirModule,
        PenjualanModule,
      ],
    };
  }
}
