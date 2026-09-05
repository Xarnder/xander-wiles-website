import type { StairDefinition, StairDirection } from './StairTypes';

/**
 * Pure math for axis-aligned straight staircases — see the README's "Stairs" section. Framework-
 * and Three.js-free, same rule as slabMath.ts/wallPathMath.ts, so it's directly unit-testable and
 * shared, unchanged, by StairGeometryBuilder (visual mesh) and StairManager (collision/step-surface
 * queries) — those two can never disagree about where a tread physically is.
 *
 * "Canonical stair space" (used internally by the geometry builder): run along +X (0 = bottom, at
 * `runMeters` = top), width along +Z (0..widthMeters), rise along +Y (0..totalRise). Every real
 * stair is built once in this space, then every vertex is remapped into foundation-local X/Z via
 * `stairCanonicalToLocalXZ` — see its doc comment for why one shared function drives both geometry
 * and collision.
 */

export interface StairFootprint {
	minGridX: number;
	maxGridX: number;
	minGridZ: number;
	maxGridZ: number;
}

export interface StairMetrics {
	/** Which foundation-local axis the stairs run along — determined by `direction`, not footprint shape. */
	runAxis: 'x' | 'z';
	runCells: number;
	widthCells: number;
	stepCount: number;
	stepRise: number;
	stepRun: number;
	widthMeters: number;
	runMeters: number;
	totalRise: number;
	/** `baseY + totalRise` — the elevation of the topmost tread's walkable surface. */
	topLocalY: number;
}

/**
 * `1 grid cell of run = 1 step = 1 grid cell of rise` — the whole system's core rule. `stepCount`
 * always equals the run length in grid cells; nothing here ever independently types in a height.
 */
export function computeStairMetrics(
	stair: Pick<
		StairDefinition,
		'minGridX' | 'maxGridX' | 'minGridZ' | 'maxGridZ' | 'direction' | 'gridSizeAtCreation' | 'baseY'
	>
): StairMetrics {
	const xCells = stair.maxGridX - stair.minGridX;
	const zCells = stair.maxGridZ - stair.minGridZ;
	const runAxis: 'x' | 'z' = stair.direction === '+x' || stair.direction === '-x' ? 'x' : 'z';
	const runCells = runAxis === 'x' ? xCells : zCells;
	const widthCells = runAxis === 'x' ? zCells : xCells;
	const stepRise = stair.gridSizeAtCreation;
	const stepRun = stair.gridSizeAtCreation;
	const stepCount = runCells;
	const totalRise = stepCount * stepRise;

	return {
		runAxis,
		runCells,
		widthCells,
		stepCount,
		stepRise,
		stepRun,
		widthMeters: widthCells * stair.gridSizeAtCreation,
		runMeters: runCells * stair.gridSizeAtCreation,
		totalRise,
		topLocalY: stair.baseY + totalRise
	};
}

/**
 * The travel directions valid for a footprint's shape — only the LONG dimension may be the run axis
 * (a stair must not run along its short/width side). A square footprint leaves all four valid, so
 * Left/Right Arrow can cycle through every axis; otherwise only the two directions along the long
 * axis are offered (Left/Right just reverses bottom↔top).
 */
export function validDirectionsForFootprint(xCells: number, zCells: number): StairDirection[] {
	if (xCells > zCells) return ['+x', '-x'];
	if (zCells > xCells) return ['+z', '-z'];
	return ['+x', '-x', '+z', '-z'];
}

/** Cycles `current` to the next/previous valid direction for this footprint (wrapping); falls back to the first valid direction if `current` is no longer valid (e.g. the footprint changed shape). */
export function cycleStairDirection(
	current: StairDirection,
	xCells: number,
	zCells: number,
	delta: 1 | -1
): StairDirection {
	const valid = validDirectionsForFootprint(xCells, zCells);
	const index = valid.indexOf(current);
	const startIndex = index === -1 ? 0 : index;
	const nextIndex = (startIndex + delta + valid.length) % valid.length;
	return valid[nextIndex];
}

export interface StairValidationResult {
	valid: boolean;
	reason?: string;
}

/** Footprint-shape + direction + minimum-dimension checks — everything that doesn't need foundation context (that's checked separately by BuildingManager, same split as validateSlabPolygon). */
export function validateStairFootprint(
	footprint: StairFootprint,
	direction: StairDirection,
	minimumWidthCells: number,
	minimumRunCells: number
): StairValidationResult {
	const xCells = footprint.maxGridX - footprint.minGridX;
	const zCells = footprint.maxGridZ - footprint.minGridZ;
	if (xCells <= 0 || zCells <= 0) {
		return { valid: false, reason: 'Stair footprint must have positive area' };
	}

	const validDirections = validDirectionsForFootprint(xCells, zCells);
	if (!validDirections.includes(direction)) {
		return { valid: false, reason: "Direction must run along the footprint's long axis" };
	}

	const runAxis: 'x' | 'z' = direction === '+x' || direction === '-x' ? 'x' : 'z';
	const runCells = runAxis === 'x' ? xCells : zCells;
	const widthCells = runAxis === 'x' ? zCells : xCells;

	if (widthCells < minimumWidthCells) {
		return { valid: false, reason: `Stair width must be at least ${minimumWidthCells} grid cells` };
	}
	if (runCells < minimumRunCells) {
		return { valid: false, reason: `Stair run must be at least ${minimumRunCells} grid cells` };
	}

	return { valid: true };
}

export interface StairLocalBounds {
	minLocalX: number;
	maxLocalX: number;
	minLocalZ: number;
	maxLocalZ: number;
}

