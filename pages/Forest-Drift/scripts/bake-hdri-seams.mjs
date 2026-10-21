/** Offline-only Gaussian seam bake. Run: node scripts/bake-hdri-seams.mjs (requires cwebp). */
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const assetDirectory = fileURLToPath(new URL('../assets/HDRI/', import.meta.url));
const temporaryDirectory = await mkdtemp(join(tmpdir(), 'forest-hdri-seams-'));
const browser = await chromium.launch();
try {
	const page = await browser.newPage();
	for (const name of ['Sunny', 'Moody']) {
		const input = await readFile(join(assetDirectory, `Cloudscape ${name}.webp`));
		const encoded = await page.evaluate(async (base64) => {
			const image = new Image();
			image.src = `data:image/webp;base64,${base64}`;
			await image.decode();
			const width = image.naturalWidth;
			const height = image.naturalHeight;
			const canvas = document.createElement('canvas');
			canvas.width = width;
			canvas.height = height;
			const context = canvas.getContext('2d');
			context.drawImage(image, 0, 0);
			const pixels = context.getImageData(0, 0, width, height);
			const source = new Uint8ClampedArray(pixels.data);
			const band = 64;
			const sigma = 18;
			const radius = Math.ceil(sigma * 3);
			const kernel = Array.from({ length: radius * 2 + 1 }, (_, index) =>
				Math.exp(-((index - radius) ** 2) / (2 * sigma ** 2))
			);
			const total = kernel.reduce((sum, value) => sum + value, 0);
			for (let index = 0; index < kernel.length; index++) kernel[index] /= total;
			const stripWidth = band * 2;
			const horizontal = new Float32Array(stripWidth * height * 3);
			// Horizontal convolution wraps across the panorama join. Never wrap the vertical poles.
			for (let y = 0; y < height; y++) {
				for (let column = 0; column < stripWidth; column++) {
					const x = (width - band + column) % width;
					for (let offset = -radius; offset <= radius; offset++) {
						const inputIndex = (y * width + ((x + offset + width) % width)) * 4;
						const outputIndex = (y * stripWidth + column) * 3;
						const weight = kernel[offset + radius];
						for (let channel = 0; channel < 3; channel++) {
							horizontal[outputIndex + channel] += source[inputIndex + channel] * weight;
						}
					}
				}
			}
			for (let y = 0; y < height; y++) {
				for (let column = 0; column < stripWidth; column++) {
					const x = (width - band + column) % width;
					const distance = Math.min(x, width - 1 - x);
					const t = Math.min(1, distance / (band - 1));
					const feather = 1 - t * t * (3 - 2 * t);
					const outputIndex = (y * width + x) * 4;
					for (let channel = 0; channel < 3; channel++) {
						let blurred = 0;
						for (let offset = -radius; offset <= radius; offset++) {
							const row = Math.max(0, Math.min(height - 1, y + offset));
							blurred +=
								horizontal[(row * stripWidth + column) * 3 + channel] * kernel[offset + radius];
						}
						pixels.data[outputIndex + channel] = Math.round(
							source[outputIndex + channel] * (1 - feather) + blurred * feather
						);
					}
				}
			}
			context.putImageData(pixels, 0, 0);
			return canvas.toDataURL('image/png').split(',')[1];
		}, input.toString('base64'));
		const png = join(temporaryDirectory, `${name}.png`);
		await writeFile(png, Buffer.from(encoded, 'base64'));
		const output = join(assetDirectory, `Cloudscape ${name} Seamless.webp`);
		execFileSync('cwebp', ['-quiet', '-q', '95', '-m', '6', '-sharp_yuv', png, '-o', output]);
		console.log(`Saved ${output}`);
	}
} finally {
	await browser.close();
	await rm(temporaryDirectory, { recursive: true, force: true });
}
