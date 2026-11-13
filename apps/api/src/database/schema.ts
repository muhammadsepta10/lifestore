/**
 * Skema Drizzle. Sumber untuk `pnpm db:generate`, yang menulis migrasi SQL ke `apps/api/drizzle/`.
 * Migrasi SQL yang ter-commit adalah kebenaran; kebijakan RLS ditulis di migrasi custom.
 *
 * Konvensi:
 * - Nama tabel = istilah glosarium (CONTEXT.md) dalam snake_case tunggal: `tenant`, `merek`, `item_pesanan`.
 * - Kolom teknis berbahasa Inggris (`id`, `tenant_id`, `created_at`); kolom domain memakai istilah glosarium.
 * - ID berupa UUID teks (bisa dibuat klien, siap offline/PowerSync, ADR 0003).
 * - Uang: bilangan bulat rupiah (`bigint` mode number).
 * - Setiap tabel milik Tenant: kolom `tenant_id` + RLS dipaksa + kebijakan `tenant_id = app_tenant_id()`.
 */
import { sql } from 'drizzle-orm';
import { bigint, boolean, date, index, integer, jsonb, numeric, pgTable, text, timestamp, unique, uniqueIndex } from 'drizzle-orm/pg-core';

const id = () =>
  text()
    .primaryKey()
    .default(sql`gen_random_uuid()::text`);

const createdAt = () => timestamp({ withTimezone: true }).notNull().defaultNow();

/** Kolom pemilik untuk setiap tabel milik Tenant. */
const tenantId = () =>
  text()
    .notNull()
    .references(() => tenant.id);

/** Tenant. Dilindungi RLS dengan `id = app_tenant_id()`. */
export const tenant = pgTable('tenant', {
  id: id(),
  nama: text().notNull(),
  /** Akhir Masa Coba (14 hari, semua fitur Pro). Null untuk Tenant lama sebelum kolom ini ada. */
  masaCobaBerakhirPada: timestamp({ withTimezone: true }),
  createdAt: createdAt(),
});

/** Merek. Setiap Tenant punya satu Merek default (`utama`). */
export const merek = pgTable(
  'merek',
  {
    id: id(),
    tenantId: tenantId(),
    nama: text().notNull(),
    utama: boolean().notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.tenantId)],
);

// ---------------------------------------------------------------------------
// Tabel global (tanpa tenant_id, tanpa RLS)
// ---------------------------------------------------------------------------

/** Pengguna: akun login global. Email disimpan huruf kecil. */
export const pengguna = pgTable('pengguna', {
  id: id(),
  email: text().notNull().unique(),
  hashKataSandi: text().notNull(),
  terverifikasiPada: timestamp({ withTimezone: true }),
  createdAt: createdAt(),
});

/** Token verifikasi email (disimpan sebagai hash) beserta data usaha yang diisi saat daftar. */
export const verifikasiEmail = pgTable('verifikasi_email', {
  id: id(),
  penggunaId: text()
    .notNull()
    .references(() => pengguna.id),
  hashToken: text().notNull().unique(),
  namaUsaha: text().notNull(),
  kota: text().notNull(),
  kedaluwarsaPada: timestamp({ withTimezone: true }).notNull(),
  dipakaiPada: timestamp({ withTimezone: true }),
  createdAt: createdAt(),
});

/**
 * Sesi dashboard Pengguna (token bearer, disimpan sebagai hash). `tenantAktifId` sengaja tidak
 * bernama `tenant_id`: sesi milik Pengguna (global), Tenant aktif hanya pilihan di dalamnya.
 */
export const sesi = pgTable('sesi', {
  id: id(),
  penggunaId: text()
    .notNull()
    .references(() => pengguna.id),
  hashToken: text().notNull().unique(),
  tenantAktifId: text(),
  kedaluwarsaPada: timestamp({ withTimezone: true }).notNull(),
  createdAt: createdAt(),
});

// ---------------------------------------------------------------------------
// Tabel milik Tenant (RLS)
// ---------------------------------------------------------------------------

/**
 * Anggota: keterlibatan seseorang di satu Tenant. Selain kebijakan Tenant, Pengguna boleh
 * MEMBACA baris Anggota miliknya sendiri (`app.pengguna_id`) untuk memilih Tenant setelah masuk.
 *
 * - `peran`: `pemilik` (semua izin di semua Outlet) atau `karyawan` (izin dari Peran di Penugasan).
 * - `penggunaId` kosong untuk karyawan khusus PIN, atau karyawan yang undangannya belum diterima.
 * - PIN disimpan sebagai hash; `pinSalah` dan `pinTerkunciSampai` mengatur kunci sementara.
 */
