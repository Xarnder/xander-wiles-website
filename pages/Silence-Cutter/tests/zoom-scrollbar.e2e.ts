import { expect, test, type Page } from '@playwright/test';
import { openEditor, store } from './helpers';

/** Visible range as fractions (from the handles' ARIA values, 0.1 % precision). */
async function range(page: Page) {
	const s = Number(await page.getByTestId('zsb-start').getAttribute('aria-valuenow'));
	const e = Number(await page.getByTestId('zsb-end').getAttribute('aria-valuenow'));
	return { start: s / 100, end: e / 100 };
}

async function track(page: Page) {
	return (await page.getByTestId('zoom-scrollbar').boundingBox())!;
}

/** Drag from one point to another with intermediate moves (like a real pointer). */
async function dragBy(page: Page, x: number, y: number, dx: number) {
	await page.mouse.move(x, y);
	await page.mouse.down();
	await page.mouse.move(x + dx / 2, y, { steps: 4 });
	await page.mouse.move(x + dx, y, { steps: 4 });
	await page.mouse.up();
}

test.describe('zoom scrollbar / timeline navigator', () => {
	test('starts showing the whole timeline', async ({ page }) => {
		await openEditor(page);
		expect(await range(page)).toEqual({ start: 0, end: 1 });
		await expect(page.getByTestId('zsb-region')).toHaveAttribute('aria-valuetext', /zoom 1\.0×/);
	});

	test('right handle zooms with the left edge fixed; left handle with the right edge fixed', async ({
		page
	}) => {
		await openEditor(page);
		const t = await track(page);
		const y = t.y + t.height / 2;
		await dragBy(page, t.x + t.width - 2, y, -t.width * 0.5);
		let r = await range(page);
		expect(r.start).toBe(0);
		expect(r.end).toBeCloseTo(0.5, 1);
		await expect(page.getByTestId('zsb-region')).toHaveAttribute('aria-valuetext', /zoom 2\.0×/);

		await dragBy(page, t.x + 2, y, t.width * 0.25);
		r = await range(page);
		expect(r.start).toBeCloseTo(0.25, 1);
		expect(r.end).toBeCloseTo(0.5, 1);
		await expect(page.getByTestId('zsb-region')).toHaveAttribute('aria-valuetext', /zoom 4\.0×/);
	});

	test('dragging the middle pans and keeps the width; clamps at the end', async ({ page }) => {
		await openEditor(page);
		const t = await track(page);
		const y = t.y + t.height / 2;
		await dragBy(page, t.x + t.width - 2, y, -t.width * 0.75); // 0 → 0.25
		const before = await range(page);
		await dragBy(page, t.x + t.width * 0.12, y, t.width * 0.3);
		const after = await range(page);
		expect(after.end - after.start).toBeCloseTo(before.end - before.start, 2);
		expect(after.start).toBeCloseTo(0.3, 1);
		await dragBy(page, t.x + t.width * 0.4, y, t.width * 2);
		expect(await range(page)).toEqual({ start: 0.75, end: 1 });
	});

	test('clicking the empty track centres the view there without zooming', async ({ page }) => {
		await openEditor(page);
		const t = await track(page);
		const y = t.y + t.height / 2;
		await dragBy(page, t.x + t.width - 2, y, -t.width * 0.8); // width 0.2
		await page.mouse.click(t.x + t.width * 0.6, y);
		const r = await range(page);
		expect(r.end - r.start).toBeCloseTo(0.2, 2);
		expect((r.start + r.end) / 2).toBeCloseTo(0.6, 1);
	});

	test('keyboard: arrows move a focused handle without triggering editor shortcuts', async ({
		page
	}) => {
		await openEditor(page);
		const playhead = await store(page, (s) => s.playhead);
		await page.getByTestId('zsb-start').focus();
		await page.keyboard.press('ArrowRight');
		const a = await range(page);
		expect(a.start).toBeCloseTo(0.1, 2);
		expect(a.end).toBe(1);
		await page.keyboard.press('Shift+ArrowRight');
		const b = await range(page);
		expect(b.start).toBeGreaterThan(a.start + 0.3);
		expect(await store(page, (s) => s.playhead)).toBe(playhead);
		await page.getByTestId('zsb-region').focus();
		await page.keyboard.press('Home');
		expect((await range(page)).start).toBe(0);
	});

	test('stays in sync when the timeline zooms by other means', async ({ page }) => {
		await openEditor(page);
		await page.keyboard.press('+');
		const zoomed = await range(page);
		expect(zoomed.end - zoomed.start).toBeLessThan(0.7);
		await page.keyboard.press('0');
		expect(await range(page)).toEqual({ start: 0, end: 1 });
		const box = (await page.getByTestId('timeline').boundingBox())!;
		await page.mouse.move(box.x + box.width / 2, box.y + 120);
		await page.mouse.wheel(0, -300);
		await page.keyboard.down('Control');
		await page.mouse.wheel(0, -200);
		await page.keyboard.up('Control');
		const wheel = await range(page);
		expect(wheel.end - wheel.start).toBeLessThan(1);
	});

	test('resizing the window keeps the same visible range', async ({ page }) => {
		await openEditor(page);
		const t = await track(page);
		const y = t.y + t.height / 2;
		await dragBy(page, t.x + t.width - 2, y, -t.width * 0.5);
		await dragBy(page, t.x + t.width * 0.25, y, t.width * 0.2);
		const before = await range(page);
		await page.setViewportSize({ width: 1200, height: 900 });
		await page.waitForTimeout(200);
		expect(await range(page)).toEqual(before);
	});
});
