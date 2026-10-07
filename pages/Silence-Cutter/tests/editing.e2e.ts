/**
 * Manual editing: select, cut (split) and delete segments with the mouse, keyboard and transcript.
 * Fixture speech: 0.5–3.5 s (100 ms pause at 2.0), 5.3–7.0 s, 9.5–11.0 s; automatic cuts with
 * default padding: 0–0.35, 3.77–5.15, 7.27–9.35, 11.27–12.
 */
import { expect, test, type Page } from '@playwright/test';
import { openEditor, store, timelinePoint } from './helpers';

/* eslint-disable @typescript-eslint/no-explicit-any -- test access to the live store */

async function removedRuns(page: Page) {
	return store(page, (s) => {
		const runs: Array<{ start: number; end: number }> = [];
		for (const r of s.edl) {
			if (r.action !== 'remove') continue;
			const last = runs[runs.length - 1];
			if (last && Math.abs(last.end - r.start) < 1e-6) last.end = r.end;
			else runs.push({ start: r.start, end: r.end });
		}
		return runs;
	});
}

async function seekTo(page: Page, t: number) {
	await page.evaluate((x) => (window as any).__editor.player.seek(x), t);
	await expect.poll(() => store(page, (s) => s.playhead)).toBeCloseTo(t, 2);
}

