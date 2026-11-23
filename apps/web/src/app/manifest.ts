import type { MetadataRoute } from 'next';
import { WARNA_AKSEN } from '@lifestore/ui';
import { t } from '../i18n/id';

/** Manifest PWA: kasir dipasang di tablet/PC Perangkat Terdaftar dan dibuka layar penuh. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${t().aplikasi.nama} ${t().kasir.judul}`,
    short_name: t().kasir.judul,
    description: t().aplikasi.deskripsi,
    start_url: '/kasir',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: '#eef3f1',
    theme_color: WARNA_AKSEN,
    lang: 'id',
    icons: [{ src: '/pwa/ikon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
  };
}
