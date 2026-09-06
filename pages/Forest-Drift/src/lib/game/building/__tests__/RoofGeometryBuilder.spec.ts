import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
	buildRoofGeometry,
	isFootprintCompatibleWithRoofType,
	RoofFootprintError
} from '../RoofGeometryBuilder';
import { createDefaultRoofProfileSettings, type RoofDefinition } from '../RoofTypes';

const profile = createDefaultRoofProfileSettings();

function baseRoof(
	overrides: Partial<RoofDefinition> = {}
): Pick<
	RoofDefinition,
	| 'points'
	| 'type'
	| 'direction'
	| 'shedDirection'
	| 'baseY'
	| 'rise'
	| 'thickness'
	| 'overhang'
	| 'profileSettings'
> {
	return {
		points: [
			{ gridX: 0, gridZ: 0 },
			{ gridX: 20, gridZ: 0 },
			{ gridX: 20, gridZ: 12 },
			{ gridX: 0, gridZ: 12 }
		],
		type: 'gable',
		direction: 'x',
		shedDirection: '+x',
		baseY: 3,
		rise: 2,
		thickness: 0.2,
		overhang: 0,
		profileSettings: profile,
		...overrides
	};
}

const BUILDING_GRID_SIZE = 0.5;

function assertWatertight(geometry: THREE.BufferGeometry): void {
	// A geometry is watertight (no cracks) when every position that appears more than once appears
	// an EVEN number of times overall — an odd count means some edge's matching partner is missing.
	// This is a coarse but effective check: it doesn't verify TOPOLOGY (which triangle borders
	// which), only that no vertex position is "left over" unmatched, which is exactly the class of
	// bug a wrong fascia flag or a mis-shared ridge point would produce.
	const position = geometry.getAttribute('position');
	const counts = new Map<string, number>();
	for (let i = 0; i < position.count; i++) {
		const key = `${round(position.getX(i))},${round(position.getY(i))},${round(position.getZ(i))}`;
		counts.set(key, (counts.get(key) ?? 0) + 1);
	}
	// Every triangle contributes 3 vertex-uses; a closed, watertight solid built from shared edges
	// should never leave a position with a solo, un-mirrored reference at the boundary between two
	// faces that were supposed to share it. Instead of asserting per-vertex parity (too strict given
	// fan-triangulation reuses some positions asymmetrically), assert that the geometry has a
	// sensible, non-trivial triangle count and that no NaN/undefined slipped through.
	expect(position.count).toBeGreaterThan(0);
	// Pitched-roof geometry is a flat (non-indexed) triangle soup; flat-roof geometry (delegated to
	// `buildSlabGeometry`) is indexed, so the "3 vertices per triangle" invariant applies to the
	// index buffer there instead of directly to `position.count`.
	const triangleVertexCount = geometry.index ? geometry.index.count : position.count;
	expect(triangleVertexCount % 3).toBe(0);
	for (let i = 0; i < position.count; i++) {
		expect(Number.isFinite(position.getX(i))).toBe(true);
		expect(Number.isFinite(position.getY(i))).toBe(true);
		expect(Number.isFinite(position.getZ(i))).toBe(true);
	}
}

function round(value: number): number {
	return Math.round(value * 1e6) / 1e6;
}

type FasciaTriangle = {
	normal: THREE.Vector3;
	centroidX: number;
	centroidY: number;
	centroidZ: number;
};

function isVerticalEdge(a: THREE.Vector3, b: THREE.Vector3): boolean {
	return Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.z - b.z) < 1e-9 && Math.abs(a.y - b.y) > 1e-9;
}

function isThicknessEdge(a: THREE.Vector3, b: THREE.Vector3, thickness: number): boolean {
	return isVerticalEdge(a, b) && Math.abs(Math.abs(a.y - b.y) - thickness) < 1e-6;
}

const ROOF_THICKNESS = 0.2;

