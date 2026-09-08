/**
 * Pure math for interior skirting: a slab sitting on top of a storey (ceiling, upper floor, or
 * flat roof) is a lid over a room. Walls whose centerline overlaps a lid edge get a baseboard on
 * the INSIDE face only — the side that faces into the lid polygon — never the exterior.
 */

import { buildingGridToLocal } from './FoundationLocalMath';
import { ensureCCW } from './slabMath';
import { slabLocalPolygon } from './SlabGeometryBuilder';
import type { SlabDefinition } from './SlabTypes';
import { length2D, normalize2D, perpLeft, sub } from './wallPathMath';
import type { Point2D } from './wallPathMath';

const EPSILON = 1e-6;
const MIN_STRIP_LENGTH = 0.04;
/** How far a wall centerline may sit from a lid edge and still count as "under" it (covers wall thickness + snap slop). */
const EDGE_ALIGN_DISTANCE = 0.2;
/** Directions whose |cross| is below this are treated as parallel (~3°). */
const PARALLEL_CROSS = 0.05;

export interface RoomLid {
	localY: number;
	thickness: number;
	/** Foundation-local X/Z, math-CCW so interior is to the left of every edge. */
	polygon: Point2D[];
}

export interface SkirtingStrip {
	minU: number;
	maxU: number;
	/** +1 = wall-local +Z (perpLeft of start→end); −1 = the opposite face. */
	faceSign: 1 | -1;
}

export interface SkirtingOpeningGap {
	minU: number;
	maxU: number;
	minY: number;
}

/** True when a slab sits on (or just above) this wall's top — i.e. it is a lid over the room the wall encloses. */
export function slabIsLidOverWallTop(
	slabLocalY: number,
	slabThickness: number,
	wallBaseY: number,
	wallHeight: number
): boolean {
	const wallTop = wallBaseY + wallHeight;
	return (
		Math.abs(slabLocalY - wallTop) <= EPSILON ||
		Math.abs(slabLocalY - slabThickness - wallTop) <= EPSILON
	);
}

export function roomLidsFromSlabs(
	slabs: readonly Pick<SlabDefinition, 'localY' | 'thickness' | 'points'>[],
	buildingGridSize: number
): RoomLid[] {
	return slabs.map((slab) => ({
		localY: slab.localY,
		thickness: slab.thickness,
		polygon: ensureCCW(slabLocalPolygon(slab, buildingGridSize))
	}));
}

/**
 * Skirting ranges along one wall, interior-face only. A wall with no lid overlapping it returns
 * nothing — outdoor / unroofed walls stay bare.
 */
export function skirtingStripsForWall(
	wallStart: Point2D,
	wallEnd: Point2D,
	wallBaseY: number,
	wallHeight: number,
	lids: readonly RoomLid[]
): SkirtingStrip[] {
	const wallLen = length2D(sub(wallEnd, wallStart));
	if (wallLen < MIN_STRIP_LENGTH) return [];
	const wallDir = normalize2D(sub(wallEnd, wallStart));
	const wallPlusZ = perpLeft(wallDir);

	const raw: SkirtingStrip[] = [];
	for (const lid of lids) {
		if (!slabIsLidOverWallTop(lid.localY, lid.thickness, wallBaseY, wallHeight)) continue;
		if (lid.polygon.length < 3) continue;
		for (let i = 0; i < lid.polygon.length; i++) {
			const edgeStart = lid.polygon[i];
			const edgeEnd = lid.polygon[(i + 1) % lid.polygon.length];
			const overlap = overlapWallWithLidEdge(wallStart, wallDir, wallLen, edgeStart, edgeEnd);
			if (!overlap) continue;
			const edgeDir = normalize2D(sub(edgeEnd, edgeStart));
			const interior = perpLeft(edgeDir);
			const faceSign: 1 | -1 = wallPlusZ.x * interior.x + wallPlusZ.z * interior.z >= 0 ? 1 : -1;
			raw.push({ minU: overlap.minU, maxU: overlap.maxU, faceSign });
		}
	}
	return mergeStrips(raw);
}