export const anggota = pgTable(
  'anggota',
  {
    id: id(),
    tenantId: tenantId(),
    penggunaId: text().references(() => pengguna.id),
    peran: text().notNull(),
    nama: text(),
    hashPin: text(),
    pinSalah: integer().notNull().default(0),
    pinTerkunciSampai: timestamp({ withTimezone: true }),
    aktif: boolean().notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex().on(t.tenantId, t.penggunaId), index().on(t.penggunaId)],
);

/** Jam buka satu hari; `hari` 1 = Senin … 7 = Minggu. */
export interface JamBukaHari {
  hari: number;
  buka: string;
  tutup: string;
}

export const outlet = pgTable(
  'outlet',
  {
    id: id(),
    tenantId: tenantId(),
    merekId: text()
      .notNull()
      .references(() => merek.id),
    nama: text().notNull(),
    alamat: text(),
    kota: text().notNull(),
    jamBuka: jsonb().$type<JamBukaHari[]>(),
    logoUrl: text(),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.tenantId), index().on(t.merekId)],
);

/**
 * Profil Pajak Outlet bertanggal berlaku. Setiap perubahan menambah baris baru; yang berlaku
 * pada suatu tanggal adalah baris dengan `berlakuMulai` terakhir yang ≤ tanggal itu.
 */
export const profilPajak = pgTable(
  'profil_pajak',
  {
    id: id(),
    tenantId: tenantId(),
    outletId: text()
      .notNull()
      .references(() => outlet.id),
    berlakuMulai: date({ mode: 'string' }).notNull(),
    jenis: text().$type<'PBJT' | 'PPN' | 'tidak_dipungut'>().notNull(),
    tarifPersen: numeric({ precision: 5, scale: 2, mode: 'number' }).notNull(),
    labelStruk: text().notNull(),
    serviceChargePersen: numeric({ precision: 5, scale: 2, mode: 'number' }).notNull().default(0),
    serviceChargeKanal: text().array().notNull().default(sql`ARRAY['dine_in']::text[]`),
    hargaTermasukPajak: boolean().notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.tenantId), index().on(t.outletId, t.berlakuMulai)],
);

/**
 * Log Audit append-only. Peran aplikasi hanya punya SELECT dan INSERT (UPDATE/DELETE dicabut
 * di migrasi). Ditulis hanya lewat `PenulisLogAudit`.
 */
export const logAudit = pgTable(
  'log_audit',
  {
    id: id(),
    tenantId: tenantId(),
    outletId: text(),
    aksi: text().notNull(),
    entitas: text().notNull(),
    entitasId: text().notNull(),
    penggunaId: text(),
    perangkatId: text(),
    sebelum: jsonb(),
    sesudah: jsonb(),
    alasan: text(),
    penyetujuAnggotaId: text(),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.tenantId, t.createdAt)],
);

/** Langkah Siap Jualan yang dilewati pemilik. Status selesai tetap dihitung dari data. */
export const siapJualanDilewati = pgTable(
  'siap_jualan_dilewati',
  {
    id: id(),
    tenantId: tenantId(),
    outletId: text()
      .notNull()
      .references(() => outlet.id),
    langkah: text().notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex().on(t.outletId, t.langkah), index().on(t.tenantId)],
);

/** Undangan karyawan lewat email. Token (hash) sekali pakai; diterima = Anggota terhubung ke Pengguna. */
export const undanganKaryawan = pgTable(
  'undangan_karyawan',
  {
    id: id(),
    tenantId: tenantId(),
    anggotaId: text()
      .notNull()
      .references(() => anggota.id),
    email: text().notNull(),
    hashToken: text().notNull().unique(),
    kedaluwarsaPada: timestamp({ withTimezone: true }).notNull(),
    diterimaPada: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.tenantId), index().on(t.anggotaId)],
);

/** Penugasan: Anggota boleh bekerja di Outlet ini dengan Peran bawaan ini. */
export const penugasan = pgTable(
  'penugasan',
  {
    id: id(),
    tenantId: tenantId(),
    anggotaId: text()
      .notNull()
      .references(() => anggota.id),
    outletId: text()
      .notNull()
      .references(() => outlet.id),
    peran: text().notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex().on(t.anggotaId, t.outletId), index().on(t.tenantId), index().on(t.outletId)],
);

/**
 * Perangkat Terdaftar milik Outlet. `hashToken` terisi setelah kode pendaftaran dipakai;
 * `dicabutPada` mematikan token. `anggotaAktifId` = Anggota yang sedang masuk dengan PIN.
 * Awalan Nomor Pesanan unik per Outlet di antara perangkat yang belum dicabut.
 */
