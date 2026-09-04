import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { buildingGridToLocal } from './FoundationLocalMath';
import type { FoundationLocalFrame } from './FoundationLocalMath';
import type { WallCollisionRect } from './wallCollision';
import { computeSolidWallSegments } from './wallGeometryMath';
import {
	buildSegmentFootprint,
	clipPolygonToURange,
	computeJoinUBounds,
	computeWallPathJoints,
	normalize2D,
	orientJoinForSegmentEnd,
	perpLeft,
	projectFootprintToLocal,
	sub
} from './wallPathMath';
import type { Point2D } from './wallPathMath';
import type { WallPathDefinition } from './WallPathTypes';

function unprojectLocal(p: Point2D, start: Point2D, dir: Point2D): Point2D {
	const perp = perpLeft(dir);
	return { x: start.x + dir.x * p.x + perp.x * p.z, z: start.z + dir.z * p.x + perp.z * p.z };
}

/** Extrudes a 2D polygon (already in the shared foundation-local X/Z plane) from minY to maxY into a triangulated position/index buffer. Fan triangulation — correct for the convex-ish polygons every join/plain-rectangle case here produces. */
function extrudePolygon(
	polygon: readonly Point2D[],
	minY: number,
	maxY: number
): THREE.BufferGeometry | null {
	const n = polygon.length;
	if (n < 3) return null;

	const positions: number[] = [];
	for (const p of polygon) positions.push(p.x, minY, p.z);
	for (const p of polygon) positions.push(p.x, maxY, p.z);

	const indices: number[] = [];
	for (let i = 0; i < n; i++) {
		const a = i;
		const b = (i + 1) % n;
		const aTop = n + i;
		const bTop = n + ((i + 1) % n);
		indices.push(a, b, bTop, a, bTop, aTop);
	}
	for (let i = 1; i < n - 1; i++) indices.push(0, i + 1, i); // bottom cap
	for (let i = 1; i < n - 1; i++) indices.push(n, n + i, n + i + 1); // top cap

	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
	geometry.setIndex(indices);
	geometry.computeVertexNormals();
	return geometry;
}

/** A plain rectangle footprint (foundation-local X/Z), for the "safe middle" region away from any join — identical shape to a standalone wall segment. */
function plainRectangle(
	start: Point2D,
	dir: Point2D,
	uMin: number,
	uMax: number,
	halfThickness: number
): Point2D[] {
	const perp = perpLeft(dir);
	const a = {
		x: start.x + dir.x * uMin + perp.x * halfThickness,
		z: start.z + dir.z * uMin + perp.z * halfThickness
	};
	const b = {
		x: start.x + dir.x * uMax + perp.x * halfThickness,
		z: start.z + dir.z * uMax + perp.z * halfThickness
	};
	const c = {
		x: start.x + dir.x * uMax - perp.x * halfThickness,
		z: start.z + dir.z * uMax - perp.z * halfThickness
	};
	const d = {
		x: start.x + dir.x * uMin - perp.x * halfThickness,
		z: start.z + dir.z * uMin - perp.z * halfThickness
	};
	return [a, b, c, d];
}

export interface WallPathSegmentBuild {
	segmentId: string;
	/** Position/rotation for an invisible picking box, relative to the path's BuildingRoot — same convention WallManager already uses for standalone wall meshes. */
	localX: number;
	localZ: number;
	headingRadians: number;
	length: number;
	collisionRects: WallCollisionRect[];
	/** How far the join at this segment's start/end actually reaches INTO the segment (0 for an unjoined open-path endpoint) — the true geometric minimum an opening must stay clear of; see BuildingManager.getOpeningMargins(). */
	startJoinReach: number;
	endJoinReach: number;
}

export interface WallPathBuildResult {
	/** Merged visible geometry, in foundation-local X/Z/Y — meant for a mesh positioned at the BuildingRoot with no rotation (the coordinate frame is already shared across every segment). */
	visibleGeometry: THREE.BufferGeometry;
	segments: WallPathSegmentBuild[];
}

/**
 * Builds one WallPathDefinition's entire visible geometry (one merged mesh, joins and all) plus
 * per-segment placement/collision data — the "thick polyline" algorithm: compute joins at every
 * path point, build each segment's join-aware 2D footprint, then split that footprint into a
 * plain-rectangle "safe middle" (built exactly like a standalone wall, openings subtracted the
 * normal way) plus up to two small join-cap regions at its joined ends.
 *
 * The cap regions are clipped to the join's *actual* computed U-range (`computeJoinUBounds`), never
 * to a fixed margin measured from the plain endpoint. This matters: for any non-collinear corner,
 * the outer edge's miter (or bevel) point necessarily extends slightly *past* the plain endpoint —
 * that's the whole mechanism that closes the gap with the neighbouring segment. Clipping the cap to
 * `[0, someMargin]` / `[length - someMargin, length]` (i.e. stopping exactly at the endpoint) chops
 * that extension off, which is what produced the visible corner gaps this function now fixes.
 */
