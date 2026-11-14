// Skrip Playwright MANUAL untuk alur dine-in dan cara bayar lengkap (#40). Bukan suite tes yang
// dipelihara: jalankan sebelum deploy untuk melihat alur ini bekerja di browser sungguhan.
//
//   Buka Tagihan dine-in dari Meja (Service Charge) → Pesanan kedua → pindah Meja → Pisah Tagihan
//   → lunas QRIS statis dengan nomor referensi → Bayar Terpisah (QRIS statis + tunai dengan
//   Pembulatan Tunai) → struk → dashboard hari ini → daftar dan detail Tagihan tertutup.
//
// Cara termudah: `bash scripts/manual/jalankan-alur-dine-in.sh`. Variabel sama dengan alur-kasir.mjs.
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

/** Siapkan Tenant lewat API: Service Charge 5%, Pembulatan Tunai Rp100, tunai + QRIS statis, tiga Meja, dua Menu. */
async function siapkan() {
  assert(API_LOG, 'Atur API_LOG ke berkas log api (tautan verifikasi email dicetak di sana).');
  const email = `alur-dine-in-${Date.now()}@contoh.test`;
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
  await p(`/outlet/${outlet.id}/metode-bayar/qris_statis`, { aktif: true, keterangan: 'QRIS BCA' }, 'PUT');
  const hariIni = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date());
  await p(`/outlet/${outlet.id}/profil-pajak`, { berlakuMulai: hariIni, jenis: 'PBJT', tarifPersen: 10, serviceCharge: { tarifPersen: 5 } });
  await p(`/outlet/${outlet.id}`, { pembulatanTunai: { kelipatan: 100, arah: 'terdekat' } }, 'PATCH');
  await p(`/outlet/${outlet.id}/meja/massal`, { dari: 1, sampai: 3, kapasitas: 4 });
  const makanan = await p(`/merek/${merek.id}/kategori`, { nama: 'Makanan', warna: 'peach', ikon: '🍛' });
  await p(`/merek/${merek.id}/menu`, { kategoriId: makanan.id, nama: 'Nasi Goreng', harga: 25_000 });
  await p(`/merek/${merek.id}/menu`, { kategoriId: makanan.id, nama: 'Es Teh', harga: 18_000 });
  const kasir = await p('/karyawan', { nama: 'Rina Kasir', pin: '1111', penugasan: [{ outletId: outlet.id, peran: 'kasir' }] });
  const perangkat = await p(`/outlet/${outlet.id}/perangkat`, { nama: 'Tablet Depan', awalan: 'A' });
  return { kode: perangkat.kodePendaftaran, kasirId: kasir.id, sesi, outletId: outlet.id };
}

const data = await siapkan();
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || undefined, headless: !process.env.HEADED });
let halaman = await browser.newPage({ viewport: { width: 1366, height: 900 } });
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
const tombolBayar = () => halaman.locator('aside.order > button.tombol.besar:not(.tinta)');
const terima = () => halaman.locator('.modal .baris button.tombol:not(.tenang)');
const statusMeja = async () => (await halaman.locator('.meja-grid .meja .pil').allInnerTexts()).map((s) => s.trim());
async function kirimPesanan(nomor) {
  await halaman.locator('aside.order button.tombol.tinta').click();
  await halaman.waitForSelector(`[data-pesanan="${nomor}"]`);
}

