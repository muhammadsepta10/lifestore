import path from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';

/** Folder migrasi SQL ter-commit (`apps/api/drizzle`), sama dari `src/` maupun `dist/`. */
export const FOLDER_MIGRASI = path.resolve(__dirname, '../../drizzle');

/**
 * Menjalankan semua migrasi SQL yang belum dijalankan. Dipanggil lewat perintah terpisah
 * (`pnpm db:migrate`), tidak pernah otomatis saat API menyala (ADR 0005).
 * `adminUrl` adalah URL pemilik skema, bukan peran aplikasi.
 */
export async function jalankanMigrasi(adminUrl: string): Promise<void> {
  const client = new pg.Client({ connectionString: adminUrl });
  await client.connect();
  try {
    await migrate(drizzle(client), { migrationsFolder: FOLDER_MIGRASI });
  } finally {
    await client.end();
  }
}
