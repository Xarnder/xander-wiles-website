/**
 * Building-element types. Framework- and Three.js-free, same rule as FoundationTypes.ts — this is
 * plain, serializable state. A wall never stores world-space coordinates: its endpoints are
 * foundation-local building-grid integers, and its openings are wall-local U/Y rectangles. World
 * transforms are always *derived* (see FoundationLocalMath.ts / wallGeometryMath.ts), never
 * authoritative — see the README's "Building system" section.
 */

export type WallOpeningType = 'window' | 'door';

/**
 * A rectangular hole in a wall, stored in wall-local coordinates: U runs along the wall from its
 * start point (U=0) to its end point (U=wall length); Y is vertical, with Y=0 at the foundation
 * top (the wall's bottom) and Y=wallHeight at the wall's top. A door always has minY=0.
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
 */
export interface WallDefinition {
	id: string;
	foundationId: string;

	startGridX: number;
	startGridZ: number;
	endGridX: number;
	endGridZ: number;

	height: number;
	thickness: number;

	openings: WallOpeningDefinition[];
}

/** All building elements attached to one foundation. Composition over the foundation definition, not a mutation of it — see FoundationTypes.ts's FoundationDefinition, which stays untouched. */
export interface FoundationBuildingDefinition {
	foundationId: string;
	walls: WallDefinition[];
}
