import { pointInPolygon2D } from './slabMath';
import { slabIsLidOverWallTop, type RoomLid } from './skirtingMath';
import type { Point2D } from './wallPathMath';
import type { WallPathDefinition } from './WallPathTypes';

export type WindowShutterMode = 'auto' | 'manual' | 'off';
export interface WindowShutters {
	mode: WindowShutterMode;
	/** Wall-local +Z or -Z, captured from the player's position in manual mode. */
	side?: 1 | -1;
}

export function shutterSideFacingPlayer(
	dirX: number,
	dirZ: number,
	originX: number,
	originZ: number,
	playerX: number,
	playerZ: number
): 1 | -1 {
	return (playerX - originX) * -dirZ + (playerZ - originZ) * dirX >= 0 ? 1 : -1;
}

/** Probe both faces at the window, rather than relying on polygon winding or a concave centroid. */
export function automaticShutterSide(
	start: Point2D,
	end: Point2D,
	centerU: number,
	thickness: number,
	baseY: number,
	height: number,
	lids: readonly RoomLid[],
	loops: readonly WallPathDefinition[],
	gridSize: number
): 1 | -1 {
	const length = Math.hypot(end.x - start.x, end.z - start.z);
	if (length < 1e-6) return 1;
	const dx = (end.x - start.x) / length,
		dz = (end.z - start.z) / length;
	const distance = thickness / 2 + 0.04;
	const middle = { x: start.x + dx * centerU, z: start.z + dz * centerU };
	const plus = { x: middle.x - dz * distance, z: middle.z + dx * distance };
	const minus = { x: middle.x + dz * distance, z: middle.z - dx * distance };
	const polygons = [
		...loops
			.filter((loop) => loop.closed && Math.abs(loop.baseY - baseY) < 0.01)
			.map((loop) => loop.points.map((p) => ({ x: p.gridX * gridSize, z: p.gridZ * gridSize }))),
		...lids
			.filter((lid) => slabIsLidOverWallTop(lid.localY, lid.thickness, baseY, height))
			.map((lid) => lid.polygon)
	];
	for (const polygon of polygons) {
		const plusInside = pointInPolygon2D(plus, polygon);
		const minusInside = pointInPolygon2D(minus, polygon);
		if (plusInside !== minusInside) return plusInside ? -1 : 1;
	}
	// Isolated walls have no reliable interior; manual mode can override this stable default.
	return 1;
}

/** Distance to a window rectangle on a wall plane, including holes that wall mesh raycasts miss. */
export function windowRayDistance(
	opening: { minU: number; maxU: number; minY: number; maxY: number },
	transform: {
		dirX: number;
		dirZ: number;
		originWorldX: number;
		originWorldY: number;
		originWorldZ: number;
	},
	position: { x: number; y: number; z: number },
	direction: { x: number; y: number; z: number }
): number | null {
	const denominator = -transform.dirZ * direction.x + transform.dirX * direction.z;
	if (Math.abs(denominator) < 1e-6) return null;
	const offset =
		-transform.dirZ * (position.x - transform.originWorldX) +
		transform.dirX * (position.z - transform.originWorldZ);
	const distance = -offset / denominator;
	if (distance <= 0) return null;
	const u =
		(position.x + direction.x * distance - transform.originWorldX) * transform.dirX +
		(position.z + direction.z * distance - transform.originWorldZ) * transform.dirZ;
	const y = position.y + direction.y * distance - transform.originWorldY;
	return u >= opening.minU && u <= opening.maxU && y >= opening.minY && y <= opening.maxY
		? distance
		: null;
}

/** Both leaves fold outward around the frame's outer jambs, easing into each end stop. */
export function shutterSwingAngle(
	side: 1 | -1,
	hinge: 'left' | 'right',
	openAmount: number
): number {
	const t = Math.max(0, Math.min(1, openAmount));
	return (hinge === 'left' ? -1 : 1) * side * Math.PI * t * t * (3 - 2 * t);
}

export const SHUTTER_SWING_DURATION = 0.6;
