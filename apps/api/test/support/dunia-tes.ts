import type { INestApplication, Type } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import supertest from 'supertest';
import { AppModule } from '../../src/app.module';
import { konfigurasiAplikasi } from '../../src/aplikasi';
import { PengirimEmail } from '../../src/email/email.module';
import { Jam } from '../../src/umum/jam';
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
  /** Jam aplikasi yang bisa dimajukan (kunci PIN sementara, kedaluwarsa). */
  jam: JamTes;
  /** Terima undangan karyawan dari email terakhir, lalu masuk sebagai Pengguna itu. */
  terimaUndangan(email: string, opsi?: { kataSandi?: string }): Promise<PenggunaMasuk>;
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
  /** Buat Kategori di Merek default; mengembalikan ID-nya. */
  buatKategori(data?: { nama?: string; warna?: string; ikon?: string }): Promise<string>;
  /** Buat Menu di Merek default (tanpa `kategoriId` dibuatkan Kategori baru); mengembalikan ID-nya. */
  buatMenu(data: DataMenuTes): Promise<string>;
  /** Buat Stasiun di Outlet (default Outlet pertama); mengembalikan ID-nya. */
  buatStasiun(nama: string, outletId?: string): Promise<string>;
  /** Tambah karyawan (undangan email bila ada `email`, khusus PIN bila tidak). Mengembalikan ID Anggota. */
  tambahKaryawan(data: DataKaryawan): Promise<string>;
  /** Atur PIN Anggota mana pun (termasuk Pemilik sendiri: `anggotaSaya()`). */
  aturPin(anggotaId: string, pin: string): Promise<void>;
  /** ID Anggota Pemilik di Tenant aktif. */
  anggotaSaya(): Promise<string>;
  /** Siapkan Perangkat Terdaftar lalu daftarkan dengan kodenya, seperti manajer di tablet. */
  daftarkanPerangkat(data?: { outletId?: string; nama?: string; awalan?: string }): Promise<PerangkatTes>;
  /**
   * Siapkan kasir di Perangkat Terdaftar baru: karyawan ber-PIN dengan Peran (default `kasir`)
   * di Outlet itu, perangkat didaftarkan, lalu karyawan masuk dengan PIN.
   */
  bukaKasir(data?: { outletId?: string; peran?: PeranTes; nama?: string; awalan?: string }): Promise<KasirTes>;
  /** Aktifkan satu Metode Bayar (default tunai) di Outlet (default Outlet pertama). */
  aktifkanMetodeBayar(jenis?: string, outletId?: string): Promise<void>;
  /** Buat Meja berlabel `dari`..`sampai` di Outlet (default Outlet pertama); mengembalikan ID-nya berurutan. */
  buatMeja(dari: number, sampai: number, outletId?: string): Promise<string[]>;
  /** Ubah pengaturan Outlet (misal `pembulatanTunai`, `bayarDulu`). */
  aturOutlet(data: object, outletId?: string): Promise<void>;
}

type PeranTes = 'manajer_outlet' | 'kasir' | 'pelayan' | 'dapur';

/** Perangkat Terdaftar dengan karyawan yang sudah masuk PIN (hasil `pemilik.bukaKasir`). */
export interface KasirTes extends PerangkatTes {
  anggotaId: string;
  pin: string;
  /** Buka Shift dengan modal awal laci; mengembalikan ID Shift. */
  bukaShift(kasAwal: number): Promise<string>;
  /** Buka Tagihan bawa pulang; mengembalikan ID Tagihan. */
  bukaTagihan(data?: { id?: string; namaPelanggan?: string }): Promise<string>;
  /** Kirim item sebagai satu Pesanan (tanpa memeriksa status; pakai `.expect(...)`). */
  kirimPesanan(tagihanId: string, item: ItemPesananTes[], opsi?: { id?: string; tunaiDiKasir?: boolean }): Permintaan;
  /** Bayar tunai (tanpa memeriksa status; pakai `.expect(...)`). */
  bayarTunai(tagihanId: string, diterima: number, opsi?: { id?: string }): Permintaan;
  /** Buka Tagihan dine-in di sebuah Meja; mengembalikan ID Tagihan. */
  bukaTagihanDineIn(mejaId: string, data?: { id?: string; namaPelanggan?: string }): Promise<string>;
  /** Terima Pembayaran dengan Metode Bayar apa pun (tanpa memeriksa status; pakai `.expect(...)`). */
  bayar(tagihanId: string, data: { id?: string; metode: string; jumlah?: number; diterima?: number; referensi?: string }): Permintaan;
}

