import * as THREE from 'three';
import type { BuildingManager } from './BuildingManager';
import type { BuildUiState, ToolId } from './FoundationTypes';
import type { BuildUndoManager } from './BuildUndoManager';
import type { FurnitureManager } from './FurnitureManager';
import {
	composeFurnitureMatrix,
	createTorchBodyGeometry,
	createTorchFlameGeometry
} from './FurnitureGeometry';
import {
	facingNormal,
	furnitureOrigin,
	TORCH_PLACE_MAX_DISTANCE
} from './furnitureMath';
import type { FurnitureDefinition } from './FurnitureTypes';
import type { BuildTool } from './BuildToolManager';

const VALID_COLOR = 0x39d353;

export interface FurnitureToolOptions {
	scene: THREE.Scene;
	camera: THREE.PerspectiveCamera;
	buildingManager: BuildingManager;
	furnitureManager: FurnitureManager;
	undoManager: BuildUndoManager;
	getTerrainMeshes: () => readonly THREE.Object3D[];
	onHudChange?: (hud: BuildUiState | null) => void;
}

interface PlacementPreview {
	x: number;
	y: number;
	z: number;
	nx: number;
	ny: number;
	nz: number;
	foundationId: string | null;
}

/**
 * Click-to-place furniture. v1 is torches only — the ghost follows the surface under the
 * crosshair (wall, floor, foundation, or terrain) and a click stamps one instance.
 */
export class FurnitureTool implements BuildTool {
	readonly toolId: ToolId = 'torch';

	private readonly scene: THREE.Scene;
	private readonly camera: THREE.PerspectiveCamera;
	private readonly buildingManager: BuildingManager;
	private readonly furnitureManager: FurnitureManager;
	private readonly undoManager: BuildUndoManager;
	private readonly getTerrainMeshes: () => readonly THREE.Object3D[];
	private readonly onHudChange?: (hud: BuildUiState | null) => void;

	private readonly raycaster = new THREE.Raycaster();
	private readonly screenCenter = new THREE.Vector2(0, 0);
	private readonly worldNormal = new THREE.Vector3();
	private readonly matrix = new THREE.Matrix4();

	private readonly overlay = new THREE.Group();
	private readonly ghostBody: THREE.Mesh;
	private readonly ghostFlame: THREE.Mesh;
	private readonly ghostOutline: THREE.LineSegments;
	private readonly outlineMaterial = new THREE.LineBasicMaterial({ color: VALID_COLOR });

	private active = false;
	private preview: PlacementPreview | null = null;

	constructor(options: FurnitureToolOptions) {
		this.scene = options.scene;
		this.camera = options.camera;
		this.buildingManager = options.buildingManager;
		this.furnitureManager = options.furnitureManager;
		this.undoManager = options.undoManager;
		this.getTerrainMeshes = options.getTerrainMeshes;
		this.onHudChange = options.onHudChange;

		const bodyGeom = createTorchBodyGeometry();
		const flameGeom = createTorchFlameGeometry();
		this.ghostBody = new THREE.Mesh(
			bodyGeom,
			new THREE.MeshStandardMaterial({
				color: 0x5c3a22,
				roughness: 0.86,
				transparent: true,
				opacity: 0.72,
				depthWrite: false,
				flatShading: true
			})
		);
		this.ghostFlame = new THREE.Mesh(
			flameGeom,
			new THREE.MeshStandardMaterial({
				color: 0xffb347,
				emissive: 0xff6a1a,
				emissiveIntensity: 1.6,
				transparent: true,
				opacity: 0.8,
				depthWrite: false
			})
		);
		this.ghostOutline = new THREE.LineSegments(new THREE.EdgesGeometry(bodyGeom), this.outlineMaterial);
		this.ghostOutline.renderOrder = 12;
		this.overlay.add(this.ghostBody, this.ghostFlame, this.ghostOutline);
		this.overlay.visible = false;
	}

