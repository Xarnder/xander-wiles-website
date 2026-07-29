const CACHE_NAME = 'md-editor-shell-v10';
const OWNED_PREFIX = 'md-editor-shell-';

const ASSETS = [
    './',
    './index.html',
    './style.css',
    './app.js',
    './auth.js',
    './config.js',
    './drive.js',
    './editor.js',
    './ui.js',
    './site.webmanifest',
    './favicon-dark.svg',
    './favicon-light.svg',
    './apple-touch-icon.png',
    './Assets/SVGs/markdown-icon.svg',
    './Assets/SVGs/open-folder-outline-icon.svg',
];

self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then(async (cache) => {
            for (const url of ASSETS) {
                try {
                    const response = await fetch(new Request(url, { cache: 'reload' }));
                    if (response && response.ok) {
                        await cache.put(url, response.clone());
                    }
                } catch (err) {
                    console.warn('[md-editor sw] failed to cache', url, err);
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
                    .filter((key) => key.startsWith(OWNED_PREFIX) && key !== CACHE_NAME)
                    .map((key) => caches.delete(key))
            );
            await self.clients.claim();
        })()
    );
});

self.addEventListener('fetch', (event) => {
    const { request } = event;
    if (request.method !== 'GET') return;

    const url = new URL(request.url);

    // Never cache Google / Drive API responses
    if (
        url.hostname.includes('googleapis.com') ||
        url.hostname.includes('google.com') ||
        url.hostname.includes('gstatic.com')
    ) {
        return;
    }

    // App shell: cache-first for same-origin page assets
    if (url.origin === self.location.origin) {
        event.respondWith(
            caches.match(request).then((cached) => {
                if (cached) return cached;
                return fetch(request)
                    .then((response) => {
                        if (response && response.ok && request.url.includes('/pages/Markdown-Editor/')) {
                            const copy = response.clone();
                            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
                        }
                        return response;
                    })
                    .catch(() => cached);
            })
        );
    }
});
