const CACHE_NAME = 'md-editor-shell-v126';
const OWNED_PREFIX = 'md-editor-shell-';

const ASSETS = [
    './',
    './index.html',
    './style.css',
    './app.js',
    './auth.js',
    './config.js',
    './dates.js',
    './drive.js',
    './editor.js',
    './ui.js',
    './lists.js',
    './lists-ui.js',
    './list-import.js',
    './markdown.js',
    './search.js',
    './settings-sync.js',
    './revisions.js',
    './destructive.js',
    './revision-meta.js',
    './site.webmanifest',
    './favicon.ico?v=20260802',
    './apple-touch-icon.png',
    './Assets/SVGs/markdown-icon.svg',
    './Assets/SVGs/open-folder-outline-icon.svg',
    './Assets/SVGs/Up-ArrowIcons.svg',
    './Assets/SVGs/Down-ArrowIcons.svg',
    './Assets/SVGs/Left-ArrowIcons.svg',
    './Assets/SVGs/Right-ArrowIcons.svg',
    './Assets/SVGs/search.svg',
    './Assets/SVGs/import.svg',
    './Assets/SVGs/edit-2.svg',
    './Assets/SVGs/add-square.svg',
    './Assets/SVGs/bin.svg',
    './Assets/SVGs/copy.svg',
    './Assets/SVGs/rename.svg',
    './Assets/SVGs/menu.svg',
    './Assets/SVGs/save.svg',
    './Assets/SVGs/undo.svg',
    './Assets/SVGs/redo.svg',
    './Assets/SVGs/cross.svg',
    './history.js',
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
