import { describe, expect, it } from 'vitest';
import {
	cycleSnapMode,
	snapDrawingPoint,
	snapModeLabel,
	snapToNearestCorner
} from '../polygonDrawSnap';

function gp(gridX: number, gridZ: number) {
	return { gridX, gridZ };
}

describe('cycleSnapMode', () => {
	it('cycles off -> axis -> off when fewer than 3 points exist and wall corners are unavailable', () => {
		expect(cycleSnapMode('off', 0)).toBe('axis');
		expect(cycleSnapMode('axis', 0)).toBe('off');
		expect(cycleSnapMode('off', 2)).toBe('axis');
		expect(cycleSnapMode('axis', 2)).toBe('off');
	});

	it('cycles off -> axis -> axis-inline -> off once 3+ points exist, when wall corners are unavailable', () => {
		expect(cycleSnapMode('off', 3)).toBe('axis');
		expect(cycleSnapMode('axis', 3)).toBe('axis-inline');
		expect(cycleSnapMode('axis-inline', 3)).toBe('off');
	});

	it('falls back to off from axis-inline even if point count later drops (defensive)', () => {
		expect(cycleSnapMode('axis-inline', 0)).toBe('off');
	});

	it('cycles off -> axis -> wall-corners -> off with fewer than 3 points, when wall corners are available', () => {
		expect(cycleSnapMode('off', 0, true)).toBe('axis');
		expect(cycleSnapMode('axis', 0, true)).toBe('wall-corners');
		expect(cycleSnapMode('wall-corners', 0, true)).toBe('off');
	});

	it('cycles off -> axis -> axis-inline -> wall-corners -> off with 3+ points, when wall corners are available', () => {
		expect(cycleSnapMode('off', 3, true)).toBe('axis');
		expect(cycleSnapMode('axis', 3, true)).toBe('axis-inline');
		expect(cycleSnapMode('axis-inline', 3, true)).toBe('wall-corners');
		expect(cycleSnapMode('wall-corners', 3, true)).toBe('off');
	});

	it('never offers wall-corners when wallCornersAvailable is false, regardless of point count', () => {
		expect(cycleSnapMode('axis-inline', 5, false)).toBe('off');
	});
});

describe('snapDrawingPoint — off', () => {
	it('returns the raw point unchanged', () => {
		const raw = gp(5, 7);
		expect(snapDrawingPoint([gp(0, 0)], raw, 'off')).toEqual(raw);
	});

	it('returns the raw point unchanged with no prior points, regardless of mode', () => {
		const raw = gp(5, 7);
		expect(snapDrawingPoint([], raw, 'axis')).toEqual(raw);
		expect(snapDrawingPoint([], raw, 'axis-inline')).toEqual(raw);
	});
});

describe('snapDrawingPoint — axis', () => {
	it('locks Z to the last point when the drag is more horizontal', () => {
		const points = [gp(0, 0)];
		const result = snapDrawingPoint(points, gp(10, 3), 'axis');
		expect(result).toEqual(gp(10, 0));
	});

	it('locks X to the last point when the drag is more vertical', () => {
		const points = [gp(0, 0)];
		const result = snapDrawingPoint(points, gp(3, 10), 'axis');
		expect(result).toEqual(gp(0, 10));
	});

	it('favors the X axis on an exact tie', () => {
		const points = [gp(0, 0)];
		const result = snapDrawingPoint(points, gp(5, 5), 'axis');
		expect(result).toEqual(gp(5, 0));
	});

	it('handles negative directions correctly', () => {
		const points = [gp(10, 10)];
		expect(snapDrawingPoint(points, gp(2, 8), 'axis')).toEqual(gp(2, 10));
		expect(snapDrawingPoint(points, gp(8, 2), 'axis')).toEqual(gp(10, 2));
	});

	it('locks against the LAST point, not the first, once several points are confirmed', () => {
		const points = [gp(0, 0), gp(10, 0), gp(10, 10)];
		// Dragging mostly along X from the last point (10, 10).
		const result = snapDrawingPoint(points, gp(4, 11), 'axis');
		expect(result).toEqual(gp(4, 10));
	});

	it('returns the raw point if it exactly coincides with the last point (no direction to snap)', () => {
		const points = [gp(5, 5)];
		expect(snapDrawingPoint(points, gp(5, 5), 'axis')).toEqual(gp(5, 5));
	});
});

