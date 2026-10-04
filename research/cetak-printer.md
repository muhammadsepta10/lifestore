# Riset: Cetak struk, printer dapur, dan laci kas dari kasir PWA (Chrome/Edge)

- **Issue:** #28
- **Tanggal dicek:** 2026-10-04
- **Konteks:** Kasir berupa PWA Next.js di Chrome/Edge (browser resmi, ADR 0003) pada tablet/PC (Windows, Android, mungkin ChromeOS/macOS). Backend NestJS + PostgreSQL. Kasir harus jalan offline (outbox Dexie). Saat internet mati, dapur bergantung pada printer dapur (KDS online-only). Hub Lokal opsional di tahap berikutnya. Pasar: Indonesia.
- **Penanda:** klaim tanpa sumber yang merupakan kesimpulan sendiri ditandai **(inferensi)**.

## Ringkasan

1. **Browser tidak bisa membuka koneksi TCP mentah ke printer LAN port 9100.** Direct Sockets API memang ada (Chrome 130), tetapi hanya untuk *Isolated Web Apps* (IWA), dan IWA saat ini hanya bisa dipasang lewat kebijakan di ChromeOS terkelola [C7][C8][C9]. Untuk PWA biasa di Windows/Android, jalur ini tertutup.
2. **USB di Windows lewat WebUSB praktis tidak bisa dipakai untuk printer struk.** WebUSB di Windows butuh driver WinUSB [C2]. Printer USB biasanya sudah diklaim driver printer Windows, sehingga `open()`/`claimInterface()` gagal dengan "Access denied". Satu-satunya solusi yang dilaporkan adalah mengganti driver dengan Zadig [C5], yang tidak realistis untuk toko. Di **Android**, macOS, dan ChromeOS, WebUSB berjalan tanpa konfigurasi sistem [C2].
3. **Bluetooth:** Web Bluetooth hanya BLE (GATT) [C3]. Printer thermal murah umumnya memakai Bluetooth Classic SPP **(inferensi)**, yang bisa dijangkau lewat **Web Serial (RFCOMM)**: desktop sejak Chrome 117 [C11][C12], Android sejak Chrome 137 (hanya Bluetooth, belum USB-serial) [C13].
4. **Kiosk printing** (`--kiosk-printing`) hanya menekan tombol cetak di print preview secara otomatis [C14]. Hasilnya lewat driver OS (raster), tidak bisa mengirim ESC/POS mentah, jadi tidak bisa membuka laci kas kecuali lewat pengaturan driver.
5. **Jembatan lokal** (QZ Tray, agen buatan sendiri) adalah satu-satunya cara yang **seragam** untuk USB (Windows), LAN 9100, Bluetooth, dan laci kas, dan berjalan penuh offline karena hanya bicara ke `localhost` dan LAN. Sejak Chrome 142, akses halaman publik ke `localhost`/IP privat (termasuk WebSocket) memunculkan izin *Local Network Access* satu kali [C16][C17][C18].
6. **Laci kas** dibuka dengan perintah ESC/POS `ESC p m t1 t2` (hex `1B 70 …`) ke printer struk, yang meneruskan pulsa ke port RJ11/RJ12 laci [C24][C25].

## Rekomendasi

**Fase 1: satu antarmuka `PrinterTransport` di kasir dengan beberapa driver, dan "Agen Cetak" kecil sebagai jalur utama di Windows.** (Semua bagian rekomendasi ini **inferensi** dari temuan di bawah.)

| Perangkat kasir | Struk + laci kas | Printer dapur (offline) |
|---|---|---|
| **PC/tablet Windows** (paling umum) | Agen Cetak (atau QZ Tray) → USB via spooler RAW / LAN 9100; laci via `ESC p` | Printer dapur **LAN** via Agen Cetak → `IP:9100`. Tetap jalan tanpa internet karena hanya lewat LAN. |
| **Tablet Android** | WebUSB (USB) atau Web Serial Bluetooth SPP (Chrome 137+) langsung dari browser, tanpa instalasi | Bluetooth SPP / USB ke printer dapur. Untuk printer dapur LAN, Android butuh Hub Lokal (browser tidak bisa TCP 9100). |
| **Sunmi/iMin (Android POS)** | Printer internal Sunmi terekspos sebagai perangkat Bluetooth virtual "InnerPrinter" dengan UUID SPP [C27], sehingga kemungkinan bisa dijangkau Web Serial Bluetooth di Chrome 137+ (**perlu diuji**). iMin punya JS Printer SDK sendiri [C28]. | Seperti tablet Android |
| **Epson seri ePOS-Print (mis. TM-T82IV/TM-m30) atau Star WebPRNT, via LAN** | SDK JS vendor langsung ke printer lewat HTTP(S) [C19][C20][C23] | Sama. Bisa tanpa agen, tetapi hanya untuk merek/model ini. |
| Cadangan darurat | `window.print()` + `--kiosk-printing` (struk saja, laci lewat setelan driver) | Tidak disarankan |

