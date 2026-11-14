import { Body, ConflictException, Controller, Get, HttpCode, Inject, Module, Param, Post, Put, UseGuards } from '@nestjs/common';
import { and, asc, desc, eq, inArray, isNotNull, isNull, or, sql, gt } from 'drizzle-orm';
import { Database, type TxDb } from '../database/database';
import { anggota, outlet, pengguna, penugasan, tenant, undanganKaryawan } from '../database/schema';
import { PengirimEmail } from '../email/email.module';
import { hashKataSandi, hashToken } from '../identitas/kripto';
import { SesiGuard } from '../identitas/sesi.guard';
import { PERAN_BAWAAN, PERAN_KARYAWAN, PERAN_PEMILIK, type PeranBawaan, PerluIzin } from '../izin/izin';
import { KONFIGURASI_API, type KonfigurasiApi } from '../konfigurasi';
import { Jam } from '../umum/jam';
import { email, objek, pilihan, teks, teksOpsional, tidakDitemukan, tidakValid } from '../umum/validasi';
import { PerangkatGuard, PerangkatController, PerangkatKasirController } from './perangkat';
import { PersetujuanAtasan } from './persetujuan-atasan';
import { hashPin, pinValid } from './pin';
import { bacaTokenBertenant, buatTokenBertenant } from './token';

const HARI_MS = 24 * 60 * 60 * 1000;
const LAMA_UNDANGAN_HARI = 7;

type Tugas = { outletId: string; peran: PeranBawaan };

/** Siap Jualan: ada Anggota aktif ber-PIN yang bisa masuk di Outlet ini (Pemilik atau ditugaskan). */
export async function adaKaryawanSiap(tx: TxDb, outletId: string): Promise<boolean> {
  const [baris] = await tx
    .select({ id: anggota.id })
    .from(anggota)
    .leftJoin(penugasan, and(eq(penugasan.anggotaId, anggota.id), eq(penugasan.outletId, outletId)))
    .where(and(eq(anggota.aktif, true), isNotNull(anggota.hashPin), or(eq(anggota.peran, PERAN_PEMILIK), isNotNull(penugasan.id))))
    .limit(1);
  return baris !== undefined;
}

function penugasanValid(v: unknown): Tugas[] {
  if (!Array.isArray(v)) throw tidakValid('penugasan', 'Harus daftar { outletId, peran }.');
  const hasil = v.map((t) => {
    const m = objek(t);
    return { outletId: teks(m, 'outletId', { maks: 64 }), peran: pilihan(m, 'peran', PERAN_BAWAAN) };
  });
  if (new Set(hasil.map((t) => t.outletId)).size !== hasil.length) throw tidakValid('penugasan', 'Satu Outlet hanya boleh sekali.');
  return hasil;
}

/** Outlet dicari lewat transaksi Tenant (RLS), jadi Outlet Tenant lain dianggap tidak ada. */
async function pastikanOutletAda(tx: TxDb, tugas: Tugas[]): Promise<void> {
  if (tugas.length === 0) return;
  const ids = tugas.map((t) => t.outletId);
  const ada = await tx.select({ id: outlet.id }).from(outlet).where(inArray(outlet.id, ids));
  if (ada.length !== new Set(ids).size) throw tidakDitemukan('Outlet');
}

@Controller('karyawan')
@UseGuards(SesiGuard)
export class KaryawanController {
  constructor(
    private readonly db: Database,
    private readonly pengirimEmail: PengirimEmail,
    private readonly jam: Jam,
    @Inject(KONFIGURASI_API) private readonly konfigurasi: KonfigurasiApi,
  ) {}

  @Get()
  @PerluIzin('karyawan.kelola')
  async daftar() {
    const tx = this.db.tenant();
    const baris = await tx
      .select({ a: anggota, emailPengguna: pengguna.email })
      .from(anggota)
      .leftJoin(pengguna, eq(pengguna.id, anggota.penggunaId))
      .orderBy(asc(anggota.createdAt), asc(anggota.id));
    const hasil = [];
    for (const b of baris) hasil.push(await this.tampilkan(tx, b.a, b.emailPengguna));
    return hasil;
  }

