# Riset: Pola offline-first untuk kasir & KDS PWA (Next.js + NestJS + PostgreSQL)

- Issue: #5 (sub-issue dari peta #1)
- Tanggal dicek: 2026-10-03
- Keyakinan keseluruhan: **sedang–tinggi** untuk fakta lisensi/model sync (dari dokumen & repo resmi); **sedang** untuk bagian komunikasi LAN (perilaku browser sedang berubah, lihat bagian 5).

## Ringkasan jawaban

1. **Jangan pakai Zero/Replicache untuk kasir.** Zero (GA 1.0, Maret 2026) secara eksplisit **tidak mendukung tulis saat offline**; Replicache berbayar per MAP dan closed-source.
2. **ElectricSQL hanya menyinkronkan jalur baca** (Postgres → klien). Jalur tulis harus dibangun sendiri, jadi tidak menghemat banyak dibanding membangun outbox sendiri.
3. **Dua kandidat realistis:**
   - **A. Dexie (IndexedDB) + pola outbox buatan sendiri ke API NestJS** — paling sederhana, nol vendor, Apache-2.0, cocok karena domain kasir sebagian besar *append-only* (pesanan, pembayaran).
   - **B. PowerSync** (SQLite di browser + layanan sync; tulis tetap lewat API backend kita) — solusi sync bidireksional paling matang untuk Postgres, bisa self-host gratis (FSL → Apache-2.0) atau cloud mulai $49/bln.
4. **Rekomendasi:** mulai dengan **A** (Dexie + outbox idempoten + pull delta per tenant), dengan desain data yang kompatibel dengan PowerSync (PK UUID teks, kolom `tenant_id`, operasi idempoten) agar bisa naik ke **B** bila kebutuhan sync dua arah membesar.
5. **Nomor pesanan offline:** ID global = UUIDv7 dibuat klien; nomor tampilan = `kode perangkat + urutan lokal per hari` (mis. `K1-0042`); nomor struk/faktur resmi (jika perlu berurutan tanpa celah) diberikan server saat sinkron.
6. **Kasir → dapur saat internet mati:** browser tidak bisa membuka port/server, tidak bisa mDNS, dan WebRTC butuh signaling. Solusi andal butuh **komponen non-browser di LAN**: (a) "hub lokal" kecil (mini-PC/Android box) yang menjalankan relay, atau (b) membungkus kasir/KDS dalam shell native (Capacitor/TWA) dengan plugin jaringan lokal, atau (c) fallback **printer dapur** (ESC/POS). Untuk MVP: fallback printer + KDS kembali sinkron saat online.

## 1. Tabel perbandingan

