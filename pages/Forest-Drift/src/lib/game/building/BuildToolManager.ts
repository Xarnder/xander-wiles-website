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

/** Which temporary global editing overlay (if any) is active — see the class doc comment. */
type GlobalMode = 'none' | 'remove' | 'paint';

export interface BuildToolManagerOptions {
	domElement: HTMLElement;
	tools: Partial<Record<ToolId, BuildTool>>;
	/** The global Remove Mode tool (`X` key) — always available, never placed in `tools`/the hotbar itself. See the class doc comment. */
	removeTool: BuildTool;
	/** The global Paint Mode tool (`P` key) — same treatment as `removeTool`. */
	paintTool: BuildTool;
	isPointerLocked: () => boolean;
	onHotbarChange?: (state: HotbarUiState) => void;
	onHudChange?: (hud: BuildUiState | null) => void;
}

/**
 * Owns the hotbar selection and routes input to whichever tool is active. Contains no building
 * logic itself — FoundationTool (and future tools) own their own targeting/state/placement.
 *
 * Also owns the two temporary GLOBAL editing overlays, Remove Mode (`X`) and Paint Mode (`P`),
 * rather than either consuming a hotbar slot — the hotbar is already full at 1-9, and both are
 * universal editor actions, not another building piece (see the README's "Remove Mode" and "Paint
 * Tool" sections). Exactly one of `{'none', 'remove', 'paint'}` (`globalMode`) is active at a time:
 * entering one always exits the other first, never both at once. While a global mode is active,
 * `update()`/mouse/most keyboard input route to that mode's own tool instead of the numbered slot's
 * own tool; `activeSlotNumber` itself is NEVER touched by entering or exiting a global mode, so the
 * previously selected hotbar tool is always exactly what's restored on exit — no separate
 * "remembered slot" bookkeeping needed.
 */
export class BuildToolManager {
	private readonly slots: readonly HotbarSlot[] = DEFAULT_HOTBAR_SLOTS;
	private readonly tools: Partial<Record<ToolId, BuildTool>>;
	private readonly removeTool: BuildTool;
	private readonly paintTool: BuildTool;
	private readonly isPointerLocked: () => boolean;
	private readonly onHotbarChange?: (state: HotbarUiState) => void;
	private readonly onHudChange?: (hud: BuildUiState | null) => void;
	private readonly domElement: HTMLElement;

	private activeSlotNumber = 1;
	private globalMode: GlobalMode = 'none';

	private readonly handleKeyDown = (event: KeyboardEvent) => {
		if (event.code === 'KeyX') {
			this.setGlobalMode(this.globalMode === 'remove' ? 'none' : 'remove');
			return;
		}
		if (event.code === 'KeyP') {
			this.setGlobalMode(this.globalMode === 'paint' ? 'none' : 'paint');
			return;
		}
		// Digit keys always go through selectSlot, active-slot or not — it exits any global mode
		// itself first when needed (see its doc comment), so this must run BEFORE the globalMode
		// early-return below, not be swallowed by it.
		const slot = DIGIT_TO_SLOT[event.code];
		if (slot !== undefined) {
			this.selectSlot(slot);
			return;
		}
		if (this.globalMode !== 'none') {
			if (event.code === 'Escape') this.setGlobalMode('none');
			return;
		}
		if (event.code === 'Escape') {
			this.getActiveTool()?.onSecondaryAction();
		}
	};

	private readonly handleMouseDown = (event: MouseEvent) => {
		if (event.button === 0) {
			// Ungate: while pointer lock is not yet engaged, this exact click is the one that
			// acquires it (see FirstPersonController) — it must not also place a foundation, remove,
			// or paint an object.
			if (!this.isPointerLocked()) return;
			if (this.globalMode !== 'none') {
				this.getGlobalTool()?.onPrimaryAction();
				return;
			}
			this.getActiveTool()?.onPrimaryAction();
		} else if (event.button === 2) {
			if (this.globalMode !== 'none') {
				this.setGlobalMode('none');
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
		this.paintTool = options.paintTool;
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
	 * Selecting a slot always exits any active global mode first (whether triggered by a digit key
	 * or clicking the on-screen hotbar) — a very natural "I'm done removing/painting, let's build"
	 * gesture, and simpler than deciding what a digit press should do while modally suspended.
	 */
	selectSlot(slot: number): void {
		if (this.globalMode !== 'none') this.setGlobalMode('none');
		if (slot === this.activeSlotNumber || slot < 1 || slot > this.slots.length) return;
		this.getActiveTool()?.deactivate();
		this.activeSlotNumber = slot;
		this.activateCurrent();
		this.emitHotbarChange();
	}

	toggleRemoveMode(): void {
		this.setGlobalMode(this.globalMode === 'remove' ? 'none' : 'remove');
	}

	togglePaintMode(): void {
		this.setGlobalMode(this.globalMode === 'paint' ? 'none' : 'paint');
	}

	isRemoveModeActive(): boolean {
		return this.globalMode === 'remove';
	}

	isPaintModeActive(): boolean {
		return this.globalMode === 'paint';
	}

	private getGlobalTool(): BuildTool | undefined {
		if (this.globalMode === 'remove') return this.removeTool;
		if (this.globalMode === 'paint') return this.paintTool;
		return undefined;
	}

	private setGlobalMode(next: GlobalMode): void {
		if (next === this.globalMode) return;

		// Leaving whichever global mode (if any) was active.
		this.getGlobalTool()?.deactivate();

		if (next === 'none') {
			this.globalMode = 'none';
			this.activateCurrent();
			this.emitHotbarChange();
			return;
		}

		// Entering a global mode: if the hotbar's own tool was active (i.e. we're not just switching
		// directly from one global mode to the other), cancel any unfinished multi-click construction
		// rather than leaving it hidden in the background, then hide its preview/HUD — every existing
		// tool's deactivate() already does exactly that.
		if (this.globalMode === 'none') {
			this.getActiveTool()?.onSecondaryAction();
			this.getActiveTool()?.deactivate();
		}
		this.globalMode = next;
		this.getGlobalTool()?.activate();
		this.emitHotbarChange();
	}

	/** Call once per frame; routes to whichever tool (if any) is currently active. */
	update(): void {
		if (this.globalMode !== 'none') {
			this.getGlobalTool()?.update();
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
			globalMode: this.globalMode
		});
	}

	dispose(): void {
		this.getActiveTool()?.deactivate();
		this.removeTool.deactivate();
		this.paintTool.deactivate();
		window.removeEventListener('keydown', this.handleKeyDown);
		this.domElement.removeEventListener('mousedown', this.handleMouseDown);
		this.domElement.removeEventListener('contextmenu', this.handleContextMenu);
	}
}
