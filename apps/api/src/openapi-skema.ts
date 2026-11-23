import { applyDecorators } from '@nestjs/common';
import { ApiBody, ApiResponse, type OpenAPIObject } from '@nestjs/swagger';
import { JENIS_METODE_BAYAR } from './pembayaran/metode-bayar.module';

/**
 * Skema body dan respons perintah kasir untuk dokumen OpenAPI. Validasi masukan ditulis tangan
 * (`umum/validasi.ts`) tanpa kelas DTO, jadi skemanya dinyatakan di sini dan ditempelkan ke handler
 * lewat dekorator `@Skema`, di samping kode yang divalidasinya.
 */
type Skema = NonNullable<NonNullable<OpenAPIObject['components']>['schemas']>[string];
type ReferenceObject = Extract<Skema, { $ref: string }>;
type SchemaObject = Exclude<Skema, ReferenceObject>;

const teks: Skema = { type: 'string' };
const teksAtauNull: Skema = { type: 'string', nullable: true };
const rupiah: Skema = { type: 'integer', description: 'Rupiah bulat.' };
const waktu: Skema = { type: 'string', format: 'date-time' };
const waktuAtauNull: Skema = { type: 'string', format: 'date-time', nullable: true };
const objek = (properties: Record<string, Skema>, required: string[] = []): SchemaObject => ({ type: 'object', properties, ...(required.length ? { required } : {}) });
const daftar = (items: Skema): Skema => ({ type: 'array', items });
const rujuk = (nama: string): ReferenceObject => ({ $ref: `#/components/schemas/${nama}` });

const idKlien: Skema = { type: 'string', maxLength: 64, description: 'ID buatan klien (UUID), sekaligus kunci idempoten: kiriman ulang dengan `id` yang sama tidak dijalankan dua kali.' };
const persetujuanAtasan: Skema = {
  ...objek({ anggotaId: teks, pin: teks }, ['anggotaId', 'pin']),
  description: 'Bukti Persetujuan Atasan: Anggota berwenang dan PIN-nya, dimasukkan di perangkat yang sama.',
};

const STATUS_ITEM = ['ditahan', 'menunggu', 'dimasak', 'siap', 'disajikan', 'batal'];
const KANAL = ['dine_in', 'bawa_pulang'];

