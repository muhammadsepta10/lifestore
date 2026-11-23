// Skrip Playwright MANUAL untuk alur kasir utama (#38). Bukan suite tes yang dipelihara: jalankan
// sebelum deploy untuk melihat alur ini bekerja di browser sungguhan.
//
//   Buka Shift → Tagihan bawa pulang → tambah Menu (dengan Varian, pilihan, catatan) → total langsung
//   → Kirim Pesanan → Bayar tunai dengan kembalian → struk ber-Nomor Nota → Tutup Shift → Laporan Shift.
//
// Cara termudah: `bash scripts/manual/jalankan-alur-kasir.sh` (membangun, memigrasi database baru,
// menyalakan api + web, lalu menjalankan skrip ini).
//
// Atau terhadap stack yang sudah jalan:
//   WEB_URL=http://localhost:3000 API_URL=http://localhost:3001 API_LOG=/path/api.log node scripts/manual/alur-kasir.mjs
// `API_LOG` adalah log api tempat tautan verifikasi email tercetak (mode tanpa RESEND_API_KEY).
// Butuh paket `playwright` (global boleh: NODE_PATH=$(npm root -g)). PW_CHANNEL=chrome memakai Chrome terpasang;
// HEADED=1 menampilkan jendela; SCREENSHOT_DIR menyimpan tangkapan layar tiap langkah.
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const { chromium } = createRequire(import.meta.url)('playwright');

const WEB = process.env.WEB_URL ?? 'http://localhost:3000';
const API = `${process.env.API_URL ?? 'http://localhost:3001'}/v1`;
const API_LOG = process.env.API_LOG;
const DIR = process.env.SCREENSHOT_DIR;

