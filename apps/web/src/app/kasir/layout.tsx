import './kasir.css';
import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { t } from '../../i18n/id';
import { DaftarkanServiceWorker } from './klien';

export const metadata: Metadata = {
  title: `${t().kasir.judul} · ${t().aplikasi.nama}`,
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: t().kasir.judul, statusBarStyle: 'default' },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#eef3f1' },
    { media: '(prefers-color-scheme: dark)', color: '#0f1211' },
  ],
  width: 'device-width',
  initialScale: 1,
};

export default function LayoutKasir({ children }: { children: ReactNode }) {
  return (
    <>
      <DaftarkanServiceWorker />
      {children}
    </>
  );
}