describe('snapDrawingPoint — axis-inline', () => {
	it('behaves exactly like plain axis snapping with fewer than 3 points', () => {
		const points = [gp(0, 0), gp(10, 0)];
		const raw = gp(11, 8); // close to x=10 (the last point) but also close to x=0 (the first)
		const axisResult = snapDrawingPoint(points, raw, 'axis');
		const inlineResult = snapDrawingPoint(points, raw, 'axis-inline');
		expect(inlineResult).toEqual(axisResult);
	});

	it('snaps the free coordinate to an earlier point when it is close enough — closing a rectangle flush with its first corner', () => {
		// A 3-sided rectangle so far: (0,0) -> (10,0) -> (10,10). Placing a 4th point near (1,10)
		// should snap its X to 0, lining the closing wall up with the very first corner.
		const points = [gp(0, 0), gp(10, 0), gp(10, 10)];
		const result = snapDrawingPoint(points, gp(1, 10), 'axis-inline');
		expect(result).toEqual(gp(0, 10));
	});

	it('does not snap to an earlier coordinate that is too far away', () => {
		const points = [gp(0, 0), gp(10, 0), gp(10, 10)];
		// Dragging along Z is locked to X=10 (the last point) either way; the raw X-free coordinate
		// isn't relevant here since the drag runs along Z, so nothing but the last point's X applies.
		// Use a drag along X instead, far from any earlier X value.
		const result = snapDrawingPoint(points, gp(50, 11), 'axis-inline');
		expect(result).toEqual(gp(50, 10)); // plain axis snap only — 50 is nowhere near 0 or 10
	});

	it('never searches the last point itself for an inline match — only genuinely earlier points', () => {
		// The last point's X (7) is unique, shared by no earlier point, so nothing should snap to
		// it via the inline search — only the two genuinely earlier X values (0 and 3) are eligible.
		const points = [gp(0, 0), gp(3, 0), gp(7, 7)];
		const result = snapDrawingPoint(points, gp(8, 8), 'axis-inline');
		expect(result).toEqual(gp(3, 7));
	});

	it('prefers the closest qualifying earlier coordinate when several are in range', () => {
		const points = [gp(0, 0), gp(3, 0), gp(3, 10)];
		// Earlier X candidates: 0 (from point 1) and 3 is the last point's own X, excluded. Only 0
		// qualifies as "earlier", so it wins regardless of closeness here — but verify explicitly.
		const result = snapDrawingPoint(points, gp(1, 11), 'axis-inline');
		expect(result).toEqual(gp(0, 10));
	});
});

describe('snapModeLabel', () => {
	it('returns null for off, and a short label otherwise', () => {
		expect(snapModeLabel('off')).toBeNull();
		expect(snapModeLabel('axis')).toBe('Snap: Axis');
		expect(snapModeLabel('axis-inline')).toBe('Snap: Axis + Inline');
		expect(snapModeLabel('wall-corners')).toBe('Snap: Wall Corners');
	});
});

describe('snapDrawingPoint — wall-corners', () => {
	it('passes the raw point through unchanged — wall-corner snapping is applied separately via snapToNearestCorner', () => {
		const raw = gp(5, 7);
		expect(snapDrawingPoint([gp(0, 0), gp(10, 0), gp(10, 10)], raw, 'wall-corners')).toEqual(raw);
	});
});

describe('snapToNearestCorner', () => {
	it('snaps to the nearest corner within tolerance', () => {
		const corners = [gp(0, 0), gp(40, 0), gp(40, 40), gp(0, 40)];
		expect(snapToNearestCorner(gp(2, 1), corners)).toEqual(gp(0, 0));
		expect(snapToNearestCorner(gp(38, 2), corners)).toEqual(gp(40, 0));
	});

	it('returns the raw point unchanged when no corner is within tolerance', () => {
		const corners = [gp(0, 0)];
		const raw = gp(100, 100);
		expect(snapToNearestCorner(raw, corners)).toEqual(raw);
	});

	it('returns the raw point unchanged when there are no corners at all', () => {
		const raw = gp(5, 5);
		expect(snapToNearestCorner(raw, [])).toEqual(raw);
	});

	it('prefers the closest of several qualifying corners', () => {
		const corners = [gp(0, 0), gp(3, 3)];
		expect(snapToNearestCorner(gp(2, 2), corners)).toEqual(gp(3, 3));
	});

	it('snaps exactly at the tolerance boundary (inclusive)', () => {
		// Tolerance is 10 cells; a corner exactly 10 away along one axis should still snap.
		expect(snapToNearestCorner(gp(0, 0), [gp(10, 0)])).toEqual(gp(10, 0));
	});
});
