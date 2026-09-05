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

/**
 * Everything the on-screen floor selector / build HUD needs to render one foundation's current
 * level — computed live by `BuildingLevelManager.getLevelUiState`, never stored on its own.
 * `canMoveUp`/`canMoveDown` already bake in the top/bottom bounds (the `maxBuildingLevels` safety
 * cap, and "never below Ground Floor") so the UI never needs to re-derive them.
 */
export interface BuildingLevelUiState {
	index: number;
	baseY: number;
	displayName: string;
	canMoveUp: boolean;
	canMoveDown: boolean;
}

/**
 * Player-facing names for the first several storeys — "Ground Floor" reads far more naturally in a
 * first-person building game than "Level 0", and matches how a real building's floor indicator
 * would label itself. Internal code (grid math, serialization, HUD keys) keeps using the plain
 * numeric `index`/`baseY` throughout — this table is consulted at the one point text is actually
 * shown to the player, never anywhere the level is being computed with.
 */
const LEVEL_DISPLAY_NAMES = [
	'Ground Floor',
	'First Floor',
	'Second Floor',
	'Third Floor',
	'Fourth Floor',
	'Fifth Floor',
	'Sixth Floor',
	'Seventh Floor',
	'Eighth Floor',
	'Ninth Floor',
	'Tenth Floor'
];

/** "Ground Floor" / "First Floor" / ... for the first `LEVEL_DISPLAY_NAMES.length` storeys, falling back to "Level N" beyond that (or for a negative index, which should never actually occur). */
export function levelDisplayName(index: number): string {
	if (index >= 0 && index < LEVEL_DISPLAY_NAMES.length) return LEVEL_DISPLAY_NAMES[index];
	return `Level ${index}`;
}
