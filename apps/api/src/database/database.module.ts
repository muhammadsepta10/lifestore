import { type DynamicModule, Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { KONFIGURASI_API, type KonfigurasiApi } from '../konfigurasi';
import { Database } from './database';
import { TransaksiTenantInterceptor } from './transaksi-tenant.interceptor';

@Global()
@Module({})
export class DatabaseModule {
  static register(konfigurasi: KonfigurasiApi): DynamicModule {
    return {
      module: DatabaseModule,
      providers: [
        { provide: KONFIGURASI_API, useValue: konfigurasi },
        { provide: Database, useFactory: () => new Database(konfigurasi.databaseUrl) },
        { provide: APP_INTERCEPTOR, useClass: TransaksiTenantInterceptor },
      ],
      exports: [Database, KONFIGURASI_API],
    };
  }
}
