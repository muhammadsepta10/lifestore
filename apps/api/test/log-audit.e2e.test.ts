import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buatDuniaTes, type DuniaTes, type PemilikTes } from './support/dunia-tes';

describe('Log Audit', () => {
  let dunia: DuniaTes;
  let pemilik: PemilikTes;
  beforeAll(async () => {
    dunia = await buatDuniaTes();
    pemilik = await dunia.daftarTenant({ namaUsaha: 'Pecel Lele Mas Joko' });
  });
  afterAll(() => dunia?.tutup());

  it('perubahan Profil Pajak tercatat: siapa, kapan, sebelum, dan sesudah', async () => {
    await pemilik
      .post(`/v1/outlet/${pemilik.outletId}/profil-pajak`, {
        berlakuMulai: '2030-01-01',
        jenis: 'PBJT',
        tarifPersen: 12,
        labelStruk: 'PB1',
      })
      .expect(201);

    const res = await pemilik.get('/v1/log-audit').expect(200);
    expect(res.body).toHaveLength(1);
    const [catatan] = res.body;
    expect(catatan).toMatchObject({
      aksi: 'ubah_profil_pajak',
      outletId: pemilik.outletId,
      pelaku: { email: pemilik.email },
      sebelum: { jenis: 'PBJT', tarifPersen: 10, labelStruk: 'PBJT' },
      sesudah: { jenis: 'PBJT', tarifPersen: 12, labelStruk: 'PB1', berlakuMulai: '2030-01-01' },
    });
    expect(Date.now() - new Date(catatan.waktu).getTime()).toBeLessThan(60_000);
  });

  it('Log Audit tidak bisa diubah atau dihapus lewat API', async () => {
    const [catatan] = (await pemilik.get('/v1/log-audit').expect(200)).body;
    for (const res of [
      await pemilik.patch(`/v1/log-audit/${catatan.id}`, { aksi: 'lain' }),
      await pemilik.put(`/v1/log-audit/${catatan.id}`, { aksi: 'lain' }),
      await pemilik.delete(`/v1/log-audit/${catatan.id}`),
      await pemilik.delete('/v1/log-audit'),
    ]) {
      expect(res.status).toBe(404);
    }
    const sesudah = (await pemilik.get('/v1/log-audit').expect(200)).body;
    expect(sesudah).toEqual([catatan]);
  });

  it('peran database aplikasi tidak bisa mengubah atau menghapus Log Audit, bahkan di Tenant sendiri', async () => {
    const app = new pg.Pool({ connectionString: dunia.db.appUrl, max: 1 });
    try {
      const c = await app.connect();
      try {
        await c.query('BEGIN');
        await c.query(`SELECT set_config('app.tenant_id', $1, true)`, [pemilik.tenantId]);
        const { rows } = await c.query('SELECT count(*)::int AS n FROM log_audit');
        expect(rows).toEqual([{ n: 1 }]);
        await expect(c.query(`UPDATE log_audit SET aksi = 'dihapus'`)).rejects.toMatchObject({ code: '42501' });
        await c.query('ROLLBACK');
        await c.query('BEGIN');
        await c.query(`SELECT set_config('app.tenant_id', $1, true)`, [pemilik.tenantId]);
        await expect(c.query('DELETE FROM log_audit')).rejects.toMatchObject({ code: '42501' });
        await c.query('ROLLBACK');
        await expect(c.query('TRUNCATE log_audit')).rejects.toMatchObject({ code: '42501' });
      } finally {
        c.release();
      }
    } finally {
      await app.end();
    }
    expect((await pemilik.get('/v1/log-audit').expect(200)).body).toHaveLength(1);
  });
});