  /**
   * Tambah karyawan. Dengan `email`: undangan dikirim, karyawan membuat akun saat menerima.
   * Tanpa `email`: karyawan khusus PIN (wajib `pin`), tanpa akun Pengguna.
   */
  @Post()
  @HttpCode(201)
  @PerluIzin('karyawan.kelola')
  async tambah(@Body() body: unknown) {
    const m = objek(body);
    const nama = teks(m, 'nama', { maks: 100 });
    const alamat = m.email === undefined || m.email === null || m.email === '' ? null : email(m, 'email');
    const pin = m.pin === undefined && alamat ? null : pinValid(m);
    const tugas = penugasanValid(m.penugasan ?? []);

    const tx = this.db.tenant();
    await pastikanOutletAda(tx, tugas);
    const [a] = await tx
      .insert(anggota)
      .values({
        tenantId: sql`app_tenant_id()`,
        peran: PERAN_KARYAWAN,
        nama,
        hashPin: pin ? await hashPin(pin) : null,
      })
      .returning();
    await this.simpanPenugasan(tx, a!.id, tugas);

    if (alamat) {
      const token = buatTokenBertenant(a!.tenantId);
      await tx.insert(undanganKaryawan).values({
        tenantId: a!.tenantId,
        anggotaId: a!.id,
        email: alamat,
        hashToken: hashToken(token),
        kedaluwarsaPada: new Date(this.jam.sekarang().getTime() + LAMA_UNDANGAN_HARI * HARI_MS),
      });
      const [t] = await tx.select({ nama: tenant.nama }).from(tenant);
      const urlWeb = this.konfigurasi.urlWeb ?? 'http://localhost:8080';
      await this.pengirimEmail.kirim({
        ke: alamat,
        subjek: `Undangan bergabung dengan ${t!.nama} di Lifestore`,
        teks:
          `Halo ${nama}, Anda diundang menjadi karyawan ${t!.nama} di Lifestore.\n\n` +
          `Klik tautan ini untuk menerima undangan:\n${urlWeb}/undangan?token=${token}\n\n` +
          `Tautan berlaku ${LAMA_UNDANGAN_HARI} hari.`,
      });
    }
    return this.tampilkan(tx, a!, null);
  }

  /** Ganti seluruh Penugasan Anggota (Outlet + Peran). */
  @Put(':id/penugasan')
  @PerluIzin('karyawan.kelola')
  async ubahPenugasan(@Param('id') id: string, @Body() body: unknown) {
    const tugas = penugasanValid(objek(body).penugasan);
    const tx = this.db.tenant();
    const a = await this.anggota(tx, id);
    if (a.peran === PERAN_PEMILIK) throw tidakValid('penugasan', 'Pemilik sudah punya akses ke semua Outlet.');
    await pastikanOutletAda(tx, tugas);
    await tx.delete(penugasan).where(eq(penugasan.anggotaId, id));
    await this.simpanPenugasan(tx, id, tugas);
    return this.tampilkan(tx, a, null);
  }

  /** Atur atau ganti PIN (juga untuk Pemilik sendiri). Membuka kunci PIN sementara. */
  @Put(':id/pin')
  @PerluIzin('karyawan.kelola')
  async aturPin(@Param('id') id: string, @Body() body: unknown) {
    const pin = pinValid(objek(body));
    const tx = this.db.tenant();
    await this.anggota(tx, id);
    const [a] = await tx
      .update(anggota)
      .set({ hashPin: await hashPin(pin), pinSalah: 0, pinTerkunciSampai: null })
      .where(eq(anggota.id, id))
      .returning();
    return this.tampilkan(tx, a!, null);
  }

  /** Nonaktifkan karyawan: tidak bisa masuk dashboard maupun Perangkat Terdaftar lagi. */
  @Post(':id/nonaktifkan')
  @HttpCode(200)
  @PerluIzin('karyawan.kelola')
  async nonaktifkan(@Param('id') id: string) {
    const tx = this.db.tenant();
    const a = await this.anggota(tx, id);
    if (a.peran === PERAN_PEMILIK) throw tidakValid('id', 'Pemilik tidak bisa dinonaktifkan.');
    const [baru] = await tx.update(anggota).set({ aktif: false }).where(eq(anggota.id, id)).returning();
    return this.tampilkan(tx, baru!, null);
  }

  private async anggota(tx: TxDb, id: string) {
    const [a] = await tx.select().from(anggota).where(eq(anggota.id, id));
    if (!a) throw tidakDitemukan('Karyawan');
    return a;
  }

  private async simpanPenugasan(tx: TxDb, anggotaId: string, tugas: Tugas[]) {
    if (tugas.length === 0) return;
    await tx.insert(penugasan).values(tugas.map((t) => ({ tenantId: sql`app_tenant_id()`, anggotaId, outletId: t.outletId, peran: t.peran })));
  }