| Opsi | Penyimpanan lokal | Model sync | Konflik | Tulis offline | Lisensi / biaya | Kematangan (per 2026-10) |
|---|---|---|---|---|---|---|
| **Dexie.js** (+ outbox sendiri) | IndexedDB | Tidak ada bawaan; kita bangun push (outbox) + pull (cursor) ke NestJS | Kita tentukan (server-authoritative) | Ya | Apache-2.0, gratis [1] | Sangat matang, dipakai luas |
| **Dexie Cloud** | IndexedDB | Sync ke server Dexie Cloud (bukan ke Postgres kita) | Bawaan Dexie Cloud | Ya | Free ≤3 user; Pro €0,12/user/bln; self-host €3.495–7.995 sekali bayar [2] | Matang, tetapi backend-nya bukan Postgres/NestJS kita → kurang cocok |
| **SQLite WASM (resmi)** | SQLite di OPFS (`opfs` butuh COOP/COEP; `opfs-sahpool` tanpa header tapi satu koneksi) [3] | Tidak ada; hanya engine | – | Ya | Public domain | Engine matang; sync tetap harus dibangun |
| **RxDB** | Dexie/memory gratis; storage IndexedDB/OPFS/SQLite *premium* | Protokol replikasi generik (HTTP/GraphQL/WebRTC, dll.) | Handler konflik di klien (revisi) | Ya | Core Apache-2.0 [4]; Pro $99/bln, Pro Plus $239/bln [5] | Matang, tetapi storage cepat berbayar |
| **PowerSync** | SQLite (IndexedDB VFS default, opsi OPFS) [6] | Postgres → klien via replikasi logis + "sync rules/streams"; klien → backend via **upload queue** ke API kita [7] | Server-authoritative; default LWW per-field, delete menang; bisa kustom [8] | Ya (queue persisten di SQLite) [6] | SDK klien Apache-2.0; service FSL-1.1-ALv2 (self-host gratis, jadi Apache setelah 2 th) [9]; Cloud Free / Pro $49+ / Team $599+ [10] | Matang, banyak SDK, mendukung Postgres/MySQL/Mongo/MSSQL |
| **ElectricSQL** (+ TanStack DB / PGlite) | PGlite (Postgres WASM) atau store apa pun | **Hanya baca** (shape stream Postgres → klien); tulis "tidak disediakan" [11] | Harus dibangun sendiri (rebase/rollback) [11] | Hanya jika kita bangun pola 2–4 | Apache-2.0 (Electric, PGlite), MIT (TanStack DB) [12] | Read-path matang; write-path DIY |
| **Zero (Rocicorp)** | IndexedDB | Query-driven sync, server menjalankan mutator | Server-authoritative | **Tidak** – tulis ditolak saat `disconnected` (default setelah ~1 menit) [13] | Apache-2.0 [14] | GA 1.0 sejak Maret 2026 [15] |
| **Replicache** | IndexedDB | Push/pull ke backend kita | Rebase mutator | Ya | Closed source, berlisensi; gratis hanya untuk non-komersial/pra-revenue; komersial bayar per MAP [16] | Matang, tetapi biaya & lock-in |

## 2. Model sinkronisasi yang disarankan (opsi A)

**Push (klien → server) – transactional outbox:**
- Setiap aksi kasir (buat pesanan, tambah item, bayar, void) ditulis dalam satu transaksi Dexie ke tabel domain **dan** tabel `outbox` (`id` UUIDv7, `tenant_id`, `device_id`, `seq` per perangkat, `type`, `payload`, `created_at`).
- Worker sync mengirim outbox berurutan ke `POST /sync/push` NestJS. Server menyimpan `(device_id, seq)` / `id` sebagai **idempotency key** sehingga retry aman (pola sama yang dianjurkan PowerSync: operasi harus idempoten, sertakan ID operasi naik per klien [8]).
- Jangan bergantung pada Background Sync API untuk keandalan: API ini *limited availability* (praktis hanya Chromium) [17]. Picu sync dari `online` event, interval, dan saat app dibuka.

**Pull (server → klien):** `GET /sync/pull?cursor=` per tenant (menu, harga, meja, status pesanan dari perangkat lain), berbasis kolom `version`/`updated_at` monotonic (atau `xid`/sequence) dan filter `tenant_id` dari JWT. Sederhana, bisa dites, mudah dikerjakan agen AI.

**Konflik:** domain kasir didesain agar konflik jarang:
- Pesanan & pembayaran = **event append-only** (tambah item, batal item, bayar) – tidak ada update di tempat, jadi tidak ada konflik tulis-tulis.
- Data master (menu, harga) = server-authoritative; klien offline hanya membaca. Harga yang dipakai disalin ke baris pesanan saat dibuat (snapshot).
- Status dapur (diterima → dimasak → siap) = transisi state machine monoton; server menolak transisi mundur.
- Stok: hitung di server dari event; izinkan stok minus sementara saat offline, laporkan selisih.

**Penyimpanan:** panggil `navigator.storage.persist()`; di Safari/iOS izin persisten diberikan berdasarkan heuristik (mis. dibuka sebagai Home Screen Web App) dan data bisa dihapus LRU saat tekanan storage [18]. Jangan hapus outbox sebelum server mengakui (ack).

## 3. Kapan naik ke PowerSync (opsi B)