try {
  await langkah('masuk-kasir', async () => {
    await halaman.goto(`${WEB}/kasir`);
    await halaman.fill('input[name=kode]', data.kode);
    await halaman.click('button[type=submit]');
    await halaman.waitForSelector('input[name=pin]');
    await halaman.check(`input[name=anggotaId][value="${data.kasirId}"]`);
    await halaman.fill('input[name=pin]', '1111');
    await halaman.click('button[type=submit]');
    await halaman.waitForSelector('[data-status-shift=belum]');
    await halaman.click('a[href="/kasir?modal=buka-shift"]');
    await halaman.fill('input[name=kasAwal]', '100000');
    await halaman.click('.modal button[type=submit]');
    await halaman.waitForSelector('[data-status-shift=terbuka]');
  });

  await langkah('buka-tagihan-di-meja', async () => {
    assert.deepEqual(await statusMeja(), ['Kosong', 'Kosong', 'Kosong']);
    await halaman.click('[data-buka-meja="1"]');
    await halaman.waitForSelector('aside.order[data-tagihan]');
    assert.match(await teks('aside.order .ohead'), /Dine-in · Meja 1/);
    assert.deepEqual(await statusMeja(), ['Terisi', 'Kosong', 'Kosong']);
  });

  await langkah('pesanan-dengan-service-charge', async () => {
    await halaman.click('button[data-menu="Nasi Goreng"]');
    await halaman.click('button[data-menu="Nasi Goreng"]');
    // 50.000 + Service Charge 5% 2.500 + PBJT 10% × 52.500 = 5.250 → 57.750.
    assert.equal(await teks('[data-total]'), 'Rp57.750');
    await kirimPesanan('A-001');
    // Pesanan berikutnya masuk ke Tagihan yang sama: 68.000 + 3.400 + 7.140 = 78.540.
    await halaman.click('button[data-menu="Es Teh"]');
    await kirimPesanan('A-002');
    assert.equal(await teks('[data-total]'), 'Rp78.540');
    assert.equal(await halaman.locator('.ocard').count(), 1);
  });

  await langkah('pindah-meja', async () => {
    const form = halaman.locator('[data-atur-tagihan] form').nth(0);
    await form.locator('select[name=mejaId]').selectOption({ label: 'Meja 2' });
    await form.locator('button[type=submit]').click();
    await halaman.waitForFunction(() => document.querySelector('aside.order .ohead')?.textContent?.includes('Meja 2'));
    assert.deepEqual(await statusMeja(), ['Kosong', 'Terisi', 'Kosong']);
    assert.equal(await halaman.locator('.ocard').count(), 1);
    assert.equal(await teks('[data-total]'), 'Rp78.540');
  });

  await langkah('pisah-tagihan', async () => {
    const form = halaman.locator('[data-atur-tagihan] form').nth(2);
    await form.locator('label.centang', { hasText: 'Es Teh' }).locator('input').check();
    await form.locator('input[name=namaPelanggan]').fill('Pak Budi');
    await form.locator('button[type=submit]').click();
    await halaman.waitForFunction(() => document.querySelectorAll('.ocard').length === 2);
    // Tagihan baru terpilih: Es Teh 18.000 + 900 + 1.890 = 20.790. Tagihan asal kembali 57.750.
    assert.equal(await teks('[data-total]'), 'Rp20.790');
    assert.match(await teks('.ocard:not([aria-current=true])'), /Rp57\.750/);
  });

  await langkah('lunas-qris-statis', async () => {
    await tombolBayar().click();
    await halaman.click('.modal [data-metode=qris_statis]');
    await halaman.fill('.modal input[name=referensi]', 'QR-778899');
    assert.equal(await teks('.modal [data-harus-dibayar] b'), 'Rp20.790');
    await terima().click();
    await halaman.waitForSelector('[data-struk]');
    assert.equal(await halaman.locator('[data-struk]').getAttribute('data-nomor-nota'), '1');
    assert.equal(await teks('[data-struk] [data-total]'), 'Rp20.790');
    assert.match(await teks('[data-struk]'), /QRIS statis · QR-778899/);
    await halaman.locator('.modal .baris a.tombol').click();
    await halaman.waitForURL(`${WEB}/kasir`);
    // Meja 2 tetap Terisi: Tagihan asal masih terbuka.
    assert.deepEqual(await statusMeja(), ['Kosong', 'Terisi', 'Kosong']);
  });

  await langkah('bayar-terpisah', async () => {
    await halaman.click('.ocard');
    await halaman.waitForSelector('aside.order[data-tagihan]');
    await tombolBayar().click();
    await halaman.click('.modal [data-metode=qris_statis]');
    await halaman.fill('.modal input[name=jumlah]', '20000');
    await terima().click();
    // Belum lunas: modal tetap terbuka dengan sisa yang baru.
    await halaman.waitForSelector('.modal [data-sisa="37750"]');
    assert.equal(await teks('aside.order [data-sisa]'), 'Rp37.750');
  });

  await langkah('tunai-dengan-pembulatan', async () => {
    await halaman.click('.modal [data-metode=tunai]');
    // 37.750 dibulatkan ke 37.800: Pembulatan Tunai +50.
    assert.equal(await halaman.locator('.modal [data-pembulatan]').getAttribute('data-pembulatan'), '50');
    await halaman.fill('.modal input[name=diterima]', '50000');
    assert.equal(await teks('.modal [data-kembalian] b'), 'Rp12.200');
    await terima().click();
    await halaman.waitForSelector('[data-struk]');
    assert.equal(await halaman.locator('[data-struk]').getAttribute('data-nomor-nota'), '2');
    assert.equal(await teks('[data-struk] [data-total]'), 'Rp57.750');
    assert.equal(await teks('[data-struk] [data-pembulatan]'), '+Rp50');
    assert.equal(await teks('[data-struk] [data-kembalian]'), 'Rp12.200');
    await halaman.locator('.modal .baris a.tombol').click();
    await halaman.waitForURL(`${WEB}/kasir`);
    assert.deepEqual(await statusMeja(), ['Kosong', 'Kosong', 'Kosong']);
  });

  await langkah('laporan-shift', async () => {
    await halaman.click('a[href="/kasir?modal=tutup-shift"]');
    // Laci: 100.000 + tunai 37.800 (termasuk pembulatan 50).
    await halaman.fill('input[name=hitungButa]', '137800');
    await halaman.click('.modal button[type=submit]');
    await halaman.waitForSelector('[data-laporan-shift]');
    const laporan = await teks('[data-laporan-shift]');
    assert.match(laporan, /Tunai Rp37\.750/);
    assert.match(laporan, /QRIS statis Rp40\.790/);
    assert.match(laporan, /Pembulatan Tunai Rp50/);
    assert.match(laporan, /Kas seharusnya Rp137\.800/);
    assert.match(laporan, /Selisih Rp0/);
  });

  // Pemilik di dashboard (sesi Pengguna), di jendela terpisah.
  const konteks = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  await konteks.addCookies([{ name: 'lifestore_sesi', value: data.sesi, url: WEB }]);
  halaman = await konteks.newPage();
  halaman.on('pageerror', (e) => galatKonsol.push(String(e)));

  await langkah('dashboard-hari-ini', async () => {
    await halaman.goto(`${WEB}/dashboard`);
    // 20.790 + 57.750 = 78.540; Pembulatan Tunai tidak ikut.
    assert.equal(await halaman.locator('[data-penjualan]').getAttribute('data-penjualan'), '78540');
    assert.equal(await halaman.locator('[data-jumlah-tagihan]').getAttribute('data-jumlah-tagihan'), '2');
    assert.match(await teks('[data-outlet-hari-ini] [data-metode=tunai]'), /Rp37\.750/);
    assert.match(await teks('[data-outlet-hari-ini] [data-metode=qris_statis]'), /Rp40\.790/);
    assert.match(await teks('[data-outlet-hari-ini]'), /Pembulatan Tunai Rp50/);
  });

  await langkah('tagihan-tertutup', async () => {
    await halaman.click(`a[href="/penjualan?outlet=${data.outletId}"]`);
    await halaman.waitForSelector('a[data-tagihan]');
    assert.equal(await halaman.locator('a[data-tagihan]').count(), 2);
    assert.equal(await halaman.locator('[data-total-hari]').getAttribute('data-total-hari'), '78540');
    assert.match(await teks('a[data-tagihan]'), /Nota #000002.*Dine-in · Meja 2.*Rp57\.750/);
    await halaman.locator('a[data-tagihan]').first().click();
    await halaman.waitForSelector('[data-detail-tagihan]');
    assert.equal(await halaman.locator('[data-detail-tagihan] [data-total]').getAttribute('data-total'), '57750');
    assert.match(await teks('[data-detail-tagihan]'), /2× Nasi Goreng/);
    assert.match(await teks('[data-detail-tagihan] [data-pembayaran=tunai]'), /Rp37\.800/);
    assert.match(await teks('[data-detail-tagihan] [data-pembayaran=qris_statis]'), /Rp20\.000/);
  });

  assert.deepEqual(galatKonsol, [], 'Ada galat JavaScript di halaman.');
  console.log('Alur dine-in selesai tanpa galat.');
} finally {
  await browser.close();
}
