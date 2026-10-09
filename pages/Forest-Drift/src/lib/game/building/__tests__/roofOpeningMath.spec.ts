import { describe, expect, it } from 'vitest';
import {
	checkRoofOpeningFit,
	cutOpeningsFromPolygon,
	fromFacePoint,
	locateOnRoofFace,
	polygonArea,
	rectCoveredByPolygons,
	roofFaceDivisionSpan,
	roofFaceOutline,
	roofFaceSpanAt,
	roofTopAt,
	roofVerticalFaces,
	toFacePoint,
	type FacePoint,
	type RoofVerticalFace
} from '../roofOpeningMath';
import {
	createDefaultRoofProfileSettings,
	type RoofDefinition,
	type RoofFaceSide
} from '../RoofTypes';
import type { OpeningRect } from '../wallGeometryMath';

const GRID = 0.5;
const MARGIN = 0.1;
const SPACING = 0.15;

/** 6m (X) × 6m (Z) footprint unless overridden, eaves at 3m, 4m rise, 0.25m slab. */
function roof(overrides: Partial<RoofDefinition> = {}): RoofDefinition {
	return {
		id: 'roof',
		foundationId: 'f',
		levelIndex: 1,
		points: [
			{ gridX: 0, gridZ: 0 },
			{ gridX: 12, gridZ: 0 },
			{ gridX: 12, gridZ: 12 },
			{ gridX: 0, gridZ: 12 }
		],
		baseY: 3,
		type: 'gable',
		direction: 'x',
		shedDirection: '+x',
		rise: 4,
		thickness: 0.25,
		overhang: 0,
		profileSettings: createDefaultRoofProfileSettings(),
		...overrides
	};
}

function faceOf(definition: RoofDefinition, side: RoofFaceSide, endWallOffset = 0) {
	const face = roofVerticalFaces(definition, GRID, endWallOffset).find((f) => f.side === side);
	if (!face) throw new Error(`no ${side} face`);
	return face;
}

function fit(face: RoofVerticalFace, rect: OpeningRect, existing: OpeningRect[] = []) {
	return checkRoofOpeningFit(face, rect, {
		edgeMargin: MARGIN,
		spacing: SPACING,
		existing: existing.map((o) => ({ ...o, type: 'window' as const }))
	});
}

function rect(centerU: number, width: number, minY: number, height: number): OpeningRect {
	return { minU: centerU - width / 2, maxU: centerU + width / 2, minY, maxY: minY + height };
}

function area(r: OpeningRect) {
	return (r.maxU - r.minU) * (r.maxY - r.minY);
}

function centroid(polygon: FacePoint[]): FacePoint {
	const n = polygon.length;
	return {
		u: polygon.reduce((sum, p) => sum + p.u, 0) / n,
		y: polygon.reduce((sum, p) => sum + p.y, 0) / n
	};
}

