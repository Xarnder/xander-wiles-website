import { describe, expect, it } from 'vitest';
import { lakeEdgeDepth, lakeKinds } from '../WaterRenderer';
import type { RiverDefinition, RiverSample } from '../HydrologyTypes';

/** A straight river along +x, one sample every 8 m, `count` samples long. */
function river(count: number, extra: Partial<RiverDefinition>): RiverDefinition {
	const samples = Array.from(
		{ length: count },
		(_, i) => ({ x: i * 8, z: 0, waterY: 1, tangentX: 1, tangentZ: 0 }) as RiverSample
	);
	return { id: 'r', samples, endIndex: count, ...extra } as RiverDefinition;
}

describe('where a river meets a lake, the two water surfaces blend', () => {
	it('fades the ripples in before the shore, then carries on under the lake and fades out', () => {
		// The shore is at x = 156: between samples 19 (x = 152) and 20 (x = 160).
		const r = river(24, { sinkLakeId: 'end:r', lakeLockStart: 19 });
		const kinds = lakeKinds(r, 24, (x) => x >= 156);
		// On the river, 16 m or more before the shore: plain river.
		expect(kinds[17]).toBe(0);
		// Rising smoothly towards the shore (sample 19 is 4 m before it).
		for (let i = 15; i <= 19; i++) expect(kinds[i]).toBeGreaterThanOrEqual(kinds[i - 1]);
		expect(kinds[19]).toBeGreaterThan(0.8);
		expect(kinds[19]).toBeLessThan(1);
		// 4 m past the shore: the lake's look, two-thirds faded out; from 6 m on, gone.
		expect(kinds[20]).toBeCloseTo(1 + 4 / 6, 2);
		expect(kinds[21]).toBe(2);
		expect(kinds[23]).toBe(2);
	});

	it('does the same where a river leaves its source pond, and nothing for a river with no lakes', () => {
		// The pond's shore is at x = 6.
		const r = river(20, { outletOfLakeId: 'spring:r', lakeLockEnd: 2 });
		const kinds = lakeKinds(r, 20, (x) => x < 6);
		expect(kinds[0]).toBeCloseTo(2, 2);
		expect(kinds[1]).toBeGreaterThan(0.95);
		expect(kinds[1]).toBeLessThan(1);
		expect(kinds[3]).toBe(0);
		expect([...lakeKinds(river(20, {}), 20, () => true)].every((k) => k === 0)).toBe(true);
	});

	it('keeps the lake at full depth where a river at its level crosses the shore, and fades it elsewhere', () => {
		const mouth = { waterType: 'river' as const, waterSurfaceY: 2.05 };
		const dryShore = { waterType: 'none' as const, waterSurfaceY: 0 };
		const otherRiver = { waterType: 'river' as const, waterSurfaceY: 4 };
		expect(lakeEdgeDepth(1, 1.4, mouth, 2)).toBe(1.4);
		expect(lakeEdgeDepth(1, 1.4, dryShore, 2)).toBe(0);
		expect(lakeEdgeDepth(1, 1.4, otherRiver, 2)).toBe(0);
		expect(lakeEdgeDepth(0.95, 1.4, dryShore, 2)).toBe(1.4);
		expect(lakeEdgeDepth(1.03, 1.4, mouth, 2)).toBe(-0.05);
	});
});
