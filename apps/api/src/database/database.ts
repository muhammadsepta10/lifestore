import { Injectable, type OnApplicationShutdown } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema';

export type Db = NodePgDatabase<typeof schema>;

/** Akses database API. Terhubung sebagai peran aplikasi (tanpa BYPASSRLS). */
@Injectable()
export class Database implements OnApplicationShutdown {
  readonly pool: pg.Pool;
  /** Untuk tabel global (tanpa `tenant_id`). Tabel milik Tenant selalu lewat transaksi Tenant. */
  readonly global: Db;

  constructor(databaseUrl: string) {
    this.pool = new pg.Pool({ connectionString: databaseUrl });
    this.global = drizzle(this.pool, { schema });
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
