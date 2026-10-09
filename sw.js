/* Service worker: precaches the whole app shell (pages, code, data, encrypted details, fonts, icons) so it works offline.
   scripts/build.js replaces the two placeholders below: a version hash of the build and the list of files.
   Caches are versioned: a new build gets a new cache, and old ones are deleted once it activates.
   Only ciphertext is ever cached. Decrypted details exist in page memory only. */
const VERSION = '684ab7925e';
const PRECACHE = [
 "./",
 "app.js",
 "data/geo.js",
 "data/trip.js",
 "details-crypto.js",
 "details.enc.json",
 "fonts/OFL-ShipporiMinchoB1.txt",
 "fonts/OFL-ZenKakuGothicNew.txt",
 "fonts/ShipporiMinchoB1-500.woff2",
 "fonts/ShipporiMinchoB1-700.woff2",
 "fonts/ZenKakuGothicNew-400.woff2",
 "fonts/ZenKakuGothicNew-500.woff2",
 "fonts/ZenKakuGothicNew-700.woff2",
 "icons/apple-touch-icon.png",
 "icons/favicon-32.png",
 "icons/icon-192.png",
 "icons/icon-512.png",
 "icons/icon-maskable-512.png",
 "index.html",
 "manifest.webmanifest",
 "map-nav.js",
 "pwa.js",
 "secrets.js",
 "styles.css"
];
const CACHE = 'trip-shell-' + VERSION;

if (VERSION.startsWith('__')) {
  /* unbuilt dev copy (served straight from src/): do nothing, so development is never served from a stale cache */
} else {
  self.addEventListener('install', (event) => {
    /* No skipWaiting here: an update waits until the person taps "Reload" in the app, so a page is never swapped mid-use. */
    event.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE.map((u) => new Request(u, { cache: 'reload' })))));
  });

  self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
      for (const k of await caches.keys()) if (k.startsWith('trip-shell-') && k !== CACHE) await caches.delete(k);
      await self.clients.claim();
    })());
  });

  self.addEventListener('message', (event) => {
    const d = event.data || {};
    if (d.type === 'SKIP_WAITING') self.skipWaiting();
    if (d.type === 'STATUS' && event.ports[0]) {
      caches.open(CACHE).then((c) => c.keys()).then((keys) => event.ports[0].postMessage({ version: VERSION, cached: keys.length, expected: PRECACHE.length }));
    }
  });

  self.addEventListener('fetch', (event) => {
    const req = event.request, url = new URL(req.url);
    if (req.method !== 'GET' || url.origin !== self.location.origin) return;       // never touch anything cross-origin
    event.respondWith((async () => {
      const hit = await caches.match(req, { cacheName: CACHE, ignoreSearch: true });
      if (hit) return hit;
      try { return await fetch(req); }
      catch (e) {
        if (req.mode === 'navigate') { const shell = await caches.match(new URL('./', self.registration.scope).href, { cacheName: CACHE }); if (shell) return shell; }
        return new Response('Offline and not saved on this device.', { status: 503, headers: { 'Content-Type': 'text/plain' } });
      }
    })());
  });
}
