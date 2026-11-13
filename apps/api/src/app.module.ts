import { type DynamicModule, Module } from '@nestjs/common';
import { AuditModule } from './audit/audit.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { DatabaseModule } from './database/database.module';
import { EmailModule } from './email/email.module';
import { IdentitasModule } from './identitas/identitas.module';
import { KesehatanModule } from './kesehatan/kesehatan.module';
import type { KonfigurasiApi } from './konfigurasi';
import { PajakModule } from './pajak/pajak.module';
import { UsahaModule } from './usaha/usaha.module';

@Module({})
export class AppModule {
  static register(konfigurasi: KonfigurasiApi): DynamicModule {
    return {
      module: AppModule,
      imports: [
        DatabaseModule.register(konfigurasi),
        EmailModule,
        AuditModule,
        KesehatanModule,
        IdentitasModule,
        UsahaModule,
        PajakModule,
        DashboardModule,
      ],
    };
  }
}
