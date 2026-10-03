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

## Pembelian

**Supplier**:
Pihak yang menjual Bahan ke Tenant; dikelola per Tenant beserta riwayat harga per Bahan.
_Avoid_: Vendor, pemasok

**Purchase Order**:
Pesanan pembelian resmi ke Supplier dengan Lokasi Stok tujuan, yang bisa diterima sebagian dan bisa memerlukan persetujuan di atas batas nominal Tenant.
_Avoid_: PO (boleh sebagai singkatan), pesanan (bertabrakan dengan Pesanan pelanggan)

**Belanja Langsung**:
Pembelian tanpa Purchase Order (misal ke pasar) yang dicatat dari nota dan langsung menambah stok.
_Avoid_: Pembelian tunai, belanja pasar

**Penerimaan Barang**:
Pencatatan barang yang benar-benar datang beserta jumlah dan harga sebenarnya; harga ini yang dipakai untuk HPP.
_Avoid_: Goods receipt, GRN

**Hutang Dagang**:
Kewajiban bayar ke Supplier atas pembelian tempo, dengan jatuh tempo dan bisa dicicil.
_Avoid_: AP, utang supplier

**Kas Kecil**:
Dana tunai Outlet yang terpisah dari laci kasir, dipakai untuk pengeluaran kecil seperti Belanja Langsung.
_Avoid_: Petty cash

## Pembayaran

**Pembayaran**:
Satu pelunasan sebagian atau seluruh Tagihan dengan satu Metode Bayar; satu Tagihan bisa punya banyak Pembayaran.
_Avoid_: Transaksi, payment

**Metode Bayar**:
Cara bayar yang diaktifkan per Outlet: tunai, QRIS dinamis (gateway), QRIS statis resto, kartu via EDC, transfer bank, e-wallet (gateway), atau Piutang.
_Avoid_: Payment type, tender

**Sub-akun Gateway**:
Akun payment gateway milik masing-masing Tenant (KYC atas nama resto) tempat dana pelanggan langsung masuk; platform hanya menerima potongan komisi.
_Avoid_: Merchant account, rekening platform

**Piutang**:
Tagihan yang ditutup tanpa dibayar untuk Pelanggan terdaftar dengan batas kredit, dilunasi belakangan dengan persetujuan atasan.
_Avoid_: Kasbon, AR, bon

**Pembulatan Tunai**:
Selisih kecil karena pembayaran tunai dibulatkan sesuai aturan Outlet, dicatat terpisah dari penjualan.
_Avoid_: Kembalian, receh

**Rekonsiliasi**:
Pencocokan Pembayaran yang tercatat dengan dana yang benar-benar diterima: otomatis untuk gateway, manual untuk EDC dan transfer.
_Avoid_: Settlement (itu sisi gateway), cocokkan kas

## Keuangan

**Jurnal**:
Catatan double-entry yang dibuat otomatis dari setiap kejadian uang atau stok (atau manual oleh akuntan), selalu milik satu Outlet atau Pusat.
_Avoid_: Entri, posting, transaksi akuntansi

**Bagan Akun**:
Daftar akun milik Tenant yang berasal dari template resto; akun yang dipakai sistem tidak bisa dihapus.
_Avoid_: COA, chart of accounts

**Pusat**:
Unit pembukuan Tenant yang bukan Outlet (dapur pusat, kantor), tempat biaya bersama dicatat dan bisa dialokasikan manual ke Outlet.
_Avoid_: HQ, head office, kantor pusat

**Biaya Operasional**:
Pengeluaran di luar Bahan (gaji, sewa, listrik, gas) yang dicatat dengan kategori dan sumber dana, bisa dijadwalkan berulang.
_Avoid_: Expense, beban (kecuali dalam istilah akun)

**Tutup Buku**:
Penguncian satu periode bulanan; koreksi atas periode terkunci dilakukan lewat jurnal penyesuaian di periode berjalan.
_Avoid_: Closing, tutup bulan

**Penjualan Diakui**:
Saat Tagihan ditutup (lunas atau menjadi Piutang); HPP diakui lebih awal, saat stok dipotong.
_Avoid_: Revenue recognition

## Karyawan

**Peran**:
Kumpulan izin yang diberikan lewat Penugasan; tersedia peran bawaan (Pemilik, Manajer Outlet, Kasir, Pelayan, Dapur, Gudang, Akuntan) dan Tenant bisa membuat peran sendiri dari daftar izin.
_Avoid_: Role, jabatan, level akses

**Perangkat Terdaftar**:
Tablet atau PC milik Outlet yang didaftarkan sekali oleh manajer; staf berganti di perangkat ini cukup dengan PIN.
_Avoid_: Device, terminal, mesin kasir

**PIN**:
Kode 4–6 digit milik Anggota untuk masuk di Perangkat Terdaftar; staf boleh hanya punya PIN tanpa akun Pengguna.
_Avoid_: Password, kode staf

**Shift**:
Satu sesi laci kas di satu Perangkat Terdaftar, dari modal awal sampai Hitung Buta; semua kas masuk/keluar tercatat di dalamnya.
_Avoid_: Sesi kasir, tutup kasir

**Hitung Buta**:
Penghitungan uang di laci saat Shift ditutup tanpa melihat angka sistem; selisihnya dicatat.
_Avoid_: Blind count, setoran

**Persetujuan Atasan**:
Izin dari Anggota berwenang untuk aksi sensitif (void setelah dimasak, refund, diskon manual di atas batas, Piutang, buka laci tanpa transaksi, Item Custom), lewat PIN di perangkat yang sama atau notifikasi ke HP atasan.
_Avoid_: Override, otorisasi manager

**Absensi**:
Catatan jam masuk dan pulang Anggota lewat PIN di Perangkat Terdaftar, dengan selfie opsional, bisa diekspor untuk penggajian di luar sistem.
_Avoid_: Presensi, clock-in

## QR Meja

**Meja**:
Tempat duduk di satu Outlet dengan QR stiker statis yang tidak berubah; bisa dinonaktifkan dari kasir.
_Avoid_: Table, nomor meja (itu label, bukan entitasnya)

**Sesi Meja**:
Kunjungan yang dibuka saat QR Meja pertama kali dipindai dan terikat ke satu Tagihan; semua HP yang memindai QR yang sama ikut sesi ini, dan sesi ditutup otomatis saat Tagihan lunas.
_Avoid_: Session, kunjungan, check-in

**Konfirmasi Staf**:
Pengaturan per Outlet apakah Pesanan dari QR langsung ke dapur, hanya Pesanan pertama tiap Sesi Meja yang dikonfirmasi pelayan/kasir (default), atau semua Pesanan dikonfirmasi.
_Avoid_: Approval pesanan, verifikasi order

**Panggilan Pelayan**:
Permintaan dari HP pelanggan dengan alasan singkat yang muncul di layar kasir dan HP pelayan, dibatasi satu per menit per Meja.
_Avoid_: Call waiter, bel
