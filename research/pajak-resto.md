# Riset: Aturan Pajak Restoran di Indonesia

- **Issue:** #4, "Riset: aturan pajak restoran di Indonesia"
- **Tanggal dicek:** 2026-10-03
- **Konteks:** Hasil riset ini menentukan model konfigurasi pajak per outlet di POS SaaS restoran (multi-tenant, multi-outlet, lintas kabupaten/kota).
- **Catatan:** Ini ringkasan regulasi, **bukan nasihat pajak**. Tarif, ambang omzet, dan kewajiban pelaporan diatur di Perda masing-masing daerah dan bisa berubah.

## Jawaban singkat

1. **Pajak utama makanan/minuman restoran adalah pajak daerah, bukan PPN.** Sejak UU HKPD (UU 1/2022), "Pajak Restoran" atau "PB1" diganti namanya menjadi **PBJT atas Makanan dan/atau Minuman**. **Tarif maksimal 10%** (Pasal 58 ayat 1). Tarif pastinya ditetapkan oleh Perda kabupaten/kota. Kebanyakan daerah memakai 10%, tetapi **ada yang lebih rendah dan ada yang berbeda per kategori atau per omzet**. Contoh: Temanggung memakai 5% untuk restoran dan 10% untuk katering. Kab. Probolinggo memakai 5% untuk omzet ≤ Rp24 juta/bulan dan 10% di atasnya. [R1][R4][R5]
2. **PPN tidak berlaku** untuk makanan/minuman yang disajikan restoran, hotel, rumah makan, warung, atau katering, baik dimakan di tempat maupun dibawa pulang (UU PPN Pasal 4A dan PMK 70/2022). Pengecualiannya: PPN berlaku (dan PBJT tidak) untuk penjualan oleh **toko swalayan yang tidak semata-mata menjual makanan/minuman, pabrik makanan/minuman, dan lounge bandara**. [P1][P2][P3]
3. **Ambang omzet** di bawah batas tertentu membuat usaha tidak dipungut PBJT. Batas ini **berbeda tiap daerah**: DKI Jakarta Rp42 juta/bulan, Kota Tangerang Rp20 juta/bulan, Kab. Probolinggo Rp4,5 juta/bulan. [R3][R6][R5]
4. **Service charge ikut menjadi dasar pengenaan PBJT.** Dasar pengenaannya adalah "jumlah yang dibayarkan oleh konsumen". Urutan hitung: harga menu, lalu diskon, lalu service charge, lalu PBJT dikenakan atas (subtotal setelah diskon + service charge). [R2][R7][R6]
5. **Pesanan takeaway dan pesan antar (termasuk GoFood/GrabFood/ShopeeFood) tetap objek PBJT** selama penjualnya restoran yang memenuhi kriteria. Wajib pajaknya adalah restoran, bukan aplikator. Dasar pengenaannya adalah jumlah yang dibayar konsumen untuk makanan. Komisi aplikator dan ongkir adalah transaksi aplikator (dikenai PPN atas jasa aplikator), bukan omzet PBJT restoran. Ini **keyakinan sedang**: tidak ditemukan pernyataan tertulis spesifik untuk ojol dari satu Bapenda pun.
6. **Integrasi online dengan pemda makin sering diwajibkan**, lewat *tapping box* (perangkat keras) atau agen software di POS. Contohnya E-TRAPT DKI Jakarta (diluncurkan Juli 2025), yang dijadikan syarat insentif pajak 2026. Bentuk dan kewajibannya diatur oleh Perbup/Perwali/Pergub tiap daerah. Tidak ada standar API nasional. [T1][T2][T3][T4]
7. **Pembulatan:** tidak ditemukan aturan nasional tentang pembulatan PBJT di struk. Rekomendasi: hitung pajak per struk dan bulatkan ke rupiah penuh. Pembulatan uang tunai (kembalian) dibuat sebagai pengaturan terpisah per outlet. **Keyakinan rendah.**

**Keyakinan keseluruhan: sedang–tinggi** untuk butir 1–4 (dari teks UU, PP, PMK, dan Perda atau keterangan Bapenda). **Sedang** untuk butir 5–6. **Rendah** untuk butir 7.

