import { describe, expect, it } from 'vitest';
import {
	BiomeScan,
	PATCH_INSET_CELLS,
	PATCH_MIN_INSET_CELLS,
	SCAN_RANGE,
	SCAN_SPACING,
	type Classify
} from '../biomeSearch';

interface Disc {
	x: number;
	z: number;
	r: number;
	biome: number;
}

/** Biome 0 everywhere, with discs of other biomes on top (later discs win). */
const discs =
	(list: Disc[], ox = 0, oz = 0): Classify =>
	(x, z) => {
		let biome = 0;
		for (const d of list) if (Math.hypot(x - ox - d.x, z - oz - d.z) <= d.r) biome = d.biome;
		return biome;
	};

const scan = (classify: Classify, x = 0, z = 0, count = 4) =>
	new BiomeScan(x, z, classify, count).run();

describe('BiomeScan', () => {
	it("gives each biome's nearest pin distance, and none beyond 16 km", () => {
		const s = scan(
			discs([
				{ x: 3000, z: 0, r: 400, biome: 1 },
				{ x: 0, z: -7000, r: 300, biome: 2 },
				{ x: 17_000, z: 0, r: 600, biome: 3 }
			])
		);
		const nearest = s.nearest();
		expect(s.here).toBe(0);
		// You're in biome 0's only patch: no other one.
		expect(nearest[0]).toBeNull();
		// The disc's near edge is 2.6 km off; its pin is 128–256 m further in.
		expect(nearest[1]).toBe(s.patches(1)[0].distance);
		expect(nearest[1]).toBeGreaterThanOrEqual(2600 + 128);
		expect(nearest[1]).toBeLessThanOrEqual(2600 + 256);
		expect(nearest[2]).toBe(s.patches(2)[0].distance);
		expect(nearest[2]).toBeGreaterThan(6700);
		// 16.4 km off: beyond the range.
		expect(nearest[3]).toBeNull();
		// The corners are skipped: about π/4 of the square.
		expect(s.sampled).toBeLessThan(Math.PI * (SCAN_RANGE / SCAN_SPACING + 1) ** 2 + 1000);
	});

	it('reports nothing until done, then a pin distance for each biome', () => {
		const s = new BiomeScan(0, 0, discs([{ x: 4000, z: 4000, r: 500, biome: 1 }]), 2);
		let t = 0;
		let steps = 0;
		while (!s.step(1, () => t++)) {
			expect(s.nearest()).toEqual([]);
			expect(s.progress).toBeLessThan(1);
			steps++;
		}
		expect(steps).toBeGreaterThan(1000);
		expect(s.progress).toBe(1);
		expect(s.nearest()).toEqual([null, s.patches(1)[0].distance]);
	});

	it('gives the same grid in slices as in one go', () => {
		const layout = discs([
			{ x: 2500, z: 1200, r: 900, biome: 1 },
			{ x: -4000, z: 300, r: 500, biome: 2 }
		]);
		const whole = scan(layout);
		const sliced = new BiomeScan(0, 0, layout, 4);
		let t = 0;
		let slices = 0;
		while (!sliced.step(8, () => t++)) slices++;
		expect(slices).toBeGreaterThan(100);
		expect(sliced.cells).toEqual(whole.cells);
		expect(sliced.nearest()).toEqual(whole.nearest());
	});
});

