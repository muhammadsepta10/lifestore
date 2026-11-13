import { type DynamicModule, Global, Module } from '@nestjs/common';
import type { KonfigurasiApi } from '../konfigurasi';
import { Database } from './database';

@Global()
@Module({})
export class DatabaseModule {
  static register(konfigurasi: KonfigurasiApi): DynamicModule {
    return {
      module: DatabaseModule,
      providers: [{ provide: Database, useFactory: () => new Database(konfigurasi.databaseUrl) }],
      exports: [Database],
    };
  }
}
