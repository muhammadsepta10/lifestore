import { jalankanMigrasi } from './migrate';

const adminUrl = process.env.DATABASE_ADMIN_URL;
if (!adminUrl) {
  console.error('DATABASE_ADMIN_URL wajib diisi (URL pemilik skema, bukan peran aplikasi).');
  process.exit(1);
}

jalankanMigrasi(adminUrl).then(
  () => console.log('Migrasi selesai.'),
  (err: unknown) => {
    console.error('Migrasi gagal:', err);
    process.exit(1);
  },
);
