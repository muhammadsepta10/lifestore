import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buatDuniaTes, type DuniaTes } from './support/dunia-tes';

describe('Kesehatan API', () => {
  let dunia: DuniaTes;
  beforeAll(async () => {
    dunia = await buatDuniaTes();
  });
  afterAll(() => dunia?.tutup());

  it('melaporkan API dan database sehat', async () => {
    const res = await dunia.http.get('/v1/health').expect(200);
    expect(res.body).toEqual({ status: 'ok', database: 'ok' });
  });
});
