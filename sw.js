/* Service worker: precaches the whole app shell (pages, code, data, encrypted details, fonts, icons) so it works offline.
   scripts/build.js replaces the two placeholders below: a version hash of the build and the list of files.
   Caches are versioned: a new build gets a new cache, and old ones are deleted once it activates.
   Only ciphertext is ever cached. Decrypted details exist in page memory only.
   The blog is cached separately, so a new post never forces an app update:
     blog/posts.json   network first (so new posts appear without a redeploy), the saved copy when offline or slow
     blog/photos/**    cache first, in a versioned cache of its own (bump BLOG_PHOTOS to start over) */
const VERSION = '434ccee80f';
const PRECACHE = [
 "./",
 "app.js",
 "blog.js",
 "clock.js",
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
const BLOG_DATA = 'trip-blog-data-v1', BLOG_PHOTOS = 'trip-blog-photos-v1';   // blog.js uses the same names
const POSTS_WAIT_MS = 5000;                                                    // on a bad connection, show the saved posts after this long

if (VERSION.startsWith('__')) {
  /* unbuilt dev copy (served straight from src/): do nothing, so development is never served from a stale cache */
} else {
  self.addEventListener('install', (event) => {
    /* No skipWaiting here: an update waits until the person taps "Reload" in the app, so a page is never swapped mid-use. */
    event.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE.map((u) => new Request(u, { cache: 'reload' })))));
  });

  self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
      for (const k of await caches.keys()) {
        if ((k.startsWith('trip-shell-') && k !== CACHE) || (k.startsWith('trip-blog-data-') && k !== BLOG_DATA) || (k.startsWith('trip-blog-photos-') && k !== BLOG_PHOTOS)) await caches.delete(k);
      }
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

  const scopePath = new URL('./', self.registration.scope).pathname;

  /* posts.json: the network when it answers in time (and remember it); otherwise the saved copy, marked so the page can say "offline" */
  async function postsFirst(req, event) {
    const cache = await caches.open(BLOG_DATA), key = new Request(new URL('blog/posts.json', self.registration.scope).href);
    const net = fetch(new Request(req, { cache: 'no-cache' })).then(async (res) => { if (res.ok) await cache.put(key, res.clone()); return res; });
    event.waitUntil(net.catch(() => {}));
    const saved = async () => {
      const hit = await cache.match(key); if (!hit) return null;
      const h = new Headers(hit.headers); h.set('x-trip-from-cache', '1');
      return new Response(hit.body, { status: hit.status, statusText: hit.statusText, headers: h });
    };
    const timer = new Promise((r) => setTimeout(() => r(null), POSTS_WAIT_MS));
    try { const first = await Promise.race([net, timer]); if (first) return first; return (await saved()) || await net; }
    catch (e) { return (await saved()) || new Response('Offline and no posts saved on this device yet.', { status: 503, headers: { 'Content-Type': 'text/plain' } }); }
  }
  /* photos and thumbnails: whatever is saved, else fetch once and keep it */
  async function photoFirst(req) {
    const cache = await caches.open(BLOG_PHOTOS), hit = await cache.match(req.url);
    if (hit) return hit;
    try { const res = await fetch(req); if (res.ok && res.status === 200) await cache.put(req.url, res.clone()); return res; }
    catch (e) { return new Response('Offline and this photo is not saved on this device.', { status: 503, headers: { 'Content-Type': 'text/plain' } }); }
  }

  self.addEventListener('fetch', (event) => {
    const req = event.request, url = new URL(req.url);
    if (req.method !== 'GET' || url.origin !== self.location.origin) return;       // never touch anything cross-origin
    if (url.pathname === scopePath + 'blog/posts.json') { event.respondWith(postsFirst(req, event)); return; }
    if (url.pathname.startsWith(scopePath + 'blog/photos/')) { event.respondWith(photoFirst(req)); return; }
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