test.describe('manual editing', () => {
	test('click a speech segment to select it, Delete removes it, toast Undo restores it', async ({
		page
	}) => {
		await openEditor(page);
		const edited = await store(page, (s) => s.stats.editedDuration);
		const p = await timelinePoint(page, 1.5, 'edits');
		await page.mouse.click(p.x, p.y);
		const sel = await store(page, (s) => s.selection);
		expect(sel.start).toBeCloseTo(0.35, 1);
		expect(sel.end).toBeCloseTo(3.77, 1);
		await expect(page.getByTestId('selection-bar')).toBeVisible();

		await page.keyboard.press('Delete');
		await expect(page.getByTestId('toasts')).toContainText('Removed 3.42 s');
		expect(await store(page, (s) => s.stats.editedDuration)).toBeLessThan(edited - 3);
		expect(await store(page, (s) => s.selection)).toBeNull();

		await page.getByTestId('toasts').getByRole('button', { name: 'Undo' }).click();
		await expect.poll(() => store(page, (s) => s.stats.editedDuration)).toBeCloseTo(edited, 3);
	});

	test('double-click a speech segment removes it', async ({ page }) => {
		await openEditor(page);
		const p = await timelinePoint(page, 6, 'edits');
		await page.mouse.dblclick(p.x, p.y);
		const runs = await removedRuns(page);
		expect(runs.some((r) => r.start <= 5.2 && r.end >= 7.2)).toBe(true);
	});

	test('mark in / out with I and O, then Delete', async ({ page }) => {
		await openEditor(page);
		await seekTo(page, 5.5);
		await page.keyboard.press('i');
		await seekTo(page, 6.5);
		await page.keyboard.press('o');
		const sel = await store(page, (s) => s.selection);
		expect(sel.start).toBeCloseTo(5.5, 2);
		expect(sel.end).toBeCloseTo(6.5, 2);
		await page.keyboard.press('Delete');
		const runs = await removedRuns(page);
		expect(runs.some((r) => Math.abs(r.start - 5.5) < 0.01 && Math.abs(r.end - 6.5) < 0.01)).toBe(
			true
		);
	});

	test('cut (split) at the playhead, then select one side and delete it', async ({ page }) => {
		await openEditor(page);
		await seekTo(page, 6);
		await page.keyboard.press('s');
		const p = await timelinePoint(page, 6.6, 'edits');
		await page.mouse.click(p.x, p.y);
		const sel = await store(page, (s) => s.selection);
		expect(sel.start).toBeCloseTo(6, 2);
		expect(sel.end).toBeCloseTo(7.27, 1);
		await page.keyboard.press('Backspace');
		const runs = await removedRuns(page);
		// 6.0 → 9.35 is now one continuous cut; 5.15 → 6.0 is still kept.
		expect(runs.some((r) => Math.abs(r.start - 6) < 0.01 && r.end > 9)).toBe(true);
		expect(runs.some((r) => r.start < 5.9 && r.end > 5.9)).toBe(false);
	});

	test('a cut made next to automatic cuts is selected and restored on its own', async ({
		page
	}) => {
		await openEditor(page);
		const p = await timelinePoint(page, 1.5, 'edits');
		await page.mouse.click(p.x, p.y);
		await page.keyboard.press('Delete');
		// 0 → 5.15 is now one continuous removed stretch made of three cuts.
		expect((await removedRuns(page))[0].end).toBeCloseTo(5.15, 1);
		await page.mouse.click(p.x, p.y);
		const sel = await store(page, (s) => s.selection);
		expect(sel.start).toBeCloseTo(0.35, 1);
		expect(sel.end).toBeCloseTo(3.77, 1);
		const runs = await removedRuns(page);
		expect(runs[0].end).toBeCloseTo(0.35, 1); // the automatic cuts either side are untouched
		expect(runs[1].start).toBeCloseTo(3.77, 1);
	});

	test('split a cut, then restore just one piece', async ({ page }) => {
		await openEditor(page);
		await seekTo(page, 4.5);
		await page.keyboard.press('s');
		const p = await timelinePoint(page, 4.9, 'edits');
		await page.mouse.click(p.x, p.y);
		const sel = await store(page, (s) => s.selection);
		expect(sel.start).toBeCloseTo(4.5, 2);
		expect(sel.end).toBeCloseTo(5.15, 1);
		const runs = await removedRuns(page);
		expect(runs.some((r) => Math.abs(r.start - 3.77) < 0.05 && Math.abs(r.end - 4.5) < 0.01)).toBe(
			true
		);
		expect(runs.some((r) => r.start < 4.9 && r.end > 4.9)).toBe(false);
	});

	test('split speech twice, then select and delete only the middle piece', async ({ page }) => {
		await openEditor(page);
		// Select the whole segment first: splitting inside it must not leave that selection behind.
		let p = await timelinePoint(page, 6.1, 'edits');
		await page.mouse.click(p.x, p.y);
		await seekTo(page, 5.8);
		await page.keyboard.press('s');
		expect(await store(page, (s) => s.selection)).toBeNull();
		await seekTo(page, 6.4);
		await page.keyboard.press('s');
		p = await timelinePoint(page, 6.1, 'edits');
		await page.mouse.click(p.x, p.y);
		const sel = await store(page, (s) => s.selection);
		expect(sel.start).toBeCloseTo(5.8, 2);
		expect(sel.end).toBeCloseTo(6.4, 2);
		await page.keyboard.press('Delete');
		const runs = await removedRuns(page);
		expect(runs.some((r) => Math.abs(r.start - 5.8) < 0.01 && Math.abs(r.end - 6.4) < 0.01)).toBe(
			true
		);
		// Both outer pieces are still kept and selectable on their own.
		p = await timelinePoint(page, 5.5, 'edits');
		await page.mouse.click(p.x, p.y);
		expect((await store(page, (s) => s.selection)).end).toBeCloseTo(5.8, 2);
	});

	test('] steps into each piece of a split cut', async ({ page }) => {
		await openEditor(page);
		await seekTo(page, 4.5);
		await page.keyboard.press('s');
		await seekTo(page, 0.2);
		await page.keyboard.press(']');
		expect((await store(page, (s) => s.selection)).end).toBeCloseTo(4.5, 2);
		await page.keyboard.press(']');
		const sel = await store(page, (s) => s.selection);
		expect(sel.start).toBeCloseTo(4.5, 2);
		expect(sel.end).toBeCloseTo(5.15, 1);
	});

	test('a one-frame piece of speech can be selected, removed and kept again', async ({ page }) => {
		await openEditor(page);
		await seekTo(page, 6);
		await page.keyboard.press('s');
		await seekTo(page, 6.02);
		await page.keyboard.press('s');
		// 20 ms is under 2 px wide at this zoom: it is drawn as a tick and still clickable.
		const p = await timelinePoint(page, 6.01, 'edits');
		await page.mouse.click(p.x, p.y);
		let sel = await store(page, (s) => s.selection);
		expect(sel.start).toBeCloseTo(6, 3);
		expect(sel.end).toBeCloseTo(6.02, 3);
		await page.keyboard.press('Delete');
		let runs = await removedRuns(page);
		expect(runs.some((r) => Math.abs(r.start - 6) < 1e-3 && Math.abs(r.end - 6.02) < 1e-3)).toBe(
			true
		);
		// Clicking the tiny cut restores only it.
		await page.mouse.click(p.x, p.y);
		sel = await store(page, (s) => s.selection);
		expect(sel.end - sel.start).toBeCloseTo(0.02, 3);
		runs = await removedRuns(page);
		expect(runs.some((r) => r.start < 6.01 && r.end > 6.01)).toBe(false);
	});

	test('a tiny piece kept inside a cut can be selected and removed again', async ({ page }) => {
		await openEditor(page);
		await seekTo(page, 4.4);
		await page.keyboard.press('s');
		await seekTo(page, 4.43);
		await page.keyboard.press('s');
		const p = await timelinePoint(page, 4.415, 'edits');
		await page.mouse.click(p.x, p.y); // restores just the 30 ms sliver
		let runs = await removedRuns(page);
		expect(runs.some((r) => r.start < 4.415 && r.end > 4.415)).toBe(false);
		expect(runs.some((r) => Math.abs(r.end - 4.4) < 1e-3)).toBe(true);
		expect(runs.some((r) => Math.abs(r.start - 4.43) < 1e-3)).toBe(true);
		await page.keyboard.press('Escape');
		await page.mouse.click(p.x, p.y); // now a kept segment: selects it
		const sel = await store(page, (s) => s.selection);
		expect(sel.start).toBeCloseTo(4.4, 3);
		expect(sel.end).toBeCloseTo(4.43, 3);
		await page.keyboard.press('Delete');
		runs = await removedRuns(page);
		expect(runs.some((r) => r.start < 4.415 && r.end > 4.415)).toBe(true);
	});

	test('{ and } step onto small segments too', async ({ page }) => {
		await openEditor(page);
		await seekTo(page, 6);
		await page.keyboard.press('s');
		await seekTo(page, 6.02);
		await page.keyboard.press('s');
		await seekTo(page, 5.9);
		await page.keyboard.press('}');
		const sel = await store(page, (s) => s.selection);
		expect(sel.start).toBeCloseTo(6, 3);
		expect(sel.end).toBeCloseTo(6.02, 3);
		await page.keyboard.press('u');
		await expect(page.getByTestId('toasts')).toContainText('Nothing is removed there');
		await page.keyboard.press('Backspace');
		await expect(page.getByTestId('toasts')).toContainText('Removed 20 ms');
	});

	test('step through cuts with ] and [, restore with U', async ({ page }) => {
		await openEditor(page);
		await page.keyboard.press(']');
		let sel = await store(page, (s) => s.selection);
		expect(sel.start).toBeCloseTo(3.77, 1);
		await page.keyboard.press(']');
		sel = await store(page, (s) => s.selection);
		expect(sel.start).toBeCloseTo(7.27, 1);
		await page.keyboard.press('[');
		sel = await store(page, (s) => s.selection);
		expect(sel.start).toBeCloseTo(3.77, 1);
		const cuts = await store(page, (s) => s.stats.cuts);
		await page.keyboard.press('u');
		await expect.poll(() => store(page, (s) => s.stats.cuts)).toBe(cuts - 1);
		await expect(page.getByTestId('toasts')).toContainText('Restored');
	});

	test('select words in the transcript and delete them', async ({ page }) => {
		await openEditor(page);
		await page.getByTestId('transcribe').click();
		const words = page.getByTestId('transcript').locator('.w');
		await expect(words.first()).toBeVisible();
		await words.nth(0).click();
		await words.nth(1).click({ modifiers: ['Shift'] });
		await expect(page.getByTestId('transcript-selection')).toContainText('2 words selected');
		await page.keyboard.press('Delete');
		await expect(words.nth(0)).toHaveClass(/removed/);
		await expect(words.nth(1)).toHaveClass(/removed/);
		await expect(words.nth(2)).not.toHaveClass(/removed/);
	});

	test('drag on the waveform selects (snapping to words); the selection bar removes it', async ({
		page
	}) => {
		await openEditor(page);
		await page.getByTestId('transcribe').click();
		await expect(page.getByTestId('transcript').locator('.w').first()).toBeVisible();
		const word = await store(page, (s) => s.words.find((w: any) => w.start > 5));
		const a = await timelinePoint(page, word.start + 0.03, 'wave');
		const b = await timelinePoint(page, word.start + 0.9, 'wave');
		await page.mouse.move(a.x, a.y);
		await page.mouse.down();
		await page.mouse.move(b.x, b.y, { steps: 6 });
		await page.mouse.up();
		const sel = await store(page, (s) => s.selection);
		expect(sel.start).toBeCloseTo(word.start, 6); // snapped onto the word edge
		await page.getByTestId('selbar-remove').click();
		const runs = await removedRuns(page);
		expect(runs.some((r) => Math.abs(r.start - word.start) < 1e-6)).toBe(true);
	});

	test('right-click menu removes the segment under the pointer', async ({ page }) => {
		await openEditor(page);
		const p = await timelinePoint(page, 10, 'wave');
		await page.mouse.click(p.x, p.y, { button: 'right' });
		const menu = page.getByTestId('timeline-menu');
		await expect(menu).toBeVisible();
		await menu.getByRole('menuitem', { name: /Remove selection/ }).click();
		const runs = await removedRuns(page);
		expect(runs.some((r) => r.start <= 9.4 && r.end >= 11.2)).toBe(true);
		await expect(menu).toBeHidden();
	});

	test('Delete with nothing selected explains what to do', async ({ page }) => {
		await openEditor(page);
		await page.keyboard.press('Delete');
		await expect(page.getByTestId('toasts')).toContainText('Select something first');
		expect(await store(page, (s) => s.manualEditCount)).toBe(0);
	});
});

