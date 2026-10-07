import { expect, test } from '@playwright/test';
import { MOV, openEditor, store, timelinePoint } from './helpers';

/* eslint-disable @typescript-eslint/no-explicit-any -- test access to the live store */

test.describe('Silence Cutter editor (mock ASR)', () => {
	test('opens the application with privacy and runtime indicators', async ({ page }) => {
		await page.goto('/?asr=mock');
		await expect(page.getByRole('heading', { name: 'Drop an MP4 or MOV here' })).toBeVisible();
		await expect(page.getByTestId('privacy')).toContainText('this video never leaves your device');
		await expect(page.getByTestId('runtime')).toContainText(/AI acceleration/);
		expect(await page.evaluate(() => crossOriginIsolated)).toBe(true);
	});

	test('imports a video, generates the waveform and proposes cuts', async ({ page }) => {
		const requests: string[] = [];
		page.on('request', (r) => requests.push(r.url()));
		await openEditor(page);
		const info = await store(page, (s) => ({
			peaks: s.peaks?.[0]?.data.length ?? 0,
			envelope: s.envelope?.db.length ?? 0,
			audioSpeech: s.audioSpeech?.length ?? 0,
			cuts: s.stats?.cuts ?? 0
		}));
		expect(info.peaks).toBeGreaterThan(1000);
		expect(info.envelope).toBeGreaterThanOrEqual(1199);
		// Fixture: speech 0.5–3.5 (with a 100 ms pause bridged), 5.3–7.0, 9.5–11.0.
		expect(info.audioSpeech).toBe(3);
		expect(info.cuts).toBe(4);
		await expect(page.getByTestId('stat-edited')).toHaveText('00:07');
		// The media itself is never sent anywhere: every request stays on this origin.
		const origin = new URL(page.url()).origin;
		expect(
			requests.filter(
				(u) => !u.startsWith(origin) && !u.startsWith('blob:') && !u.startsWith('data:')
			)
		).toEqual([]);
	});

	test('imports a MOV file', async ({ page }) => {
		await openEditor(page, MOV);
		expect(await store(page, (s) => s.info.container)).toMatch(/QuickTime|MOV|MP4/i);
		expect(await store(page, (s) => s.stats.cuts)).toBe(4);
	});

	test('changing the threshold updates the proposed edit live', async ({ page }) => {
		await openEditor(page);
		const input = page.getByTestId('threshold-input');
		await input.fill('-10');
		await input.dispatchEvent('change');
		// Nothing is loud enough to be speech at -10 dBFS → everything is silence.
		await expect.poll(() => store(page, (s) => s.audioSpeech.length)).toBe(0);
		await input.fill('-60');
		await input.dispatchEvent('change');
		await expect.poll(() => store(page, (s) => s.audioSpeech.length)).toBe(3);
		// Padding changes also apply without re-analysis.
		const before = await store(page, (s) => s.stats.editedDuration);
		await page.getByTestId('lead-input').fill('500');
		await page.getByTestId('lead-input').dispatchEvent('change');
		await expect.poll(() => store(page, (s) => s.stats.editedDuration)).toBeGreaterThan(before);
	});

	test('transcribes (mock) and combines detectors; Conservative is the default', async ({
		page
	}) => {
		await openEditor(page);
		await page.getByTestId('transcribe').click();
		await expect(page.getByTestId('transcript').locator('.w').first()).toBeVisible();
		expect(await store(page, (s) => s.settings.cut.mode)).toBe('conservative');
		expect(await store(page, (s) => s.proposal.effectiveMode)).toBe('conservative');
		await expect(page.getByTestId('stat-words')).not.toHaveText('0');
		await page.getByTestId('mode-aggressive').check();
		expect(await store(page, (s) => s.proposal.effectiveMode)).toBe('aggressive');
		// Clicking a transcript word seeks the video to it.
		const target = await store(page, (s) => s.words[1].start);
		await page.getByTestId('transcript').locator('.w').nth(1).click();
		await expect.poll(() => store(page, (s) => s.playhead)).toBeCloseTo(target, 1);
	});

	test('edits a cut manually: click to keep, drag a boundary, undo/redo, reset', async ({
		page
	}) => {
		await openEditor(page);
		const cut = await store(page, (s) =>
			s.edl.find((r: any) => r.action === 'remove' && r.start > 1)
		);
		const editedBefore = await store(page, (s) => s.stats.editedDuration);

		// Click the hatched cut in the edits lane → keep it.
		const p = await timelinePoint(page, (cut.start + cut.end) / 2, 'edits');
		await page.mouse.click(p.x, p.y);
		await expect(page.getByTestId('manual-count')).toContainText('1 manual edit');
		expect(await store(page, (s) => s.stats.cuts)).toBe(3);
		expect(await store(page, (s) => s.stats.editedDuration)).toBeGreaterThan(editedBefore);

		// Undo / redo via keyboard.
		await page.keyboard.press('ControlOrMeta+z');
		await expect.poll(() => store(page, (s) => s.stats.cuts)).toBe(4);
		await page.keyboard.press('ControlOrMeta+Shift+z');
		await expect.poll(() => store(page, (s) => s.stats.cuts)).toBe(3);
		await page.getByTestId('undo').click();
		await page.keyboard.press('Escape');

		// Drag the cut's start boundary 0.5 s earlier (cut edges only move in the Trim tool).
		await page.keyboard.press('b');
		const from = await timelinePoint(page, cut.start, 'wave');
		const to = await timelinePoint(page, cut.start - 0.5, 'wave');
		await page.mouse.move(from.x, from.y);
		await page.mouse.down();
		await page.mouse.move(to.x, to.y, { steps: 5 });
		await page.mouse.up();
		// The swept span becomes a manual remove region joined to the automatic cut.
		const removed = await store(page, (s) => {
			const runs: Array<{ start: number; end: number }> = [];
			for (const r of s.edl) {
				if (r.action !== 'remove') continue;
				const last = runs[runs.length - 1];
				if (last && Math.abs(last.end - r.start) < 1e-6) last.end = r.end;
				else runs.push({ start: r.start, end: r.end });
			}
			return runs;
		});
		const moved = removed.find((r) => r.end > 4 && r.end < 6)!;
		expect(moved.start).toBeLessThan(cut.start - 0.3);
		expect(moved.end).toBeCloseTo(cut.end, 6);

		// Select a range and remove it with the keyboard; manual edits survive parameter changes.
		await page.keyboard.press('v');
		const a = await timelinePoint(page, 9.8, 'wave');
		const b = await timelinePoint(page, 10.4, 'wave');
		await page.mouse.move(a.x, a.y);
		await page.mouse.down();
		await page.mouse.move(b.x, b.y, { steps: 4 });
		await page.mouse.up();
		await page.keyboard.press('r');
		const manual = await store(page, (s) => s.manualEditCount);
		await page.getByTestId('trail-input').fill('400');
		await page.getByTestId('trail-input').dispatchEvent('change');
		expect(await store(page, (s) => s.manualEditCount)).toBe(manual);
		expect(
			await store(page, (s) =>
				s.edl.some((r: any) => r.manual && r.action === 'remove' && r.start < 10 && r.end > 10.2)
			)
		).toBe(true);

		await page.getByTestId('reset-auto').click();
		expect(await store(page, (s) => s.manualEditCount)).toBe(0);
		expect(await store(page, (s) => s.stats.cuts)).toBe(4);
	});

	test('switches between Original and Edited preview; Edited skips removed regions', async ({
		page
	}) => {
		await openEditor(page);
		await page.getByTestId('preview-original').click();
		expect(await store(page, (s) => s.previewMode)).toBe('original');
		await page.getByTestId('preview-edited').click();
		expect(await store(page, (s) => s.previewMode)).toBe('edited');

		// Start shortly before the cut that begins at 3.75 s and play through it.
		const cut = await store(page, (s) =>
			s.edl.find((r: any) => r.action === 'remove' && r.start > 3 && r.start < 4)
		);
		await page.evaluate((t) => (window as any).__editor.player.seek(t), cut.start - 0.3);
		await page.getByTestId('play').click();
		await expect
			.poll(
				() =>
					page.evaluate(
						() => (document.querySelector('[data-testid=video]') as HTMLVideoElement).currentTime
					),
				{
					timeout: 5000
				}
			)
			.toBeGreaterThan(cut.end);
		const sawRemoved = await page.evaluate(
			({ start, end }) =>
				new Promise<boolean>((resolve) => {
					const v = document.querySelector('[data-testid=video]') as HTMLVideoElement;
					let hit = false;
					const tick = () => {
						if (v.currentTime > start + 0.05 && v.currentTime < end - 0.05) hit = true;
					};
					const id = setInterval(tick, 10);
					setTimeout(() => {
						clearInterval(id);
						resolve(hit);
					}, 500);
				}),
			cut
		);
		expect(sawRemoved).toBe(false);
		await page.keyboard.press('k');
		await expect.poll(() => store(page, (s) => s.playhead)).toBeGreaterThan(0);
	});

	test('exports an edited MP4 locally', async ({ page }) => {
		await openEditor(page);
		const expected = await store(page, (s) => s.stats.editedDuration);
		await page.getByTestId('export-download').click();
		await expect(page.getByTestId('export-done')).toBeVisible({ timeout: 30_000 });
		const duration = await page.evaluate(
			() =>
				new Promise<number>((resolve) => {
					const v = document.querySelector('[data-testid=export-result]') as HTMLVideoElement;
					if (v.readyState >= 1) resolve(v.duration);
					else v.onloadedmetadata = () => resolve(v.duration);
				})
		);
		// Video track is frame-exact; AAC adds < 1 frame of padding.
		expect(Math.abs(duration - expected)).toBeLessThan(0.15);
		const download = page.waitForEvent('download');
		await page.getByTestId('export-link').click();
		const file = await download;
		expect(file.suggestedFilename()).toBe('speech-pattern (edited).mp4');
	});

	test('remembers the project locally and restores it', async ({ page }) => {
		await openEditor(page);
		const p = await timelinePoint(page, 4.5, 'edits');
		await page.mouse.click(p.x, p.y);
		await expect(page.getByTestId('manual-count')).toBeVisible();
		await page.evaluate(() => (window as any).__editor.store.saveNow());
		await page.reload();
		await page.setInputFiles('[data-testid=file-input]', (await import('./helpers')).MP4);
		await expect(page.getByText('Restored your previous session')).toBeVisible();
		await expect(page.getByTestId('manual-count')).toContainText('1 manual edit');
	});

	test('shows keyboard shortcuts and diagnostics', async ({ page }) => {
		await openEditor(page);
		await page.keyboard.press('?');
		await expect(page.getByTestId('shortcuts')).toContainText('Undo');
		await page.keyboard.press('Escape');
		await page.getByRole('button', { name: 'Diagnostics' }).click();
		await expect(page.getByTestId('diagnostics')).toContainText('Audio analysis time');
	});
});
