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
