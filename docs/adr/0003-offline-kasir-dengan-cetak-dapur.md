# 0003: Kasir offline di browser, dapur offline lewat printer dulu

Tanggal: 2026-10-03 · Status: diterima · Tiket: #13

## Konteks

Kasir dan dapur harus tetap jalan saat internet outlet mati. Kasir adalah PWA di browser. Browser tidak bisa membuka server, menemukan perangkat lain di LAN, atau memakai WebRTC tanpa signaling dari cloud, jadi kasir tidak bisa langsung mengirim pesanan ke layar dapur tanpa internet.

## Keputusan

- Kasir menyimpan data di IndexedDB (Dexie) dengan antrean aksi idempoten yang dikirim ke NestJS saat online; desain data kompatibel PowerSync (UUID teks, `tenant_id`).
- Saat offline, pesanan ke dapur dicetak di printer dapur. Layar dapur (KDS) online-only di versi pertama.
- Hub Lokal (perangkat di outlet yang meneruskan pesanan via LAN) menjadi tambahan opsional nanti; protokol event pesanan dirancang agar Hub Lokal bisa ditambahkan tanpa mengubah klien.
- Konflik tidak diselesaikan otomatis: pesanan dan pembayaran append-only, kasus ganda masuk daftar Perlu Ditinjau.
- Browser resmi untuk kasir dan dapur: Chrome/Edge. Safari/iPad tanpa jaminan offline penuh.

## Alternatif yang ditolak

- Hub Lokal wajib sejak awal: andal, tapi setiap outlet harus membeli dan merawat perangkat tambahan sebelum bisa mulai.
- Aplikasi native (Capacitor) untuk kasir/KDS: bisa bicara via LAN, tapi menambah jalur rilis kedua sebelum produk web terbukti.
- Zero/Replicache/Dexie Cloud: tidak mendukung tulis offline, berbayar per pengguna aktif, atau backend-nya bukan Postgres kita.

## Konsekuensi

- Outlet yang ingin dapur tetap jalan saat offline wajib punya printer dapur yang terhubung ke perangkat kasir.
- Nomor Nota resmi baru ada setelah Sinkron; struk offline memakai Nomor Pesanan perangkat.
- Pemesanan QR meja dijeda otomatis saat tidak ada perangkat Outlet terhubung lebih dari 2 menit.