describe('roofVerticalFaces', () => {
	it('finds one face per gable end, on the footprint line, in a wall-shaped frame', () => {
		const faces = roofVerticalFaces(roof(), GRID, 0);
		expect(faces.map((f) => f.side).sort()).toEqual(['+x', '-x']);
		const face = faceOf(roof(), '+x');
		expect(face.plane).toBeCloseTo(6);
		// Outward normal == wall-local +thickness: perpendicular (-dirZ, dirX).
		expect(-face.dirZ).toBe(face.normalX);
		expect(face.dirX).toBe(face.normalZ);
		expect(face.length).toBeCloseTo(6);
		expect(face.bounds.minY).toBeCloseTo(3);
		expect(face.bounds.maxY).toBeCloseTo(7);
		expect(face.label).toBe('gable');
		// The peak sits mid-span; U spans the wall below.
		expect(roofTopAt(face, 3)).toBeCloseTo(7);
		expect(face.bounds.minU).toBeCloseTo(0);
		expect(face.bounds.maxU).toBeCloseTo(6);
	});

	it('follows R: a gable along z has its ends facing ±z', () => {
		expect(
			roofVerticalFaces(roof({ direction: 'z' }), GRID, 0)
				.map((f) => f.side)
				.sort()
		).toEqual(['+z', '-z']);
	});

	it('puts the overhung gable on the wall line, under the overhang', () => {
		const face = faceOf(roof({ overhang: 0.3 }), '-x', 0.075);
		expect(face.plane).toBeCloseTo(-0.075);
		expect(face.bounds.minU).toBeCloseTo(-0.075);
		expect(face.bounds.maxU).toBeCloseTo(6.075);
		// The roof line still reaches past the face on both sides (the overhang).
		expect(roofTopAt(face, -0.075)).toBeGreaterThan(3);
		expect(roofFaceDivisionSpan(face)).toEqual({ start: 0, length: 6 });
	});

	it('round-trips points between foundation-local space and the face frame', () => {
		for (const side of ['+x', '-x'] as const) {
			const face = faceOf(roof(), side);
			const local = fromFacePoint(face, { u: 1.25, y: 4 });
			expect(local[face.axis]).toBeCloseTo(face.plane);
			const back = toFacePoint(face, local);
			expect(back.u).toBeCloseTo(1.25);
			expect(back.y).toBeCloseTo(4);
		}
	});

	it('labels a shed’s tall side as an end wall and its sloped sides as gables', () => {
		const faces = roofVerticalFaces(roof({ type: 'shed', shedDirection: '+x' }), GRID, 0);
		const bySide = Object.fromEntries(faces.map((f) => [f.side, f]));
		expect(Object.keys(bySide).sort()).toEqual(['+x', '+z', '-z']);
		expect(bySide['+x'].label).toBe('end wall');
		expect(bySide['+z'].label).toBe('gable');
		expect(bySide['+x'].bounds.minY).toBeCloseTo(3);
		expect(bySide['+x'].bounds.maxY).toBeCloseTo(7);
	});

	it('keeps M-shaped’s concave end as three coplanar pieces of one face', () => {
		const face = faceOf(roof({ type: 'm-shaped', points: rectPoints(6, 12) }), '+x');
		expect(face.polygons).toHaveLength(3);
		// The outline drops the two diagonals the pieces share: base, two rakes up, two into the valley.
		expect(roofFaceOutline(face)).toHaveLength(5);
	});

	it('has no vertical faces for flat, hip and mansard roofs', () => {
		expect(roofVerticalFaces(roof({ type: 'flat' }), GRID, 0)).toEqual([]);
		expect(roofVerticalFaces(roof({ type: 'hip' }), GRID, 0)).toEqual([]);
		expect(roofVerticalFaces(roof({ type: 'mansard' }), GRID, 0)).toEqual([]);
	});

	it('finds every other type’s vertical faces', () => {
		for (const type of ['gambrel', 'butterfly', 'dutch-gable'] as const) {
			expect(
				roofVerticalFaces(roof({ type }), GRID, 0)
					.map((f) => f.side)
					.sort()
			).toEqual(['+x', '-x']);
		}
	});
});

describe('locateOnRoofFace', () => {
	it('finds the face under a hit and rejects points off it', () => {
		const faces = roofVerticalFaces(roof(), GRID, 0);
		const face = faces.find((f) => f.side === '-x')!;
		const onFace = fromFacePoint(face, { u: 3, y: 5 });
		expect(locateOnRoofFace(faces, onFace)?.face.side).toBe('-x');
		// In the plane but above the rake (outside the triangle).
		expect(locateOnRoofFace(faces, fromFacePoint(face, { u: 0.5, y: 6.5 }))).toBeNull();
		// On a slope, nowhere near either end.
		expect(locateOnRoofFace(faces, { x: 3, y: 5, z: 1.5 })).toBeNull();
	});
});

