import { Controller, Get, Module } from '@nestjs/common';
import { Database } from '../database/database';

@Controller('health')
export class KesehatanController {
  constructor(private readonly database: Database) {}

  @Get()
  async periksa(): Promise<{ status: 'ok'; database: 'ok' | 'gagal' }> {
    const database = (await this.database.sehat()) ? 'ok' : 'gagal';
    return { status: 'ok', database };
  }
}

@Module({ controllers: [KesehatanController] })
export class KesehatanModule {}
