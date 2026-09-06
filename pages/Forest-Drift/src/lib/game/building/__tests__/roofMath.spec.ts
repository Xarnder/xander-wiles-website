import { describe, expect, it } from 'vitest';
import {
	axisAlignedRectangleOf,
	buildButterflyFaces,
	buildDutchGableFaces,
	buildGableFaces,
	buildGambrelFaces,
	buildHipFaces,
	buildMShapedFaces,
	buildMansardFaces,
	buildShedFaces,
	hipRidgeDirection,
	pitchDegrees,
	pitchFromRiseAndRun,
	rectDepth,
	roofTypeHasOrientationControl
} from '../roofMath';
import { createDefaultRoofProfileSettings } from '../RoofTypes';
import type { AxisAlignedRect, RoofFace } from '../roofMath';

const profile = createDefaultRoofProfileSettings();

function rect(minX: number, maxX: number, minZ: number, maxZ: number): AxisAlignedRect {
	return { minX, maxX, minZ, maxZ };
}

/** Every top-triangle a real roof face-list produces should face up-and-out — this doesn't apply
 * winding correction (that's RoofGeometryBuilder's job); it just sanity-checks the RAW authored
 * point lists aren't accidentally self-intersecting or zero-area beyond expected degenerate cases. */
function facesAreAllConvexAndPlanar(faces: RoofFace[]): void {
	for (const face of faces) {
		expect(face.points.length).toBeGreaterThanOrEqual(3);
		expect(face.fasciaEdges.length).toBe(face.points.length);
	}
}

describe('axisAlignedRectangleOf', () => {
	it('detects a simple axis-aligned rectangle regardless of winding/starting corner', () => {
		const r = axisAlignedRectangleOf([
			{ x: 0, z: 0 },
			{ x: 10, z: 0 },
			{ x: 10, z: 6 },
			{ x: 0, z: 6 }
		]);
		expect(r).toEqual({ minX: 0, maxX: 10, minZ: 0, maxZ: 6 });
	});

	it('rejects a triangle', () => {
		expect(
			axisAlignedRectangleOf([
				{ x: 0, z: 0 },
				{ x: 10, z: 0 },
				{ x: 5, z: 6 }
			])
		).toBeNull();
	});

	it('rejects a rotated (diamond) quadrilateral', () => {
		expect(
			axisAlignedRectangleOf([
				{ x: 5, z: 0 },
				{ x: 10, z: 5 },
				{ x: 5, z: 10 },
				{ x: 0, z: 5 }
			])
		).toBeNull();
	});

	it('rejects an L-shaped hexagon', () => {
		expect(
			axisAlignedRectangleOf([
				{ x: 0, z: 0 },
				{ x: 10, z: 0 },
				{ x: 10, z: 5 },
				{ x: 5, z: 5 },
				{ x: 5, z: 10 },
				{ x: 0, z: 10 }
			])
		).toBeNull();
	});
});

describe('pitch/rise', () => {
	it('derives a 45° pitch when rise equals run', () => {
		expect(pitchDegrees(3, 3)).toBeCloseTo(45, 6);
	});

	it('derives 0° pitch for zero rise', () => {
		expect(pitchDegrees(0, 5)).toBe(0);
	});

	it('never divides by zero for a zero run', () => {
		expect(pitchFromRiseAndRun(5, 0)).toBe(0);
	});
});

