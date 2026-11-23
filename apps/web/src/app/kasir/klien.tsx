'use client';

import { useEffect } from 'react';
import { Ikon } from './ikon';

const KUNCI_TEMA = 'lifestore-tema';

/** Daftarkan service worker PWA kasir (diam-diam gagal bila browser tidak mendukung). */
export function DaftarkanServiceWorker() {
  useEffect(() => {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => undefined);
    try {
      const tema = localStorage.getItem(KUNCI_TEMA);
      if (tema === 'light' || tema === 'dark') document.documentElement.dataset.theme = tema;
    } catch {
      // Penyimpanan diblokir: ikuti tema sistem.
    }
  }, []);
  return null;
}

/** Ganti terang/gelap; pilihan disimpan per perangkat. */
export function TombolTema({ label }: { label: string }) {
  function ganti() {
    const el = document.documentElement;
    const gelapSekarang = el.dataset.theme ? el.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    const baru = gelapSekarang ? 'light' : 'dark';
    el.dataset.theme = baru;
    try {
      localStorage.setItem(KUNCI_TEMA, baru);
    } catch {
      // Abaikan: tema tetap berlaku sampai halaman dimuat ulang.
    }
  }
  return (
    <button type="button" className="ikon-btn" onClick={ganti} aria-label={label} title={label}>
      <Ikon nama="bulan" />
    </button>
  );
}

/** Tombol cetak Laporan Shift lewat dialog cetak browser. */
export function TombolCetak({ label }: { label: string }) {
  return (
    <button type="button" className="tombol tenang" onClick={() => window.print()}>
      {label}
    </button>
  );
}
