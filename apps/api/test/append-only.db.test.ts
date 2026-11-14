import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buatDatabaseTes, type DatabaseTes } from './support/database-tes';

// Tes langsung ke database (ADR 0003): yang dibuktikan adalah hak peran aplikasi di database itu
// sendiri. Hak diperiksa sebelum baris disentuh, jadi tabelnya tidak perlu berisi.

describe('Tabel append-only di database', () => {
  let db: DatabaseTes;
  let app: pg.Pool;

  beforeAll(async () => {
    db = await buatDatabaseTes();
    app = new pg.Pool({ connectionString: db.appUrl, max: 1 });
  });
  afterAll(async () => {
    await app?.end();
    await db?.hapus();
  });

  it.each([
    `UPDATE item_pesanan SET harga_satuan = 1, jumlah = 99`,
    `UPDATE item_pesanan SET tagihan_id = 'lain'`,
    `DELETE FROM item_pesanan`,
    `TRUNCATE item_pesanan`,
    `UPDATE pemindahan_item_pesanan SET ke_tagihan_id = 'lain'`,
    `DELETE FROM pemindahan_item_pesanan`,
    `TRUNCATE pemindahan_item_pesanan`,
    `UPDATE pesanan SET nomor_pesanan = 'X-999'`,
    `DELETE FROM pesanan`,
    `UPDATE kejadian_item_pesanan SET status = 'batal'`,
    `DELETE FROM kejadian_item_pesanan`,
    `UPDATE pembayaran SET jumlah = 1`,
    `DELETE FROM pembayaran`,
    `UPDATE log_audit SET aksi = 'dihapus'`,
    `DELETE FROM log_audit`,
    `TRUNCATE log_audit`,
    `UPDATE perintah_klien SET jenis = 'lain'`,
    `DELETE FROM perintah_klien`,
    `DELETE FROM tagihan`,
  ])('peran aplikasi tidak boleh: %s', async (perintah) => {
    await expect(app.query(perintah)).rejects.toMatchObject({ code: '42501' });
  });
});