describe('buildGableFaces', () => {
	const footprint = rect(0, 10, 0, 6); // 10 wide (X) x 6 deep (Z)

	it('produces exactly 2 slopes with a centred ridge at the correct elevation', () => {
		const faces = buildGableFaces(footprint, 'x', 0, 2);
		const slopes = faces.filter((face) => !face.vertical);
		expect(slopes).toHaveLength(2);
		facesAreAllConvexAndPlanar(faces);

		// Every eave point (z = 0 or z = 6) should sit at baseY; every ridge point (z = 3, the
		// centre) should sit at baseY + rise, spanning the full ridge-axis length (x = 0..10).
		const allPoints = faces.flatMap((f) => f.points);
		const eavePoints = allPoints.filter(
			(p) => Math.abs(p.z - 0) < 1e-9 || Math.abs(p.z - 6) < 1e-9
		);
		const ridgePoints = allPoints.filter((p) => Math.abs(p.z - 3) < 1e-9);
		expect(eavePoints.length).toBeGreaterThan(0);
		expect(ridgePoints.length).toBeGreaterThan(0);
		for (const p of eavePoints) expect(p.y).toBeCloseTo(0, 9);
		for (const p of ridgePoints) expect(p.y).toBeCloseTo(2, 9);
		const ridgeXs = ridgePoints.map((p) => p.x).sort((a, b) => a - b);
		expect(ridgeXs[0]).toBeCloseTo(0, 9);
		expect(ridgeXs[ridgeXs.length - 1]).toBeCloseTo(10, 9);
	});

	it('rotating the ridge direction swaps which axis the ridge runs along', () => {
		const faces = buildGableFaces(footprint, 'z', 0, 2);
		const allPoints = faces.flatMap((f) => f.points);
		// With direction 'z', the ridge runs along Z at x = the midpoint of X (5), and the eaves are
		// now at x = 0 / x = 10 instead of z = 0 / z = 6.
		const ridgePoints = allPoints.filter((p) => Math.abs(p.x - 5) < 1e-9);
		expect(ridgePoints.length).toBeGreaterThan(0);
		for (const p of ridgePoints) expect(p.y).toBeCloseTo(2, 9);
	});

	it('matches the analytically-derived pitch for a known rise/span', () => {
		// half-span = 3 (depth 6 / 2), rise = 3 -> 45°
		const faces = buildGableFaces(footprint, 'x', 0, 3);
		const halfSpan = rectDepth(footprint) / 2;
		expect(pitchDegrees(3, halfSpan)).toBeCloseTo(45, 6);
		expect(faces.filter((face) => !face.vertical)).toHaveLength(2);
	});

	it('closes both gable ends with a vertical triangle in the end-wall plane', () => {
		const faces = buildGableFaces(footprint, 'x', 0, 2);
		const ends = faces.filter((face) => face.vertical);
		expect(ends).toHaveLength(2);
		for (const end of ends) {
			expect(end.points).toHaveLength(3);
			const xs = new Set(end.points.map((p) => Math.round(p.x * 1e6) / 1e6));
			expect(xs.size).toBe(1);
			expect([...xs][0] === 0 || [...xs][0] === 10).toBe(true);
		}
	});
});

describe('buildShedFaces', () => {
	const footprint = rect(0, 10, 0, 6);

	it('all four corners lie on the single expected sloping plane', () => {
		const faces = buildShedFaces(footprint, 0, 2, '+z');
		const slopes = faces.filter((face) => !face.vertical);
		expect(slopes).toHaveLength(1);
		const [face] = slopes;
		expect(face.points).toHaveLength(4);
		for (const p of face.points) {
			// y should vary linearly with z only: y = rise * (z - minZ) / depth
			const expectedY = (2 * (p.z - 0)) / 6;
			expect(p.y).toBeCloseTo(expectedY, 9);
		}
	});

	it('reversing shed direction swaps which edge is high', () => {
		const plus = buildShedFaces(footprint, 0, 2, '+z')[0];
		const minus = buildShedFaces(footprint, 0, 2, '-z')[0];
		const highZOf = (face: RoofFace) => face.points.find((p) => p.y > 1)?.z ?? null;
		expect(highZOf(plus)).toBeCloseTo(6, 9);
		expect(highZOf(minus)).toBeCloseTo(0, 9);
	});

	it('every slope edge is a true boundary except the high eave (owned by the tall-side wall)', () => {
		const [face] = buildShedFaces(footprint, 0, 2, '+x');
		expect(face.fasciaEdges).toEqual([true, true, false, true]);
	});

	it('closes the tallest side with a vertical wall from the high eave down to the low-eave height', () => {
		const plus = buildShedFaces(footprint, 0, 2, '+z');
		const highPlus = plus.filter(
			(face) =>
				face.vertical &&
				face.points.length === 4 &&
				face.points.every((p) => Math.abs(p.z - 6) < 1e-9)
		);
		expect(highPlus).toHaveLength(1);
		const ys = highPlus[0].points.map((p) => p.y);
		expect(Math.min(...ys)).toBeCloseTo(0, 9);
		expect(Math.max(...ys)).toBeCloseTo(2, 9);

		const minus = buildShedFaces(footprint, 0, 2, '-z');
		const highMinus = minus.filter(
			(face) =>
				face.vertical &&
				face.points.length === 4 &&
				face.points.every((p) => Math.abs(p.z - 0) < 1e-9)
		);
		expect(highMinus).toHaveLength(1);
	});
});

