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
Tempat duduk di satu Outlet dengan QR stiker statis yang tidak berubah, kapasitas kursi, dan status Kosong, Dipesan, atau Terisi; bisa dinonaktifkan dari kasir.
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

## Offline

**Sinkron**:
Pengiriman antrean aksi perangkat ke server (idempoten, tidak dihapus sebelum server mengonfirmasi) dan penarikan perubahan terbaru dari server.
_Avoid_: Sync, upload, backup

**Nomor Nota**:
Nomor resmi berurutan tanpa celah per Outlet yang diberikan server saat Tagihan tersinkron; struk yang dicetak offline memakai Nomor Pesanan perangkat.
_Avoid_: Nomor struk, nomor faktur, invoice number

**Perlu Ditinjau**:
Daftar kejadian hasil Sinkron yang butuh keputusan manusia, misalnya satu Meja dibuka di dua perangkat atau pembayaran ganda; tidak pernah diselesaikan otomatis.
_Avoid_: Konflik, error sync

**Hub Lokal**:
Perangkat tambahan opsional di Outlet yang meneruskan pesanan dari kasir ke layar dapur lewat jaringan lokal saat internet mati; tanpa Hub Lokal, dapur memakai tiket cetak.
_Avoid_: Server lokal, local server, gateway

## Pajak

**Profil Pajak**:
Pengaturan pajak satu Outlet: jenis (PBJT, PPN, atau tidak dipungut), tarif, kota, label di struk, ambang omzet, dan tanggal mulai berlaku; sama untuk semua Kanal.
_Avoid_: Setting pajak, tax config

**PBJT**:
Pajak daerah atas makanan dan minuman (pengganti Pajak Restoran/PB1), maksimal 10%, tarifnya ditetapkan Perda kota tempat Outlet berada.
_Avoid_: PB1 (kecuali sebagai label struk), pajak restoran, PPN

**Service Charge**:
Biaya layanan dengan tarif per Outlet, default hanya untuk dine-in, dihitung dari harga setelah diskon, dan ikut menjadi dasar PBJT.
_Avoid_: Biaya layanan, SC, tips

**Dasar Pajak**:
Jumlah yang dikenai PBJT dalam satu Tagihan: subtotal setelah diskon ditambah Service Charge; voucher yang dipakai sebagai alat bayar tidak menguranginya.
_Avoid_: DPP (boleh di laporan), omzet kena pajak

## Ojol

**Kode Pesanan Platform**:
Kode pesanan dari aplikasi ojol (misal F-123) yang diketik kasir ke Tagihan ojol, dipakai untuk mencocokkan dengan driver dan laporan platform.
_Avoid_: Order ID ojol, booking code

**Piutang Platform**:
Metode Bayar untuk Tagihan ojol: Tagihan langsung lunas, dananya ditagih ke platform sampai pencairan dicatat lewat Rekonsiliasi.
_Avoid_: Saldo GoFood, settlement ojol

**Komisi Platform**:
Potongan platform ojol (persen per Kanal, plus PPN atas komisi) yang dicatat sebagai perkiraan biaya saat Tagihan ditutup dan disesuaikan saat dana cair.
_Avoid_: Fee ojol, MDR (itu biaya Metode Bayar)

**Promo Platform**:
Diskon di aplikasi ojol; hanya bagian yang ditanggung resto yang dicatat sebagai diskon, bagian yang ditanggung platform tidak dicatat.
_Avoid_: Promo ojol, subsidi

**Siap Diambil**:
Daftar di kasir berisi pesanan ojol dan takeaway yang sudah selesai dimasak dan menunggu diambil driver atau pelanggan.
_Avoid_: Pickup list, ready queue

## Langganan

**Paket Langganan**:
Tingkat langganan Tenant (Dasar, Pro, Bisnis) yang menentukan fitur yang terbuka; ditagih per Outlet per bulan atau per tahun. Selalu ditulis lengkap agar tidak tertukar dengan Paket menu.
_Avoid_: Paket (tanpa "Langganan"), plan, tier, lisensi

