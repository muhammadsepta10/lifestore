import {
  type CanActivate,
  Controller,
  type ExecutionContext,
  Get,
  Injectable,
  Module,
  Post,
  UseGuards,
} from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Database } from '../src/database/database';
import { merek } from '../src/database/schema';
import type { RequestBertenant } from '../src/database/konteks-tenant';
import { buatDuniaTes, type DuniaTes } from './support/dunia-tes';

// Membuktikan pola per request (ADR 0001): setiap request ber-Tenant berjalan di satu transaksi
// yang memasang tenant_id dan Outlet aktif sebagai setting sesi.
//
// Autentikasi sungguhan (sesi Pengguna, token Perangkat Terdaftar) baru ada di #34/#36, jadi tes ini
// memakai guard khusus tes yang mengisi `request.konteksTenant` dari header. Guard asli nanti
// mengisi field yang sama.

const TENANT_A = '00000000-0000-4000-8000-00000000000a';
const TENANT_B = '00000000-0000-4000-8000-00000000000b';
const OUTLET_A = '00000000-0000-4000-8000-0000000000a1';

@Injectable()
class KonteksDariHeaderTes implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<RequestBertenant>();
    const tenantId = req.headers['x-tes-tenant'];
    const outletId = req.headers['x-tes-outlet'];
    if (typeof tenantId === 'string') {
      req.konteksTenant = { tenantId, outletId: typeof outletId === 'string' ? outletId : null };
    }
    return true;
  }
}

@Controller('tes')
@UseGuards(KonteksDariHeaderTes)
class PengujiController {
  constructor(private readonly db: Database) {}

  @Get('merek')
  async daftarMerek() {
    return this.db.tenant().select({ nama: merek.nama }).from(merek);
  }

  @Get('konteks')
  async konteks() {
    const { rows } = await this.db.tenant().execute(sql`select app_tenant_id() as "tenantId", app_outlet_id() as "outletId"`);
    return rows[0];
  }

  @Post('merek-lalu-gagal')
  async tambahLaluGagal() {
    const tenantId = (await this.konteks())?.tenantId as string;
    await this.db.tenant().insert(merek).values({ tenantId, nama: 'Tidak jadi' });
    throw new Error('gagal setelah menulis');
  }
}

@Module({ controllers: [PengujiController], providers: [KonteksDariHeaderTes] })
class PengujiModule {}

describe('Transaksi Tenant per request', () => {
  let dunia: DuniaTes;

  beforeAll(async () => {
    dunia = await buatDuniaTes({ modulTambahan: [PengujiModule] });
    // Belum ada API pembuatan Tenant (#34), jadi data awal disisipkan langsung.
    await dunia.db.admin.query(`INSERT INTO tenant (id, nama) VALUES ($1, 'Warung A'), ($2, 'Warung B')`, [TENANT_A, TENANT_B]);
    await dunia.db.admin.query(`INSERT INTO merek (tenant_id, nama) VALUES ($1, 'Merek A'), ($2, 'Merek B')`, [TENANT_A, TENANT_B]);
  });
  afterAll(() => dunia?.tutup());

  it('request Tenant A hanya melihat data Tenant A', async () => {
    const res = await dunia.http.get('/v1/tes/merek').set('x-tes-tenant', TENANT_A).expect(200);
    expect(res.body).toEqual([{ nama: 'Merek A' }]);
  });

  it('tenant_id dan Outlet aktif terpasang sebagai setting sesi', async () => {
    const res = await dunia.http.get('/v1/tes/konteks').set('x-tes-tenant', TENANT_A).set('x-tes-outlet', OUTLET_A).expect(200);
    expect(res.body).toEqual({ tenantId: TENANT_A, outletId: OUTLET_A });
  });

  it('request paralel dari dua Tenant tidak pernah saling melihat data', async () => {
    const hasil = await Promise.all(
      Array.from({ length: 30 }, (_, i) => {
        const tenant = i % 2 === 0 ? TENANT_A : TENANT_B;
        return dunia.http
          .get('/v1/tes/merek')
          .set('x-tes-tenant', tenant)
          .then((res) => ({ tenant, body: res.body }));
      }),
    );
    for (const { tenant, body } of hasil) {
      expect(body).toEqual([{ nama: tenant === TENANT_A ? 'Merek A' : 'Merek B' }]);
    }
  });

  it('request tanpa konteks Tenant ditolak, bukan dilayani tanpa isolasi', async () => {
    const res = await dunia.http.get('/v1/tes/merek');
    expect(res.status).toBe(500);
    expect(res.body).not.toEqual(expect.arrayContaining([expect.objectContaining({ nama: expect.any(String) })]));
  });

  it('request yang gagal membatalkan semua tulisannya', async () => {
    await dunia.http.post('/v1/tes/merek-lalu-gagal').set('x-tes-tenant', TENANT_A).expect(500);
    const res = await dunia.http.get('/v1/tes/merek').set('x-tes-tenant', TENANT_A).expect(200);
    expect(res.body).toEqual([{ nama: 'Merek A' }]);
  });
});
