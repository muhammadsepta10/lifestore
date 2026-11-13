import {
  Body,
  type CanActivate,
  ConflictException,
  createParamDecorator,
  type ExecutionContext,
  ForbiddenException,
  Get,
  HttpCode,
  Injectable,
  Controller,
  Param,
  Post,
  SetMetadata,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { and, asc, eq, gt, isNotNull, isNull, or, sql } from 'drizzle-orm';
import { Database, type TxDb } from '../database/database';
import { anggota, kodePendaftaranPerangkat, outlet, pengguna, penugasan, perangkatTerdaftar } from '../database/schema';
import { hashToken } from '../identitas/kripto';
import { SesiGuard } from '../identitas/sesi.guard';
import {
  daftarIzin,
  muatAnggota,
  PERAN_PEMILIK,
  type Pelaku,
  PelakuAktif,
  periksaIzinRute,
  PerluIzin,
  type RequestBerpelaku,
} from '../izin/izin';
import { Jam } from '../umum/jam';
import { objek, teks, tidakDitemukan, tidakValid } from '../umum/validasi';
import { pinValid, verifikasiPin } from './pin';
import { bacaTokenBertenant, buatKodePendaftaran, buatTokenBertenant, normalisasiKode } from './token';

const LAMA_KODE_MS = 24 * 60 * 60 * 1000;

type BarisPerangkat = typeof perangkatTerdaftar.$inferSelect;

/** Perangkat Terdaftar yang sedang membuat request (diisi PerangkatGuard). */
export interface PerangkatAktif {
  id: string;
  tenantId: string;
  outletId: string;
  nama: string;
  awalan: string;
  anggotaAktifId: string | null;
}

type RequestBerperangkat = RequestBerpelaku & { perangkat?: PerangkatAktif };

const TANPA_ANGGOTA = 'lifestore:tanpaAnggota';

/** Rute Perangkat Terdaftar yang cukup dengan token perangkat, tanpa Anggota masuk PIN. */
export const TanpaAnggota = () => SetMetadata(TANPA_ANGGOTA, true);

export const Perangkat = createParamDecorator((_: unknown, ctx: ExecutionContext): PerangkatAktif => {
  const p = ctx.switchToHttp().getRequest<RequestBerperangkat>().perangkat;
  if (!p) throw new UnauthorizedException({ kode: 'perangkat_tidak_dikenal', pesan: 'Perangkat belum terdaftar.' });
  return p;
});

/** Anggota boleh masuk di Outlet ini bila Pemilik atau punya Penugasan ke Outlet itu. */
export function bolehDiOutlet(p: Pick<Pelaku, 'peran' | 'penugasan'>, outletId: string): boolean {
  return p.peran === PERAN_PEMILIK || p.penugasan.some((t) => t.outletId === outletId);
}

function tidakDitugaskan(): ForbiddenException {
  return new ForbiddenException({ kode: 'tidak_ditugaskan', pesan: 'Anda tidak punya Penugasan di Outlet perangkat ini.' });
}

/**
 * Autentikasi kedua (kasir, KDS): `Authorization: Perangkat <token>` + Anggota yang sedang
 * masuk dengan PIN di perangkat itu. Mengisi `konteksTenant` dengan Tenant dan Outlet perangkat,
 * memeriksa ulang Anggota dan Penugasannya tiap request, lalu memeriksa `@PerluIzin`
 * terhadap Outlet perangkat. `@TanpaAnggota()` melewati syarat PIN.
 */
@Injectable()
export class PerangkatGuard implements CanActivate {
  constructor(
    private readonly db: Database,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<RequestBerperangkat>();
    const token = /^Perangkat (.+)$/.exec(req.headers.authorization ?? '')?.[1];
    const tenantId = token ? bacaTokenBertenant(token) : null;
    const tidakDikenal = () => new UnauthorizedException({ kode: 'perangkat_tidak_dikenal', pesan: 'Perangkat belum terdaftar.' });
    if (!token || !tenantId) throw tidakDikenal();

    const hasil = await this.db.denganTenant({ tenantId }, async (tx) => {
      const [p] = await tx.select().from(perangkatTerdaftar).where(eq(perangkatTerdaftar.hashToken, hashToken(token)));
      if (!p) return undefined;
      const a = p.anggotaAktifId && !p.dicabutPada ? await muatAnggota(tx, { anggotaId: p.anggotaAktifId }) : undefined;
      return { p, a };
    });
    if (!hasil) throw tidakDikenal();
    const { p, a } = hasil;
    if (p.dicabutPada) throw new UnauthorizedException({ kode: 'perangkat_dicabut', pesan: 'Perangkat ini sudah dicabut.' });

    req.perangkat = { id: p.id, tenantId: p.tenantId, outletId: p.outletId, nama: p.nama, awalan: p.awalan, anggotaAktifId: p.anggotaAktifId };
    req.konteksTenant = { tenantId: p.tenantId, outletId: p.outletId };
    if (this.reflector.getAllAndOverride<boolean>(TANPA_ANGGOTA, [ctx.getHandler(), ctx.getClass()])) return true;

    if (!a) throw new UnauthorizedException({ kode: 'perlu_pin', pesan: 'Masuk dengan PIN terlebih dahulu.' });
    if (!bolehDiOutlet(a, p.outletId)) throw tidakDitugaskan();
    const pelaku: Pelaku = { ...a, perangkatId: p.id, outletId: p.outletId };
    periksaIzinRute(this.reflector, ctx, pelaku);
    req.pelaku = pelaku;
    return true;
  }
}

function statusPerangkat(p: BarisPerangkat) {
  return p.dicabutPada ? 'dicabut' : p.terdaftarPada ? 'terdaftar' : 'menunggu_pendaftaran';
}

function tampilkanPerangkat(p: BarisPerangkat) {
  return {
    id: p.id,
    outletId: p.outletId,
    nama: p.nama,
    awalan: p.awalan,
    status: statusPerangkat(p),
    terdaftarPada: p.terdaftarPada,
    dicabutPada: p.dicabutPada,
    anggotaAktifId: p.anggotaAktifId,
  };
}

/** Siap Jualan: Outlet punya minimal satu Perangkat Terdaftar yang aktif (terdaftar, belum dicabut). */
export async function adaPerangkatAktif(tx: TxDb, outletId: string): Promise<boolean> {
  const [p] = await tx
    .select({ id: perangkatTerdaftar.id })
    .from(perangkatTerdaftar)
    .where(and(eq(perangkatTerdaftar.outletId, outletId), isNotNull(perangkatTerdaftar.terdaftarPada), isNull(perangkatTerdaftar.dicabutPada)))
    .limit(1);
  return p !== undefined;
}

/** Kelola Perangkat Terdaftar dari dashboard (sesi Pengguna). */
@Controller('outlet/:outletId/perangkat')
@UseGuards(SesiGuard)
export class PerangkatController {
  constructor(
    private readonly db: Database,
    private readonly jam: Jam,
  ) {}

  @Get()
  @PerluIzin('perangkat.kelola', { outletParam: 'outletId' })
  async daftar(@Param('outletId') outletId: string) {
    await this.pastikanOutlet(outletId);
    const baris = await this.db
      .tenant()
      .select()
      .from(perangkatTerdaftar)
      .where(eq(perangkatTerdaftar.outletId, outletId))
      .orderBy(asc(perangkatTerdaftar.createdAt), asc(perangkatTerdaftar.id));
    return baris.map(tampilkanPerangkat);
  }

  /**
   * Siapkan Perangkat Terdaftar baru. Mengembalikan kode pendaftaran sekali pakai (berlaku 24 jam)
   * yang diketik di tablet/PC. `awalan` (1–3 huruf) dipakai untuk Nomor Pesanan, misal A-023.
   */
  @Post()
  @HttpCode(201)
  @PerluIzin('perangkat.kelola', { outletParam: 'outletId' })
  async tambah(@Param('outletId') outletId: string, @Body() body: unknown) {
    const o = await this.pastikanOutlet(outletId);
    const m = objek(body);
    const nama = teks(m, 'nama', { maks: 100 });
    const awalan = teks(m, 'awalan', { maks: 3 }).toUpperCase();
    if (!/^[A-Z]{1,3}$/.test(awalan)) throw tidakValid('awalan', 'Awalan 1–3 huruf, misal A.');

    const tx = this.db.tenant();
    const [bentrok] = await tx
      .select({ id: perangkatTerdaftar.id })
      .from(perangkatTerdaftar)
      .where(and(eq(perangkatTerdaftar.outletId, outletId), eq(perangkatTerdaftar.awalan, awalan), isNull(perangkatTerdaftar.dicabutPada)));
    if (bentrok) throw new ConflictException({ kode: 'awalan_dipakai', pesan: `Awalan ${awalan} sudah dipakai perangkat lain di Outlet ini.` });

    const [p] = await tx.insert(perangkatTerdaftar).values({ tenantId: o.tenantId, outletId, nama, awalan }).returning();
    const kode = buatKodePendaftaran();
    const kedaluwarsaPada = new Date(this.jam.sekarang().getTime() + LAMA_KODE_MS);
    await tx.insert(kodePendaftaranPerangkat).values({ hashKode: hashToken(kode), perangkatTenantId: o.tenantId, perangkatId: p!.id, kedaluwarsaPada });
    return { ...tampilkanPerangkat(p!), kodePendaftaran: kode, kodeKedaluwarsaPada: kedaluwarsaPada };
  }

  /** Cabut perangkat (misal hilang): token langsung ditolak dan Anggota yang masuk dikeluarkan. */
  @Post(':id/cabut')
  @HttpCode(200)
  @PerluIzin('perangkat.kelola', { outletParam: 'outletId' })
  async cabut(@Param('outletId') outletId: string, @Param('id') id: string) {
    const tx = this.db.tenant();
    const [p] = await tx
      .update(perangkatTerdaftar)
      .set({ dicabutPada: sql`coalesce(${perangkatTerdaftar.dicabutPada}, now())`, anggotaAktifId: null, anggotaMasukPada: null })
      .where(and(eq(perangkatTerdaftar.id, id), eq(perangkatTerdaftar.outletId, outletId)))
      .returning();
    if (!p) throw tidakDitemukan('Perangkat Terdaftar');
    await tx.delete(kodePendaftaranPerangkat).where(eq(kodePendaftaranPerangkat.perangkatId, p.id));
    return tampilkanPerangkat(p);
  }

  private async pastikanOutlet(outletId: string) {
    const [o] = await this.db.tenant().select({ id: outlet.id, tenantId: outlet.tenantId }).from(outlet).where(eq(outlet.id, outletId));
    if (!o) throw tidakDitemukan('Outlet');
    return o;
  }
}

/** Sisi Perangkat Terdaftar: daftar dengan kode, masuk/keluar PIN, dan buka kasir. */
@Controller()
export class PerangkatKasirController {
  constructor(
    private readonly db: Database,
    private readonly jam: Jam,
  ) {}

  /** Tukar kode pendaftaran sekali pakai dengan token perangkat (disimpan di perangkat). */
  @Post('perangkat/daftar')
  @HttpCode(200)
  async daftar(@Body() body: unknown) {
    const kode = normalisasiKode(teks(objek(body), 'kode', { maks: 20 }));
    const hash = hashToken(kode);
    const tidakBerlaku = () => tidakValid('kode', 'Kode pendaftaran tidak valid, sudah dipakai, atau kedaluwarsa.');
    const [k] = await this.db.global.select().from(kodePendaftaranPerangkat).where(eq(kodePendaftaranPerangkat.hashKode, hash));
    if (!k) throw tidakBerlaku();

    const sekarang = this.jam.sekarang();
    const token = buatTokenBertenant(k.perangkatTenantId);
    const p = await this.db.denganTenant({ tenantId: k.perangkatTenantId }, async (tx) => {
      // Hapus-dan-kembalikan menjamin kode hanya bisa dipakai sekali, walau dikirim bersamaan.
      const [dipakai] = await tx
        .delete(kodePendaftaranPerangkat)
        .where(and(eq(kodePendaftaranPerangkat.hashKode, hash), gt(kodePendaftaranPerangkat.kedaluwarsaPada, sekarang)))
        .returning();
      if (!dipakai) return undefined;
      const [baru] = await tx
        .update(perangkatTerdaftar)
        .set({ hashToken: hashToken(token), terdaftarPada: sekarang })
        .where(and(eq(perangkatTerdaftar.id, dipakai.perangkatId), isNull(perangkatTerdaftar.dicabutPada), isNull(perangkatTerdaftar.hashToken)))
        .returning();
      return baru;
    });
    if (!p) throw tidakBerlaku();
    return { tokenPerangkat: token, perangkat: tampilkanPerangkat(p) };
  }

  /** Info perangkat untuk layar PIN: Outlet, Anggota yang sedang masuk, dan karyawan yang bisa masuk. */
  @Get('perangkat/saya')
  @UseGuards(PerangkatGuard)
  @TanpaAnggota()
  async saya(@Perangkat() p: PerangkatAktif) {
    const tx = this.db.tenant();
    const [o] = await tx.select({ id: outlet.id, nama: outlet.nama }).from(outlet).where(eq(outlet.id, p.outletId));
    const karyawan = await tx
      .selectDistinct({ id: anggota.id, nama: anggota.nama, email: pengguna.email, createdAt: anggota.createdAt })
      .from(anggota)
      .leftJoin(pengguna, eq(pengguna.id, anggota.penggunaId))
      .leftJoin(penugasan, and(eq(penugasan.anggotaId, anggota.id), eq(penugasan.outletId, p.outletId)))
      .where(and(eq(anggota.aktif, true), isNotNull(anggota.hashPin), or(eq(anggota.peran, PERAN_PEMILIK), isNotNull(penugasan.id))))
      .orderBy(asc(anggota.createdAt), asc(anggota.id));
    const a = p.anggotaAktifId ? await muatAnggota(tx, { anggotaId: p.anggotaAktifId }) : undefined;
    return {
      perangkat: { id: p.id, nama: p.nama, awalan: p.awalan },
      outlet: o,
      anggotaAktif: a && bolehDiOutlet(a, p.outletId) ? { id: a.anggotaId, peran: a.peran, izin: daftarIzin(a, p.outletId) } : null,
      karyawan: karyawan.map((k) => ({ id: k.id, nama: k.nama ?? k.email })),
    };
  }

  /**
   * Masuk dengan PIN di Perangkat Terdaftar. Anggota harus Pemilik atau punya Penugasan ke
   * Outlet perangkat. PIN dikunci sementara setelah beberapa kali salah.
   */
  @Post('perangkat/masuk')
  @HttpCode(200)
  @UseGuards(PerangkatGuard)
  @TanpaAnggota()
  async masuk(@Perangkat() p: PerangkatAktif, @Body() body: unknown) {
    const m = objek(body);
    const anggotaId = teks(m, 'anggotaId', { maks: 64 });
    const pin = pinValid(m);
    await verifikasiPin(this.db, { tenantId: p.tenantId, outletId: p.outletId }, anggotaId, pin, this.jam.sekarang());

    const tx = this.db.tenant();
    const a = await muatAnggota(tx, { anggotaId });
    if (!a) throw new UnauthorizedException({ kode: 'pin_salah', pesan: 'PIN salah.' });
    if (!bolehDiOutlet(a, p.outletId)) throw tidakDitugaskan();
    await tx
      .update(perangkatTerdaftar)
      .set({ anggotaAktifId: a.anggotaId, anggotaMasukPada: this.jam.sekarang() })
      .where(eq(perangkatTerdaftar.id, p.id));
    return { anggota: { id: a.anggotaId, peran: a.peran }, izin: daftarIzin(a, p.outletId) };
  }

  /** Keluar: perangkat kembali ke layar PIN. */
  @Post('perangkat/keluar')
  @HttpCode(204)
  @UseGuards(PerangkatGuard)
  @TanpaAnggota()
  async keluar(@Perangkat() p: PerangkatAktif): Promise<void> {
    await this.db.tenant().update(perangkatTerdaftar).set({ anggotaAktifId: null, anggotaMasukPada: null }).where(eq(perangkatTerdaftar.id, p.id));
  }

  /** Buka kasir di Perangkat Terdaftar: butuh izin `kasir.buka` di Outlet perangkat. */
  @Get('kasir')
  @UseGuards(PerangkatGuard)
  @PerluIzin('kasir.buka')
  async kasir(@Perangkat() p: PerangkatAktif, @PelakuAktif() pelaku: Pelaku) {
    const [o] = await this.db.tenant().select({ id: outlet.id, nama: outlet.nama }).from(outlet).where(eq(outlet.id, p.outletId));
    return {
      perangkat: { id: p.id, nama: p.nama, awalan: p.awalan },
      outlet: o,
      anggota: { id: pelaku.anggotaId, peran: pelaku.peran },
      izin: daftarIzin(pelaku, p.outletId),
    };
  }
}