## Implikasi untuk model konfigurasi pajak per outlet

Satu tarif global tidak cukup. Model minimal per outlet:

| Field | Contoh | Alasan |
|---|---|---|
| `tax_regime` | `PBJT` / `PPN` / `NONE` | Restoran memakai PBJT. Outlet "toko swalayan"/retail bisa memakai PPN. Outlet di bawah ambang omzet tidak dipungut. [P2][R3] |
| `region_code` (kab/kota, kode Kemendagri) | `31.71` | PBJT terutang di daerah tempat penjualan (PP 35/2023 Pasal 19 ayat 6). Tarif, ambang, dan sistem pelaporan mengikuti daerah. [R2] |
| `pbjt_rate` | `0.10` | Maksimal 10%. Bisa 5% atau bertingkat. [R1][R4][R5] |
| `pbjt_category` | `restoran` / `katering` | Beberapa daerah membedakan tarif per kategori. [R4] |
| `service_charge_rate` + `service_charge_base` (`after_discount` / `before_discount`) | `0.05`, `after_discount` | Kebijakan restoran, tetapi selalu masuk dasar PBJT. [R7] |
| `price_includes_tax` (bool) | `false` | Untuk menu dengan harga sudah termasuk pajak. Pajak lalu di-back-calc: `pajak = total × r/(1+r)`. |
| `channel_overrides` (dine-in / takeaway / delivery / ojol) | sama | Secara hukum sama-sama objek PBJT. Field ini disediakan untuk harga ojol yang berbeda dan pelaporan per kanal. |
| `item_tax_exempt` (per item) | `true` untuk barang retail kemasan | Barang non-makanan/retail tidak kena PBJT. Bisa kena PPN jika outlet PKP. |
| `rounding_mode` (pajak) dan `cash_rounding` (kembalian) | `half_up`, `100` | Tidak ada aturan baku, jadi dibuat bisa dikonfigurasi. |
| `reporting_integration` | `none` / `tapping_box` / `etrapt_jakarta` / `api_pemda_x` | Tiap daerah punya mekanisme sendiri. [T1][T3] |
| `effective_from` / `effective_to` | tanggal | Tarif dan insentif berubah (mis. diskon pokok pajak DKI 2026). [T4] |

Urutan hitung yang disarankan (sesuai contoh Bapenda DKI [R7]):

```
subtotal          = Σ harga item kena pajak
diskon            = promo/voucher (diskon toko mengurangi dasar)
setelah_diskon    = subtotal − diskon
service           = setelah_diskon × sc_rate        (atau subtotal × sc_rate, tergantung kebijakan resto)
dpp_pbjt          = setelah_diskon + service
pbjt              = round(dpp_pbjt × pbjt_rate)
total             = dpp_pbjt + pbjt (+ pembulatan tunai)
```

Contoh Bapenda DKI: menu Rp100.000, diskon 20%, service 5% atas Rp80.000 = Rp4.000, PBJT 10% × Rp84.000 = Rp8.400, total **Rp92.400**. Jika service dihitung dari harga sebelum diskon, totalnya Rp93.500. [R7]

Catatan voucher: jika pembayaran memakai voucher bernilai rupiah, dasar pengenaan PBJT adalah nilai rupiah voucher tersebut (PP 35/2023 Pasal 19 ayat 2). Jadi **voucher sebagai alat bayar tidak mengurangi dasar pengenaan**, berbeda dengan diskon harga. [R2]

## Rincian temuan

### 1. PBJT Makanan dan/atau Minuman (pengganti Pajak Restoran / PB1)

