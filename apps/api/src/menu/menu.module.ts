import { Module } from '@nestjs/common';
import { KaryawanModule } from '../karyawan/karyawan.module';
import { KategoriController } from './kategori.controller';
import { MenuKasirController } from './menu-kasir.controller';
import { MenuOutletController } from './menu-outlet.controller';
import { MenuController } from './menu.controller';
import { StasiunController } from './stasiun.controller';

@Module({
  imports: [KaryawanModule],
  controllers: [KategoriController, MenuController, MenuOutletController, StasiunController, MenuKasirController],
})
export class MenuModule {}
