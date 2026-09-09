/**
 * Floor detailing — carpets, framed paths, wood planks, and patterned tiles that sit just above a
 * foundation or storey floor. Visual only: never collision, never a walkable surface. Framework-
 * and Three.js-free, same rule as StairTypes.ts.
 *
 * `hostY` is the construction-plane Y in foundation-local space (`level.baseY`: 0 on the
 * foundation top, the storey floor on level 1+). Meshes sit at `hostY + FLOOR_DETAIL_HOST_LIFT`
 * so they read as covering the floor without z-fighting it.
 *
 * `floorDetails` on a building is optional and defaults to `[]` so worlds saved before this
 * feature still load.
 */

import type { BuildingGridPoint } from './FoundationLocalMath';

export type FloorDetailKind = 'carpet' | 'path' | 'planks' | 'tiles';
export type FloorDetailRenderMode = '3d' | '2d';
export type FloorDetailTilePattern = 'solid' | 'checker' | 'diamond' | 'running-bond';
export type FloorDetailPlankDirection = 'x' | 'z';

export const FLOOR_DETAIL_KINDS = ['carpet', 'path', 'planks', 'tiles'] as const;
export const FLOOR_DETAIL_RENDER_MODES = ['3d', '2d'] as const;
export const FLOOR_DETAIL_TILE_PATTERNS = ['solid', 'checker', 'diamond', 'running-bond'] as const;
export const FLOOR_DETAIL_PLANK_DIRECTIONS = ['x', 'z'] as const;

/** Lift above the construction plane so detailing never shares a plane with the floor/foundation. */
export const FLOOR_DETAIL_HOST_LIFT = 0.012;

export const FLOOR_DETAIL_2D_THICKNESS = 0.006;

export const FLOOR_DETAIL_3D_THICKNESS = {
	carpet: 0.035,
	path: 0.04,
	planks: 0.032,
	tiles: 0.018
} as const;

/** Timber edge boards on a path — visual only. */
export const FLOOR_DETAIL_PATH_FRAME_WIDTH = 0.06;
export const FLOOR_DETAIL_PATH_FRAME_HEIGHT_EXTRA = 0.012;

/** Hairline gap between 3D planks / tiles so they read as separate boards. */
export const FLOOR_DETAIL_3D_GROOVE = 0.004;

/**
 * Board length as a multiple of plank width. Short enough that a floor is a staggered mosaic,
 * not one strip per row.
 */
export const FLOOR_DETAIL_PLANK_LENGTH_RATIO = 3;

/** Smallest first/last board we will cut before absorbing the remainder into the neighbour. */
export const FLOOR_DETAIL_PLANK_MIN_SEGMENT = 0.12;

/** Inset of the carpet field from the outer edge — the rim is a frame, not a second slab. */
export const FLOOR_DETAIL_CARPET_BORDER = 0.08;

/** Extra height on the carpet field so its top is never coplanar with the rim. */
export const FLOOR_DETAIL_CARPET_PILE = 0.006;

export const DEFAULT_FLOOR_DETAIL_COLORS: Record<FloorDetailKind, readonly [string, string]> = {
	carpet: ['#6B2E1F', '#4A1F14'],
	path: ['#8A8680', '#5C4632'],
	planks: ['#3A2418', '#432A1C'],
	tiles: ['#C1443C', '#F4F0E6']
};

export function defaultFloorDetailColors(kind: FloorDetailKind): [string, string] {
	const pair = DEFAULT_FLOOR_DETAIL_COLORS[kind];
	return [pair[0], pair[1]];
}

export function isFloorDetailKind(value: unknown): value is FloorDetailKind {
	return value === 'carpet' || value === 'path' || value === 'planks' || value === 'tiles';
}

export function isFloorDetailRenderMode(value: unknown): value is FloorDetailRenderMode {
	return value === '3d' || value === '2d';
}

export function isFloorDetailTilePattern(value: unknown): value is FloorDetailTilePattern {
	return (
		value === 'solid' || value === 'checker' || value === 'diamond' || value === 'running-bond'
	);
}

export function isFloorDetailPlankDirection(value: unknown): value is FloorDetailPlankDirection {
	return value === 'x' || value === 'z';
}

export function cycleFloorDetailTilePattern(
	current: FloorDetailTilePattern
): FloorDetailTilePattern {
	const index = FLOOR_DETAIL_TILE_PATTERNS.indexOf(current);
	return FLOOR_DETAIL_TILE_PATTERNS[(index + 1) % FLOOR_DETAIL_TILE_PATTERNS.length];
}

/**
 * A decorative covering on a foundation/storey floor. `points` is a closed 4-corner building-grid
 * rectangle for carpets/planks/tiles, or a path centreline: two points (start → end) for a straight
 * strip, three (start → handle → end) for a quadratic Bezier. A diagonal or curved path keeps its
 * authored width in local metres rather than being snapped onto a 4-corner grid quad.
 */
export interface FloorDetailDefinition {
	id: string;
	foundationId: string;
	levelIndex: number;
	kind: FloorDetailKind;
	/** Foundation-local Y of the host construction plane (`level.baseY`). */
	hostY: number;
	renderMode: FloorDetailRenderMode;
	points: BuildingGridPoint[];
	/** At least one `#RRGGBB`. Colour 2 is the alternate plank/tile, path frame, or carpet border. */
	colors: string[];
	plankWidth: number;
	plankDirection: FloorDetailPlankDirection;
	tileSize: number;
	tilePattern: FloorDetailTilePattern;
	pathWidth: number;
	pathFraming: boolean;
}

/** One coloured box in foundation-local metres — merged by FloorDetailGeometryBuilder. */
export interface FloorDetailBox {
	minX: number;
	maxX: number;
	minY: number;
	maxY: number;
	minZ: number;
	maxZ: number;
	color: string;
	/**
	 * Yaw around the box centre (radians). Used by diagonal paths and diamond tiles so the
	 * piece is not forced onto the axis-aligned grid.
	 */
	yaw?: number;
}
