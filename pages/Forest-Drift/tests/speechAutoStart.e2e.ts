import { expect, test } from '@playwright/test';
import { createAndEnterWorld } from './worldHelpers';
import { observeAudio, probe } from './speechHelpers';
import { lessons, TUTORIAL_VERSION } from '../src/lib/game/tutorials/tutorials';
import { phrases } from '../src/lib/game/speech/types';
import type { Route } from '@playwright/test';

test('one click downloads and speaks on a device rendering at 25 FPS', async ({ page }) => {
	test.skip(process.env.FOREST_SPEECH_MODEL !== '1', 'Opt-in real model validation');
	test.setTimeout(150_000);
	await observeAudio(page);
	const downloads: string[] = [];
	page.on('request', (request) => {
		if (request.url().includes('huggingface.co/gradium/phonon-31m-en/'))
			downloads.push(request.url());
	});
	await page.goto('/');
	await createAndEnterWorld(page);
	await page.evaluate(() => {
		const request = window.requestAnimationFrame.bind(window);
		const cancel = window.cancelAnimationFrame.bind(window);
		const frames = new Map<number, number>();
		let id = 0;
		window.requestAnimationFrame = (callback) => {
			const key = --id;
			const started = performance.now();
			const next = (time: number) => {
				if (time - started < 40) frames.set(key, request(next));
				else {
					frames.delete(key);
					callback(time);
				}
			};
			frames.set(key, request(next));
			return key;
		};
		window.cancelAnimationFrame = (key) => {
			cancel(frames.get(key) ?? key);
			frames.delete(key);
		};
	});
	await page.getByTestId('tutorial-auto-start').click();
	await expect(page.getByTestId('tutorial-menu')).toBeHidden();
	await expect(page.getByTestId('tutorial-preparation-status')).toBeVisible();
	await expect(page.getByTestId('tutorial-subtitle')).toContainText('Click the world', {
		timeout: 60_000
	});
	expect(downloads).toHaveLength(4);
	expect((await probe(page)).audible).toBeGreaterThan(0);
	await expect(page.getByTestId('tutorial-subtitle')).toContainText('Use W', { timeout: 45_000 });
	expect((await probe(page)).maxActive).toBe(1);
	await page.getByRole('button', { name: 'Close', exact: true }).click();
	await expect.poll(async () => (await probe(page)).active).toBe(0);
});

test('one click speaks the entire tutorial and finishes without further input', async ({
	page
}) => {
	test.skip(process.env.FOREST_SPEECH_FULL !== '1', 'Opt-in full real-time narration');
	test.setTimeout(1_200_000);
	await observeAudio(page);
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await page.goto('/');
	await createAndEnterWorld(page);
	await page.keyboard.press('F6');
	await page.getByLabel('Auto pause between instructions (seconds)').fill('0');
	// Only this click starts the cold download and playback. All later steps are passive checks.
	await page.getByRole('button', { name: 'Auto start tutorial (F8)', exact: true }).click();
	await expect(page.getByTestId('tutorial-menu')).toBeHidden();
	const catalogue = lessons(false);
	for (const [index, lesson] of catalogue.entries()) {
		await expect(page.getByTestId('tutorial-subtitle')).toHaveText(phrases(lesson.text)[0], {
			timeout: 120_000
		});
		await expect(page.getByRole('navigation', { name: 'Tutorial controls' })).toContainText(
			`${index + 1} / ${catalogue.length}`
		);
		console.log(`PHONON_AUTO ${index + 1}/${catalogue.length}: ${lesson.id}`);
	}
	await expect(page.getByRole('navigation', { name: 'Tutorial controls' })).toBeHidden({
		timeout: 60_000
	});
	const audio = await probe(page);
	expect(audio.started).toBe(
		catalogue.reduce((count, lesson) => count + phrases(lesson.text).length, 0)
	);
	expect(audio.audible).toBe(audio.started);
	expect(audio.maxActive).toBe(1);
	expect(audio.active).toBe(0);
	expect(errors).toEqual([]);
	expect(
		await page.evaluate(
			() => JSON.parse(localStorage.getItem('forest-drift.tutorials.v1')!).finished
		)
	).toEqual(
		catalogue.map(
			(lesson) =>
				`${TUTORIAL_VERSION}:${lesson.id}:${lesson.action === 'continue' ? 'completed' : 'skipped'}`
		)
	);
});

