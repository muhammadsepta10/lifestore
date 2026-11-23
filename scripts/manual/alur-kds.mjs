// Skrip Playwright MANUAL untuk alur KDS utama (#39). Bukan suite tes yang dipelihara: jalankan
// sebelum deploy untuk melihat alur ini bekerja di dua browser sungguhan (tablet kasir dan layar dapur).
//
//   Kasir kirim Pesanan → layar dapur menampilkannya per Stasiun → Pesanan kedua muncul tanpa muat ulang
//   → dapur mulai masak → kasir batal item yang sudah dimasak dengan PIN atasan (tercoret di dapur)
//   → dapur tandai siap → Siap Diambil di kasir → diserahkan → Diskon Manual di atas batas dengan PIN atasan
//   → void dengan PIN atasan → buka laci → Laporan Shift menampilkan void.
//
// Cara termudah: `bash scripts/manual/jalankan-alur-kds.sh`.
// Variabel sama dengan alur-kasir.mjs (WEB_URL, API_URL, API_LOG, PW_CHANNEL, HEADED, SCREENSHOT_DIR).
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

/** Siapkan Tenant lewat API: dua Stasiun, Menu terpetakan, kasir, juru masak, manajer, dan dua perangkat. */
async function siapkan() {
  assert(API_LOG, 'Atur API_LOG ke berkas log api (tautan verifikasi email dicetak di sana).');
  const email = `alur-kds-${Date.now()}@contoh.test`;
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
  const dapur = await p(`/outlet/${outlet.id}/stasiun`, { nama: 'Dapur' });
  const bar = await p(`/outlet/${outlet.id}/stasiun`, { nama: 'Bar' });
  const makanan = await p(`/merek/${merek.id}/kategori`, { nama: 'Makanan', warna: 'peach', ikon: '🍛' });
  const minuman = await p(`/merek/${merek.id}/kategori`, { nama: 'Minuman', warna: 'sky', ikon: '🥤' });
  const nasgor = await p(`/merek/${merek.id}/menu`, { kategoriId: makanan.id, nama: 'Nasi Goreng', harga: 25_000 });
  const esTeh = await p(`/merek/${merek.id}/menu`, { kategoriId: minuman.id, nama: 'Es Teh', harga: 8_000 });
  await p(`/outlet/${outlet.id}/menu/${nasgor.id}/stasiun`, { stasiunId: dapur.id }, 'PUT');
  await p(`/outlet/${outlet.id}/menu/${esTeh.id}/stasiun`, { stasiunId: bar.id }, 'PUT');
  const tugas = (peran) => [{ outletId: outlet.id, peran }];
  const kasir = await p('/karyawan', { nama: 'Rina Kasir', pin: '1111', penugasan: tugas('kasir') });
  const koki = await p('/karyawan', { nama: 'Budi Koki', pin: '2222', penugasan: tugas('dapur') });
  const manajer = await p('/karyawan', { nama: 'Sari Manajer', pin: '9999', penugasan: tugas('manajer_outlet') });
  const tabletKasir = await p(`/outlet/${outlet.id}/perangkat`, { nama: 'Tablet Depan', awalan: 'A' });
  const tabletDapur = await p(`/outlet/${outlet.id}/perangkat`, { nama: 'Layar Dapur', awalan: 'D' });
  return { kodeKasir: tabletKasir.kodePendaftaran, kodeDapur: tabletDapur.kodePendaftaran, kasirId: kasir.id, kokiId: koki.id, manajerId: manajer.id };
}

const data = await siapkan();
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || undefined, headless: !process.env.HEADED });
// Dua konteks = dua Perangkat Terdaftar (cookie terpisah).
const kasir = await (await browser.newContext({ viewport: { width: 1366, height: 900 } })).newPage();
const dapur = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
const galatKonsol = [];
kasir.on('pageerror', (e) => galatKonsol.push(`kasir: ${e}`));
dapur.on('pageerror', (e) => galatKonsol.push(`dapur: ${e}`));
if (DIR) mkdirSync(DIR, { recursive: true });
let langkahKe = 0;
async function langkah(nama, fn) {
  await fn();
  langkahKe += 1;
  if (DIR) {
    const awalan = `${DIR}/${String(langkahKe).padStart(2, '0')}-${nama}`;
    await kasir.screenshot({ path: `${awalan}-kasir.png`, fullPage: true });
    await dapur.screenshot({ path: `${awalan}-dapur.png`, fullPage: true });
  }
  console.log(`✓ ${nama}`);
}
const teks = async (halaman, pemilih) => (await halaman.locator(pemilih).first().innerText()).replace(/\s+/g, ' ').trim();
const baris = (kolom, nama, status) => `[data-kolom="${kolom}"] [data-baris="${nama}"][data-status="${status}"]`;

