import { describe, expect, it } from 'vitest';
import {
	clampFrameDepth,
	clampFrameWidth,
	clampInteriorDepth,
	FRAME_DEPTH_BEYOND_WALL,
	WINDOW_GLASS_FRAME_OVERLAP,
	computeDoorFrameLayout,
	computeDoorHandlePlacement,
	computeWindowCentreCross,
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

		for (const piece of [
			layout.left,
			layout.right,
			layout.top,
			layout.bottom,
			layout.mullion,
			layout.transom,
			layout.glass
		]) {
			expect(piece).not.toBeNull();
			expectWithin(piece!, opening);
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

describe('four-pane centre cross', () => {
	it('places a vertical mullion and horizontal transom that meet at the glass centre', () => {
		const opening = rect(0, 1.2, 0, 1.4);
		const layout = computeWindowFrameLayout(opening, 0.08, 0.08, 0.15);
		expect(layout.mullion).not.toBeNull();
		expect(layout.transom).not.toBeNull();

		const midU = (layout.glass.minU + layout.glass.maxU) / 2;
		const midY = (layout.glass.minY + layout.glass.maxY) / 2;
		expect((layout.mullion!.minU + layout.mullion!.maxU) / 2).toBeCloseTo(midU);
		expect((layout.transom!.minY + layout.transom!.maxY) / 2).toBeCloseTo(midY);
		expect(layout.mullion!.maxU - layout.mullion!.minU).toBeCloseTo(layout.frameWidth);
		expect(layout.transom!.maxY - layout.transom!.minY).toBeCloseTo(layout.frameWidth);
		expect(layout.mullion!.minY).toBeCloseTo(layout.bottom.maxY);
		expect(layout.mullion!.maxY).toBeCloseTo(layout.top.minY);
		expect(layout.transom!.minU).toBeCloseTo(layout.left.maxU);
		expect(layout.transom!.maxU).toBeCloseTo(layout.right.minU);
	});

	it('overlaps the inner frame hole so glass edges sit inside the timber', () => {
		const opening = rect(0, 1.2, 0, 1.4);
		const layout = computeWindowFrameLayout(opening, 0.08, 0.08, 0.15);
		expect(layout.glass.minU).toBeCloseTo(layout.left.maxU - WINDOW_GLASS_FRAME_OVERLAP);
		expect(layout.glass.maxU).toBeCloseTo(layout.right.minU + WINDOW_GLASS_FRAME_OVERLAP);
		expect(layout.glass.minY).toBeCloseTo(layout.bottom.maxY - WINDOW_GLASS_FRAME_OVERLAP);
		expect(layout.glass.maxY).toBeCloseTo(layout.top.minY + WINDOW_GLASS_FRAME_OVERLAP);
		expectWithin(layout.glass, opening);
	});

	it('does not shrink or split the glass rect — the cross sits inside one intact pane', () => {
		const opening = rect(0, 1.2, 0, 1.4);
		const layout = computeWindowFrameLayout(opening, 0.08, 0.08, 0.15);
		expect(layout.glass.minU).toBeLessThan(layout.left.maxU);
		expect(layout.glass.maxU).toBeGreaterThan(layout.right.minU);
		expect(layout.glass.minY).toBeLessThan(layout.bottom.maxY);
		expect(layout.glass.maxY).toBeGreaterThan(layout.top.minY);
	});

	it('omits the cross when the glass is too small to leave four panes', () => {
		expect(computeWindowCentreCross(rect(0, 0.1, 0, 0.1), 0.08)).toBeNull();
		expect(computeWindowCentreCross(rect(0, 0.16, 0, 0.16), 0.08)).toBeNull();
	});
});

describe('clampFrameDepth', () => {
	it('is always thicker than the wall so the frame sits proud of both faces', () => {
		expect(clampFrameDepth(0.08, 0.15)).toBeGreaterThan(0.15);
		expect(clampFrameDepth(0.08, 0.15)).toBeCloseTo(0.15 + FRAME_DEPTH_BEYOND_WALL);
		expect(clampFrameDepth(0.01, 0.4)).toBeGreaterThan(0.4);
	});

	it('uses the configured depth when it is already thicker than the proud minimum', () => {
		expect(clampFrameDepth(0.4, 0.1)).toBeCloseTo(0.4);
	});

	it('never returns zero or negative, even for a vanishingly thin wall', () => {
		expect(clampFrameDepth(0.08, 0)).toBeGreaterThan(0);
	});
});

describe('clampInteriorDepth', () => {
	it('never exceeds the wall thickness', () => {
		expect(clampInteriorDepth(0.3, 0.1)).toBeLessThanOrEqual(0.1);
	});
});

describe('clampFrameWidth', () => {
	it('is always positive for any positive opening size', () => {
		expect(clampFrameWidth(0.08, 0.01, 0.01)).toBeGreaterThan(0);
	});
});

describe('door fit', () => {
	it('the leaf fills the inner frame with no gap when clearance is 0', () => {
		const opening = rect(0, 1.2, 0, 2.1);
		const layout = computeDoorFrameLayout(opening, 0.08, 0.08, 0.15, 0, 'left');

		expectWithin(layout.leaf, opening);
		expect(layout.leaf.minU).toBeCloseTo(layout.left.maxU);
		expect(layout.leaf.maxU).toBeCloseTo(layout.right.minU);
		expect(layout.leaf.maxY).toBeCloseTo(layout.top.minY);
		expect(layout.leaf.maxU - layout.leaf.minU).toBeCloseTo(1.2 - 0.16);
		expect(layout.leaf.maxY - layout.leaf.minY).toBeCloseTo(2.1 - 0.08);
	});

	it('an explicit clearance insets the leaf from the jambs and lintel', () => {
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

describe('door handle placement', () => {
	it('sits on the latch / swing half, never the hinge half', () => {
		const left = computeDoorHandlePlacement(0.9, 2.1, 'left');
		const right = computeDoorHandlePlacement(0.9, 2.1, 'right');
		expect(left.localX).toBeGreaterThan(0.9 / 2);
		expect(right.localX).toBeLessThan(-0.9 / 2);
		expect(Math.abs(left.localX)).toBeCloseTo(Math.abs(right.localX));
		expect(left.localX).toBeCloseTo(0.9 - 0.07);
		expect(right.localX).toBeCloseTo(-(0.9 - 0.07));
	});

	it('aims the lever toward the hinge from the latch edge', () => {
		expect(computeDoorHandlePlacement(0.9, 2.1, 'left').leverSign).toBe(-1);
		expect(computeDoorHandlePlacement(0.9, 2.1, 'right').leverSign).toBe(1);
	});

	it('uses standing-reach height on a full door and mid-height on a short leaf', () => {
		expect(computeDoorHandlePlacement(0.9, 2.1, 'left').localY).toBeCloseTo(1);
		expect(computeDoorHandlePlacement(0.9, 0.8, 'left').localY).toBeCloseTo(0.4);
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
