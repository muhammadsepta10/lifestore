import { Controller, Get, Global, Injectable, Module, UseGuards } from '@nestjs/common';
import { desc, eq, sql } from 'drizzle-orm';
import { Database } from '../database/database';
import { logAudit, pengguna } from '../database/schema';
import { SesiGuard } from '../identitas/sesi.guard';

/** Siapa yang melakukan aksi. Sesi dashboard mengisi `penggunaId`; kasir nanti juga `perangkatId`. */
export interface Pelaku {
  penggunaId?: string | null;
  perangkatId?: string | null;
}

export interface CatatanAudit {
  /** Nama aksi, snake_case, misal `ubah_profil_pajak`, `void_tagihan`. */
  aksi: string;
  entitas: string;
  entitasId: string;
  outletId?: string | null;
  pelaku: Pelaku;
  sebelum?: unknown;
  sesudah?: unknown;
  alasan?: string | null;
  /** Anggota yang memberi Persetujuan Atasan, bila ada. */
  penyetujuAnggotaId?: string | null;
}

/**
 * Penulis Log Audit tunggal. Harus dipanggil di dalam transaksi Tenant (request ber-sesi atau
 * `Database.denganTenant`), sehingga catatan ikut dibatalkan bila aksinya gagal. Tenant diambil
 * dari konteks transaksi (`app_tenant_id()`), bukan dari pemanggil.
 * Log Audit append-only: peran database aplikasi tidak punya hak UPDATE/DELETE.
 */
@Injectable()
export class PenulisLogAudit {
  constructor(private readonly db: Database) {}

  async catat(c: CatatanAudit): Promise<void> {
    await this.db
      .tenant()
      .insert(logAudit)
      .values({
        tenantId: sql`app_tenant_id()`,
        outletId: c.outletId ?? null,
        aksi: c.aksi,
        entitas: c.entitas,
        entitasId: c.entitasId,
        penggunaId: c.pelaku.penggunaId ?? null,
        perangkatId: c.pelaku.perangkatId ?? null,
        sebelum: c.sebelum ?? null,
        sesudah: c.sesudah ?? null,
        alasan: c.alasan ?? null,
        penyetujuAnggotaId: c.penyetujuAnggotaId ?? null,
      });
  }
}

/** Baca Log Audit Tenant aktif. Sengaja tidak ada rute ubah atau hapus. */
@Controller('log-audit')
@UseGuards(SesiGuard)
export class LogAuditController {
  constructor(private readonly db: Database) {}

  @Get()
  async daftar() {
    const baris = await this.db
      .tenant()
      .select({ log: logAudit, email: pengguna.email })
      .from(logAudit)
      .leftJoin(pengguna, eq(pengguna.id, logAudit.penggunaId))
      .orderBy(desc(logAudit.createdAt), desc(logAudit.id))
      .limit(200);
    return baris.map(({ log, email }) => ({
      id: log.id,
      waktu: log.createdAt,
      aksi: log.aksi,
      entitas: log.entitas,
      entitasId: log.entitasId,
      outletId: log.outletId,
      pelaku: { penggunaId: log.penggunaId, email, perangkatId: log.perangkatId },
      sebelum: log.sebelum,
      sesudah: log.sesudah,
      alasan: log.alasan,
      penyetujuAnggotaId: log.penyetujuAnggotaId,
    }));
  }
}

@Global()
@Module({ controllers: [LogAuditController], providers: [PenulisLogAudit], exports: [PenulisLogAudit] })
export class AuditModule {}