- **Objek:** UU 1/2022 Pasal 50 huruf a menetapkan objek PBJT mencakup Makanan dan/atau Minuman. [R1]
- **Siapa yang dikenai:** Pasal 51 ayat (1) menyebut makanan/minuman yang disediakan oleh (a) restoran yang *paling sedikit* menyediakan layanan penyajian berupa meja, kursi, dan/atau peralatan makan dan minum, dan (b) penyedia jasa boga/katering. [R1]
- **Dikecualikan:** penjualan dengan peredaran usaha tidak melebihi batas yang ditetapkan Perda, toko swalayan yang tidak semata-mata menjual makanan/minuman, pabrik makanan/minuman, dan lounge bandara. [R8][P1]
- **Dasar pengenaan:** UU 1/2022 Pasal 57 ayat (1) menyebut "jumlah yang dibayarkan oleh konsumen barang atau jasa tertentu". PP 35/2023 Pasal 19 ayat (1) menyebut "jumlah pembayaran yang diterima oleh penyedia Makanan dan/atau Minuman". [R1][R2]
- **Tarif:** UU 1/2022 Pasal 58 ayat (1): "Tarif PBJT ditetapkan paling tinggi sebesar 10%". Tarif khusus 40–75% hanya untuk hiburan tertentu (diskotek, karaoke, bar, spa), bukan restoran. [R1]
- **Saat terutang:** saat pembayaran atau penyerahan makanan/minuman (PP 35/2023 Pasal 19 ayat 5 huruf a). [R2]
- **Wilayah pemungutan:** daerah tempat penjualan/penyerahan/konsumsi (PP 35/2023 Pasal 19 ayat 6). Konsekuensinya, outlet di kota berbeda bisa punya aturan berbeda walaupun tenantnya sama. [R2]
- **Batas waktu berlaku:** Perda baru wajib berlaku paling lambat 5 Januari 2024. Contohnya Perda DKI 1/2024 berlaku 5 Januari 2024. [R3][R8]
- **Variasi daerah (contoh):**
  - DKI Jakarta: 10%, ambang Rp42 juta/bulan (Perda DKI 1/2024 Pasal 45 ayat 2). [R3][R6]
  - Kota Tangerang: 10%, ambang Rp20 juta/bulan. [R9]
  - Kab. Temanggung (Perda 12/2023): restoran 5%, katering 10%. [R4]
  - Kab. Probolinggo (Perda 1/2024): 5% untuk omzet ≤ Rp24 juta/bulan, 10% di atasnya, ambang Rp4,5 juta/bulan. [R5]
- **Penamaan di struk:** di Jakarta, label "PB1" sudah diganti menjadi PBJT (substansinya sama). Label pajak di struk sebaiknya bisa dikonfigurasi. [R10]

### 2. PPN vs PBJT

- Makanan/minuman yang disajikan di hotel, restoran, rumah makan, warung, dan sejenisnya **tidak dikenai PPN** (UU PPN Pasal 4A ayat 2 huruf c, sebagaimana diubah UU HPP) karena sudah menjadi objek pajak daerah. [P1]
- PMK 70/2022 Pasal 4: pengecualian berlaku untuk makanan/minuman yang "dikonsumsi di tempat maupun yang tidak dikonsumsi di tempat", sehingga **takeaway juga tidak kena PPN**. Pasal 4 ayat (4) menyatakan **PPN tetap berlaku** jika makanan/minuman disediakan oleh toko swalayan yang tidak semata-mata menjual makanan/minuman, pabrik makanan/minuman, atau lounge bandara. [P2][P3]
- Prinsipnya **tidak boleh ada pajak ganda**: satu transaksi makanan kena PBJT *atau* PPN, tidak keduanya. [P1][P4]
- Tarif PPN (untuk outlet yang memang kena PPN, mis. retail merchandise oleh PKP): tarif nominal 12% dengan DPP nilai lain 11/12 untuk barang non-mewah (PMK 131/2024), sehingga efektif 11%. Ketentuan ini masih berlaku pada 2026. [P5][P6]
- Untuk POS: item non-makanan (merchandise, barang kemasan retail) sebaiknya punya flag pajak sendiri. Jika outlet berstatus PKP, item itu kena PPN dan tidak masuk dasar PBJT.

### 3. Service charge

