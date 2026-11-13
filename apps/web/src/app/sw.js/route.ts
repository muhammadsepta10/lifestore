/**
 * Service worker PWA kasir. Sengaja minimal: membuat kasir bisa dipasang (installable) dan
 * meneruskan semua permintaan ke jaringan. Cache offline dan antrean Sinkron menyusul (ADR 0003).
 */
const SW = `self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
`;

export function GET() {
  return new Response(SW, {
    headers: { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-cache', 'Service-Worker-Allowed': '/' },
  });
}