/** Isi alasan di modal kendali, lanjutkan, lalu selesaikan Persetujuan Atasan dengan PIN manajer. */
async function denganPinAtasan(alasan, isiLain = async () => undefined) {
  const modal = kasir.locator('[data-modal-kendali]');
  await isiLain(modal);
  await modal.locator('input[name=alasan]').fill(alasan);
  await modal.locator('[data-lanjut]').click();
  // Tanpa PIN atasan aksi ditolak: modal meminta Persetujuan Atasan.
  await modal.locator('[data-persetujuan]').waitFor();
  await modal.locator('select[name=atasan]').selectOption(data.manajerId);
  await modal.locator('input[name=pinAtasan]').fill('9999');
  await modal.locator('[data-lanjut]').click();
  await modal.waitFor({ state: 'detached' });
}

async function kirimPesanan(menu) {
  for (const nama of menu) await kasir.click(`button[data-menu="${nama}"]`);
  await kasir.locator('aside.order button.tombol.tinta').click();
  await kasir.locator('[data-keranjang]').waitFor({ state: 'detached' });
}

try {
  await langkah('kasir-siap', async () => {
    await kasir.goto(`${WEB}/kasir`);
    await kasir.fill('input[name=kode]', data.kodeKasir);
    await kasir.click('button[type=submit]');
    await kasir.check(`input[name=anggotaId][value="${data.kasirId}"]`);
    await kasir.fill('input[name=pin]', '1111');
    await kasir.click('button[type=submit]');
    await kasir.click('a[href="/kasir?modal=buka-shift"]');
    await kasir.fill('input[name=kasAwal]', '100000');
    await kasir.click('.modal button[type=submit]');
    await kasir.waitForSelector('[data-status-shift=terbuka]');
    await kasir.click('.ostrip button.addcard');
    await kasir.waitForSelector('aside.order[data-tagihan]');
    await kirimPesanan(['Nasi Goreng', 'Nasi Goreng', 'Es Teh']);
    await kasir.waitForSelector('[data-pesanan="A-001"]');
  });

  await langkah('dapur-masuk', async () => {
    await dapur.goto(`${WEB}/kds`);
    // Perangkat belum terdaftar: daftarkan lewat layar kasir, lalu kembali ke layar dapur.
    await dapur.click('a[href="/kasir"]');
    await dapur.fill('input[name=kode]', data.kodeDapur);
    await dapur.click('button[type=submit]');
    await dapur.waitForSelector('input[name=pin]');
    await dapur.goto(`${WEB}/kds`);
    await dapur.selectOption('select[name=anggotaId]', data.kokiId);
    await dapur.fill('input[name=pin]', '2222');
    await dapur.click('button[type=submit]');
    await dapur.waitForSelector('[data-kolom="Dapur"]');
    // Kolom per Stasiun; item sama dijumlahkan dengan chip Nomor Pesanan.
    assert.equal(await dapur.locator(baris('Dapur', 'Nasi Goreng', 'menunggu')).getAttribute('data-jumlah'), '2');
    assert.equal(await dapur.locator(baris('Bar', 'Es Teh', 'menunggu')).getAttribute('data-jumlah'), '1');
    assert.equal(await dapur.locator(`${baris('Dapur', 'Nasi Goreng', 'menunggu')} [data-chip="A-001"]`).count(), 1);
    assert.equal(await dapur.locator('[data-kolom="Bar"] [data-baris="Nasi Goreng"]').count(), 0);
  });

  await langkah('stasiun-bar-saja', async () => {
    await dapur.click('button[data-stasiun="Bar"]');
    await dapur.waitForSelector('button[data-stasiun="Bar"][aria-pressed=true]');
    // KDS di Stasiun Bar tidak menerima item Stasiun Dapur.
    assert.equal(await dapur.locator('[data-kolom="Dapur"]').count(), 0);
    assert.equal(await dapur.locator('[data-baris="Nasi Goreng"]').count(), 0);
    assert.equal(await dapur.locator(baris('Bar', 'Es Teh', 'menunggu')).count(), 1);
    await dapur.click('button.tile.all');
    await dapur.waitForSelector('[data-kolom="Dapur"]');
  });

  await langkah('pesanan-baru-tanpa-muat-ulang', async () => {
    await dapur.waitForSelector('[data-sambungan=online]');
    await kirimPesanan(['Nasi Goreng']);
    await kasir.waitForSelector('[data-pesanan="A-002"]');
    // Layar dapur tidak disentuh: baris gabungan bertambah sendiri dalam beberapa detik.
    await dapur.waitForSelector(`${baris('Dapur', 'Nasi Goreng', 'menunggu')}[data-jumlah="3"]`, { timeout: 8_000 });
    assert.equal(await dapur.locator(`${baris('Dapur', 'Nasi Goreng', 'menunggu')} [data-chip]`).count(), 2);
  });

  await langkah('mulai-masak', async () => {
    await dapur.locator(`${baris('Dapur', 'Nasi Goreng', 'menunggu')} button.agg`).click();
    await dapur.waitForSelector(`${baris('Dapur', 'Nasi Goreng', 'dimasak')}[data-jumlah="3"]`);
    await kasir.reload();
    // Kasir melihat status dapur setiap Item Pesanan.
    assert.equal(await kasir.locator('[data-pesanan="A-002"] [data-status-item=dimasak]').count(), 1);
    assert.equal(await kasir.locator('[data-pesanan="A-001"] [data-status-item=menunggu]').count(), 1);
  });

  await langkah('batal-setelah-dimasak', async () => {
    await kasir.locator('[data-pesanan="A-002"] [data-batal-item="Nasi Goreng"]').click();
    await denganPinAtasan('Pelanggan batal pesan');
    await kasir.waitForSelector('[data-pesanan="A-002"] [data-status-item=batal]');
    // Item batal langsung tercoret di layar dapur, tanpa muat ulang.
    await dapur.waitForSelector(`${baris('Dapur', 'Nasi Goreng', 'batal')}[data-jumlah="1"]`, { timeout: 8_000 });
    assert.equal(await dapur.locator(baris('Dapur', 'Nasi Goreng', 'dimasak')).getAttribute('data-jumlah'), '2');
  });

  await langkah('siap-dan-siap-diambil', async () => {
    await dapur.locator(`${baris('Dapur', 'Nasi Goreng', 'dimasak')} button.agg`).click();
    await dapur.waitForSelector(baris('Dapur', 'Nasi Goreng', 'dimasak'), { state: 'detached' });
    assert.equal(await dapur.locator('[data-siap]').count(), 0);
    await dapur.locator(`${baris('Bar', 'Es Teh', 'menunggu')} button.agg`).click();
    await dapur.locator(`${baris('Bar', 'Es Teh', 'dimasak')} button.agg`).click();
    // Semua item Pesanan A-001 siap: masuk deret "Siap diserahkan" dan daftar Siap Diambil kasir.
    await dapur.waitForSelector('[data-siap="A-001"]');
    await kasir.reload();
    assert.match(await teks(kasir, '[data-siap-diambil] [data-siap="A-001"]'), /A-001.*2× Nasi Goreng, 1× Es Teh/);
  });

  await langkah('diserahkan', async () => {
    await dapur.click('[data-siap="A-001"]');
    await dapur.waitForSelector('[data-siap="A-001"]', { state: 'detached' });
    await kasir.reload();
    assert.equal(await kasir.locator('[data-siap-diambil]').count(), 0);
    assert.equal(await kasir.locator('[data-pesanan="A-001"] [data-status-item=disajikan]').count(), 2);
  });

  await langkah('diskon-di-atas-batas', async () => {
    // 2 × 25.000 + 8.000 = 58.000 (item batal tidak dihitung); PBJT 10% → 63.800.
    assert.equal(await teks(kasir, 'aside.order [data-total]'), 'Rp63.800');
    await kasir.click('[data-aksi=diskon]');
    await denganPinAtasan('Komplain pelanggan', (modal) => modal.locator('input[name=nilaiDiskon]').fill('20'));
    // Diskon 20% = 11.600 → 46.400 + PBJT 4.640 = 51.040.
    await kasir.waitForSelector('aside.order [data-diskon]');
    assert.equal(await teks(kasir, 'aside.order [data-diskon]'), '−Rp11.600');
    assert.equal(await teks(kasir, 'aside.order [data-total]'), 'Rp51.040');
  });

  await langkah('void', async () => {
    await kasir.click('[data-aksi=void]');
    await denganPinAtasan('Pelanggan pergi tanpa bayar');
    await kasir.waitForURL(`${WEB}/kasir`);
    assert.equal(await kasir.locator('.ocard[data-tagihan]').count(), 0);
  });

  await langkah('tagihan-kosong-dibatalkan', async () => {
    await kasir.click('.ostrip button.addcard');
    await kasir.waitForSelector('aside.order[data-tagihan]');
    // Tagihan tanpa item cukup dibatalkan, tanpa PIN atasan.
    await kasir.click('[data-aksi=batal-tagihan]');
    await kasir.waitForURL(`${WEB}/kasir`);
    assert.equal(await kasir.locator('.ocard[data-tagihan]').count(), 0);
  });

  await langkah('buka-laci', async () => {
    await kasir.click('[data-aksi=buka-laci]');
    await denganPinAtasan('Tukar uang kecil');
    await kasir.waitForSelector('[data-laci-dibuka]');
  });

  await langkah('laporan-shift-void', async () => {
    await kasir.click('a[href="/kasir?modal=tutup-shift"]');
    await kasir.fill('input[name=hitungButa]', '100000');
    await kasir.click('.modal button[type=submit]');
    await kasir.waitForSelector('[data-laporan-shift]');
    const laporan = await teks(kasir, '[data-laporan-shift]');
    assert.match(laporan, /Void 1 · Rp51\.040/);
    assert.match(laporan, /Selisih Rp0/);
  });

  assert.deepEqual(galatKonsol, [], 'Ada galat JavaScript di halaman.');
  console.log('Alur KDS selesai tanpa galat.');
} catch (e) {
  if (DIR) {
    await kasir.screenshot({ path: `${DIR}/gagal-kasir.png`, fullPage: true }).catch(() => undefined);
    await dapur.screenshot({ path: `${DIR}/gagal-dapur.png`, fullPage: true }).catch(() => undefined);
  }
  throw e;
} finally {
  await browser.close();
}
