import { copyFileSync, mkdirSync } from 'node:fs';

// Keep the user-supplied root files as the source for development and builds.
const root = new URL('../', import.meta.url);
const iconsDest = new URL('../static/icons/', import.meta.url);
const staticDest = new URL('../static/', import.meta.url);

mkdirSync(iconsDest, { recursive: true });
mkdirSync(staticDest, { recursive: true });

const iconFiles = [
	'favicon.ico',
	'favicon.svg',
	'favicon-16x16.png',
	'favicon-32x32.png',
	'favicon-light.svg',
	'favicon-dark.svg',
	'apple-touch-icon.png',
	'android-chrome-192x192.png',
	'android-chrome-512x512.png'
];

for (const name of iconFiles) {
	copyFileSync(new URL(name, root), new URL(name, iconsDest));
}

for (const name of ['favicon.svg', 'favicon-dark.svg', 'favicon-light.svg', 'favicon.ico']) {
	copyFileSync(new URL(name, root), new URL(name, staticDest));
}

