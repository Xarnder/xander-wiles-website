import type { BuildingGridPoint } from './FoundationLocalMath';
import type { BuildingMaterialDefinition } from './MaterialTypes';

export type RoofType =
	| 'flat'
	| 'shed'
	| 'gable'
	| 'hip'
	| 'gambrel'
	| 'mansard'
	| 'butterfly'
	| 'm-shaped'
	| 'dutch-gable';

/** `V` cycles through these in order, wrapping. */
export const ROOF_TYPE_ORDER: readonly RoofType[] = [
	'flat',
	'shed',
	'gable',
	'hip',
	'gambrel',
	'mansard',
	'butterfly',
	'm-shaped',
	'dutch-gable'
];

export const ROOF_TYPE_LABELS: Readonly<Record<RoofType, string>> = {
	flat: 'Flat',
	shed: 'Shed',
	gable: 'Gable',
	hip: 'Hip',
	gambrel: 'Gambrel',
	mansard: 'Mansard',
	butterfly: 'Butterfly',
	'm-shaped': 'M-Shaped',
	'dutch-gable': 'Dutch Gable'
};

/** Which axis the ridge (or valley, for butterfly) runs along — `R` toggles this for every pitched type except `hip` (whose ridge axis is derived from the footprint's own proportions, per the README) and `shed` (which uses `ShedDirection` instead, below). */
export type RoofDirection = 'x' | 'z';

/** Which footprint edge is the HIGH one — only meaningful for `shed`; `R` cycles through all four. */
export type ShedDirection = '+x' | '-x' | '+z' | '-z';

/**
 * Shape-defining fractions for the multi-slope roof types, frozen into the roof at creation time —
 * never re-read from live `BuildingSettings` defaults, for the same reason `WorldEnvironmentDefinition`
 * snapshots terrain settings into a saved world: application defaults may be retuned later, and an
 * already-built roof must keep the shape it was built with.
 */
export interface RoofProfileSettings {
	/** Gambrel: fraction of the half-span the steep lower slope covers before the break. */
	gambrelLowerSlopeFraction: number;
	/** Gambrel: fraction of the total rise reached at the break. */
	gambrelBreakHeightFraction: number;
	/** Mansard: fraction of the total rise the steep lower (hip) slope covers before the shallow upper hip begins. */
	mansardBreakFraction: number;
	/** Dutch Gable: fraction of the total rise covered by the lower hip before the small gable cap begins. */
	dutchGableHipFraction: number;
	/** M-Shaped: fraction of the total rise the central valley sits at (0 = valley level with the eaves, 1 = valley level with the two ridges). */
	mShapedValleyFraction: number;
}

export function createDefaultRoofProfileSettings(): RoofProfileSettings {
	return {
		gambrelLowerSlopeFraction: 0.55,
		gambrelBreakHeightFraction: 0.65,
		mansardBreakFraction: 0.7,
		dutchGableHipFraction: 0.65,
		mShapedValleyFraction: 0.45
	};
}

/**
 * A procedural roof — foundation-local, serializable, and independent of Three.js (see
 * RoofGeometryBuilder.ts for the one place logical roof data becomes a mesh). Nothing here is a
 * generated vertex: `RoofGeometryBuilder.buildRoofGeometry(this)` must reproduce the exact same
 * shape from these fields alone, every time, which is what lets a world save skip the geometry
 * entirely (see the README's "World persistence" section).
 *
 * `points` is the roof's flat footprint polygon (eave line before overhang is applied), in the same
 * foundation-local building-grid integers every other building type uses. Every pitched type other
 * than `'flat'` additionally requires that footprint to be an axis-aligned rectangle — see
 * `roofMath.ts`'s `axisAlignedRectangleOf` for why, and the README for the "arbitrary polygon
 * pitched roofs" limitation this implies.
 */
export interface RoofDefinition {
	id: string;
	foundationId: string;
	levelIndex: number;

	points: BuildingGridPoint[];

	/** Eave elevation, foundation-local — matches the top of the level's walls at creation time, exactly like a slab's `localY`. */
	baseY: number;

	type: RoofType;
	/** Ignored by `'flat'` (no slope) and `'hip'` (axis derived from the footprint). */
	direction: RoofDirection;
	/** Only read when `type === 'shed'`. */
	shedDirection: ShedDirection;

	/** Vertical rise, metres — authoritative; pitch (the angle) is always derived from this plus the footprint span, never stored. Ignored by `'flat'`. */
	rise: number;
	thickness: number;
	/** Horizontal eave overhang beyond the footprint polygon — ignored by `'flat'` (see roofMath.ts's doc comment on why a general polygon offset isn't implemented). */
	overhang: number;

	profileSettings: RoofProfileSettings;

	material?: BuildingMaterialDefinition;
}
