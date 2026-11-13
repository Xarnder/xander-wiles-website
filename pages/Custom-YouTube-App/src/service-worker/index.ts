/// <reference types="@sveltejs/kit" />
import { version } from '$app/env';
import { assets, immutable, prerendered } from '$app/manifest';
import { self } from '$app/service-worker';

const CACHE = `playlist-deck-${version}`;
const ASSETS = [...immutable, ...assets, ...prerendered].map(
	({ path }) => new URL(path.replace(/^\//, ''), self.registration.scope).href
);
const BYPASS_HOSTS = [
	'googleapis.com',
	'gstatic.com',
	'google.com',
	'accounts.google.com',
	'youtube.com',
	'youtu.be',
	'ytimg.com',
	'ggpht.com',
	'googleusercontent.com'
];

function shouldBypass(url: URL): boolean {
	return BYPASS_HOSTS.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`));
}

self.addEventListener('install', (event) => {
	event.waitUntil(
		caches
			.open(CACHE)
			.then((cache) => cache.addAll(ASSETS))
			.then(() => self.skipWaiting())
	);
});

self.addEventListener('activate', (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) =>
				Promise.all(
					keys
						.filter((key) => key.startsWith('playlist-deck-') && key !== CACHE)
						.map((key) => caches.delete(key))
				)
			)
			.then(() => self.clients.claim())
	);
});

self.addEventListener('fetch', (event) => {
	const request = event.request;
	if (request.method !== 'GET') return;

	const url = new URL(request.url);
	if (shouldBypass(url)) return;

	if (request.mode === 'navigate') {
		event.respondWith(fetch(request).catch(() => caches.match('/') as Promise<Response>));
		return;
	}

	if (url.origin !== self.location.origin) return;

	event.respondWith(
		caches.match(request).then((cached) => {
			if (cached) return cached;
			return fetch(request).then((response) => {
				if (response.ok) {
					const copy = response.clone();
					void caches.open(CACHE).then((cache) => cache.put(request, copy));
				}
				return response;
			});
		})
	);
});