/** Skema bersama; dipasang ke `components.schemas` dokumen. */
export const SKEMA_KOMPONEN: Record<string, SchemaObject> = {
  ItemPesanan: objek({
    id: teks,
    pesananId: teks,
    menuId: teks,
    nama: teks,
    varianId: teksAtauNull,
    namaVarian: teksAtauNull,
    hargaSatuan: rupiah,
    jumlah: { type: 'integer' },
    pilihan: daftar(objek({ pilihanId: teks, grupPilihanId: teks, nama: teks, harga: rupiah })),
    bebasPajak: { type: 'boolean' },
    stasiunId: teksAtauNull,
    catatan: teksAtauNull,
    status: { type: 'string', enum: STATUS_ITEM },
  }),
  Pesanan: objek({
    id: teks,
    tagihanId: teks,
    nomorPesanan: { type: 'string', example: 'A-023' },
    dikirimPada: waktu,
    status: { type: 'string', enum: STATUS_ITEM, description: 'Diturunkan dari Item Pesanan di dalamnya.' },
    item: daftar(rujuk('ItemPesanan')),
  }),
  Pembayaran: objek({
    id: teks,
    tagihanId: teks,
    metode: { type: 'string', enum: [...JENIS_METODE_BAYAR] },
    jumlah: rupiah,
    diterima: rupiah,
    kembalian: rupiah,
    pembulatan: { type: 'integer', description: 'Bagian `jumlah` dari Pembulatan Tunai; `jumlah − pembulatan` yang melunasi Tagihan.' },
    referensi: teksAtauNull,
    dibayarPada: waktu,
  }),
  RincianTagihan: objek({ subtotal: rupiah, diskon: rupiah, serviceCharge: rupiah, dasarPajak: rupiah, pajak: rupiah, total: rupiah }),
  Tagihan: objek({
    id: teks,
    outletId: teks,
    status: { type: 'string', enum: ['terbuka', 'lunas', 'void', 'batal', 'digabung'] },
    kanal: { type: 'string', enum: KANAL },
    mejaId: teksAtauNull,
    meja: daftar(objek({ id: teks, label: teks })),
    asalTagihanId: teksAtauNull,
    digabungKeTagihanId: teksAtauNull,
    namaPelanggan: teksAtauNull,
    dibukaPada: waktu,
    ditutupPada: waktuAtauNull,
    nomorNota: { type: 'integer', nullable: true },
    profilPajak: objek({ jenis: teks, tarifPersen: { type: 'number' }, labelStruk: teks, hargaTermasukPajak: { type: 'boolean' } }),
    serviceCharge: objek({ tarifPersen: { type: 'number' }, kanal: daftar({ type: 'string', enum: KANAL }) }),
    diskonManual: { ...objek({ jenis: { type: 'string', enum: ['persen', 'nominal'] }, nilai: { type: 'number' }, alasan: teksAtauNull }), nullable: true },
    alasanTutup: teksAtauNull,
    rincian: rujuk('RincianTagihan'),
    total: rupiah,
    dibayar: rupiah,
    sisa: rupiah,
    pembulatanTunai: { type: 'integer' },
    pesanan: daftar(rujuk('Pesanan')),
    pembayaran: daftar(rujuk('Pembayaran')),
  }),
  ShiftTerbuka: objek({ id: teks, status: teks, perangkatId: teks, kasAwal: rupiah, dibukaPada: waktu, dibukaOleh: objek({ id: teks, nama: teks }) }),
  KasShift: objek({ id: teks, shiftId: teks, jenis: { type: 'string', enum: ['masuk', 'keluar'] }, jumlah: rupiah, alasan: teks, dicatatPada: waktu }),
  LaporanShift: objek({
    id: teks,
    status: teks,
    outletId: teks,
    perangkat: { ...objek({ id: teks, nama: teks }), nullable: true },
    dibukaOleh: objek({ id: teks, nama: teks }),
    dibukaPada: waktu,
    ditutupOleh: { ...objek({ id: teks, nama: teks }), nullable: true },
    ditutupPada: waktuAtauNull,
    kasAwal: rupiah,
    penjualanPerMetodeBayar: daftar(objek({ jenis: teks, jumlah: { type: 'integer' }, nilai: rupiah })),
    penjualanTunai: rupiah,
    pembulatanTunai: { type: 'integer' },
    void: objek({ jumlah: { type: 'integer' }, nilai: rupiah }),
    kasMasuk: rupiah,
    kasKeluar: rupiah,
    kasSeharusnya: rupiah,
    hitungButa: rupiah,
    selisih: { type: 'integer' },
    kas: daftar(objek({ id: teks, jenis: teks, jumlah: rupiah, alasan: teks, oleh: objek({ id: teks, nama: teks }), dicatatPada: waktu })),
  }),
};

const tagihan = rujuk('Tagihan');
const itemIds: Skema = daftar(teks);

interface SkemaPerintah {
  body: SchemaObject;
  /** Status HTTP → skema respons sukses. */
  respons: Record<number, Skema>;
}

