import type { BuildingLevelDefinition, BuildingLevelUiState } from './BuildingLevelTypes';
import { levelDisplayName } from './BuildingLevelTypes';
import type { BuildingSettings } from './FoundationTypes';
import type { FoundationBuildingDefinition } from './WallTypes';

/** How close (world units) two inferred elevations must be to count as the same level — see `discoverLevelsFromBuilding`. */
const LEVEL_DISCOVERY_EPSILON = 0.01;

/**
 * Owns every foundation's building levels (storeys) AND which foundation/level a level-aware tool
 * (Wall, Polygon Wall, Ceiling/Floor/Roof, Stairs) currently builds on next — changed live via Page
 * Up/Page Down or the on-screen floor selector, not just a placement default.
 *
 * Levels are per-foundation: `currentLevelIndex` is tracked separately for every `foundationId`, so
 * standing on one foundation's Level 2 doesn't leak into another nearby foundation's own level
 * state. Which foundation Page Up/Down actually apply to — `activeFoundationId` — is resolved
 * separately: level-aware tools call `reportHoveredFoundation` every frame with whatever they're
 * currently targeting (used only while nothing is locked), and `lockActiveFoundation`/
 * `unlockActiveFoundation` around an in-progress multi-click placement so the crosshair drifting
 * over a different foundation mid-draw can never change which foundation "current level" means —
 * see the README's "Foundation-local level selection" section.
 *
 * `baseY`/`wallHeight` are frozen into a `BuildingLevelDefinition` the first time that level is
 * touched (`getOrCreateLevel`), computed from the *current* `defaultStoreyHeight` setting at that
 * moment — never recomputed later. This is what the brief means by "store authored Y values
 * explicitly... so changing the GUI default does not unexpectedly move existing buildings": once a
 * level exists, dragging `defaultStoreyHeight` in the GUI only affects the *next* level created,
 * exactly like every other placement-time setting in this codebase (wallHeight, wallThickness, ...).
 * Because indices are always created contiguously (see `getOrCreateLevel`) and each new level's
 * `baseY` is always strictly greater than its predecessor's, "the next/previous index" and "the
 * next/previous known elevation" are the same thing — `moveUp`/`moveDown` can walk by index alone
 * without a separate elevation search.
 *
 * `buildingSettings.currentBuildingLevelIndex` is kept as a live, best-effort MIRROR of whichever
 * foundation is currently active (purely so the dev-only debug GUI still has something sensible to
 * display) — it is no longer the source of truth once more than one foundation exists; that's this
 * class's own per-foundation map.
 */
export class BuildingLevelManager {
	private readonly buildingSettings: BuildingSettings;
	private readonly levels = new Map<string, BuildingLevelDefinition[]>(); // foundationId -> levels, sorted by index
	private readonly currentIndexByFoundation = new Map<string, number>();

	private activeFoundationId: string | null = null;
	private foundationLocked = false;

	private readonly handleKeyDown = (event: KeyboardEvent) => {
		if (event.code === 'PageUp') {
			this.moveUp();
		} else if (event.code === 'PageDown') {
			this.moveDown();
		}
	};

	constructor(buildingSettings: BuildingSettings) {
		this.buildingSettings = buildingSettings;
		window.addEventListener('keydown', this.handleKeyDown);
	}

	getActiveFoundationId(): string | null {
		return this.activeFoundationId;
	}

	isFoundationLocked(): boolean {
		return this.foundationLocked;
	}

	/**
	 * Called every frame by a level-aware tool with whatever foundation its crosshair currently
	 * targets (or `null` on a miss). A no-op while locked (see `lockActiveFoundation`) — otherwise,
	 * hovering a foundation makes it active; hovering nothing (a miss) intentionally does NOT clear
	 * `activeFoundationId`, so the last-targeted foundation stays "current" while the crosshair
	 * briefly drifts off it, per "retain the most recently active foundation" in the brief.
	 */
	reportHoveredFoundation(foundationId: string | null): void {
		if (this.foundationLocked || !foundationId) return;
		this.setActiveFoundation(foundationId);
	}

