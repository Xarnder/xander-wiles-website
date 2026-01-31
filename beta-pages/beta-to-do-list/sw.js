const CACHE_NAME = 'taskmaster-v1';
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './style.css',
    './main.js',
    './api.js',
    './store.js',
    './ui.js',
    './utils.js',
    './firebase-config.js',
    './favicon.ico',
    './favicon-light.svg',
    './favicon-dark.svg',
    'https://cdnjs.cloudflare.com/ajax/libs/Sortable/1.15.0/Sortable.min.js',
    'https://unpkg.com/@phosphor-icons/web'
];

// Install Event
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('[Service Worker] Caching all: app shell and content');
                return cache.addAll(ASSETS_TO_CACHE);
            })
    );
});

// Activate Event - Cleanup old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('[Service Worker] Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
});

// Fetch Event - Cache First, then Network
self.addEventListener('fetch', (event) => {
    // Skip cross-origin requests like Firebase SDKs or API calls initially
    // We want to rely on Firebase's persistence for data.
    // However, we DO want to cache our static assets and the specific CDNs we listed.

    // Check if the request is for an item in our asset list (by simple string match or domain)
    const isStaticAsset = ASSETS_TO_CACHE.some(asset => event.request.url.includes(asset.replace('./', '')));
    const isSelf = event.request.url.startsWith(self.location.origin);

    if (isSelf || isStaticAsset) {
        event.respondWith(
            caches.match(event.request)
                .then((response) => {
                    // Cache hit - return response
                    if (response) {
                        return response;
                    }
                    return fetch(event.request).then(
                        (response) => {
                            // Check if we received a valid response
                            if (!response || response.status !== 200 || response.type !== 'basic') {
                                return response;
                            }

                            // Clone the response
                            const responseToCache = response.clone();

                            caches.open(CACHE_NAME)
                                .then((cache) => {
                                    cache.put(event.request, responseToCache);
                                });

                            return response;
                        }
                    );
                })
        );
    }
});
