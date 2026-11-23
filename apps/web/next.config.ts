import path from 'node:path';
import type { NextConfig } from 'next';

const config: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: path.join(__dirname, '../..'),
  transpilePackages: ['@lifestore/ui', '@lifestore/domain'],
  eslint: { ignoreDuringBuilds: true },
};

export default config;
