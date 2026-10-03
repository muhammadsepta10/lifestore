# Riset: Akses API GoFood, GrabFood, ShopeeFood untuk POS SaaS pihak ketiga

- Issue: #2 "Riset: akses API GoFood, GrabFood, ShopeeFood"
- Tanggal dicek: 2026-10-03
- Konteks keputusan: mulai dengan **input pesanan manual oleh kasir**; pindah ke API hanya jika API bisa dipakai bebas.

## Ringkasan jawaban

| Platform | Bisa dipakai bebas oleh POS SaaS? | Jalur realistis | Keyakinan |
|---|---|---|---|
| GoFood (GoBiz) | **Tidak.** Jalur untuk POS/agregator ("Facilitator") wajib daftar jadi GoBiz Partner lewat form, diasesmen, lalu kredensial diberikan tim GoBiz. Jalur self-serve ("Direct Integration") hanya untuk merchant yang mengintegrasikan outlet miliknya sendiri. | Daftar sebagai GoBiz Partner (Facilitator) setelah punya basis merchant; sementara itu input manual. | Tinggi (dokumen resmi) |
| GrabFood (Grab) | **Tidak.** API GrabFood untuk "POS partner" memakai kredensial OAuth yang diterbitkan Grab; partner harus di-whitelist di Grab Developer Portal sebelum merchant bisa mengaktifkan integrasi. | Ajukan jadi POS partner di developer.grab.com; sementara itu input manual, atau pakai middleware. | Sedang (portal resmi tidak bisa dibaca langsung; disimpulkan dari SDK resmi Grab + dokumentasi POS partner) |
| ShopeeFood | **Tidak.** Tidak ada developer portal / dokumentasi API publik untuk ShopeeFood. Integrasi yang ada (mis. ESB) bersifat kemitraan tertutup. | Tetap input manual; integrasi hanya lewat kemitraan bisnis langsung dengan Shopee atau lewat POS/middleware yang sudah bermitra. | Sedang (bukti ketiadaan) |

**Kesimpulan:** tidak ada satu pun dari ketiganya yang "bebas dipakai" oleh POS SaaS pihak ketiga. Keputusan "mulai manual" tetap tepat. GoFood dan GrabFood punya jalur partner resmi yang terdokumentasi, jadi masuk akal didaftarkan begitu produk sudah punya merchant aktif; ShopeeFood paling tertutup.

---

## 1. GoFood (GoBiz Developer Portal)

Sumber utama: GoBiz Developer Portal — https://developer.gobiz.com/docs/docs/introducing-to-gobiz-developer-portal/ dan https://docs.gobiz.co.id/