Pertimbangkan bila: banyak tabel perlu sync dua arah, banyak perangkat per outlet saling melihat perubahan, atau ingin query SQL lokal (laporan shift offline). Kelebihannya cocok dengan arsitektur kita: **tulis tetap lewat API NestJS** (upload queue → endpoint kita → Postgres), jadi validasi & multi-tenant tetap di backend [7][8]. Biaya: tambahan layanan (PowerSync Service via Docker `journeyapps/powersync-service` [19]) + replikasi logis Postgres, atau Cloud $49+/bln [10]. Persiapkan dari awal: PK `id` teks/UUID (PowerSync mewajibkan satu kolom PK teks `id` [20]), kolom `tenant_id` di setiap tabel yang disinkron.

## 4. Penomoran pesanan / struk offline

- **ID unik global:** UUIDv7 dibuat di klien (terurut waktu, aman offline, tanpa koordinasi).
- **Nomor antrian/tampilan dapur:** `<kode perangkat>-<urutan harian>`, mis. `K1-0042`; kode perangkat didaftarkan saat setup (unik per outlet). Urutan disimpan di IndexedDB dalam transaksi yang sama dengan pembuatan pesanan.
- **Nomor struk resmi:** jika regulasi/akuntansi butuh nomor berurutan tanpa celah per outlet, berikan **di server** saat sinkron (sequence Postgres per `tenant_id, outlet_id`), lalu tampilkan di struk ulang/e-receipt. Struk cetak offline memakai nomor perangkat. (Kebutuhan pajak daerah/PB1 di Indonesia perlu dicek terpisah – tidak diverifikasi di riset ini.)
- PowerSync menyediakan pola serupa: UUID lokal yang dipetakan ke ID sekuensial dari server [21].

## 5. Kasir → dapur di LAN saat internet mati

Batasan browser (keyakinan sedang):
- Halaman web **tidak bisa** membuka socket server, tidak bisa discovery mDNS, dan WebRTC butuh *signaling* (biasanya lewat server cloud — mati saat internet putus).
- Chrome 142 memberlakukan izin **Local Network Access**: `fetch` dari situs publik ke IP privat/`.local` memicu prompt izin, hanya di secure context. Chrome melonggarkan *mixed content* bila target dikenali lokal (IP privat literal, `.local`, atau `targetAddressSpace: "local"`). WebSocket/WebRTC belum tercakup di rilis awal tetapi direncanakan; ada rencana enterprise policy untuk pra-izin [22]. Safari/Firefox tidak punya pelonggaran setara (belum diverifikasi), jadi HTTPS → `http://192.168.x.x` kemungkinan diblokir sebagai mixed content.

Opsi praktis (urut dari paling sederhana):
1. **Printer dapur (ESC/POS)** sebagai jalur cadangan wajib: kasir mencetak tiket dapur. Butuh jembatan (WebUSB/Web Serial di Chromium untuk printer USB, atau aplikasi bridge lokal untuk printer jaringan). Ini standar industri POS.
2. **Hub lokal per outlet** (mini-PC / Raspberry Pi / Android box) menjalankan relay kecil (Node/NestJS) dengan HTTPS valid: nama DNS publik per outlet yang di-*resolve* ke IP privat + sertifikat Let's Encrypt via DNS-01 (pola seperti `*.plex.direct`). Kasir & KDS bicara ke hub via fetch/WebSocket; hub meneruskan ke cloud saat online. Paling andal, tapi menambah perangkat & operasional.
3. **Shell native** (Capacitor untuk Android/iPad, atau TWA) untuk KDS/kasir dengan plugin socket/NSD lokal — perangkat bisa saling menemukan dan bicara langsung tanpa hub.
4. Kasir & KDS di **satu perangkat/browser** → `BroadcastChannel`/shared worker (kasus kecil saja).

Rekomendasi MVP: KDS online-only + **fallback cetak tiket dapur**; rancang protokol event pesanan agar nanti bisa diteruskan oleh hub lokal (opsi 2) tanpa mengubah klien.

