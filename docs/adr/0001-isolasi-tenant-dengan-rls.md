# Isolasi tenant dengan satu database dan Row Level Security

Semua Tenant berbagi satu database PostgreSQL; setiap tabel milik tenant punya kolom `tenant_id` dan dilindungi Row Level Security sehingga database sendiri menolak akses lintas tenant. Dipilih karena paling murah dan mudah dirawat untuk ribuan resto kecil; schema atau database per tenant ditunda sebagai opsi untuk klien besar.

## Considered Options

- Schema per tenant: isolasi lebih kuat, tetapi migrasi harus dijalankan di ribuan schema.
- Database per tenant: isolasi paling kuat, biaya infrastruktur dan operasional paling tinggi.