  private async tampilkan(tx: TxDb, a: typeof anggota.$inferSelect, emailPengguna: string | null) {
    const tugas = await tx
      .select({ outletId: penugasan.outletId, peran: penugasan.peran })
      .from(penugasan)
      .where(eq(penugasan.anggotaId, a.id))
      .orderBy(asc(penugasan.createdAt), asc(penugasan.id));
    let alamat = emailPengguna;
    if (!alamat && a.penggunaId) {
      const [p] = await tx.select({ email: pengguna.email }).from(pengguna).where(eq(pengguna.id, a.penggunaId));
      alamat = p?.email ?? null;
    }
    if (!alamat) {
      const [u] = await tx
        .select({ email: undanganKaryawan.email })
        .from(undanganKaryawan)
        .where(eq(undanganKaryawan.anggotaId, a.id))
        .orderBy(desc(undanganKaryawan.createdAt))
        .limit(1);
      alamat = u?.email ?? null;
    }
    return {
      id: a.id,
      nama: a.nama,
      email: alamat,
      peran: a.peran,
      aktif: a.aktif,
      punyaPin: a.hashPin !== null,
      undanganDiterima: a.penggunaId !== null,
      penugasan: tugas,
    };
  }
}

@Controller('undangan')
export class UndanganController {
  constructor(
    private readonly db: Database,
    private readonly jam: Jam,
  ) {}

  /**
   * Terima undangan karyawan. Token membuktikan pemilik email. Bila email belum punya akun
   * Pengguna, `kataSandi` wajib dan akun langsung terverifikasi; bila sudah, akun itu dihubungkan.
   */
  @Post('terima')
  @HttpCode(200)
  async terima(@Body() body: unknown): Promise<{ tenantId: string; email: string }> {
    const m = objek(body);
    const token = teks(m, 'token', { maks: 300 });
    const kataSandi = teksOpsional(m, 'kataSandi', { maks: 200 });
    const tenantId = bacaTokenBertenant(token);
    const tidakBerlaku = () => tidakValid('token', 'Undangan tidak valid, sudah diterima, atau kedaluwarsa.');
    if (!tenantId) throw tidakBerlaku();
    const sekarang = this.jam.sekarang();

    return this.db.denganTenant({ tenantId }, async (tx) => {
      const [u] = await tx
        .update(undanganKaryawan)
        .set({ diterimaPada: sekarang })
        .where(
          and(
            eq(undanganKaryawan.hashToken, hashToken(token)),
            isNull(undanganKaryawan.diterimaPada),
            gt(undanganKaryawan.kedaluwarsaPada, sekarang),
          ),
        )
        .returning();
      if (!u) throw tidakBerlaku();

      // Tabel pengguna global (tanpa RLS), ikut transaksi ini supaya semuanya batal bersama.
      const [ada] = await tx.select().from(pengguna).where(eq(pengguna.email, u.email)).for('update');
      let penggunaId: string;
      if (ada) {
        penggunaId = ada.id;
        if (!ada.terverifikasiPada) await tx.update(pengguna).set({ terverifikasiPada: sekarang }).where(eq(pengguna.id, ada.id));
      } else {
        if (!kataSandi || kataSandi.length < 8) throw tidakValid('kataSandi', 'Minimal 8 karakter.');
        const [p] = await tx
          .insert(pengguna)
          .values({ email: u.email, hashKataSandi: await hashKataSandi(kataSandi), terverifikasiPada: sekarang })
          .returning();
        penggunaId = p!.id;
      }
      const [sudah] = await tx.select({ id: anggota.id }).from(anggota).where(eq(anggota.penggunaId, penggunaId));
      if (sudah) throw new ConflictException({ kode: 'sudah_anggota', pesan: 'Akun ini sudah menjadi Anggota usaha ini.' });
      const [a] = await tx
        .update(anggota)
        .set({ penggunaId })
        .where(and(eq(anggota.id, u.anggotaId), isNull(anggota.penggunaId), eq(anggota.aktif, true)))
        .returning({ id: anggota.id });
      if (!a) throw tidakBerlaku();
      return { tenantId, email: u.email };
    });
  }
}

@Module({
  controllers: [KaryawanController, UndanganController, PerangkatController, PerangkatKasirController],
  providers: [PerangkatGuard, PersetujuanAtasan],
  exports: [PerangkatGuard, PersetujuanAtasan],
})
export class KaryawanModule {}
