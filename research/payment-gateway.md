# Riset: Payment Gateway QRIS untuk SaaS Multi-Tenant

- **Issue:** #3 — "Riset: payment gateway QRIS untuk SaaS multi-tenant"
- **Tanggal dicek:** 2026-10-03
- **Konteks:** SaaS manajemen restoran, banyak tenant (restoran), tiap tenant punya banyak outlet. Pembayaran dari QR meja dan pesanan web: QRIS dinamis, e-wallet, kartu.

## Jawaban singkat

**Rekomendasi: Xendit xenPlatform dengan sub-account tipe *MANAGED* (satu sub-account per restoran, outlet dibedakan lewat metadata/reference), dan DOKU Sub Account sebagai alternatif utama.**

Alasannya:

1. Di antara gateway besar, hanya **Xendit** dan **DOKU** yang punya dokumentasi publik tentang *sub-account + split* untuk platform. Dana masuk ke saldo masing-masing tenant dan komisi platform dipotong otomatis. Platform tidak perlu memegang dana tenant.
2. Sub-account **MANAGED** di Xendit membuat KYC dilakukan per restoran ke Xendit. Nama restoran (bukan nama platform) yang tampil ke pembeli. Dengan begitu, secara struktur, platform tidak menjadi pihak yang menerima dan menyalurkan dana pihak ketiga.
3. **Catatan biaya penting:** halaman harga Xendit per 2026-10-03 menampilkan *fixed processing fee* **Rp4.000 per transaksi** di atas MDR QRIS 0,70%. Ditambah biaya xenPlatform (aktivasi USD 10.000, USD 7.500/bulan, USD 15 per sub-account), struktur ini **mahal untuk tiket kecil** khas restoran. Contoh: pesanan Rp50.000 menghasilkan biaya ±Rp4.350 (±8,7%). **Negosiasi harga wajib dilakukan sebelum memilih.** Jika harga Xendit tidak bisa dinegosiasi, **DOKU** (QRIS 0,7%, tanpa biaya setup/bulanan menurut halaman harganya, dan punya Sub Account + split rule) kemungkinan lebih ekonomis.
4. **Midtrans** punya biaya publik yang kompetitif (QRIS 0,7%, GoPay/ShopeePay 2%, OVO/DANA 1,5%). Namun dokumentasi publiknya hanya menyebut *Partner account / multi-outlet*, yaitu banyak Merchant ID di bawah satu Partner ID. Tidak ditemukan dokumentasi publik tentang split payment. Model ini tetap bisa dipakai: setiap restoran menjadi merchant Midtrans sendiri dengan KYC sendiri, dan platform mengelolanya lewat Partner Portal. Komisi platform lalu ditagih terpisah. Opsi ini layak, tetapi otomasinya lebih sedikit.
5. **Jangan rancang alur di mana dana semua tenant masuk ke rekening platform lalu ditransfer ulang.** Kegiatan menatausahakan dana dan meneruskan pembayaran adalah aktivitas Penyedia Jasa Pembayaran (PJP) yang memerlukan izin Bank Indonesia (PBI 23/6/PBI/2021), dengan modal minimum Rp5–15 miliar.

**Tingkat keyakinan keseluruhan: sedang.** Fitur dan struktur produk diambil dari dokumentasi resmi. Angka biaya diambil dari halaman harga publik yang bisa berubah atau dinegosiasi. Aspek regulasi adalah ringkasan, **bukan nasihat hukum**; konfirmasikan ke konsultan hukum atau ke tim compliance gateway.

## Tabel perbandingan

