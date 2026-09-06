import { describe, expect, it } from 'vitest';
import {
	clampFrameDepth,
	clampFrameWidth,
	computeDoorFrameLayout,
	computeWindowFrameLayout,
	hingeSideForOpening
} from '../openingVisualMath';
import type { UvRect } from '../openingVisualMath';

function rect(minU: number, maxU: number, minY: number, maxY: number): UvRect {
	return { minU, maxU, minY, maxY };
}

/** Asserts `inner` is a genuine sub-rect of `outer` — used everywhere below to check a frame piece (or the interior it leaves behind) never spills outside the opening it was derived from. */
function expectWithin(inner: UvRect, outer: UvRect): void {
	expect(inner.minU).toBeGreaterThanOrEqual(outer.minU - 1e-9);
	expect(inner.maxU).toBeLessThanOrEqual(outer.maxU + 1e-9);
	expect(inner.minY).toBeGreaterThanOrEqual(outer.minY - 1e-9);
	expect(inner.maxY).toBeLessThanOrEqual(outer.maxY + 1e-9);
}

describe('window fit', () => {
	it('a 1.2m x 1.4m opening keeps every frame piece within the opening bounds', () => {
		const opening = rect(0, 1.2, 0, 1.4);
		const layout = computeWindowFrameLayout(opening, 0.08, 0.08, 0.15);

		for (const piece of [layout.left, layout.right, layout.top, layout.bottom, layout.glass]) {
			expectWithin(piece, opening);
		}
		// Left/right run the full opening height; top/bottom span only the gap between them.
		expect(layout.left.minY).toBeCloseTo(opening.minY);
		expect(layout.left.maxY).toBeCloseTo(opening.maxY);
		expect(layout.top.minU).toBeCloseTo(layout.left.maxU);
		expect(layout.top.maxU).toBeCloseTo(layout.right.minU);
	});

	it('the glass rect never has zero or negative area', () => {
		const opening = rect(0, 1.2, 0, 1.4);
		const layout = computeWindowFrameLayout(opening, 0.08, 0.08, 0.15);
		expect(layout.glass.maxU - layout.glass.minU).toBeGreaterThan(0);
		expect(layout.glass.maxY - layout.glass.minY).toBeGreaterThan(0);
	});
});

describe('large window', () => {
	it('an arbitrarily large opening scales its frame correctly — a fixed frame width, not a stretched fixed-size model', () => {
		const opening = rect(0, 8, 0, 5);
		const layout = computeWindowFrameLayout(opening, 0.08, 0.08, 0.2);
		// Well under the 15% cap for both dimensions, so the configured width is used verbatim.
		expect(layout.frameWidth).toBeCloseTo(0.08);
		expectWithin(layout.glass, opening);
		// The glass pane should occupy nearly the whole opening on a large window.
		const glassArea =
			(layout.glass.maxU - layout.glass.minU) * (layout.glass.maxY - layout.glass.minY);
		const openingArea = (opening.maxU - opening.minU) * (opening.maxY - opening.minY);
		expect(glassArea / openingArea).toBeGreaterThan(0.9);
	});
});

describe('small window', () => {
	it('clamps frame width for a tiny opening instead of inheriting an oversized fixed frame', () => {
		const opening = rect(0, 0.3, 0, 0.3);
		const layout = computeWindowFrameLayout(opening, 0.08, 0.08, 0.15);
		// 15% of 0.3 = 0.045, well below the configured 0.08 — the adaptive clamp must have kicked in.
		expect(layout.frameWidth).toBeLessThan(0.08);
		expect(layout.frameWidth).toBeCloseTo(0.3 * 0.15);
	});

	it('never generates a negative or inverted interior area, however small the opening', () => {
		const opening = rect(0, 0.05, 0, 0.05);
		const layout = computeWindowFrameLayout(opening, 0.08, 0.08, 0.15);
		expect(layout.glass.maxU).toBeGreaterThan(layout.glass.minU);
		expect(layout.glass.maxY).toBeGreaterThan(layout.glass.minY);
		expectWithin(layout.glass, opening);
	});

	it('a narrow tall window clamps against whichever dimension is smaller', () => {
		const opening = rect(0, 0.4, 0, 3);
		const layout = computeWindowFrameLayout(opening, 0.2, 0.08, 0.15);
		// Width (0.4) is the limiting dimension: 15% of 0.4 = 0.06, far below the configured 0.2.
		expect(layout.frameWidth).toBeCloseTo(0.4 * 0.15);
		expectWithin(layout.glass, opening);
	});
});

