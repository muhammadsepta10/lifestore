import {
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Inject,
  Module,
  Post,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { and, asc, eq, gt, isNull } from 'drizzle-orm';
import { Database, type TxDb } from '../database/database';
import { anggota, merek, pengguna, sesi, tenant, verifikasiEmail } from '../database/schema';
import { PengirimEmail } from '../email/email.module';
import { KONFIGURASI_API, type KonfigurasiApi } from '../konfigurasi';
import { buatOutlet } from '../usaha/usaha.module';
import { email, objek, teks, tidakValid } from '../umum/validasi';
import { buatToken, cocokKataSandi, HASH_PALSU, hashKataSandi, hashToken } from './kripto';
import { Sesi, SesiGuard, type SesiPengguna, TanpaTenant } from './sesi.guard';

const HARI_MS = 24 * 60 * 60 * 1000;
export const LAMA_MASA_COBA_HARI = 14;
const LAMA_SESI_HARI = 30;
const LAMA_TOKEN_VERIFIKASI_HARI = 3;
/** Peran bawaan Anggota yang mendirikan Tenant. */
export const PERAN_PEMILIK = 'pemilik';

/**
 * Pendirian Tenant dalam satu transaksi: Tenant + Masa Coba, Merek default, Outlet pertama
 * (dengan Profil Pajak default), dan Pengguna sebagai Anggota berperan Pemilik.
 * `tx` harus transaksi Tenant dengan `app.tenant_id` = `tenantId` (RLS tabel `tenant`).
 */
async function dirikanTenant(tx: TxDb, d: { tenantId: string; penggunaId: string; namaUsaha: string; kota: string }) {
  const masaCobaBerakhirPada = new Date(Date.now() + LAMA_MASA_COBA_HARI * HARI_MS);
  await tx.insert(tenant).values({ id: d.tenantId, nama: d.namaUsaha, masaCobaBerakhirPada });
  const [mk] = await tx.insert(merek).values({ tenantId: d.tenantId, nama: d.namaUsaha, utama: true }).returning();
  await buatOutlet(tx, { tenantId: d.tenantId, merekId: mk!.id, nama: d.namaUsaha, kota: d.kota });
  await tx.insert(anggota).values({ tenantId: d.tenantId, penggunaId: d.penggunaId, peran: PERAN_PEMILIK });
}

@Controller()
export class IdentitasController {
  constructor(
    private readonly db: Database,
    private readonly pengirimEmail: PengirimEmail,
    @Inject(KONFIGURASI_API) private readonly konfigurasi: KonfigurasiApi,
  ) {}

  /** Daftar mandiri tanpa kartu. Email verifikasi dikirim; belum bisa masuk sebelum verifikasi. */
  @Post('daftar')
  @HttpCode(201)
  async daftar(@Body() body: unknown): Promise<{ email: string }> {
    const m = objek(body);
    const alamat = email(m, 'email');
    const kataSandi = typeof m.kataSandi === 'string' ? m.kataSandi : '';
    if (kataSandi.length < 8 || kataSandi.length > 200) throw tidakValid('kataSandi', 'Minimal 8 karakter.');
    const namaUsaha = teks(m, 'namaUsaha', { maks: 100 });
    const kota = teks(m, 'kota', { maks: 100 });

    const hash = await hashKataSandi(kataSandi);
    const token = buatToken();
    await this.db.global.transaction(async (tx) => {
      const [ada] = await tx.select().from(pengguna).where(eq(pengguna.email, alamat)).for('update');
      if (ada?.terverifikasiPada) {
        throw new ConflictException({ kode: 'email_sudah_terdaftar', pesan: 'Email sudah terdaftar. Silakan masuk.' });
      }
      // Pendaftar yang belum verifikasi boleh daftar ulang (misal email verifikasi hilang).
      const penggunaId = ada
        ? (await tx.update(pengguna).set({ hashKataSandi: hash }).where(eq(pengguna.id, ada.id)).returning())[0]!.id
        : (await tx.insert(pengguna).values({ email: alamat, hashKataSandi: hash }).returning())[0]!.id;
      await tx.insert(verifikasiEmail).values({
        penggunaId,
        hashToken: hashToken(token),
        namaUsaha,
        kota,
        kedaluwarsaPada: new Date(Date.now() + LAMA_TOKEN_VERIFIKASI_HARI * HARI_MS),
      });
    });

    const urlWeb = this.konfigurasi.urlWeb ?? 'http://localhost:8080';
    await this.pengirimEmail.kirim({
      ke: alamat,
      subjek: 'Verifikasi email Lifestore',
      teks:
        `Halo, terima kasih sudah mendaftar ${namaUsaha} di Lifestore.\n\n` +
        `Klik tautan ini untuk memverifikasi email dan memulai Masa Coba ${LAMA_MASA_COBA_HARI} hari:\n` +
        `${urlWeb}/verifikasi?token=${token}\n\n` +
        `Tautan berlaku ${LAMA_TOKEN_VERIFIKASI_HARI} hari.`,
    });
    return { email: alamat };
  }

  /** Verifikasi email: mendirikan Tenant, Merek default, Outlet pertama, dan Masa Coba sekaligus. */
  @Post('verifikasi-email')
  @HttpCode(200)
  async verifikasi(@Body() body: unknown): Promise<{ tenantId: string }> {
    const token = teks(objek(body), 'token', { maks: 200 });
    const tenantId = randomUUID();
    await this.db.denganTenant({ tenantId }, async (tx) => {
      const [v] = await tx
        .update(verifikasiEmail)
        .set({ dipakaiPada: new Date() })
        .where(
          and(
            eq(verifikasiEmail.hashToken, hashToken(token)),
            isNull(verifikasiEmail.dipakaiPada),
            gt(verifikasiEmail.kedaluwarsaPada, new Date()),
          ),
        )
        .returning();
      if (!v) throw tidakValid('token', 'Tautan verifikasi tidak valid, sudah dipakai, atau kedaluwarsa.');
      const [p] = await tx
        .update(pengguna)
        .set({ terverifikasiPada: new Date() })
        .where(and(eq(pengguna.id, v.penggunaId), isNull(pengguna.terverifikasiPada)))
        .returning({ id: pengguna.id });
      // Token lama dari daftar ulang: Pengguna sudah terverifikasi dan punya Tenant.
      if (!p) throw tidakValid('token', 'Email ini sudah terverifikasi. Silakan masuk.');
      await dirikanTenant(tx, { tenantId, penggunaId: v.penggunaId, namaUsaha: v.namaUsaha, kota: v.kota });
    });
    return { tenantId };
  }

  /** Masuk. Bila Pengguna hanya Anggota satu Tenant, Tenant itu langsung aktif. */
  @Post('masuk')
  @HttpCode(200)
  async masuk(@Body() body: unknown) {
    const m = objek(body);
    const alamat = email(m, 'email');
    const kataSandi = typeof m.kataSandi === 'string' ? m.kataSandi : '';
    const [p] = await this.db.global.select().from(pengguna).where(eq(pengguna.email, alamat));
    const cocok = await cocokKataSandi(kataSandi, p?.hashKataSandi ?? HASH_PALSU);
    if (!p || !cocok) throw new UnauthorizedException({ kode: 'kredensial_salah', pesan: 'Email atau kata sandi salah.' });
    if (!p.terverifikasiPada) {
      throw new ForbiddenException({
        kode: 'email_belum_terverifikasi',
        pesan: 'Verifikasi email terlebih dahulu lewat tautan yang kami kirim.',
      });
    }

    const daftarTenant = await this.tenantMilik(p.id);
    const token = buatToken();
    const tenantAktifId = daftarTenant.length === 1 ? daftarTenant[0]!.id : null;
    await this.db.global.insert(sesi).values({
      penggunaId: p.id,
      hashToken: hashToken(token),
      tenantAktifId,
      kedaluwarsaPada: new Date(Date.now() + LAMA_SESI_HARI * HARI_MS),
    });
    return { token, tenant: daftarTenant, tenantAktifId };
  }

  @Get('sesi')
  @UseGuards(SesiGuard)
  @TanpaTenant()
  async sesiAktif(@Sesi() s: SesiPengguna) {
    const [p] = await this.db.global.select({ id: pengguna.id, email: pengguna.email }).from(pengguna).where(eq(pengguna.id, s.penggunaId));
    return { pengguna: p, tenant: await this.tenantMilik(s.penggunaId), tenantAktifId: s.tenantAktifId };
  }

  /** Pilih Tenant aktif untuk sesi ini. Hanya Tenant tempat Pengguna menjadi Anggota. */
  @Post('sesi/tenant')
  @HttpCode(200)
  @UseGuards(SesiGuard)
  @TanpaTenant()
  async pilihTenant(@Body() body: unknown, @Sesi() s: SesiPengguna) {
    const tenantId = teks(objek(body), 'tenantId', { maks: 64 });
    const dipilih = (await this.tenantMilik(s.penggunaId)).find((t) => t.id === tenantId);
    if (!dipilih) throw new ForbiddenException({ kode: 'bukan_anggota', pesan: 'Anda bukan Anggota Tenant ini.' });
    await this.db.global.update(sesi).set({ tenantAktifId: tenantId }).where(eq(sesi.id, s.id));
    return { tenantAktifId: tenantId };
  }

  /** Pengguna yang sudah masuk mendirikan Tenant (usaha) lain dengan Masa Coba sendiri. */
  @Post('tenant')
  @HttpCode(201)
  @UseGuards(SesiGuard)
  @TanpaTenant()
  async tenantBaru(@Body() body: unknown, @Sesi() s: SesiPengguna) {
    const m = objek(body);
    const namaUsaha = teks(m, 'namaUsaha', { maks: 100 });
    const kota = teks(m, 'kota', { maks: 100 });
    const tenantId = randomUUID();
    await this.db.denganTenant({ tenantId }, (tx) => dirikanTenant(tx, { tenantId, penggunaId: s.penggunaId, namaUsaha, kota }));
    return { id: tenantId, nama: namaUsaha };
  }

  @Post('keluar')
  @HttpCode(204)
  @UseGuards(SesiGuard)
  @TanpaTenant()
  async keluar(@Sesi() s: SesiPengguna): Promise<void> {
    await this.db.global.delete(sesi).where(eq(sesi.id, s.id));
  }

  private tenantMilik(penggunaId: string): Promise<{ id: string; nama: string }[]> {
    return this.db.denganPengguna(penggunaId, (tx) =>
      tx
        .select({ id: tenant.id, nama: tenant.nama })
        .from(anggota)
        .innerJoin(tenant, eq(tenant.id, anggota.tenantId))
        .where(eq(anggota.penggunaId, penggunaId))
        .orderBy(asc(tenant.createdAt), asc(tenant.id)),
    );
  }
}

@Module({ controllers: [IdentitasController] })
export class IdentitasModule {}
