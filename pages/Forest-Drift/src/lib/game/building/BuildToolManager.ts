import {
	cycleHotbarVariantIndex,
	DEFAULT_HOTBAR_SLOTS,
	isCustomizablePlacementTool,
	resolveHotbarSlot
} from './FoundationTypes';
import type { BuildUiState, HotbarUiState, ToolId } from './FoundationTypes';

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
	/**
	 * When true, ↑/↓ stay with this tool instead of cycling the hotbar slot — Roof Tool uses this
	 * while adjusting rise so those keys don't also switch to Floor/Ceiling.
	 */
	isCapturingKey?(code: string): boolean;
}

const DIGIT_TO_SLOT: Record<string, number> = {
	Digit1: 1,
	Digit2: 2,
	Digit3: 3,
	Digit4: 4,
	Digit5: 5,
	Digit6: 6,
	Digit8: 8
};

/** Which temporary global editing overlay (if any) is active — see the class doc comment. */
type GlobalMode = 'none' | 'remove' | 'paint' | 'music';

export interface BuildToolManagerOptions {
	domElement: HTMLElement;
	tools: Partial<Record<ToolId, BuildTool>>;
	/** The global Remove Mode tool (`X` key) — always available, never placed in `tools`/the hotbar itself. See the class doc comment. */
	removeTool: BuildTool;
	/** The global Paint Mode tool (`P` key) — same treatment as `removeTool`. */
	paintTool: BuildTool;
	musicTool?: BuildTool;
	isPointerLocked: () => boolean;
	isInputBlocked?: () => boolean;
	onHotbarChange?: (state: HotbarUiState) => void;
	onHudChange?: (hud: BuildUiState | null) => void;
	/** Fires when the placement-customize modal opens or closes (`E` on Door / Window / Beam). */
	onPlacementCustomizeChange?: (open: boolean) => void;
}

