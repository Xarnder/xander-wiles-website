import * as THREE from 'three';
import type { BuildingManager } from './BuildingManager';
import type { BuildingMaterialManager } from './BuildingMaterialManager';
import type { BuildTool } from './BuildToolManager';
import type { BuildingSettings, BuildUiState, ToolId } from './FoundationTypes';
import { MaterialPresetStore } from './MaterialPresetStore';
import type { BuildingMaterialDefinition, MaterialKind, MaterialPreset } from './MaterialTypes';
import type { PaintPickUserData, PaintTarget } from './PaintTypes';
import { paintTargetKey, resolvePaintTarget } from './PaintTypes';
import { ROOF_TYPE_LABELS } from './RoofTypes';

const OUTLINE_COLOR = 0x7fe0ff;

/** What the Svelte MaterialPalette mirrors from PaintTool — pushed via `onPaintStateChange` whenever the selected colour or saved-presets list changes. */
export interface PaintUiState {
	selected: BuildingMaterialDefinition | undefined;
	savedPresets: MaterialPreset[];
}

export interface PaintToolOptions {
	scene: THREE.Scene;
	camera: THREE.PerspectiveCamera;
	buildingManager: BuildingManager;
	materialManager: BuildingMaterialManager;
	buildingSettings: BuildingSettings;
	onHudChange?: (hud: BuildUiState | null) => void;
	/** Fired whenever the colour palette opens/closes (`C`) — see the class doc comment on pointer lock. */
	onPaintPaletteChange?: (open: boolean) => void;
	/** Fired whenever the selected colour or saved-presets list changes, so the Svelte palette can mirror it. */
	onPaintStateChange?: (state: PaintUiState) => void;
}

/**
 * The global Paint/Material Tool — toggled by `P`, entirely independent of the numbered hotbar
 * (mirrors RemoveTool.ts and BuildToolManager's class doc comment; see the README's "Paint Tool"
 * section). Paints the WHOLE logical object (a standalone wall, one Continuous Wall segment, a
 * slab, or a foundation) — never a single face — by writing a `BuildingMaterialDefinition` onto
 * that object's own definition via `BuildingManager.paintX()`, then letting the owning render
 * manager rebuild from it exactly the way painting a wall already rebuilds from its `openings`.
 *
 * Targeting raycasts against the SAME wall/wall-path-segment picking meshes Remove Mode uses, plus
 * every slab and foundation mesh — never terrain, trees, window/door openings, or stairs (none of
 * those are paintable in this version; see PaintTypes.ts's `PaintTarget` union). The hovered
 * object's real mesh material is temporarily swapped to whatever the paint action would actually
 * apply (a genuine preview, not an approximation — see BuildingMaterialManager's doc comment) plus a
 * thin outline; both are restored/removed the instant the hover target changes, and NEITHER is
 * touched again once a real paint click has actually rebuilt the object with its new material (see
 * `discardHighlightTracking`).
 *
 * Owns its own `MaterialPresetStore` (localStorage-backed saved colours + last-selected colour —
 * UI preference data, deliberately never part of the authoritative building-state serialization
 * BuildingManager/ThreeScene handle) and its own `C`-key listener (opening the colour palette),
 * exactly like every other build tool owns its own snap-mode/direction key handling. Opening the
 * palette releases pointer lock (`document.exitPointerLock()`) so the OS cursor reappears for the
 * Svelte `MaterialPalette` overlay to be clickable, and `onPrimaryAction` refuses to paint while the
 * palette is open — closing it never accidentally paints whatever was behind the crosshair.
 */
export class PaintTool implements BuildTool {
	readonly toolId: ToolId = 'paint';

