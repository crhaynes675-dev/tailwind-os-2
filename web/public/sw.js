/* Tailwind OS service worker — app shell only.
 *
 * Purpose is narrow: a crew who reloads (or reopens) with no signal should
 * still get the app, instead of the browser's offline page. Data is NOT cached
 * here — stale job data shown as current is worse than no data, and pending
 * writes are already handled durably by the outbox.
 */
const CACHE = 'os3-shell-v1';

self.addEventListener('install', (event) => {
  // The shell is hashed at build time, so precaching a fixed list would go
  // stale on every deploy. Warm only the entry point and fill in on demand.
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(['/'])).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // Never touch the API or S3 — those must always hit the network so the app
  // can tell the difference between "offline" and "no results".
  if (url.origin !== self.location.origin) return;

  // Navigations: network first, cached shell as the fallback.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('/', copy));
          return res;
        })
        .catch(() => caches.match('/').then((r) => r || Response.error())),
    );
    return;
  }

  // Build assets are content-hashed, so a cache hit is always correct.
  if (/\/assets\/|\.(?:js|css|woff2?|png|jpe?g|svg|ico)$/.test(url.pathname)) {
    event.respondWith(
      caches.match(req).then((hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        }),
      ),
    );
  }
});