/**
 * Owns the hotbar selection and routes input to whichever tool is active. Contains no building
 * logic itself — FoundationTool (and future tools) own their own targeting/state/placement.
 *
 * Build Mode (`G`) is the on/off gate for the numbered hotbar and construction tools — off hides
 * the bar and suspends placement without forgetting the selected slot. Compose Mode (`M`) is
 * independent of that gate (same toggle shape, different purpose).
 *
 * Several numbered slots hold more than one tool (Poly Wall/Wall, Door/Window, Ceiling/Floor/Roof).
 * ↑/↓ cycle the variant on the selected slot and remember it when you leave and come back. A tool
 * may keep those keys via `isCapturingKey` (roof rise while adjusting).
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
	private readonly slots = DEFAULT_HOTBAR_SLOTS;
	private readonly variantIndexBySlot = new Map<number, number>();
	private readonly tools: Partial<Record<ToolId, BuildTool>>;
	private readonly removeTool: BuildTool;
	private readonly paintTool: BuildTool;
	private readonly musicTool?: BuildTool;
	private readonly isInputBlocked?: () => boolean;
	private readonly isPointerLocked: () => boolean;
	private readonly onHotbarChange?: (state: HotbarUiState) => void;
	private readonly onHudChange?: (hud: BuildUiState | null) => void;
	private readonly onPlacementCustomizeChange?: (open: boolean) => void;
	private readonly domElement: HTMLElement;

	private activeSlotNumber = 1;
	private globalMode: GlobalMode = 'none';
	/** Numbered construction UI + tools. Starts on so existing play and tests keep the hotbar. */
	private buildModeActive = true;
	/**
	 * Placement-customize overlay (`E`). Owned here rather than via `isInputBlocked` so `E` can
	 * still close the modal — the same key must both open and dismiss it.
	 */
	private placementCustomizeOpen = false;

	private readonly handleKeyDown = (event: KeyboardEvent) => {
		const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(
			(event.target as HTMLElement | null)?.tagName ?? ''
		);
		if (typing) {
			if (this.placementCustomizeOpen && event.code === 'Escape') {
				this.setPlacementCustomizeOpen(false);
			}
			return;
		}
		if (event.repeat) return;
		if (event.code === 'KeyG') {
			this.setPlacementCustomizeOpen(false);
			this.toggleBuildMode();
			return;
		}
		if (event.code === 'KeyE' && this.canOpenPlacementCustomize()) {
			this.togglePlacementCustomize();
			return;
		}
		if (this.placementCustomizeOpen) {
			if (event.code === 'Escape') this.setPlacementCustomizeOpen(false);
			return;
		}
		if (this.isInputBlocked?.()) return;
		if (event.code === 'KeyM' && this.musicTool) {
			this.setGlobalMode(this.globalMode === 'music' ? 'none' : 'music');
			return;
		}
		if (!this.buildModeActive) {
			if (this.globalMode === 'music') {
				if (event.code === 'KeyX') this.setGlobalMode('remove');
				else if (event.code === 'Escape') this.setGlobalMode('none');
			}
			return;
		}
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
		if (event.code === 'ArrowUp' || event.code === 'ArrowDown') {
			if (this.getActiveTool()?.isCapturingKey?.(event.code)) return;
			event.preventDefault();
			this.cycleSlotVariant(event.code === 'ArrowUp' ? -1 : 1);
			return;
		}
		if (event.code === 'Escape') {
			this.getActiveTool()?.onSecondaryAction();
		}
	};

	private readonly handleMouseDown = (event: MouseEvent) => {
		if (this.placementCustomizeOpen) return;
		if (this.isInputBlocked?.()) return;
		if (event.button === 0) {
			// Ungate: while pointer lock is not yet engaged, this exact click is the one that
			// acquires it (see FirstPersonController) — it must not also place a foundation, remove,
			// or paint an object.
			if (!this.isPointerLocked()) return;
			if (this.globalMode !== 'none') {
				this.getGlobalTool()?.onPrimaryAction();
				return;
			}
			if (!this.buildModeActive) return;
			this.getActiveTool()?.onPrimaryAction();
		} else if (event.button === 2) {
			if (this.globalMode !== 'none') {
				this.setGlobalMode('none');
				return;
			}
			if (!this.buildModeActive) return;
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
		this.musicTool = options.musicTool;
		this.isPointerLocked = options.isPointerLocked;
		this.isInputBlocked = options.isInputBlocked;
		this.onHotbarChange = options.onHotbarChange;
		this.onHudChange = options.onHudChange;
		this.onPlacementCustomizeChange = options.onPlacementCustomizeChange;

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
		// Empty keys (7, 9) must not exit Remove / Paint / Compose — there is no tool to switch to.
		if (!this.slotDefinition(slot)) return;
		if (!this.buildModeActive) this.setBuildMode(true);
		if (this.globalMode !== 'none') this.setGlobalMode('none');
		if (slot === this.activeSlotNumber) return;
		this.getActiveTool()?.deactivate();
		this.activeSlotNumber = slot;
		this.activateCurrent();
		this.syncPlacementCustomizeToActiveTool();
		this.emitHotbarChange();
	}

	/** Cycles the selected slot's tool. No-op on single-tool slots. Wraps at both ends. */
	cycleSlotVariant(delta: number): void {
		if (!this.buildModeActive) this.setBuildMode(true);
		if (this.globalMode !== 'none') this.setGlobalMode('none');
		const definition = this.slotDefinition(this.activeSlotNumber);
		if (!definition || definition.variants.length <= 1) return;
		const current = this.variantIndexBySlot.get(definition.slot) ?? 0;
		const next = cycleHotbarVariantIndex(definition.variants.length, current, delta);
		if (next === current) return;
		this.getActiveTool()?.onSecondaryAction();
		this.getActiveTool()?.deactivate();
		this.variantIndexBySlot.set(definition.slot, next);
		this.activateCurrent();
		this.syncPlacementCustomizeToActiveTool();
		this.emitHotbarChange();
	}

	toggleBuildMode(): void {
		this.setBuildMode(!this.buildModeActive);
	}

	toggleRemoveMode(): void {
		if (!this.buildModeActive) this.setBuildMode(true);
		this.setGlobalMode(this.globalMode === 'remove' ? 'none' : 'remove');
	}

	togglePaintMode(): void {
		if (!this.buildModeActive) this.setBuildMode(true);
		this.setGlobalMode(this.globalMode === 'paint' ? 'none' : 'paint');
	}

	isRemoveModeActive(): boolean {
		return this.globalMode === 'remove';
	}

	isPaintModeActive(): boolean {
		return this.globalMode === 'paint';
	}

	isPlacementCustomizeOpen(): boolean {
		return this.placementCustomizeOpen;
	}

	togglePlacementCustomize(): void {
		this.setPlacementCustomizeOpen(!this.placementCustomizeOpen);
	}

	closePlacementCustomize(): void {
		this.setPlacementCustomizeOpen(false);
	}

	private getGlobalTool(): BuildTool | undefined {
		if (this.globalMode === 'remove') return this.removeTool;
		if (this.globalMode === 'paint') return this.paintTool;
		if (this.globalMode === 'music') return this.musicTool;
		return undefined;
	}

	/**
	 * Turns the numbered hotbar and construction tools on or off. Leaving Remove/Paint via this
	 * path must not reactivate the slot (that's the whole point of hiding Build Mode). Compose
	 * Mode is left running — `M` owns that overlay, not `G`.
	 */
	private setBuildMode(active: boolean): void {
		if (active === this.buildModeActive) return;

		if (!active) {
			this.setPlacementCustomizeOpen(false);
			if (this.globalMode === 'remove' || this.globalMode === 'paint') {
				this.getGlobalTool()?.deactivate();
				this.globalMode = 'none';
			} else if (this.globalMode === 'none') {
				this.getActiveTool()?.onSecondaryAction();
				this.getActiveTool()?.deactivate();
			}
			this.buildModeActive = false;
			if (this.globalMode !== 'music') this.onHudChange?.(null);
			this.emitHotbarChange();
			return;
		}

		this.buildModeActive = true;
		if (this.globalMode === 'none') this.activateCurrent();
		this.emitHotbarChange();
	}

	private setGlobalMode(next: GlobalMode): void {
		if (next === this.globalMode) return;
		if (next !== 'none') this.setPlacementCustomizeOpen(false);

		// Leaving whichever global mode (if any) was active.
		this.getGlobalTool()?.deactivate();

		if (next === 'none') {
			this.globalMode = 'none';
			if (this.buildModeActive) this.activateCurrent();
			else this.onHudChange?.(null);
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
		if (!this.buildModeActive) return;
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

	private canOpenPlacementCustomize(): boolean {
		return (
			this.buildModeActive &&
			this.globalMode === 'none' &&
			isCustomizablePlacementTool(this.getActiveToolId()) &&
			!this.isInputBlocked?.()
		);
	}

	private setPlacementCustomizeOpen(open: boolean): void {
		const next = open && this.canOpenPlacementCustomize();
		if (next === this.placementCustomizeOpen) return;
		this.placementCustomizeOpen = next;
		if (next && typeof document !== 'undefined') document.exitPointerLock?.();
		this.onPlacementCustomizeChange?.(next);
	}

	/** Keep the modal up while cycling Door / Window / Beam; close it on Foundation, etc. */
	private syncPlacementCustomizeToActiveTool(): void {
		if (this.placementCustomizeOpen && !this.canOpenPlacementCustomize()) {
			this.setPlacementCustomizeOpen(false);
		}
	}

	private slotDefinition(slot: number) {
		return this.slots.find((definition) => definition.slot === slot);
	}

	private getActiveToolId(): ToolId {
		const definition = this.slotDefinition(this.activeSlotNumber);
		if (!definition) return 'none';
		const index = this.variantIndexBySlot.get(definition.slot) ?? 0;
		return resolveHotbarSlot(definition, index).toolId;
	}

	private getActiveTool(): BuildTool | undefined {
		return this.tools[this.getActiveToolId()];
	}

	private emitHotbarChange(): void {
		this.onHotbarChange?.({
			slots: this.slots.map((definition) =>
				resolveHotbarSlot(definition, this.variantIndexBySlot.get(definition.slot) ?? 0)
			),
			activeSlot: this.activeSlotNumber,
			buildModeActive: this.buildModeActive,
			globalMode: this.globalMode
		});
	}

	dispose(): void {
		this.setPlacementCustomizeOpen(false);
		this.getActiveTool()?.deactivate();
		this.removeTool.deactivate();
		this.paintTool.deactivate();
		this.musicTool?.deactivate();
		window.removeEventListener('keydown', this.handleKeyDown);
		this.domElement.removeEventListener('mousedown', this.handleMouseDown);
		this.domElement.removeEventListener('contextmenu', this.handleContextMenu);
	}
}
