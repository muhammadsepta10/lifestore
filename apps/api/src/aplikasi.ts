import type { INestApplication } from '@nestjs/common';
import { sajikanOpenApi } from './openapi';

/** Pengaturan aplikasi yang sama untuk main.ts dan dunia tes. */
export function konfigurasiAplikasi(app: INestApplication): void {
  app.setGlobalPrefix('v1');
  app.enableShutdownHooks();
  sajikanOpenApi(app);
}
