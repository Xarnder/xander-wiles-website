const CACHE_NAME = 'taskmaster-v12';
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
                return Promise.all(
                    ASSETS_TO_CACHE.map((url) => {
                        return cache.add(new Request(url, { cache: 'reload' }))
                            .catch(err => console.error('Failed to cache', url, err));
                    })
                );
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
    // Ignore Firebase Auth endpoints to prevent redirect loops and SW interference
    if (event.request.url.includes('/__/auth/')) {
        return;
    }

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
                            if (!response || response.status !== 200 || (response.type !== 'basic' && response.type !== 'cors')) {
                                return response;
                            }

                            // Safari PWA Fix: "Response served by service worker has redirections"
                            // Safari drops responses with redirected: true for navigation and other critical requests.
                            let finalResponse = response;
                            if (response.redirected) {
                                const cloned = response.clone();
                                finalResponse = new Response(cloned.body, {
                                    headers: cloned.headers,
                                    status: cloned.status,
                                    statusText: cloned.statusText
                                });
                            }

                            // Clone the response
                            const responseToCache = finalResponse.clone();

                            caches.open(CACHE_NAME)
                                .then((cache) => {
                                    cache.put(event.request, responseToCache);
                                });

                            return finalResponse;
                        }
                    );
                })
        );
    }
});
