import { type CallHandler, type ExecutionContext, Injectable, type NestInterceptor } from '@nestjs/common';
import { defaultIfEmpty, firstValueFrom, from, type Observable } from 'rxjs';
import { Database } from './database';
import type { RequestBertenant } from './konteks-tenant';

/**
 * Membungkus setiap request ber-Tenant dalam satu transaksi database (ADR 0001).
 * Guard berjalan sebelum interceptor, jadi `konteksTenant` sudah terisi di sini.
 * Request tanpa konteks Tenant tetap dilayani, tetapi `Database.tenant()` akan melempar error.
 * Bila handler gagal, seluruh tulisan request dibatalkan.
 */
@Injectable()
export class TransaksiTenantInterceptor implements NestInterceptor {
  constructor(private readonly database: Database) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (ctx.getType() !== 'http') return next.handle();
    const konteks = ctx.switchToHttp().getRequest<RequestBertenant>().konteksTenant;
    if (!konteks) return next.handle();
    return from(
      this.database.denganTenant(konteks, () => firstValueFrom(next.handle().pipe(defaultIfEmpty(undefined)))),
    );
  }
}