test('Replay and navigation recover audio suspended by the browser', async ({ page }) => {
	test.skip(process.env.FOREST_SPEECH_MODEL !== '1', 'Opt-in real model validation');
	test.setTimeout(180_000);
	await observeAudio(page);
	await page.goto('/');
	await createAndEnterWorld(page);
	await page.keyboard.press('F8');
	await expect(page.getByTestId('tutorial-subtitle')).toContainText('Click the world', {
		timeout: 90_000
	});
	for (const action of ['Replay', 'F9', 'F7']) {
		await page.evaluate(() =>
			(window as unknown as { suspendNarrator: () => Promise<void[]> }).suspendNarrator()
		);
		await expect(page.getByTestId('tutorial-preparation-status')).toContainText(
			'could not be played'
		);
		const before = (await probe(page)).started;
		if (action === 'Replay')
			await page.getByRole('button', { name: 'Replay', exact: true }).click();
		else await page.keyboard.press(action);
		await expect
			.poll(async () => (await probe(page)).started, { timeout: 15_000 })
			.toBeGreaterThan(before);
		await expect(page.getByTestId('tutorial-subtitle')).toContainText(
			action === 'F9' ? 'Use W' : 'Click the world'
		);
		await expect(page.getByTestId('tutorial-preparation-status')).toBeHidden();
	}
	await page.getByRole('button', { name: 'Close', exact: true }).click();
	expect((await probe(page)).maxActive).toBe(1);
});

test('automatic download retries an interruption and one-click start reuses offline speech', async ({
	page
}) => {
	test.skip(process.env.FOREST_SPEECH_MODEL !== '1', 'Opt-in real model validation');
	test.setTimeout(180_000);
	await observeAudio(page);
	let attempts = 0;
	await page.route('https://huggingface.co/**/model.q8.gguf', async (route) => {
		if (++attempts === 1) await route.fulfill({ status: 503, body: 'Temporary test interruption' });
		else await route.continue();
	});
	await page.goto('/');
	await createAndEnterWorld(page);
	await page.getByTestId('tutorial-auto-start').click();
	await expect(page.getByTestId('tutorial-subtitle')).toContainText('Click the world', {
		timeout: 90_000
	});
	expect(attempts).toBe(2);
	expect((await probe(page)).audible).toBeGreaterThan(0);
	await page.getByRole('button', { name: 'Close', exact: true }).click();
	await page.unroute('https://huggingface.co/**/model.q8.gguf');
	const offlineRequests: string[] = [];
	await page.route('https://**', (route) => {
		offlineRequests.push(route.request().url());
		return route.abort('internetdisconnected');
	});
	await page.reload();
	await createAndEnterWorld(page, { name: 'Offline speech' });
	await page.getByTestId('tutorial-auto-start').click();
	await expect(page.getByTestId('tutorial-subtitle')).toContainText('Click the world');
	await expect(page.getByTestId('tutorial-subtitle')).toContainText('Use W', { timeout: 45_000 });
	expect((await probe(page)).audible).toBeGreaterThan(1);
	expect(offlineRequests).toEqual([]);
	await page.getByRole('button', { name: 'Close', exact: true }).click();
});

test.describe('touch automatic speech', () => {
	test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });
	test('one tap can cancel a cold download, then restart and speak touch instructions', async ({
		page
	}) => {
		test.skip(process.env.FOREST_SPEECH_MODEL !== '1', 'Opt-in real model validation');
		test.setTimeout(180_000);
		await observeAudio(page);
		const held: Route[] = [];
		await page.route('https://huggingface.co/**', (route) => {
			held.push(route);
		});
		await page.goto('/');
		await createAndEnterWorld(page);
		await page.getByTestId('tutorial-auto-start').tap();
		await expect.poll(() => held.length).toBeGreaterThan(0);
		await page.getByRole('button', { name: 'Close', exact: true }).tap();
		await expect(page.getByTestId('tutorial-preparation-status')).toBeHidden();
		await expect(page.getByRole('navigation', { name: 'Tutorial controls' })).toBeHidden();
		expect((await probe(page)).started).toBe(0);
		await page.unroute('https://huggingface.co/**');
		await Promise.all(held.map((route) => route.abort().catch(() => {})));
		await page.getByTestId('tutorial-auto-start').tap();
		await expect(page.getByTestId('tutorial-subtitle')).toContainText('Swipe on the right side', {
			timeout: 90_000
		});
		await expect(page.getByTestId('tutorial-menu')).toBeHidden();
		expect((await probe(page)).audible).toBeGreaterThan(0);
		await expect(page.getByTestId('tutorial-subtitle')).toContainText('Use the left joystick', {
			timeout: 45_000
		});
		await page.getByRole('button', { name: 'Close', exact: true }).tap();
		expect((await probe(page)).maxActive).toBe(1);
	});
});
