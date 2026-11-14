import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { jalankanMigrasi } from '../../src/database/migrate';
import { ADMIN_SERVER_URL, PERAN_API_TES, SANDI_PERAN_API_TES, urlUntuk } from './lingkungan';

/**
 * Database baru untuk satu suite, sudah dimigrasi dengan migrasi SQL sungguhan.
 *
 * - `admin`: koneksi superuser ke database ini. Hanya untuk tes langsung ke database
 *   (misal membuktikan RLS); tes perilaku memakai HTTP lewat `DuniaTes`.
 * - `appUrl`: URL untuk peran aplikasi (tanpa BYPASSRLS), dipakai API.
 */
export interface DatabaseTes {
  nama: string;
  adminUrl: string;
  appUrl: string;
  admin: pg.Pool;
  hapus(): Promise<void>;
}

export async function buatDatabaseTes(opsi: { migrasi?: boolean } = {}): Promise<DatabaseTes> {
  const nama = `lifestore_tes_${Date.now().toString(36)}_${randomBytes(4).toString('hex')}`;
  await denganServer((c) => c.query(`CREATE DATABASE ${nama}`));

  const adminUrl = urlUntuk(ADMIN_SERVER_URL, { database: nama });
  const appUrl = urlUntuk(ADMIN_SERVER_URL, { database: nama, user: PERAN_API_TES, password: SANDI_PERAN_API_TES });
  if (opsi.migrasi !== false) await jalankanMigrasi(adminUrl);

  const admin = new pg.Pool({ connectionString: adminUrl, max: 2 });
  return {
    nama,
    adminUrl,
    appUrl,
    admin,
    async hapus() {
      await admin.end();
      await hapusDatabase(nama);
    },
  };
}

/**
 * Hapus database setelah koneksi API tertutup. Koneksi yang baru saja diakhiri pool bisa masih
 * menutup soketnya; FORCE langsung akan memutusnya dan memunculkan error tak tertangani di proses
 * tes. Jadi tunggu dulu sebentar, baru FORCE sebagai jalan terakhir.
 */
async function hapusDatabase(nama: string): Promise<void> {
  for (let i = 0; i < 40; i++) {
    try {
      await denganServer((c) => c.query(`DROP DATABASE IF EXISTS ${nama}`));
      return;
    } catch (err) {
      if ((err as { code?: string }).code !== '55006') throw err; // object_in_use
      await new Promise((r) => setTimeout(r, 50));
    }
  }
  await denganServer((c) => c.query(`DROP DATABASE IF EXISTS ${nama} WITH (FORCE)`));
}

async function denganServer<T>(fn: (c: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: ADMIN_SERVER_URL });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}
