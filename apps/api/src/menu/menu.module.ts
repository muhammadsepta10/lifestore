import { Module } from '@nestjs/common';
import { KategoriController } from './kategori.controller';
import { MenuOutletController } from './menu-outlet.controller';
import { MenuController } from './menu.controller';
import { StasiunController } from './stasiun.controller';

@Module({ controllers: [KategoriController, MenuController, MenuOutletController, StasiunController] })
export class MenuModule {}