describe('clampFrameDepth', () => {
	it('never exceeds the wall thickness', () => {
		expect(clampFrameDepth(0.3, 0.1)).toBeLessThanOrEqual(0.1);
	});

	it('prefers the configured depth when the wall is thick enough', () => {
		expect(clampFrameDepth(0.08, 0.3)).toBeCloseTo(0.08);
	});

	it('never returns zero or negative, even for a vanishingly thin wall', () => {
		expect(clampFrameDepth(0.08, 0)).toBeGreaterThan(0);
	});
});

describe('clampFrameWidth', () => {
	it('is always positive for any positive opening size', () => {
		expect(clampFrameWidth(0.08, 0.01, 0.01)).toBeGreaterThan(0);
	});
});

describe('door fit', () => {
	it('the leaf fits inside the frame with the expected clearance, and never touches the jambs/lintel', () => {
		const opening = rect(0, 1, 0, 2.1);
		const layout = computeDoorFrameLayout(opening, 0.08, 0.08, 0.15, 0.02, 'left');

		expectWithin(layout.leaf, opening);
		expect(layout.leaf.minU).toBeGreaterThan(layout.left.maxU);
		expect(layout.leaf.maxU).toBeLessThan(layout.right.minU);
		expect(layout.leaf.maxY).toBeLessThan(layout.top.minY);
	});

	it('resizes correctly for a wider, taller door', () => {
		const opening = rect(0, 1.6, 0, 2.6);
		const layout = computeDoorFrameLayout(opening, 0.08, 0.08, 0.15, 0.02, 'right');
		expectWithin(layout.leaf, opening);
		const leafWidth = layout.leaf.maxU - layout.leaf.minU;
		const leafHeight = layout.leaf.maxY - layout.leaf.minY;
		expect(leafWidth).toBeGreaterThan(1.3);
		expect(leafHeight).toBeGreaterThan(2.3);
	});
});

describe('door bottom', () => {
	it('the door frame layout contains no bottom crosspiece — only left, right, and top', () => {
		const layout = computeDoorFrameLayout(rect(0, 1, 0, 2.1), 0.08, 0.08, 0.15, 0.02, 'left');
		expect(Object.keys(layout)).not.toContain('bottom');
	});

	it('the leaf and both jambs stay flush with the floor (minY of the opening), not lifted off it', () => {
		const opening = rect(0, 1, 0, 2.1);
		const layout = computeDoorFrameLayout(opening, 0.08, 0.08, 0.15, 0.02, 'left');
		expect(layout.leaf.minY).toBeCloseTo(opening.minY);
		expect(layout.left.minY).toBeCloseTo(opening.minY);
		expect(layout.right.minY).toBeCloseTo(opening.minY);
	});
});

describe('hinge side', () => {
	it('is deterministic — the same opening id always produces the same hinge side', () => {
		const a = hingeSideForOpening('opening-123');
		const b = hingeSideForOpening('opening-123');
		expect(a).toBe(b);
	});

	it('the hinge edge sits at the leaf edge matching the requested side', () => {
		const opening = rect(0, 1, 0, 2.1);
		const left = computeDoorFrameLayout(opening, 0.08, 0.08, 0.15, 0.02, 'left');
		expect(left.hingeU).toBeCloseTo(left.leaf.minU);

		const right = computeDoorFrameLayout(opening, 0.08, 0.08, 0.15, 0.02, 'right');
		expect(right.hingeU).toBeCloseTo(right.leaf.maxU);
	});

	it('produces both left and right across a range of ids, rather than always picking one', () => {
		const sides = new Set(Array.from({ length: 20 }, (_, i) => hingeSideForOpening(`door-${i}`)));
		expect(sides.has('left')).toBe(true);
		expect(sides.has('right')).toBe(true);
	});
});