Alasan:

- Pasar Indonesia didominasi printer ESC/POS generik (Xprinter, Blueprint, EPPOS, dll.) dengan USB + Bluetooth (+ kadang LAN) [C30][C31]. Ini tidak bisa dijangkau dari browser di Windows tanpa jembatan lokal.
- Agen Cetak tidak menambah perangkat keras (ADR 0003 menolak Hub Lokal *wajib* karena biaya perangkat). Konsekuensinya ada jalur rilis kedua (installer Windows), mirip trade-off yang membuat Capacitor ditolak di ADR 0003. **Keputusan ini perlu dicatat di ADR baru.**
- Alternatif membeli QZ Tray: open source (LGPL 2.1), tetapi tanpa sertifikat berbayar (Premium Support USD 599/tahun) muncul pop-up peringatan. Agar senyap, setiap pesan harus ditandatangani; cara yang disarankan adalah penandatanganan di backend [C21][C22][C23a]. Penandatanganan di backend **tidak jalan saat offline** **(inferensi)**. Penandatanganan di klien bisa, tetapi mengekspos private key [C23a]. Untuk SaaS multi-tenant yang wajib offline, agen sendiri yang sangat sederhana kemungkinan lebih cocok, dan QZ Tray menjadi opsi cepat untuk pilot.
- Desain event pesanan sudah disiapkan agar Hub Lokal bisa ditambahkan (ADR 0003). Agen Cetak sebaiknya memakai protokol yang sama, sehingga Hub Lokal nanti cukup berupa "Agen Cetak yang berjalan di perangkat terpisah + KDS LAN".

**Antarmuka minimal Agen Cetak (inferensi):** endpoint `http://127.0.0.1:<port>` (atau WebSocket) dengan perintah `listPrinters`, `print(printerId, bytesBase64, jobId)` yang idempoten per `jobId`, `kickDrawer(printerId)`, dan `status`. Konfigurasi printer (USB nama antrean Windows, `IP:9100`, COM port Bluetooth) disimpan di agen. Auth memakai token pairing per perangkat, disimpan di IndexedDB kasir. Kasir membangun byte ESC/POS sendiri (pustaka encoder di JS), sehingga agen tetap "bodoh" dan jarang perlu diperbarui.

### Spesifikasi minimal Hub Lokal (opsional, fase berikutnya, inferensi)

- **Perangkat keras:** mini PC x86 hemat daya (kelas Intel N100, RAM 4–8 GB, SSD/eMMC ≥ 64 GB, Ethernet gigabit) atau Raspberry Pi 4/5 (4 GB) dengan SSD/kartu industri. Dipasang di LAN outlet dengan IP tetap/reservasi DHCP, sebaiknya dengan UPS kecil bersama router.
- **Perangkat lunak:** Linux + layanan yang sama dengan Agen Cetak (satu basis kode) + server HTTPS/WSS + penyimpanan lokal (SQLite) untuk antrean pesanan dan tiket.
- **Fungsi:**
  1. **Routing cetak**: menerima pesanan dari semua kasir (termasuk Android) dan mencetak ke printer dapur/stasiun per kategori menu via `IP:9100`, dengan antrean, retry, dan deteksi printer mati.
  2. **KDS lewat LAN**: menyajikan KDS dan meneruskan event pesanan ke layar dapur saat internet mati.
  3. **Relay sinkron**: menyimpan event dan meneruskan ke NestJS saat online, sesuai protokol idempoten yang sudah ada.