/** Removes floor-reaching doorways so skirting does not run across an open door. Windows (sill above 0) are left alone. */
export function subtractDoorwaysFromStrips(
	strips: readonly SkirtingStrip[],
	openings: readonly SkirtingOpeningGap[]
): SkirtingStrip[] {
	const doors = openings.filter((opening) => opening.minY <= EPSILON);
	let result = [...strips];
	for (const door of doors) {
		result = result.flatMap((strip) => subtractInterval(strip, door.minU, door.maxU));
	}
	return result.filter((strip) => strip.maxU - strip.minU >= MIN_STRIP_LENGTH);
}

export function wallEndpointsLocal(
	startGridX: number,
	startGridZ: number,
	endGridX: number,
	endGridZ: number,
	buildingGridSize: number
): { start: Point2D; end: Point2D } {
	const start = buildingGridToLocal({ gridX: startGridX, gridZ: startGridZ }, buildingGridSize);
	const end = buildingGridToLocal({ gridX: endGridX, gridZ: endGridZ }, buildingGridSize);
	return { start: { x: start.localX, z: start.localZ }, end: { x: end.localX, z: end.localZ } };
}

function overlapWallWithLidEdge(
	wallStart: Point2D,
	wallDir: Point2D,
	wallLen: number,
	edgeStart: Point2D,
	edgeEnd: Point2D
): { minU: number; maxU: number } | null {
	const edgeDelta = sub(edgeEnd, edgeStart);
	const edgeLen = length2D(edgeDelta);
	if (edgeLen < MIN_STRIP_LENGTH) return null;
	const edgeDir = normalize2D(edgeDelta);
	const cross = wallDir.x * edgeDir.z - wallDir.z * edgeDir.x;
	if (Math.abs(cross) > PARALLEL_CROSS) return null;

	const edge0 = projectOnAxis(edgeStart, wallStart, wallDir);
	const edge1 = projectOnAxis(edgeEnd, wallStart, wallDir);
	const minU = Math.max(0, Math.min(edge0, edge1));
	const maxU = Math.min(wallLen, Math.max(edge0, edge1));
	if (maxU - minU < MIN_STRIP_LENGTH) return null;

	const mid: Point2D = {
		x: wallStart.x + wallDir.x * ((minU + maxU) / 2),
		z: wallStart.z + wallDir.z * ((minU + maxU) / 2)
	};
	if (Math.abs(signedDistToLine(mid, edgeStart, edgeDir)) > EDGE_ALIGN_DISTANCE) return null;
	return { minU, maxU };
}

function projectOnAxis(point: Point2D, origin: Point2D, dir: Point2D): number {
	return (point.x - origin.x) * dir.x + (point.z - origin.z) * dir.z;
}

function signedDistToLine(point: Point2D, origin: Point2D, dir: Point2D): number {
	return (point.x - origin.x) * -dir.z + (point.z - origin.z) * dir.x;
}

function mergeStrips(strips: SkirtingStrip[]): SkirtingStrip[] {
	const byFace = new Map<1 | -1, SkirtingStrip[]>();
	for (const strip of strips) {
		const list = byFace.get(strip.faceSign) ?? [];
		list.push(strip);
		byFace.set(strip.faceSign, list);
	}
	const merged: SkirtingStrip[] = [];
	for (const [faceSign, list] of byFace) {
		list.sort((a, b) => a.minU - b.minU);
		let current = list[0];
		for (let i = 1; i < list.length; i++) {
			const next = list[i];
			if (next.minU <= current.maxU + EPSILON) {
				current = { minU: current.minU, maxU: Math.max(current.maxU, next.maxU), faceSign };
			} else {
				merged.push(current);
				current = next;
			}
		}
		if (current) merged.push(current);
	}
	return merged;
}

function subtractInterval(strip: SkirtingStrip, gapMin: number, gapMax: number): SkirtingStrip[] {
	if (gapMax <= strip.minU + EPSILON || gapMin >= strip.maxU - EPSILON) return [strip];
	const pieces: SkirtingStrip[] = [];
	if (gapMin > strip.minU + MIN_STRIP_LENGTH) {
		pieces.push({ minU: strip.minU, maxU: Math.min(strip.maxU, gapMin), faceSign: strip.faceSign });
	}
	if (gapMax < strip.maxU - MIN_STRIP_LENGTH) {
		pieces.push({ minU: Math.max(strip.minU, gapMax), maxU: strip.maxU, faceSign: strip.faceSign });
	}
	return pieces;
}
