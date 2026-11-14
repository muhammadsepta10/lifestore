'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

/** Selang muat ulang berkala: memperbarui umur chip dan menutup celah bila ada kejadian terlewat. */
const SELANG_SEGAR_MS = 20_000;

/**
 * Menyambung ke aliran kejadian dapur dan menyegarkan layar begitu ada kejadian, tanpa memuat
 * ulang halaman. Menampilkan status sambungan; EventSource menyambung ulang sendiri.
 */
export function PenyegarKds({ stasiunId, sejak, label }: { stasiunId: string | null; sejak: number; label: { online: string; offline: string } }) {
  const router = useRouter();
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const param = new URLSearchParams({ sejak: String(sejak) });
    if (stasiunId) param.set('stasiun', stasiunId);
    const sumber = new EventSource(`/kds/aliran?${param}`);
    let tunda: ReturnType<typeof setTimeout> | undefined;
    const segarkan = () => {
      clearTimeout(tunda);
      tunda = setTimeout(() => router.refresh(), 150);
    };
    sumber.addEventListener('item', segarkan);
    sumber.onopen = () => setOnline(true);
    sumber.onerror = () => setOnline(false);
    const berkala = setInterval(() => router.refresh(), SELANG_SEGAR_MS);
    return () => {
      clearTimeout(tunda);
      clearInterval(berkala);
      sumber.close();
    };
    // `sejak` sengaja tidak jadi dependensi: aliran melanjutkan sendiri dari kejadian terakhirnya.
  }, [stasiunId, router]);

  return (
    <span className={`net${online ? '' : ' off'}`} data-sambungan={online ? 'online' : 'offline'} role="status">
      <i />
      {online ? label.online : label.offline}
    </span>
  );
}

/** Jam dinding layar dapur. */
export function JamDinding() {
  const [teks, setTeks] = useState('');
  useEffect(() => {
    const format = new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' });
    const perbarui = () => setTeks(format.format(new Date()));
    perbarui();
    const pewaktu = setInterval(perbarui, 10_000);
    return () => clearInterval(pewaktu);
  }, []);
  return <span className="clock num">{teks}</span>;
}
