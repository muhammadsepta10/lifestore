export interface KonfigurasiApi {
  /** URL Postgres untuk peran aplikasi (tanpa BYPASSRLS). Bukan URL pemilik/migrasi. */
  databaseUrl: string;
}

export const KONFIGURASI_API = Symbol('KONFIGURASI_API');

export function konfigurasiDariEnv(env: NodeJS.ProcessEnv = process.env): KonfigurasiApi {
  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL wajib diisi (URL peran aplikasi Postgres).');
  return { databaseUrl };
}
