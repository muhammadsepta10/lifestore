import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { konfigurasiAplikasi } from './aplikasi';
import { AppModule } from './app.module';
import { konfigurasiDariEnv } from './konfigurasi';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule.register(konfigurasiDariEnv()));
  konfigurasiAplikasi(app);
  await app.listen(Number(process.env.PORT ?? 3001), '0.0.0.0');
}

void bootstrap();
