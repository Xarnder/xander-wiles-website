import type { BuildingMaterialDefinition } from './MaterialTypes';

/** Which axis the stairs travel along, ascending — see stairMath's "canonical stair space" doc comment. */
export type StairDirection = '+x' | '-x' | '+z' | '-z';

/**
 * An axis-aligned straight staircase — see the README's "Stairs" section. Deliberately does NOT
 * store `stepCount`/`totalRise`/etc: those are always derived from the footprint + `direction` +
 * `gridSizeAtCreation` via `stairMath.computeStairMetrics`, the same "store authored values, derive
 * the rest" rule `BuildingLevelDefinition` uses for `wallHeight` — this is what guarantees an
 * existing staircase never silently resizes if the building-grid-size *default* changes later.
 *
 * `baseY` is foundation-local (`foundation top = local Y 0`), like every other building object.
 * Interior stairs start at the current building level's `baseY`. Approach stairs (a flight
 * snapped to a foundation edge from the ground outside) use a typically-negative `baseY` so
 * the first tread sits on terrain and the top landing meets the pad.
 */
export interface StairDefinition {
	id: string;
	foundationId: string;
	minGridX: number;
	maxGridX: number;
	minGridZ: number;
	maxGridZ: number;
	baseY: number;
	direction: StairDirection;
	levelIndex: number;
	/** The building grid size in effect when this stair was placed — steps are always derived from THIS value, frozen at creation, never the live GUI default. */
	gridSizeAtCreation: number;
	/**
	 * Solid-step colour, copied from the live E-customise default at place time. `undefined` on
	 * stairs saved before this field existed — they keep StairManager's unpainted cream look.
	 */
	material?: BuildingMaterialDefinition;
	/**
	 * Decorative stringers / nosings / back frame. Optional so older worlds still load; missing
	 * means on, matching the original always-framed look.
	 */
	frameEnabled?: boolean;
	/**
	 * Inner railings, balusters, and newel posts — independent of `frameEnabled` so a stair can
	 * keep timber without a handrail, or a rail without stringers. Missing means on.
	 */
	railingsEnabled?: boolean;
	/**
	 * Whether this stair cuts a hole in the slab it reaches. Copied from the live E-customise
	 * default at place time. Missing means on, matching the original always-cut look.
	 */
	openingEnabled?: boolean;
	/**
	 * Timber lining in the slab hole this stair cuts. Copied onto that opening at cut time.
	 * Missing means on. Has no effect when `openingEnabled` is off.
	 */
	openingFrameEnabled?: boolean;
}

export function stairFrameEnabledOf(stair: Pick<StairDefinition, 'frameEnabled'>): boolean {
	return stair.frameEnabled !== false;
}

export function stairRailingsEnabledOf(stair: Pick<StairDefinition, 'railingsEnabled'>): boolean {
	return stair.railingsEnabled !== false;
}

export function stairOpeningEnabledOf(stair: Pick<StairDefinition, 'openingEnabled'>): boolean {
	return stair.openingEnabled !== false;
}

export function stairOpeningFrameEnabledOf(
	stair: Pick<StairDefinition, 'openingFrameEnabled'>
): boolean {
	return stair.openingFrameEnabled !== false;
}