/**
 * Maps a point in canonical stair space (`runDistance` along the direction of travel, 0 = bottom;
 * `widthDistance` across it, 0..widthMeters) to foundation-local X/Z, for the given footprint
 * bounds + direction. This is the ONE function both StairGeometryBuilder (the visual mesh) and
 * StairManager (tread-surface/collision rects) call — sharing it is what guarantees the visible
 * steps and the walkable/collidable steps can never drift apart.
 *
 * Passing an all-zero `bounds` recovers just the transform's *linear* part (no translation) — used
 * to remap normals/direction-vectors the same way positions are remapped, since this mapping is
 * always a pure axis permutation + optional sign flip (never a shear or scale).
 */
export function stairCanonicalToLocalXZ(
	bounds: StairLocalBounds,
	direction: StairDirection,
	runDistance: number,
	widthDistance: number
): { x: number; z: number } {
	switch (direction) {
		case '+x':
			return { x: bounds.minLocalX + runDistance, z: bounds.minLocalZ + widthDistance };
		case '-x':
			return { x: bounds.maxLocalX - runDistance, z: bounds.minLocalZ + widthDistance };
		case '+z':
			return { x: bounds.minLocalX + widthDistance, z: bounds.minLocalZ + runDistance };
		case '-z':
			return { x: bounds.minLocalX + widthDistance, z: bounds.maxLocalZ - runDistance };
	}
}

export interface StairTreadRect {
	minX: number;
	maxX: number;
	minZ: number;
	maxZ: number;
	/** This tread's walkable surface Y (foundation-local) — `baseY + (i + 1) * stepRise`; see the module doc comment on the top-step convention. */
	topLocalY: number;
}

/** Every individual tread's foundation-local footprint + walkable-surface Y, in bottom-to-top order — the authoritative "where can the player stand" data, shared by collision and (indirectly, via the same metrics) the visual mesh. */
export function stairTreadRectsLocal(
	bounds: StairLocalBounds,
	direction: StairDirection,
	baseY: number,
	metrics: StairMetrics
): StairTreadRect[] {
	const { stepCount, stepRise, stepRun, widthMeters } = metrics;
	const rects: StairTreadRect[] = [];
	for (let i = 0; i < stepCount; i++) {
		const runStart = i * stepRun;
		const runEnd = (i + 1) * stepRun;
		const c1 = stairCanonicalToLocalXZ(bounds, direction, runStart, 0);
		const c2 = stairCanonicalToLocalXZ(bounds, direction, runEnd, widthMeters);
		rects.push({
			minX: Math.min(c1.x, c2.x),
			maxX: Math.max(c1.x, c2.x),
			minZ: Math.min(c1.z, c2.z),
			maxZ: Math.max(c1.z, c2.z),
			topLocalY: baseY + (i + 1) * stepRise
		});
	}
	return rects;
}

export interface StairSideRect {
	centerX: number;
	centerZ: number;
	halfLength: number;
	halfThickness: number;
	dirX: number;
	dirZ: number;
}

/** Thin half-thickness (world units) for the two side-edge collision strips — see stairSideRectsLocal. */
export const STAIR_SIDE_STRIP_HALF_THICKNESS = 0.05;

/**
 * The two side-edge collision strips (running the full length of the stair, along whichever
 * foundation-local axis the stairs travel) that stop the player walking sideways through the solid
 * stair body — independent of `direction`'s sign, since both directions along an axis share the
 * same two edges (only which end is bottom/top differs, which doesn't matter for a side wall).
 *
 * Each strip is centered `STAIR_SIDE_STRIP_HALF_THICKNESS` OUTSIDE the footprint boundary, not on
 * it — its inner face sits exactly flush with the tread edge, so it never encroaches on the
 * walkable width. Centering it ON the boundary (half in, half out) was the original approach, but
 * combined with the player's own collision radius that effectively narrowed every stair by
 * `2 * (halfThickness + radius)` — for a narrow-but-otherwise-valid stair, that shrinkage exceeded
 * the actual width, making the whole tread unwalkable except right at one edge (see the README's
 * "Stairs" section / the bugfix this comment describes).
 */
export function stairSideRectsLocal(
	bounds: StairLocalBounds,
	metrics: StairMetrics
): StairSideRect[] {
	const halfLength = metrics.runMeters / 2;
	const offset = STAIR_SIDE_STRIP_HALF_THICKNESS;
	if (metrics.runAxis === 'x') {
		const centerX = (bounds.minLocalX + bounds.maxLocalX) / 2;
		return [
			{
				centerX,
				centerZ: bounds.minLocalZ - offset,
				halfLength,
				halfThickness: offset,
				dirX: 1,
				dirZ: 0
			},
			{
				centerX,
				centerZ: bounds.maxLocalZ + offset,
				halfLength,
				halfThickness: offset,
				dirX: 1,
				dirZ: 0
			}
		];
	}
	const centerZ = (bounds.minLocalZ + bounds.maxLocalZ) / 2;
	return [
		{
			centerX: bounds.minLocalX - offset,
			centerZ,
			halfLength,
			halfThickness: offset,
			dirX: 0,
			dirZ: 1
		},
		{
			centerX: bounds.maxLocalX + offset,
			centerZ,
			halfLength,
			halfThickness: offset,
			dirX: 0,
			dirZ: 1
		}
	];
}

/** Whether the canonical→local remap for `direction` reflects (flips triangle winding) rather than rotates — see StairGeometryBuilder, which reverses index order for these two so lighting/culling stay correct without needing double-sided materials. */
export function stairDirectionFlipsWinding(direction: StairDirection): boolean {
	return direction === '-x' || direction === '+z';
}