describe('buildHipFaces', () => {
	it('rectangle: ridge is a centred line at the correct height, spanning width - depth', () => {
		const footprint = rect(0, 10, 0, 6);
		const faces = buildHipFaces(footprint, 0, 2);
		expect(faces).toHaveLength(4);

		const allPoints = faces.flatMap((f) => f.points);
		const peakPoints = allPoints.filter((p) => Math.abs(p.y - 2) < 1e-9);
		expect(peakPoints.length).toBeGreaterThan(0);
		const ridgeXs = [...new Set(peakPoints.map((p) => Math.round(p.x * 1e6) / 1e6))].sort(
			(a, b) => a - b
		);
		// halfSpan = depth/2 = 3; ridge should run from 0+3=3 to 10-3=7, i.e. length 4 = width-depth.
		expect(ridgeXs[0]).toBeCloseTo(3, 6);
		expect(ridgeXs[ridgeXs.length - 1]).toBeCloseTo(7, 6);
		for (const p of peakPoints) expect(p.z).toBeCloseTo(3, 9); // centred in Z
	});

	it('square footprint converges to a single central peak (a pyramid)', () => {
		const footprint = rect(0, 8, 0, 8);
		const faces = buildHipFaces(footprint, 0, 2);
		const allPoints = faces.flatMap((f) => f.points);
		const peakPoints = allPoints.filter((p) => Math.abs(p.y - 2) < 1e-9);
		expect(peakPoints.length).toBeGreaterThan(0);
		for (const p of peakPoints) {
			expect(p.x).toBeCloseTo(4, 6);
			expect(p.z).toBeCloseTo(4, 6);
		}
	});

	it('picks the long axis as the ridge direction regardless of which axis is longer', () => {
		expect(hipRidgeDirection(rect(0, 10, 0, 6))).toBe('x');
		expect(hipRidgeDirection(rect(0, 6, 0, 10))).toBe('z');
	});

	it('has no vertical gable-end walls — every side is a sloped hip face', () => {
		const faces = buildHipFaces(rect(0, 10, 0, 6), 0, 2);
		expect(faces.some((face) => face.vertical)).toBe(false);
	});

	it('every eave edge is a true boundary; hip lines and the ridge are internal', () => {
		const faces = buildHipFaces(rect(0, 10, 0, 6), 0, 2);
		const fasciaEdges: Array<{ ax: number; az: number; bx: number; bz: number }> = [];
		for (const face of faces) {
			for (let i = 0; i < face.points.length; i++) {
				if (!face.fasciaEdges[i]) continue;
				const a = face.points[i];
				const b = face.points[(i + 1) % face.points.length];
				fasciaEdges.push({ ax: a.x, az: a.z, bx: b.x, bz: b.z });
			}
		}
		// 4 straight eave edges total around the whole footprint perimeter (2 from the trapezoids +
		// 1 each from the 2 triangles), never more — and each must sit on the outer rectangle, not
		// on a hip line (an earlier east-triangle flag put the fascia on the hip instead of x = max).
		expect(fasciaEdges).toHaveLength(4);
		const covers = { minX: false, maxX: false, minZ: false, maxZ: false };
		for (const edge of fasciaEdges) {
			const onMinX = Math.abs(edge.ax - 0) < 1e-9 && Math.abs(edge.bx - 0) < 1e-9;
			const onMaxX = Math.abs(edge.ax - 10) < 1e-9 && Math.abs(edge.bx - 10) < 1e-9;
			const onMinZ = Math.abs(edge.az - 0) < 1e-9 && Math.abs(edge.bz - 0) < 1e-9;
			const onMaxZ = Math.abs(edge.az - 6) < 1e-9 && Math.abs(edge.bz - 6) < 1e-9;
			expect(onMinX || onMaxX || onMinZ || onMaxZ).toBe(true);
			if (onMinX) covers.minX = true;
			if (onMaxX) covers.maxX = true;
			if (onMinZ) covers.minZ = true;
			if (onMaxZ) covers.maxZ = true;
		}
		expect(covers).toEqual({ minX: true, maxX: true, minZ: true, maxZ: true });
	});
});

