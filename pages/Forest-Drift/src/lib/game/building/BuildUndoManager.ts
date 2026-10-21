import type { BuildingManager } from './BuildingManager';

/** Deepest the undo stack goes — oldest action is dropped once a 6th is recorded. */
const MAX_HISTORY = 5;

export type BuildAction =
	| { kind: 'terrain'; undo: () => boolean | void; redo: () => boolean | void }
	| { kind: 'wall'; wallId: string }
	| { kind: 'wallPath'; pathId: string }
	| { kind: 'opening'; wallId: string; openingId: string }
	| { kind: 'roofOpening'; roofId: string; openingId: string }
	| { kind: 'beam'; wallId: string; beamId: string }
	| { kind: 'slab'; slabId: string }
	| { kind: 'roof'; roofId: string }
	| { kind: 'floorDetail'; detailId: string }
	| { kind: 'furniture'; furnitureId: string }
	| { kind: 'miniBuild'; instanceId: string }
	| { kind: 'barrier'; barrierId: string }
	| { kind: 'skirtingRun'; skirtingRunId: string };

export interface BuildUndoManagerOptions {
	canEdit?: () => boolean;
	removeFurniture?: (id: string) => boolean;
	removeMiniBuild?: (instanceId: string) => boolean;
	removeBarrier?: (id: string) => boolean;
}

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
	private readonly canEdit: () => boolean;
	private readonly removeFurniture?: (id: string) => boolean;
	private readonly removeMiniBuild?: (instanceId: string) => boolean;
	private readonly removeBarrier?: (id: string) => boolean;
	private readonly history: BuildAction[] = [];
	private readonly future: BuildAction[] = [];

	private readonly handleKeyDown = (event: KeyboardEvent) => {
		// Typing "-" into a name or search field must never undo a build action.
		const target = event.target as { tagName?: string; isContentEditable?: boolean } | null;
		if (
			target &&
			(['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName ?? '') || target.isContentEditable)
		)
			return;
		if (event.code === 'Equal' || event.code === 'NumpadAdd') {
			this.redo();
			return;
		}
		if (event.code === 'Minus' || event.code === 'NumpadSubtract') {
			this.undo();
		}
	};

	constructor(buildingManager: BuildingManager, options: BuildUndoManagerOptions = {}) {
		this.buildingManager = buildingManager;
		this.canEdit = options.canEdit ?? (() => true);
		this.removeFurniture = options.removeFurniture;
		this.removeMiniBuild = options.removeMiniBuild;
		this.removeBarrier = options.removeBarrier;
		window.addEventListener('keydown', this.handleKeyDown);
	}

	record(action: BuildAction): void {
		this.future.length = 0;
		this.history.push(action);
		if (this.history.length > MAX_HISTORY) this.history.shift();
	}

	/** Pops and reverses the most recent action. Returns whether anything was actually undone. */
	undo(): boolean {
		if (!this.canEdit()) return false;
		const action = this.history.pop();
		if (!action) return false;

		switch (action.kind) {
			case 'terrain':
				if (action.undo() === false) {
					this.history.push(action);
					return false;
				}
				this.future.push(action);
				return true;
			case 'wall':
				return this.buildingManager.removeWall(action.wallId);
			case 'wallPath':
				return this.buildingManager.removeWallPath(action.pathId);
			case 'opening':
				return this.buildingManager.removeOpening(action.wallId, action.openingId);
			case 'roofOpening':
				return this.buildingManager.removeRoofOpening(action.roofId, action.openingId);
			case 'beam':
				return this.buildingManager.removeBeam(action.wallId, action.beamId);
			case 'slab':
				return this.buildingManager.removeSlab(action.slabId);
			case 'roof':
				return this.buildingManager.removeRoof(action.roofId);
			case 'floorDetail':
				return this.buildingManager.removeFloorDetail(action.detailId);
			case 'furniture':
				return this.removeFurniture?.(action.furnitureId) ?? false;
			case 'miniBuild':
				return this.removeMiniBuild?.(action.instanceId) ?? false;
			case 'barrier':
				return this.removeBarrier?.(action.barrierId) ?? false;
			case 'skirtingRun':
				return this.buildingManager.removeSkirtingRun(action.skirtingRunId);
		}
	}

	redo(): boolean {
		if (!this.canEdit()) return false;
		const action = this.future.pop();
		if (!action || action.kind !== 'terrain') return false;
		if (action.redo() === false) {
			this.future.push(action);
			return false;
		}
		this.history.push(action);
		return true;
	}

	dispose(): void {
		window.removeEventListener('keydown', this.handleKeyDown);
	}
}
