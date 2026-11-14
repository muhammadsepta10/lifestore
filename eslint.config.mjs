// Satu konfigurasi ESLint (flat config) untuk seluruh monorepo.
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/.next/**', '**/node_modules/**', '**/.turbo/**', '**/next-env.d.ts'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    // Paket domain adalah aturan bisnis murni: tanpa I/O, tanpa api, tanpa framework.
    // Paket ini juga akan berjalan di kasir offline (browser).
    files: ['packages/domain/**/*.ts'],
    languageOptions: { globals: {} },
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['node:*', 'fs', 'fs/*', 'path', 'http', 'https', 'net', 'child_process', 'os', 'crypto'],
              message: 'Paket domain tidak boleh memakai I/O atau modul Node.',
            },
            {
              group: ['@lifestore/api', '@lifestore/api/*', '@lifestore/web', '@lifestore/web/*', '@nestjs/*', 'drizzle-orm', 'drizzle-orm/*', 'pg', 'react', 'next', 'next/*'],
              message: 'Paket domain tidak boleh bergantung pada aplikasi, framework, atau database.',
            },
          ],
        },
      ],
      'no-restricted-globals': ['error', 'fetch', 'process', 'window', 'document', 'localStorage', 'XMLHttpRequest'],
    },
  },
);