- **Masalah sertifikat:** halaman kasir HTTPS tidak boleh memanggil `http://192.168.x.x` (mixed content) kecuali memakai `targetAddressSpace: "local"` dan izin LNA [C17]. Agar WSS/HTTPS ke Hub valid, pola yang dipakai vendor adalah hostname publik per perangkat yang mengarah ke IP privat, dengan sertifikat yang diperbarui otomatis. Epson melakukannya dengan `<hash-serial>.omnilinkcert.epson.biz` [C20]. Hub kita bisa memakai `<hub-id>.hub.<domain-kita>` + Let's Encrypt DNS-01 **(inferensi)**.
- **Izin browser:** satu kali izin Local Network Access per origin kasir. Admin TI bisa memberi izin di muka lewat kebijakan enterprise [C17].

## 1. WebUSB, Web Serial, Web Bluetooth

### WebUSB

| OS | Status untuk printer struk |
|---|---|
| Windows | Butuh driver **WinUSB**, dipasang lewat INF atau descriptor Microsoft OS di firmware perangkat [C2]. Printer USB biasanya diklaim driver printer Windows → "DOMException: Access denied". Satu-satunya solusi yang dilaporkan: mengganti driver dengan Zadig, yang menghilangkan printer dari Windows [C5]. **Tidak layak untuk produksi (inferensi).** |
| Android | Berjalan tanpa konfigurasi sistem, tetapi pengguna mendapat prompt izin tambahan [C2]. |
| macOS | Tanpa persyaratan khusus [C2]. |
| ChromeOS | Tanpa modifikasi sistem [C2]. |
| Linux | Perlu aturan udev [C2]. |

- Kelas interface yang diblokir WebUSB: Audio, Video, HID, Mass Storage, Smart Card, Wireless Controller. **Kelas printer (0x07) tidak termasuk** [C4].
- `requestDevice()` hanya boleh dipanggil dari *user gesture* (klik/sentuh) [C1]. `getDevices()` mengembalikan perangkat yang sudah diizinkan untuk situs [C1], jadi izin tetap ada antarsesi dan cukup diminta sekali saat setup.
- Hanya di secure context (HTTPS) dan tersedia di Web Worker [C6].

### Web Serial

- Desktop (ChromeOS, Linux, macOS, Windows) sejak Chrome 89 [C10]. `requestPort()` membutuhkan user gesture; `getPorts()` mengembalikan port yang sudah diizinkan sebelumnya, sehingga tidak perlu prompt ulang [C10].
- **Bluetooth Classic RFCOMM/SPP**: desktop sejak Chrome 117, untuk perangkat yang **sudah di-pairing** di OS. Service Class ID berbasis Base UUID Bluetooth SIG diblokir, **kecuali Serial Port Profile** [C11]. Izin disimpan antarsesi berdasarkan alamat MAC [C12]. Sejak Chrome 130 ada event `connect`/`disconnect` dan atribut `connected` untuk port RFCOMM [C11b].
- **Android**: Web Serial over Bluetooth sejak Chrome 137. **USB-serial di Android belum didukung** dan menunggu dukungan sistem Android. Event connect/disconnect dan `SerialPort.connected` belum didukung penuh di Android [C13]. Untuk USB di Android, gunakan WebUSB (atau polyfill Serial di atas WebUSB) [C10].
- Secure context, dan tersedia di Dedicated Worker [C6b].
- Di Windows, printer Bluetooth SPP yang di-pairing juga muncul sebagai COM port, sehingga agen lokal bisa menulis ke sana **(inferensi)**.

### Web Bluetooth

- **Hanya BLE (GATT).** Untuk Bluetooth Classic RFCOMM, dokumentasi Chrome menyarankan Web Serial [C3].
- Tersedia di ChromeOS, Android 6.0+, macOS (Chrome 56), Windows 10 (Chrome 70, butuh Windows 10 1703). Linux masih di balik flag [C3][C15].
- `requestDevice()` wajib dari user gesture [C3].
- **Izin persisten (`getDevices()`) masih di balik flag** (`enable-experimental-web-platform-features` dan `enable-web-bluetooth-new-permissions-backend`) [C15][C15b]. Artinya, pada setelan default, kasir harus memilih ulang printer BLE setelah browser dibuka ulang. **Ini buruk untuk kasir dan menjadi alasan utama untuk tidak memakai Web Bluetooth (inferensi).**

## 2. Printer LAN (ESC/POS port 9100) dari browser

