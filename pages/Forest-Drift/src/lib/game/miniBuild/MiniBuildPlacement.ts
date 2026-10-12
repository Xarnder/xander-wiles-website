import * as THREE from 'three';
import type { BuildingManager } from '../building/BuildingManager';
import type { FoundationManager } from '../building/FoundationManager';
import { resolveFurnitureBuildInput } from '../building/furnitureCatalogue';
import type { FurnitureManager } from '../building/FurnitureManager';
import {
	FURNITURE_PLACE_MAX_DISTANCE,
	FURNITURE_SUPPORT_SLOPE,
	FURNITURE_WALL_CLEARANCE,
	furnitureWorldAabb,
	supportSpreadOk
} from '../building/furniturePlacementMath';
import { facingNormal } from '../building/furnitureMath';
import type { WallCollisionRect } from '../building/wallCollision';
import type { WorldSurfaceSampler } from '../building/WorldSurfaceSampler';
import {
	aabbToObb,
	obbAabb,
	obbCorners,
	obbsOverlap,
	transformLocalBox,
	transformLocalObb,
	type WorldAabb,
	type WorldObb
} from './miniBuildGrid';
import { budgetMessage, type MiniBuildSystem } from './MiniBuildSystem';
import type { MiniBuildDefinition, SnapAngle } from './MiniBuildTypes';

/** Objects may sit flush against each other and walls; only real interpenetration is rejected. */
const OBJECT_GAP = 0.01;
const CORNER_INSET = 0.06;

export interface MiniBuildPlacementContext {
	camera: THREE.Camera;
	buildingManager: BuildingManager;
	foundationManager: FoundationManager;
	furnitureManager?: FurnitureManager;
	worldSurfaceSampler: WorldSurfaceSampler;
	system: MiniBuildSystem;
	getTerrainMeshes: () => readonly THREE.Object3D[];
	getWallRects: () => readonly WallCollisionRect[];
	getGridSize: () => number;
}

export interface MiniBuildPlacementPreview {
	position: { x: number; y: number; z: number };
	rotationY: SnapAngle;
	foundationId: string | null;
	valid: boolean;
	/** Why placement is refused (shown in the HUD). */
	reason: string | null;
	/** Non-blocking notice, e.g. "This area is becoming very detailed." */
	notice: string | null;
	bounds: WorldAabb;
}

const raycaster = new THREE.Raycaster();
const screenCenter = new THREE.Vector2(0, 0);
const worldNormal = new THREE.Vector3();

/**
 * Where a Mini Build would land under the crosshair, and whether it may.
 *
 * Uses the same surfaces as furniture (terrain, foundations, floor slabs, upper floors, flat roofs)
 * and WorldSurfaceSampler for the supporting Y, so upper floors work without special cases.
 * Overlap tests use each design's compiled collision boxes — never render triangles — so a chair
 * can tuck under a table whose legs are decorative. Boxes are tested as oriented boxes, so an object
 * at any snap angle is judged by its real footprint, not the larger square around it.
 */
export function solveMiniBuildPlacement(
	context: MiniBuildPlacementContext,
	definition: MiniBuildDefinition,
	rotationY: SnapAngle,
	ignoreInstanceId?: string
): MiniBuildPlacementPreview | null {
	raycaster.setFromCamera(screenCenter, context.camera);
	raycaster.far = FURNITURE_PLACE_MAX_DISTANCE;
	const candidates: THREE.Object3D[] = [
		...context.buildingManager.getRaycastableWallMeshes(),
		...context.buildingManager.getRaycastableSlabMeshes(),
		...context.buildingManager.getRaycastableFoundationMeshes(),
		...context.buildingManager.getRaycastableRoofMeshes(),
		...context.getTerrainMeshes()
	];
	const hit = candidates.length > 0 ? raycaster.intersectObjects(candidates, false)[0] : undefined;
	if (!hit?.face) return null;
	worldNormal.copy(hit.face.normal).transformDirection(hit.object.matrixWorld).normalize();
	const facing = facingNormal(raycaster.ray.direction, worldNormal);
	if (!facing) return null;
	const hitFoundationId =
		(hit.object.userData as { foundationId?: string }).foundationId ??
		context.foundationManager.getFoundationContaining(hit.point.x, hit.point.z)?.id ??
		null;
	return evaluateMiniBuildPlacement(
		context,
		definition,
		rotationY,
		hit.point,
		facing.y,
		hitFoundationId,
		ignoreInstanceId
	);
}

