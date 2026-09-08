/**
 * Building-element types. Framework- and Three.js-free, same rule as FoundationTypes.ts — this is
 * plain, serializable state. A wall never stores world-space coordinates: its endpoints are
 * foundation-local building-grid integers, and its openings are wall-local U/Y rectangles. World
 * transforms are always *derived* (see FoundationLocalMath.ts / wallGeometryMath.ts), never
 * authoritative — see the README's "Building system" section.
 */

import type { FloorDetailDefinition } from './FloorDetailTypes';
import type { BuildingMaterialDefinition } from './MaterialTypes';
import type { RoofDefinition } from './RoofTypes';
import type { SlabDefinition } from './SlabTypes';
import type { StairDefinition } from './StairTypes';
import type { WallPathDefinition } from './WallPathTypes';

export type WallOpeningType = 'window' | 'door';

/**
 * Per-wall (or per-path) override of the global wall-edge-framing defaults (see WallFrameBuilder.ts
 * and `BuildingSettings.wallFrameEnabled`/`wallFrameWidth`/`wallFrameDepthExtra`).
 * Every field is optional and independently inherits from the global default when absent — same
 * `undefined` = "use the default look" convention as `WallDefinition.material` above, so an unpainted,
 * un-customized wall (the overwhelmingly common case) never needs this field at all. Not yet settable
 * from any in-game tool; exists so a future per-wall framing UI (or hand-authored world data) has
 * somewhere to put an override without a WallDefinition shape change.
 */
export interface WallFrameOverride {
	enabled?: boolean;
	width?: number;
	depth?: number;
	material?: BuildingMaterialDefinition;
}

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
	/**
	 * Placement colour for this opening — window frame or door leaf. `undefined` on older saves
	 * means the default timber / leaf look (`BuildingMaterialManager.getMaterial(..., undefined)`).
	 */
	material?: BuildingMaterialDefinition;
}

/**
 * A decorative timber board on a wall, stored in the same wall-local U/Y rectangle as an opening.
 * Unlike a window or door it does not cut a hole — collision and solid wall geometry stay unchanged.
 * `undefined` / missing on older saves means no beams (same “absent = empty” convention as
 * `FoundationBuildingDefinition.roofs`).
 */
export interface WallBeamDefinition {
	id: string;
	minU: number;
	maxU: number;
	minY: number;
	maxY: number;
	/** Placement colour for this beam. `undefined` on older saves means the default timber look. */
	material?: BuildingMaterialDefinition;
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
 *
 * `material` is `undefined` for an unpainted wall — it then renders using WallManager's own default
 * look (`BuildingMaterialManager.getMaterial('wall', undefined)`), never a hardcoded fallback colour
 * baked into this definition. Painting a wall (Paint Tool) sets an explicit override here; resetting
 * it back to "Default" deletes the field again rather than reassigning some remembered original
 * colour — see the README's "Paint Tool" section on why `undefined` IS the inheritance mechanism.
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
	/** Defaults to `[]` when absent so worlds saved before placeable beams still load. */
	beams?: WallBeamDefinition[];
	material?: BuildingMaterialDefinition;
	/** `undefined` = use the global wall-framing defaults — see WallFrameOverride's own doc comment. */
	frameStyle?: WallFrameOverride;
}

/**
 * All building elements attached to one foundation that BuildingManager itself owns. Composition
 * over the foundation definition, not a mutation of it — see FoundationTypes.ts's
 * FoundationDefinition, which stays untouched. `wallPaths` (Continuous/Polygon Wall Tool output),
 * `slabs` (Ceiling/Floor/Flat Roof Tool output) and `stairs` (Stair Tool output) were each added
 * alongside the original `walls` (Straight Wall Tool output) without changing its shape — older
 * serialized data missing any of these fields loads back in with an empty list for it, never
 * breaking existing saves.
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
	stairs: StairDefinition[];
	/** Defaults to `[]` when absent so buildings serialized before pitched roofs existed still load — same convention as `wallPaths`/`slabs` above. */
	roofs: RoofDefinition[];
	/** Defaults to `[]` when absent so buildings serialized before floor detailing existed still load. */
	floorDetails?: FloorDetailDefinition[];
}