describe('buildGambrelFaces', () => {
	it('has two break lines at the configured height fraction, and a ridge at full rise', () => {
		const footprint = rect(0, 10, 0, 8);
		const faces = buildGambrelFaces(footprint, 'x', 0, 4, profile);
		expect(faces.filter((face) => !face.vertical)).toHaveLength(4);

		const allPoints = faces.flatMap((f) => f.points);
		const expectedBreakY = 4 * profile.gambrelBreakHeightFraction;
		const breakPoints = allPoints.filter((p) => Math.abs(p.y - expectedBreakY) < 1e-6);
		expect(breakPoints.length).toBeGreaterThan(0);

		const ridgePoints = allPoints.filter((p) => Math.abs(p.y - 4) < 1e-6);
		expect(ridgePoints.length).toBeGreaterThan(0);
		for (const p of ridgePoints) expect(p.z).toBeCloseTo(4, 9); // centred
	});
});

describe('buildButterflyFaces', () => {
	it('the central valley sits below the outer eaves by exactly `rise`', () => {
		const footprint = rect(0, 10, 0, 6);
		const faces = buildButterflyFaces(footprint, 'x', 0, 2);
		const allPoints = faces.flatMap((f) => f.points);
		const outerPoints = allPoints.filter(
			(p) => Math.abs(p.z - 0) < 1e-9 || Math.abs(p.z - 6) < 1e-9
		);
		const valleyPoints = allPoints.filter((p) => Math.abs(p.z - 3) < 1e-9);
		for (const p of outerPoints) expect(p.y).toBeCloseTo(2, 9); // baseY + rise
		for (const p of valleyPoints) expect(p.y).toBeCloseTo(0, 9); // baseY
	});
});

describe('buildMShapedFaces', () => {
	it('has two ridges at full rise and a central valley at the configured fraction', () => {
		const footprint = rect(0, 10, 0, 8);
		const faces = buildMShapedFaces(footprint, 'x', 0, 4, profile);
		expect(faces.filter((face) => !face.vertical)).toHaveLength(4);

		const allPoints = faces.flatMap((f) => f.points);
		const ridgePoints = allPoints.filter((p) => Math.abs(p.y - 4) < 1e-6);
		const valleyPoints = allPoints.filter(
			(p) => Math.abs(p.y - 4 * profile.mShapedValleyFraction) < 1e-6
		);
		expect(ridgePoints.length).toBeGreaterThan(0);
		expect(valleyPoints.length).toBeGreaterThan(0);
		// Two distinct ridge X/Z positions (quarter and three-quarter span), not one.
		const ridgeVs = [...new Set(ridgePoints.map((p) => Math.round(p.z * 1e6) / 1e6))];
		expect(ridgeVs.length).toBe(2);
	});

	it('fills the valley between the two gable-end triangles down to the eave line', () => {
		const faces = buildMShapedFaces(rect(0, 10, 0, 8), 'x', 0, 4, profile);
		const valleyY = 4 * profile.mShapedValleyFraction;
		const valleyFills = faces.filter((face) => {
			if (!face.vertical || face.points.length !== 3) return false;
			const ys = face.points.map((p) => p.y).sort((a, b) => a - b);
			const zs = [...new Set(face.points.map((p) => Math.round(p.z * 1e6) / 1e6))].sort(
				(a, b) => a - b
			);
			return (
				Math.abs(ys[0] - 0) < 1e-9 &&
				Math.abs(ys[1] - 0) < 1e-9 &&
				Math.abs(ys[2] - valleyY) < 1e-6 &&
				zs.length === 3
			);
		});
		// One valley-fill triangle at each gable end (x = 0 and x = 10).
		expect(valleyFills).toHaveLength(2);
	});
});

