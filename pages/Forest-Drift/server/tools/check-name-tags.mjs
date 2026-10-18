/** GPU regression: render the actual avatar and High-quality graphics pipeline from every side. */
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

const root = fileURLToPath(new URL('../../', import.meta.url));
const output = resolve(root, 'test-results/name-tags');
await mkdir(output, { recursive: true });
const bundle = await build({
	absWorkingDir: root,
	entryPoints: ['tests/fixtures/name-tag-rendering.ts'],
	bundle: true,
	platform: 'browser',
	format: 'iife',
	write: false
});
const server = createServer((req, res) => {
	res.setHeader('Content-Type', req.url === '/test.js' ? 'text/javascript' : 'text/html');
	res.end(
		req.url === '/test.js'
			? bundle.outputFiles[0].text
			: '<!doctype html><body><script src="/test.js"></script></body>'
	);
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ headless: true });
try {
	const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
	const errors = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await page.goto(`http://127.0.0.1:${server.address().port}`);
	await page.waitForFunction(() => typeof window.renderNameTag === 'function');
	const cases = [
		['front', Math.PI, 0],
		['behind', 0, 0],
		['left', -Math.PI / 2, 0],
		['right', Math.PI / 2, 0],
		['turned-avatar', 0, Math.PI]
	];
	const results = [];
	for (const [name, angle, yaw] of cases) {
		const result = await page.evaluate(
			([angle, yaw]) => window.renderNameTag(angle, yaw, true),
			[angle, yaw]
		);
		await page.screenshot({ path: resolve(output, `${name}.png`) });
		assert.equal(result.aoEnabled, true, 'must exercise High quality ambient occlusion');
		assert.ok(
			result.white > 40,
			`${name}: name text must remain visible (${result.white} white pixels)`
		);
		results.push({ name, ...result });
	}
	// Control case deliberately omits the exclusion to confirm the original failure is covered.
	const control = await page.evaluate(() => window.renderNameTag(0, 0, false));
	await page.screenshot({ path: resolve(output, 'without-fix.png') });
	assert.ok(
		control.white < results[1].white / 2,
		'control should reproduce the dark name card from behind'
	);
	assert.deepEqual(errors, []);
	console.log(JSON.stringify({ passed: true, results, withoutFix: control, screenshots: output }));
} finally {
	await browser.close();
	await new Promise((resolve) => server.close(resolve));
}