describe('BiomeScan.patches', () => {
	it('pins the nearest patch well inside, on the near side', () => {
		const s = scan(discs([{ x: 3000, z: 0, r: 600, biome: 1 }]));
		const [patch, ...rest] = s.patches(1);
		expect(rest).toHaveLength(0);
		expect(patch.inset).toBeGreaterThanOrEqual(PATCH_INSET_CELLS * SCAN_SPACING);
		// At least 100 m inside the disc's true edge, and on the side facing the centre.
		const fromEdge = 600 - Math.hypot(patch.x - 3000, patch.z);
		expect(fromEdge).toBeGreaterThanOrEqual(100);
		expect(patch.x).toBeLessThan(3000 - 300);
		expect(patch.distance).toBe(Math.round(Math.hypot(patch.x, patch.z)));
	});

	it('uses the most-inside cell of a patch too thin for the full inset', () => {
		// A strip 200 m wide: at most about 1.5 cells from its edge.
		const strip: Classify = (x, z) => (x > 4000 && x < 4200 && Math.abs(z) < 3000 ? 1 : 0);
		const [patch] = scan(strip).patches(1);
		expect(patch).toBeDefined();
		expect(patch.inset).toBeLessThan(PATCH_INSET_CELLS * SCAN_SPACING);
		expect(patch.x).toBeGreaterThan(4000);
		expect(patch.x).toBeLessThan(4200);
		expect(strip(patch.x, patch.z)).toBe(1);
	});

	it('passes over specks on a border unless there is nothing bigger', () => {
		// A 100 m speck of biome 1 at 2 km, and a real patch at 6 km.
		const s = scan(
			discs([
				{ x: 2000, z: 0, r: 50, biome: 1 },
				{ x: -6000, z: 0, r: 500, biome: 1 },
				{ x: 0, z: 3000, r: 50, biome: 2 }
			])
		);
		const [patch] = s.patches(1);
		expect(patch.x).toBeLessThan(-5000);
		expect(s.nearest()[1]).toBe(patch.distance);
		// Biome 2 is only a speck: that's still worth pinning.
		const [speck] = s.patches(2);
		expect(Math.hypot(speck.x, speck.z - 3000)).toBeLessThan(100);
		expect(speck.inset).toBeLessThan(PATCH_MIN_INSET_CELLS * SCAN_SPACING);
	});

	it('returns at most five patches, nearest first, at least 1 km apart', () => {
		// Twenty small discs 600 m apart along a line: neighbours are too close to both count.
		const list: Disc[] = Array.from({ length: 20 }, (_, i) => ({
			x: 2000 + i * 600,
			z: 0,
			r: 250,
			biome: 1
		}));
		const patches = scan(discs(list)).patches(1);
		expect(patches).toHaveLength(5);
		for (let i = 1; i < patches.length; i++)
			expect(patches[i].distance).toBeGreaterThanOrEqual(patches[i - 1].distance);
		for (const a of patches)
			for (const b of patches)
				if (a !== b) expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThanOrEqual(1000);
		expect(patches[0].x).toBeLessThan(2300);
	});

	it('leaves out the patch you are standing in', () => {
		const s = scan(
			discs([
				{ x: 0, z: 0, r: 800, biome: 1 },
				{ x: 0, z: 5000, r: 500, biome: 1 }
			])
		);
		expect(s.here).toBe(1);
		const patches = s.patches(1);
		expect(patches).toHaveLength(1);
		expect(patches[0].z).toBeGreaterThan(4500);
		// Another biome's patch under you isn't affected.
		expect(s.patches(0).length).toBeGreaterThan(0);
	});

	it('finds nothing for a biome not in range', () => {
		const s = scan(discs([{ x: 17_500, z: 0, r: 600, biome: 2 }]));
		expect(s.patches(2)).toEqual([]);
		expect(s.patches(3)).toEqual([]);
	});

	it('works the same 200 km from the origin', () => {
		const layout: Disc[] = [
			{ x: 3000, z: -2000, r: 700, biome: 1 },
			{ x: -6000, z: 4000, r: 400, biome: 2 }
		];
		const near = scan(discs(layout));
		for (const [ox, oz] of [
			[200_000, -200_000],
			[-200_000, 200_000]
		]) {
			const far = scan(discs(layout, ox, oz), ox, oz);
			expect(far.nearest()).toEqual(near.nearest());
			const a = near.patches(1)[0],
				b = far.patches(1)[0];
			expect(b.x - ox).toBeCloseTo(a.x, 6);
			expect(b.z - oz).toBeCloseTo(a.z, 6);
			expect(b.distance).toBe(a.distance);
		}
	});
});