| Aspek | Xendit (xenPlatform) | DOKU | Midtrans | Duitku |
|---|---|---|---|---|
| QRIS | 0,70% (termasuk PPN) + Rp4.000 processing fee/trx [X1] | 0,7%; 0% untuk Rp0–100rb (biaya DOKU bisa berlaku) [D1] | 0,7% [M1][M2] | 0,7% [U1] |
| E-wallet | Non-digital: OVO 3,00%, DANA 3,00%, ShopeePay retail 2,50%, GoPay 3,00% (masing-masing + Rp4.000) [X1] | DANA 1,5%, OVO 2–3,18%, ShopeePay 2–4%, LinkAja 2–3,5% [D1] | GoPay 2%, ShopeePay 2%, OVO 1,5%, DANA 1,5% [M1] | OVO/DANA/LinkAja 1,67%, ShopeePay 2% [U1] |
| Kartu kredit | 2,90% + Rp2.000 + Rp4.000 [X1] | 2,8% + Rp2.000 [D1] | 2,9% + Rp2.000 [M1] | 2,9% + Rp2.500 [U1] |
| VA | Rp9.000 + Rp4.000 [X1] | Rp4.000 (BCA Rp4.500) [D1] | Rp4.000 [M1] | Rp1.500–5.000 [U1] |
| PPN | QRIS termasuk PPN | Belum termasuk PPN | Belum termasuk PPN, kecuali QRIS/GoPay/ShopeePay [M1] | Termasuk PPN [U1] |
| Biaya platform | Aktivasi USD 10.000, USD 7.500/bulan, USD 15/sub-account [X1] | Tanpa biaya setup/bulanan (untuk payment; biaya Sub Account tidak tercantum) [D1] | Tanpa biaya setup [M1] | Tidak ada info |
| Sub-merchant / split | **Ya**: sub-account + split rule, routing via header `for-user-id` [X2][X3] | **Ya**: Sub Account + split rule (persentase/flat), diterapkan saat settlement [D2] | **Partner account / multi-outlet** (banyak MID di bawah 1 Partner ID); split publik tidak ditemukan [M3][M4] | Tidak ditemukan di sumber resmi |
| KYC per tenant | MANAGED: KYC wajib ke Xendit, nama tenant tampil ke publik. OWNED: tanpa KYC tenant, nama platform tampil, **nonaktif default untuk Indonesia** [X4]. KYC bisa diisi platform atau lewat link undangan [X2] | Tidak terdokumentasi di halaman yang dicek | Tiap MID mendaftar sebagai merchant (KYC per MID; detail tidak eksplisit) [M3][M4] | — |
| Settlement QRIS | T+1 hari kerja [X5] | T+1 hari kerja; e-wallet T+1–T+2; kartu T+3; dicairkan hari kerja 12:00–14:00 WIB [D3] | Tidak ditemukan di dokumen publik (belum terverifikasi) | Penarikan < 24 jam setelah request [U1] |
| Refund QRIS | Ya, termasuk partial/multiple partial, maks. 7 hari, tergantung issuer (mis. GoPay tidak mendukung partial) [X5] | Tidak dicek | Ada API refund (Core API & BI-SNAP) [M5] | — |
| Webhook | Ya (webhook pembayaran, refund, split status) [X6] | Ya (notifikasi) | Ya (HTTP(S) Notification) [M5] | Ya (callback) |

Catatan:
- Rp4.000 *processing fee* Xendit dinyatakan berlaku "untuk setiap transaksi" di halaman harga [X1]. Ini struktur harga yang relatif baru dan sangat memengaruhi biaya untuk tiket kecil. Verifikasi ulang dan negosiasikan.
- Split Xendit terjadi **setelah settlement** dan setelah biaya dipotong. Saat refund, *split fee tidak dikembalikan otomatis* ke akun sumber, sehingga perlu rekonsiliasi manual [X3].
- Split DOKU diterapkan pada **net amount** (setelah biaya gateway) ketika dana berpindah dari Pending IDR ke Merchant IDR. Pencairan bisa via BI-FAST [D2].

## MDR QRIS menurut ketentuan Bank Indonesia

- MDR QRIS untuk merchant **reguler** (kategori yang kemungkinan besar berlaku untuk restoran non-mikro) adalah **0,7%**. Midtrans menyebutnya sebagai "MDR or fee set by Bank Indonesia for regular-type merchants" [M2].
- **Usaha mikro:** MDR 0,3% berlaku sejak 2023, dengan 0% untuk transaksi ≤ Rp100.000 [B2]. Mulai **1 Desember 2024**, BI menetapkan **MDR 0% untuk transaksi QRIS hingga Rp500.000** bagi merchant usaha mikro [B3].
- Implikasi: tenant yang terdaftar sebagai usaha mikro bisa mendapat MDR 0% untuk sebagian besar transaksi. Agar manfaat ini tidak hilang, kategori merchant harus didaftarkan per tenant, bukan atas nama platform. Ini satu alasan tambahan memilih model sub-merchant/managed dibanding model "platform sebagai merchant tunggal".
- Peraturan BI melarang merchant membebankan MDR QRIS ke konsumen (pernyataan BI yang dikutip media, 2024) [B4]. Biaya layanan tidak boleh dipungut sebagai "biaya QRIS".

