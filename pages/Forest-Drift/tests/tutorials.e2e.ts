import { expect, test } from '@playwright/test';
import { createAndEnterWorld } from './worldHelpers';
test('text tutorial stays local, follows gameplay, and survives reopening', async ({ page }) => {
	test.setTimeout(120_000);
	const speechRequests: string[] = [];
	page.on('request', (r) => {
		if (/huggingface|synthesis.worker|onnxruntime|kokoro/i.test(r.url()))
			speechRequests.push(r.url());
	});
	await page.goto('/');
	await createAndEnterWorld(page);
	await page.getByTestId('tutorial-open').click();
	await page.getByTestId('tutorial-start-text').click();
	const { lessons } = await import('../src/lib/game/tutorials/tutorials');
	const count = lessons(false).length;
	const controls = page.getByRole('navigation', { name: 'Tutorial controls' });
	await expect(page.getByTestId('tutorial-subtitle')).toContainText('Click the world');
	await page.keyboard.press('F9');
	await expect(page.getByTestId('tutorial-subtitle')).toContainText('Use W');
	await page.keyboard.press('F9');
	await expect(controls).toContainText(`3 / ${count}`);
	await page.keyboard.press('F9');
	await page.keyboard.press('F9');
	await expect(page.getByTestId('tutorial-subtitle')).toContainText('Press one');
	await page.evaluate(() => {
		window.dispatchEvent(new KeyboardEvent('keydown', { code: 'F7' }));
		window.dispatchEvent(new KeyboardEvent('keydown', { code: 'F7' }));
		window.dispatchEvent(new KeyboardEvent('keydown', { code: 'F7', repeat: true }));
	});
	await expect(controls).toContainText(`4 / ${count}`);
	await page.waitForTimeout(450);
	await page.keyboard.press('F7');
	await expect(controls).toContainText(`3 / ${count}`);
	for (let index = 3; index < count; index++) {
		await page.keyboard.press('F9');
		await expect(controls).toContainText(`${index + 1} / ${count}`);
	}
	await expect(page.getByTestId('tutorial-subtitle')).toContainText('You are ready to build');
	await page.getByRole('button', { name: 'Continue', exact: true }).click();
	await expect(page.getByTestId('tutorial-subtitle')).toBeHidden();
	await page.getByTestId('tutorial-open').click();
	await expect(page.getByTestId('tutorial-start-voice')).toBeDisabled();
	await expect(page.getByTestId('tutorial-test-sound')).toBeDisabled();
	await expect(page.getByText('Complete step 1 to unlock spoken playback.')).toBeVisible();
	expect(speechRequests).toEqual([]);
	await page.screenshot({ path: '/tmp/forest-drift-tutorial.png' });
});
test('real model preparation creates reusable paired clips', async ({ page }, testInfo) => {
	test.skip(process.env.FOREST_SPEECH_MODEL !== '1', 'Opt-in network/model validation');
	test.setTimeout(480_000);
	await page.goto('/');
	await createAndEnterWorld(page);
	await page.getByTestId('tutorial-open').click();
	await page.getByTestId('tutorial-prepare').click();
	await expect(page.getByRole('region', { name: 'Speech operation progress' })).toBeVisible();
	await expect(page.getByRole('progressbar').first()).toBeVisible();
	await expect(page.getByRole('status').filter({ hasText: 'Voice ready.' })).toBeVisible({
		timeout: 450_000
	});
	await page.getByLabel('Keep instructions visible after speech').uncheck();
	await page.getByTestId('tutorial-test-sound').click();
	await expect(page.getByTestId('tutorial-sample-subtitle')).toContainText('Click the world', {
		timeout: 15_000
	});
	await expect(page.getByRole('status').filter({ hasText: 'Sample finished.' })).toBeVisible({
		timeout: 20_000
	});
	await page.getByTestId('tutorial-start-voice').click();
	await expect(page.getByTestId('tutorial-subtitle')).toContainText('Click the world', {
		timeout: 15_000
	});
	// Replace audible speech several times in the same event-loop turn.
	await page.evaluate(() => {
		for (const code of ['F9', 'F7', 'F9'])
			window.dispatchEvent(new KeyboardEvent('keydown', { code }));
	});
	await expect(page.getByRole('navigation', { name: 'Tutorial controls' })).toContainText('2 / 28');
	await expect(page.getByTestId('tutorial-subtitle')).toContainText('Use W', {
		timeout: 15_000
	});
	await page.waitForTimeout(450);
	await page.keyboard.press('F7');
	await expect(page.getByTestId('tutorial-subtitle')).toContainText('Click the world', {
		timeout: 15_000
	});

	// Step six is outside both startup preparation and earlier lookahead. It must buffer then speak automatically.
	const sampleFrames = () =>
		page.evaluate(
			() =>
				new Promise<{ median: number; p99: number; slow: number }>((resolve) => {
					const times: number[] = [];
					let previous = performance.now();
					const frame = (now: number) => {
						times.push(now - previous);
						previous = now;
						if (times.length < 240) requestAnimationFrame(frame);
						else {
							times.sort((a, b) => a - b);
							resolve({
								median: times[120],
								p99: times[237],
								slow: times.filter((n) => n > 20).length
							});
						}
					};
					requestAnimationFrame(frame);
				})
		);
	const baseline = await sampleFrames();
	await page.evaluate(() => {
		for (let i = 0; i < 5; i++) window.dispatchEvent(new KeyboardEvent('keydown', { code: 'F9' }));
	});
	const generating = sampleFrames();
	await expect(page.getByTestId('tutorial-subtitle')).toContainText('Press E before', {
		timeout: 90_000
	});
	await testInfo.attach('background-speech-frame-pacing', {
		body: JSON.stringify({ baseline, generating: await generating }),
		contentType: 'application/json'
	});

	await page.keyboard.press('F6');
	const modelRequests: string[] = [];
	page.on('request', (r) => {
		if (/huggingface|synthesis.worker/.test(r.url())) modelRequests.push(r.url());
	});
	await page.getByTestId('tutorial-prepare').click();
	await expect(page.getByRole('status').filter({ hasText: 'Voice ready.' })).toBeVisible({
		timeout: 15_000
	});
	expect(modelRequests).toEqual([]);
});