- Dasar PBJT adalah seluruh jumlah yang dibayar konsumen, sehingga **service charge termasuk dasar pengenaan**. Ini dikonfirmasi oleh Bapenda Kota Tangerang dan oleh contoh hitung Bapenda DKI. [R9][R7][R6]
- **Besaran dan cara hitung service charge adalah kebijakan masing-masing restoran.** Pernyataan Bapenda DKI yang dikutip media: "pengenaan service charge bergantung dari masing-masing restoran". Tidak ada tarif yang diatur. [R7]
- Urutan: diskon, lalu service charge, lalu PBJT atas (harga setelah diskon + service). [R7]
- Service charge sendiri bukan objek PPN terpisah untuk restoran (bagian dari penyerahan makanan yang dikecualikan dari PPN). **Keyakinan sedang.** Tidak ada sumber primer yang menyatakannya secara eksplisit; kesimpulan ini diturunkan dari PMK 70/2022.

### 4. Takeaway, delivery, dan ojol (GoFood, GrabFood, ShopeeFood)

- **Takeaway:** PMK 70/2022 dan keterangan DJP menyatakan bahwa penyediaan meja/kursi/peralatan makan menjadikan usaha sebagai restoran, dan penjualannya kena PBJT baik dimakan di tempat maupun dibawa pulang. [P1][P2]
- **Delivery/online:** Bapenda Kota Tangerang menyebut objeknya mencakup makanan/minuman "yang dikonsumsi oleh pembeli di tempat pelayanan maupun di tempat lain". [R9]
- **Ojol:** wajib pajaknya tetap restoran. Tidak ditemukan regulasi nasional yang menunjuk aplikator ojol sebagai pemungut PBJT. Dasar pengenaan mengikuti jumlah yang dibayar konsumen untuk makanan. Jika harga di aplikasi berbeda dari harga dine-in, PBJT dihitung dari harga aplikasi. Komisi aplikator **tidak** mengurangi dasar PBJT, karena dasarnya adalah pembayaran konsumen, bukan yang diterima bersih. **Keyakinan sedang**, karena belum ditemukan pernyataan tertulis Bapenda yang spesifik soal ojol. Perlu dicek ke Bapenda daerah outlet pilot.
- **Terkait (bukan PBJT):** PMK 37/2025 menunjuk marketplace sebagai pemungut PPh 22 sebesar 0,5% dari omzet pedagang (pedagang dengan omzet ≤ Rp500 juta/tahun dikecualikan). Penunjukan tahap pertama (Tokopedia, Shopee, Lazada, Blibli) sempat dibatalkan. Penunjukan ulang direncanakan 1 Oktober 2026 dan pemungutan mulai 1 November 2026. Platform pesan antar makanan **belum disebut**. Ini PPh restoran, bukan pajak di struk konsumen, tetapi POS sebaiknya bisa merekonsiliasi potongan dari aplikator. [O1][O2][O3]

### 5. Struk, tapping box, dan integrasi online dengan pemda

- **Struk/bon:** Perda/Perkada umumnya mewajibkan wajib pajak menerbitkan dan menyimpan bukti transaksi. Contoh: Perbup Lombok Barat mewajibkan penyimpanan data transaksi (bon penjualan/bill) **paling singkat 5 tahun**. [T1]
- **Tapping box / alat perekam data transaksi:** perangkat keras/lunak yang dipasang di usaha wajib pajak untuk "merekam, memproses, dan mengirimkan Data Transaksi Usaha ke server Pemerintah Daerah". Perangkat ini disambungkan ke komputer, printer, aplikasi pembayaran, atau database kasir. Dasarnya Perkada, merujuk UU 1/2022 dan PP 35/2023. Pemasangannya didorong program pencegahan korupsi KPK (Monitoring Center for Prevention/MCP). Contoh: Kab. Kotawaringin Timur menargetkan 120 tapping box pada 2025. [T1][T2]
- **DKI Jakarta, E-TRAPT:** agen software yang dipasang di POS/kasir dan mengirim data transaksi langsung ke server Bapenda, tanpa perangkat tambahan. Diluncurkan 21 Juli 2025, dengan dasar Pergub 2/2022 (perubahan Pergub 98/2019). Pada 2026, diskon 20% pokok PBJT hotel & restoran (Kepgub 310/2026, berlaku 17 Maret–30 April 2026) mensyaratkan wajib pajak menyatakan bersedia melaporkan transaksi lewat E-TRAPT. [T3][T4]
- **Pelaporan & pembayaran:** SPTPD (*self-assessment*) dilaporkan dan dibayar online. Contohnya pajakonline.jakarta.go.id (bisa dibayar via e-banking, QRIS, VA). Denda tidak lapor SPTPD di DKI Rp100.000 per SPTPD. [R6]
- **Tidak ada standar API nasional.** Integrasi harus dibuat per daerah (adapter per pemda), atau POS cukup kompatibel dengan tapping box yang menyadap printer/database.
- **e-Faktur/Coretax DJP tidak relevan** untuk penjualan makanan restoran (bukan objek PPN). Relevan hanya jika outlet PKP menjual barang yang kena PPN.

