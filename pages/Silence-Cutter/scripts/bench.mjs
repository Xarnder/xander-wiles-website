#!/usr/bin/env node
/**
 * Cross-platform benchmark runner. Drives the /spike harness in real Chrome (persistent profile so
 * downloaded models stay cached between runs) and writes a JSON record to bench-results/.
 *
 *   npm run build:bench            # production build with CrisperWhisper enabled
 *   npm run bench -- --file fixtures/local/apollo-2min-720p.mp4 --model crisperwhisper-2-turbo
 *
 * Options:
 *   --file <path>         video to analyse/transcribe/export (default: fixtures/local/apollo-2min-720p.mp4)
 *   --model <id>          ASR model id (see src/lib/asr/models.ts)
 *   --backend auto|webgpu|wasm
 *   --seconds <n>         only transcribe the first n seconds (default: whole file)
 *   --skip-asr | --skip-export
 *   --save-words          include the full transcript (with timestamps) in the JSON
 *   --headed              show the browser window
 *   --channel <name>      Playwright browser channel (default: chrome; use msedge on Windows if preferred)
 *
 * All processing happens inside the browser exactly as for a user; the script only reads the
 * metrics the page records.
 */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from '@playwright/test';

const root = path.resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const opt = (name, fallback) => {
	const i = args.indexOf(`--${name}`);
	return i >= 0 ? args[i + 1] : fallback;
};
const flag = (name) => args.includes(`--${name}`);

const file = path.resolve(root, opt('file', 'fixtures/local/apollo-2min-720p.mp4'));
const model = opt('model', 'crisperwhisper-2-turbo');
const backend = opt('backend', 'auto');
const seconds = opt('seconds') ? Number(opt('seconds')) : undefined;
const port = Number(opt('port', '4180'));
const channel = opt('channel', 'chrome');

const server = spawn(
	'npx',
	['vite', 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
	{
		cwd: root,
		stdio: ['ignore', 'pipe', 'inherit'],
		shell: process.platform === 'win32'
	}
);
await new Promise((resolve, reject) => {
	server.stdout.on('data', (d) => String(d).includes(String(port)) && resolve());
	server.on('exit', (code) =>
		reject(new Error(`preview server exited (${code}) — did you run npm run build:bench?`))
	);
	setTimeout(resolve, 8000);
});

const profile = path.join(root, 'bench-results', '.chrome-profile');
mkdirSync(profile, { recursive: true });
const context = await chromium.launchPersistentContext(profile, {
	channel,
	headless: !flag('headed'),
	viewport: { width: 1280, height: 900 },
	args: [
		'--enable-unsafe-webgpu',
		'--enable-gpu',
		'--ignore-gpu-blocklist',
		...(process.platform === 'darwin' ? ['--use-angle=metal'] : []),
		...(process.platform === 'win32' ? ['--use-angle=d3d11'] : [])
	]
});
const page = context.pages()[0] ?? (await context.newPage());
page.on('console', (m) => {
	if (m.type() === 'error' || m.type() === 'warning')
		console.log(`[browser ${m.type()}] ${m.text()}`);
});

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const result = {
	started: new Date().toISOString(),
	host: {
		platform: process.platform,
		arch: process.arch,
		cpus: os.cpus()[0]?.model,
		cores: os.cpus().length,
		memGB: os.totalmem() / 2 ** 30
	},
	file: path.relative(root, file),
	model,
	backend
};

try {
	await page.goto(`http://127.0.0.1:${port}/spike/`);
	await page.waitForFunction(() => window.__spike && window.__spike.metrics.capabilities);
	result.capabilities = await page.evaluate(() => window.__spike.metrics.capabilities);
	log('adapter', JSON.stringify(result.capabilities.adapter), 'webgpu', result.capabilities.webgpu);

	await page.setInputFiles('[data-testid=spike-file]', file);
	log('analysing', path.basename(file));
	await page.evaluate(() => window.__spike.analyse());
	result.analysis = await page.evaluate(() => window.__spike.metrics.analysis);
	if (!result.analysis) throw new Error(await page.textContent('[data-testid=spike-error]'));
	log(
		`decoded ${result.analysis.info.durationSeconds.toFixed(0)} s of audio in ${(result.analysis.decodeMs / 1000).toFixed(1)} s`
	);

	if (!flag('skip-asr')) {
		await page.evaluate(
			({ model, backend }) => {
				window.__spike.setModel(model);
				window.__spike.setBackend(backend);
			},
			{ model, backend }
		);
		log('loading model', model, backend);
		await page.evaluate(() => window.__spike.load());
		result.modelLoad = await page.evaluate(() => window.__spike.metrics.modelLoad);
		if (!result.modelLoad) throw new Error(await page.textContent('[data-testid=spike-error]'));
		log(
			`model ready in ${(result.modelLoad.loadMs / 1000).toFixed(1)} s (${result.modelLoad.backend}, downloaded ${(result.modelLoad.downloadedThisSession / 1e6).toFixed(0)} MB)`
		);
		const timer = setInterval(async () => {
			const p = await page.textContent('body').catch(() => '');
			const m = /Transcribing —[^\n]*/.exec(p ?? '');
			if (m) log(m[0]);
		}, 15000);
		await page.evaluate((s) => window.__spike.transcribe(s), seconds);
		clearInterval(timer);
		result.transcription = await page.evaluate(() => window.__spike.metrics.transcription);
		if (!result.transcription) throw new Error(await page.textContent('[data-testid=spike-error]'));
		result.transcriptSample = await page.evaluate(() =>
			window.__spike.words
				.slice(0, 80)
				.map((w) => w.text)
				.join(' ')
		);
		if (flag('save-words')) result.words = await page.evaluate(() => window.__spike.words);
		log(
			`transcribed ${result.transcription.audioSeconds.toFixed(0)} s at ${result.transcription.realTimeFactor.toFixed(2)}× real time, ${result.transcription.words} words`
		);
	}

	if (!flag('skip-export')) {
		log('exporting');
		await page.evaluate(() => window.__spike.exportTest());
		result.export = await page.evaluate(() => window.__spike.metrics.export);
		if (!result.export) throw new Error(await page.textContent('[data-testid=spike-error]'));
		log(
			`exported ${result.export.editedSeconds.toFixed(0)} s (${result.export.cuts} cuts) at ${result.export.speedX.toFixed(1)}× real time, ${(result.export.bytes / 1e6).toFixed(1)} MB`
		);
		await page.evaluate(async () => {
			const root = await navigator.storage.getDirectory();
			for await (const [name] of root.entries())
				if (name.startsWith('spike-export-')) await root.removeEntry(name);
		});
	}
} catch (err) {
	result.error = String(err?.message ?? err);
	console.error(result.error);
	process.exitCode = 1;
} finally {
	const out = path.join(
		root,
		'bench-results',
		`${new Date().toISOString().replace(/[:.]/g, '-')}-${process.platform}-${model}-${backend}.json`
	);
	writeFileSync(out, JSON.stringify(result, null, 2));
	log('wrote', path.relative(root, out));
	await context.close();
	server.kill();
}