export const perangkatTerdaftar = pgTable(
  'perangkat_terdaftar',
  {
    id: id(),
    tenantId: tenantId(),
    outletId: text()
      .notNull()
      .references(() => outlet.id),
    nama: text().notNull(),
    awalan: text().notNull(),
    hashToken: text().unique(),
    terdaftarPada: timestamp({ withTimezone: true }),
    dicabutPada: timestamp({ withTimezone: true }),
    anggotaAktifId: text().references(() => anggota.id),
    anggotaMasukPada: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    index().on(t.tenantId),
    uniqueIndex('perangkat_terdaftar_awalan_aktif').on(t.outletId, t.awalan).where(sql`dicabut_pada IS NULL`),
  ],
);

/**
 * Kode pendaftaran Perangkat Terdaftar (tabel global, hash saja). Perangkat baru belum punya
 * konteks Tenant, jadi kode dicari di sini lalu dihapus saat dipakai (sekali pakai).
 * `perangkatTenantId` sengaja tidak bernama `tenant_id` (tabel global, tanpa RLS).
 */
export const kodePendaftaranPerangkat = pgTable('kode_pendaftaran_perangkat', {
  hashKode: text().primaryKey(),
  perangkatTenantId: text().notNull(),
  perangkatId: text().notNull(),
  kedaluwarsaPada: timestamp({ withTimezone: true }).notNull(),
  createdAt: createdAt(),
});

// ---------------------------------------------------------------------------
// Menu (#35). Kategori, Menu, Varian, Grup Pilihan milik Merek; Stasiun, override harga,
// pemetaan Stasiun, dan Habis milik Outlet.
// ---------------------------------------------------------------------------

const harga = () => bigint({ mode: 'number' }).notNull();
const urutan = () => integer().notNull().default(0);

/** Kategori Menu di level Merek. `warna` = kunci pastel desain v3 (`PASTEL_KATEGORI`). */
export const kategori = pgTable(
  'kategori',
  {
    id: id(),
    tenantId: tenantId(),
    merekId: text()
      .notNull()
      .references(() => merek.id),
    nama: text().notNull(),
    warna: text().notNull(),
    ikon: text(),
    gambarUrl: text(),
    urutan: urutan(),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.tenantId), index().on(t.merekId)],
);

/**
 * Menu di level Merek. Tidak pernah dihapus: `aktif = false` menyembunyikannya dari penjualan,
 * tetapi barisnya tetap ada untuk riwayat.
 */
export const menu = pgTable(
  'menu',
  {
    id: id(),
    tenantId: tenantId(),
    merekId: text()
      .notNull()
      .references(() => merek.id),
    kategoriId: text()
      .notNull()
      .references(() => kategori.id),
    nama: text().notNull(),
    /** Harga dasar Merek. Bila Menu punya Varian, harga Varian yang dipakai. */
    harga: harga(),
    deskripsi: text(),
    fotoUrl: text(),
    urutan: urutan(),
    aktif: boolean().notNull().default(true),
    bebasPajak: boolean().notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.tenantId), index().on(t.merekId), index().on(t.kategoriId)],
);

/** Varian: pilihan wajib-tepat-satu dengan harga sendiri (harga penuh, bukan selisih). */
export const varian = pgTable(
  'varian',
  {
    id: id(),
    tenantId: tenantId(),
    menuId: text()
      .notNull()
      .references(() => menu.id),
    nama: text().notNull(),
    harga: harga(),
    urutan: urutan(),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.tenantId), index().on(t.menuId)],
);

/** Grup Pilihan pada Menu dengan aturan jumlah minimum/maksimum pilihan. */
export const grupPilihan = pgTable(
  'grup_pilihan',
  {
    id: id(),
    tenantId: tenantId(),
    menuId: text()
      .notNull()
      .references(() => menu.id),
    nama: text().notNull(),
    minimum: integer().notNull().default(0),
    maksimum: integer().notNull(),
    urutan: urutan(),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.tenantId), index().on(t.menuId)],
);

/** Satu pilihan di Grup Pilihan; `harga` 0 berarti gratis, selain itu tambahan per unit. */
export const pilihan = pgTable(
  'pilihan',
  {
    id: id(),
    tenantId: tenantId(),
    grupPilihanId: text()
      .notNull()
      .references(() => grupPilihan.id),
    nama: text().notNull(),
    harga: harga(),
    urutan: urutan(),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.tenantId), index().on(t.grupPilihanId)],
);

/** Stasiun dapur di sebuah Outlet (misal Dapur, Bar). */
export const stasiun = pgTable(
  'stasiun',
  {
    id: id(),
    tenantId: tenantId(),
    outletId: text()
      .notNull()
      .references(() => outlet.id),
    nama: text().notNull(),
    urutan: urutan(),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.tenantId), index().on(t.outletId)],
);

