import '@lifestore/ui/tokens.css';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { t } from '../i18n/id';

export const metadata: Metadata = {
  title: t().aplikasi.judul,
  description: t().aplikasi.deskripsi,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="id">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
