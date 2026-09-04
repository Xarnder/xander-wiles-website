import type { BuildingLevelDefinition } from './BuildingLevelTypes';
import type { BuildingSettings } from './FoundationTypes';

/**
 * Owns every foundation's building levels (storeys) plus the single, global "current building
 * level" a level-aware tool (Wall, Polygon Wall, Ceiling/Floor/Roof) builds on next — changed live
 * via Page Up/Page Down, not just a placement default, so it's stored directly on the shared
 * `BuildingSettings` object (the same "flat mutable settings bag" every other live-tunable value in
 * this project already uses) rather than as private manager state.
 *
 * `baseY`/`wallHeight` are frozen into a `BuildingLevelDefinition` the first time that level is
 * touched (`getOrCreateLevel`), computed from the *current* `defaultStoreyHeight` setting at that
 * moment — never recomputed later. This is what the brief means by "store authored Y values
 * explicitly... so changing the GUI default does not unexpectedly move existing buildings": once a
 * level exists, dragging `defaultStoreyHeight` in the GUI only affects the *next* level created,
 * exactly like every other placement-time setting in this codebase (wallHeight, wallThickness, ...).
 */
export class BuildingLevelManager {
	private readonly buildingSettings: BuildingSettings;
	private readonly levels = new Map<string, BuildingLevelDefinition[]>(); // foundationId -> levels, sorted by index

	private readonly handleKeyDown = (event: KeyboardEvent) => {
		if (event.code === 'PageUp') {
			this.buildingSettings.currentBuildingLevelIndex += 1;
		} else if (event.code === 'PageDown') {
			this.buildingSettings.currentBuildingLevelIndex = Math.max(
				0,
				this.buildingSettings.currentBuildingLevelIndex - 1
			);
		}
	};

	constructor(buildingSettings: BuildingSettings) {
		this.buildingSettings = buildingSettings;
		window.addEventListener('keydown', this.handleKeyDown);
	}

	getCurrentLevelIndex(): number {
		return this.buildingSettings.currentBuildingLevelIndex;
	}

	setCurrentLevelIndex(index: number): void {
		this.buildingSettings.currentBuildingLevelIndex = Math.max(0, Math.round(index));
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
