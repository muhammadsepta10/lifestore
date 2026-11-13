# Lifestore

SaaS manajemen restoran multi-tenant untuk pasar Indonesia. Istilah domain ada di [CONTEXT.md](CONTEXT.md), keputusan arsitektur di [docs/adr](docs/adr).

## Struktur

| Folder | Isi |
| --- | --- |
| `apps/api` | API NestJS (REST `/v1`), Drizzle, migrasi SQL di `apps/api/drizzle` |
| `apps/web` | Next.js: dashboard, kasir PWA, KDS |
| `packages/domain` | Aturan bisnis murni tanpa I/O (misal **Hitung Tagihan**) |
| `packages/ui` | Token desain v3 (`@lifestore/ui/tokens.css`) |

Butuh Node 22 dan pnpm 10 (`corepack enable`).

## Stack lokal

```sh
pnpm stack:up     # build + nyalakan Postgres, api, web, Caddy, lalu jalankan migrasi
# buka http://localhost:8080 (status API tampil di halaman)
pnpm stack:down
```

Migrasi selalu perintah terpisah (ADR 0005):

```sh
DATABASE_ADMIN_URL=postgres://<pemilik>@<host>/<db> pnpm db:migrate   # tanpa Docker
docker compose --profile tools run --rm migrate                         # dengan Docker
```

## Menjalankan tes

```sh
pnpm check        # lint + typecheck + tes (pengganti CI, wajib lulus sebelum deploy)
pnpm test         # tes saja, semua paket
pnpm --filter @lifestore/domain test          # Hitung Tagihan (tanpa database)
pnpm --filter @lifestore/api test             # seam HTTP terhadap Postgres sungguhan
pnpm --filter @lifestore/api exec vitest run test/kesehatan.e2e.test.ts   # satu file
```

Tes `api` butuh server Postgres 16 dengan akses superuser. Default `postgres://postgres@localhost:5432/postgres`; ganti lewat `TEST_DATABASE_URL`. Setiap file tes membuat database baru, menjalankan migrasi sungguhan, dan menyalakan aplikasi NestJS penuh yang terhubung sebagai peran tanpa BYPASSRLS, lalu menghapus database itu di akhir.

UI tidak punya suite tes yang dipelihara. Sebelum deploy, jalankan skrip Playwright manual alur kasir (buka Shift → Tagihan bawa pulang → Pesanan → bayar tunai → struk → Laporan Shift) di browser sungguhan:

```bash
PW_CHANNEL=chrome bash scripts/manual/jalankan-alur-kasir.sh   # butuh paket `playwright` (global boleh)
```

Menulis tes API baru:

```ts
import { buatDuniaTes, type DuniaTes } from './support/dunia-tes';

let dunia: DuniaTes;
beforeAll(async () => { dunia = await buatDuniaTes(); });
afterAll(() => dunia?.tutup());

it('…', async () => {
  await dunia.http.get('/v1/health').expect(200);
});
```

Tes memeriksa perilaku lewat HTTP dan memakai istilah glosarium. SQL langsung hanya untuk tes perilaku database itu sendiri (misal RLS, `*.db.test.ts`).
