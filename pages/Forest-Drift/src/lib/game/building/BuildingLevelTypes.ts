/**
 * A logical storey within one foundation's local 3D building space. Levels are convenient
 * *groupings* of an authored `baseY` — they never introduce a separate coordinate system: every
 * value here is still measured from the same foundation-local Y=0 (the foundation top) every other
 * building element uses. See BuildingLevelManager's doc comment for why `baseY`/`wallHeight` are
 * frozen at creation time rather than derived live from `defaultStoreyHeight`.
 */
export interface BuildingLevelDefinition {
	id: string;
	foundationId: string;
	index: number;
	baseY: number;
	wallHeight: number;
}