**Masa Coba**:
14 hari pertama Tenant dengan semua fitur Pro tanpa kartu.
_Avoid_: Trial, demo

**Mode Terbatas**:
Keadaan Tenant yang telat bayar 8–30 hari atau habis Masa Coba: kasir tetap bisa berjualan dan Sinkron, pengaturan dan laporan dikunci.
_Avoid_: Suspend (itu tahap setelahnya), read-only

**Komisi Transaksi**:
Potongan platform atas pembayaran online lewat gateway yang dipisah otomatis dari Sub-akun Gateway; tidak ada untuk tunai dan metode manual.
_Avoid_: Fee platform, MDR (itu biaya gateway)

**Admin Platform**:
Tim Lifestore yang mengelola Tenant lewat back-office; masuk sebagai Tenant hanya dengan izin pemilik dan selalu tercatat.
_Avoid_: Superadmin, tim support

## Promo

**Promo**:
Aturan potongan harga milik Merek (diskon persen/nominal, beli X gratis Y, Happy Hour, minimum belanja) dengan cakupan Outlet, Kanal, periode, jadwal, dan kuota; terpasang otomatis saat syarat terpenuhi. Default tidak berlaku di Kanal ojol.
_Avoid_: Diskon (itu hasilnya), campaign, Promo Platform (itu promo di aplikasi ojol)

**Bisa Digabung**:
Tanda pada Promo yang mengizinkannya berlaku bersama Promo lain; tanpa tanda ini sistem memilih satu Promo yang paling menguntungkan pelanggan.
_Avoid_: Stackable, kombinasi

**Diskon Manual**:
Potongan yang diberikan kasir dengan alasan wajib, dibatasi persentase per Peran; di atas batas butuh Persetujuan Atasan.
_Avoid_: Diskon kasir, open discount

**Voucher Diskon**:
Kode (bisa massal dan unik) yang mengaktifkan Promo; maksimal satu per Tagihan; mengurangi Dasar Pajak.
_Avoid_: Kupon, promo code

**Voucher Saldo**:
Voucher berbayar seperti gift card; saat dijual dicatat sebagai uang muka, menjadi penjualan saat dipakai sebagai Metode Bayar, dan tidak mengurangi Dasar Pajak.
_Avoid_: Gift card, voucher belanja, deposit

## Loyalti

**Member**:
Pelanggan yang mendaftar dengan email terverifikasi OTP (nomor HP dicatat sebagai pengenal cepat di kasir); keanggotaannya berlaku per Tenant di semua Merek dan Outlet.
_Avoid_: Anggota (itu staf), customer terdaftar

**Poin**:
Saldo loyalti Member yang didapat saat Tagihan ditutup (default 1 per Rp10.000 setelah diskon, sebelum pajak, kecuali Kanal ojol), ditarik kembali saat void/refund, dan hangus 12 bulan setelah didapat (yang terlama dipakai dulu).
_Avoid_: Reward, koin, cashback

**Penukaran Poin**:
Pemakaian Poin untuk potongan rupiah atau hadiah katalog dengan verifikasi OTP lewat email; dicatat sebagai diskon, boleh digabung dengan Promo otomatis tapi tidak dengan Voucher Diskon.
_Avoid_: Redeem, klaim

**Tier**:
Tingkat Member opsional (default mati) berdasarkan belanja 12 bulan terakhir, yang memberi pengali Poin.
_Avoid_: Level, kasta

## Reservasi

**Reservasi**:
Pemesanan Meja untuk slot waktu (per 30 menit, durasi default 90 menit) lewat halaman reservasi Outlet atau dicatat staf; Meja dipilih otomatis sesuai jumlah tamu dan berstatus Dipesan 30 menit sebelum jamnya.
_Avoid_: Booking, pesan tempat

**Deposit Reservasi**:
Uang muka opsional lewat gateway yang menjadi Pembayaran di Tagihan saat tamu datang; di-refund bila batal paling lambat 24 jam sebelumnya, hangus sebagai pendapatan lain bila tidak datang.
_Avoid_: DP, Voucher Saldo (itu hal lain)

