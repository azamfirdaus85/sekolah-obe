/* Service Worker SIAKAD OBE
   - Network-first: selalu ambil versi terbaru; cache hanya dipakai saat offline.
   - Data /api TIDAK PERNAH disimpan di cache (berisi data siswa/nilai/keuangan).
   Naikkan VERSION jika ingin memaksa cache lama dibersihkan. */
const VERSION = 'siakad-v1';
const SHELL = [
  '/',
  '/css/style.css',
  '/css/dark.css',
  '/js/app.js',
  '/js/pwa.js',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

const OFFLINE_HTML = `<!DOCTYPE html><html lang="id"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Offline - SIAKAD OBE</title>
<style>body{font-family:system-ui,sans-serif;background:#4f46e5;color:#fff;display:grid;place-items:center;min-height:100vh;margin:0;text-align:center;padding:1.5rem}
button{margin-top:1rem;padding:.7rem 1.4rem;border:0;border-radius:10px;font-weight:700;background:#fff;color:#4f46e5;font-size:1rem}</style></head>
<body><div><h1>Anda sedang offline</h1><p>SIAKAD OBE membutuhkan koneksi internet untuk menampilkan data terbaru.</p>
<button onclick="location.reload()">Coba Lagi</button></div></body></html>`;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION).then((cache) =>
      Promise.all(SHELL.map((url) => cache.add(url).catch(() => {})))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api')) return; // jangan pernah di-cache

  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(async () => {
        const hit = await caches.match(req);
        if (hit) return hit;
        if (req.mode === 'navigate') {
          const shell = await caches.match('/');
          if (shell) return shell;
          return new Response(OFFLINE_HTML, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
        }
        return new Response('', { status: 504, statusText: 'Offline' });
      })
  );
});
