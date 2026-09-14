import * as THREE from 'three';
import type { BuildTool } from '../building/BuildToolManager';
import type { BuildUndoManager } from '../building/BuildUndoManager';
import type { BuildUiState, ToolId } from '../building/FoundationTypes';
import { getFurnitureCatalogueEntry } from '../building/furnitureCatalogue';
import type { FurnitureTool } from '../building/FurnitureTool';
import { FURNITURE_PLACE_MAX_DISTANCE } from '../building/furniturePlacementMath';
import { gridToMeters, nextQuarterTurn } from './miniBuildGrid';
import { MiniBuildGhost } from './MiniBuildGhost';
import {
	solveMiniBuildPlacement,
	type MiniBuildPlacementContext,
	type MiniBuildPlacementPreview
} from './MiniBuildPlacement';
import { selectionKey, type MiniBuildPreferences } from './MiniBuildPreferences';
import {
	formatAreaDetail,
	type MiniBuildChunkReadout,
	type MiniBuildSystem
} from './MiniBuildSystem';
import type {
	MiniBuildDefinition,
	MiniBuildMaterialOverride,
	PlaceObjectSelection,
	QuarterTurn
} from './MiniBuildTypes';

const TARGET_COLOR = 0x7ec8e3;

export interface PlaceObjectToolOptions {
	scene: THREE.Scene;
	placement: MiniBuildPlacementContext;
	system: MiniBuildSystem;
	furnitureTool: FurnitureTool;
	undoManager: BuildUndoManager;
	preferences: MiniBuildPreferences;
	onHudChange?: (hud: BuildUiState | null) => void;
	onSelectionChange?: (selection: PlaceObjectSelection) => void;
	/** `F` on a placed Mini Build — the UI decides between Edit Shared Design and Make Unique. */
	onEditInstanceRequest?: (instanceId: string) => void;
	onNotice?: (message: string) => void;
}

/**
 * Hotbar slot 8 — Place Object. Places Mini Builds (player designs, personal library designs and
 * the default starter designs) and, for special functional objects (lights), delegates to the legacy
 * FurnitureTool, which keeps their dynamic-light behaviour.
 *
 * Controls: `E` Object Library (handled by BuildToolManager) · `R` rotate 90° · `↑/↓` recent objects ·
 * `C` copy the looked-at object · `F` edit the looked-at object · click place · right click / Esc cancel.
 */
export class PlaceObjectTool implements BuildTool {
	readonly toolId: ToolId = 'place-object';

	private readonly scene: THREE.Scene;
	private readonly placement: MiniBuildPlacementContext;
	private readonly system: MiniBuildSystem;
	private readonly furnitureTool: FurnitureTool;
	private readonly undoManager: BuildUndoManager;
	private readonly preferences: MiniBuildPreferences;
	private readonly onHudChange?: (hud: BuildUiState | null) => void;
	private readonly onSelectionChange?: (selection: PlaceObjectSelection) => void;
	private readonly onEditInstanceRequest?: (instanceId: string) => void;
	private readonly onNotice?: (message: string) => void;

	private readonly ghost: MiniBuildGhost;
	private readonly targetHighlight: THREE.LineSegments;
	private readonly raycaster = new THREE.Raycaster();
	private readonly screenCenter = new THREE.Vector2(0, 0);

	private selection: PlaceObjectSelection;
	private rotationY: QuarterTurn = 0;
	private materialOverrides: MiniBuildMaterialOverride[] | undefined;
	private preview: MiniBuildPlacementPreview | null = null;
	private targetInstanceId: string | null = null;
	private active = false;
	private delegatingToLight = false;

