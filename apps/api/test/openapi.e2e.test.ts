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

  it('setiap perintah kasir punya skema body dan skema respons', async () => {
    type Skema = { type?: string; $ref?: string; required?: string[]; properties?: Record<string, Skema & { enum?: string[] }> };
    type Operasi = {
      requestBody?: { content: Record<string, { schema: Skema }> };
      responses: Record<string, { content?: Record<string, { schema: Skema }> }>;
    };
    const dok = (await dunia.http.get('/v1/openapi.json').expect(200)).body as {
      paths: Record<string, Record<string, Operasi>>;
      components: { schemas: Record<string, Skema> };
    };
    const body = (path: string, metode: string) => dok.paths[path]?.[metode]?.requestBody?.content['application/json']?.schema;
    const respons = (path: string, metode: string, status: string) => dok.paths[path]?.[metode]?.responses[status]?.content?.['application/json']?.schema;

    // Semua perintah kasir yang mengubah data: body berupa objek ber-`id` (kunci idempoten) dan respons sukses berskema.
    for (const [path, metode, status] of [
      ['/v1/tagihan', 'post', '201'],
      ['/v1/tagihan/{tagihanId}/pesanan', 'post', '201'],
      ['/v1/tagihan/{tagihanId}/pembayaran', 'post', '201'],
      ['/v1/tagihan/{tagihanId}/void', 'post', '200'],
      ['/v1/tagihan/{tagihanId}/diskon', 'put', '200'],
      ['/v1/tagihan/{tagihanId}/pindah-meja', 'post', '200'],
      ['/v1/tagihan/{tagihanId}/gabung-meja', 'post', '200'],
      ['/v1/tagihan/{tagihanId}/pisah', 'post', '201'],
      ['/v1/laci/buka', 'post', '200'],
      ['/v1/shift', 'post', '201'],
      ['/v1/shift/{id}/kas', 'post', '201'],
      ['/v1/shift/{id}/tutup', 'post', '200'],
    ] as const) {
      expect(body(path, metode)?.type, `body ${metode} ${path}`).toBe('object');
      expect(Object.keys(body(path, metode)?.properties ?? {}), `id ${metode} ${path}`).toContain('id');
      expect(respons(path, metode, status), `respons ${status} ${metode} ${path}`).toBeDefined();
    }
    // Perintah tanpa id (idempoten dengan sendirinya) tetap berskema.
    expect(body('/v1/tagihan/{tagihanId}/item/{itemId}/batal', 'post')?.type).toBe('object');
    expect(body('/v1/kds/status', 'post')).toMatchObject({ required: ['itemIds', 'status'], properties: { status: { enum: ['dimasak', 'siap', 'disajikan'] } } });

    // Contoh rinci: Pembayaran.
    expect(body('/v1/tagihan/{tagihanId}/pembayaran', 'post')).toMatchObject({
      required: ['metode'],
      properties: { metode: { enum: ['tunai', 'qris_statis', 'edc', 'transfer'] }, jumlah: { type: 'integer' }, diterima: { type: 'integer' }, referensi: { type: 'string' } },
    });
    expect(respons('/v1/tagihan/{tagihanId}/pembayaran', 'post', '201')).toMatchObject({
      properties: { pembayaran: { $ref: '#/components/schemas/Pembayaran' }, tagihan: { $ref: '#/components/schemas/Tagihan' } },
    });
    expect(respons('/v1/tagihan/{tagihanId}/void', 'post', '200')).toEqual({ $ref: '#/components/schemas/Tagihan' });
    expect(Object.keys(dok.components.schemas.Tagihan!.properties!)).toEqual(expect.arrayContaining(['id', 'status', 'kanal', 'rincian', 'total', 'dibayar', 'sisa', 'pesanan', 'pembayaran']));
    expect(dok.components.schemas.ItemPesanan!.properties!.status!.enum).toEqual(['ditahan', 'menunggu', 'dimasak', 'siap', 'disajikan', 'batal']);
    // Setiap $ref menunjuk skema yang ada.
    const rujukan = [...JSON.stringify(dok).matchAll(/"#\/components\/schemas\/([A-Za-z]+)"/g)].map((m) => m[1]!);
    expect(rujukan.length).toBeGreaterThan(10);
    for (const nama of rujukan) expect(dok.components.schemas[nama], nama).toBeDefined();
  });
});