describe('checkRoofOpeningFit', () => {
	const gable = faceOf(roof(), '+x');

	it('accepts a door standing on the attic floor under the ridge', () => {
		expect(fit(gable, rect(3, 1.2, 3, 2.1))).toEqual({ valid: true });
	});

	it('says to go up a floor when the opening is below the gable', () => {
		const result = fit(gable, rect(3, 1.2, 0.9, 1.2));
		expect(result).toMatchObject({ valid: false, issue: 'below', hint: '] to go up a floor' });
	});

	it('says to go down a floor when the opening is above the gable', () => {
		const result = fit(gable, rect(3, 1.2, 7.9, 1.2));
		expect(result).toMatchObject({ valid: false, issue: 'above', hint: '[ to go down a floor' });
	});

	it('rejects an opening that crosses the sloping edge', () => {
		expect(fit(gable, rect(1, 1.2, 3.9, 1.2))).toMatchObject({ valid: false, issue: 'slope' });
	});

	it('rejects an opening inside the outline that would cut into the roof slab above', () => {
		// Padded top 5.9 is under the rake (≈6.07 at the padded edge), but the slab hangs 0.25 below it.
		expect(fit(gable, rect(3, 1.2, 4.6, 1.2))).toMatchObject({ valid: false, issue: 'roof' });
		expect(fit(gable, rect(3, 1.2, 4.4, 1.2))).toEqual({ valid: true });
	});

	it('keeps the edge margin from the face’s sides', () => {
		const shedWall = faceOf(roof({ type: 'shed' }), '+x');
		expect(fit(shedWall, rect(0.65, 1.2, 3.5, 1.2))).toMatchObject({ valid: false, issue: 'edge' });
		expect(fit(shedWall, rect(0.7, 1.2, 3.5, 1.2))).toEqual({ valid: true });
	});

	it('rejects overlaps (with spacing) with other openings in the same face', () => {
		const existing = [rect(3, 1.2, 3, 2.1)];
		expect(fit(gable, rect(3.5, 0.6, 4, 0.6), existing)).toMatchObject({
			valid: false,
			issue: 'overlap',
			reason: 'Opening overlaps existing window'
		});
	});

	it('lets one tall gable take openings on several floors', () => {
		const tall = faceOf(roof({ rise: 9 }), '+x');
		expect(fit(tall, rect(3, 1.2, 3 + 0.9, 1.2))).toEqual({ valid: true });
		expect(fit(tall, rect(3, 1.2, 6 + 0.9, 1.2))).toEqual({ valid: true });
		expect(fit(tall, rect(3, 1, 6, 2.1))).toEqual({ valid: true });
	});

	it('accepts an M-shaped opening that straddles two of the end’s pieces', () => {
		const face = faceOf(roof({ type: 'm-shaped', points: rectPoints(6, 12) }), '-x');
		// Under the first peak (U = 3), crossing the internal diagonal from the eave to the valley.
		const opening = rect(3, 1.2, 3.9, 1.2);
		const containing = face.polygons.filter(
			(polygon) => polygonArea(polygon) > 0 && rectCoveredByPolygons([polygon], opening)
		);
		expect(containing).toHaveLength(0);
		expect(fit(face, opening)).toEqual({ valid: true });
		// The valley between the peaks is too low for the same window.
		expect(fit(face, rect(6, 1.2, 3.9, 1.2))).toMatchObject({ valid: false });
	});

	it('handles butterfly’s inverted end: openings sit above the V, never through it', () => {
		const face = faceOf(roof({ type: 'butterfly' }), '+x');
		expect(fit(face, rect(3, 1.2, 5.6, 1.2))).toEqual({ valid: true });
		expect(fit(face, rect(3, 1.2, 3.5, 1.2))).toMatchObject({ valid: false });
	});

	it('handles a dutch gable’s small cap above the hips', () => {
		const face = faceOf(roof({ type: 'dutch-gable', rise: 5, points: rectPoints(10, 16) }), '+x');
		expect(face.bounds.minY).toBeCloseTo(6.25);
		const center = (face.bounds.minU + face.bounds.maxU) / 2;
		expect(roofFaceDivisionSpan(face).length).toBeCloseTo(9.5);
		expect(fit(face, rect(center, 1, face.bounds.minY, 0.8))).toEqual({ valid: true });
		expect(fit(face, rect(center, 1, 3.9, 0.8))).toMatchObject({ valid: false, issue: 'below' });
	});
});

