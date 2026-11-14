import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buatDuniaTes, type DuniaTes } from './support/dunia-tes';

describe('OpenAPI yang dibuat dari kode', () => {
  let dunia: DuniaTes;
  beforeAll(async () => {
    dunia = await buatDuniaTes();
  });
  afterAll(() => dunia?.tutup());

  it('GET /v1/openapi.json menyajikan dokumen OpenAPI 3 berisi rute /v1 dari controller, tanpa perlu masuk', async () => {
    const res = await dunia.http.get('/v1/openapi.json').expect(200);
    expect(res.headers['content-type']).toMatch(/json/);
    const dok = res.body as {
      openapi: string;
      info: { title: string };
      paths: Record<string, Record<string, { parameters?: { name: string; in: string }[]; security?: Record<string, unknown>[] }>>;
      components: { securitySchemes: Record<string, unknown> };
    };
    expect(dok.openapi).toMatch(/^3\./);
    expect(dok.info.title).toBe('Lifestore API');
    // Rute lama dan baru muncul dengan metode dan parameter jalurnya.
    expect(Object.keys(dok.paths['/v1/tagihan']!).sort()).toEqual(['get', 'post']);
    expect(dok.paths['/v1/tagihan/{tagihanId}/pembayaran']!.post!.parameters).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'tagihanId', in: 'path' })]),
    );
    for (const [path, metode] of [
      ['/v1/daftar', 'post'],
      ['/v1/tagihan/{tagihanId}/pindah-meja', 'post'],
      ['/v1/tagihan/{tagihanId}/gabung-meja', 'post'],
      ['/v1/tagihan/{tagihanId}/pisah', 'post'],
      ['/v1/outlet/{outletId}/penjualan/hari-ini', 'get'],
      ['/v1/outlet/{outletId}/tagihan/{id}', 'get'],
      ['/v1/shift/{id}/tutup', 'post'],
    ] as const) {
      expect(dok.paths[path]?.[metode], `${metode} ${path}`).toBeDefined();
    }
    // Semua rute berada di bawah /v1.
    expect(Object.keys(dok.paths).every((p) => p.startsWith('/v1/'))).toBe(true);
    // Dua jenis autentikasi dideklarasikan dan dipasang sesuai guard controllernya.
    expect(Object.keys(dok.components.securitySchemes).sort()).toEqual(['perangkat', 'sesi']);
    expect(dok.paths['/v1/tagihan']!.post!.security).toEqual([{ perangkat: [] }]);
    expect(dok.paths['/v1/outlet/{outletId}/penjualan/hari-ini']!.get!.security).toEqual([{ sesi: [] }]);
    expect(dok.paths['/v1/daftar']!.post!.security ?? []).toEqual([]);
  });
});