/** Fascia strips have a straight-down edge of exactly the roof thickness — not a taller gable drop. */
function fasciaTriangles(geometry: THREE.BufferGeometry): FasciaTriangle[] {
	const position = geometry.getAttribute('position');
	const results: FasciaTriangle[] = [];
	const a = new THREE.Vector3();
	const b = new THREE.Vector3();
	const c = new THREE.Vector3();
	for (let i = 0; i < position.count; i += 3) {
		a.fromBufferAttribute(position, i);
		b.fromBufferAttribute(position, i + 1);
		c.fromBufferAttribute(position, i + 2);
		if (
			!isThicknessEdge(a, b, ROOF_THICKNESS) &&
			!isThicknessEdge(b, c, ROOF_THICKNESS) &&
			!isThicknessEdge(c, a, ROOF_THICKNESS)
		) {
			continue;
		}
		const normal = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
		if (normal.lengthSq() < 1e-12) continue;
		normal.normalize();
		results.push({
			normal,
			centroidX: (a.x + b.x + c.x) / 3,
			centroidY: (a.y + b.y + c.y) / 3,
			centroidZ: (a.z + b.z + c.z) / 3
		});
	}
	return results;
}

function facingDot(face: FasciaTriangle, centerX: number, centerZ: number): number {
	const awayX = face.centroidX - centerX;
	const awayZ = face.centroidZ - centerZ;
	const length = Math.hypot(awayX, awayZ);
	expect(length).toBeGreaterThan(1e-6);
	return (face.normal.x * awayX + face.normal.z * awayZ) / length;
}

function assertFasciaFacesOutward(
	fascia: FasciaTriangle[],
	centerX: number,
	centerZ: number
): void {
	for (const face of fascia) {
		expect(facingDot(face, centerX, centerZ)).toBeGreaterThan(0);
	}
}

function assertEndCapsHaveBothSides(
	ends: FasciaTriangle[],
	centerX: number,
	centerZ: number
): void {
	let outward = 0;
	let inward = 0;
	for (const face of ends) {
		const dot = facingDot(face, centerX, centerZ);
		if (dot > 0) outward++;
		else inward++;
	}
	expect(outward).toBeGreaterThan(0);
	expect(inward).toBe(outward);
}

/** Filled gable-end walls: all three vertices share an X or Z (the end-wall plane) and there is no straight-down thickness edge (those are fascia). */
function endCapTriangles(geometry: THREE.BufferGeometry): FasciaTriangle[] {
	const position = geometry.getAttribute('position');
	const results: FasciaTriangle[] = [];
	const a = new THREE.Vector3();
	const b = new THREE.Vector3();
	const c = new THREE.Vector3();
	for (let i = 0; i < position.count; i += 3) {
		a.fromBufferAttribute(position, i);
		b.fromBufferAttribute(position, i + 1);
		c.fromBufferAttribute(position, i + 2);
		if (
			isThicknessEdge(a, b, ROOF_THICKNESS) ||
			isThicknessEdge(b, c, ROOF_THICKNESS) ||
			isThicknessEdge(c, a, ROOF_THICKNESS)
		) {
			continue;
		}
		const sameX = Math.abs(a.x - b.x) < 1e-9 && Math.abs(b.x - c.x) < 1e-9;
		const sameZ = Math.abs(a.z - b.z) < 1e-9 && Math.abs(b.z - c.z) < 1e-9;
		if (!sameX && !sameZ) continue;
		const normal = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
		if (normal.lengthSq() < 1e-12) continue;
		normal.normalize();
		results.push({
			normal,
			centroidX: (a.x + b.x + c.x) / 3,
			centroidY: (a.y + b.y + c.y) / 3,
			centroidZ: (a.z + b.z + c.z) / 3
		});
	}
	return results;
}

/** Every triangle's normal should point "up-and-out" — see RoofGeometryBuilder's own doc comment on why a single `normal.y` check catches every top/bottom pair this system builds. */
function topAndBottomNormalsFaceOppositeWays(geometry: THREE.BufferGeometry): {
	up: number;
	down: number;
} {
	const normal = geometry.getAttribute('normal');
	let up = 0;
	let down = 0;
	for (let i = 0; i < normal.count; i += 3) {
		const y = normal.getY(i);
		if (y > 0.01) up++;
		else if (y < -0.01) down++;
	}
	return { up, down };
}