- Web tidak punya API raw TCP. **Direct Sockets API** (TCP/UDP) dirilis di Chrome 130 tetapi **hanya untuk Isolated Web Apps**, dan manifest IWA harus menyatakan permission policy `direct-sockets` + `cross-origin-isolated` [C7][C8].
- Saat dirilis, IWA "hanya tersedia di platform yang mendukung IWA, yaitu baru ChromeOS" [C8]. Instalasi IWA lewat kebijakan `IsolatedWebAppInstallForceList` **hanya untuk ChromeOS terkelola** (versi 128+, kiosk 134+) [C9]. Mulai Chrome 143 ada allowlist IWA, yang juga berlaku untuk OS lain ketika IWA didukung di sana [C9b]. **Kesimpulan: belum bisa dipakai untuk kasir Windows/Android yang dikelola sendiri oleh pemilik restoran (inferensi).**
- **Web Printing API** (Chrome 147, desktop) juga hanya untuk IWA dan berbasis atribut IPP, bukan ESC/POS mentah [C26][C26b].
- **Opsi yang tersisa:**
  1. **SDK HTTP bawaan vendor**: Epson ePOS SDK for JavaScript (ePOS-Print: port 8008 HTTP / 8043 TLS) [C19][C20], Star WebPRNT (`https://<ip>/StarWebPRNT/SendMessage`) [C23]. Hanya untuk model yang mendukung.
  2. **Jembatan lokal** (QZ Tray: `qz.configs.create({ host: "192.168.x.x", port: 9100 })` [C21b]; atau agen sendiri).
  3. **Hub Lokal** di LAN (lihat Rekomendasi).
  4. **Cloud print berbasis polling** (Epson Server Direct Print, Star CloudPRNT): printer memanggil server kita secara berkala, misalnya setiap 60 detik [C19b]. **Tidak bekerja saat internet mati (inferensi)**, sehingga tidak memenuhi ADR 0003.
- **Hambatan browser untuk HTTP ke IP lokal:** halaman HTTPS memanggil `http://192.168.x.x` diblokir sebagai mixed content. Star menyatakan app HTTPS harus memakai HTTPS ke printer [C23]. Sejak Chrome 142, Local Network Access mewajibkan prompt izin untuk request dari situs publik ke IP lokal atau loopback. `fetch(..., { targetAddressSpace: "local" })` membebaskan dari blokir mixed content [C16][C17]. WebSocket ke alamat lokal juga memicu prompt izin (Chrome 147) [C18]. Epson menyediakan sertifikat otomatis lewat hostname `*.omnilinkcert.epson.biz`, tetapi hanya untuk sebagian printer TM [C20].

## 3. Kiosk printing (`--kiosk-printing`)

- Switch Chromium `kiosk-printing`: "Enable automatically pressing the print button in print preview" [C14]. Artinya `window.print()` langsung mencetak ke printer default tanpa dialog.
- Batasan **(inferensi dari cara kerja di atas)**:
  - Mencetak HTML lewat **driver OS** (raster). Tidak bisa mengirim ESC/POS mentah: tidak ada QR/barcode native, potong kertas, atau `ESC p`. Laci hanya bisa terbuka jika driver vendor punya opsi "buka laci setelah cetak".
  - Hanya ke **printer default**. Tidak bisa memilih printer struk vs dapur per pekerjaan, jadi tidak cocok untuk routing dapur multi-stasiun.
  - Butuh driver terpasang. Pintasan browser harus diluncurkan dengan flag (di Windows lewat shortcut). Tidak relevan di Chrome Android (stable tidak menerima flag baris perintah).
  - Edge berbasis Chromium, jadi switch yang sama umumnya ikut berlaku **(inferensi, tidak diverifikasi di dokumentasi Microsoft)**.
- Cocok hanya sebagai **cadangan darurat** untuk struk.

## 4. Jembatan lokal

