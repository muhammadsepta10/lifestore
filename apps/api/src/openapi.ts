import type { INestApplication, Type } from '@nestjs/common';
import { ModulesContainer } from '@nestjs/core';
import { DocumentBuilder, type OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import { SesiGuard } from './identitas/sesi.guard';
import { PerangkatGuard } from './karyawan/perangkat';

/** Alamat dokumen OpenAPI (JSON), di bawah awalan versi. */
export const JALUR_OPENAPI = 'v1/openapi.json';

const SKEMA_SESI = 'sesi';
const SKEMA_PERANGKAT = 'perangkat';
const METODE_HTTP = ['get', 'post', 'put', 'patch', 'delete'] as const;

/** Guard yang dipasang pada controller atau handler, dibaca dari metadata `@UseGuards`. */
function guardDari(target: object | undefined): unknown[] {
  return target ? ((Reflect.getMetadata('__guards__', target) as unknown[] | undefined) ?? []) : [];
}

/**
 * Dokumen OpenAPI dibuat dari kode: jalur, metode, dan parameter jalur dibaca dari dekorator
 * controller NestJS, dan jenis autentikasi tiap operasi dari guard-nya (sesi Pengguna untuk
 * dashboard, token Perangkat Terdaftar untuk kasir/KDS). Tidak ada berkas spesifikasi tulisan tangan.
 *
 * Batasan: body dan respons belum punya skema, karena validasi masukan ditulis tangan
 * (`umum/validasi.ts`) tanpa kelas DTO.
 */
export function buatDokumenOpenApi(app: INestApplication): OpenAPIObject {
  const konfigurasi = new DocumentBuilder()
    .setTitle('Lifestore API')
    .setDescription('REST JSON berversi (/v1). Dibuat otomatis dari controller.')
    .setVersion('1')
    .addBearerAuth({ type: 'http', scheme: 'bearer', description: 'Token sesi Pengguna dari POST /v1/masuk.' }, SKEMA_SESI)
    .addApiKey(
      { type: 'apiKey', in: 'header', name: 'Authorization', description: 'Token Perangkat Terdaftar: `Authorization: Perangkat <token>`.' },
      SKEMA_PERANGKAT,
    )
    .build();
  const dokumen = SwaggerModule.createDocument(app, konfigurasi, {
    deepScanRoutes: true,
    operationIdFactory: (controller, handler) => `${controller}.${handler}`,
  });

  const controller = new Map<string, Type>();
  for (const modul of app.get(ModulesContainer).values()) {
    for (const c of modul.controllers.values()) if (c.metatype) controller.set(c.metatype.name, c.metatype as Type);
  }
  for (const jalur of Object.values(dokumen.paths)) {
    for (const metode of METODE_HTTP) {
      const operasi = jalur[metode];
      if (!operasi?.operationId) continue;
      const [namaController, namaHandler] = operasi.operationId.split('.');
      const kelas = controller.get(namaController!);
      const guard = [...guardDari(kelas), ...guardDari(kelas?.prototype?.[namaHandler!] as object | undefined)];
      if (guard.includes(SesiGuard)) operasi.security = [{ [SKEMA_SESI]: [] }];
      else if (guard.includes(PerangkatGuard)) operasi.security = [{ [SKEMA_PERANGKAT]: [] }];
      if (!operasi.tags?.length && namaController) operasi.tags = [namaController.replace(/Controller$/, '')];
    }
  }
  return dokumen;
}

/** Sajikan dokumen OpenAPI di `GET /v1/openapi.json` (tanpa autentikasi, tanpa halaman UI). */
export function sajikanOpenApi(app: INestApplication): void {
  SwaggerModule.setup('v1/openapi', app, () => buatDokumenOpenApi(app), { ui: false, raw: ['json'], jsonDocumentUrl: JALUR_OPENAPI });
}