test.describe('segment and detail tracks', () => {
	test('the segment track selects the whole segment; the detail track just one piece', async ({
		page
	}) => {
		await openEditor(page);
		const seg = await timelinePoint(page, 2, 'edits');
		await page.mouse.click(seg.x, seg.y);
		let sel = await store(page, (s) => s.selection);
		expect(sel.start).toBeCloseTo(0.35, 1);
		expect(sel.end).toBeCloseTo(3.77, 1);

		// The padding before the first word is its own piece in the detail track.
		const pad = await timelinePoint(page, 0.4, 'detail');
		await page.mouse.click(pad.x, pad.y);
		sel = await store(page, (s) => s.selection);
		expect(sel.start).toBeCloseTo(0.35, 1);
		expect(sel.end).toBeLessThan(0.7);
		await page.keyboard.press('Delete');
		const runs = await removedRuns(page);
		expect(runs[0].end).toBeCloseTo(sel.end, 3); // only the padding was removed
		expect(
			await store(page, (s) =>
				s.segments.some((r: any) => r.start < 2 && r.end > 2 && r.action === 'keep')
			)
		).toBe(true);
	});

	test('clicking a cut in the detail track selects it without restoring; U restores it', async ({
		page
	}) => {
		await openEditor(page);
		const before = await removedRuns(page);
		const p = await timelinePoint(page, 4.5, 'detail');
		await page.mouse.click(p.x, p.y);
		expect(await removedRuns(page)).toEqual(before);
		const sel = await store(page, (s) => s.selection);
		expect(sel.start).toBeLessThanOrEqual(4.5);
		expect(sel.end).toBeGreaterThanOrEqual(4.5);
		await page.keyboard.press('u');
		const runs = await removedRuns(page);
		expect(runs.some((r) => r.start < 4.5 && r.end > 4.5)).toBe(false);
	});

	test('shift-click in the detail track extends the selection across pieces', async ({ page }) => {
		await openEditor(page);
		const a = await timelinePoint(page, 0.4, 'detail');
		const b = await timelinePoint(page, 2, 'detail');
		await page.mouse.click(a.x, a.y);
		await page.keyboard.down('Shift');
		await page.mouse.click(b.x, b.y);
		await page.keyboard.up('Shift');
		const sel = await store(page, (s) => s.selection);
		expect(sel.start).toBeCloseTo(0.35, 1);
		expect(sel.end).toBeGreaterThan(2);
	});
});