/** The placement rules for a given surface hit — separated from the raycast so tests and tools can call it directly. */
export function evaluateMiniBuildPlacement(
	context: Omit<MiniBuildPlacementContext, 'camera'>,
	definition: MiniBuildDefinition,
	rotationY: SnapAngle,
	point: { x: number; y: number; z: number },
	normalY: number,
	foundationId: string | null,
	ignoreInstanceId?: string
): MiniBuildPlacementPreview {
	const data = context.system.cache.getData(definition);
	const grid = context.getGridSize();

	// Snap the rotated footprint's min corner to the building grid, so edges line up with walls and
	// neighbouring objects rather than the (possibly half-unit) anchor landing on a grid point.
	const probe = transformLocalBox(
		data.bounds.min,
		data.bounds.max,
		{ x: point.x, y: 0, z: point.z },
		rotationY
	);
	const snap = (value: number) => (grid > 0 ? Math.round(value / grid) * grid : value);
	let x = point.x + (snap(probe.minX) - probe.minX);
	let z = point.z + (snap(probe.minZ) - probe.minZ);
	const walls = context.getWallRects();
	const boxesAt = (px: number, pz: number) =>
		data.collision.map((box) =>
			obbAabb(transformLocalObb(box.min, box.max, { x: px, y: point.y, z: pz }, rotationY, box.yaw))
		);

	// Wall faces rarely sit on the placement grid, so a snapped footprint is often a few centimetres
	// into (or away from) a wall. Nudge out of axis-aligned walls by up to one grid step so objects
	// can sit flush against them without a conservative margin.
	const snug = snugAgainstWalls(boxesAt(x, z), walls, grid);
	x += snug.dx;
	z += snug.dz;

	const y = context.worldSurfaceSampler.getSupportingSurfaceY(x, z, point.y + 0.2);
	const position = { x, y, z };
	const bounds = transformLocalBox(data.bounds.min, data.bounds.max, position, rotationY);
	const base: Omit<MiniBuildPlacementPreview, 'valid' | 'reason'> = {
		position,
		rotationY,
		foundationId:
			foundationId ?? context.foundationManager.getFoundationContaining(x, z)?.id ?? null,
		notice: null,
		bounds
	};
	const refuse = (reason: string): MiniBuildPlacementPreview => ({ ...base, valid: false, reason });

	if (normalY < 0.65) return refuse('Needs a floor');

	// Support is sampled under the turned footprint's corners, not the corners of its bounding square.
	const footprint = transformLocalObb(data.bounds.min, data.bounds.max, position, rotationY);
	const cornerYs = obbCorners(footprint, CORNER_INSET).map(([cx, cz]) =>
		context.worldSurfaceSampler.getSupportingSurfaceY(cx, cz, point.y + 0.2)
	);
	if (!supportSpreadOk([...cornerYs, y], FURNITURE_SUPPORT_SLOPE)) return refuse('Uneven ground');

	const boxes = data.collision.map((box) =>
		transformLocalObb(box.min, box.max, position, rotationY, box.yaw)
	);

	for (const rect of walls) {
		if (boxes.some((box) => obbOverlapsWallRect(box, rect, FURNITURE_WALL_CLEARANCE)))
			return refuse('Blocked by a wall');
	}

	for (const other of context.system.instances.queryCollisionBoxes(bounds, ignoreInstanceId)) {
		if (boxes.some((box) => obbsOverlap(box, other.box, OBJECT_GAP)))
			return refuse('Overlaps another object');
	}

	if (context.furnitureManager) {
		for (const item of context.furnitureManager.getAll()) {
			if (item.kind === 'torch' || item.kind === 'lantern') continue;
			if (Math.abs(item.x - x) > 6 || Math.abs(item.z - z) > 6) continue;
			const input = resolveFurnitureBuildInput({
				kind: item.kind,
				dimensions: item.dimensions,
				parameters: item.parameters
			});
			const aabb = furnitureWorldAabb(
				item.x,
				item.y,
				item.z,
				input.width,
				input.depth,
				input.height,
				item.rotationY ?? 0
			);
			const furniture = aabbToObb(aabb);
			if (boxes.some((box) => obbsOverlap(box, furniture, OBJECT_GAP)))
				return refuse('Overlaps furniture');
		}
	}

	const budget = context.system.checkPlacementBudget(definition, x, z, ignoreInstanceId);
	const message = budgetMessage(budget);
	if (!budget.ok) return refuse(message ?? 'This area has reached its detail limit.');
	return { ...base, valid: true, reason: null, notice: message };
}