	private readonly scene: THREE.Scene;
	private readonly camera: THREE.PerspectiveCamera;
	private readonly buildingManager: BuildingManager;
	private readonly materialManager: BuildingMaterialManager;
	private readonly buildingSettings: BuildingSettings;
	private readonly onHudChange?: (hud: BuildUiState | null) => void;
	private readonly onPaintPaletteChange?: (open: boolean) => void;
	private readonly onPaintStateChange?: (state: PaintUiState) => void;

	private readonly presetStore = new MaterialPresetStore();

	private readonly raycaster = new THREE.Raycaster();
	private readonly screenCenter = new THREE.Vector2(0, 0);

	private readonly highlightOutlineMaterial = new THREE.LineBasicMaterial({
		color: OUTLINE_COLOR,
		depthTest: false
	});
	private highlightOutline: THREE.LineSegments | null = null;
	private highlighted: {
		mesh: THREE.Mesh;
		originalMaterial: THREE.Material | THREE.Material[];
	} | null = null;

	private active = false;
	private paletteOpen = false;
	private hoveredKey: string | null = null;
	private hoveredTarget: PaintTarget | null = null;
	private selectedMaterial: BuildingMaterialDefinition | undefined;

	constructor(options: PaintToolOptions) {
		this.scene = options.scene;
		this.camera = options.camera;
		this.buildingManager = options.buildingManager;
		this.materialManager = options.materialManager;
		this.buildingSettings = options.buildingSettings;
		this.onHudChange = options.onHudChange;
		this.onPaintPaletteChange = options.onPaintPaletteChange;
		this.onPaintStateChange = options.onPaintStateChange;

		this.selectedMaterial = this.presetStore.getLastSelected() ?? undefined;
	}

	private readonly handleKeyDown = (event: KeyboardEvent) => {
		if (!this.active || event.code !== 'KeyC') return;
		this.togglePalette();
	};

	activate(): void {
		this.active = true;
		this.hoveredKey = null;
		this.hoveredTarget = null;
		window.addEventListener('keydown', this.handleKeyDown);
		this.emitPaintState();
	}

	deactivate(): void {
		this.active = false;
		this.closePalette();
		this.clearHighlight();
		window.removeEventListener('keydown', this.handleKeyDown);
		this.onHudChange?.(null);
	}

	update(): void {
		if (!this.active || this.paletteOpen) return;

		this.raycaster.setFromCamera(this.screenCenter, this.camera);
		this.raycaster.far = this.buildingSettings.paintToolMaxDistance;

		const candidates: THREE.Object3D[] = [
			...this.buildingManager.getRaycastableWallMeshes(),
			...this.buildingManager.getRaycastableSlabMeshes(),
			...this.buildingManager.getRaycastableRoofMeshes(),
			...this.buildingManager.getRaycastableFoundationMeshes()
		];
		const hits = candidates.length > 0 ? this.raycaster.intersectObjects(candidates, false) : [];
		const hit = hits[0];
		const target = hit ? resolvePaintTarget(hit.object.userData as PaintPickUserData) : null;

		this.setHoveredTarget(target);
		this.onHudChange?.(target ? this.buildTargetHud(target) : this.buildNoTargetHud());
	}

	onPrimaryAction(): void {
		if (!this.active || this.paletteOpen || !this.hoveredTarget) return;

		const target = this.hoveredTarget;
		const material = this.selectedMaterial;
		let painted: boolean;
		switch (target.type) {
			case 'wall':
				painted = this.buildingManager.paintWall(target.wallId, material);
				break;
			case 'wall-segment':
				painted = this.buildingManager.paintWallSegment(
					target.wallPathId,
					target.segmentId,
					material
				);
				break;
			case 'slab':
				painted = this.buildingManager.paintSlab(target.slabId, material);
				break;
			case 'roof':
				painted = this.buildingManager.paintRoof(target.roofId, material);
				break;
			case 'foundation':
				painted = this.buildingManager.paintFoundation(target.foundationId, material);
				break;
		}
		if (!painted) return;

		// The owning manager has already rebuilt the mesh with its new real material by this point —
		// never try to "restore" the pre-paint preview material on top of that; just stop tracking it.
		this.discardHighlightTracking();
	}