Keyakinan: tinggi untuk angka 0,7%/0,3%/0%. Sedang untuk detail batas karena bersumber dari berita yang mengutip BI, bukan teks PADG langsung.

## Kewajiban regulasi jika platform memegang dana (BI/OJK)

- **PBI 23/6/PBI/2021 tentang Penyedia Jasa Pembayaran** [B1] mendefinisikan aktivitas PJP: penyediaan informasi sumber dana, *payment initiation dan/atau acquiring services*, **penatausahaan sumber dana**, dan layanan remitansi.
  - Izin **Kategori 1** (semua aktivitas, termasuk penatausahaan sumber dana): PT, modal minimum **Rp15 miliar**.
  - Izin **Kategori 2** (informasi sumber dana + payment initiation/acquiring): PT, modal minimum **Rp5 miliar**.
  - Izin **Kategori 3** (remitansi dan aktivitas lain yang ditetapkan BI): modal Rp500 juta–Rp1 miliar.
  - Dana float diperlakukan sebagai dana titipan yang harus dipisahkan dari aset PJP.
- **Implikasinya:** jika platform menerima dana pembayaran atas nama banyak restoran ke rekening/saldo milik platform lalu meneruskannya (model *payment facilitator/aggregator*), platform berisiko dianggap menjalankan aktivitas PJP tanpa izin. Opsi aman:
  1. **Sub-merchant MANAGED / merchant per tenant:** gateway berizin (Xendit, DOKU, Midtrans) yang menatausahakan dana. Saldo tercatat atas nama tenant, dan platform hanya menerima komisi lewat split. **(Direkomendasikan.)**
  2. Platform hanya menjadi penyedia software. Tenant memakai akun gateway mereka sendiri dan platform menyimpan API key per tenant. Ini paling aman secara regulasi, tetapi onboarding dan UX lebih berat.
- Sub-account **OWNED** Xendit (nama platform yang tampil, tanpa KYC tenant) **nonaktif secara default untuk akun Indonesia** [X4]. Ini indikasi bahwa model "platform sebagai merchant of record" di Indonesia dibatasi.
- OJK: relevan jika platform menyimpan dana sebagai simpanan atau menawarkan produk keuangan (pembiayaan, investasi). Untuk alur pembayaran murni, regulator utamanya adalah BI. Bagian ini belum diverifikasi ke sumber OJK primer; keyakinan rendah–sedang.

**Bukan nasihat hukum.** Kategori izin dan apakah suatu alur termasuk "penatausahaan sumber dana" perlu dikonfirmasi ke konsultan hukum dan ke tim compliance gateway.

## Arsitektur yang disarankan

```
Pembeli (QR meja / web)
   └─▶ Order service (tenant_id, outlet_id)
         └─▶ Gateway: create QRIS/e-wallet/card charge
               header for-user-id = sub-account restoran (Xendit) / sub-account id (DOKU)
               split rule = komisi platform (% atau flat)
         ◀── Webhook pembayaran → tandai order PAID, cetak ke dapur/KDS
   Settlement T+1 → saldo sub-account restoran → payout ke rekening restoran
                  → komisi → saldo platform
```

- **Granularitas:** satu sub-account per **restoran (badan usaha/pemilik rekening)**, bukan per outlet, karena KYC dan rekening bank biasanya per badan usaha. Outlet dibedakan lewat `reference_id`/metadata. Jika outlet milik badan usaha berbeda (franchise), buat sub-account per badan usaha.
- **Idempotensi webhook:** simpan event id, verifikasi token/signature callback, dan tangani notifikasi ganda.
- **Refund:** catat refund per order. Di Xendit, komisi yang sudah di-split tidak otomatis kembali [X3], jadi siapkan proses rekonsiliasi.
- **QRIS dinamis:** nominal terkunci per order dan punya expiry (Xendit bisa diatur, default hingga 48 jam [X5]). Untuk meja restoran, set expiry singkat (mis. 15 menit).

## Langkah berikutnya