async function api(path, { method = 'GET', body, token } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const teks = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${teks}`);
  return teks ? JSON.parse(teks) : null;
}

/** Siapkan Tenant lewat API seperti pemilik di dashboard: Menu, Metode Bayar tunai, kasir ber-PIN, perangkat. */
async function siapkan() {
  assert(API_LOG, 'Atur API_LOG ke berkas log api (tautan verifikasi email dicetak di sana).');
  const email = `alur-kasir-${Date.now()}@contoh.test`;
  await api('/daftar', { method: 'POST', body: { email, kataSandi: 'kata-sandi-tes', namaUsaha: 'Warung Daun', kota: 'Bandung' } });
  await new Promise((r) => setTimeout(r, 500));
  const token = [...readFileSync(API_LOG, 'utf8').matchAll(/token=([A-Za-z0-9_-]+)/g)].pop()?.[1];
  assert(token, 'Tautan verifikasi tidak ditemukan di API_LOG.');
  await api('/verifikasi-email', { method: 'POST', body: { token } });
  const sesi = (await api('/masuk', { method: 'POST', body: { email, kataSandi: 'kata-sandi-tes' } })).token;
  const [outlet] = await api('/outlet', { token: sesi });
  const [merek] = await api('/merek', { token: sesi });
  const p = (path, body, method = 'POST') => api(path, { method, body, token: sesi });
  await p(`/outlet/${outlet.id}/metode-bayar/tunai`, { aktif: true }, 'PUT');
  const makanan = await p(`/merek/${merek.id}/kategori`, { nama: 'Makanan', warna: 'peach', ikon: '🍛' });
  const minuman = await p(`/merek/${merek.id}/kategori`, { nama: 'Minuman', warna: 'sky', ikon: '🥤' });
  await p(`/merek/${merek.id}/menu`, { kategoriId: makanan.id, nama: 'Nasi Goreng', harga: 25_000 });
  const habis = await p(`/merek/${merek.id}/menu`, { kategoriId: makanan.id, nama: 'Ayam Bakar', harga: 30_000 });
  await p(`/outlet/${outlet.id}/menu/${habis.id}/habis`, { habis: true }, 'PUT');
  await p(`/merek/${merek.id}/menu`, {
    kategoriId: minuman.id,
    nama: 'Kopi Susu',
    harga: 18_000,
    varian: [
      { nama: 'Reguler', harga: 18_000 },
      { nama: 'Jumbo', harga: 24_000 },
    ],
    grupPilihan: [{ nama: 'Topping', minimum: 0, maksimum: 1, pilihan: [{ nama: 'Boba', harga: 5_000 }] }],
  });
  const kasir = await p('/karyawan', { nama: 'Rina Kasir', pin: '1111', penugasan: [{ outletId: outlet.id, peran: 'kasir' }] });
  const perangkat = await p(`/outlet/${outlet.id}/perangkat`, { nama: 'Tablet Depan', awalan: 'A' });
  return { kode: perangkat.kodePendaftaran, kasirId: kasir.id };
}

const data = await siapkan();
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || undefined, headless: !process.env.HEADED });
const halaman = await browser.newPage({ viewport: { width: 1366, height: 900 } });
const galatKonsol = [];
halaman.on('pageerror', (e) => galatKonsol.push(String(e)));
if (DIR) mkdirSync(DIR, { recursive: true });
let langkahKe = 0;
async function langkah(nama, fn) {
  await fn();
  langkahKe += 1;
  if (DIR) await halaman.screenshot({ path: `${DIR}/${String(langkahKe).padStart(2, '0')}-${nama}.png`, fullPage: true });
  console.log(`✓ ${nama}`);
}
const teks = async (pemilih) => (await halaman.locator(pemilih).first().innerText()).replace(/\s+/g, ' ').trim();

try {
  await langkah('daftar-perangkat', async () => {
    await halaman.goto(`${WEB}/kasir`);
    await halaman.fill('input[name=kode]', data.kode);
    await halaman.click('button[type=submit]');
    await halaman.waitForSelector('input[name=pin]');
  });

  await langkah('masuk-pin', async () => {
    await halaman.check(`input[name=anggotaId][value="${data.kasirId}"]`);
    await halaman.fill('input[name=pin]', '1111');
    await halaman.click('button[type=submit]');
    await halaman.waitForSelector('[data-status-shift=belum]');
  });

  await langkah('buka-shift', async () => {
    await halaman.click('a[href="/kasir?modal=buka-shift"]');
    await halaman.fill('input[name=kasAwal]', '100000');
    await halaman.click('.modal button[type=submit]');
    await halaman.waitForSelector('[data-status-shift=terbuka]');
  });

  await langkah('tagihan-bawa-pulang', async () => {
    // Sebelum ada Tagihan terpilih, Menu belum bisa ditambahkan.
    assert.equal(await halaman.locator('button[data-menu="Nasi Goreng"]').isDisabled(), true);
    await halaman.click('.ostrip button.addcard');
    await halaman.waitForSelector('aside.order[data-tagihan]');
  });

  await langkah('tambah-menu', async () => {
    // Menu Habis tampil redup dan tidak bisa ditambahkan.
    const habis = halaman.locator('button[data-menu="Ayam Bakar"]');
    assert.equal(await habis.isDisabled(), true);
    assert.match(await habis.getAttribute('class'), /habis/);

    await halaman.click('button[data-menu="Nasi Goreng"]');
    await halaman.click('button[data-menu="Nasi Goreng"]');
    // Rp25.000 × 2 = 50.000; PBJT 10% = 5.000.
    assert.equal(await teks('[data-total]'), 'Rp55.000');

    await halaman.click('button[data-menu="Kopi Susu"]');
    await halaman.locator('.modal .opsi label', { hasText: 'Jumbo' }).click();
    await halaman.locator('.modal .opsi label', { hasText: 'Boba' }).click();
    await halaman.fill('.modal input.isian', 'Es sedikit');
    await halaman.locator('.modal .baris button.tombol:not(.tenang)').click();
    // + (24.000 + 5.000) = 79.000; PBJT 7.900; total 86.900.
    assert.equal(await teks('[data-subtotal]'), 'Rp79.000');
    assert.equal(await teks('[data-pajak]'), 'Rp7.900');
    assert.equal(await teks('[data-total]'), 'Rp86.900');
  });

  await langkah('kirim-pesanan', async () => {
    await halaman.locator('aside.order button.tombol.tinta').click();
    await halaman.waitForSelector('[data-pesanan="A-001"]');
    assert.equal(await halaman.locator('[data-keranjang]').count(), 0);
    assert.equal(await teks('[data-total]'), 'Rp86.900');
    assert.match(await teks('.ocard[aria-current=true]'), /A-001.*Rp86\.900/);
  });

  await langkah('bayar-tunai', async () => {
    await halaman.locator('aside.order > button.tombol.besar:not(.tinta)').click();
    await halaman.fill('input[name=diterima]', '100000');
    assert.equal(await teks('[data-kembalian] b'), 'Rp13.100');
    await halaman.locator('.modal .baris button.tombol:not(.tenang)').click();
    await halaman.waitForSelector('[data-struk]');
  });

  await langkah('struk', async () => {
    assert.equal(await halaman.locator('[data-struk]').getAttribute('data-nomor-nota'), '1');
    assert.equal(await teks('[data-struk] [data-total]'), 'Rp86.900');
    assert.equal(await teks('[data-struk] [data-kembalian]'), 'Rp13.100');
    await halaman.locator('.modal .baris a.tombol').click();
    await halaman.waitForURL(`${WEB}/kasir`);
    assert.equal(await halaman.locator('.ocard').count(), 0);
  });

  await langkah('tutup-shift', async () => {
    await halaman.click('a[href="/kasir?modal=tutup-shift"]');
    // Hitung Buta: modal tidak menampilkan angka sistem.
    assert.doesNotMatch(await teks('.modal'), /86\.900|186\.900/);
    await halaman.fill('input[name=hitungButa]', '186900');
    await halaman.click('.modal button[type=submit]');
    await halaman.waitForSelector('[data-laporan-shift]');
    const laporan = await teks('[data-laporan-shift]');
    assert.match(laporan, /Tunai Rp86\.900/);
    assert.match(laporan, /Kas seharusnya Rp186\.900/);
    assert.match(laporan, /Selisih Rp0/);
  });

  assert.deepEqual(galatKonsol, [], 'Ada galat JavaScript di halaman.');
  console.log('Alur kasir selesai tanpa galat.');
} catch (e) {
  if (DIR) await halaman.screenshot({ path: `${DIR}/gagal.png`, fullPage: true }).catch(() => undefined);
  throw e;
} finally {
  await browser.close();
}
