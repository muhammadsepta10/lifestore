import { AsyncLocalStorage } from 'node:async_hooks';
import { Injectable, type OnApplicationShutdown } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import type { KonteksTenant } from './konteks-tenant';
import * as schema from './schema';

export type Db = NodePgDatabase<typeof schema>;
/** Transaksi Drizzle; API query-nya sama seperti `Db`. */
export type TxDb = Parameters<Parameters<Db['transaction']>[0]>[0];

export class TanpaKonteksTenantError extends Error {
  constructor() {
    super(
      'Akses tabel milik Tenant di luar transaksi Tenant. Pastikan request punya konteksTenant ' +
        '(diisi guard autentikasi) atau bungkus pekerjaan latar dengan Database.denganTenant().',
    );
  }
}

/** Akses database API. Terhubung sebagai peran aplikasi (tanpa BYPASSRLS). */
@Injectable()
export class Database implements OnApplicationShutdown {
  readonly pool: pg.Pool;
  /** Untuk tabel global (tanpa `tenant_id`). Tabel milik Tenant selalu lewat `tenant()`. */
  readonly global: Db;
  private readonly transaksiAktif = new AsyncLocalStorage<TxDb>();

  constructor(databaseUrl: string) {
    this.pool = new pg.Pool({ connectionString: databaseUrl });
    this.global = drizzle(this.pool, { schema, casing: 'snake_case' });
  }

  /**
   * Transaksi Tenant yang sedang berjalan (dibuka interceptor per request atau `denganTenant`).
   * Melempar error bila tidak ada, supaya tabel milik Tenant tidak pernah diakses tanpa isolasi.
   */
  tenant(): TxDb {
    const tx = this.transaksiAktif.getStore();
    if (!tx) throw new TanpaKonteksTenantError();
    return tx;
  }

  /**
   * Menjalankan `fn` di satu transaksi yang memasang `app.tenant_id` dan `app.outlet_id`.
   * Setting bersifat lokal-transaksi, jadi tidak bocor ke request lain yang memakai koneksi yang sama.
   */
  async denganTenant<T>(konteks: KonteksTenant, fn: (tx: TxDb) => Promise<T>): Promise<T> {
    return this.global.transaction(async (tx) => {
      await tx.execute(
        sql`select set_config('app.tenant_id', ${konteks.tenantId}, true), set_config('app.outlet_id', ${konteks.outletId ?? ''}, true)`,
      );
      return this.transaksiAktif.run(tx, () => fn(tx));
    });
  }

  async sehat(): Promise<boolean> {
    try {
      await this.global.execute(sql`select 1`);
      return true;
    } catch {
      return false;
    }
  }

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}