| Opsi | Cara kerja | Biaya / lisensi | Offline | Catatan |
|---|---|---|---|---|
| **QZ Tray** | Aplikasi desktop (Java), dihubungi lewat WebSocket localhost. Raw ESC/POS, serial, USB, HID, cetak ke `host:port` 9100 [C21][C21b] | LGPL 2.1; API/demo public domain. Biner resmi berisi "code restriction" yang mendorong pembelian Premium Support [C21]: **USD 599/tahun** (diskon multi-tahun), termasuk *trusted key pair* 1 tahun [C22]. Ada opsi Company Branded [C21]. | Ya untuk cetak lokal. **Penandatanganan pesanan di backend (cara yang disarankan) butuh server** [C23a]. Saat offline harus memakai penandatanganan di klien (mengekspos private key) **(inferensi)**. | Pop-up "untrusted" tanpa signing [C23a]. Matang, lintas OS (Windows/macOS/Linux). |
| **Epson ePOS SDK for JavaScript** | Library JS yang mengirim XML ePOS-Print ke web server di printer, tanpa driver [C19]. Port 8008/8043 [C20]. `addPulse` untuk laci (pin 2/5, 100–500 ms) [C25] | Gratis diunduh dari Epson (lisensi tidak dicek detail) | Ya, hanya lewat LAN | Hanya model ePOS-Print: mis. TM-m30 series, TM-T82III, TM-T82II-i [C19c]; TM-T82IV mencantumkan ePOS-Print [C29]. Dokumen v2.27 mencantumkan Chrome 21–108 sebagai browser teruji [C19c]. HTTPS butuh sertifikat di printer [C20]. |
| **Epson Server Direct Print** | Printer melakukan polling HTTP ke server kita (mis. tiap 60 detik), respons berisi XML ePOS-Print [C19b] | — | **Tidak** (bergantung server cloud) | Bagus untuk pesanan online/QR saat internet hidup |
| **Star WebPRNT / StarXpand SDK for Web** | HTTP(S) ke printer: `https://<ip>/StarWebPRNT/SendMessage` [C23]. Model: mC-Print2/3, TSP100IV, mPOP lewat LAN; banyak model lain hanya via Bluetooth/USB dengan app Star webPRNT Browser [C23b][C23c] | SDK diunduh gratis dari Star (lisensi tidak dicek detail) | Ya, lewat LAN | Star jarang di pasar Indonesia **(inferensi)** |
| **iMin JS Printer SDK** | API `IminPrintInstance` untuk printer internal iMin, termasuk `openCashBox()` [C28] | — | Ya | Hanya perangkat iMin. Mekanisme transport tidak dijelaskan di dokumentasi. |
| **Agen buatan sendiri** | Layanan kecil (mis. Go/Node/.NET) di PC kasir: HTTP/WebSocket di `127.0.0.1`, menulis RAW ke spooler Windows, TCP 9100, COM port BT | Biaya pengembangan + installer + update | Ya | `http://localhost` termasuk origin "potentially trustworthy", jadi tidak terkena mixed content dari halaman HTTPS [C16b]. Tetap butuh izin LNA sekali [C17][C18]. |

## 5. Laci kas (cash drawer)

- Laci dihubungkan ke port **drawer kick-out (RJ11/RJ12)** printer struk. Printer mengeluarkan pulsa ke pin 2 atau pin 5.
- Perintah standar: **`ESC p m t1 t2`** = hex `1B 70 m t1 t2`. `m` = 0/48 (pin 2) atau 1/49 (pin 5). Waktu ON = t1×2 ms, OFF = t2×2 ms; disarankan t1 < t2. Pin 2 dan 5 tidak bisa aktif bersamaan [C24].
- Alternatif real-time: **`DLE DC4 1 m t`** = hex `10 14 01 m t`, pulsa t×100 ms (t=1–8). Diabaikan saat printer error [C24b]. Contoh QZ: `\x10\x14\x01\x00\x05` [C21b].
- Contoh umum (**inferensi**, sesuaikan per laci): `1B 70 00 19 FA` (pin 2, ON 50 ms, OFF 500 ms).
- Di Epson ePOS SDK: `addPulse(DRAWER_1|DRAWER_2, PULSE_100..500)` [C25]. Sunmi desktop: `openDrawer()` lewat SDK [C27]. iMin: `openCashBox()` [C28].
- Implikasi: membuka laci **butuh jalur ESC/POS mentah** (agen, WebUSB/Web Serial, atau SDK vendor). Lewat `window.print()` hanya bisa jika driver menyediakan opsi itu **(inferensi)**.

## 6. Printer thermal ESC/POS yang umum di Indonesia

