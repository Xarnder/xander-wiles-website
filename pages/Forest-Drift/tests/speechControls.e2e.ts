import { expect, test, type Page, type Route } from '@playwright/test';
import { createAndEnterWorld } from './worldHelpers';

import { observeAudio, probe } from './speechHelpers';

const ready = (page: Page) =>
	expect(page.getByRole('status').filter({ hasText: 'Voice ready.' })).toBeVisible({
		timeout: 90_000
	});

test('speech shortcuts respect modifiers, text fields, modal focus and disabled tutorials', async ({
	page
}) => {
	await page.goto('/');
	await createAndEnterWorld(page);
	await page.keyboard.press('F6');
	await expect(page.getByTestId('pause-menu')).toBeHidden();
	const menu = page.getByTestId('tutorial-menu');
	await expect(menu).toBeVisible();
	await page.getByLabel('Subtitle size').fill('24');
	await page.getByLabel('Auto pause between instructions (seconds)').fill('0');
	for (const key of ['F6', 'F7', 'F8', 'F9']) await page.keyboard.press(key);
	await expect(menu).toBeVisible();
	await expect(page.getByTestId('tutorial-start-voice')).toBeDisabled();
	await page.getByTestId('tutorial-start-text').click();
	const nav = page.getByRole('navigation', { name: 'Tutorial controls' });
	await expect(nav).toContainText('1 / 28');
	await page.keyboard.press('F7');
	await expect(nav).toContainText('1 / 28');
	await page.evaluate(() => {
		for (const code of ['F6', 'F7', 'F8', 'F9']) {
			for (const modifier of ['ctrlKey', 'altKey', 'shiftKey', 'metaKey', 'repeat'])
				window.dispatchEvent(new KeyboardEvent('keydown', { code, [modifier]: true }));
		}
	});
	await expect(menu).toBeHidden();
	await expect(nav).toContainText('1 / 28');
	await page.keyboard.press('F9');
	await expect(nav).toContainText('2 / 28');
	await page.waitForTimeout(450);
	await page.keyboard.press('F7');
	await expect(nav).toContainText('1 / 28');
	await page.getByRole('button', { name: 'Replay', exact: true }).click();
	await expect(page.getByTestId('tutorial-subtitle')).toContainText('Click the world');
	await expect(page.getByTestId('tutorial-subtitle')).toHaveCSS('font-size', '24px');
	await page.keyboard.press('F6');
	await page.keyboard.press('F9');
	await page.keyboard.press('Escape');
	await expect(menu).toBeHidden();
	await expect(nav).toContainText('1 / 28');
	await page.keyboard.press('F6');
	await page.getByRole('button', { name: 'Disable tutorials', exact: true }).click();
	await expect(nav).toBeHidden();
	await expect(page.getByTestId('tutorial-subtitle')).toBeHidden();
	await page.reload();
	await createAndEnterWorld(page, { name: 'Stored speech preferences' });
	await page.keyboard.press('F6');
	await expect(page.getByLabel('Subtitle size')).toHaveValue('24');
	await expect(page.getByLabel('Auto pause between instructions (seconds)')).toHaveValue('0');
});

