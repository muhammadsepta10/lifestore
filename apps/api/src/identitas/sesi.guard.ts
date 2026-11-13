import {
  type CanActivate,
  createParamDecorator,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { and, eq, gt } from 'drizzle-orm';
import { Database } from '../database/database';
import type { RequestBertenant } from '../database/konteks-tenant';
import { anggota, sesi } from '../database/schema';
import { hashToken } from './kripto';

/** Sesi dashboard Pengguna yang sudah diperiksa guard. */
export interface SesiPengguna {
  id: string;
  penggunaId: string;
  tenantAktifId: string | null;
  /** Anggota Pengguna di Tenant aktif (hanya terisi di rute yang butuh Tenant). */
  anggota?: { id: string; peran: string };
}

export type RequestBersesi = RequestBertenant & { sesi?: SesiPengguna };

const TANPA_TENANT = 'lifestore:tanpaTenant';

/** Rute yang cukup dengan sesi Pengguna, tanpa Tenant aktif (misal memilih Tenant). */
export const TanpaTenant = () => SetMetadata(TANPA_TENANT, true);

/** Parameter handler: sesi Pengguna yang sedang aktif. */
export const Sesi = createParamDecorator((_: unknown, ctx: ExecutionContext): SesiPengguna => {
  const s = ctx.switchToHttp().getRequest<RequestBersesi>().sesi;
  if (!s) throw new UnauthorizedException({ kode: 'belum_masuk', pesan: 'Silakan masuk.' });
  return s;
});

/**
 * Guard sesi dashboard (`Authorization: Bearer <token>`). Secara default rute butuh Tenant aktif:
 * guard mengisi `request.konteksTenant` sehingga seluruh handler berjalan di transaksi Tenant (RLS).
 */
@Injectable()
export class SesiGuard implements CanActivate {
  constructor(
    private readonly db: Database,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<RequestBersesi>();
    const token = /^Bearer (.+)$/.exec(req.headers.authorization ?? '')?.[1];
    if (!token) throw new UnauthorizedException({ kode: 'belum_masuk', pesan: 'Silakan masuk.' });

    const [baris] = await this.db.global
      .select({ id: sesi.id, penggunaId: sesi.penggunaId, tenantAktifId: sesi.tenantAktifId })
      .from(sesi)
      .where(and(eq(sesi.hashToken, hashToken(token)), gt(sesi.kedaluwarsaPada, new Date())));
    if (!baris) throw new UnauthorizedException({ kode: 'sesi_tidak_valid', pesan: 'Sesi berakhir, silakan masuk lagi.' });
    req.sesi = baris;

    const tanpaTenant = this.reflector.getAllAndOverride<boolean>(TANPA_TENANT, [ctx.getHandler(), ctx.getClass()]);
    if (tanpaTenant) return true;
    if (!baris.tenantAktifId) {
      throw new ForbiddenException({ kode: 'tenant_belum_dipilih', pesan: 'Pilih Tenant terlebih dahulu.' });
    }
    const konteks = { tenantId: baris.tenantAktifId };
    // Keanggotaan diperiksa ulang tiap request: Anggota yang dicabut langsung kehilangan akses.
    const [keanggotaan] = await this.db.denganTenant(konteks, (tx) =>
      tx.select({ id: anggota.id, peran: anggota.peran }).from(anggota).where(eq(anggota.penggunaId, baris.penggunaId)),
    );
    if (!keanggotaan) throw new ForbiddenException({ kode: 'bukan_anggota', pesan: 'Anda bukan Anggota Tenant ini.' });
    req.sesi = { ...baris, anggota: keanggotaan };
    req.konteksTenant = konteks;
    return true;
  }
}