1. Minta penawaran harga tertulis dari **Xendit** (minta pembebasan atau keringanan processing fee Rp4.000 dan biaya bulanan xenPlatform) dan **DOKU** (biaya Sub Account, settlement, payout).
2. Tanyakan ke Midtrans apakah ada produk split/marketplace untuk partner (tidak ada di dokumentasi publik).
3. Tanyakan ke gateway: apakah kategori MDR usaha mikro bisa berlaku per sub-account.
4. Konsultasi hukum singkat soal posisi platform (penyedia software vs PJP).
5. Bangun PoC: create QRIS untuk sub-account, terima webhook, lakukan refund parsial, dan cek laporan split.

## Sumber

Semua diakses 2026-10-03.

**Xendit**
- [X1] Halaman biaya Xendit — https://www.xendit.co/id/biaya/
- [X2] Sub-accounts (xenPlatform) — https://docs.xendit.co/docs/sub-accounts
- [X3] Split payments — https://docs.xendit.co/docs/split-payments.md
- [X4] Managed vs Owned sub-accounts — https://help.xendit.co/hc/en-us/articles/6787784288665-What-is-the-difference-between-managed-and-owned-sub-accounts
- [X5] QRIS — https://docs.xendit.co/docs/qris.md
- [X6] Indeks dokumentasi (webhook, refund webhook, split status webhook) — https://docs.xendit.co/llms.txt

**DOKU**
- [D1] Harga DOKU — https://www.doku.com/id-ID/pricing
- [D2] Sub Account: collect and route — https://docs.doku.com/wallet-as-a-service/sub-account/collect-and-route ; Split Settlement — https://developers.doku.com/accept-payment/finance-and-settlement/split-settlement
- [D3] Settlement time — https://docs.doku.com/~/changes/210/accept-payments/finance-and-settlement/settlement-time

**Midtrans**
- [M1] Biaya Midtrans — https://midtrans.com/id/biaya
- [M2] Biaya QRIS — https://docs.midtrans.com/docs/what-is-the-applicable-transaction-fee-for-qris
- [M3] Merchant vs Partner account — https://docs.midtrans.com/docs/difference-between-merchant-account-and-partner-account
- [M4] Partner / Multi-outlet portal — https://docs.midtrans.com/docs/merchant-administration-portal-partner-multi-outlet
- [M5] Indeks dokumentasi (refund, HTTP notification) — https://docs.midtrans.com/llms.txt

**Duitku**
- [U1] Biaya Duitku — https://duitku.com/?p=722

**Regulasi / Bank Indonesia**
- [B1] PBI 23/6/PBI/2021 tentang Penyedia Jasa Pembayaran — https://www.bi.go.id/id/publikasi/peraturan/Pages/PBI_230621.aspx
- [B2] MDR QRIS usaha mikro 0% untuk transaksi ≤ Rp100rb (2023), Fortune IDN — https://www.fortuneidn.com/finance/transaksi-qris-di-bawah-rp100-ribu-tidak-dikenakan-biaya-mdr-00-ccw2k-5y6fhk (sekunder)
- [B3] MDR QRIS 0% hingga Rp500rb untuk usaha mikro mulai 1 Des 2024, Kontan — https://keuangan.kontan.co.id/news/mdr-qris-untuk-transaksi-hingga-rp-500000-bebas-biaya-ini-kata-goto-financial (sekunder)
- [B4] BI: merchant tidak boleh membebankan MDR QRIS ke konsumen, Bisnis.com — https://finansial.bisnis.com/read/20240430/11/1761523/biaya-qris-usaha-mikro-03-bi-tegaskan-merchant-tak-tarik-tarif-ke-konsumen (sekunder)

## Keterbatasan riset

- Waktu settlement Midtrans tidak ditemukan di dokumentasi publik yang bisa diakses.
- KYC dan biaya Sub Account DOKU tidak tercantum di halaman yang dicek.
- Duitku: tidak ditemukan dokumentasi resmi soal sub-merchant/split.
- Ketentuan MDR untuk usaha mikro bersumber dari berita yang mengutip BI. Teks PADG terbaru belum dibaca langsung.
- Gateway lain (iPaymu yang punya produk *split payment*, Flip, Faspay, dan lain-lain) belum dievaluasi mendalam.
