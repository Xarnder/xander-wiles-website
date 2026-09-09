import { getFurnitureCatalogueEntry } from './furnitureCatalogue';
import type { FurnitureDefinition, FurnitureKind } from './FurnitureTypes';
import { furnitureRotationYOf } from './FurnitureTypes';
import type { WallCollisionRect } from './wallCollision';

export const FURNITURE_PLACE_MAX_DISTANCE = 10;
export const FURNITURE_SUPPORT_SLOPE = 0.22;
export const FURNITURE_WALL_CLEARANCE = 0.02;
export const FURNITURE_OBJECT_GAP = 0.03;

export function snapWorldToGrid(value: number, grid: number): number {
	if (grid <= 0) return value;
	return Math.round(value / grid) * grid;
}

export function snapFurnitureRotation(rotationY: number): number {
	const quarter = Math.PI / 2;
	return Math.round(rotationY / quarter) * quarter;
}

export function cycleFurnitureRotation(rotationY: number): number {
	return snapFurnitureRotation(rotationY) + Math.PI / 2;
}

export function furnitureRotationDegrees(rotationY: number): number {
	const deg = (((snapFurnitureRotation(rotationY) * 180) / Math.PI) % 360 + 360) % 360;
	return Math.round(deg);
}

export function rotatedFootprint(
	width: number,
	depth: number,
	rotationY: number
): { halfX: number; halfZ: number } {
	const snapped = snapFurnitureRotation(rotationY);
	const quarterTurns = Math.abs(Math.round(snapped / (Math.PI / 2))) % 2;
	if (quarterTurns === 1) return { halfX: depth / 2, halfZ: width / 2 };
	return { halfX: width / 2, halfZ: depth / 2 };
}

export interface FurnitureAabb2 {
	minX: number;
	maxX: number;
	minZ: number;
	maxZ: number;
	minY: number;
	maxY: number;
}

export function furnitureWorldAabb(
	x: number,
	y: number,
	z: number,
	width: number,
	depth: number,
	height: number,
	rotationY: number
): FurnitureAabb2 {
	const { halfX, halfZ } = rotatedFootprint(width, depth, rotationY);
	return {
		minX: x - halfX,
		maxX: x + halfX,
		minZ: z - halfZ,
		maxZ: z + halfZ,
		minY: y,
		maxY: y + height
	};
}

export function aabbOverlap(a: FurnitureAabb2, b: FurnitureAabb2, gap: number): boolean {
	return (
		a.minX < b.maxX - gap &&
		a.maxX > b.minX + gap &&
		a.minZ < b.maxZ - gap &&
		a.maxZ > b.minZ + gap &&
		a.minY < b.maxY - gap &&
		a.maxY > b.minY + gap
	);
}

/**
 * Axis-aligned furniture footprint vs an oriented wall rect. The furniture AABB is shrunk by
 * `clearance` so a bed or counter can sit flush against a wall without failing placement.
 */
export function aabbOverlapsWallRect(
	aabb: FurnitureAabb2,
	rect: WallCollisionRect,
	clearance: number
): boolean {
	if (aabb.maxY <= rect.minWorldY + 0.02 || aabb.minY >= rect.maxWorldY - 0.02) return false;
	const minX = aabb.minX + clearance;
	const maxX = aabb.maxX - clearance;
	const minZ = aabb.minZ + clearance;
	const maxZ = aabb.maxZ - clearance;
	if (maxX <= minX || maxZ <= minZ) return false;

	const perpX = -rect.dirZ;
	const perpZ = rect.dirX;
	const corners: [number, number][] = [
		[minX, minZ],
		[minX, maxZ],
		[maxX, minZ],
		[maxX, maxZ]
	];
	let minU = Infinity;
	let maxU = -Infinity;
	let minT = Infinity;
	let maxT = -Infinity;
	for (const [px, pz] of corners) {
		const relX = px - rect.centerX;
		const relZ = pz - rect.centerZ;
		const u = relX * rect.dirX + relZ * rect.dirZ;
		const t = relX * perpX + relZ * perpZ;
		minU = Math.min(minU, u);
		maxU = Math.max(maxU, u);
		minT = Math.min(minT, t);
		maxT = Math.max(maxT, t);
	}
	return minU < rect.halfLength && maxU > -rect.halfLength && minT < rect.halfThickness && maxT > -rect.halfThickness;
}

export function furnitureCollisionRect(
	x: number,
	y: number,
	z: number,
	width: number,
	depth: number,
	height: number,
	rotationY: number,
	collision: 'box' | 'cylinder' | 'none'
): WallCollisionRect | null {
	if (collision === 'none' || height <= 0) return null;
	const snapped = snapFurnitureRotation(rotationY);
	const quarterTurns = Math.abs(Math.round(snapped / (Math.PI / 2))) % 2;
	const alongWidth = quarterTurns === 1;
	const length = alongWidth ? depth : width;
	const thickness = alongWidth ? width : depth;
	const yaw = alongWidth ? snapped + Math.PI / 2 : snapped;
	return {
		centerX: x,
		centerZ: z,
		halfLength: length / 2,
		halfThickness: thickness / 2,
		dirX: Math.cos(yaw),
		dirZ: Math.sin(yaw),
		minWorldY: y,
		maxWorldY: y + height
	};
}

export function furnitureFootprintCorners(
	x: number,
	z: number,
	width: number,
	depth: number,
	rotationY: number
): { x: number; z: number }[] {
	const { halfX, halfZ } = rotatedFootprint(width, depth, rotationY);
	return [
		{ x: x - halfX, z: z - halfZ },
		{ x: x - halfX, z: z + halfZ },
		{ x: x + halfX, z: z - halfZ },
		{ x: x + halfX, z: z + halfZ }
	];
}

export function supportSpreadOk(cornerYs: readonly number[], maxSpread: number): boolean {
	if (cornerYs.length === 0) return false;
	let min = Infinity;
	let max = -Infinity;
	for (const y of cornerYs) {
		if (!Number.isFinite(y)) return false;
		min = Math.min(min, y);
		max = Math.max(max, y);
	}
	return max - min <= maxSpread;
}

export function furnitureKindAllowsWallMount(kind: FurnitureKind): boolean {
	return getFurnitureCatalogueEntry(kind).placement === 'any';
}

export function furnitureYawOf(item: FurnitureDefinition): number {
	return snapFurnitureRotation(furnitureRotationYOf(item));
}
