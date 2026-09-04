/**
 * Building-element types. Framework- and Three.js-free, same rule as FoundationTypes.ts — this is
 * plain, serializable state. A wall never stores world-space coordinates: its endpoints are
 * foundation-local building-grid integers, and its openings are wall-local U/Y rectangles. World
 * transforms are always *derived* (see FoundationLocalMath.ts / wallGeometryMath.ts), never
 * authoritative — see the README's "Building system" section.
 */

import type { SlabDefinition } from './SlabTypes';
import type { WallPathDefinition } from './WallPathTypes';

export type WallOpeningType = 'window' | 'door';

/**
 * A rectangular hole in a wall, stored in wall-local coordinates: U runs along the wall from its
 * start point (U=0) to its end point (U=wall length); Y is vertical, with Y=0 at the wall's own
 * base (`wall.baseY` above the foundation top — 0 for a ground-floor wall, the level's `baseY` for
 * an upper-storey wall) and Y=wallHeight at the wall's top. A door always has minY=0, i.e. it
 * always extends down to that storey's own floor, whichever level the wall is on.
 */
export interface WallOpeningDefinition {
	id: string;
	type: WallOpeningType;
	minU: number;
	maxU: number;
	minY: number;
	maxY: number;
}

/**
 * A wall belongs to exactly one foundation and is stored entirely in that foundation's local
 * building-grid coordinates — never world space. Its world position/rotation/length are always
 * derived from `foundationId`'s current definition (see wallGeometryMath.computeWallTransform).
 *
 * `baseY` is the wall's bottom, still measured from the SAME foundation-local Y=0 origin every
 * other building element uses (0 for a ground-floor wall; a level's `baseY` for an upper-storey
 * wall) — levels are a logical grouping of this one shared coordinate space, never a separate
 * per-storey origin. Defaults to 0 when absent so older serialized walls (saved before this field
 * existed) still load as ground-floor walls.
 */
export interface WallDefinition {
	id: string;
	foundationId: string;

	startGridX: number;
	startGridZ: number;
	endGridX: number;
	endGridZ: number;

	baseY: number;
	height: number;
	thickness: number;

	openings: WallOpeningDefinition[];
}

/**
 * All building elements attached to one foundation that BuildingManager itself owns. Composition
 * over the foundation definition, not a mutation of it — see FoundationTypes.ts's
 * FoundationDefinition, which stays untouched. `wallPaths` (Continuous/Polygon Wall Tool output)
 * and `slabs` (Ceiling/Floor/Flat Roof Tool output) were each added alongside the original `walls`
 * (Straight Wall Tool output) without changing its shape — older serialized data missing either
 * field loads back in with an empty list for it, never breaking existing saves.
 *
 * Building *levels* (BuildingLevelDefinition) are deliberately NOT part of this type — they're
 * owned by the separate BuildingLevelManager, which BuildingManager doesn't know exists (see its
 * class doc comment). A full save combines both managers' serialize() output; see ThreeScene.
 */
export interface FoundationBuildingDefinition {
	foundationId: string;
	walls: WallDefinition[];
	wallPaths: WallPathDefinition[];
	slabs: SlabDefinition[];
}
