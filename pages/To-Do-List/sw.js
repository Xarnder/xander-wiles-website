const CACHE_NAME = 'taskmaster-v6';
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
    './site.webmanifest',
    './favicon.ico',
    './favicon-light.svg',
    './favicon-dark.svg',
    'https://cdnjs.cloudflare.com/ajax/libs/Sortable/1.15.0/Sortable.min.js',
    'https://unpkg.com/@phosphor-icons/web',
    'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js',
    'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js',
    'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js'
];

// Install Event
self.addEventListener('install', (event) => {
    // Force this service worker to become the active service worker
    self.skipWaiting();

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
    // Force this service worker to become the controller for all clients
    event.waitUntil(clients.claim());

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
    // Check if the request is for an item in our asset list
    const isStaticAsset = ASSETS_TO_CACHE.some(asset => event.request.url.includes(asset.replace('./', '')));
    const isSelf = event.request.url.startsWith(self.location.origin);
    const isFirebase = event.request.url.includes('gstatic.com/firebasejs');

    if ((isSelf || isStaticAsset || isFirebase) && event.request.method === 'GET') {
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
                            if (!response || response.status !== 200 || response.type !== 'basic' && response.type !== 'cors') {
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
