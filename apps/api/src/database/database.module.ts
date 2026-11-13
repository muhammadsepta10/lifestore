import { type DynamicModule, Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import type { KonfigurasiApi } from '../konfigurasi';
import { Database } from './database';
import { TransaksiTenantInterceptor } from './transaksi-tenant.interceptor';

@Global()
@Module({})
export class DatabaseModule {
  static register(konfigurasi: KonfigurasiApi): DynamicModule {
    return {
      module: DatabaseModule,
      providers: [
        { provide: Database, useFactory: () => new Database(konfigurasi.databaseUrl) },
        { provide: APP_INTERCEPTOR, useClass: TransaksiTenantInterceptor },
      ],
      exports: [Database],
    };
  }
}