/** Satu baris kiriman Pesanan; bentuknya sama dengan `item[]` di `POST /v1/tagihan/:id/pesanan`. */
export interface ItemPesananTes {
  id?: string;
  menuId: string;
  varianId?: string;
  pilihanIds?: string[];
  jumlah?: number;
  catatan?: string;
}

export interface DataKaryawan {
  nama?: string;
  email?: string;
  pin?: string;
  penugasan?: { outletId: string; peran: PeranTes }[];
}

/** Perangkat Terdaftar: klien HTTP yang membawa token perangkat (`Authorization: Perangkat`). */
export interface PerangkatTes {
  id: string;
  token: string;
  outletId: string;
  awalan: string;
  get(path: string): Permintaan;
  post(path: string, body?: object): Permintaan;
  /** Masuk dengan PIN (tanpa memeriksa status; pakai `.expect(...)`). */
  masukPin(anggotaId: string, pin: string): Permintaan;
}

/** Jam tes: mulai dari waktu nyata, bisa dimajukan. */
export class JamTes extends Jam {
  private geser = 0;
  override sekarang(): Date {
    return new Date(Date.now() + this.geser);
  }
  maju(ms: number): void {
    this.geser += ms;
  }
}

/** Isi Menu untuk `buatMenu`; bentuknya sama dengan body `POST /v1/merek/:merekId/menu`. */
export interface DataMenuTes {
  nama: string;
  harga: number;
  kategoriId?: string;
  bebasPajak?: boolean;
  varian?: { nama: string; harga: number }[];
  grupPilihan?: { nama: string; minimum?: number; maksimum: number; pilihan: { nama: string; harga: number }[] }[];
}

let nomor = 0;