test('records baseline versus active tutorial frame pacing', async ({ page }, testInfo) => {
	test.skip(process.env.FOREST_SPEECH_PERF !== '1', 'Opt-in hardware frame-pacing measurement');
	test.setTimeout(180_000);
	await page.goto('/');
	await createAndEnterWorld(page);
	const sample = () =>
		page.evaluate(
			() =>
				new Promise<{ median: number; p99: number; slow: number; frames: number }>((resolve) => {
					const intervals: number[] = [];
					let last = 0;
					const frame = (now: number) => {
						if (last) intervals.push(now - last);
						last = now;
						if (intervals.length < 600) requestAnimationFrame(frame);
						else {
							intervals.sort((a, b) => a - b);
							resolve({
								median: intervals[300],
								p99: intervals[593],
								slow: intervals.filter((t) => t > 18).length,
								frames: intervals.length
							});
						}
					};
					requestAnimationFrame(frame);
				})
		);
	const baseline = await sample();
	await page.getByTestId('tutorial-open').click();
	await page.getByTestId('tutorial-start-text').click();
	await expect(page.getByTestId('tutorial-subtitle')).toBeVisible();
	const tutorial = await sample();
	await testInfo.attach('frame-pacing', {
		body: JSON.stringify({ baseline, tutorial }, null, 2),
		contentType: 'application/json'
	});
	console.log('SPEECH_FRAME_PACING', JSON.stringify({ baseline, tutorial }));
	expect(Number.isFinite(tutorial.p99)).toBe(true);
	// Diagnostic only: no measured configuration is automatically admitted for live inference.
});

test.describe('touch subtitles', () => {
	test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });
	test('remain readable above the hotbar with no background', async ({ page }) => {
		test.setTimeout(120_000);
		await page.goto('/');
		await createAndEnterWorld(page);
		await page.getByTestId('tutorial-open').click();
		await page.getByLabel('Subtitle size').fill('24');
		await page.getByTestId('tutorial-start-text').click();
		const caption = page.getByTestId('tutorial-subtitle');
		await expect(caption).toBeVisible();
		const layout = await caption.evaluate((element) => {
			const style = getComputedStyle(element),
				bounds = element.getBoundingClientRect();
			const bar = document.querySelector('.hotbar')?.getBoundingClientRect();
			return {
				background: style.backgroundColor,
				lines: bounds.height / parseFloat(style.lineHeight),
				bottom: bounds.bottom,
				barTop: bar?.top,
				left: bounds.left,
				right: bounds.right
			};
		});
		expect(layout.background).toBe('rgba(0, 0, 0, 0)');
		expect(layout.lines).toBeLessThanOrEqual(2.1);
		expect(layout.left).toBeGreaterThanOrEqual(8);
		expect(layout.right).toBeLessThanOrEqual(382);
		if (layout.barTop) expect(layout.bottom).toBeLessThan(layout.barTop);
		await page.getByRole('button', { name: 'Continue', exact: true }).click();
		await expect(caption).toContainText('joystick');
		await page.screenshot({ path: '/tmp/forest-drift-tutorial-touch.png' });
	});
});