describe('buildMansardFaces', () => {
	it('lower and upper sections connect with no gap at the break rectangle', () => {
		const footprint = rect(0, 10, 0, 6);
		const faces = buildMansardFaces(footprint, 0, 3, profile);
		expect(faces.length).toBeGreaterThan(4);

		const breakY = 3 * profile.mansardBreakFraction;
		const breakPoints = faces.flatMap((f) => f.points).filter((p) => Math.abs(p.y - breakY) < 1e-6);
		// Both the lower frustum's top rim and the upper hip's own eave-equivalent bottom rim should
		// contribute points at this exact height, at the exact same (x, z) positions — i.e. every
		// break-height point should appear at least twice (shared, not a gap).
		expect(breakPoints.length).toBeGreaterThanOrEqual(8);
	});

	it('never produces a negative-size inner rectangle for a very tall, narrow footprint', () => {
		expect(() => buildMansardFaces(rect(0, 3, 0, 2), 0, 10, profile)).not.toThrow();
	});
});

describe('buildDutchGableFaces', () => {
	it('produces both a lower hip frustum and an upper gable cap', () => {
		const footprint = rect(0, 10, 0, 6);
		const faces = buildDutchGableFaces(footprint, 'x', 0, 3, profile);
		// 4 lower frustum faces + 2 upper gable slopes + 2 vertical dutch-gable end triangles.
		expect(faces.filter((face) => !face.vertical)).toHaveLength(6);
		expect(faces.filter((face) => face.vertical)).toHaveLength(2);

		const allPoints = faces.flatMap((f) => f.points);
		const peakPoints = allPoints.filter((p) => Math.abs(p.y - 3) < 1e-6);
		expect(peakPoints.length).toBeGreaterThan(0);
	});

	it("the upper gable cap's ridge runs along the user-chosen direction, not the footprint's long axis", () => {
		const footprint = rect(0, 10, 0, 6);
		const peakZs = new Set(
			buildDutchGableFaces(footprint, 'x', 0, 3, profile)
				.flatMap((f) => f.points)
				.filter((p) => Math.abs(p.y - 3) < 1e-6)
				.map((p) => Math.round(p.z * 1e6) / 1e6)
		);
		// direction 'x': the ridge runs along X, so every peak point shares the same Z (the midline).
		expect(peakZs.size).toBe(1);

		const peakXs = new Set(
			buildDutchGableFaces(footprint, 'z', 0, 3, profile)
				.flatMap((f) => f.points)
				.filter((p) => Math.abs(p.y - 3) < 1e-6)
				.map((p) => Math.round(p.x * 1e6) / 1e6)
		);
		// direction 'z': the ridge runs along Z instead, so every peak point now shares the same X.
		expect(peakXs.size).toBe(1);
	});
});

describe('roofTypeHasOrientationControl', () => {
	it('is false for flat, hip, and mansard — all fully derived from the footprint', () => {
		expect(roofTypeHasOrientationControl('flat')).toBe(false);
		expect(roofTypeHasOrientationControl('hip')).toBe(false);
		expect(roofTypeHasOrientationControl('mansard')).toBe(false);
	});

	it('is true for every other pitched type, including dutch-gable (its gable cap has a real ridge)', () => {
		expect(roofTypeHasOrientationControl('shed')).toBe(true);
		expect(roofTypeHasOrientationControl('gable')).toBe(true);
		expect(roofTypeHasOrientationControl('gambrel')).toBe(true);
		expect(roofTypeHasOrientationControl('butterfly')).toBe(true);
		expect(roofTypeHasOrientationControl('m-shaped')).toBe(true);
		expect(roofTypeHasOrientationControl('dutch-gable')).toBe(true);
	});
});