test('real Phonon audio obeys sample, replay, navigation, mute recovery, visibility, disable and clear', async ({
	page
}) => {
	test.skip(process.env.FOREST_SPEECH_MODEL !== '1', 'Opt-in real model validation');
	test.setTimeout(180_000);
	await observeAudio(page);
	await page.addInitScript(() =>
		localStorage.setItem('forest-drift.audio.v1', JSON.stringify({ muted: true }))
	);
	await page.goto('/');
	await createAndEnterWorld(page);
	await page.keyboard.press('F8');
	await expect(page.getByTestId('tutorial-preparation-status')).toContainText('muted');
	expect((await probe(page)).started).toBe(0);
	await page.keyboard.press('F6');
	await expect(page.getByTestId('tutorial-test-sound')).toBeDisabled();
	await page.getByRole('button', { name: 'Enable narrator sound' }).click();
	await page.getByTestId('tutorial-prepare').click();
	await ready(page);
	await page.getByTestId('tutorial-test-sound').click();
	await expect(page.getByTestId('tutorial-sample-subtitle')).toContainText('Click the world');
	expect((await probe(page)).audible).toBeGreaterThan(0);
	await page.keyboard.press('Escape');
	await expect.poll(async () => (await probe(page)).active).toBe(0);
	await expect(page.getByTestId('pause-menu')).toBeHidden();
	await page.keyboard.press('F6');
	await page.getByLabel('Keep instructions visible after speech').uncheck();
	await page.getByTestId('tutorial-start-voice').click();
	const caption = page.getByTestId('tutorial-subtitle');
	const nav = page.getByRole('navigation', { name: 'Tutorial controls' });
	await expect(caption).toContainText('Click the world');
	const beforeReplay = await probe(page);
	await page.getByRole('button', { name: 'Replay', exact: true }).click();
	await expect.poll(async () => (await probe(page)).started).toBeGreaterThan(beforeReplay.started);
	expect((await probe(page)).stopped).toBeGreaterThan(beforeReplay.stopped);
	await page.keyboard.press('F9');
	await expect(caption).toContainText('Use W');
	await page.keyboard.press('F7');
	await expect(caption).toContainText('Click the world');
	await page.evaluate(() => {
		Object.defineProperty(document, 'hidden', { configurable: true, value: true });
		document.dispatchEvent(new Event('visibilitychange'));
	});
	await expect(caption).toBeHidden();
	await expect.poll(async () => (await probe(page)).active).toBe(0);
	await page.evaluate(() => {
		Object.defineProperty(document, 'hidden', { configurable: true, value: false });
		document.dispatchEvent(new Event('visibilitychange'));
	});
	await expect(caption).toContainText('Click the world');
	await expect(caption).toBeHidden({ timeout: 20_000 });
	await expect(nav).toContainText('1 / 28');
	await page.keyboard.press('F6');
	await page.getByLabel('Auto pause between instructions (seconds)').fill('0');
	await page.getByRole('button', { name: 'Auto start tutorial (F8)' }).focus();
	await page.keyboard.press('F8');
	await expect(caption).toContainText('Use W', { timeout: 25_000 });
	await expect(page.getByTestId('tutorial-auto-pause')).toBeHidden();
	await page.keyboard.press('F6');
	await page.getByRole('button', { name: 'Disable tutorials', exact: true }).click();
	await expect(nav).toBeHidden();
	await expect.poll(async () => (await probe(page)).active).toBe(0);
	await page.keyboard.press('F8');
	await expect(caption).toContainText('Click the world');
	await page.getByRole('button', { name: 'Close', exact: true }).click();
	await expect(nav).toBeHidden();
	await expect.poll(async () => (await probe(page)).active).toBe(0);
	await page.keyboard.press('F6');
	await page.getByRole('button', { name: 'Clear downloaded speech' }).click();
	await expect(
		page.getByRole('status').filter({ hasText: 'Saved voice model and generated clips cleared' })
	).toBeVisible();
	await expect(page.getByTestId('tutorial-start-voice')).toBeDisabled();
	expect(
		await page.evaluate(async () =>
			(await caches.keys()).filter((name) => name.startsWith('forest-drift.speech.'))
		)
	).toEqual([]);
	expect(
		await page.evaluate(async () => {
			const counts = await Promise.all(
				[
					{ name: 'forest-drift-speech-v1', version: 2, store: 'clips' },
					{ name: 'forest-drift-speech-assets-v1', version: 1, store: 'files' }
				].map(
					({ name, version, store }) =>
						new Promise<number>((resolve, reject) => {
							const opening = indexedDB.open(name, version);
							opening.onerror = () => reject(opening.error);
							opening.onsuccess = () => {
								const db = opening.result;
								const count = db.transaction(store).objectStore(store).count();
								count.onsuccess = () => {
									db.close();
									resolve(count.result);
								};
								count.onerror = () => {
									db.close();
									reject(count.error);
								};
							};
						})
				)
			);
			return counts;
		})
	).toEqual([0, 0]);
	const audio = await probe(page);
	expect(audio.maxActive).toBe(1);
	expect(audio.audible).toBe(audio.started);
});

test('cancel and Escape terminate a cold model download and preparation can retry', async ({
	page
}) => {
	test.skip(process.env.FOREST_SPEECH_MODEL !== '1', 'Opt-in real model validation');
	test.setTimeout(180_000);
	const held: Route[] = [];
	await page.route('https://huggingface.co/**', (route) => {
		held.push(route);
	});
	await page.goto('/');
	await createAndEnterWorld(page);
	await page.keyboard.press('F6');
	await page.getByTestId('tutorial-prepare').click();
	await expect.poll(() => held.length).toBeGreaterThan(0);
	await page.getByRole('button', { name: 'Cancel preparation' }).click();
	await expect(page.getByRole('status').filter({ hasText: 'Preparation stopped.' })).toBeVisible();
	await expect(page.getByTestId('tutorial-prepare')).toBeEnabled();
	await expect(page.getByTestId('tutorial-start-voice')).toBeDisabled();
	await page.getByTestId('tutorial-prepare').click();
	await expect(page.getByRole('button', { name: 'Cancel preparation' })).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(page.getByTestId('tutorial-menu')).toBeHidden();
	await page.unroute('https://huggingface.co/**');
	await Promise.all(held.map((route) => route.abort().catch(() => {})));
	await page.keyboard.press('F6');
	await page.getByTestId('tutorial-prepare').click();
	await ready(page);
	await page.getByTestId('tutorial-test-sound').click();
	await expect(page.getByTestId('tutorial-sample-subtitle')).toContainText('Click the world');
});