test('records cached PCM playback frame pacing without inference', async ({ page }, testInfo) => {
	test.skip(process.env.FOREST_SPEECH_PERF !== '1', 'Opt-in hardware playback measurement');
	test.setTimeout(120_000);
	const { lessons } = await import('../src/lib/game/tutorials/tutorials');
	const { phrases, clipKey, NARRATOR } = await import('../src/lib/game/speech/types');
	const clips = lessons(false)
		.flatMap((lesson) => phrases(lesson.text))
		.map((text) => ({
			text,
			key: clipKey(text, NARRATOR.profile)
		}));
	const modelRequests: string[] = [];
	page.on('request', (request) => {
		if (/huggingface|synthesis.worker|onnxruntime|kokoro/i.test(request.url()))
			modelRequests.push(request.url());
	});
	await page.goto('/');
	await createAndEnterWorld(page);
	// Seed valid silent PCM fixtures: exercise real cache reads, copies, audio nodes and cue clocks,
	// without network/inference variability or attributing model startup time to playback.
	await page.evaluate(
		(clips) =>
			new Promise<void>((resolve, reject) => {
				const opening = indexedDB.open('forest-drift-speech-v1', 2);
				opening.onupgradeneeded = () => {
					const store = opening.result.createObjectStore('clips', { keyPath: 'key' });
					store.createIndex('eviction', ['usedAt', 'bytes']);
				};
				opening.onerror = () => reject(opening.error);
				opening.onsuccess = () => {
					const db = opening.result,
						tx = db.transaction('clips', 'readwrite');
					for (const clip of clips)
						tx.objectStore('clips').put({
							...clip,
							schema: 1,
							pcm: new Float32Array(96000),
							sampleRate: 24000,
							duration: 4,
							bytes: 384000,
							usedAt: Date.now()
						});
					tx.oncomplete = () => {
						db.close();
						resolve();
					};
					tx.onerror = () => {
						db.close();
						reject(tx.error);
					};
				};
			}),
		clips
	);
	const sample = () =>
		page.evaluate(
			() =>
				new Promise<{ median: number; p99: number; slow: number }>((resolve) => {
					const times: number[] = [];
					let last = 0;
					const frame = (now: number) => {
						if (last) times.push(now - last);
						last = now;
						if (times.length < 600) requestAnimationFrame(frame);
						else {
							times.sort((a, b) => a - b);
							resolve({
								median: times[300],
								p99: times[593],
								slow: times.filter((n) => n > 18).length
							});
						}
					};
					requestAnimationFrame(frame);
				})
		);
	const baseline = await sample();
	await page.getByTestId('tutorial-open').click();
	await page.getByTestId('tutorial-prepare').click();
	await expect(page.getByRole('status').filter({ hasText: 'Voice ready.' })).toBeVisible();
	await page.getByTestId('tutorial-start-voice').click();
	await expect(page.getByTestId('tutorial-subtitle')).toContainText('Click the world');
	const playback = await sample();
	expect(modelRequests).toEqual([]);
	await testInfo.attach('cached-playback-frame-pacing', {
		body: JSON.stringify({ baseline, playback }, null, 2),
		contentType: 'application/json'
	});
	console.log('SPEECH_CACHED_FRAME_PACING', JSON.stringify({ baseline, playback }));
});

test('F8 auto prepares from cold and starts speaking without the options dialog', async ({
	page
}) => {
	test.skip(process.env.FOREST_SPEECH_MODEL !== '1', 'Opt-in network/model validation');
	test.setTimeout(240_000);
	await page.goto('/');
	await createAndEnterWorld(page);
	await page.keyboard.press('F8');
	await expect(page.getByTestId('tutorial-menu')).toBeHidden();
	await expect(page.getByTestId('tutorial-preparation-status')).toBeVisible();
	await expect(page.getByTestId('tutorial-preparation-status')).toContainText('automatically');
	await page.keyboard.press('F8');
	await expect(page.getByTestId('tutorial-subtitle')).toContainText('Click the world', {
		timeout: 210_000
	});
	await expect(page.getByTestId('tutorial-preparation-status')).toBeHidden();
	// No movement or Continue press: finishing the speech must advance auto mode.
	await expect(page.getByTestId('tutorial-subtitle')).toContainText('Use W', { timeout: 45_000 });
	await page.keyboard.press('F7');
	await expect(page.getByTestId('tutorial-subtitle')).toContainText('Click the world', {
		timeout: 15_000
	});
	await expect(page.getByTestId('tutorial-subtitle')).toContainText('Use W', { timeout: 30_000 });
	await page.keyboard.press('F9');
	await expect(page.getByRole('navigation', { name: 'Tutorial controls' })).toContainText('3 / 28');
	await page.keyboard.press('F6');
	await expect(page.getByTestId('tutorial-menu')).toBeVisible();
	await page.getByRole('button', { name: 'Close tutorial setup' }).click();
	await page.getByRole('button', { name: 'Close', exact: true }).click();
});