	onSecondaryAction(): void {
		// Exiting Paint Mode on right-click is orchestrated by BuildToolManager (it also owns the
		// hotbar-restore step) — this tool has no pending, cancelable selection of its own since a
		// paint action is a single click, never a multi-step placement.
	}

	togglePalette(): void {
		this.setPaletteOpen(!this.paletteOpen);
	}

	closePalette(): void {
		this.setPaletteOpen(false);
	}

	isPaletteOpen(): boolean {
		return this.paletteOpen;
	}

	private setPaletteOpen(open: boolean): void {
		if (open === this.paletteOpen) return;
		this.paletteOpen = open;
		if (open) document.exitPointerLock();
		this.onPaintPaletteChange?.(open);
	}

	getSelectedMaterial(): BuildingMaterialDefinition | undefined {
		return this.selectedMaterial;
	}

	/** `undefined` selects "Default" — paint will then clear any override instead of applying a colour. */
	selectMaterial(material: BuildingMaterialDefinition | undefined): void {
		this.selectedMaterial = material;
		this.presetStore.setLastSelected(material ?? null);
		if (this.hoveredTarget) {
			// Same target, new colour — the live preview must reflect the new selection immediately,
			// not just on the next hover change.
			this.clearHighlight();
			this.applyHighlight(this.hoveredTarget);
		}
		this.emitPaintState();
	}

	getSavedPresets(): MaterialPreset[] {
		return this.presetStore.getSavedPresets();
	}

	/** Saves the CURRENTLY selected colour as a reusable preset — a no-op returning `null` if "Default" (no colour) is selected, since there is nothing to name/save. */
	savePreset(name?: string): MaterialPreset | null {
		if (!this.selectedMaterial) return null;
		const preset = this.presetStore.savePreset(this.selectedMaterial, name);
		this.emitPaintState();
		return preset;
	}

	removePreset(id: string): void {
		this.presetStore.removePreset(id);
		this.emitPaintState();
	}

	private emitPaintState(): void {
		this.onPaintStateChange?.({
			selected: this.selectedMaterial,
			savedPresets: this.presetStore.getSavedPresets()
		});
	}

	private setHoveredTarget(target: PaintTarget | null): void {
		const key = target ? paintTargetKey(target) : null;
		if (key === this.hoveredKey) {
			this.hoveredTarget = target;
			return;
		}
		this.hoveredKey = key;
		this.hoveredTarget = target;
		this.clearHighlight();
		if (target) this.applyHighlight(target);
	}

	private materialKindFor(target: PaintTarget): MaterialKind {
		if (target.type === 'foundation') return 'foundation';
		if (target.type === 'slab') {
			const slab = this.buildingManager.getSlab(target.slabId);
			return slab?.type === 'flat-roof' ? 'slab-roof' : 'slab-floor';
		}
		if (target.type === 'roof') return 'slab-roof';
		return 'wall';
	}

	/**
	 * Swaps the target's real mesh material to whichever cached material the paint action would
	 * actually apply. A wall-path SEGMENT is special: its merged visible mesh carries one material
	 * PER SEGMENT (see WallPathManager's class doc comment), so only that segment's own group
	 * index/indices are replaced in a cloned materials array — every neighbouring segment's own
	 * colour is untouched. There is deliberately no outline for this case (the merged geometry has
	 * no clean per-segment boundary an `EdgesGeometry` could isolate) — the colour swap alone is
	 * still an unambiguous "this is the target" signal.
	 */
	private applyHighlight(target: PaintTarget): void {
		const kind = this.materialKindFor(target);
		const previewMaterial = this.materialManager.getMaterial(kind, this.selectedMaterial);

		if (target.type === 'wall-segment') {
			const resolved = this.buildingManager.getWallPathVisibleMeshAndGroupIndices(target.segmentId);
			if (!resolved || resolved.groupIndices.length === 0) return;
			const { mesh, groupIndices } = resolved;
			const original = mesh.material;
			const materials = Array.isArray(original) ? [...original] : [original];
			for (const index of groupIndices) materials[index] = previewMaterial;
			this.highlighted = { mesh, originalMaterial: original };
			mesh.material = materials;
			return;
		}

		const mesh = this.resolveSingleMesh(target);
		if (!mesh) return;
		this.highlighted = { mesh, originalMaterial: mesh.material };
		mesh.material = previewMaterial;

		const edges = new THREE.EdgesGeometry(mesh.geometry);
		this.highlightOutline = new THREE.LineSegments(edges, this.highlightOutlineMaterial);
		mesh.add(this.highlightOutline);
	}

