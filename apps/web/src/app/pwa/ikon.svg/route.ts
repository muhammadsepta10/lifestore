import { WARNA_AKSEN } from '@lifestore/ui';

/** Ikon PWA kasir (daun Lifestore di lingkaran aksen), dibuat sebagai SVG agar tidak butuh folder `public`. */
const IKON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
<rect width="512" height="512" rx="112" fill="${WARNA_AKSEN}"/>
<g transform="translate(112 112) scale(12)" fill="none" stroke="#fff" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
<path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"/>
<path d="M2 21c0-3 1.85-5.36 5.08-6"/>
</g>
</svg>`;

export function GET() {
  return new Response(IKON, { headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=86400' } });
}