describe('cutOpeningsFromPolygon', () => {
	const triangle: FacePoint[] = [
		{ u: 0, y: 3 },
		{ u: 6, y: 3 },
		{ u: 3, y: 7 }
	];

	it('leaves exactly the polygon minus the hole, as convex pieces outside the hole', () => {
		const hole = rect(3, 1.2, 4, 1.2);
		const pieces = cutOpeningsFromPolygon(triangle, [hole]);
		const total = pieces.reduce((sum, piece) => sum + polygonArea(piece), 0);
		expect(total).toBeCloseTo(polygonArea(triangle) - area(hole), 9);
		for (const piece of pieces) {
			const c = centroid(piece);
			const inside = c.u > hole.minU && c.u < hole.maxU && c.y > hole.minY && c.y < hole.maxY;
			expect(inside).toBe(false);
			expectConvex(piece);
		}
	});

	it('cuts a door flush with the bottom edge', () => {
		const door = rect(3, 1.2, 3, 2.1);
		const pieces = cutOpeningsFromPolygon(triangle, [door]);
		const total = pieces.reduce((sum, piece) => sum + polygonArea(piece), 0);
		expect(total).toBeCloseTo(polygonArea(triangle) - area(door), 9);
	});

	it('clips a hole that only partly covers this piece (M-shaped straddle)', () => {
		// U [4.5, 6.5] × Y [3.5, 4.5] against the rake y = 11 − 4u/3: 0.375 full-height + 0.375 wedge.
		const hole = rect(5.5, 2, 3.5, 1);
		const covered = 0.75;
		const pieces = cutOpeningsFromPolygon(triangle, [hole]);
		const total = pieces.reduce((sum, piece) => sum + polygonArea(piece), 0);
		expect(total).toBeCloseTo(polygonArea(triangle) - covered, 9);
	});

	it('returns the polygon untouched when no opening reaches it', () => {
		expect(cutOpeningsFromPolygon(triangle, [rect(10, 1, 3, 1)])).toEqual([triangle]);
	});
});

describe('roofFaceSpanAt', () => {
	it('gives the face’s height range at a given U', () => {
		const span = roofFaceSpanAt(faceOf(roof(), '+x'), 3);
		expect(span?.minY).toBeCloseTo(3);
		expect(span?.maxY).toBeCloseTo(7);
		expect(roofFaceSpanAt(faceOf(roof(), '+x'), 9)).toBeNull();
	});
});

function rectPoints(widthX: number, depthZ: number) {
	return [
		{ gridX: 0, gridZ: 0 },
		{ gridX: widthX / GRID, gridZ: 0 },
		{ gridX: widthX / GRID, gridZ: depthZ / GRID },
		{ gridX: 0, gridZ: depthZ / GRID }
	];
}

function expectConvex(polygon: FacePoint[]) {
	let sign = 0;
	for (let i = 0; i < polygon.length; i++) {
		const a = polygon[i];
		const b = polygon[(i + 1) % polygon.length];
		const c = polygon[(i + 2) % polygon.length];
		const cross = (b.u - a.u) * (c.y - b.y) - (b.y - a.y) * (c.u - b.u);
		if (Math.abs(cross) < 1e-12) continue;
		const current = Math.sign(cross);
		if (sign === 0) sign = current;
		expect(current).toBe(sign);
	}
}
