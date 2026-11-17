import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

/**
 * Find a biome Phase 0: the scan in the map worker, on the dev preview page (`/biome-map/?dev`).
 * Checks it finishes with a pin for every biome in range, and measures its cost and how much it
 * delays a fresh view's tiles. Runs in Chromium, WebKit and Firefox. `FIND_BIOME_OUT` (a folder)
 * saves each engine's numbers and distances, so engines can be compared.
 */

interface Preview {
	setView(level: number, x?: number, z?: number): void;
	centre(): { x: number; z: number };
	scan(): Promise<{
		done: boolean;
		nearest: (number | null)[];
		here: number;
		ms: number;
		sampled: number;
	} | null>;
	pick(biome: number): Promise<{ x: number; z: number; distance: number }[]>;
	landReady(): boolean;
	settled(): boolean;
}

const preview = (page: Page) =>
	page.waitForFunction(
		() => !!(window as unknown as { biomeMapPreview?: unknown }).biomeMapPreview
	);

/** Moves the view to a fresh spot and times its land and its water, optionally scanning at once. */
async function freshView(page: Page, x: number, z: number, scan: boolean) {
	return page.evaluate(
		async ({ x, z, scan }) => {
			const p = (window as unknown as { biomeMapPreview: Preview }).biomeMapPreview;
			const start = performance.now();
			p.setView(3, x, z);
			const scanning = scan ? p.scan() : null;
			let land = -1;
			while (performance.now() - start < 30_000) {
				await new Promise((r) => setTimeout(r, 4));
				if (land < 0 && p.landReady()) land = performance.now() - start;
				if (p.settled()) break;
			}
			const settled = performance.now() - start;
			const result = scanning ? await scanning : null;
			return {
				landMs: Math.round(land),
				settledMs: Math.round(settled),
				scanMs: result ? Math.round(result.ms) : null,
				scanWallMs: result ? Math.round(performance.now() - start) : null
			};
		},
		{ x, z, scan }
	);
}

test('find a biome: the scan, pins, and tiles alongside', async ({ page }, info) => {
	test.setTimeout(240_000);
	await page.goto('/biome-map/?dev&level=3');
	await preview(page);
	await page.waitForFunction(() =>
		(window as unknown as { biomeMapPreview: Preview }).biomeMapPreview.settled()
	);

	// The scan round the Main World's spawn, three times (the first warms the engine up).
	const scans = [];
	let last: (NonNullable<Awaited<ReturnType<Preview['scan']>>> & { wall: number }) | null = null;
	for (const dx of [0, 300, 600]) {
		last = await page.evaluate(async (dx) => {
			const p = (window as unknown as { biomeMapPreview: Preview }).biomeMapPreview;
			const c = p.centre();
			p.setView(3, c.x + dx, c.z);
			const start = performance.now();
			const r = await p.scan();
			return r && { ...r, nearest: [...r.nearest], wall: performance.now() - start };
		}, dx);
		expect(last?.done).toBe(true);
		scans.push({ ms: Math.round(last!.ms), wallMs: Math.round(last!.wall) });
	}
	const nearest = last!.nearest;
	expect(nearest).toHaveLength(26);
	expect(nearest.filter((d) => d !== null).length).toBeGreaterThan(20);

	// Picking a biome gives pins, nearest first, the first at the listed distance.
	const desert = await page.evaluate(async () => {
		const p = (window as unknown as { biomeMapPreview: Preview }).biomeMapPreview;
		return (await p.pick(20)).map((q) => ({ x: q.x, z: q.z, distance: q.distance }));
	});
	if (nearest[20] !== null) {
		expect(desert.length).toBeGreaterThan(0);
		expect(desert[0].distance).toBe(nearest[20]);
	}
	// Screenshots for the phase record (`FIND_BIOME_SHOTS`, a folder; Chromium only).
	const shots = process.env.FIND_BIOME_SHOTS;
	if (shots && info.project.name === 'chromium') {
		await page.setViewportSize({ width: 1100, height: 1500 });
		const view = async (level: number, x: number, z: number) => {
			await page.evaluate(
				({ level, x, z }) =>
					(window as unknown as { biomeMapPreview: Preview }).biomeMapPreview.setView(level, x, z),
				{ level, x, z }
			);
			await page.waitForFunction(() =>
				(window as unknown as { biomeMapPreview: Preview }).biomeMapPreview.settled()
			);
			await page.waitForTimeout(300);
		};
		const centre = await page.evaluate(() =>
			(window as unknown as { biomeMapPreview: Preview }).biomeMapPreview.centre()
		);
		await view(5, centre.x, centre.z);
		await page.screenshot({ path: join(shots, 'desert-pins.png'), fullPage: true });
		await view(2, desert[0].x, desert[0].z);
		await page.locator('canvas').screenshot({ path: join(shots, 'desert-pin-close.png') });
		await view(5, centre.x, centre.z);
	}

	// A fresh view's tiles with and without a scan running, alternating, three times each.
	const tiles: { scan: boolean; landMs: number; settledMs: number; scanMs: number | null }[] = [];
	for (let i = 0; i < 6; i++) {
		const scan = i % 2 === 1;
		tiles.push({ scan, ...(await freshView(page, 40_000 * (i + 1), (i % 3) * 20_000, scan)) });
	}
	// Chromium only: the same scan with the CPU throttled 4× (a slower machine).
	let slow: { ms: number; wallMs: number } | null = null;
	if (info.project.name === 'chromium') {
		const cdp = await page.context().newCDPSession(page);
		await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
		slow = await page.evaluate(async () => {
			const p = (window as unknown as { biomeMapPreview: Preview }).biomeMapPreview;
			const c = p.centre();
			p.setView(3, c.x + 1000, c.z);
			const start = performance.now();
			const r = await p.scan();
			return { ms: Math.round(r!.ms), wallMs: Math.round(performance.now() - start) };
		});
		await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
	}
	const record = { engine: info.project.name, scans, slow, nearest, desert, tiles };
	console.log(JSON.stringify(record));
	if (process.env.FIND_BIOME_OUT) {
		await mkdir(process.env.FIND_BIOME_OUT, { recursive: true });
		await writeFile(
			join(process.env.FIND_BIOME_OUT, `${info.project.name}.json`),
			JSON.stringify(record, null, 2)
		);
	}
});
