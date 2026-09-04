import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function copyCore(pkg, destName) {
	const esm = join(root, 'node_modules', pkg, 'dist', 'esm');
	const dest = join(root, 'static', 'ffmpeg', destName);
	mkdirSync(dest, { recursive: true });

	for (const file of ['ffmpeg-core.js', 'ffmpeg-core.wasm', 'ffmpeg-core.worker.js']) {
		const src = join(esm, file);
		if (existsSync(src)) {
			cpSync(src, join(dest, file));
		}
	}
}

copyCore('@ffmpeg/core', 'core');
copyCore('@ffmpeg/core-mt', 'core-mt');
console.log('Copied FFmpeg WASM cores to static/ffmpeg');
