import { Body, Controller, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { Database } from '../database/database';
import { PerluIzin } from '../izin/izin';
import { Perangkat, type PerangkatAktif, PerangkatGuard } from '../karyawan/perangkat';
import { aturHabis, menuDijualDiOutlet } from './menu-outlet.controller';

/** Menu dari sisi Perangkat Terdaftar (kasir/KDS). Outlet selalu Outlet perangkat. */
@Controller('kasir/menu')
@UseGuards(PerangkatGuard)
export class MenuKasirController {
  constructor(private readonly db: Database) {}

  /** Daftar jual Outlet perangkat: Kategori dan Menu aktif dengan harga Outlet, Stasiun, Habis. */
  @Get()
  @PerluIzin('menu.lihat')
  async daftar(@Perangkat() p: PerangkatAktif) {
    return menuDijualDiOutlet(this.db.tenant(), p.outletId);
  }

  /** Kasir/dapur/manajer menandai Menu Habis (`{habis: true}`) atau tersedia lagi. */
  @Post(':menuId/habis')
  @PerluIzin('menu.habis')
  @HttpCode(200)
  async habis(@Perangkat() p: PerangkatAktif, @Param('menuId') menuId: string, @Body() body: unknown) {
    return aturHabis(this.db.tenant(), p.outletId, menuId, body);
  }
}
