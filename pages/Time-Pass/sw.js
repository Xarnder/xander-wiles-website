const CACHE_NAME = 'time-pass-v41';
const OWNED_PREFIX = 'time-pass-';
const ASSETS = [
  './',
  './index.html',
  './site.webmanifest',
  './firebase-config.js',
  './styles/tokens.css',
  './styles/atmosphere.css',
  './styles/components.css',
  './js/main.js',
  './js/auth.js',
  './js/api.js',
  './js/store.js',
  './js/ui.js',
  './js/time-engine.js',
  './js/recurrence.js',
  './js/filters.js',
  './js/demo-events.js',
  './js/format.js',
  './js/constants.js',
  './js/calculator.js',
  './js/theme.js',
  './js/categories.js',
  './js/csv-import.js',
  './favicon.ico',
  './favicon-dark.svg',
  './favicon-light.svg',
  './apple-touch-icon.png',
  './android-chrome-192x192.png',
  './android-chrome-512x512.png',
  '/assets/SVGs/edit.svg',
  '/assets/SVGs/duplicate.svg',
  '/assets/SVGs/copy.svg',
  '/assets/SVGs/expand.svg',
  '/assets/SVGs/shrink.svg',
  '/assets/SVGs/Left-ArrowIcons.svg',
  '/assets/SVGs/home.svg',
  '/assets/SVGs/plus-icon.svg',
  '/assets/SVGs/Down-ArrowIcons.svg',
  '/assets/icons/close-icon.svg',
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      for (const url of ASSETS) {
        try {
          const res = await fetch(new Request(url, { cache: 'reload' }));
          if (res && res.status === 200) await cache.put(url, res.clone());
        } catch (err) {
          console.warn('[Time Pass SW] skip cache', url, err);
        }
      }
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k.startsWith(OWNED_PREFIX) && k !== CACHE_NAME)
          .map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const url = event.request.url;
  // Never intercept Firebase Auth / Firestore / Google identity
  if (
    url.includes('/__/auth/') ||
    url.includes('firestore.googleapis.com') ||
    url.includes('identitytoolkit.googleapis.com') ||
    url.includes('securetoken.googleapis.com') ||
    url.includes('googleapis.com/identitytoolkit') ||
    url.includes('gstatic.com/firebasejs')
  ) {
    return;
  }

  if (event.request.method !== 'GET') return;

  event.respondWith(
    (async () => {
      try {
        const network = await fetch(event.request);
        if (network && network.status === 200 && event.request.url.startsWith(self.location.origin)) {
          const cache = await caches.open(CACHE_NAME);
          cache.put(event.request, network.clone()).catch(() => {});
        }
        return network;
      } catch {
        const cached = await caches.match(event.request);
        if (cached) return cached;
        if (event.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
        throw new Error('Offline and not cached');
      }
    })()
  );
});