	/**
	 * Locks the active foundation for the duration of an in-progress multi-click placement (a wall's
	 * first point, a wall-path/slab polygon's first point, a stair footprint's first corner) so the
	 * crosshair passing over a different foundation mid-draw can never change which foundation
	 * "current level" applies to. Callers MUST pair this with `unlockActiveFoundation` on both
	 * successful confirm and cancel — never leave a lock dangling.
	 */
	lockActiveFoundation(foundationId: string): void {
		this.setActiveFoundation(foundationId);
		this.foundationLocked = true;
	}

	/** Releases a lock set by `lockActiveFoundation` — call on confirm AND on cancel. */
	unlockActiveFoundation(): void {
		this.foundationLocked = false;
	}

	private setActiveFoundation(foundationId: string): void {
		if (this.activeFoundationId === foundationId) return;
		this.activeFoundationId = foundationId;
		this.syncSettingsMirror();
	}

	private syncSettingsMirror(): void {
		this.buildingSettings.currentBuildingLevelIndex = this.activeFoundationId
			? this.getCurrentLevelIndex(this.activeFoundationId)
			: 0;
	}

	getCurrentLevelIndex(foundationId: string): number {
		return this.currentIndexByFoundation.get(foundationId) ?? 0;
	}

	setCurrentLevelIndex(foundationId: string, index: number): void {
		this.currentIndexByFoundation.set(foundationId, Math.max(0, Math.round(index)));
		if (foundationId === this.activeFoundationId) this.syncSettingsMirror();
	}

	/**
	 * Moves the active foundation's current level up one step. If a higher level already exists
	 * (created earlier, at whatever elevation it was authored with), that's what gets selected —
	 * never recomputed from the current `defaultStoreyHeight`. Otherwise a new one is created (see
	 * `getOrCreateLevel`) from the CURRENT level's own `baseY + wallHeight`, unless that would exceed
	 * `maxBuildingLevels` (a safety limit, not a game-design restriction), in which case this is a
	 * no-op. Does nothing if no foundation is currently active.
	 */
	moveUp(): void {
		const foundationId = this.activeFoundationId;
		if (!foundationId) return;

		const nextIndex = this.getCurrentLevelIndex(foundationId) + 1;
		if (!this.getLevel(foundationId, nextIndex)) {
			const existingCount = this.getLevelsForFoundation(foundationId).length;
			if (existingCount >= this.buildingSettings.maxBuildingLevels) return;
		}

		this.getOrCreateLevel(foundationId, nextIndex);
		this.setCurrentLevelIndex(foundationId, nextIndex);
	}

	/** Moves the active foundation's current level down one step; never below Ground Floor (index 0), and a no-op there. Does nothing if no foundation is currently active. */
	moveDown(): void {
		const foundationId = this.activeFoundationId;
		if (!foundationId) return;

		const index = this.getCurrentLevelIndex(foundationId);
		if (index <= 0) return;
		this.setCurrentLevelIndex(foundationId, index - 1);
	}

	/** Everything the on-screen floor selector / build HUD needs for `foundationId`'s current level — see `BuildingLevelUiState`. */
	getLevelUiState(foundationId: string): BuildingLevelUiState {
		const index = this.getCurrentLevelIndex(foundationId);
		const level = this.getOrCreateLevel(foundationId, index);
		return {
			index,
			baseY: level.baseY,
			displayName: levelDisplayName(index),
			canMoveDown: index > 0,
			canMoveUp:
				this.getLevel(foundationId, index + 1) !== undefined ||
				this.getLevelsForFoundation(foundationId).length < this.buildingSettings.maxBuildingLevels
		};
	}

	getLevel(foundationId: string, index: number): BuildingLevelDefinition | undefined {
		return this.levels.get(foundationId)?.find((level) => level.index === index);
	}

	getLevelsForFoundation(foundationId: string): BuildingLevelDefinition[] {
		return [...(this.levels.get(foundationId) ?? [])];
	}

