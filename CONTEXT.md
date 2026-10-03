# Lifestore

SaaS manajemen restoran multi-tenant untuk pasar Indonesia: pemesanan (QR meja, web, ojol), dapur, kasir, stok, dan keuangan.

## Struktur usaha

**Tenant**:
Satu pelanggan SaaS (pemilik usaha) yang berlangganan; batas tertinggi kepemilikan dan isolasi data.
_Avoid_: Akun, perusahaan, klien

**Merek**:
Identitas dagang di bawah satu Tenant yang memiliki menu induk dan resepnya sendiri; setiap Tenant punya minimal satu Merek default.
_Avoid_: Brand, restoran

**Outlet**:
Satu lokasi fisik milik sebuah Merek tempat pesanan dilayani; punya stok, meja, perangkat, shift kasir, dan pengaturan pajak sendiri.
_Avoid_: Cabang, toko, store

## Orang

**Pengguna**:
Satu akun login global milik seseorang, yang bisa menjadi Anggota di beberapa Tenant.
_Avoid_: User, akun

**Anggota**:
Keterlibatan seorang Pengguna di satu Tenant beserta perannya.
_Avoid_: Membership, staf

**Penugasan**:
Izin seorang Anggota untuk bekerja di Outlet tertentu.
_Avoid_: Assignment, akses outlet

**Pelanggan**:
Orang yang memesan di resto, dikenali per Tenant (biasanya lewat nomor HP); tidak dibagi antar Tenant.
_Avoid_: Customer, konsumen, member (kecuali dalam konteks loyalti)

## Pesanan

**Kanal**:
Jalur asal pesanan: QR meja, kasir (dine-in/takeaway), web sendiri, atau ojol (GoFood/GrabFood/ShopeeFood); menentukan alur bayar-dulu atau bayar-di-akhir.
_Avoid_: Channel, sumber

**Tagihan**:
Satu unit pembayaran (satu kunjungan meja, satu takeaway, atau satu order ojol) yang menampung satu atau lebih Pesanan dan bisa menempati lebih dari satu meja.
_Avoid_: Bill, open bill, transaksi, nota

**Pesanan**:
Satu kali kiriman item ke dapur di dalam sebuah Tagihan; status dapurnya diturunkan dari Item Pesanan di dalamnya.
_Avoid_: Order, ronde, tiket

**Item Pesanan**:
Satu menu di dalam Pesanan beserta varian, add-on, dan catatannya, dengan status dapur sendiri (menunggu, dimasak, siap, disajikan, batal); tidak bisa diubah setelah dikirim ke dapur.
_Avoid_: Order line, line item

**Nomor Pesanan**:
Nomor pendek harian per Outlet dengan awalan perangkat (misal A-023) untuk dipanggil pelanggan dan dapur; berbeda dari ID unik internal.
_Avoid_: Nomor antrian, order ID

**Pisah Tagihan**:
Memindahkan sebagian item ke Tagihan baru; berbeda dari Bayar Terpisah, yaitu satu Tagihan dilunasi dengan beberapa pembayaran.
_Avoid_: Split bill (ambigu)

**Waste**:
Bahan yang terpakai tetapi tidak menghasilkan penjualan, misalnya Item Pesanan yang dibatalkan setelah dimasak.
_Avoid_: Bahan terbuang, loss

## Menu

**Menu**:
Sesuatu yang bisa dipesan pelanggan, dimiliki sebuah Merek dan dikelompokkan dalam Kategori.
_Avoid_: Produk, item, SKU

**Varian**:
Pilihan wajib-tepat-satu pada sebuah Menu yang mengubah harga dan resepnya (misal Reguler / Jumbo).
_Avoid_: Ukuran, size

**Grup Pilihan**:
Sekumpulan pilihan tambahan pada Menu dengan aturan jumlah minimum/maksimum, masing-masing bisa gratis atau berbayar (misal level pedas, topping).
_Avoid_: Modifier, add-on group

**Paket**:
Menu berharga sendiri yang terdiri dari komponen tetap dan slot pilihan; stok dan stasiun dapur ditentukan per komponen.
_Avoid_: Combo, bundle

**Harga Kanal**:
Aturan markup (persen atau nominal) yang berlaku untuk satu Kanal, dengan override per Menu; diterapkan setelah harga dasar Merek dan override Outlet.
_Avoid_: Harga ojol, price list

**Stasiun**:
Area kerja dapur di sebuah Outlet (misal Bar, Dapur, Grill) yang menerima Item Pesanan sesuai pemetaan Menu.
_Avoid_: Station, printer

**Habis**:
Status Menu yang sementara tidak bisa dipesan di sebuah Outlet, ditandai manual atau otomatis dari stok jika Outlet mengaktifkannya.
_Avoid_: Sold out, kosong

**Item Custom**:
Item di luar Menu dengan nama dan harga yang diisi manual oleh peran yang diizinkan; tidak punya resep dan tidak memotong stok.
_Avoid_: Open item, item manual

## Stok

**Bahan**:
Barang yang disimpan dan dipakai untuk membuat Menu, dicatat dalam satuan dasar (gram, ml, pcs) dengan satuan beli yang punya konversi.
_Avoid_: Bahan baku (kecuali membedakan dari Bahan Setengah Jadi), inventory item, SKU

**Bahan Setengah Jadi**:
Bahan yang dibuat sendiri secara batch dari Bahan lain (sambal, kaldu, adonan) lewat Produksi, dan punya resep sendiri.
_Avoid_: WIP, prep item

**Resep**:
Daftar Bahan dan takarannya untuk satu Menu, Varian, atau pilihan Grup Pilihan; ditetapkan di Merek dan berlaku sama di semua Outlet.
_Avoid_: BOM, komposisi

**Produksi**:
Kejadian membuat Bahan Setengah Jadi: Bahan pembentuk keluar dari stok, hasilnya masuk ke stok.
_Avoid_: Prep, masak batch

**Lokasi Stok**:
Tempat stok disimpan: gudang milik Outlet (minimal satu default) atau dapur/gudang pusat milik Tenant yang bukan Outlet.
_Avoid_: Gudang (ambigu), warehouse

**Transfer**:
Perpindahan Bahan antar Lokasi Stok dalam dua langkah, dikirim lalu diterima, dengan selisih tercatat.
_Avoid_: Mutasi, kirim barang

**Stock Opname**:
Penghitungan fisik stok (penuh atau sebagian) yang menghasilkan penyesuaian sebesar selisihnya.
_Avoid_: Stock take, hitung stok

**HPP**:
Biaya bahan dari barang yang terjual, dihitung dengan rata-rata tertimbang per Lokasi Stok.
_Avoid_: COGS, modal