/**
 * `aabbOverlapsWallRect` for an oriented box: the same 2cm vertical tolerance and the same clearance
 * (each side of the object pulled in by `clearance` before testing), against the wall's oriented rect.
 */
export function obbOverlapsWallRect(
	box: WorldObb,
	rect: WallCollisionRect,
	clearance: number
): boolean {
	if (box.maxY <= rect.minWorldY + 0.02 || box.minY >= rect.maxWorldY - 0.02) return false;
	const halfX = box.halfX - clearance;
	const halfZ = box.halfZ - clearance;
	if (halfX <= 0 || halfZ <= 0) return false;
	const wall: WorldObb = {
		centerX: rect.centerX,
		centerZ: rect.centerZ,
		halfX: rect.halfLength,
		halfZ: rect.halfThickness,
		cos: rect.dirX,
		sin: -rect.dirZ,
		minY: -Infinity,
		maxY: Infinity
	};
	return obbsOverlap({ ...box, halfX, halfZ, minY: -Infinity, maxY: Infinity }, wall);
}

/**
 * The smallest X/Z shift (≤ one grid step per axis) that moves collision boxes out of axis-aligned
 * walls they only slightly penetrate. Diagonal walls and deep overlaps are left to the normal
 * "Blocked by a wall" rejection.
 */
export function snugAgainstWalls(
	boxes: readonly WorldAabb[],
	walls: readonly WallCollisionRect[],
	maxShift: number
): { dx: number; dz: number } {
	let dx = 0;
	let dz = 0;
	for (const rect of walls) {
		const alongX = Math.abs(Math.abs(rect.dirX) - 1) < 1e-6;
		const alongZ = Math.abs(Math.abs(rect.dirZ) - 1) < 1e-6;
		if (!alongX && !alongZ) continue;
		const wall = alongX
			? {
					minX: rect.centerX - rect.halfLength,
					maxX: rect.centerX + rect.halfLength,
					minZ: rect.centerZ - rect.halfThickness,
					maxZ: rect.centerZ + rect.halfThickness
				}
			: {
					minX: rect.centerX - rect.halfThickness,
					maxX: rect.centerX + rect.halfThickness,
					minZ: rect.centerZ - rect.halfLength,
					maxZ: rect.centerZ + rect.halfLength
				};
		for (const box of boxes) {
			const minX = box.minX + dx;
			const maxX = box.maxX + dx;
			const minZ = box.minZ + dz;
			const maxZ = box.maxZ + dz;
			if (box.maxY <= rect.minWorldY + 0.02 || box.minY >= rect.maxWorldY - 0.02) continue;
			if (maxX <= wall.minX || minX >= wall.maxX || maxZ <= wall.minZ || minZ >= wall.maxZ)
				continue;
			if (alongX) {
				const push = (minZ + maxZ) / 2 >= rect.centerZ ? wall.maxZ - minZ : wall.minZ - maxZ;
				if (Math.abs(push) <= maxShift + 1e-9 && Math.abs(dz + push) <= maxShift + 1e-9) dz += push;
			} else {
				const push = (minX + maxX) / 2 >= rect.centerX ? wall.maxX - minX : wall.minX - maxX;
				if (Math.abs(push) <= maxShift + 1e-9 && Math.abs(dx + push) <= maxShift + 1e-9) dx += push;
			}
		}
	}
	return { dx, dz };
}