## 6. Rekomendasi untuk SaaS multi-tenant yang dibangun agen AI

- **Pilih opsi A** (Dexie + outbox + pull delta) untuk v1: kode sedikit, bisa dites unit/integrasi penuh oleh agen, tidak ada layanan tambahan, semua otorisasi multi-tenant tetap di NestJS (filter `tenant_id` dari JWT di push & pull, plus Postgres RLS sebagai lapis kedua).
- Batasi cakupan offline: **buat pesanan, bayar tunai/manual, cetak struk, lihat menu**. Pembayaran QRIS/kartu, laporan, dan admin tetap online-only.
- Desain kompatibel-PowerSync sejak awal (UUID teks, `tenant_id`, operasi idempoten) agar migrasi ke opsi B murah.
- Hindari Zero (tidak ada tulis offline), Replicache (biaya per MAP, closed source), Dexie Cloud (backend bukan Postgres kita), RxDB premium (biaya bulanan untuk storage cepat) kecuali ada alasan kuat.
- Gunakan Serwist/Workbox untuk precache shell Next.js (tidak diverifikasi detail di riset ini).

## Sumber (dicek 2026-10-03)

1. Dexie.js LICENSE (Apache-2.0): https://github.com/dexie/Dexie.js/blob/master/LICENSE
2. Dexie Cloud pricing: https://dexie.org/cloud/pricing
3. SQLite WASM persistence (OPFS VFS): https://sqlite.org/wasm/doc/trunk/persistence.md
4. RxDB LICENSE: https://github.com/pubkey/rxdb/blob/master/LICENSE.txt
5. RxDB premium: https://rxdb.info/premium/
6. PowerSync JavaScript Web SDK: https://docs.powersync.com/client-sdks/reference/javascript-web
7. PowerSync – Writing client changes: https://docs.powersync.com/handling-writes/writing-client-changes
8. PowerSync – Handling update conflicts: https://docs.powersync.com/handling-writes/handling-update-conflicts
9. PowerSync service LICENSE (FSL-1.1-ALv2): https://github.com/powersync-ja/powersync-service/blob/main/LICENSE ; SDK JS (Apache-2.0): https://github.com/powersync-ja/powersync-js/blob/main/LICENSE
10. PowerSync pricing: https://www.powersync.com/pricing
11. Electric – Writes guide: https://electric.ax/docs/guides/writes
12. Lisensi: https://github.com/electric-sql/electric/blob/main/LICENSE , https://github.com/electric-sql/pglite/blob/main/LICENSE , https://github.com/TanStack/db/blob/main/LICENSE
13. Zero – Offline: https://zero.rocicorp.dev/docs/offline
14. Zero – Open source: https://zero.rocicorp.dev/docs/open-source
15. Zero – Status: https://zero.rocicorp.dev/docs/status
16. Replicache licensing: https://doc.replicache.dev/concepts/licensing
17. MDN Background Synchronization API: https://developer.mozilla.org/en-US/docs/Web/API/Background_Synchronization_API
18. WebKit storage policy: https://webkit.org/blog/14403/updates-to-storage-policy/
19. PowerSync self-hosting: https://docs.powersync.com/self-hosting/getting-started
20. PowerSync client ID: https://docs.powersync.com/sync/advanced/client-id
21. PowerSync sequential ID mapping: https://docs.powersync.com/client-sdks/advanced/sequential-id-mapping
22. Chrome Local Network Access: https://developer.chrome.com/blog/local-network-access

## Catatan keyakinan & celah

- Harga & lisensi diambil dari halaman resmi pada tanggal di atas; harga bisa berubah.
- Perilaku LAN di Safari/Firefox dan cakupan LNA untuk WebSocket belum diverifikasi langsung — uji di perangkat target sebelum memutuskan arsitektur hub.
- Jumlah bintang/rilis terbaru repo tidak dicek (akses API GitHub terbatas di sesi ini).
