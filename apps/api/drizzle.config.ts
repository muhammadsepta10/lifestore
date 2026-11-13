import { defineConfig } from 'drizzle-kit';

// `pnpm db:generate` membandingkan skema dengan snapshot di folder drizzle/meta
// dan menulis migrasi SQL baru. Tidak butuh koneksi database.
// Migrasi custom (RLS, peran, grant): `pnpm --filter @lifestore/api exec drizzle-kit generate --custom --name <nama>`.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/database/schema.ts',
  out: './drizzle',
  casing: 'snake_case',
});