/** Pemetaan Menu → Stasiun untuk satu Outlet (satu Stasiun per Menu per Outlet). */
export const menuStasiun = pgTable(
  'menu_stasiun',
  {
    id: id(),
    tenantId: tenantId(),
    menuId: text()
      .notNull()
      .references(() => menu.id),
    outletId: text()
      .notNull()
      .references(() => outlet.id),
    stasiunId: text()
      .notNull()
      .references(() => stasiun.id),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex().on(t.menuId, t.outletId), index().on(t.tenantId), index().on(t.stasiunId)],
);

/**
 * Override harga per Outlet. `varianId` null = harga Menu; terisi = harga Varian itu.
 * Tidak ada baris = harga Merek berlaku.
 */
export const hargaOutlet = pgTable(
  'harga_outlet',
  {
    id: id(),
    tenantId: tenantId(),
    menuId: text()
      .notNull()
      .references(() => menu.id),
    varianId: text().references(() => varian.id),
    outletId: text()
      .notNull()
      .references(() => outlet.id),
    harga: harga(),
    createdAt: createdAt(),
  },
  (t) => [unique().on(t.outletId, t.menuId, t.varianId).nullsNotDistinct(), index().on(t.tenantId)],
);

/** Menu yang sedang Habis di sebuah Outlet (ada baris = Habis). */
export const menuHabis = pgTable(
  'menu_habis',
  {
    id: id(),
    tenantId: tenantId(),
    menuId: text()
      .notNull()
      .references(() => menu.id),
    outletId: text()
      .notNull()
      .references(() => outlet.id),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex().on(t.outletId, t.menuId), index().on(t.tenantId)],
);

// ---------------------------------------------------------------------------
// Meja, Metode Bayar, dan Shift (#37)
// ---------------------------------------------------------------------------

/**
 * Meja di satu Outlet. `label` adalah nomor/nama yang tertulis di meja (bukan entitasnya).
 * Status Kosong/Terisi diturunkan dari Tagihan terbuka, tidak disimpan.
 */
export const meja = pgTable(
  'meja',
  {
    id: id(),
    tenantId: tenantId(),
    outletId: text()
      .notNull()
      .references(() => outlet.id),
    label: text().notNull(),
    kapasitas: integer().notNull(),
    aktif: boolean().notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.tenantId), uniqueIndex().on(t.outletId, t.label)],
);

/**
 * Metode Bayar manual per Outlet (satu baris per jenis). Jenis yang belum punya baris dianggap nonaktif.
 * `keterangan`: misal bank tujuan transfer atau nama EDC.
 */
export const metodeBayar = pgTable(
  'metode_bayar',
  {
    id: id(),
    tenantId: tenantId(),
    outletId: text()
      .notNull()
      .references(() => outlet.id),
    jenis: text().notNull(),
    keterangan: text(),
    aktif: boolean().notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.tenantId), uniqueIndex().on(t.outletId, t.jenis)],
);

/**
 * Shift: satu sesi laci kas di satu Perangkat Terdaftar, `terbuka → ditutup`.
 * Paling banyak satu Shift terbuka per perangkat (indeks unik parsial).
 * Angka penutupan (kas seharusnya, Hitung Buta, selisih) dibekukan saat ditutup.
 */
export const shift = pgTable(
  'shift',
  {
    id: id(),
    tenantId: tenantId(),
    outletId: text()
      .notNull()
      .references(() => outlet.id),
    perangkatId: text()
      .notNull()
      .references(() => perangkatTerdaftar.id),
    status: text().notNull().default('terbuka'),
    kasAwal: bigint({ mode: 'number' }).notNull(),
    dibukaOlehAnggotaId: text()
      .notNull()
      .references(() => anggota.id),
    dibukaPada: timestamp({ withTimezone: true }).notNull(),
    ditutupOlehAnggotaId: text().references(() => anggota.id),
    ditutupPada: timestamp({ withTimezone: true }),
    kasSeharusnya: bigint({ mode: 'number' }),
    hitungButa: bigint({ mode: 'number' }),
    selisih: bigint({ mode: 'number' }),
    createdAt: createdAt(),
  },
  (t) => [
    index().on(t.tenantId),
    index().on(t.outletId),
    uniqueIndex('shift_terbuka_per_perangkat').on(t.perangkatId).where(sql`status = 'terbuka'`),
  ],
);

/** Kas masuk/keluar di dalam Shift, dengan alasan wajib. Append-only. */
export const kasShift = pgTable(
  'kas_shift',
  {
    id: id(),
    tenantId: tenantId(),
    shiftId: text()
      .notNull()
      .references(() => shift.id),
    jenis: text().notNull(),
    jumlah: bigint({ mode: 'number' }).notNull(),
    alasan: text().notNull(),
    anggotaId: text()
      .notNull()
      .references(() => anggota.id),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.tenantId), index().on(t.shiftId)],
);