### 6. Pembulatan

- Tidak ditemukan ketentuan pembulatan PBJT di UU 1/2022 maupun PP 35/2023 (sudah dicari di teks PP 35/2023). Perda yang diperiksa juga tidak mengaturnya. **Keyakinan rendah**, karena tidak semua Perda diperiksa.
- Rekomendasi teknis: simpan nilai dalam rupiah bulat (integer). Hitung PBJT **per struk** (bukan per item) dari DPP lalu bulatkan ke rupiah penuh. Pembulatan kembalian tunai (mis. ke Rp100) dicatat sebagai baris terpisah dan **tidak** mengubah DPP/pajak yang dilaporkan. Mode pembulatan dibuat bisa dikonfigurasi per outlet, untuk berjaga jika ada Perda atau tapping box yang mengharapkan cara tertentu.

## Hal yang masih terbuka / perlu verifikasi

1. Perda dan Perkada untuk setiap kota outlet pilot: tarif, ambang, kategori, dan mekanisme integrasi.
2. Pernyataan tertulis Bapenda soal pesanan ojol, terutama jika harga aplikasi berbeda dari dine-in, serta promo yang ditanggung aplikator vs ditanggung restoran.
3. Spesifikasi teknis E-TRAPT (format data, cara instal agen) untuk outlet di Jakarta.
4. Apakah platform pesan antar makanan termasuk yang ditunjuk sebagai pemungut PPh 22 (PMK 37/2025) pada penunjukan ulang Oktober 2026.

## Sumber

Dicek 2026-10-03.

**Regulasi pajak daerah**
- [R1] UU 1/2022 (HKPD) Pasal 50, 51, 57, 58: https://pasal.id/peraturan/uu/uu-no-1-tahun-2022/pasal-51 · https://pasal.id/peraturan/uu/uu-no-1-tahun-2022/pasal-57 · https://pasal.id/peraturan/uu/uu-no-1-tahun-2022/pasal-58 · https://pasal.id/peraturan/uu/uu-no-1-tahun-2022/pasal-50
- [R2] PP 35/2023 Pasal 19: https://pasal.id/peraturan/pp/pp-no-35-tahun-2023/pasal-19 · PDF resmi BPK: https://peraturan.bpk.go.id/Download/308745/PP%20Nomor%2035%20Tahun%202023.pdf
- [R3] DDTC, ambang DKI Rp42 juta (Perda DKI 1/2024 Pasal 45 ayat 2): https://news.ddtc.co.id/berita/daerah/1799846/threshold-pajak-restoran-di-dki-jakarta-naik-jadi-rp42-juta-per-bulan
- [R4] DDTC, Perda Kab. Temanggung 12/2023: https://news.ddtc.co.id/berita/daerah/1804315/pemkab-temanggung-bedakan-tarif-pajak-restoran-dan-katering
- [R5] DDTC, Perda Kab. Probolinggo 1/2024: https://news.ddtc.co.id/berita/daerah/1804699/tarif-pajak-restoran-di-kabupaten-probolinggo-ditentukan-sesuai-omzet
- [R6] Bapenda DKI, Buku Saku PBJT Makanan dan Minuman: https://bapenda.jakarta.go.id/peraturan-perpajakan/unduh/buku-saku-pbjt-makanan-dan-minuman
- [R7] detikNews (7 Sep 2024), contoh hitung dari Bapenda DKI: https://news.detik.com/berita/d-7529399/bagaimana-menghitung-pbjt-makanan-dan-minuman-begini-caranya · IKPI: https://ikpi.or.id/ini-simulasi-penghitungan-pajak-barang-dan-jasa-tertentu/
- [R8] Ortax, ringkasan PBJT makanan/minuman: https://ortax.org/pbjt-makanan-minuman · DDTC (kewenangan ambang pemda): https://news.ddtc.co.id/berita/nasional/1795791/pemda-punya-wewenang-atur-threshold-pajak-atas-makanan-dan-minuman
- [R9] Pajak Online Kota Tangerang, info PBJT Makanan/Minuman: https://pajakonline.tangerangkota.go.id/info?sec=mamin
- [R10] IKPI (3 Des 2025), PB1 diganti PBJT di struk: https://ikpi.or.id/kenapa-pb1-hilang-dari-struk-restoran-ini-penjelasan-lengkapnya/

