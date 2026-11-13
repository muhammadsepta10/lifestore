# Dana pelanggan langsung masuk ke sub-akun gateway milik resto

Pembayaran online (QRIS dinamis, e-wallet) diproses lewat Xendit xenPlatform dengan satu sub-akun per Tenant yang KYC atas nama resto; platform hanya menerima potongan komisi lewat split otomatis dan tidak pernah menampung lalu meneruskan dana resto. Alasannya regulasi: menampung dan meneruskan dana pihak lain adalah kegiatan Penyedia Jasa Pembayaran yang butuh izin Bank Indonesia dan modal miliaran rupiah. Lihat riset di issue #3.

## Consequences

- Tenant harus menyelesaikan KYC gateway sebelum bisa menerima QRIS dinamis; sampai itu, hanya metode manual yang aktif.
- Refund lewat gateway tidak otomatis mengembalikan komisi platform; perlu ditangani di modul langganan.
