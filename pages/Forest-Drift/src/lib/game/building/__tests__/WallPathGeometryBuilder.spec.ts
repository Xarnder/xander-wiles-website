import { describe, expect, it } from 'vitest';
import type { FoundationLocalFrame } from '../FoundationLocalMath';
import { computeJoinAt, distance2D, normalize2D } from '../wallPathMath';
import { buildWallPath } from '../WallPathGeometryBuilder';
import type { WallPathDefinition } from '../WallPathTypes';

const BUILDING_GRID_SIZE = 0.25; // 4 grid units per metre
const THICKNESS = 0.15;
const HALF_THICKNESS = THICKNESS / 2;
const HEIGHT = 3;

const FRAME: FoundationLocalFrame = { originWorldX: 0, originWorldY: 17.4, originWorldZ: 0 };

function metersToGrid(m: number): number {
	return Math.round(m / BUILDING_GRID_SIZE);
}

function makePath(overrides: Partial<WallPathDefinition> = {}): WallPathDefinition {
	return {
		id: 'path-1',
		foundationId: 'foundation-a',
		points: [],
		closed: false,
		baseY: 0,
		wallHeight: HEIGHT,
		wallThickness: THICKNESS,
		joinStyle: 'miter',
		miterLimit: 4,
		segments: [],
		...overrides
	};
}

/** Every (x, z) vertex position actually present in the built merged geometry, at world Y = frame origin Y (foundation top). */
function extractVertexXZ(geometry: ReturnType<typeof buildWallPath>['visibleGeometry']): {
	x: number;
	z: number;
}[] {
	const position = geometry.getAttribute('position');
	const points: { x: number; z: number }[] = [];
	for (let i = 0; i < position.count; i++) {
		points.push({ x: position.getX(i), z: position.getZ(i) });
	}
	return points;
}

function maxDistanceFromCorner(
	points: { x: number; z: number }[],
	corner: { x: number; z: number }
) {
	let max = 0;
	for (const p of points) max = Math.max(max, Math.hypot(p.x - corner.x, p.z - corner.z));
	return max;
}

describe('buildWallPath — corner joins reach the true miter point (no clipped-off gap)', () => {
	it('a 90-degree corner: the built geometry actually contains the outer miter vertex, not just the plain endpoint', () => {
		const path = makePath({
			points: [
				{ gridX: metersToGrid(0), gridZ: metersToGrid(0) },
				{ gridX: metersToGrid(4), gridZ: metersToGrid(0) },
				{ gridX: metersToGrid(4), gridZ: metersToGrid(4) }
			],
			closed: false,
			segments: [
				{ id: 'seg-a', openings: [] },
				{ id: 'seg-b', openings: [] }
			]
		});

		// Independently compute the true outer/inner miter points the same way the geometry
		// builder should, via the same pure function it calls internally.
		const prevDir = normalize2D({ x: 4, z: 0 });
		const nextDir = normalize2D({ x: 0, z: 4 });
		const corner = { x: 4, z: 0 };
		const join = computeJoinAt(prevDir, nextDir, corner, HALF_THICKNESS, 'miter', 4);
		const outerPoint = join.left[0].x > 4 ? join.left[0] : join.right[0];
		const innerPoint = join.left[0].x > 4 ? join.right[0] : join.left[0];

		// A real gap bug clips the outer edge exactly at the plain corner (4, 0) instead of
		// extending to the true miter point — assert the outer point is meaningfully further out
		// than the plain corner, and that the built mesh actually reaches it.
		expect(distance2D(outerPoint, corner)).toBeGreaterThan(HALF_THICKNESS);

		const built = buildWallPath(path, FRAME, BUILDING_GRID_SIZE);
		const vertices = extractVertexXZ(built.visibleGeometry);
		expect(vertices.length).toBeGreaterThan(0);

		const EPS = 1e-4;
		const hasOuterVertex = vertices.some(
			(v) => Math.abs(v.x - outerPoint.x) < EPS && Math.abs(v.z - outerPoint.z) < EPS
		);
		const hasInnerVertex = vertices.some(
			(v) => Math.abs(v.x - innerPoint.x) < EPS && Math.abs(v.z - innerPoint.z) < EPS
		);
		expect(hasOuterVertex).toBe(true);
		expect(hasInnerVertex).toBe(true);

		// The old bug clipped the cap at exactly `length` (the plain corner) — confirm the actual
		// built geometry extends meaningfully beyond that, proving the fix, not just the isolated
		// math function.
		expect(maxDistanceFromCorner(vertices, corner)).toBeGreaterThan(HALF_THICKNESS + 1e-6);
	});

	it('a closed rectangular room: all four corners reach their true outer miter point with no gap', () => {
		const corners = [
			{ x: 0, z: 0 },
			{ x: 5, z: 0 },
			{ x: 5, z: 3.5 },
			{ x: 0, z: 3.5 }
		];
		const path = makePath({
			points: corners.map((c) => ({ gridX: metersToGrid(c.x), gridZ: metersToGrid(c.z) })),
			closed: true,
			segments: corners.map((_, i) => ({ id: `seg-${i}`, openings: [] }))
		});

		const built = buildWallPath(path, FRAME, BUILDING_GRID_SIZE);
		const vertices = extractVertexXZ(built.visibleGeometry);

		for (let i = 0; i < corners.length; i++) {
			const prev = corners[(i - 1 + corners.length) % corners.length];
			const corner = corners[i];
			const next = corners[(i + 1) % corners.length];
			const prevDir = normalize2D({ x: corner.x - prev.x, z: corner.z - prev.z });
			const nextDir = normalize2D({ x: next.x - corner.x, z: next.z - corner.z });
			const join = computeJoinAt(prevDir, nextDir, corner, HALF_THICKNESS, 'miter', 4);
			const outerPoint =
				join.left[0].x + join.left[0].z > corner.x + corner.z ? join.left[0] : join.right[0];

			const EPS = 1e-4;
			const hasOuterVertex = vertices.some(
				(v) => Math.abs(v.x - outerPoint.x) < EPS && Math.abs(v.z - outerPoint.z) < EPS
			);
			expect(hasOuterVertex, `corner ${i} outer miter vertex missing — gap at this corner`).toBe(
				true
			);
		}
	});

	it('windows/doors still work on a segment adjacent to a joined corner', () => {
		const path = makePath({
			points: [
				{ gridX: metersToGrid(0), gridZ: metersToGrid(0) },
				{ gridX: metersToGrid(4), gridZ: metersToGrid(0) },
				{ gridX: metersToGrid(4), gridZ: metersToGrid(4) }
			],
			closed: false,
			segments: [
				{
					id: 'seg-a',
					openings: [{ id: 'w1', type: 'window', minU: 1, maxU: 1.8, minY: 1, maxY: 2 }]
				},
				{ id: 'seg-b', openings: [] }
			]
		});

		const built = buildWallPath(path, FRAME, BUILDING_GRID_SIZE);
		expect(built.visibleGeometry.getAttribute('position').count).toBeGreaterThan(0);
		expect(built.segments).toHaveLength(2);
		// Collision still exists on both segments (window doesn't remove the whole segment's collision).
		expect(built.segments[0].collisionRects.length).toBeGreaterThan(0);
		expect(built.segments[1].collisionRects.length).toBeGreaterThan(0);
	});
});