**PPN**
- [P1] DJP, "Makan di Restoran Tidak Kena PPN": https://www.pajak.go.id/id/artikel/makan-di-restoran-tidak-kena-ppn
- [P2] DDTC, kriteria PMK 70/2022: https://news.ddtc.co.id/berita/nasional/38215/pmk-baru-berikut-kriteria-makanan-dan-minuman-yang-tidak-dikenai-ppn
- [P3] DDTC, tiga jenis pengusaha yang tetap kena PPN (PMK 70/2022 Pasal 4 ayat 4): https://news.ddtc.co.id/berita/nasional/43529/makanan-minuman-yang-disediakan-oleh-3-jenis-pengusaha-ini-kena-ppn
- [P4] DJP Kaltimtara, PPN vs pajak daerah: https://pajak.go.id/id/berita/keliru-ppn-atau-pajak-daerah-pajak-kaltimtara-bahas-bedanya
- [P5] DDTC, tarif efektif setelah PPN 12% (PMK 131/2024): https://news.ddtc.co.id/memahami-sekilas-soal-tarif-efektif-setelah-ppn-12-berlaku-1807955
- [P6] DDTC, PPN 12% tetap untuk barang mewah di 2026: https://news.ddtc.co.id/berita/nasional/1812992/tak-berubah-tarif-ppn-12-tetap-berlaku-untuk-barang-mewah-di-2026

**Integrasi / pengawasan**
- [T1] Perbup Kab. Lombok Barat tentang pelaporan data transaksi usaha via tapping box: https://jnnqvmfhkqwfdlzevfao.supabase.co/storage/v1/object/public/regulation-pdfs/perbup-kab-lombok-barat-no-37-tahun-2024.pdf
- [T2] DDTC (27 Apr 2025), Kotawaringin Timur 120 tapping box: https://news.ddtc.co.id/berita/daerah/1810338/sasar-hotel-hingga-restoran-pemda-bakal-pasang-120-tapping-box
- [T3] IKPI (22 Jul 2025), E-TRAPT DKI Jakarta: https://ikpi.or.id/en/dki-jakarta-luncurkan-e-trapt-era-baru-pengawasan-pajak-usaha-tanpa-tapping-box/ · Bisnis.com: https://ekonomi.bisnis.com/read/20250309/259/1859631/bukan-coretax-pemprov-jakarta-rilis-sistem-pajak-online-baru-e-trapt
- [T4] Ortax (7 Apr 2026), diskon pajak hotel & restoran DKI (Kepgub 310/2026): https://ortax.org/pemprov-dki-jakarta-beri-diskon-pajak-hotel-dan-restoran-hingga-30-april-2026

**Ojol / marketplace**
- [O1] Infobank, pengecualian PMK 37/2025: https://infobanknews.com/ojol-hingga-penjual-pulsa-dikecualikan-dari-pajak-e-commerce-simak-aturan-lengkapnya/
- [O2] DDTC (1 Jul 2026), pemungutan marketplace efektif 1 Agustus 2026: https://news.ddtc.co.id/berita/nasional/1820495/djp-pemungutan-pajak-oleh-marketplace-berlaku-efektif-1-agustus-2026
- [O3] DDTC (6 Agu 2026), Kepdirjen batal, penunjukan ulang: https://news.ddtc.co.id/berita/nasional/1821450/kepdirjen-batal-djp-akan-tunjuk-ulang-marketplace-pemungut-pph-22