### Dua model integrasi
GoBiz membedakan dua model ([kategori Food Integration](https://developer.gobiz.com/docs/category/food-integration/index.html)):

1. **Direct Integration (host-to-host)** — "GoFood API for GoFood merchants who want to integrate host-to-host". Hanya bisa diakses "an existing GoBiz user, and use your owner role". Kredensial (App ID/Secret, Partner ID, Outlet ID) dan sandbox dibuat sendiri dari portal. ([Introducing GoBiz Developer Portal](https://developer.gobiz.com/docs/docs/introducing-to-gobiz-developer-portal/), [Direct Integration](https://developer.gobiz.com/docs/docs/food-integration/direct-integration))
   - Halaman depan docs juga menyatakan: "Only the developer assigned using the owner's registered email in GoBiz is allowed to create an integration" dan setelah selesai, "contact us via this form and we'll verify the integration". ([docs.gobiz.co.id](https://docs.gobiz.co.id/))
   - Artinya: model ini untuk merchant (atau developer yang ditunjuk merchant) mengintegrasikan **outlet miliknya sendiri**, bukan untuk SaaS multi-tenant.
2. **Facilitator Model** — khusus "POS (Point of Sales) or OFA (Online Food Aggregator) services". Langkahnya: isi form pendaftaran calon GoBiz Partner → "Our team will contact you to explore your inquiry and perform further assessment" → "Once you've completed our assessment, you'll be able to get the credential from our team". Ditegaskan: "Prior to doing integration, you need to be a GoBiz Partners." ([Facilitator](https://developer.gobiz.com/docs/docs/food-integration/facilitator))
   - Menautkan outlet merchant: merchant login (OAuth authorization code) → partner ambil daftar outlet (`GET /integrations/partner/v1/token-info`) → link outlet (`PUT /integrations/partner/outlets/{outlet_id}/v1/link/{product_name}`). ([Steps on Linking Outlets](https://developer.gobiz.com/docs/docs/food-integration/steps-on-linking-outlets/index.html))

### Biaya
Tidak ada informasi biaya di dokumentasi resmi. Biaya/komersial kemungkinan dibahas saat asesmen partner. (Tidak terverifikasi.)

### Fitur yang tersedia
- **Terima pesanan via webhook**: subscribe notifikasi; event `gofood.order.created`, `gofood.order.placed`, `gofood.order.awaiting_merchant_acceptance`, `gofood.order.merchant_accepted`, `gofood.order.driver_otw_pickup`, `gofood.order.driver_arrived`, `gofood.order.completed`, `gofood.order.cancelled`. ([Order State](https://developer.gobiz.com/docs/docs/food-integration/how-to/order-state), [Order Acceptance](https://developer.gobiz.com/docs/docs/food-integration/how-to/order-acceptance))
- **Update status**: endpoint "Mark Food Ready" (`.../orders/{order_type}/{order_number}/food-prepared`). Accept/reject ada untuk mode manual, **tetapi** "only Auto Accept available for Partners" — setelah outlet ditautkan, mode otomatis menjadi Auto Accept. ([Order Acceptance](https://developer.gobiz.com/docs/docs/food-integration/how-to/order-acceptance))
- **Sinkron menu**: [Sync Menu](https://developer.gobiz.com/docs/docs/food-integration/how-to/sync-menu), [Menu Structure](https://developer.gobiz.com/docs/docs/food-integration/how-to/menu-structure). Catatan: setelah integrasi API, jangan ubah menu manual di aplikasi GoBiz karena pesanan bisa tidak dikenali. ([Direct Integration](https://developer.gobiz.com/docs/docs/food-integration/direct-integration))
- **Stok habis**: [Update Out of Stock Status](https://developer.gobiz.com/docs/docs/food-integration/how-to/update-out-of-stock-status) (item & varian).
- Lainnya: promo, SKU promo, buka/tutup outlet ([How To](https://developer.gobiz.com/docs/category/how-to)), serta API Simulator untuk uji pesanan.

### Status: tidak bebas. Jalur: GoBiz Partner (Facilitator) dengan asesmen.

---

## 2. GrabFood (Grab Developer Portal)

Sumber utama: Grab Developer Portal — https://developer.grab.com/products/food-pos-model ("GrabFood Point of Sale API"). **Catatan:** halaman developer.grab.com tidak bisa dibaca dari lingkungan riset ini (diblokir robots.txt/proxy), jadi detail di bawah disusun dari SDK resmi Grab dan dokumentasi POS partner yang memakai portal tersebut.

### Persyaratan & proses
- SDK resmi Grab memakai OAuth2 dengan `client_id`/`client_secret` dan mengarahkan ke https://developer.grab.com untuk mendapatkannya. ([grab/grabfood-api-sdk-java](https://github.com/grab/grabfood-api-sdk-java))
- Alur aktivasi yang didokumentasikan POS partner (Mosaic): partner membuat Partner ID, **"Product Manager validates the whitelisting and encodes the Merchant ID and Partner ID on Grab Developer Portal"**, lalu merchant login ke Grab Merchant dan mengonfirmasi integrasi ("self-serve onboarding"). ([Mosaic – Self-serve Onboarding](https://mosaic-solutions.helpscoutdocs.com/article/78-grab-implement-self-serve-onboarding-of-grab-integration), [Mosaic – Grab Developer portal](https://mosaic-solutions.helpscoutdocs.com/article/98-how-to-use-grab-developer-portal))
- Direktori API pihak ketiga mencatat akses GrabFood API sebagai model "Partner" dengan "partner-issued client credentials" (sekunder; keyakinan rendah). ([apis.io – Grab](https://apis.io/providers/grab/))
- Integrasi bersifat per negara: contoh StoreHub menyebut integrasi GrabFood-nya "only for merchants in the Philippines" ([StoreHub](https://care.storehub.com/en/articles/6321017-how-to-get-started-with-food-delivery-integrations-foodpanda-shopeefood-grabfood)), jadi persetujuan partner kemungkinan diatur per pasar (Indonesia perlu diajukan tersendiri — tidak terverifikasi).

### Biaya
Tidak ditemukan biaya resmi dari Grab untuk API. Biaya yang terlihat adalah biaya langganan POS partner ke merchant (mis. StoreHub, Klikit). (Tidak terverifikasi untuk Indonesia.)

### Fitur (dari daftar method SDK resmi)
([grabfood-api-sdk-java README](https://github.com/grab/grabfood-api-sdk-java))
- **Terima pesanan**: `listOrders`, push order dari Grab ke endpoint partner (webhook "submit order"), `acceptRejectOrder`.
- **Update status**: `markOrderReady`, `updateOrderReadyTime`, `cancelOrder`, `editOrder`, `updateDeliveryState`, `refundOrder`.
- **Sinkron menu & stok habis**: `updateMenu`, `batchUpdateMenu`, `updateMenuNotification`, `traceMenuSync`.
- **Toko**: `pauseStore`, `getStoreStatus`, jam operasional/khusus.
- Lainnya: kampanye/promo, voucher dine-in, QR.

### Status: tidak bebas. Jalur: daftar & di-whitelist sebagai POS partner Grab (developer.grab.com), per negara.

---

## 3. ShopeeFood

### Temuan
- **Tidak ditemukan developer portal atau dokumentasi API publik untuk ShopeeFood** (Indonesia maupun regional). Shopee Open Platform yang publik adalah untuk marketplace (e-commerce), bukan ShopeeFood. Pencarian di web dan portal resmi tidak menemukan dokumen API ShopeeFood. (Keyakinan sedang — ini bukti ketiadaan; domain Shopee tidak bisa diakses langsung dari lingkungan riset.)
- Pendaftaran merchant ShopeeFood dilakukan lewat aplikasi Shopee Partner, tanpa menyebut integrasi POS. ([Shopee – Cara Daftar Shopee Partner](https://shopee.co.id/inspirasi-shopee/cara-daftar-shopee-partner/))
- Beberapa POS besar mengklaim integrasi ShopeeFood, menandakan ada **kemitraan tertutup**: ESB — "Sudah terintegrasi dengan ... GoFood, GrabFood, dan ShopeeFood." ([esb.id](https://www.esb.id/id)). StoreHub (Malaysia) memerlukan "ShopeeFood Store ID" dan "3 to 7 working days" untuk integrasi di sisi partner. ([StoreHub](https://care.storehub.com/en/articles/6321017-how-to-get-started-with-food-delivery-integrations-foodpanda-shopeefood-grabfood))
- Sebaliknya majoo hanya mengintegrasikan GrabFood, GoFood, GrabMart (ShopeeFood tidak) ([majoo panduan 104](https://majoo.id/panduan-pengguna/detail/104)); Odoo (Juni 2026) hanya GrabFood dan GoFood ([industry.co.id](https://www.industry.co.id/read/151823/odoo-integrasikan-grabfood-dan-gofood-untuk-percepat-transformasi-digital-fb-indonesia)). Ini konsisten dengan ShopeeFood yang paling sulit diakses.
- Klikit meminta "kredensial pedagang ShopeeFood" dari restoran ([klikit](https://klikit.io/id/learn/shopeefood-integration-indonesia)) — tidak jelas apakah memakai API resmi; **jangan ditiru** (menyimpan kredensial merchant berisiko melanggar ketentuan platform).

### Biaya / proses / fitur
Tidak ada informasi publik. Hanya bisa diketahui lewat pendekatan bisnis langsung ke Shopee.

### Status: tidak bebas. Jalur: input manual; integrasi hanya lewat kemitraan bisnis langsung dengan Shopee.

---

## 4. Agregator / middleware

| Penyedia | Platform di Indonesia | Catatan |
|---|---|---|
| Klikit | Mengklaim GoFood, GrabFood, ShopeeFood | Fokus ke POS/KDS-nya sendiri; harga by request. Untuk ShopeeFood meminta kredensial merchant. ([GoFood](https://klikit.io/en/learn/gofood-integration-indonesia), [ShopeeFood](https://klikit.io/id/learn/shopeefood-integration-indonesia)) |
| Deliverect | GrabFood (HK, SG; Indonesia tidak tercantum) | Punya POS Integration API untuk vendor POS ([Deliverect GrabFood](https://www.deliverect.com/en/integrations/grab-food), [Deliverect developers](https://developers.deliverect.com/v1.1-restaurants/docs)) — jangkauan Indonesia belum terverifikasi. |
| ESB, majoo, Odoo | POS yang sudah bermitra | Ini pesaing, bukan middleware; menunjukkan bahwa jalur partner resmi GoBiz/Grab memang bisa ditempuh. |

Kesimpulan: middleware bisa mempercepat GrabFood/GoFood, tetapi tetap berbayar, merchant tetap perlu langganan, dan cakupan Indonesia terbatas/tidak pasti. Tidak ada middleware yang memberi akses "bebas".

---

## Rekomendasi untuk produk

1. **MVP: input pesanan ojol manual oleh kasir** (jenis order "GoFood/GrabFood/ShopeeFood" + nomor pesanan + harga sesuai komisi). Ini juga yang dilakukan majoo untuk fitur dasarnya ("hanya berfungsi sebagai pencatatan saja") ([majoo panduan 294](https://majoo.id/panduan-pengguna/detail/294)).
2. Desain model data pesanan supaya kelak bisa diisi webhook (simpan `channel`, `external_order_id`, status).
3. Setelah ada basis merchant: ajukan **GoBiz Partner (Facilitator)** dan **Grab POS partner**. Keduanya butuh asesmen/whitelisting, bukan self-serve.
4. ShopeeFood: tunda; evaluasi ulang hanya jika ada kontak kemitraan langsung.

## Keterbatasan riset
- developer.grab.com dan domain Shopee tidak bisa diakses dari lingkungan riset; info Grab disimpulkan dari SDK resmi dan dokumen POS partner.
- Biaya resmi tidak dipublikasikan oleh ketiga platform.
- Beberapa sumber middleware (Klikit) berupa konten pemasaran; diperlakukan sebagai bukti lemah.
