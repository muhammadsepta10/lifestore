import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// SWC dipakai karena NestJS butuh emitDecoratorMetadata (esbuild tidak mendukungnya).
export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    include: ['test/**/*.test.ts', 'src/**/*.test.ts'],
    globalSetup: ['test/support/global-setup.ts'],
    // Tiap file tes (suite) membuat database sendiri, jadi aman berjalan paralel.
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
