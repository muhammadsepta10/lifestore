import pg from 'pg';
import { ADMIN_SERVER_URL, PERAN_API_TES, SANDI_PERAN_API_TES } from './lingkungan';

/**
 * Dijalankan sekali sebelum semua suite: memastikan server Postgres bisa dihubungi dan
 * peran login API untuk tes ada. Peran berlaku untuk seluruh server, jadi dibuat di sini,
 * bukan per suite. Aman dijalankan bersamaan oleh beberapa proses tes.
 */
export default async function setup(): Promise<void> {
  const client = new pg.Client({ connectionString: ADMIN_SERVER_URL });
  try {
    await client.connect();
  } catch (err) {
    throw new Error(
      `Tes API butuh Postgres di ${ADMIN_SERVER_URL} (atur TEST_DATABASE_URL). Gagal terhubung: ${(err as Error).message}`,
    );
  }
  try {
    await abaikanJikaSudahAda(client, 'CREATE ROLE lifestore_app NOLOGIN NOSUPERUSER NOBYPASSRLS');
    await abaikanJikaSudahAda(
      client,
      `CREATE ROLE ${PERAN_API_TES} LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE PASSWORD '${SANDI_PERAN_API_TES}'`,
    );
    await client.query(`GRANT lifestore_app TO ${PERAN_API_TES}`);
  } finally {
    await client.end();
  }
}

async function abaikanJikaSudahAda(client: pg.Client, sql: string): Promise<void> {
  try {
    await client.query(sql);
  } catch (err) {
    const code = (err as { code?: string }).code;
    // 42710 duplicate_object; 23505 bila dua proses membuat peran yang sama bersamaan.
    if (code !== '42710' && code !== '23505') throw err;
  }
}