**Tamu Datang**:
Aksi staf yang mengubah Reservasi menjadi Sesi Meja dan Tagihan, memasukkan Deposit Reservasi, dan mengirim pesanan di muka ke dapur; tanpa aksi ini dalam 15 menit, Reservasi ditandai tidak datang.
_Avoid_: Check-in, kedatangan

**Daftar Tunggu**:
Antrean tamu tanpa Reservasi saat Outlet penuh (nama, jumlah tamu); tamu memantau posisinya di halaman antrean yang berbunyi saat dipanggil.
_Avoid_: Waiting list, antrean

## Notifikasi

**Notifikasi**:
Pesan dari sistem lewat Saluran Notifikasi; fase awal hanya email (pelanggan dan pemilik) dan push/di-layar aplikasi (staf), tanpa WhatsApp atau SMS.
_Avoid_: Pesan, alert, broadcast (kecuali promosi)

**Saluran Notifikasi**:
Lapisan pengiriman tunggal (email, push aplikasi, dan nanti WhatsApp) sehingga saluran baru bisa ditambahkan tanpa mengubah fitur yang mengirim.
_Avoid_: Provider, gateway pesan

**Jam Tenang**:
Rentang 21.00–08.00 ketika promosi tidak dikirim; notifikasi layanan tetap dikirim.
_Avoid_: Do not disturb

## Audit

**Log Audit**:
Catatan append-only atas aksi sensitif dan perubahan penting (siapa, kapan, perangkat, Outlet, sebelum/sesudah, alasan, penyetuju); tidak bisa diubah atau dihapus siapa pun, disimpan 5 tahun.
_Avoid_: Activity log, riwayat, history

**Laporan Kecurigaan**:
Ringkasan per kasir per periode (void, refund, Diskon Manual, buka laci, selisih Hitung Buta) dibanding rata-rata Outlet, menandai yang lebih dari 2× rata-rata atau berpola khusus.
_Avoid_: Fraud report, laporan fraud

**Peringatan Risiko**:
Push langsung ke pemilik dan manajer saat kejadian melewati ambang yang diatur pemilik (misal void/refund besar, selisih kas besar).
_Avoid_: Alert fraud, alarm

## Laporan

**Dashboard**:
Halaman ringkasan yang isinya ditentukan Peran: pemilik melihat semua Outlet, manajer satu Outlet langsung, kasir Shift-nya sendiri, dapur Stasiun-nya, gudang stok dan PO; angka hari ini diperbarui tiap sekitar 1 menit.
_Avoid_: Beranda, home, panel

**Rangkuman Harian**:
Data penjualan, stok dan dapur yang dirangkum tiap malam per Outlet sehingga laporan hari-hari sebelumnya cepat dibuka; hari ini selalu dihitung dari data langsung.
_Avoid_: Snapshot, cache laporan

**Laporan Shift**:
Rekap satu Shift: kas awal, penjualan per Metode Bayar, kas masuk/keluar, kas seharusnya, hasil Hitung Buta dan selisihnya, serta void dan diskon; dicetak saat tutup Shift dan tersimpan di riwayat.
_Avoid_: Laporan kasir, closing report, X/Z report

**Waktu Saji**:
Lama dari Pesanan masuk ke dapur sampai ditandai siap di KDS, diukur per Stasiun, menu dan jam, dibanding target waktu per Outlet; tidak tersedia untuk dapur yang hanya memakai printer.
_Avoid_: Cooking time, lead time

**Margin Menu**:
Harga jual Menu atau Varian dikurangi HPP resepnya, dalam rupiah dan persen.
_Avoid_: Profit per menu, laba menu

**Laporan Terjadwal**:
Ringkasan harian, mingguan atau bulanan yang dikirim otomatis lewat email ke penerima yang dipilih, dengan lampiran Excel untuk mingguan dan bulanan.
_Avoid_: Auto report, laporan otomatis
