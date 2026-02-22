const CACHE_NAME = 'taskmaster-v16';
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './style.css',
    '/assets/css/style.css',
    '/assets/js/nav-loader.js',
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
            .then(async (cache) => {
                console.log('[Service Worker] Caching all: app shell and content');
                for (const url of ASSETS_TO_CACHE) {
                    try {
                        const response = await fetch(new Request(url, { cache: 'reload' }));
                        if (!response || response.status !== 200) {
                            console.error('Failed to cache', url, response?.status);
                            continue;
                        }

                        let finalResponse = response;
                        if (response.redirected) {
                            const cloned = response.clone();
                            const newHeaders = new Headers();
                            cloned.headers.forEach((v, k) => newHeaders.append(k, v));
                            finalResponse = new Response(cloned.body, {
                                headers: newHeaders,
                                status: cloned.status,
                                statusText: cloned.statusText
                            });
                        }

                        await cache.put(url, finalResponse.clone());
                    } catch (err) {
                        console.error('Failed to cache', url, err);
                    }
                }
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

// Fetch Event - Network First for Navigation, Cache First for Assets
self.addEventListener('fetch', (event) => {
    // Ignore Firebase Auth endpoints to prevent redirect loops and SW interference
    if (event.request.url.includes('/__/auth/')) {
        return;
    }

    // Network-First for HTML/Navigation to avoid Safari PWA redirect caching errors
    if (event.request.mode === 'navigate') {
        event.respondWith(
            fetch(event.request)
                .then((response) => {
                    let finalResponse = response;
                    if (response.redirected) {
                        const cloned = response.clone();
                        finalResponse = new Response(cloned.body, {
                            headers: cloned.headers,
                            status: cloned.status,
                            statusText: cloned.statusText
                        });
                    }
                    // Cache the latest version
                    const responseToCache = finalResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseToCache));
                    return finalResponse;
                })
                .catch(() => {
                    // Fallback to cache if offline
                    return caches.match('./index.html').then(cached => {
                        return cached || caches.match('./');
                    });
                })
        );
        return;
    }

    // Cache-First for everything else
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

                            let finalResponse = response;
                            if (response.redirected) {
                                const cloned = response.clone();
                                const newHeaders = new Headers();
                                cloned.headers.forEach((v, k) => newHeaders.append(k, v));
                                finalResponse = new Response(cloned.body, {
                                    headers: newHeaders,
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
                    ).catch(err => {
                        console.error('Fetch failed for', event.request.url, err);
                        // If it fails (offline) and not in cache, we just return empty or let it fail naturally
                        // But CSS failing shouldn't crash the JS loop.
                    });
                })
        );
    }
});