/** Body dan respons setiap perintah kasir. */
export const SKEMA_PERINTAH = {
  bukaTagihan: {
    body: objek({ id: idKlien, kanal: { type: 'string', enum: KANAL }, mejaId: { ...teks, description: 'Wajib untuk dine-in.' }, namaPelanggan: teks }, ['kanal']),
    respons: { 201: tagihan, 200: tagihan },
  },
  kirimPesanan: {
    body: objek(
      {
        id: idKlien,
        item: daftar(
          objek({ id: idKlien, menuId: teks, varianId: teks, pilihanIds: daftar(teks), jumlah: { type: 'integer', minimum: 1, default: 1 }, catatan: teks }, ['menuId']),
        ),
      },
      ['item'],
    ),
    respons: { 201: rujuk('Pesanan'), 200: rujuk('Pesanan') },
  },
  bayar: {
    body: objek(
      {
        id: idKlien,
        metode: { type: 'string', enum: [...JENIS_METODE_BAYAR] },
        jumlah: { ...rupiah, description: 'Bagian Tagihan yang dibayar; kosong = melunasi sisanya.' },
        diterima: { ...rupiah, description: 'Uang yang diterima; wajib untuk tunai.' },
        referensi: teks,
      },
      ['metode'],
    ),
    respons: { 201: objek({ pembayaran: rujuk('Pembayaran'), tagihan }), 200: objek({ pembayaran: rujuk('Pembayaran'), tagihan }) },
  },
  batalItem: { body: objek({ alasan: { ...teks, description: 'Wajib bila item sudah dimasak.' }, persetujuanAtasan }), respons: { 200: tagihan } },
  voidTagihan: { body: objek({ id: idKlien, alasan: teks, persetujuanAtasan }, ['alasan']), respons: { 200: tagihan } },
  diskonManual: {
    body: objek({ id: idKlien, jenis: { type: 'string', enum: ['persen', 'nominal'] }, nilai: { type: 'number' }, alasan: teks, persetujuanAtasan }, ['jenis', 'nilai', 'alasan']),
    respons: { 200: tagihan },
  },
  pindahMeja: { body: objek({ id: idKlien, mejaId: teks }, ['mejaId']), respons: { 200: tagihan } },
  gabungMeja: { body: objek({ id: idKlien, mejaId: teks }, ['mejaId']), respons: { 200: tagihan } },
  pisahTagihan: {
    body: objek({ id: { ...idKlien, description: 'ID Tagihan baru buatan klien, sekaligus kunci idempoten.' }, itemIds, namaPelanggan: teks }, ['itemIds']),
    respons: { 201: objek({ asal: tagihan, baru: tagihan }), 200: objek({ asal: tagihan, baru: tagihan }) },
  },
  bukaLaci: {
    body: objek({ id: idKlien, alasan: teks, persetujuanAtasan }, ['alasan']),
    respons: { 200: objek({ dibuka: { type: 'boolean' }, shiftId: teksAtauNull, dibukaPada: waktu, penyetujuAnggotaId: teks }) },
  },
  bukaShift: { body: objek({ id: idKlien, kasAwal: rupiah }, ['kasAwal']), respons: { 201: rujuk('ShiftTerbuka'), 200: rujuk('ShiftTerbuka') } },
  kasShift: {
    body: objek({ id: idKlien, jenis: { type: 'string', enum: ['masuk', 'keluar'] }, jumlah: rupiah, alasan: teks }, ['jenis', 'jumlah', 'alasan']),
    respons: { 201: rujuk('KasShift'), 200: rujuk('KasShift') },
  },
  tutupShift: { body: objek({ id: idKlien, hitungButa: rupiah }, ['hitungButa']), respons: { 200: rujuk('LaporanShift') } },
  statusItem: {
    body: objek({ itemIds, status: { type: 'string', enum: ['dimasak', 'siap', 'disajikan'] } }, ['itemIds', 'status']),
    respons: { 200: objek({ item: daftar(objek({ id: teks, status: { type: 'string', enum: STATUS_ITEM } })) }) },
  },
} satisfies Record<string, SkemaPerintah>;

/** Tempelkan skema body dan respons sebuah perintah kasir ke handler-nya. */
export function Skema(nama: keyof typeof SKEMA_PERINTAH) {
  const s: SkemaPerintah = SKEMA_PERINTAH[nama];
  return applyDecorators(
    ApiBody({ schema: s.body }),
    ...Object.entries(s.respons).map(([status, schema]) => ApiResponse({ status: Number(status), schema })),
  );
}