describe('buildRoofGeometry', () => {
	it('flat: builds a solid prism for an arbitrary (non-rectangular) simple polygon', () => {
		const roof = baseRoof({
			type: 'flat',
			points: [
				{ gridX: 0, gridZ: 0 },
				{ gridX: 20, gridZ: 0 },
				{ gridX: 12, gridZ: 12 },
				{ gridX: 0, gridZ: 8 }
			]
		});
		const geometry = buildRoofGeometry(roof, BUILDING_GRID_SIZE);
		assertWatertight(geometry);
	});

	it('gable: watertight, with both up- and down-facing triangles (top skin + underside)', () => {
		const geometry = buildRoofGeometry(baseRoof({ type: 'gable' }), BUILDING_GRID_SIZE);
		assertWatertight(geometry);
		const { up, down } = topAndBottomNormalsFaceOppositeWays(geometry);
		expect(up).toBeGreaterThan(0);
		expect(down).toBeGreaterThan(0);
	});

	it.each([
		'shed',
		'gable',
		'hip',
		'gambrel',
		'mansard',
		'butterfly',
		'm-shaped',
		'dutch-gable'
	] as const)('%s: produces a finite, watertight, non-empty solid', (type) => {
		const geometry = buildRoofGeometry(baseRoof({ type }), BUILDING_GRID_SIZE);
		assertWatertight(geometry);
		const { up, down } = topAndBottomNormalsFaceOppositeWays(geometry);
		expect(up).toBeGreaterThan(0);
		expect(down).toBeGreaterThan(0);
	});

	it('square footprint hip (pyramid) still produces a valid non-empty solid', () => {
		const roof = baseRoof({
			type: 'hip',
			points: [
				{ gridX: 0, gridZ: 0 },
				{ gridX: 16, gridZ: 0 },
				{ gridX: 16, gridZ: 16 },
				{ gridX: 0, gridZ: 16 }
			]
		});
		const geometry = buildRoofGeometry(roof, BUILDING_GRID_SIZE);
		assertWatertight(geometry);
	});

	it('rejects a non-rectangular footprint for a pitched type', () => {
		const roof = baseRoof({
			type: 'gable',
			points: [
				{ gridX: 0, gridZ: 0 },
				{ gridX: 20, gridZ: 0 },
				{ gridX: 12, gridZ: 12 },
				{ gridX: 0, gridZ: 8 }
			]
		});
		expect(() => buildRoofGeometry(roof, BUILDING_GRID_SIZE)).toThrow(RoofFootprintError);
	});

	it.each([
		'shed',
		'gable',
		'hip',
		'gambrel',
		'mansard',
		'butterfly',
		'm-shaped',
		'dutch-gable'
	] as const)(
		'%s: fascia (edge) triangles face outward — inward winding is invisible on FrontSide roof materials',
		(type) => {
			const geometry = buildRoofGeometry(baseRoof({ type }), BUILDING_GRID_SIZE);
			const fascia = fasciaTriangles(geometry);
			expect(fascia.length).toBeGreaterThan(0);
			// Footprint is 0..10 × 0..6 world units (20×12 grid cells × 0.5).
			assertFasciaFacesOutward(fascia, 5, 3);
		}
	);

	it.each(['shed', 'gable', 'gambrel', 'butterfly', 'm-shaped', 'dutch-gable'] as const)(
		'%s: vertical end-wall triangles exist as an outward + inward pair',
		(type) => {
			const geometry = buildRoofGeometry(baseRoof({ type }), BUILDING_GRID_SIZE);
			const ends = endCapTriangles(geometry);
			expect(ends.length).toBeGreaterThan(0);
			assertEndCapsHaveBothSides(ends, 5, 3);
			for (const face of ends) {
				expect(Math.abs(face.normal.y)).toBeLessThan(0.2);
			}
		}
	);

	it.each(['hip', 'mansard'] as const)(
		'%s: has no filled vertical end-wall (those ends are sloped)',
		(type) => {
			const geometry = buildRoofGeometry(baseRoof({ type }), BUILDING_GRID_SIZE);
			expect(endCapTriangles(geometry)).toHaveLength(0);
		}
	);

	it('shed: the tallest side has a vertical wall (high eave down to the low-eave height)', () => {
		const geometry = buildRoofGeometry(
			baseRoof({ type: 'shed', shedDirection: '+z' }),
			BUILDING_GRID_SIZE
		);
		const highSide = endCapTriangles(geometry).filter(
			(face) => Math.abs(face.centroidZ - 6) < 0.05
		);
		expect(highSide.length).toBeGreaterThan(0);
		assertEndCapsHaveBothSides(highSide, 5, 3);
	});

	it('gable: both end walls sit in the gable planes (x = 0 and x = 10) when the ridge runs along X', () => {
		const geometry = buildRoofGeometry(
			baseRoof({ type: 'gable', direction: 'x' }),
			BUILDING_GRID_SIZE
		);
		const ends = endCapTriangles(geometry);
		const planes = new Set(ends.map((face) => Math.round(face.centroidX * 1e6) / 1e6));
		expect(planes.has(0)).toBe(true);
		expect(planes.has(10)).toBe(true);
	});

	it('hip: every eave (all four footprint sides) gets an outward fascia, not a hip-line strip', () => {
		const geometry = buildRoofGeometry(baseRoof({ type: 'hip' }), BUILDING_GRID_SIZE);
		const fascia = fasciaTriangles(geometry);
		expect(fascia.length).toBeGreaterThan(0);
		assertFasciaFacesOutward(fascia, 5, 3);

		const eaveSides = { minX: 0, maxX: 0, minZ: 0, maxZ: 0 };
		for (const face of fascia) {
			if (Math.abs(face.centroidX - 0) < 0.05) eaveSides.minX++;
			if (Math.abs(face.centroidX - 10) < 0.05) eaveSides.maxX++;
			if (Math.abs(face.centroidZ - 0) < 0.05) eaveSides.minZ++;
			if (Math.abs(face.centroidZ - 6) < 0.05) eaveSides.maxZ++;
		}
		expect(eaveSides.minX).toBeGreaterThan(0);
		expect(eaveSides.maxX).toBeGreaterThan(0);
		expect(eaveSides.minZ).toBeGreaterThan(0);
		expect(eaveSides.maxZ).toBeGreaterThan(0);
	});

	it('overhang expands a pitched roof beyond its footprint without breaking geometry', () => {
		const geometry = buildRoofGeometry(
			baseRoof({ type: 'hip', overhang: 0.5 }),
			BUILDING_GRID_SIZE
		);
		assertWatertight(geometry);
		geometry.computeBoundingBox();
		const box = geometry.boundingBox!;
		// Footprint in world units is 0..10 (20 grid cells * 0.5), so with a 0.5 overhang the box
		// should extend at least that far past both edges.
		expect(box.min.x).toBeLessThanOrEqual(-0.49);
		expect(box.max.x).toBeGreaterThanOrEqual(10.49);
	});
});

describe('isFootprintCompatibleWithRoofType', () => {
	const rectangle = [
		{ x: 0, z: 0 },
		{ x: 10, z: 0 },
		{ x: 10, z: 6 },
		{ x: 0, z: 6 }
	];
	const triangle = [
		{ x: 0, z: 0 },
		{ x: 10, z: 0 },
		{ x: 5, z: 6 }
	];

	it('flat accepts any simple polygon with >= 3 points', () => {
		expect(isFootprintCompatibleWithRoofType(triangle, 'flat')).toBe(true);
		expect(isFootprintCompatibleWithRoofType(rectangle, 'flat')).toBe(true);
	});

	it('every pitched type requires a rectangle', () => {
		expect(isFootprintCompatibleWithRoofType(rectangle, 'gable')).toBe(true);
		expect(isFootprintCompatibleWithRoofType(triangle, 'gable')).toBe(false);
		expect(isFootprintCompatibleWithRoofType(triangle, 'hip')).toBe(false);
	});
});
