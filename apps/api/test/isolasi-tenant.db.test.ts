import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buatDatabaseTes, type DatabaseTes } from './support/database-tes';

// Tes langsung ke database (ADR 0001): ini satu-satunya tempat tes boleh memakai SQL,
// karena yang dibuktikan adalah perilaku database itu sendiri.

const TENANT_A = '00000000-0000-4000-8000-00000000000a';
const TENANT_B = '00000000-0000-4000-8000-00000000000b';

describe('Isolasi Tenant di database', () => {
  let db: DatabaseTes;
  let app: pg.Pool;

  beforeAll(async () => {
    db = await buatDatabaseTes();
    app = new pg.Pool({ connectionString: db.appUrl, max: 2 });
    await db.admin.query(`INSERT INTO tenant (id, nama) VALUES ($1, 'Warung A'), ($2, 'Warung B')`, [TENANT_A, TENANT_B]);
    await db.admin.query(`INSERT INTO merek (tenant_id, nama) VALUES ($1, 'Merek A'), ($2, 'Merek B')`, [TENANT_A, TENANT_B]);
  });
  afterAll(async () => {
    await app?.end();
    await db?.hapus();
  });

  async function sebagaiTenant<T>(tenantId: string, fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
    const c = await app.connect();
    try {
      await c.query('BEGIN');
      await c.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenantId]);
      const hasil = await fn(c);
      await c.query('COMMIT');
      return hasil;
    } catch (err) {
      await c.query('ROLLBACK');
      throw err;
    } finally {
      c.release();
    }
  }

  it('peran database aplikasi bukan superuser dan tidak punya BYPASSRLS', async () => {
    const { rows } = await app.query(
      'SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user',
    );
    expect(rows).toEqual([{ rolsuper: false, rolbypassrls: false }]);
  });

  it('query tanpa setting tenant_id tidak mengembalikan baris apa pun di tabel milik Tenant', async () => {
    expect((await app.query('SELECT * FROM merek')).rows).toEqual([]);
    expect((await app.query('SELECT * FROM tenant')).rows).toEqual([]);
  });

  it('dengan tenant_id terpasang hanya baris Tenant itu yang terlihat', async () => {
    const merek = await sebagaiTenant(TENANT_A, async (c) => (await c.query('SELECT nama FROM merek')).rows);
    expect(merek).toEqual([{ nama: 'Merek A' }]);
    const tenant = await sebagaiTenant(TENANT_B, async (c) => (await c.query('SELECT nama FROM tenant')).rows);
    expect(tenant).toEqual([{ nama: 'Warung B' }]);
  });

  it('setting tenant_id hanya berlaku di dalam transaksinya', async () => {
    await sebagaiTenant(TENANT_A, async () => undefined);
    expect((await app.query('SELECT * FROM merek')).rows).toEqual([]);
  });

  it('Tenant tidak bisa menulis, mengubah, atau menghapus baris milik Tenant lain', async () => {
    await expect(
      sebagaiTenant(TENANT_A, (c) => c.query(`INSERT INTO merek (tenant_id, nama) VALUES ($1, 'Selundupan')`, [TENANT_B])),
    ).rejects.toMatchObject({ code: '42501' });

    const diubah = await sebagaiTenant(TENANT_A, (c) => c.query(`UPDATE merek SET nama = 'Diretas' WHERE tenant_id = $1`, [TENANT_B]));
    const dihapus = await sebagaiTenant(TENANT_A, (c) => c.query(`DELETE FROM merek WHERE tenant_id = $1`, [TENANT_B]));
    expect([diubah.rowCount, dihapus.rowCount]).toEqual([0, 0]);
    const { rows } = await db.admin.query(`SELECT nama FROM merek WHERE tenant_id = $1`, [TENANT_B]);
    expect(rows).toEqual([{ nama: 'Merek B' }]);
  });

  it('setiap tabel ber-tenant_id memakai RLS yang dipaksa dan punya kebijakan', async () => {
    // Penjaga untuk tiket berikutnya: tabel milik Tenant baru tanpa RLS akan membuat tes ini gagal.
    const { rows } = await db.admin.query<{ tabel: string; rls: boolean; dipaksa: boolean; kebijakan: number }>(`
      SELECT c.relname AS tabel, c.relrowsecurity AS rls, c.relforcerowsecurity AS dipaksa,
             (SELECT count(*)::int FROM pg_policy p WHERE p.polrelid = c.oid) AS kebijakan
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
      WHERE c.relkind = 'r'
        AND (c.relname = 'tenant' OR EXISTS (
          SELECT 1 FROM pg_attribute a WHERE a.attrelid = c.oid AND a.attname = 'tenant_id' AND NOT a.attisdropped))
      ORDER BY c.relname`);
    expect(rows.length).toBeGreaterThanOrEqual(2);
    for (const r of rows) expect({ ...r, kebijakan: r.kebijakan > 0 }).toEqual({ tabel: r.tabel, rls: true, dipaksa: true, kebijakan: true });
  });
});