	private resolveSingleMesh(target: PaintTarget): THREE.Mesh | undefined {
		switch (target.type) {
			case 'wall':
				return this.buildingManager.getWallMesh(target.wallId);
			case 'foundation':
				return this.buildingManager.getFoundationMesh(target.foundationId);
			case 'slab':
				return this.buildingManager.getSlabMesh(target.slabId);
			case 'roof':
				return this.buildingManager.getRoofMesh(target.roofId);
			case 'wall-segment':
				return undefined;
		}
	}

	/** Restores whatever real material(s) were showing before the preview — used on every hover change, and on deactivate()/exit. Never call this after a successful paint (see `discardHighlightTracking`). */
	private clearHighlight(): void {
		this.disposeOutline();
		if (this.highlighted) {
			this.highlighted.mesh.material = this.highlighted.originalMaterial;
			this.highlighted = null;
		}
	}

	/** Drops highlight tracking WITHOUT restoring anything — the owning manager has already rebuilt the mesh with its real new material, so "restoring" the pre-paint preview value would stomp on that. */
	private discardHighlightTracking(): void {
		this.disposeOutline();
		this.highlighted = null;
		this.hoveredKey = null;
		this.hoveredTarget = null;
	}

	private disposeOutline(): void {
		if (!this.highlightOutline) return;
		this.highlightOutline.geometry.dispose();
		this.highlightOutline.removeFromParent();
		this.highlightOutline = null;
	}

	private currentColorHex(): string | undefined {
		return this.selectedMaterial?.type === 'color' ? this.selectedMaterial.color : undefined;
	}

	private describeTargetLabel(target: PaintTarget): string {
		switch (target.type) {
			case 'wall':
				return 'Wall';
			case 'wall-segment':
				return 'Wall Segment';
			case 'foundation':
				return 'Foundation';
			case 'slab': {
				const slab = this.buildingManager.getSlab(target.slabId);
				if (slab?.type === 'flat-roof') return 'Flat Roof';
				if (slab?.type === 'ceiling') return 'Ceiling';
				return 'Floor';
			}
			case 'roof': {
				const roof = this.buildingManager.getRoof(target.roofId);
				return roof ? ROOF_TYPE_LABELS[roof.type] : 'Roof';
			}
		}
	}

	private buildNoTargetHud(): BuildUiState {
		return {
			toolId: 'paint',
			crosshair: 'default',
			notice: 'No paintable surface',
			paintColor: this.currentColorHex(),
			hintLines: [
				'PAINT',
				'',
				'No paintable surface',
				'',
				'Left Click: Paint',
				'C: Colours',
				'P: Exit'
			]
		};
	}

	private buildTargetHud(target: PaintTarget): BuildUiState {
		const label = this.describeTargetLabel(target);
		return {
			toolId: 'paint',
			crosshair: 'valid',
			notice: label,
			paintColor: this.currentColorHex(),
			hintLines: ['PAINT', '', label, '', 'Click to paint']
		};
	}

	dispose(): void {
		this.deactivate();
		this.highlightOutlineMaterial.dispose();
	}
}
