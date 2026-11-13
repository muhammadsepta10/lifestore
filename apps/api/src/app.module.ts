import { type DynamicModule, Module } from '@nestjs/common';
import { DatabaseModule } from './database/database.module';
import { KesehatanModule } from './kesehatan/kesehatan.module';
import { KONFIGURASI_API, type KonfigurasiApi } from './konfigurasi';

@Module({})
export class AppModule {
  static register(konfigurasi: KonfigurasiApi): DynamicModule {
    return {
      module: AppModule,
      imports: [DatabaseModule.register(konfigurasi), KesehatanModule],
      providers: [{ provide: KONFIGURASI_API, useValue: konfigurasi }],
    };
  }
}
