import type { Request } from 'express';

/**
 * Konteks Tenant satu request. Diisi oleh guard autentikasi (sesi Pengguna atau token
 * Perangkat Terdaftar, mulai #34/#36) ke `request.konteksTenant`. Interceptor transaksi
 * lalu membuka transaksi dan memasang nilainya sebagai setting sesi Postgres.
 */
export interface KonteksTenant {
  tenantId: string;
  /** Outlet aktif (misal Outlet Perangkat Terdaftar); null bila request tidak terikat Outlet. */
  outletId?: string | null;
}

export type RequestBertenant = Request & { konteksTenant?: KonteksTenant };
