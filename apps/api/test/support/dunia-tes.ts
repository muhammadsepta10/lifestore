import type { INestApplication, Type } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import supertest from 'supertest';
import { AppModule } from '../../src/app.module';
import { konfigurasiAplikasi } from '../../src/aplikasi';
import { PengirimEmail } from '../../src/email/email.module';
import { buatDatabaseTes, type DatabaseTes } from './database-tes';
import { PenangkapEmail } from './penangkap-email';

/**
 * "Dunia tes": aplikasi NestJS penuh di atas database baru yang sudah dimigrasi,
 * terhubung sebagai peran aplikasi tanpa BYPASSRLS (RLS aktif). Email ditangkap `dunia.email`.
 *
 * Satu dunia per suite (file tes): buat di `beforeAll`, tutup di `afterAll`.
 * Langkah cerita (`daftarTenant`, `pemilik.tambahOutlet`, …) menyiapkan data LEWAT API,
 * bukan insert langsung, supaya tes terbaca seperti cerita. Tiket berikutnya menambah langkah di sini.
 */
export interface DuniaTes {
  app: INestApplication;
  /** Klien HTTP ke aplikasi (supertest), tanpa sesi. */
  http: ReturnType<typeof supertest>;
  db: DatabaseTes;
  email: PenangkapEmail;
  /** Daftar → verifikasi email → masuk. Mengembalikan pemilik dengan sesi dan Tenant aktif. */
  daftarTenant(opsi?: OpsiDaftar): Promise<PemilikTes>;
  /** Masuk sebagai Pengguna yang sudah terverifikasi. */
  masuk(email: string, kataSandi: string): Promise<PenggunaMasuk>;
  tutup(): Promise<void>;
}

export interface OpsiDuniaTes {
  /** Modul tambahan khusus tes (misal controller penguji). */
  modulTambahan?: Type[];
}

export interface OpsiDaftar {
  email?: string;
  kataSandi?: string;
  namaUsaha?: string;
  kota?: string;
}

type Permintaan = ReturnType<ReturnType<typeof supertest>['get']>;

/** Pengguna yang sudah masuk: klien HTTP yang otomatis membawa token sesi. */
export interface PenggunaMasuk {
  email: string;
  token: string;
  tenant: { id: string; nama: string }[];
  get(path: string): Permintaan;
  post(path: string, body?: object): Permintaan;
  patch(path: string, body?: object): Permintaan;
  put(path: string, body?: object): Permintaan;
  delete(path: string): Permintaan;
  pilihTenant(tenantId: string): Promise<void>;
}

/** Pemilik Tenant hasil `daftarTenant`, dengan ID Tenant, Merek default, dan Outlet pertama. */
export interface PemilikTes extends PenggunaMasuk {
  kataSandi: string;
  tenantId: string;
  merekId: string;
  outletId: string;
  /** Tambah Outlet di Tenant aktif; mengembalikan ID-nya. */
  tambahOutlet(data?: { nama?: string; kota?: string }): Promise<string>;
  /** Dirikan Tenant lain untuk Pengguna yang sama (belum dipilih sebagai Tenant aktif). */
  dirikanTenantLain(data?: { namaUsaha?: string; kota?: string }): Promise<string>;
}

let nomor = 0;

export async function buatDuniaTes(opsi: OpsiDuniaTes = {}): Promise<DuniaTes> {
  const db = await buatDatabaseTes();
  const email = new PenangkapEmail();
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule.register({ databaseUrl: db.appUrl }), ...(opsi.modulTambahan ?? [])],
  })
    .overrideProvider(PengirimEmail)
    .useValue(email)
    .compile();
  const app = moduleRef.createNestApplication({ logger: false });
  konfigurasiAplikasi(app);
  await app.init();
  const http = supertest(app.getHttpServer());

  async function masuk(alamat: string, kataSandi: string): Promise<PenggunaMasuk> {
    const res = await http.post('/v1/masuk').send({ email: alamat, kataSandi }).expect(200);
    const token: string = res.body.token;
    const auth = (r: Permintaan) => r.set('Authorization', `Bearer ${token}`);
    return {
      email: alamat,
      token,
      tenant: res.body.tenant,
      get: (p) => auth(http.get(p)),
      post: (p, b) => auth(http.post(p)).send(b ?? {}),
      patch: (p, b) => auth(http.patch(p)).send(b ?? {}),
      put: (p, b) => auth(http.put(p)).send(b ?? {}),
      delete: (p) => auth(http.delete(p)),
      async pilihTenant(tenantId) {
        await auth(http.post('/v1/sesi/tenant')).send({ tenantId }).expect(200);
      },
    };
  }

  async function daftarTenant(o: OpsiDaftar = {}): Promise<PemilikTes> {
    nomor += 1;
    const alamat = o.email ?? `pemilik${nomor}-${Date.now().toString(36)}@lifestore.test`;
    const kataSandi = o.kataSandi ?? 'kata-sandi-tes';
    await http
      .post('/v1/daftar')
      .send({ email: alamat, kataSandi, namaUsaha: o.namaUsaha ?? `Warung Tes ${nomor}`, kota: o.kota ?? 'Bandung' })
      .expect(201);
    await http.post('/v1/verifikasi-email').send({ token: email.tokenVerifikasiUntuk(alamat) }).expect(200);
    const pengguna = await masuk(alamat, kataSandi);
    const merekId: string = (await pengguna.get('/v1/merek').expect(200)).body[0].id;
    const outletId: string = (await pengguna.get('/v1/outlet').expect(200)).body[0].id;
    return {
      ...pengguna,
      kataSandi,
      tenantId: pengguna.tenant[0]!.id,
      merekId,
      outletId,
      async tambahOutlet(d = {}) {
        const res = await pengguna.post('/v1/outlet', { nama: d.nama ?? 'Outlet Kedua', kota: d.kota ?? 'Jakarta' }).expect(201);
        return res.body.id as string;
      },
      async dirikanTenantLain(d = {}) {
        const res = await pengguna
          .post('/v1/tenant', { namaUsaha: d.namaUsaha ?? 'Usaha Kedua', kota: d.kota ?? 'Surabaya' })
          .expect(201);
        return res.body.id as string;
      },
    };
  }

  return {
    app,
    http,
    db,
    email,
    daftarTenant,
    masuk,
    async tutup() {
      await app.close();
      await db.hapus();
    },
  };
}
