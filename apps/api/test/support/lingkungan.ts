/**
 * Alamat server Postgres untuk tes. Harus superuser (atau punya CREATEDB + CREATEROLE)
 * karena tiap suite membuat database sendiri. Default: Postgres lokal tanpa kata sandi.
 */
export const ADMIN_SERVER_URL = process.env.TEST_DATABASE_URL ?? 'postgres://postgres@localhost:5432/postgres';

/**
 * Peran login yang dipakai API saat tes. Anggota peran grup `lifestore_app`
 * (dibuat migrasi), tanpa SUPERUSER dan tanpa BYPASSRLS, sama seperti di production.
 */
export const PERAN_API_TES = 'lifestore_api_test';
export const SANDI_PERAN_API_TES = 'lifestore_test';

/** Ganti nama database (dan opsional pengguna) pada URL Postgres. */
export function urlUntuk(dasar: string, opsi: { database: string; user?: string; password?: string }): string {
  const url = new URL(dasar);
  url.pathname = `/${opsi.database}`;
  if (opsi.user !== undefined) url.username = opsi.user;
  if (opsi.password !== undefined) url.password = opsi.password;
  return url.toString();
}
