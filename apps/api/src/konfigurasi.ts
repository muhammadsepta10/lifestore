export interface KonfigurasiApi {
  /** URL Postgres untuk peran aplikasi (tanpa BYPASSRLS). Bukan URL pemilik/migrasi. */
  databaseUrl: string;
  /** Alamat publik web (untuk tautan di email). Default http://localhost:8080. */
  urlWeb?: string;
  /** Kunci API Resend. Bila kosong, email hanya ditulis ke log (pengembangan lokal). */
  resendApiKey?: string;
  /** Alamat pengirim email, misal "Lifestore <halo@lifestore.id>". */
  emailPengirim?: string;
}

export const KONFIGURASI_API = Symbol('KONFIGURASI_API');

export function konfigurasiDariEnv(env: NodeJS.ProcessEnv = process.env): KonfigurasiApi {
  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL wajib diisi (URL peran aplikasi Postgres).');
  return {
    databaseUrl,
    urlWeb: env.WEB_URL,
    resendApiKey: env.RESEND_API_KEY || undefined,
    emailPengirim: env.EMAIL_PENGIRIM,
  };
}
