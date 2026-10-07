/**
 * Opt-in integration test with a REAL on-device model (`npm run test:asr`). Downloads the model
 * on first run (cached afterwards in the browser profile), so it is excluded from normal runs.
 *
 *   ASR_MODEL=whisper-base npm run test:asr            # ~150 MB, commercially usable, not verbatim
 *   ASR_MODEL=crisperwhisper-2-turbo npm run test:asr  # ~900 MB, verbatim (non-commercial licence)
 *   ASR_FILE=fixtures/local/apollo-2min-720p.mp4 …     # any local recording with speech
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- driving the page's test hooks */
import { expect, test } from '@playwright/test';
import path from 'node:path';

test.skip(!process.env.ASR_INTEGRATION, 'set ASR_INTEGRATION=1 (npm run test:asr) to run');

test('real ASR produces timestamped words on-device', async ({ page }) => {
	const model = process.env.ASR_MODEL ?? 'whisper-base';
	const file = path.resolve(
		import.meta.dirname,
		'..',
		process.env.ASR_FILE ?? 'fixtures/local/apollo-2min-720p.mp4'
	);
	await page.goto('/spike/');
	await page.waitForFunction(() => (window as unknown as { __spike?: unknown }).__spike);
	await page.setInputFiles('[data-testid=spike-file]', file);
	await page.evaluate(() => (window as any).__spike.analyse());
	await page.evaluate((m) => (window as any).__spike.setModel(m), model);
	await page.evaluate(() => (window as any).__spike.load());
	await page.evaluate(() => (window as any).__spike.transcribe(60));
	const words = (await page.evaluate(() => (window as any).__spike.words)) as Array<{
		start: number;
		end: number;
		text: string;
	}>;
	expect(words.length).toBeGreaterThan(20);
	for (let i = 1; i < words.length; i++) {
		expect(words[i].start).toBeGreaterThanOrEqual(words[i - 1].start);
		expect(words[i].end).toBeGreaterThanOrEqual(words[i].start);
	}
	expect(words[words.length - 1].end).toBeLessThanOrEqual(61);
	console.log(words.map((w) => w.text).join(' '));
});
