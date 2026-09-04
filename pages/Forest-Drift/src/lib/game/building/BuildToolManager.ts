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
	Digit8: 8
};

export interface BuildToolManagerOptions {
	domElement: HTMLElement;
	tools: Partial<Record<ToolId, BuildTool>>;
	isPointerLocked: () => boolean;
	onHotbarChange?: (state: HotbarUiState) => void;
	onHudChange?: (hud: BuildUiState | null) => void;
}

/**
 * Owns the hotbar selection and routes input to whichever tool is active. Contains no building
 * logic itself — FoundationTool (and future tools) own their own targeting/state/placement.
 */
export class BuildToolManager {
	private readonly slots: readonly HotbarSlot[] = DEFAULT_HOTBAR_SLOTS;
	private readonly tools: Partial<Record<ToolId, BuildTool>>;
	private readonly isPointerLocked: () => boolean;
	private readonly onHotbarChange?: (state: HotbarUiState) => void;
	private readonly onHudChange?: (hud: BuildUiState | null) => void;
	private readonly domElement: HTMLElement;

	private activeSlotNumber = 1;

	private readonly handleKeyDown = (event: KeyboardEvent) => {
		const slot = DIGIT_TO_SLOT[event.code];
		if (slot !== undefined) {
			this.selectSlot(slot);
			return;
		}
		if (event.code === 'Escape') {
			this.getActiveTool()?.onSecondaryAction();
		}
	};

	private readonly handleMouseDown = (event: MouseEvent) => {
		if (event.button === 0) {
			// Ungate: while pointer lock is not yet engaged, this exact click is the one that
			// acquires it (see FirstPersonController) — it must not also place a foundation.
			if (!this.isPointerLocked()) return;
			this.getActiveTool()?.onPrimaryAction();
		} else if (event.button === 2) {
			this.getActiveTool()?.onSecondaryAction();
		}
	};

	private readonly handleContextMenu = (event: MouseEvent) => {
		event.preventDefault();
	};

	constructor(options: BuildToolManagerOptions) {
		this.domElement = options.domElement;
		this.tools = options.tools;
		this.isPointerLocked = options.isPointerLocked;
		this.onHotbarChange = options.onHotbarChange;
		this.onHudChange = options.onHudChange;

		window.addEventListener('keydown', this.handleKeyDown);
		this.domElement.addEventListener('mousedown', this.handleMouseDown);
		this.domElement.addEventListener('contextmenu', this.handleContextMenu);

		this.activateCurrent();
		this.emitHotbarChange();
	}

	selectSlot(slot: number): void {
		if (slot === this.activeSlotNumber || slot < 1 || slot > this.slots.length) return;
		this.getActiveTool()?.deactivate();
		this.activeSlotNumber = slot;
		this.activateCurrent();
		this.emitHotbarChange();
	}

	/** Call once per frame; routes to whichever tool (if any) is currently active. */
	update(): void {
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
		this.onHotbarChange?.({ slots: this.slots, activeSlot: this.activeSlotNumber });
	}

	dispose(): void {
		this.getActiveTool()?.deactivate();
		window.removeEventListener('keydown', this.handleKeyDown);
		this.domElement.removeEventListener('mousedown', this.handleMouseDown);
		this.domElement.removeEventListener('contextmenu', this.handleContextMenu);
	}
}
