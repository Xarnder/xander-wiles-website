const CACHE_NAME = 'taskmaster-todo-v119';
const OWNED_CACHE_PREFIXES = ['taskmaster-todo-', 'taskmaster-v'];
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './style.css',
    './main.js',
    './api.js',
    './store.js',
    './ui.js',
    './nested.js',
    './tags.js',
    './kanban.js',
    './category-dropup.js',
    './task-import.js',
    './utils.js',
    './local-ai.js',
    '/assets/js/local-llm.js',
    './firebase-config.js',
    './site.webmanifest',
    './favicon.ico',
    './favicon-light.svg',
    './favicon-dark.svg',
    'https://cdnjs.cloudflare.com/ajax/libs/Sortable/1.15.0/Sortable.min.js',
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
                    if (cacheName !== CACHE_NAME && OWNED_CACHE_PREFIXES.some(prefix => cacheName.startsWith(prefix))) {
                        console.log('[Service Worker] Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
});

// Fetch Event - Network First for Navigation + core JS, Cache First for other assets
self.addEventListener('fetch', (event) => {
    // Ignore Firebase Auth endpoints to prevent redirect loops and SW interference
    if (event.request.url.includes('/__/auth/')) {
        return;
    }

    const cachePut = (request, response) => {
        if (!request.url.startsWith('http')) return;
        const responseToCache = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
            try {
                cache.put(request, responseToCache);
            } catch (e) { /* ignore scheme errors */ }
        });
    };

    const unwrapRedirect = async (response) => {
        if (!response || !response.redirected) return response;
        const cloned = response.clone();
        const newHeaders = new Headers();
        cloned.headers.forEach((v, k) => newHeaders.append(k, v));
        return new Response(cloned.body, {
            headers: newHeaders,
            status: cloned.status,
            statusText: cloned.statusText
        });
    };

    // Network-First for HTML/Navigation to avoid Safari PWA redirect caching errors
    if (event.request.mode === 'navigate') {
        event.respondWith(
            fetch(event.request)
                .then(async (response) => {
                    const finalResponse = await unwrapRedirect(response);
                    cachePut(event.request, finalResponse);
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

    // Network-first for core app JS so tag/migration fixes reach installed PWAs
    // instead of staying stuck on a stale cache-first shell.
    const NETWORK_FIRST_JS = [
        'main.js',
        'api.js',
        'tags.js',
        'store.js',
        'ui.js',
        'nested.js',
        'kanban.js',
        'category-dropup.js',
        'task-import.js',
        'utils.js',
        'firebase-config.js',
        'sw.js',
        'style.css'
    ];
    // Match only this app's own files. A substring check would also catch the
    // Phosphor icon stylesheets, which are named style.css on the CDN.
    const appScopePath = new URL('./', self.registration.scope).pathname;
    const isCoreAppJs = NETWORK_FIRST_JS.some((file) => {
        let url;
        try { url = new URL(event.request.url); } catch (_) { return false; }
        return url.origin === self.location.origin
            && url.pathname.startsWith(appScopePath)
            && url.pathname.endsWith('/' + file);
    });

    if (isCoreAppJs && event.request.method === 'GET') {
        event.respondWith(
            fetch(new Request(event.request, { cache: 'no-store' }))
                .then(async (response) => {
                    if (!response || response.status !== 200) {
                        throw new Error('Network response not ok');
                    }
                    const finalResponse = await unwrapRedirect(response);
                    cachePut(event.request, finalResponse);
                    return finalResponse;
                })
                .catch(() => caches.match(event.request))
        );
        return;
    }

    // Cache-First for everything else. External icon CSS/fonts are left to the
    // browser; matching them here was dropping the font on some loads.
    const isStaticAsset = ASSETS_TO_CACHE.some(asset => {
        if (!asset.startsWith('http')) return false;
        return event.request.url === asset || event.request.url.startsWith(asset + '?');
    });
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
                        async (response) => {
                            // Check if we received a valid response
                            if (!response || response.status !== 200 || (response.type !== 'basic' && response.type !== 'cors')) {
                                return response;
                            }

                            const finalResponse = await unwrapRedirect(response);
                            cachePut(event.request, finalResponse);
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
