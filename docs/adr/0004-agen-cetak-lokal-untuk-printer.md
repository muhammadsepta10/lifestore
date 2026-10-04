# 0004: Agen Cetak lokal untuk printer struk, printer dapur, dan laci kas

Tanggal: 2026-10-04 · Status: diterima · Tiket: #28, #29

## Konteks

ADR 0003 menjadikan printer dapur sebagai jalur dapur saat offline. Riset #28 (`research/cetak-printer.md` di branch `research/cetak-printer`) menemukan bahwa PWA di Chrome/Edge tidak bisa membuka TCP ke printer LAN port 9100. Di Windows, WebUSB juga tidak bisa memakai printer USB karena driver printer Windows sudah memegang perangkat. Mayoritas kasir di Indonesia memakai PC Windows dengan printer ESC/POS generik.

## Keputusan

- Kasir memakai satu antarmuka `PrinterTransport` dengan beberapa driver. Byte ESC/POS dibuat di kasir (`packages/escpos`), dan job cetak masuk antrean Dexie dengan `jobId` idempoten.
- **Windows**: Agen Cetak, yaitu program kecil di PC kasir yang mendengarkan di `127.0.0.1`. Agen ini mencetak ke USB (antrean RAW Windows), LAN `IP:9100`, dan COM Bluetooth, serta membuka laci kas dengan `ESC p`. Agen sengaja dibuat "bodoh": hanya meneruskan byte, tanpa logika bisnis.
- **Android**: tanpa instalasi, memakai WebUSB dan Web Serial Bluetooth (Chrome 137+).
- **Epson ePOS / Star WebPRNT**: driver opsional untuk mencetak langsung lewat LAN.
- Agen Cetak ditulis dengan Go (satu file biner, tanpa runtime) di `apps/print-agent`. Installer Windows punya update otomatis. Pairing dengan kasir memakai token per Perangkat Terdaftar.
- Code signing belum dibeli di awal untuk menekan biaya (#29). Installer akan memunculkan peringatan SmartScreen sampai sertifikat dibeli.
- Hub Lokal nantinya memakai kode yang sama dengan Agen Cetak, ditambah KDS lewat LAN.

## Alternatif yang ditolak

- **QZ Tray**: pesan harus ditandatangani agar tidak muncul pop-up. Penandatanganan di backend tidak jalan saat offline, sedangkan di klien mengekspos kunci. Dukungan berbayar USD 599/tahun.
- **Kiosk printing (`--kiosk-printing`)**: tidak bisa mengirim ESC/POS, tidak bisa membuka laci, dan tidak bisa memilih printer dapur per Stasiun.
- **Isolated Web App + Direct Sockets**: hanya tersedia di ChromeOS terkelola.

## Konsekuensi

- Ada jalur rilis kedua (installer Windows) yang harus dirawat.
- Setiap origin kasir butuh satu kali izin Local Network Access di Chrome 142+.
- Belum diuji di perangkat nyata. Uji perangkat masuk ke prototipe kasir (#20).
