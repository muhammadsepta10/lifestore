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
