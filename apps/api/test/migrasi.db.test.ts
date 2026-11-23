import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buatDatabaseTes, type DatabaseTes } from './support/database-tes';

const jalankan = promisify(execFile);
const ROOT_API = path.resolve(__dirname, '..');

// Migrasi dijalankan dengan perintah terpisah (ADR 0005), bukan saat API menyala.
describe('Perintah migrasi', () => {
  let db: DatabaseTes;
  beforeAll(async () => {
    db = await buatDatabaseTes({ migrasi: false });
  });
  afterAll(() => db?.hapus());

  async function migrasi() {
    return jalankan('pnpm', ['run', '--silent', 'db:migrate'], {
      cwd: ROOT_API,
      env: { ...process.env, DATABASE_ADMIN_URL: db.adminUrl },
    });
  }

  it('pnpm db:migrate menjalankan migrasi SQL ter-commit dan aman diulang', async () => {
    const sebelum = await db.admin.query(`SELECT to_regclass('public.merek') AS tabel`);
    expect(sebelum.rows).toEqual([{ tabel: null }]);

    await migrasi();
    await migrasi();

    const sesudah = await db.admin.query(`SELECT to_regclass('public.merek')::text AS tabel`);
    expect(sesudah.rows).toEqual([{ tabel: 'merek' }]);
  });
});