	getPreviewMaterials(): THREE.Material[] {
		return [this.ghostBody.material as THREE.Material, this.ghostFlame.material as THREE.Material];
	}

	activate(): void {
		this.active = true;
		this.preview = null;
		this.scene.add(this.overlay);
		this.emitHud();
	}

	deactivate(): void {
		this.active = false;
		this.preview = null;
		this.overlay.visible = false;
		this.overlay.removeFromParent();
		this.onHudChange?.(null);
	}

	update(): void {
		if (!this.active) return;
		this.preview = this.pickPlacement();
		this.refreshGhost();
		this.emitHud();
	}

	onPrimaryAction(): void {
		if (!this.active || !this.preview) return;
		const item: FurnitureDefinition = {
			id: crypto.randomUUID(),
			kind: 'torch',
			foundationId: this.preview.foundationId,
			x: this.preview.x,
			y: this.preview.y,
			z: this.preview.z,
			nx: this.preview.nx,
			ny: this.preview.ny,
			nz: this.preview.nz
		};
		this.furnitureManager.add(item);
		this.undoManager.record({ kind: 'furniture', furnitureId: item.id });
	}

	onSecondaryAction(): void {
		// Single-click tool — nothing to cancel.
	}

	dispose(): void {
		this.deactivate();
		this.ghostBody.geometry.dispose();
		this.ghostFlame.geometry.dispose();
		(this.ghostBody.material as THREE.Material).dispose();
		(this.ghostFlame.material as THREE.Material).dispose();
		this.ghostOutline.geometry.dispose();
		this.outlineMaterial.dispose();
	}

	private pickPlacement(): PlacementPreview | null {
		this.raycaster.setFromCamera(this.screenCenter, this.camera);
		this.raycaster.far = TORCH_PLACE_MAX_DISTANCE;
		const candidates: THREE.Object3D[] = [
			...this.buildingManager.getRaycastableWallMeshes(),
			...this.buildingManager.getRaycastableSlabMeshes(),
			...this.buildingManager.getRaycastableFoundationMeshes(),
			...this.buildingManager.getRaycastableRoofMeshes(),
			...this.getTerrainMeshes()
		];
		const hits = candidates.length > 0 ? this.raycaster.intersectObjects(candidates, false) : [];
		const hit = hits[0];
		if (!hit?.face) return null;

		this.worldNormal.copy(hit.face.normal).transformDirection(hit.object.matrixWorld).normalize();
		const facing = facingNormal(
			{
				x: this.raycaster.ray.direction.x,
				y: this.raycaster.ray.direction.y,
				z: this.raycaster.ray.direction.z
			},
			{ x: this.worldNormal.x, y: this.worldNormal.y, z: this.worldNormal.z }
		);
		if (!facing) return null;

		const origin = furnitureOrigin(
			{ x: hit.point.x, y: hit.point.y, z: hit.point.z },
			facing
		);
		const userData = hit.object.userData as { foundationId?: string };
		return {
			x: origin.x,
			y: origin.y,
			z: origin.z,
			nx: facing.x,
			ny: facing.y,
			nz: facing.z,
			foundationId: userData.foundationId ?? null
		};
	}

	private refreshGhost(): void {
		if (!this.preview) {
			this.overlay.visible = false;
			return;
		}
		composeFurnitureMatrix(
			{
				id: 'ghost',
				kind: 'torch',
				...this.preview
			},
			this.matrix
		);
		this.overlay.matrix.copy(this.matrix);
		this.overlay.matrixAutoUpdate = false;
		this.overlay.updateMatrixWorld(true);
		this.overlay.visible = true;
		this.outlineMaterial.color.setHex(VALID_COLOR);
	}

	private emitHud(): void {
		this.onHudChange?.({
			toolId: 'torch',
			crosshair: this.preview ? 'valid' : 'invalid',
			hintLines: [
				'FURNITURE',
				'Torch',
				'',
				this.preview ? 'Click: Place torch' : 'Aim at a wall, floor, or the ground',
				'X: Remove'
			]
		});
	}
}