| Merek / model | Interface | Kertas | Catatan |
|---|---|---|---|
| **Epson TM-T82X** | USB + Serial (9 pin) / Ethernet (varian) [C29b] | 80 mm atau 58 mm (varian) [C29b] | Mendukung ePOS SDK Android & iOS [C29b] |
| **Epson TM-T82IV** (situs Epson Indonesia) | USB, Serial, Ethernet, opsi dongle Wi-Fi [C29] | 79,5 mm / 57,5 mm; 576/420 dot; 250 mm/s [C29] | ePOS-Print, termasuk JavaScript SDK [C29] |
| **Xprinter** (mis. XP-58 series, XP-Q80/Q890K) | USB; varian Bluetooth/LAN/Wi-Fi tergantung model | Seri 58, 76, 80 mm [C30] | Banyak dijual sebagai "ESC/POS compatible" |
| **Blueprint** (merek lokal, mis. 58D, BP-LITE80D1) | USB + Bluetooth + RJ11 laci [C31][C31b] | 58 mm (48 mm cetak, 384 dot) / 80 mm (72 mm cetak, 576 dot) [C31][C31b] | Harga marketplace ±Rp390rb (58D) – ±Rp985rb (BP-LITE80D1) per 2026-10-04 [C31][C31b] |
| **EPPOS, Panda, Iware** | Umumnya USB / USB+BT / USB+LAN | 58 & 80 mm | **Tidak ditemukan dokumentasi resmi yang bisa dikutip.** Asumsikan ESC/POS generik dan uji perangkat nyata. |
| **Sunmi** (V2, T2, D2, dll.) | Printer internal: AIDL `printerlibrary` atau **perangkat Bluetooth virtual "InnerPrinter"** (SPP UUID `00001101-…`) yang menerima ESC/POS [C27] | 58 mm (384 px, handheld) / 80 mm (576 px, desktop seperti T1) [C27] | Laci hanya di model desktop (`openDrawer()`) [C27]. Antarmuka H5→native dihapus dari dokumen [C27]. |
| **iMin** (M2, D1, dll.) | Printer internal SPI/USB/Bluetooth; ada JS Printer SDK [C28] | 58 / 80 mm [C28] | `openCashBox()` [C28] |

Catatan praktis **(inferensi)**:
- **80 mm** adalah standar untuk struk restoran dan tiket dapur (576 dot). **58 mm** (384 dot) umum di kasir kecil dan perangkat genggam. Template harus mendukung keduanya (lebar karakter 48 vs 32 pada font A).
- Printer dapur sebaiknya **LAN + auto-cutter**. Bluetooth tidak stabil untuk jarak dan banyak pengirim.
- Printer Bluetooth murah umumnya Classic SPP saja, bukan BLE. Ini harus dicek per model sebelum dijadikan rekomendasi.
- Karakter non-ASCII (mis. "é") dan logo membutuhkan code page/raster. Kirim teks ASCII + logo bitmap `GS v 0` agar aman lintas merek.

## 7. Arsitektur yang diusulkan (inferensi)

```
Kasir PWA (Chrome/Edge)
  └─ PrinterService (job: {jobId, printerRole: struk|dapur:<stasiun>, bytes ESC/POS})
       ├─ AgentTransport   → http/ws://127.0.0.1:<port>  → USB (spooler RAW) / LAN :9100 / COM BT
       ├─ WebUsbTransport  → (Android, ChromeOS, macOS)
       ├─ WebSerialTransport → Bluetooth SPP (desktop ≥117, Android ≥137), USB-serial (desktop)
       ├─ EposTransport / WebPrntTransport → Epson/Star LAN
       └─ (nanti) HubTransport → wss://<hub-id>.hub.<domain> → routing + KDS LAN
```

- Job cetak disimpan di Dexie, dengan status (antre/terkirim/gagal) dan tombol "cetak ulang". Ini sejalan dengan outbox ADR 0003.
- Pemilihan perangkat (requestDevice/requestPort) dilakukan sekali di layar **Pengaturan Printer** (butuh user gesture). Setelah itu cukup memakai `getDevices()`/`getPorts()` [C1][C10].
- Kebijakan dapur offline: tiket dapur dicetak **saat pesanan dikirim**, tidak menunggu sinkron.

## Daftar sumber