export function buildWallPath(
	path: WallPathDefinition,
	frame: FoundationLocalFrame,
	buildingGridSize: number
): WallPathBuildResult {
	const localPoints: Point2D[] = path.points.map((p) => {
		const local = buildingGridToLocal(p, buildingGridSize);
		return { x: local.localX, z: local.localZ };
	});

	const halfThickness = path.wallThickness / 2;
	const joints = computeWallPathJoints(
		localPoints,
		path.closed,
		halfThickness,
		path.joinStyle,
		path.miterLimit
	);

	const segmentCount = path.closed ? localPoints.length : localPoints.length - 1;
	const visiblePieces: THREE.BufferGeometry[] = [];
	const segments: WallPathSegmentBuild[] = [];

	for (let i = 0; i < segmentCount; i++) {
		const segmentDef = path.segments[i];
		const start = localPoints[i];
		const end = localPoints[(i + 1) % localPoints.length];
		const dir = normalize2D(sub(end, start));
		const length = Math.hypot(end.x - start.x, end.z - start.z);

		const startJointRaw = joints[i];
		const endJointRaw = joints[(i + 1) % localPoints.length];
		const startJoin = startJointRaw ? orientJoinForSegmentEnd(startJointRaw, true) : null;
		const endJoin = endJointRaw ? orientJoinForSegmentEnd(endJointRaw, false) : null;

		const footprint = buildSegmentFootprint(start, end, startJoin, endJoin, halfThickness);
		const localFootprint = projectFootprintToLocal(footprint, start, dir);

		// The join's TRUE U-range — may extend below 0 or above `length`, and must not be clamped
		// to the plain endpoint (see this function's doc comment for why that was the bug).
		const startCap = startJoin ? computeJoinUBounds(startJoin, start, dir, 0) : null;
		const endCap = endJoin ? computeJoinUBounds(endJoin, start, dir, length) : null;

		if (startCap) {
			const capLocal = clipPolygonToURange(localFootprint, startCap.minU, startCap.maxU);
			const capWorld = capLocal.map((p) => unprojectLocal(p, start, dir));
			const geom = extrudePolygon(capWorld, path.baseY, path.baseY + path.wallHeight);
			if (geom) visiblePieces.push(geom);
		}
		if (endCap) {
			const capLocal = clipPolygonToURange(localFootprint, endCap.minU, endCap.maxU);
			const capWorld = capLocal.map((p) => unprojectLocal(p, start, dir));
			const geom = extrudePolygon(capWorld, path.baseY, path.baseY + path.wallHeight);
			if (geom) visiblePieces.push(geom);
		}

		// Safe middle: exactly the standalone-wall algorithm (openings subtracted via
		// computeSolidWallSegments), clipped to stay clear of the join caps' true extent.
		const middleMinU = startCap ? startCap.maxU : 0;
		const middleMaxU = endCap ? endCap.minU : length;
		if (middleMaxU > middleMinU + 1e-6) {
			const solidSegments = computeSolidWallSegments(length, path.wallHeight, segmentDef.openings);
			for (const solid of solidSegments) {
				const clippedMinU = Math.max(solid.minU, middleMinU);
				const clippedMaxU = Math.min(solid.maxU, middleMaxU);
				if (clippedMaxU <= clippedMinU + 1e-6) continue;
				const rect = plainRectangle(start, dir, clippedMinU, clippedMaxU, halfThickness);
				const geom = extrudePolygon(rect, path.baseY + solid.minY, path.baseY + solid.maxY);
				if (geom) visiblePieces.push(geom);
			}
		}

		// Collision: the plain per-solid-segment rects, extended at joined ends by the join's own
		// true U-range so neighbouring segments' collision always meets — never a fixed guess.
		const solidForCollision = computeSolidWallSegments(
			length,
			path.wallHeight,
			segmentDef.openings
		);
		const collisionRects: WallCollisionRect[] = solidForCollision.map((solid) => {
			const extendedMinU =
				solid.minU <= 1e-6 && startCap ? Math.min(solid.minU, startCap.minU) : solid.minU;
			const extendedMaxU =
				solid.maxU >= length - 1e-6 && endCap ? Math.max(solid.maxU, endCap.maxU) : solid.maxU;
			const centerU = (extendedMinU + extendedMaxU) / 2;
			const worldCenter = unprojectLocal({ x: centerU, z: 0 }, start, dir);
			return {
				centerX: frame.originWorldX + worldCenter.x,
				centerZ: frame.originWorldZ + worldCenter.z,
				halfLength: (extendedMaxU - extendedMinU) / 2,
				halfThickness,
				dirX: dir.x,
				dirZ: dir.z,
				minWorldY: frame.originWorldY + path.baseY + solid.minY,
				maxWorldY: frame.originWorldY + path.baseY + solid.maxY
			};
		});

		segments.push({
			segmentId: segmentDef.id,
			localX: start.x,
			localZ: start.z,
			headingRadians: Math.atan2(dir.z, dir.x),
			length,
			collisionRects,
			startJoinReach: startCap ? Math.max(0, startCap.maxU) : 0,
			endJoinReach: endCap ? Math.max(0, length - endCap.minU) : 0
		});
	}

	const merged = visiblePieces.length > 0 ? mergeGeometries(visiblePieces, false) : null;
	for (const piece of visiblePieces) piece.dispose();

	return { visibleGeometry: merged ?? new THREE.BufferGeometry(), segments };
}
