import { Body, Controller, Get, HttpCode, Injectable, Module, type OnModuleDestroy, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { and, asc, eq, gt, gte, inArray, max, sql } from 'drizzle-orm';
import type { Request, Response } from 'express';
import { Database, type TxDb } from '../database/database';
import type { KonteksTenant } from '../database/konteks-tenant';
import { itemPesanan, kejadianItemPesanan, pesanan, stasiun, tagihan } from '../database/schema';
import { type Pelaku, PelakuAktif, pastikanIzin, PerluIzin, punyaIzin, SemuaAnggota, tidakBerizin } from '../izin/izin';
import { KaryawanModule } from '../karyawan/karyawan.module';
import { Perangkat, type PerangkatAktif, PerangkatGuard } from '../karyawan/perangkat';
import { statusPesanan, type StatusItemPesanan } from '../penjualan/tagihan';
import { Jam } from '../umum/jam';
import { objek, pilihan, tidakDitemukan, tidakValid } from '../umum/validasi';

/**
 * Dapur (KDS): Item Pesanan per Stasiun untuk layar dapur di Perangkat Terdaftar, perubahan
 * status item (`menunggu → dimasak → siap → disajikan`), aliran kejadian (SSE), dan daftar
 * Siap Diambil di kasir. Status selalu dicatat sebagai kejadian baru (append-only).
 */

/** Urutan maju status dapur. `batal` di luar urutan ini. */
const URUTAN_STATUS: readonly StatusItemPesanan[] = ['menunggu', 'dimasak', 'siap', 'disajikan'];
const STATUS_TUJUAN = ['dimasak', 'siap', 'disajikan'] as const;
/** Pesanan yang lebih tua dari ini tidak lagi tampil di layar dapur. */
const JENDELA_PESANAN_MS = 24 * 60 * 60 * 1000;
/** Item batal tetap tampil tercoret selama ini supaya juru masak sempat melihatnya. */
const TAMPIL_BATAL_MS = 5 * 60 * 1000;
const MAKS_ITEM_SEKALI = 200;

interface ItemDapur {
  id: string;
  pesananId: string;
  tagihanId: string;
  nomorPesanan: string;
  dikirimPada: Date;
  kanal: string;
  namaPelanggan: string | null;
  mejaId: string | null;
  nama: string;
  namaVarian: string | null;
  pilihan: string[];
  jumlah: number;
  catatan: string | null;
  stasiunId: string | null;
  status: StatusItemPesanan;
  /** Waktu status terakhir dicatat. */
  statusPada: Date;
}

/** Item Pesanan Outlet dari Pesanan sehari terakhir, dengan status dapur terkininya, urut kiriman. */
async function itemDapur(tx: TxDb, outletId: string, sekarang: Date): Promise<ItemDapur[]> {
  const baris = await tx
    .select({ i: itemPesanan, p: pesanan, t: { kanal: tagihan.kanal, namaPelanggan: tagihan.namaPelanggan, mejaId: tagihan.mejaId } })
    .from(itemPesanan)
    .innerJoin(pesanan, eq(pesanan.id, itemPesanan.pesananId))
    .innerJoin(tagihan, eq(tagihan.id, itemPesanan.tagihanId))
    .where(and(eq(itemPesanan.outletId, outletId), gte(pesanan.dikirimPada, new Date(sekarang.getTime() - JENDELA_PESANAN_MS))))
    .orderBy(asc(pesanan.dikirimPada), asc(pesanan.nomorPesanan), asc(itemPesanan.urutan));
  if (baris.length === 0) return [];
  const terakhir = await tx
    .selectDistinctOn([kejadianItemPesanan.itemPesananId], {
      itemPesananId: kejadianItemPesanan.itemPesananId,
      status: kejadianItemPesanan.status,
      pada: kejadianItemPesanan.createdAt,
    })
    .from(kejadianItemPesanan)
    .where(
      inArray(
        kejadianItemPesanan.itemPesananId,
        baris.map((b) => b.i.id),
      ),
    )
    .orderBy(kejadianItemPesanan.itemPesananId, sql`${kejadianItemPesanan.urutan} desc`);
  const status = new Map(terakhir.map((k) => [k.itemPesananId, k]));
  return baris.map(({ i, p, t }) => ({
    id: i.id,
    pesananId: p.id,
    tagihanId: i.tagihanId,
    nomorPesanan: p.nomorPesanan,
    dikirimPada: p.dikirimPada,
    kanal: t.kanal,
    namaPelanggan: t.namaPelanggan,
    mejaId: t.mejaId,
    nama: i.nama,
    namaVarian: i.namaVarian,
    pilihan: i.pilihan.map((x) => x.nama),
    jumlah: i.jumlah,
    catatan: i.catatan,
    stasiunId: i.stasiunId,
    status: status.get(i.id)?.status ?? 'menunggu',
    statusPada: status.get(i.id)?.pada ?? p.dikirimPada,
  }));
}

/** Pesanan yang semua itemnya sudah siap (dan belum semuanya disajikan): tinggal diserahkan. */
function pesananSiap(item: readonly ItemDapur[]) {
  const perPesanan = new Map<string, ItemDapur[]>();
  for (const i of item) perPesanan.set(i.pesananId, [...(perPesanan.get(i.pesananId) ?? []), i]);
  return [...perPesanan.values()]
    .filter((daftar) => statusPesanan(daftar.map((i) => i.status)) === 'siap')
    .map((daftar) => {
      const a = daftar[0]!;
      return {
        pesananId: a.pesananId,
        tagihanId: a.tagihanId,
        nomorPesanan: a.nomorPesanan,
        dikirimPada: a.dikirimPada,
        kanal: a.kanal,
        namaPelanggan: a.namaPelanggan,
        mejaId: a.mejaId,
        item: daftar.filter((i) => i.status !== 'batal').map((i) => ({ id: i.id, nama: i.nama, namaVarian: i.namaVarian, jumlah: i.jumlah, status: i.status })),
      };
    });
}

async function stasiunOutlet(tx: TxDb, outletId: string) {
  return tx.select({ id: stasiun.id, nama: stasiun.nama }).from(stasiun).where(eq(stasiun.outletId, outletId)).orderBy(asc(stasiun.urutan), asc(stasiun.createdAt), asc(stasiun.id));
}

/** Stasiun pilihan layar (`?stasiun=`): harus Stasiun Outlet perangkat. Tanpa nilai = semua Stasiun. */
async function stasiunDipilih(tx: TxDb, outletId: string, v: unknown): Promise<string | null> {
  if (v === undefined || v === '') return null;
  if (typeof v !== 'string') throw tidakValid('stasiun', 'Harus satu ID Stasiun.');
  if (!(await stasiunOutlet(tx, outletId)).some((s) => s.id === v)) throw tidakDitemukan('Stasiun');
  return v;
}

/** Aliran SSE yang sedang terbuka; ditutup saat aplikasi berhenti supaya server bisa selesai. */
@Injectable()
export class AliranDapur implements OnModuleDestroy {
  /** Jeda antar pemeriksaan kejadian baru. Pesanan baru tampil paling lambat sekitar selama ini. */
  static JEDA_MS = 1_000;
  /** Aliran diputus setelah ini; layar menyambung ulang sendiri sehingga token perangkat diperiksa lagi. */
  static UMUR_MAKS_MS = 10 * 60 * 1000;
  private readonly terbuka = new Set<() => void>();

  constructor(private readonly db: Database) {}

  /** Kirim kejadian Item Pesanan Outlet (opsional satu Stasiun) dengan `urutan` di atas `sejak` sampai klien memutus. */
  buka(req: Request, res: Response, konteks: KonteksTenant & { outletId: string }, stasiunId: string | null, sejak: number): void {
    res.status(200).set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.flushHeaders();
    res.write(`retry: 2000\n: tersambung\n\n`);
    let terakhir = sejak;
    let sibuk = false;
    let selesai = false;
    const periksa = async () => {
      if (sibuk || selesai) return;
      sibuk = true;
      try {
        const baru = await this.db.denganTenant(konteks, (tx) =>
          tx
            .select({
              urutan: kejadianItemPesanan.urutan,
              itemPesananId: kejadianItemPesanan.itemPesananId,
              status: kejadianItemPesanan.status,
              stasiunId: itemPesanan.stasiunId,
              pesananId: itemPesanan.pesananId,
            })
            .from(kejadianItemPesanan)
            .innerJoin(itemPesanan, eq(itemPesanan.id, kejadianItemPesanan.itemPesananId))
            .where(
              and(
                eq(kejadianItemPesanan.outletId, konteks.outletId),
                gt(kejadianItemPesanan.urutan, terakhir),
                ...(stasiunId ? [eq(itemPesanan.stasiunId, stasiunId)] : []),
              ),
            )
            .orderBy(asc(kejadianItemPesanan.urutan))
            .limit(500),
        );
        if (selesai) return;
        for (const k of baru) {
          res.write(`id: ${k.urutan}\nevent: item\ndata: ${JSON.stringify(k)}\n\n`);
          terakhir = k.urutan;
        }
        if (baru.length === 0) res.write(`: hidup\n\n`);
      } catch {
        tutup();
      } finally {
        sibuk = false;
      }
    };
    const pewaktu = setInterval(() => void periksa(), AliranDapur.JEDA_MS);
    const batas = setTimeout(() => tutup(), AliranDapur.UMUR_MAKS_MS);
    const tutup = () => {
      if (selesai) return;
      selesai = true;
      clearInterval(pewaktu);
      clearTimeout(batas);
      this.terbuka.delete(tutup);
      res.end();
    };
    this.terbuka.add(tutup);
    req.on('close', tutup);
    void periksa();
  }

  onModuleDestroy(): void {
    for (const tutup of [...this.terbuka]) tutup();
  }
}

/** Layar dapur di Perangkat Terdaftar. */
@Controller('kds')
@UseGuards(PerangkatGuard)
export class KdsController {
  constructor(
    private readonly db: Database,
    private readonly jam: Jam,
    private readonly aliran: AliranDapur,
  ) {}

  /**
   * Isi layar dapur: Item Pesanan yang belum siap (opsional hanya satu Stasiun lewat `?stasiun=`),
   * item yang baru dibatalkan (untuk dicoret), dan deret "Siap diserahkan" (Pesanan yang semua
   * itemnya siap, dari semua Stasiun). `urutan` = kejadian terakhir, titik awal aliran SSE.
   */
  @Get()
  @PerluIzin('kds.buka')
  async layar(@Perangkat() p: PerangkatAktif, @Query('stasiun') stasiun: unknown) {
    const tx = this.db.tenant();
    const stasiunId = await stasiunDipilih(tx, p.outletId, stasiun);
    const sekarang = this.jam.sekarang();
    // Urutan dibaca sebelum isinya, supaya kejadian yang datang di antaranya tetap terkirim lewat aliran.
    const urutan = await urutanTerakhir(tx, p.outletId);
    const semua = await itemDapur(tx, p.outletId, sekarang);
    const batasBatal = Date.now() - TAMPIL_BATAL_MS;
    const item = semua.filter(
      (i) =>
        (!stasiunId || i.stasiunId === stasiunId) &&
        (i.status === 'menunggu' || i.status === 'dimasak' || (i.status === 'batal' && i.statusPada.getTime() >= batasBatal)),
    );
    return { stasiunId, stasiun: await stasiunOutlet(tx, p.outletId), sekarang, urutan, item, siapDiserahkan: pesananSiap(semua) };
  }

  /**
   * Aliran kejadian Item Pesanan (Server-Sent Events) untuk satu Stasiun atau semua. Tiap kejadian
   * `item` membawa `urutan`; sambung ulang dengan `?sejak=<urutan>` atau header `Last-Event-ID`.
   */
  @Get('aliran')
  @PerluIzin('kds.buka')
  async alirkan(@Perangkat() p: PerangkatAktif, @Query('stasiun') stasiun: unknown, @Query('sejak') sejak: unknown, @Req() req: Request, @Res() res: Response) {
    const tx = this.db.tenant();
    const stasiunId = await stasiunDipilih(tx, p.outletId, stasiun);
    const diminta = Number(typeof sejak === 'string' && sejak !== '' ? sejak : (req.headers['last-event-id'] ?? NaN));
    const mulai = Number.isSafeInteger(diminta) && diminta >= 0 ? diminta : await urutanTerakhir(tx, p.outletId);
    // Transaksi request selesai begitu handler ini kembali; aliran membuka transaksi pendek sendiri.
    this.aliran.buka(req, res, { tenantId: p.tenantId, outletId: p.outletId }, stasiunId, mulai);
  }

  /**
   * Majukan status Item Pesanan (boleh beberapa sekaligus: baris gabungan di layar). Status hanya
   * bisa maju; item yang sudah di status itu, lebih jauh, atau batal dilewati tanpa error.
   * Memasak dan menandai siap butuh izin KDS; menandai disajikan juga boleh dari kasir.
   */
  @Post('status')
  @HttpCode(200)
  @SemuaAnggota()
  async status(@Perangkat() p: PerangkatAktif, @PelakuAktif() pelaku: Pelaku, @Body() body: unknown) {
    const m = objek(body);
    const tujuan = pilihan(m, 'status', STATUS_TUJUAN);
    if (tujuan === 'disajikan' && !punyaIzin(pelaku, 'kds.buka', p.outletId)) pastikanIzin(pelaku, 'kasir.buka', p.outletId);
    else if (!punyaIzin(pelaku, 'kds.buka', p.outletId)) throw tidakBerizin('kds.buka');
    const ids = m.itemIds;
    if (!Array.isArray(ids) || ids.length === 0 || ids.length > MAKS_ITEM_SEKALI || ids.some((x) => typeof x !== 'string')) {
      throw tidakValid('itemIds', `Harus daftar 1 sampai ${MAKS_ITEM_SEKALI} ID Item Pesanan.`);
    }
    const itemIds = [...new Set(ids as string[])];
    const tx = this.db.tenant();
    const item = await tx
      .select({ id: itemPesanan.id, tagihanId: itemPesanan.tagihanId })
      .from(itemPesanan)
      .where(and(inArray(itemPesanan.id, itemIds), eq(itemPesanan.outletId, p.outletId)));
    if (item.length !== itemIds.length) throw tidakDitemukan('Item Pesanan');
    // Kunci Tagihan-nya (urut ID supaya tidak saling mengunci): perubahan status dan pembatalan
    // untuk item yang sama antre di sini.
    await tx
      .select({ id: tagihan.id })
      .from(tagihan)
      .where(inArray(tagihan.id, [...new Set(item.map((i) => i.tagihanId))]))
      .orderBy(asc(tagihan.id))
      .for('update');
    const kini = await statusTerkini(tx, itemIds);
    const maju = itemIds.filter((id) => {
      const s = kini.get(id) ?? 'menunggu';
      // Item batal dilewati; item yang ditahan (Outlet bayar-dulu) belum masuk dapur sampai Tagihannya lunas.
      return s !== 'batal' && s !== 'ditahan' && URUTAN_STATUS.indexOf(s) < URUTAN_STATUS.indexOf(tujuan);
    });
    if (maju.length > 0) {
      await tx
        .insert(kejadianItemPesanan)
        .values(maju.map((id) => ({ tenantId: p.tenantId, outletId: p.outletId, itemPesananId: id, status: tujuan, anggotaId: pelaku.anggotaId, perangkatId: p.id })));
    }
    return { item: itemIds.map((id) => ({ id, status: maju.includes(id) ? tujuan : (kini.get(id) ?? 'menunggu') })) };
  }
}

async function urutanTerakhir(tx: TxDb, outletId: string): Promise<number> {
  const [b] = await tx.select({ n: max(kejadianItemPesanan.urutan) }).from(kejadianItemPesanan).where(eq(kejadianItemPesanan.outletId, outletId));
  return b?.n ?? 0;
}

async function statusTerkini(tx: TxDb, itemIds: string[]): Promise<Map<string, StatusItemPesanan>> {
  const baris = await tx
    .selectDistinctOn([kejadianItemPesanan.itemPesananId], { itemPesananId: kejadianItemPesanan.itemPesananId, status: kejadianItemPesanan.status })
    .from(kejadianItemPesanan)
    .where(inArray(kejadianItemPesanan.itemPesananId, itemIds))
    .orderBy(kejadianItemPesanan.itemPesananId, sql`${kejadianItemPesanan.urutan} desc`);
  return new Map(baris.map((b) => [b.itemPesananId, b.status]));
}

/** Siap Diambil di kasir: Pesanan bawa pulang yang semua itemnya siap dan menunggu diambil pelanggan. */
@Controller('siap-diambil')
@UseGuards(PerangkatGuard)
export class SiapDiambilController {
  constructor(
    private readonly db: Database,
    private readonly jam: Jam,
  ) {}

  @Get()
  @PerluIzin('kasir.buka')
  async daftar(@Perangkat() p: PerangkatAktif) {
    return pesananSiap(await itemDapur(this.db.tenant(), p.outletId, this.jam.sekarang())).filter((x) => x.kanal === 'bawa_pulang');
  }
}

@Module({
  imports: [KaryawanModule],
  controllers: [KdsController, SiapDiambilController],
  providers: [AliranDapur],
})
export class DapurModule {}