**Chrome / W3C / MDN**
- [C1] WebUSB — https://developer.chrome.com/docs/capabilities/usb
- [C2] Building a device for WebUSB (driver per OS) — https://developer.chrome.com/docs/capabilities/build-for-webusb
- [C3] Web Bluetooth — https://developer.chrome.com/docs/capabilities/bluetooth
- [C4] Intent to Implement and Ship: WebUSB Interface Class Filtering — https://groups.google.com/a/chromium.org/g/blink-dev/c/LZXocaeCwDw/m/GLfAffGLAAAJ
- [C5] Zebra Developer: "DOMException: Failed to execute 'open' on 'USBDevice': Access denied" (Windows, sekunder/forum vendor) — https://developer.zebra.com/content/domexception-failed-execute-open-usbdevice-access-denied
- [C6] MDN WebUSB API — https://developer.mozilla.org/en-US/docs/Web/API/WebUSB_API
- [C6b] MDN Web Serial API — https://developer.mozilla.org/en-US/docs/Web/API/Web_Serial_API
- [C7] Direct Sockets (IWA) — https://developer.chrome.com/docs/iwa/direct-sockets
- [C8] Intent to Ship: Direct Sockets API (Chrome 130) — https://groups.google.com/a/chromium.org/g/blink-dev/c/5R0P_aYBWQI/m/rFMq-qYAEQAJ
- [C9] Google Admin: Automatically install web apps and Isolated Web Apps — https://support.google.com/chrome/a/answer/9367354
- [C9b] IWA allowlist — https://developer.chrome.com/docs/iwa/allowlist
- [C10] Web Serial API — https://developer.chrome.com/docs/capabilities/serial
- [C11] Serial over Bluetooth on the web (Chrome 117) — https://developer.chrome.com/blog/serial-over-bluetooth
- [C11b] Bluetooth RFCOMM updates in Web Serial (Chrome 130) — https://developer.chrome.com/blog/bluetooth-rfcomm-updates-web-serial
- [C12] Intent to Ship: Web Serial support for Bluetooth RFCOMM services — https://groups.google.com/a/chromium.org/g/blink-dev/c/P4YwDCcvdvs/m/CHbyTu_gAAAJ
- [C13] Intent to Ship: Web serial over Bluetooth on Android (Chrome 137) — https://groups.google.com/a/chromium.org/g/blink-dev/c/BqUGCcurReE/m/XbuAYkRxEQAJ
- [C14] Chromium `chrome_switches.cc` (`kKioskModePrinting = "kiosk-printing"`) — https://github.com/chromium/chromium/blob/main/chrome/common/chrome_switches.cc
- [C15] Web Bluetooth implementation status — https://github.com/WebBluetoothCG/web-bluetooth/blob/main/implementation-status.md
- [C15b] Persistent Permissions Implementation for Chrome (public-web-bluetooth, Jul 2020) — https://lists.w3.org/Archives/Public/public-web-bluetooth/2020Jul/0000.html
- [C16] Intent to Ship: Local network access restrictions — https://groups.google.com/a/chromium.org/g/blink-dev/c/cwu_RUmBpzY/m/hk8YuZDWHgAJ
- [C16b] MDN Secure contexts (localhost potentially trustworthy) — https://developer.mozilla.org/en-US/docs/Web/Security/Secure_Contexts
- [C17] New permission prompt for Local Network Access (Chrome 142) — https://developer.chrome.com/blog/local-network-access
- [C18] Phoronix: Chrome 147 stable (LNA untuk WebSocket, Web Printing API; sekunder) — https://www.phoronix.com/news/Chrome-147-Stable-Released
- [C26] Intent to Ship: Web Printing API — https://groups.google.com/a/chromium.org/g/blink-dev/c/6MmqQj3mzcY/m/QvgBDBytAwAJ
- [C26b] WICG Web Printing — https://github.com/WICG/web-printing

