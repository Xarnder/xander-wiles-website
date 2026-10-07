import { expect, type Page } from '@playwright/test';
import path from 'node:path';

export const FIXTURES = path.resolve(import.meta.dirname, 'fixtures');
export const MP4 = path.join(FIXTURES, 'speech-pattern.mp4');
export const MOV = path.join(FIXTURES, 'speech-pattern.mov');

/* eslint-disable @typescript-eslint/no-explicit-any -- test access to the live store */

/** Reads a value from the live editor store (exposed on window for tests and diagnostics). */
export function store<T>(page: Page, fn: (s: any) => T): Promise<T> {
	return page.evaluate(`(${fn.toString()})(window.__editor.store)`) as Promise<T>;
}

export async function openEditor(page: Page, file = MP4) {
	await page.goto('/?asr=mock');
	// Start from a clean slate: no remembered projects.
	await page.evaluate(
		() =>
			new Promise((r) => {
				const req = indexedDB.deleteDatabase('silence-cutter');
				req.onsuccess = req.onerror = req.onblocked = () => r(null);
			})
	);
	await page.reload();
	await page.setInputFiles('[data-testid=file-input]', file);
	await expect(page.getByTestId('timeline')).toBeVisible();
	await expect(page.getByTestId('stat-original')).toHaveText('00:12');
}

/** Client-space point for a source time in a timeline lane. */
export async function timelinePoint(
	page: Page,
	t: number,
	lane: 'edits' | 'detail' | 'wave' | 'ruler'
) {
	const box = (await page.getByTestId('timeline').boundingBox())!;
	const view = await page.evaluate(() => {
		const s = (window as any).__editor.store;
		return { duration: s.duration };
	});
	// Timeline fits the whole recording on load.
	const x = box.x + (t / view.duration) * box.width;
	const y = box.y + { ruler: 10, edits: 33, detail: 57, wave: 120 }[lane];
	return { x, y };
}