test.describe('select and trim tools', () => {
	async function drag(page: Page, a: { x: number; y: number }, b: { x: number; y: number }) {
		await page.mouse.move(a.x, a.y);
		await page.mouse.down();
		await page.mouse.move(b.x, b.y, { steps: 6 });
		await page.mouse.up();
	}

	test('Select tool: dragging from a cut edge selects and never moves the edge', async ({
		page
	}) => {
		await openEditor(page);
		await expect(page.getByTestId('tool-select')).toHaveAttribute('aria-checked', 'true');
		const before = await removedRuns(page);
		await drag(
			page,
			await timelinePoint(page, 3.77, 'wave'),
			await timelinePoint(page, 3.0, 'wave')
		);
		expect(await removedRuns(page)).toEqual(before);
		expect(await store(page, (s) => s.manualEditCount)).toBe(0);
		const sel = await store(page, (s) => s.selection);
		expect(sel.end - sel.start).toBeGreaterThan(0.5);
	});

	test('Trim tool: drags the nearest cut edge; clicks never select', async ({ page }) => {
		await openEditor(page);
		await page.getByTestId('tool-trim').click();
		await expect(page.getByTestId('tool-trim')).toHaveAttribute('aria-checked', 'true');
		await expect(page.getByTestId('trim-badge')).toBeVisible();

		// A click on a segment only moves the playhead.
		const mid = await timelinePoint(page, 1.5, 'edits');
		await page.mouse.click(mid.x, mid.y);
		expect(await store(page, (s) => s.selection)).toBeNull();
		expect(await store(page, (s) => s.playhead)).toBeCloseTo(1.5, 1);

		// Grab the 3.77 cut edge from ~12 px away (generous grab zone) and pull it later.
		const edge = await timelinePoint(page, 3.77, 'wave');
		await drag(page, { x: edge.x - 12, y: edge.y }, { x: edge.x + 40, y: edge.y });
		const runs = await removedRuns(page);
		expect(runs.some((r) => r.start > 3.9 && r.start < 4.5 && Math.abs(r.end - 5.15) < 0.05)).toBe(
			true
		);
		expect(await store(page, (s) => s.selection)).toBeNull();

		await page.keyboard.press('v');
		await expect(page.getByTestId('trim-badge')).toBeHidden();
		await expect(page.getByTestId('toasts')).toContainText('Select mode');
	});
});

test.describe('quality of life', () => {
	test('padding presets apply instantly', async ({ page }) => {
		await openEditor(page);
		const before = await store(page, (s) => s.stats.editedDuration);
		await page.getByTestId('preset-tight').click();
		expect(await store(page, (s) => s.settings.cut.leadMs)).toBe(90);
		await expect(page.getByTestId('preset-tight')).toHaveAttribute('aria-checked', 'true');
		expect(await store(page, (s) => s.stats.editedDuration)).toBeLessThan(before);
	});

	test('exports subtitles timed to the edited video', async ({ page }) => {
		await openEditor(page);
		await page.getByTestId('transcribe').click();
		await expect(page.getByTestId('transcript').locator('.w').first()).toBeVisible();
		const download = page.waitForEvent('download');
		await page.getByTestId('export-srt').click();
		const file = await download;
		expect(file.suggestedFilename()).toBe('speech-pattern (edited).srt');
		const text = await (await file.createReadStream()).toArray();
		const srt = Buffer.concat(text).toString('utf8');
		expect(srt).toMatch(/^1\n\d\d:\d\d:\d\d,\d{3} --> /);
	});
});