	private readonly handleKeyDown = (event: KeyboardEvent) => {
		if (!this.active || event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
		if (isTypingTarget(event.target)) return;
		switch (event.code) {
			case 'KeyR':
				if (!this.delegatingToLight) this.rotate();
				break;
			case 'KeyC':
				this.copyTarget();
				break;
			case 'KeyF':
				if (this.targetInstanceId) this.onEditInstanceRequest?.(this.targetInstanceId);
				break;
			case 'ArrowUp':
			case 'ArrowDown':
				event.preventDefault();
				this.cycleRecent(event.code === 'ArrowUp' ? -1 : 1);
				break;
		}
	};

	constructor(options: PlaceObjectToolOptions) {
		this.scene = options.scene;
		this.placement = options.placement;
		this.system = options.system;
		this.furnitureTool = options.furnitureTool;
		this.undoManager = options.undoManager;
		this.preferences = options.preferences;
		this.onHudChange = options.onHudChange;
		this.onSelectionChange = options.onSelectionChange;
		this.onEditInstanceRequest = options.onEditInstanceRequest;
		this.onNotice = options.onNotice;
		this.selection = this.preferences.lastSelection;
		this.ghost = new MiniBuildGhost(this.system.cache);
		this.targetHighlight = new THREE.LineSegments(
			new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)),
			new THREE.LineBasicMaterial({
				color: TARGET_COLOR,
				transparent: true,
				opacity: 0.9,
				depthTest: false
			})
		);
		this.targetHighlight.renderOrder = 24;
		this.targetHighlight.visible = false;
	}

	getPreviewMaterials(): THREE.Material[] {
		return this.ghost.getMaterials();
	}

	getSelection(): PlaceObjectSelection {
		return this.selection;
	}

	getRotation(): QuarterTurn {
		return this.rotationY;
	}

	getPreview(): MiniBuildPlacementPreview | null {
		return this.preview;
	}

	getTargetInstanceId(): string | null {
		return this.targetInstanceId;
	}

	/** Usage of the chunk under the ghost, including what placing the selected design would add. */
	getPlacementReadout(): MiniBuildChunkReadout | null {
		if (!this.active || this.delegatingToLight || !this.preview) return null;
		const definition = this.system.peekSelection(this.selection);
		if (!definition) return null;
		return this.system.getChunkReadout(
			this.preview.position.x,
			this.preview.position.z,
			definition.blocks.length
		);
	}

	isCapturingKey(code: string): boolean {
		return code === 'ArrowUp' || code === 'ArrowDown';
	}

	setSelection(
		selection: PlaceObjectSelection,
		options: { rotationY?: QuarterTurn; materialOverrides?: MiniBuildMaterialOverride[] } = {}
	): void {
		this.selection = selection;
		this.materialOverrides = options.materialOverrides;
		if (options.rotationY !== undefined) this.rotationY = options.rotationY;
		this.preferences.remember(selection);
		this.onSelectionChange?.(selection);
		if (this.active) this.syncDelegation();
	}

	activate(): void {
		this.active = true;
		this.preview = null;
		this.scene.add(this.ghost.group, this.targetHighlight);
		window.addEventListener('keydown', this.handleKeyDown);
		this.syncDelegation();
	}

	deactivate(): void {
		if (this.delegatingToLight) this.furnitureTool.deactivate();
		this.delegatingToLight = false;
		this.active = false;
		this.preview = null;
		this.targetInstanceId = null;
		this.ghost.setVisible(false);
		this.targetHighlight.visible = false;
		this.ghost.group.removeFromParent();
		this.targetHighlight.removeFromParent();
		window.removeEventListener('keydown', this.handleKeyDown);
		this.onHudChange?.(null);
	}

	update(): void {
		if (!this.active) return;
		this.updateTarget();
		if (this.delegatingToLight) {
			this.furnitureTool.update();
			return;
		}
		const definition = this.system.peekSelection(this.selection);
		this.ghost.setDefinition(definition ?? null);
		this.preview = definition
			? solveMiniBuildPlacement(this.placement, definition, this.rotationY)
			: null;
		if (this.preview) {
			this.ghost.setTransform(this.preview.position, this.preview.rotationY);
			this.ghost.setValid(this.preview.valid);
			this.ghost.setVisible(true);
		} else {
			this.ghost.setVisible(false);
		}
		this.emitHud(definition);
	}

	onPrimaryAction(): void {
		if (!this.active) return;
		if (this.delegatingToLight) {
			this.furnitureTool.onPrimaryAction();
			return;
		}
		this.placeAtPreview();
	}

	onSecondaryAction(): void {
		if (this.delegatingToLight) {
			this.furnitureTool.onSecondaryAction();
			return;
		}
		// Same convention as the other single-click placement tools: cancel drops the current preview
		// (and any material overrides picked up by Copy); the ghost returns on the next frame.
		this.preview = null;
		this.materialOverrides = undefined;
		this.ghost.setVisible(false);
	}

	/** Places the current selection at the current preview. Returns the new instance id on success. */
	placeAtPreview(): string | null {
		const preview = this.preview;
		if (!preview?.valid) {
			if (preview?.reason) this.onNotice?.(preview.reason);
			return null;
		}
		const ensured = this.system.ensureInWorld(this.selection);
		if (!ensured.ok) {
			this.onNotice?.(ensured.error);
			return null;
		}
		const placed = this.system.placeInstance(
			ensured.value.id,
			preview.position,
			preview.rotationY,
			{
				foundationId: preview.foundationId,
				materialOverrides: this.materialOverrides
			}
		);
		if (!placed.ok) {
			this.onNotice?.(placed.error);
			return null;
		}
		this.undoManager.record({ kind: 'miniBuild', instanceId: placed.value.id });
		this.preferences.remember(this.selection);
		return placed.value.id;
	}

	rotate(): void {
		this.rotationY = nextQuarterTurn(this.rotationY);
	}

	/** Copy / Duplicate: pick up the looked-at object's design, rotation and material overrides. */
	copyTarget(): boolean {
		if (!this.targetInstanceId) return false;
		const copied = this.system.copyInstance(this.targetInstanceId);
		if (!copied) return false;
		this.setSelection(
			{ type: 'mini-build', designId: copied.designId },
			{ rotationY: copied.rotationY, materialOverrides: copied.materialOverrides }
		);
		const name = this.system.getDesign(copied.designId)?.name ?? 'object';
		this.onNotice?.(`Copied ${name}`);
		return true;
	}

	dispose(): void {
		this.deactivate();
		this.ghost.dispose();
		this.targetHighlight.geometry.dispose();
		(this.targetHighlight.material as THREE.Material).dispose();
	}

	private syncDelegation(): void {
		const wantsLight = this.selection.type === 'light';
		if (wantsLight && this.selection.type === 'light') {
			this.ghost.setVisible(false);
			this.furnitureTool.setKind(this.selection.kind);
			if (!this.delegatingToLight) this.furnitureTool.activate();
			this.delegatingToLight = true;
			return;
		}
		if (this.delegatingToLight) this.furnitureTool.deactivate();
		this.delegatingToLight = false;
	}

	private cycleRecent(direction: -1 | 1): void {
		const recent = this.preferences.recent.filter(
			(entry) => entry.type === 'light' || this.system.peekSelection(entry)
		);
		if (recent.length < 2) return;
		const index = recent.findIndex((entry) => selectionKey(entry) === selectionKey(this.selection));
		const next = recent[(Math.max(0, index) + direction + recent.length) % recent.length];
		this.selection = next;
		this.materialOverrides = undefined;
		this.onSelectionChange?.(next);
		this.syncDelegation();
	}

	private updateTarget(): void {
		this.raycaster.setFromCamera(this.screenCenter, this.placement.camera);
		this.raycaster.far = FURNITURE_PLACE_MAX_DISTANCE;
		const hit = this.system.instances.raycast(this.raycaster);
		this.targetInstanceId = hit?.id ?? null;
		const box = hit ? this.system.instances.worldAabb(hit.id) : null;
		if (!box) {
			this.targetHighlight.visible = false;
			return;
		}
		this.targetHighlight.position.set(
			(box.minX + box.maxX) / 2,
			(box.minY + box.maxY) / 2,
			(box.minZ + box.maxZ) / 2
		);
		this.targetHighlight.scale.set(
			box.maxX - box.minX + 0.04,
			box.maxY - box.minY + 0.04,
			box.maxZ - box.minZ + 0.04
		);
		this.targetHighlight.updateMatrixWorld(true);
		this.targetHighlight.visible = true;
	}

	private emitHud(definition: MiniBuildDefinition | undefined): void {
		if (!definition) {
			this.onHudChange?.({
				toolId: 'place-object',
				crosshair: 'default',
				hintLines: ['PLACE OBJECT', 'Nothing selected', '', 'E    Object Library'],
				notice: 'Press E to choose an object'
			});
			return;
		}
		const size = {
			x: gridToMeters(definition.bounds.max.x - definition.bounds.min.x),
			y: gridToMeters(definition.bounds.max.y - definition.bounds.min.y),
			z: gridToMeters(definition.bounds.max.z - definition.bounds.min.z)
		};
		const target = this.targetInstanceId
			? this.system.instances.get(this.targetInstanceId)
			: undefined;
		const targetName = target ? this.system.getDesign(target.designId)?.name : undefined;
		const placeLine = this.preview
			? this.preview.valid
				? 'Click: Place'
				: (this.preview.reason ?? 'Cannot place here')
			: 'Aim at a floor, foundation, or the ground';
		const lines = [
			'PLACE OBJECT',
			`${definition.name} · ${definition.blocks.length} block${definition.blocks.length === 1 ? '' : 's'}`,
			`${size.x.toFixed(2)} × ${size.z.toFixed(2)} × ${size.y.toFixed(2)}m`,
			`Rotation: ${this.rotationY}°`,
			'',
			'E    Object Library',
			'R    Rotate',
			'↑/↓  Recent objects'
		];
		if (targetName) lines.push(`C    Copy ${targetName}`, `F    Edit ${targetName}`);
		const readout = this.getPlacementReadout();
		if (readout) lines.push('', formatAreaDetail(readout));
		lines.push(placeLine.split('\n')[0], 'X: Remove');
		this.onHudChange?.({
			toolId: 'place-object',
			crosshair: this.preview?.valid ? 'valid' : 'invalid',
			hintLines: lines,
			notice: this.preview
				? this.preview.valid
					? (this.preview.notice ?? undefined)
					: (this.preview.reason ?? undefined)
				: undefined
		});
	}
}

export function lightSelectionName(kind: 'torch' | 'lantern' | 'fireplace'): string {
	return getFurnitureCatalogueEntry(kind).name;
}

function isTypingTarget(target: EventTarget | null): boolean {
	if (!(target instanceof HTMLElement)) return false;
	if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return true;
	return target.isContentEditable;
}