export async function buatDuniaTes(opsi: OpsiDuniaTes = {}): Promise<DuniaTes> {
  const db = await buatDatabaseTes();
  const email = new PenangkapEmail();
  const jam = new JamTes();
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule.register({ databaseUrl: db.appUrl }), ...(opsi.modulTambahan ?? [])],
  })
    .overrideProvider(PengirimEmail)
    .useValue(email)
    .overrideProvider(Jam)
    .useValue(jam)
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
    const buatKategori: PemilikTes['buatKategori'] = async (d = {}) => {
      const res = await pengguna
        .post(`/v1/merek/${merekId}/kategori`, { nama: d.nama ?? 'Kategori Tes', warna: d.warna ?? 'mint', ikon: d.ikon })
        .expect(201);
      return res.body.id as string;
    };
    const pemilik: PemilikTes = {
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
      buatKategori,
      async buatMenu(d) {
        const kategoriId = d.kategoriId ?? (await buatKategori());
        const res = await pengguna.post(`/v1/merek/${merekId}/menu`, { ...d, kategoriId }).expect(201);
        return res.body.id as string;
      },
      async buatStasiun(nama, o = outletId) {
        const res = await pengguna.post(`/v1/outlet/${o}/stasiun`, { nama }).expect(201);
        return res.body.id as string;
      },
      async tambahKaryawan(d) {
        nomor += 1;
        const res = await pengguna.post('/v1/karyawan', { nama: d.nama ?? `Karyawan ${nomor}`, ...d }).expect(201);
        return res.body.id as string;
      },
      async aturPin(anggotaId, pin) {
        await pengguna.put(`/v1/karyawan/${anggotaId}/pin`, { pin }).expect(200);
      },
      async anggotaSaya() {
        const daftar = (await pengguna.get('/v1/karyawan').expect(200)).body as { id: string; peran: string }[];
        return daftar.find((k) => k.peran === 'pemilik')!.id;
      },
      async daftarkanPerangkat(d = {}) {
        const target = d.outletId ?? outletId;
        nomor += 1;
        const siap = await pengguna
          .post(`/v1/outlet/${target}/perangkat`, { nama: d.nama ?? `Tablet ${nomor}`, awalan: d.awalan ?? 'A' })
          .expect(201);
        const res = await http.post('/v1/perangkat/daftar').send({ kode: siap.body.kodePendaftaran }).expect(200);
        return perangkatTes(res.body.tokenPerangkat, res.body.perangkat);
      },
      async bukaKasir(d = {}) {
        const target = d.outletId ?? outletId;
        const pin = String(1000 + (nomor % 9000));
        const anggotaId = await pemilik.tambahKaryawan({ ...(d.nama ? { nama: d.nama } : {}), pin, penugasan: [{ outletId: target, peran: d.peran ?? 'kasir' }] });
        // Awalan unik per kasir supaya beberapa perangkat di satu Outlet tidak bentrok.
        const awalan = d.awalan ?? `K${String.fromCharCode(65 + (nomor % 26))}${String.fromCharCode(65 + (Math.floor(nomor / 26) % 26))}`;
        const p = await pemilik.daftarkanPerangkat({ outletId: target, awalan });
        await p.masukPin(anggotaId, pin).expect(200);
        return {
          ...p,
          anggotaId,
          pin,
          async bukaShift(kasAwal) {
            const res = await p.post('/v1/shift', { kasAwal }).expect(201);
            return res.body.id as string;
          },
          async bukaTagihan(t = {}) {
            const res = await p.post('/v1/tagihan', { kanal: 'bawa_pulang', ...t }).expect(201);
            return res.body.id as string;
          },
          kirimPesanan: (tagihanId, item, o = {}) => p.post(`/v1/tagihan/${tagihanId}/pesanan`, { ...o, item }),
          bayarTunai: (tagihanId, diterima, o = {}) => p.post(`/v1/tagihan/${tagihanId}/pembayaran`, { ...o, metode: 'tunai', diterima }),
          async bukaTagihanDineIn(mejaId, t = {}) {
            const res = await p.post('/v1/tagihan', { kanal: 'dine_in', mejaId, ...t }).expect(201);
            return res.body.id as string;
          },
          bayar: (tagihanId, data) => p.post(`/v1/tagihan/${tagihanId}/pembayaran`, data),
        };
      },
      async aktifkanMetodeBayar(jenis = 'tunai', o = outletId) {
        await pengguna.put(`/v1/outlet/${o}/metode-bayar/${jenis}`, { aktif: true }).expect(200);
      },
      async buatMeja(dari, sampai, o = outletId) {
        const res = await pengguna.post(`/v1/outlet/${o}/meja/massal`, { dari, sampai, kapasitas: 4 }).expect(201);
        return (res.body as { id: string }[]).map((m) => m.id);
      },
      async aturOutlet(data, o = outletId) {
        await pengguna.patch(`/v1/outlet/${o}`, data).expect(200);
      },
    };
    return pemilik;
  }

  function perangkatTes(token: string, p: { id: string; outletId: string; awalan: string }): PerangkatTes {
    const auth = (r: Permintaan) => r.set('Authorization', `Perangkat ${token}`);
    return {
      id: p.id,
      token,
      outletId: p.outletId,
      awalan: p.awalan,
      get: (path) => auth(http.get(path)),
      post: (path, b) => auth(http.post(path)).send(b ?? {}),
      masukPin: (anggotaId, pin) => auth(http.post('/v1/perangkat/masuk')).send({ anggotaId, pin }),
    };
  }

  async function terimaUndangan(alamat: string, o: { kataSandi?: string } = {}): Promise<PenggunaMasuk> {
    const kataSandi = o.kataSandi ?? 'kata-sandi-karyawan';
    await http.post('/v1/undangan/terima').send({ token: email.tokenUndanganUntuk(alamat), kataSandi }).expect(200);
    return masuk(alamat, kataSandi);
  }

  return {
    app,
    http,
    db,
    email,
    jam,
    terimaUndangan,
    daftarTenant,
    masuk,
    async tutup() {
      await app.close();
      await db.hapus();
    },
  };
}
