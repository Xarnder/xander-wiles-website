import type { BuildingManager } from './BuildingManager';

/** Deepest the undo stack goes — oldest action is dropped once a 6th is recorded. */
const MAX_HISTORY = 5;

export type BuildAction =
	| { kind: 'wall'; wallId: string }
	| { kind: 'wallPath'; pathId: string }
	| { kind: 'opening'; wallId: string; openingId: string }
	| { kind: 'slab'; slabId: string };

/**
 * A small LIFO stack of the last few successful placements (wall, continuous/polygon wall,
 * window/door opening, ceiling/floor/roof slab), undoable with the `-` key. Every placement tool
 * calls `record()` right after its own `BuildingManager.addX` call reports success; `undo()` pops
 * the most recent one and reverses it via the matching `BuildingManager.removeX` call — the same
 * removal methods already used elsewhere, so this manager owns no state of its own beyond the
 * stack of "what to remove next."
 *
 * The `-`/Numpad Subtract listener is global and always attached (mirrors BuildingLevelManager's
 * own Page Up/Down listener) rather than gated on any particular tool being active — pressing `-`
 * undoes the last build action regardless of which tool (or none) is currently selected.
 */
export class BuildUndoManager {
	private readonly buildingManager: BuildingManager;
	private readonly history: BuildAction[] = [];

	private readonly handleKeyDown = (event: KeyboardEvent) => {
		if (event.code === 'Minus' || event.code === 'NumpadSubtract') {
			this.undo();
		}
	};

	constructor(buildingManager: BuildingManager) {
		this.buildingManager = buildingManager;
		window.addEventListener('keydown', this.handleKeyDown);
	}

	record(action: BuildAction): void {
		this.history.push(action);
		if (this.history.length > MAX_HISTORY) this.history.shift();
	}

	/** Pops and reverses the most recent action. Returns whether anything was actually undone. */
	undo(): boolean {
		const action = this.history.pop();
		if (!action) return false;

		switch (action.kind) {
			case 'wall':
				return this.buildingManager.removeWall(action.wallId);
			case 'wallPath':
				return this.buildingManager.removeWallPath(action.pathId);
			case 'opening':
				return this.buildingManager.removeOpening(action.wallId, action.openingId);
			case 'slab':
				return this.buildingManager.removeSlab(action.slabId);
		}
	}

	dispose(): void {
		window.removeEventListener('keydown', this.handleKeyDown);
	}
}
