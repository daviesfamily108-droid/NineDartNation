/* Simple service worker for basic offline support and PWA installability */
const CACHE_NAME = 'ndn-cache-v3-' + new Date().toISOString().slice(0, 10);
const URLS_TO_CACHE = [
  '/',
  '/index.html',
  '/dart-thrower.svg',
  '/manifest.webmanifest'
];

self.addEventListener('install', (event) => {
  self.skipWaiting(); // Force activation immediately
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(URLS_TO_CACHE))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE_NAME)
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim(); // Take control of all clients immediately
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Never cache-bust-breaking hashed Vite chunks via the SW.
  // If we cache these and a new deploy changes filenames, clients can end up
  // with an HTML document pointing at a new chunk while the SW serves a stale
  // cached chunk (or vice-versa) -> "Failed to fetch dynamically imported module".
  // Let the browser/network handle these with proper immutable cache headers.
  if (url.pathname.startsWith('/assets/')) {
    return;
  }

  // Network-first for HTML (navigation) requests to ensure fresh content
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  // Cache-first for assets
  event.respondWith(
    caches.match(event.request).then((cached) =>
      cached || fetch(event.request).catch(() => {
        // Fallback for SPA routing if asset missing? No, assets should 404 if missing.
        // Only fallback to index.html for navigation.
        return null; 
      })
    )
  );
});
