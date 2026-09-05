/** Which axis the stairs travel along, ascending — see stairMath's "canonical stair space" doc comment. */
export type StairDirection = '+x' | '-x' | '+z' | '-z';

/**
 * An axis-aligned straight staircase — see the README's "Stairs" section. Deliberately does NOT
 * store `stepCount`/`totalRise`/etc: those are always derived from the footprint + `direction` +
 * `gridSizeAtCreation` via `stairMath.computeStairMetrics`, the same "store authored values, derive
 * the rest" rule `BuildingLevelDefinition` uses for `wallHeight` — this is what guarantees an
 * existing staircase never silently resizes if the building-grid-size *default* changes later.
 *
 * `baseY` is foundation-local, exactly like every other building object (`foundation top = local Y
 * 0`) — a stair placed on building level N starts at that level's `baseY` (see BuildingLevelManager).
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
}
