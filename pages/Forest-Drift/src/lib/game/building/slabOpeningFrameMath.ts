/**
 * Pure layout for the timber trim around a rectangular slab opening (the stairwell hole).
 * Framework-free so the four boards are unit-testable without Three.js. Coordinates are
 * foundation-local X/Z plus local Y — the same space SlabGeometryBuilder already uses for the
 * hole itself.
 *
 * Decorative only: collision still treats the hole as a polygon gap. The boards are a lining
 * inside the cut (same idea as a window frame sitting in the opening), not a wide flange on the
 * slab. A stair flush with a wall shares that grid line with the wall centre, so any real
 * outward spread would pass through the wall and show on the outside.
 */

export interface SlabOpeningFrameSettings {
	slabOpeningFrameEnabled: boolean;
	slabOpeningFrameWidth: number;
	slabOpeningFrameDepthExtra: number;
}

export interface SlabOpeningBounds {
	minX: number;
	maxX: number;
	minZ: number;
	maxZ: number;
}

export interface SlabOpeningFrameBox {
	minX: number;
	maxX: number;
	minZ: number;
	maxZ: number;
	minY: number;
	maxY: number;
}

const MIN_SIZE = 0.005;
/**
 * How far the lining may overlap the slab around the cut — just enough to bury the collar face.
 * Kept well under half of the thinnest allowed wall (0.05 / 2) so a stair against a wall never
 * pushes timber past the outer wall face.
 */
export const SLAB_OPENING_FRAME_OUTER_MAX = 0.006;

/**
 * Four overlapping boards around `hole` — left/right run the full Z span; north/south sit between
 * them, same picture-frame rule as `computeWindowFrameLayout`. Width goes into the hole. Returns
 * `[]` when disabled or the hole is too small to take a frame.
 */
export function computeSlabOpeningFrameBoxes(
	hole: SlabOpeningBounds,
	slabTopY: number,
	slabBottomY: number,
	settings: SlabOpeningFrameSettings
): SlabOpeningFrameBox[] {
	if (!settings.slabOpeningFrameEnabled) return [];
	const holeW = hole.maxX - hole.minX;
	const holeD = hole.maxZ - hole.minZ;
	if (holeW < MIN_SIZE || holeD < MIN_SIZE) return [];

	const preferred = Math.max(MIN_SIZE, settings.slabOpeningFrameWidth);
	const frameW = Math.min(preferred, holeW * 0.15, holeD * 0.15);
	if (frameW < MIN_SIZE) return [];

	const extra = Math.max(0, settings.slabOpeningFrameDepthExtra);
	const outer = Math.min(SLAB_OPENING_FRAME_OUTER_MAX, frameW * 0.2);
	const minY = Math.min(slabBottomY, slabTopY) - extra;
	const maxY = Math.max(slabBottomY, slabTopY) + extra;
	if (maxY - minY < MIN_SIZE) return [];

	const left = hole.minX - outer;
	const right = hole.maxX + outer;
	const south = hole.minZ - outer;
	const north = hole.maxZ + outer;
	const innerLeft = hole.minX + frameW;
	const innerRight = hole.maxX - frameW;
	const innerSouth = hole.minZ + frameW;
	const innerNorth = hole.maxZ - frameW;
	if (innerRight - innerLeft < MIN_SIZE || innerNorth - innerSouth < MIN_SIZE) return [];

	return [
		{ minX: left, maxX: innerLeft, minZ: south, maxZ: north, minY, maxY },
		{ minX: innerRight, maxX: right, minZ: south, maxZ: north, minY, maxY },
		{ minX: innerLeft, maxX: innerRight, minZ: south, maxZ: innerSouth, minY, maxY },
		{ minX: innerLeft, maxX: innerRight, minZ: innerNorth, maxZ: north, minY, maxY }
	];
}
