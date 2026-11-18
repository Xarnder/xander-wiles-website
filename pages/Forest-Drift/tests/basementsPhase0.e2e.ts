import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

/**
 * Basements and Joined Foundations Phase 0, on the dev preview page (`/basements/?dev`): the
 * terrain under a basement is cut from real chunks, can be restored, and the Phase 0 numbers (terrain
 * holes, walking, join maths) stay inside the plan's budgets. Runs in Chromium, WebKit and Firefox.
 * `BASEMENTS_OUT` (a folder) saves each engine's numbers; `BASEMENTS_SHOTS` saves a screenshot.
 */

interface Report {
	terrain: { populateMs: number; populateHoledMs: number; cutMs: number; cutCells: number };
	walking: { solidUs: number; basementUs: number; extraUs: number };
	joins: {
		buildingsMs: number;
		buildings: number;
		outlineUs: number;
		polygonInsideUs: number;
		segmentInsideUs: number;
	};
}

interface Preview {
	holedCells(): number;
	setCut(on: boolean): void;
	bench(options?: { rounds?: number; calls?: number }): Report;
	report: Report | null;
	examples: {
		title: string;
		buildings: { anchorId: string; memberIds: string[]; loops: number }[];
	}[];
}

test('basements phase 0: terrain holes, walking and join maths in this engine', async ({
	page
}, info) => {
	test.setTimeout(120_000);
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await page.goto('/basements/?dev');
	await page.waitForFunction(
		() => !!(window as unknown as { basementsPreview?: Preview }).basementsPreview?.report,
		undefined,
		{ timeout: 60_000 }
	);

	// The 6 × 5-cell footprint is cut from the terrain, and restored when the cut is turned off.
	const cells = await page.evaluate(() => {
		const p = (window as unknown as { basementsPreview: Preview }).basementsPreview;
		const before = p.holedCells();
		p.setCut(false);
		const off = p.holedCells();
		p.setCut(true);
		return { before, off, after: p.holedCells() };
	});
	expect(cells).toEqual({ before: 30, off: 0, after: 30 });

	// The join examples group as they should in every engine.
	const examples = await page.evaluate(
		() => (window as unknown as { basementsPreview: Preview }).basementsPreview.examples
	);
	expect(
		examples.map((e) => e.buildings.map((b) => [b.anchorId, b.memberIds.length, b.loops]))
	).toEqual([
		[['cottage', 2, 1]],
		[['b', 4, 1]],
		[['n', 4, 2]],
		[
			['p', 2, 1],
			['q', 1, 1],
			['r', 1, 1]
		]
	]);

	// Three fresh runs of the numbers; the budgets hold on the median.
	const runs: Report[] = [];
	for (let i = 0; i < 3; i++)
		runs.push(
			await page.evaluate(() =>
				(window as unknown as { basementsPreview: Preview }).basementsPreview.bench()
			)
		);
	const median = (pick: (r: Report) => number) => runs.map(pick).sort((a, b) => a - b)[1];
	expect(runs[0].terrain.cutCells).toBe(400);
	// The extra work a hole adds to a chunk rebuild is the cut (timed in batches). The populate
	// times are recorded for comparison, but a 1 ms timer can't resolve their difference.
	expect(median((r) => r.terrain.cutMs)).toBeLessThan(0.5);
	expect(median((r) => r.walking.extraUs)).toBeLessThan(2);
	expect(median((r) => r.joins.buildingsMs)).toBeLessThan(2);
	expect(errors).toEqual([]);

	const out = process.env.BASEMENTS_OUT;
	if (out) {
		await mkdir(out, { recursive: true });
		const engine = info.project.name.split('-')[0];
		await writeFile(
			join(out, `bench-${engine}.json`),
			JSON.stringify(
				{ engine, userAgent: await page.evaluate(() => navigator.userAgent), runs },
				null,
				2
			)
		);
	}
	if (process.env.BASEMENTS_SHOTS && info.project.name === 'chromium') {
		await page.setViewportSize({ width: 1400, height: 820 });
		await page.waitForTimeout(500);
		await page.screenshot({ path: join(process.env.BASEMENTS_SHOTS, 'preview-page.png') });
	}
});