**Vendor**
- [C19] Epson ePOS SDK (ikhtisar teknologi) — https://download4.epson.biz/sec_pubs/pos/reference_en/technology/epson_epos_sdk.html
- [C19b] Epson Server Direct Print — https://download4.epson.biz/sec_pubs/pos/reference_en/technology/server_direct_print.html
- [C19c] Epson ePOS SDK for JavaScript v2.27.0 overview (model & browser didukung) — https://download3.ebz.epson.net/dsc/f/03/00/15/16/08/912403dcd72ccb22fc13f41eec229b35e2a1ea9c/ov_ePOS_SDK_JavaScript_v2.27.0.pdf
- [C20] Epson ePOS SDK JS `connect` method (port 8008/8043, omnilinkcert) — https://download4.epson.biz/sec_pubs/pos/reference_en/epos_js/ref_epos_sdk_js_en_eposdeviceobject_connectmethod.html
- [C21] QZ Tray licensing — https://qz.io/docs/licensing
- [C21b] QZ Tray raw printing (host:port 9100, drawer kick) — https://qz.io/docs/raw
- [C22] QZ Tray Premium Support (harga) — https://buy.qz.io/Premium-Support-_p_13.html
- [C23a] QZ Tray signing — https://qz.io/docs/signing
- [C23] Star webPRNT manual: sample program (URL, HTTPS) — https://star-m.jp/products/s_print/sdk/webprnt/manual/en/_sampleProgram.htm
- [C23b] Star webPRNT interface compatibility table — https://star-m.jp/products/s_print/sdk/webprnt/manual/en/_interfaceTable.htm
- [C23c] Star Web SDK (StarXpand SDK for Web, webPRNT) — https://starmicronics.com/support/fr/developers/web-sdk/
- [C24] Epson ESC/POS `ESC p` — https://download4.epson.biz/sec_pubs/pos/reference_en/escpos/esc_lp.html
- [C24b] Epson ESC/POS `DLE DC4 (fn=1)` — https://download4.epson.biz/sec_pubs/pos/reference_en/escpos/dle_dc4_fn1.html
- [C25] Epson ePOS SDK JS `addPulse` — https://download4.epson.biz/sec_pubs/pos/reference_en/epos_js/ref_epos_sdk_js_en_printerobject_addpulsemethod.html
- [C27] Sunmi Printer Developer Docs 1.1 — https://file.cdn.sunmi.com/SUNMIDOCS/SunmiPrinter-Developer-Docs-1-1.pdf
- [C28] iMin JS Printer SDK — https://oss-sg.imin.sg/docs/en/JSPrinterSDK.html
- [C29] Epson Indonesia TM-T82IV — https://www.epson.co.id/For-Work/Printers/POS-Printers/Epson-TM-T82IV-Thermal-Receipt-Printer/p/C31CL47412
- [C29b] Epson TM-T82X brochure (Epson Singapore) — https://download.epson.com.sg/product_brochures/pos/EPC/Epson%20TM-T82X%20Brochure%20(Updated).pdf?t=4
- [C30] Xprinter (situs resmi) — https://www.xprintertech.com/
- [C31] Toko resmi Blueprint di Tokopedia: Blueprint 58D (sekunder, marketplace) — https://www.tokopedia.com/blueprint/printer-thermal-pos-blueprint-58d-support-usb-bluetooth-rj11
- [C31b] Blueprint BP-LITE80D1 di Tokopedia (sekunder, marketplace) — https://www.tokopedia.com/techno-comp/printer-thermal-kasir-blueprint-bp-lite80d1-usb-bluetooth-rj11

## Keterbatasan riset

- Klaim "printer USB di Windows diklaim driver bawaan sehingga WebUSB gagal" didukung dokumen Chrome (perlu WinUSB) dan laporan forum Zebra, bukan bug Chromium resmi. **Uji dengan 2–3 printer populer** (Epson TM-T82X, Xprinter, Blueprint) di Windows 10/11.
- Web Serial Bluetooth di Android (Chrome 137+) dengan printer SPP dan Sunmi "InnerPrinter" belum diuji. Ini harus dibuktikan dengan prototipe.
- Dokumentasi resmi EPPOS, Panda, dan Iware tidak ditemukan. Data Blueprint dari marketplace.
- Lisensi Epson ePOS SDK dan Star SDK tidak dibaca detail. Daftar browser yang diuji di ePOS SDK JS v2.27 berhenti di Chrome 108; perilaku di Chrome terbaru dengan LNA perlu diuji.
- Kebijakan enterprise untuk pre-grant LNA disebut "direncanakan" di blog Chrome [C17]; nama kebijakan final belum diverifikasi.
- Perilaku `--kiosk-printing` di Edge tidak diverifikasi dari dokumentasi Microsoft.
