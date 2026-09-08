import { describe, expect, it } from 'vitest';
import { computeSlabOpeningFrameBoxes, SLAB_OPENING_FRAME_OUTER_MAX } from '../slabOpeningFrameMath';

const SETTINGS = {
	slabOpeningFrameEnabled: true,
	slabOpeningFrameWidth: 0.055,
	slabOpeningFrameDepthExtra: 0.01
};

const HOLE = { minX: 0, maxX: 3, minZ: 0, maxZ: 1 };

function extents(boxes: ReturnType<typeof computeSlabOpeningFrameBoxes>) {
	return {
		minX: Math.min(...boxes.map((b) => b.minX)),
		maxX: Math.max(...boxes.map((b) => b.maxX)),
		minZ: Math.min(...boxes.map((b) => b.minZ)),
		maxZ: Math.max(...boxes.map((b) => b.maxZ))
	};
}

describe('computeSlabOpeningFrameBoxes', () => {
	it('returns nothing when framing is disabled', () => {
		expect(
			computeSlabOpeningFrameBoxes(HOLE, 3, 2.8, { ...SETTINGS, slabOpeningFrameEnabled: false })
		).toEqual([]);
	});

	it('builds four boards around the hole', () => {
		expect(computeSlabOpeningFrameBoxes(HOLE, 3, 2.8, SETTINGS)).toHaveLength(4);
	});

	it('sits proud of both slab faces and keeps the hole centre open', () => {
		const boxes = computeSlabOpeningFrameBoxes(HOLE, 3, 2.8, SETTINGS);
		for (const box of boxes) {
			expect(box.minY).toBeLessThan(2.8);
			expect(box.maxY).toBeGreaterThan(3);
		}
		const cx = 1.5;
		const cz = 0.5;
		const coversCentre = boxes.some(
			(b) => cx >= b.minX && cx <= b.maxX && cz >= b.minZ && cz <= b.maxZ
		);
		expect(coversCentre).toBe(false);
	});

	it('lines the cut from inside the hole instead of spreading a wide flange onto the slab', () => {
		const boxes = computeSlabOpeningFrameBoxes(HOLE, 3, 2.8, SETTINGS);
		const left = boxes.find((b) => b.minX < HOLE.minX + 1e-6 && b.maxX > HOLE.minX);
		expect(left).toBeDefined();
		expect(left!.maxX).toBeCloseTo(HOLE.minX + SETTINGS.slabOpeningFrameWidth);
		expect(HOLE.minX - left!.minX).toBeLessThanOrEqual(SLAB_OPENING_FRAME_OUTER_MAX + 1e-9);
		expect(left!.maxX - HOLE.minX).toBeGreaterThan(HOLE.minX - left!.minX);
	});

	it('never extends far enough outside the hole to pass through a wall on the same grid line', () => {
		const boxes = computeSlabOpeningFrameBoxes(HOLE, 3, 2.8, {
			...SETTINGS,
			slabOpeningFrameWidth: 0.4,
			slabOpeningFrameDepthExtra: 0.3
		});
		const box = extents(boxes);
		expect(HOLE.minX - box.minX).toBeLessThanOrEqual(SLAB_OPENING_FRAME_OUTER_MAX + 1e-9);
		expect(box.maxX - HOLE.maxX).toBeLessThanOrEqual(SLAB_OPENING_FRAME_OUTER_MAX + 1e-9);
		expect(HOLE.minZ - box.minZ).toBeLessThanOrEqual(SLAB_OPENING_FRAME_OUTER_MAX + 1e-9);
		expect(box.maxZ - HOLE.maxZ).toBeLessThanOrEqual(SLAB_OPENING_FRAME_OUTER_MAX + 1e-9);
		expect(SLAB_OPENING_FRAME_OUTER_MAX).toBeLessThan(0.05 / 2);
	});
});