	/**
	 * Returns level `index` for `foundationId`, creating it (and every level below it, recursively,
	 * so indices are always contiguous from 0) if it doesn't exist yet. A new level's `baseY` is its
	 * predecessor's `baseY + wallHeight` (level 0 always starts at `baseY = 0`, the foundation top);
	 * its `wallHeight` is the *current* `defaultStoreyHeight` setting, captured once.
	 */
	getOrCreateLevel(foundationId: string, index: number): BuildingLevelDefinition {
		if (index < 0) throw new Error('Building levels cannot be negative');

		const existing = this.getLevel(foundationId, index);
		if (existing) return existing;

		const list = this.levels.get(foundationId) ?? [];
		this.levels.set(foundationId, list);

		const previous = index > 0 ? this.getOrCreateLevel(foundationId, index - 1) : null;
		const level: BuildingLevelDefinition = {
			id: crypto.randomUUID(),
			foundationId,
			index,
			baseY: previous ? previous.baseY + previous.wallHeight : 0,
			wallHeight: this.buildingSettings.defaultStoreyHeight
		};
		list.push(level);
		list.sort((a, b) => a.index - b.index);
		return level;
	}

	removeLevelsForFoundation(foundationId: string): void {
		this.levels.delete(foundationId);
		this.currentIndexByFoundation.delete(foundationId);
		if (this.activeFoundationId === foundationId) {
			this.activeFoundationId = null;
			this.foundationLocked = false;
		}
	}

	/**
	 * Backfills `foundationId`'s level records purely from its already-placed geometry — walls'/
	 * wall-paths' `baseY`, slabs' `localY` (a slab's top surface always sits exactly at the `baseY` of
	 * the level above it — see SlabToolBase's class doc comment), and stairs' `baseY`. A no-op if
	 * `foundationId` already has any levels recorded (an authored level always wins; this never
	 * overwrites one). Distinct elevations within `LEVEL_DISCOVERY_EPSILON` of each other are treated
	 * as the same level rather than creating near-duplicates. `wallHeight` for each inferred level is
	 * the gap to the next inferred elevation above it, falling back to `defaultStoreyHeight` for the
	 * topmost one (there's nothing above it to measure against). Level 0 is always included at
	 * `baseY = 0`, even if nothing was actually built exactly there yet, matching every other level's
	 * own invariant.
	 */
	discoverLevelsFromBuilding(foundationId: string, building: FoundationBuildingDefinition): void {
		if (this.getLevelsForFoundation(foundationId).length > 0) return;

		const rawYs = [0];
		for (const wall of building.walls) rawYs.push(wall.baseY);
		for (const path of building.wallPaths) rawYs.push(path.baseY);
		for (const slab of building.slabs) rawYs.push(slab.localY);
		for (const stair of building.stairs) rawYs.push(stair.baseY);

		const sortedYs = [...rawYs].sort((a, b) => a - b);
		const distinctYs: number[] = [];
		for (const y of sortedYs) {
			const last = distinctYs[distinctYs.length - 1];
			if (last === undefined || y - last > LEVEL_DISCOVERY_EPSILON) distinctYs.push(y);
		}

		const list: BuildingLevelDefinition[] = distinctYs.map((baseY, index) => ({
			id: crypto.randomUUID(),
			foundationId,
			index,
			baseY,
			wallHeight:
				index + 1 < distinctYs.length
					? distinctYs[index + 1] - baseY
					: this.buildingSettings.defaultStoreyHeight
		}));
		this.levels.set(foundationId, list);
	}

	/** Plain, serializable world-state — never Three.js objects. */
	serialize(): BuildingLevelDefinition[] {
		const all: BuildingLevelDefinition[] = [];
		for (const list of this.levels.values()) all.push(...list);
		return all;
	}

	/** Replaces all current level state with the given definitions — trusts the input, same as FoundationManager.load(). */
	load(definitions: readonly BuildingLevelDefinition[]): void {
		this.levels.clear();
		for (const level of definitions) {
			const list = this.levels.get(level.foundationId) ?? [];
			list.push(level);
			this.levels.set(level.foundationId, list);
		}
		for (const list of this.levels.values()) list.sort((a, b) => a.index - b.index);
	}

	dispose(): void {
		window.removeEventListener('keydown', this.handleKeyDown);
	}
}
