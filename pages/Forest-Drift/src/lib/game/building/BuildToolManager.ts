import { DEFAULT_HOTBAR_SLOTS } from './FoundationTypes';
import type { BuildUiState, HotbarSlot, HotbarUiState, ToolId } from './FoundationTypes';

/** Contract every build tool implements. BuildToolManager only ever talks to tools through this. */
export interface BuildTool {
	readonly toolId: ToolId;
	activate(): void;
	deactivate(): void;
	/** Called once per frame while this tool is the active tool. */
	update(): void;
	/** Left click, but only once pointer lock is already engaged. */
	onPrimaryAction(): void;
	/** Right click, or Escape while a selection is pending. */
	onSecondaryAction(): void;
}

const DIGIT_TO_SLOT: Record<string, number> = {
	Digit1: 1,
	Digit2: 2,
	Digit3: 3,
	Digit4: 4,
	Digit5: 5,
	Digit6: 6,
	Digit7: 7,
	Digit8: 8,
	Digit9: 9
};

export interface BuildToolManagerOptions {
	domElement: HTMLElement;
	tools: Partial<Record<ToolId, BuildTool>>;
	/** The global Remove Mode tool (`X` key) — always available, never placed in `tools`/the hotbar itself. See the class doc comment. */
	removeTool: BuildTool;
	isPointerLocked: () => boolean;
	onHotbarChange?: (state: HotbarUiState) => void;
	onHudChange?: (hud: BuildUiState | null) => void;
}

/**
 * Owns the hotbar selection and routes input to whichever tool is active. Contains no building
 * logic itself — FoundationTool (and future tools) own their own targeting/state/placement.
 *
 * Also owns Remove Mode (`X`), a temporary GLOBAL overlay rather than another hotbar slot — the
 * hotbar is already full at 1-9, and removal is a universal editor action, not another building
 * piece (see the README's "Remove Mode" section). While `removeModeActive`, `update()`/mouse/most
 * keyboard input route to `removeTool` instead of the numbered slot's own tool; `activeSlotNumber`
 * itself is NEVER touched by entering or exiting Remove Mode, so the previously selected hotbar
 * tool is always exactly what's restored on exit — no separate "remembered slot" bookkeeping needed.
 */
export class BuildToolManager {
	private readonly slots: readonly HotbarSlot[] = DEFAULT_HOTBAR_SLOTS;
	private readonly tools: Partial<Record<ToolId, BuildTool>>;
	private readonly removeTool: BuildTool;
	private readonly isPointerLocked: () => boolean;
	private readonly onHotbarChange?: (state: HotbarUiState) => void;
	private readonly onHudChange?: (hud: BuildUiState | null) => void;
	private readonly domElement: HTMLElement;

	private activeSlotNumber = 1;
	private removeModeActive = false;

	private readonly handleKeyDown = (event: KeyboardEvent) => {
		if (event.code === 'KeyX') {
			this.toggleRemoveMode();
			return;
		}
		// Digit keys always go through selectSlot, active-slot or not — it exits Remove Mode itself
		// first when needed (see its doc comment), so this must run BEFORE the removeModeActive
		// early-return below, not be swallowed by it.
		const slot = DIGIT_TO_SLOT[event.code];
		if (slot !== undefined) {
			this.selectSlot(slot);
			return;
		}
		if (this.removeModeActive) {
			if (event.code === 'Escape') this.setRemoveMode(false);
			return;
		}
		if (event.code === 'Escape') {
			this.getActiveTool()?.onSecondaryAction();
		}
	};

	private readonly handleMouseDown = (event: MouseEvent) => {
		if (event.button === 0) {
			// Ungate: while pointer lock is not yet engaged, this exact click is the one that
			// acquires it (see FirstPersonController) — it must not also place a foundation or
			// remove an object.
			if (!this.isPointerLocked()) return;
			if (this.removeModeActive) {
				this.removeTool.onPrimaryAction();
				return;
			}
			this.getActiveTool()?.onPrimaryAction();
		} else if (event.button === 2) {
			if (this.removeModeActive) {
				this.setRemoveMode(false);
				return;
			}
			this.getActiveTool()?.onSecondaryAction();
		}
	};

	private readonly handleContextMenu = (event: MouseEvent) => {
		event.preventDefault();
	};

	constructor(options: BuildToolManagerOptions) {
		this.domElement = options.domElement;
		this.tools = options.tools;
		this.removeTool = options.removeTool;
		this.isPointerLocked = options.isPointerLocked;
		this.onHotbarChange = options.onHotbarChange;
		this.onHudChange = options.onHudChange;

		window.addEventListener('keydown', this.handleKeyDown);
		this.domElement.addEventListener('mousedown', this.handleMouseDown);
		this.domElement.addEventListener('contextmenu', this.handleContextMenu);

		this.activateCurrent();
		this.emitHotbarChange();
	}

	/**
	 * Selecting a slot always exits Remove Mode first (whether triggered by a digit key or clicking
	 * the on-screen hotbar) — a very natural "I'm done removing, let's build" gesture, and simpler
	 * than deciding what a digit press should do while modally suspended.
	 */
	selectSlot(slot: number): void {
		if (this.removeModeActive) this.setRemoveMode(false);
		if (slot === this.activeSlotNumber || slot < 1 || slot > this.slots.length) return;
		this.getActiveTool()?.deactivate();
		this.activeSlotNumber = slot;
		this.activateCurrent();
		this.emitHotbarChange();
	}

	toggleRemoveMode(): void {
		this.setRemoveMode(!this.removeModeActive);
	}

	isRemoveModeActive(): boolean {
		return this.removeModeActive;
	}

	private setRemoveMode(active: boolean): void {
		if (active === this.removeModeActive) return;
		if (active) {
			// Cancel any unfinished multi-click construction (a pending polygon/stair selection) rather
			// than leaving it hidden in the background, then hide the tool's own preview/HUD — every
			// existing tool's deactivate() already does exactly that.
			this.getActiveTool()?.onSecondaryAction();
			this.getActiveTool()?.deactivate();
			this.removeModeActive = true;
			this.removeTool.activate();
		} else {
			this.removeTool.deactivate();
			this.removeModeActive = false;
			this.activateCurrent();
		}
		this.emitHotbarChange();
	}

	/** Call once per frame; routes to whichever tool (if any) is currently active. */
	update(): void {
		if (this.removeModeActive) {
			this.removeTool.update();
			return;
		}
		this.getActiveTool()?.update();
	}

	private activateCurrent(): void {
		const tool = this.getActiveTool();
		if (tool) {
			tool.activate();
		} else {
			this.onHudChange?.(null);
		}
	}

	private getActiveToolId(): ToolId {
		return this.slots[this.activeSlotNumber - 1]?.toolId ?? 'none';
	}

	private getActiveTool(): BuildTool | undefined {
		return this.tools[this.getActiveToolId()];
	}

	private emitHotbarChange(): void {
		this.onHotbarChange?.({
			slots: this.slots,
			activeSlot: this.activeSlotNumber,
			removeModeActive: this.removeModeActive
		});
	}

	dispose(): void {
		this.getActiveTool()?.deactivate();
		this.removeTool.deactivate();
		window.removeEventListener('keydown', this.handleKeyDown);
		this.domElement.removeEventListener('mousedown', this.handleMouseDown);
		this.domElement.removeEventListener('contextmenu', this.handleContextMenu);
	}
}
