import { copyFileSync, mkdirSync } from 'node:fs';

// Keep the user-supplied root files as the source for development and builds.
const destination = new URL('../static/icons/', import.meta.url);
mkdirSync(destination, { recursive: true });
for (const name of [
	'favicon.ico',
	'favicon-16x16.png',
	'favicon-32x32.png',
	'favicon-light.svg',
	'favicon-dark.svg',
	'apple-touch-icon.png',
	'android-chrome-192x192.png',
	'android-chrome-512x512.png'
]) {
	copyFileSync(
		new URL(`../${name}`, import.meta.url),
		new URL(name, destination)
	);
}
