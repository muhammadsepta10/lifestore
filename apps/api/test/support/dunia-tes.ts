import type { INestApplication, Type } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import supertest from 'supertest';
import { AppModule } from '../../src/app.module';
import { konfigurasiAplikasi } from '../../src/aplikasi';
import { buatDatabaseTes, type DatabaseTes } from './database-tes';

/**
 * "Dunia tes": aplikasi NestJS penuh di atas database baru yang sudah dimigrasi,
 * terhubung sebagai peran aplikasi tanpa BYPASSRLS (RLS aktif).
 *
 * Satu dunia per suite (file tes): buat di `beforeAll`, tutup di `afterAll`.
 * Tiket berikutnya menambah langkah cerita di sini (misal `daftarTenant`, `buatOutlet`)
 * yang menyiapkan data LEWAT API, bukan insert langsung, supaya tes terbaca seperti cerita.
 */
export interface DuniaTes {
  app: INestApplication;
  /** Klien HTTP ke aplikasi (supertest). */
  http: ReturnType<typeof supertest>;
  db: DatabaseTes;
  tutup(): Promise<void>;
}

export interface OpsiDuniaTes {
  /** Modul tambahan khusus tes (misal controller penguji). */
  modulTambahan?: Type[];
}

export async function buatDuniaTes(opsi: OpsiDuniaTes = {}): Promise<DuniaTes> {
  const db = await buatDatabaseTes();
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule.register({ databaseUrl: db.appUrl }), ...(opsi.modulTambahan ?? [])],
  }).compile();
  const app = moduleRef.createNestApplication({ logger: false });
  konfigurasiAplikasi(app);
  await app.init();

  return {
    app,
    http: supertest(app.getHttpServer()),
    db,
    async tutup() {
      await app.close();
      await db.hapus();
    },
  };
}
