import * as THREE from 'three';
import type { BuildTool } from './BuildToolManager';
import type { FoundationManager } from './FoundationManager';
import type { BuildingLevelManager } from './BuildingLevelManager';
import type { FurnitureManager } from './FurnitureManager';
import type { BuildUndoManager } from './BuildUndoManager';
import type { BuildingSettings, BuildUiState } from './FoundationTypes';
import { raycastLevelConstructionPlane } from './foundationTopTargeting';
import { buildingGridToLocal, foundationLocalFrame } from './FoundationLocalMath';
import { createFurnitureGroup, disposeFurnitureGroup } from './FurnitureGeometry';
import type { FurnitureDefinition } from './FurnitureTypes';
import { pillarDefinition } from './PillarTypes';

export interface PillarToolOptions {
	scene: THREE.Scene;
	camera: THREE.PerspectiveCamera;
	foundationManager: FoundationManager;
	levelManager: BuildingLevelManager;
	furnitureManager: FurnitureManager;
	undoManager: BuildUndoManager;
	buildingSettings: BuildingSettings;
	getVertexSpacing: () => number;
	onHudChange?: (hud: BuildUiState | null) => void;
}

/** Grid-aligned, one-click structural posts at the selected foundation/storey. */
export class PillarTool implements BuildTool {
	readonly toolId = 'pillar' as const;
	private active = false;
	private readonly raycaster = new THREE.Raycaster();
	private readonly screenCenter = new THREE.Vector2();
	private readonly material = new THREE.MeshStandardMaterial({
		color: 0x39d353,
		transparent: true,
		opacity: 0.55,
		depthWrite: false
	});
	private ghost?: THREE.Group;
	private ghostKey = '';
	private target?: FurnitureDefinition;
	constructor(private readonly options: PillarToolOptions) {}
	getPreviewMaterials(): THREE.Material[] {
		return [this.material];
	}
	isPlacementInProgress(): boolean {
		return this.active && !!this.target;
	}

	activate(): void {
		this.active = true;
		this.update();
	}
	deactivate(): void {
		this.active = false;
		this.target = undefined;
		if (this.ghost) this.ghost.visible = false;
		this.options.onHudChange?.(null);
	}
	update(): void {
		if (!this.active) return;
		const o = this.options;
		this.raycaster.setFromCamera(this.screenCenter, o.camera);
		const hit = raycastLevelConstructionPlane(
			this.raycaster,
			o.foundationManager,
			o.levelManager,
			o.getVertexSpacing(),
			o.buildingSettings.buildingGridSize
		);
		this.target = undefined;
		if (hit) {
			const foundation = o.foundationManager.getFoundation(hit.foundationId)!;
			o.levelManager.reportHoveredFoundation(hit.foundationId);
			const index = o.levelManager.getCurrentLevelIndex(hit.foundationId);
			const level = o.levelManager.getOrCreateLevel(hit.foundationId, index);
			const frame = foundationLocalFrame(foundation, o.getVertexSpacing());
			const point = buildingGridToLocal(hit.gridPoint, o.buildingSettings.buildingGridSize);
			const candidate = pillarDefinition(
				o.buildingSettings.pillar,
				{
					x: frame.originWorldX + point.localX,
					y: frame.originWorldY + level.baseY,
					z: frame.originWorldZ + point.localZ
				},
				hit.foundationId,
				'pillar-preview'
			);
			// Do not stack duplicate posts at one grid point/storey.
			if (
				!o.furnitureManager
					.getAll()
					.some(
						(item) =>
							item.kind === 'wooden-pillar' &&
							Math.hypot(item.x - candidate.x, item.z - candidate.z) < 0.01 &&
							Math.abs(item.y - candidate.y) < 0.01
					)
			)
				this.target = candidate;
		}
		const key = this.target ? JSON.stringify(this.target) : '';
		if (key !== this.ghostKey) {
			if (this.ghost) disposeFurnitureGroup(this.ghost, false);
			this.ghost = this.target
				? createFurnitureGroup(this.target, {
						primary: this.material,
						secondary: this.material,
						accent: this.material,
						emissive: this.material
					})
				: undefined;
			if (this.ghost) o.scene.add(this.ghost);
			this.ghostKey = key;
		}
		if (this.ghost) this.ghost.visible = !!this.target;
		o.onHudChange?.({
			toolId: 'pillar',
			level: hit ? o.levelManager.getLevelUiState(hit.foundationId) : undefined,
			crosshair: this.target ? 'valid' : hit ? 'invalid' : 'default',
			hintLines: [
				'WOODEN PILLARS',
				'Snaps to the building grid',
				this.target
					? 'Place: add pillar'
					: hit
						? 'A pillar already occupies this point'
						: 'Look at a foundation or selected floor',
				'E: Customise'
			]
		});
	}
	onPrimaryAction(): void {
		this.update();
		if (!this.target) return;
		const id = crypto.randomUUID();
		this.options.furnitureManager.add({ ...this.target, id });
		this.options.undoManager.record({ kind: 'furniture', furnitureId: id });
		this.update();
	}
	onSecondaryAction(): void {}
	dispose(): void {
		this.deactivate();
		if (this.ghost) disposeFurnitureGroup(this.ghost, false);
		this.material.dispose();
	}
}
