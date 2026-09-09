import * as THREE from 'three';
import type { BuildingManager } from './BuildingManager';
import type { BuildUiState, BuildingSettings, HotbarSlotVariant, ToolId } from './FoundationTypes';
import type { BuildUndoManager } from './BuildUndoManager';
import type { FoundationManager } from './FoundationManager';
import {
	composeFurnitureMatrix,
	createFurnitureGroup,
	disposeFurnitureGroup,
	type FurnitureVisualMaterials
} from './FurnitureGeometry';
import type { FurnitureManager } from './FurnitureManager';
import { FurniturePresetStore } from './FurniturePresetStore';
import { getFurnitureCatalogueEntry, resolveFurnitureBuildInput } from './furnitureCatalogue';
import {
	FURNITURE_OBJECT_GAP,
	FURNITURE_PLACE_MAX_DISTANCE,
	FURNITURE_SUPPORT_SLOPE,
	FURNITURE_WALL_CLEARANCE,
	aabbOverlap,
	aabbOverlapsWallRect,
	cycleFurnitureRotation,
	furnitureFootprintCorners,
	furnitureRotationDegrees,
	furnitureWorldAabb,
	snapWorldToGrid,
	supportSpreadOk
} from './furniturePlacementMath';
import { facingNormal, furnitureOrigin, TORCH_PLACE_MAX_DISTANCE } from './furnitureMath';
import type { FurnitureDefinition, FurnitureKind } from './FurnitureTypes';
import { furnitureColorMaterial } from './FurnitureTypes';
import type { BuildTool } from './BuildToolManager';
import type { WorldSurfaceSampler } from './WorldSurfaceSampler';
import type { WallCollisionRect } from './wallCollision';
import { colorMaterialFromHex } from './MaterialTypes';

const VALID_COLOR = 0x39d353;
const INVALID_COLOR = 0xf85149;

export interface FurnitureToolOptions {
	scene: THREE.Scene;
	camera: THREE.PerspectiveCamera;
	buildingManager: BuildingManager;
	foundationManager: FoundationManager;
	furnitureManager: FurnitureManager;
	undoManager: BuildUndoManager;
	buildingSettings: BuildingSettings;
	worldSurfaceSampler: WorldSurfaceSampler;
	getTerrainMeshes: () => readonly THREE.Object3D[];
	getWallRects: () => readonly WallCollisionRect[];
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
	valid: boolean;
	reason: string | null;
}

/**
 * Click-to-place furniture / objects (hotbar 8). The ghost is the real procedural mesh. Torches
 * keep wall-or-floor mounting; every other catalogue item sits on a horizontal surface.
 */
export class FurnitureTool implements BuildTool {
	readonly toolId: ToolId = 'torch';

	private readonly scene: THREE.Scene;
	private readonly camera: THREE.PerspectiveCamera;
	private readonly buildingManager: BuildingManager;
	private readonly foundationManager: FoundationManager;
	private readonly furnitureManager: FurnitureManager;
	private readonly undoManager: BuildUndoManager;
	private readonly buildingSettings: BuildingSettings;
	private readonly worldSurfaceSampler: WorldSurfaceSampler;
	private readonly getTerrainMeshes: () => readonly THREE.Object3D[];
	private readonly getWallRects: () => readonly WallCollisionRect[];
	private readonly onHudChange?: (hud: BuildUiState | null) => void;
	private readonly presetStore = new FurniturePresetStore();

	private readonly raycaster = new THREE.Raycaster();
	private readonly screenCenter = new THREE.Vector2(0, 0);
	private readonly worldNormal = new THREE.Vector3();
	private readonly matrix = new THREE.Matrix4();
	private readonly overlay = new THREE.Group();
	private readonly footprint = new THREE.Mesh(
		new THREE.PlaneGeometry(1, 1),
		new THREE.MeshBasicMaterial({
			color: VALID_COLOR,
			transparent: true,
			opacity: 0.16,
			depthWrite: false,
			side: THREE.DoubleSide
		})
	);
	private readonly outlineMaterial = new THREE.LineBasicMaterial({ color: VALID_COLOR });
	private ghost: THREE.Group | null = null;
	private ghostOutline: THREE.LineSegments | null = null;
	private ghostKey = '';

	private readonly ghostMaterials: FurnitureVisualMaterials;

	private active = false;
	private hydrated = false;
	private preview: PlacementPreview | null = null;

	private readonly handleKeyDown = (event: KeyboardEvent) => {
		if (!this.active || event.repeat) return;
		if (event.metaKey || event.ctrlKey || event.altKey) return;
		if (isTypingTarget(event.target)) return;
		if (event.code !== 'KeyR') return;
		this.buildingSettings.furnitureRotationY = cycleFurnitureRotation(
			this.buildingSettings.furnitureRotationY
		);
		this.presetStore.remember(
			this.buildingSettings.furnitureKind,
			this.presetStore.captureFrom(this.buildingSettings)
		);
	};

	constructor(options: FurnitureToolOptions) {
		this.scene = options.scene;
		this.camera = options.camera;
		this.buildingManager = options.buildingManager;
		this.foundationManager = options.foundationManager;
		this.furnitureManager = options.furnitureManager;
		this.undoManager = options.undoManager;
		this.buildingSettings = options.buildingSettings;
		this.worldSurfaceSampler = options.worldSurfaceSampler;
		this.getTerrainMeshes = options.getTerrainMeshes;
		this.getWallRects = options.getWallRects;
		this.onHudChange = options.onHudChange;

		this.ghostMaterials = {
			primary: new THREE.MeshStandardMaterial({
				color: 0x8b5a2b,
				roughness: 0.84,
				transparent: true,
				opacity: 0.72,
				depthWrite: false,
				flatShading: true
			}),
			secondary: new THREE.MeshStandardMaterial({
				color: 0xe8dcc8,
				roughness: 0.78,
				transparent: true,
				opacity: 0.72,
				depthWrite: false,
				flatShading: true
			}),
			accent: new THREE.MeshStandardMaterial({
				color: 0x5c3a22,
				roughness: 0.7,
				transparent: true,
				opacity: 0.72,
				depthWrite: false,
				flatShading: true
			}),
			emissive: new THREE.MeshStandardMaterial({
				color: 0xffb347,
				emissive: 0xff6a1a,
				emissiveIntensity: 1.4,
				transparent: true,
				opacity: 0.8,
				depthWrite: false
			})
		};

		this.footprint.rotation.x = -Math.PI / 2;
		this.footprint.renderOrder = 11;
		this.overlay.add(this.footprint);
		this.overlay.visible = false;

		this.presetStore.hydrate(this.buildingSettings);
		this.hydrated = true;
	}

	getPreviewMaterials(): THREE.Material[] {
		return [
			this.ghostMaterials.primary,
			this.ghostMaterials.secondary,
			this.ghostMaterials.accent,
			this.ghostMaterials.emissive,
			this.footprint.material as THREE.Material
		];
	}

	activate(): void {
		this.active = true;
		this.preview = null;
		if (!this.hydrated) {
			this.presetStore.hydrate(this.buildingSettings);
			this.hydrated = true;
		}
		this.syncGhostGeometry();
		this.scene.add(this.overlay);
		window.addEventListener('keydown', this.handleKeyDown);
		this.emitHud();
	}

	setVariant(variant: HotbarSlotVariant): void {
		if (variant.furnitureKind) {
			this.setKind(variant.furnitureKind);
		}
	}

	setKind(kind: FurnitureKind): void {
		if (this.buildingSettings.furnitureKind !== kind) {
			this.presetStore.applyTo(this.buildingSettings, kind);
		}
		if (this.active) {
			this.syncGhostGeometry();
			this.preview = this.pickPlacement();
			this.refreshGhost();
			this.emitHud();
		}
	}

	deactivate(): void {
		this.active = false;
		this.preview = null;
		this.overlay.visible = false;
		this.overlay.removeFromParent();
		window.removeEventListener('keydown', this.handleKeyDown);
		this.onHudChange?.(null);
	}

	update(): void {
		if (!this.active) return;
		this.syncGhostGeometry();
		this.preview = this.pickPlacement();
		this.refreshGhost();
		this.emitHud();
	}

	onPrimaryAction(): void {
		if (!this.active || !this.preview?.valid) return;
		const item = this.definitionFromPreview(this.preview);
		this.furnitureManager.add(item);
		this.undoManager.record({ kind: 'furniture', furnitureId: item.id });
		this.presetStore.remember(
			this.buildingSettings.furnitureKind,
			this.presetStore.captureFrom(this.buildingSettings)
		);
	}

	onSecondaryAction(): void {
		this.preview = null;
		this.overlay.visible = false;
	}

	dispose(): void {
		this.deactivate();
		this.clearGhost();
		this.footprint.geometry.dispose();
		(this.footprint.material as THREE.Material).dispose();
		this.outlineMaterial.dispose();
		for (const material of Object.values(this.ghostMaterials)) material.dispose();
	}

	private definitionFromPreview(preview: PlacementPreview): FurnitureDefinition {
		const settings = this.buildingSettings;
		const entry = getFurnitureCatalogueEntry(settings.furnitureKind);
		const input = resolveFurnitureBuildInput({
			kind: settings.furnitureKind,
			dimensions: {
				width: settings.furnitureWidth,
				depth: settings.furnitureDepth,
				height: settings.furnitureHeight
			},
			parameters: {
				backrest: settings.furnitureBackrest,
				headboard: settings.furnitureHeadboard,
				shelfCount: settings.furnitureShelfCount
			}
		});
		const parameters: Record<string, number | boolean> = {};
		for (const param of entry.params) {
			if (param.key === 'backrest') parameters.backrest = input.backrest;
			if (param.key === 'headboard') parameters.headboard = input.headboard;
			if (param.key === 'shelfCount') parameters.shelfCount = input.shelfCount;
		}
		return {
			id: crypto.randomUUID(),
			kind: settings.furnitureKind,
			foundationId: preview.foundationId,
			x: preview.x,
			y: preview.y,
			z: preview.z,
			nx: preview.nx,
			ny: preview.ny,
			nz: preview.nz,
			rotationY: settings.furnitureKind === 'torch' ? 0 : settings.furnitureRotationY,
			dimensions: { width: input.width, depth: input.depth, height: input.height },
			material: colorMaterialFromHex(settings.furniturePrimaryColor),
			secondaryMaterial: colorMaterialFromHex(settings.furnitureSecondaryColor),
			parameters
		};
	}

	private ghostDefinition(): FurnitureDefinition {
		return {
			id: 'ghost',
			kind: this.buildingSettings.furnitureKind,
			foundationId: null,
			x: 0,
			y: 0,
			z: 0,
			nx: 0,
			ny: 1,
			nz: 0,
			rotationY: this.buildingSettings.furnitureRotationY,
			dimensions: {
				width: this.buildingSettings.furnitureWidth,
				depth: this.buildingSettings.furnitureDepth,
				height: this.buildingSettings.furnitureHeight
			},
			material: furnitureColorMaterial(
				this.buildingSettings.furniturePrimaryColor,
				getFurnitureCatalogueEntry(this.buildingSettings.furnitureKind).defaultPrimary
			),
			secondaryMaterial: furnitureColorMaterial(
				this.buildingSettings.furnitureSecondaryColor,
				getFurnitureCatalogueEntry(this.buildingSettings.furnitureKind).defaultSecondary
			),
			parameters: {
				backrest: this.buildingSettings.furnitureBackrest,
				headboard: this.buildingSettings.furnitureHeadboard,
				shelfCount: this.buildingSettings.furnitureShelfCount
			}
		};
	}

	private settingsKey(): string {
		const s = this.buildingSettings;
		return [
			s.furnitureKind,
			s.furnitureWidth,
			s.furnitureDepth,
			s.furnitureHeight,
			s.furnitureBackrest,
			s.furnitureHeadboard,
			s.furnitureShelfCount,
			s.furniturePrimaryColor,
			s.furnitureSecondaryColor
		].join(':');
	}

	private syncGhostGeometry(): void {
		const key = this.settingsKey();
		if (key === this.ghostKey && this.ghost) return;
		this.clearGhost();
		const group = createFurnitureGroup(this.ghostDefinition(), this.ghostMaterials);
		this.ghost = group;
		const firstMesh = group.children.find((child) => child instanceof THREE.Mesh) as
			THREE.Mesh | undefined;
		if (firstMesh) {
			this.ghostOutline = new THREE.LineSegments(
				new THREE.EdgesGeometry(firstMesh.geometry),
				this.outlineMaterial
			);
			this.ghostOutline.renderOrder = 12;
			group.add(this.ghostOutline);
		}
		this.overlay.add(group);
		this.ghostKey = key;
		this.tintGhostMaterials();
	}

	private tintGhostMaterials(): void {
		try {
			(this.ghostMaterials.primary as THREE.MeshStandardMaterial).color.set(
				this.buildingSettings.furniturePrimaryColor
			);
			(this.ghostMaterials.secondary as THREE.MeshStandardMaterial).color.set(
				this.buildingSettings.furnitureSecondaryColor
			);
			(this.ghostMaterials.accent as THREE.MeshStandardMaterial).color.set(
				this.buildingSettings.furnitureSecondaryColor
			);
		} catch {
			// Invalid live colour — keep the last valid tint.
		}
	}

	private clearGhost(): void {
		if (this.ghostOutline) {
			this.ghostOutline.geometry.dispose();
			this.ghostOutline.removeFromParent();
			this.ghostOutline = null;
		}
		if (this.ghost) {
			disposeFurnitureGroup(this.ghost, false);
			this.ghost = null;
		}
		this.ghostKey = '';
	}

	private pickPlacement(): PlacementPreview | null {
		const kind = this.buildingSettings.furnitureKind;
		this.raycaster.setFromCamera(this.screenCenter, this.camera);
		this.raycaster.far = FURNITURE_PLACE_MAX_DISTANCE;
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

		const userData = hit.object.userData as { foundationId?: string };
		const hitFoundationId =
			userData.foundationId ??
			this.foundationManager.getFoundationContaining(hit.point.x, hit.point.z)?.id ??
			null;

		if (kind === 'torch') {
			const origin = furnitureOrigin({ x: hit.point.x, y: hit.point.y, z: hit.point.z }, facing);
			if (
				origin.x ** 2 + origin.y ** 2 + origin.z ** 2 > 0 &&
				this.raycaster.ray.origin.distanceTo(hit.point) > TORCH_PLACE_MAX_DISTANCE
			) {
				return null;
			}
			return {
				x: origin.x,
				y: origin.y,
				z: origin.z,
				nx: facing.x,
				ny: facing.y,
				nz: facing.z,
				foundationId: hitFoundationId,
				valid: true,
				reason: null
			};
		}

		return this.surfacePreview(hit.point, facing, hitFoundationId);
	}

	private surfacePreview(
		hit: THREE.Vector3,
		facing: { x: number; y: number; z: number },
		foundationId: string | null
	): PlacementPreview | null {
		if (facing.y < 0.65) {
			return {
				x: hit.x,
				y: hit.y,
				z: hit.z,
				nx: 0,
				ny: 1,
				nz: 0,
				foundationId,
				valid: false,
				reason: 'Needs a floor'
			};
		}
		const settings = this.buildingSettings;
		const grid = settings.buildingGridSize;
		const x = snapWorldToGrid(hit.x, grid);
		const z = snapWorldToGrid(hit.z, grid);
		const y = this.worldSurfaceSampler.getSupportingSurfaceY(x, z, hit.y + 0.2);
		const input = resolveFurnitureBuildInput({
			kind: settings.furnitureKind,
			dimensions: {
				width: settings.furnitureWidth,
				depth: settings.furnitureDepth,
				height: settings.furnitureHeight
			},
			parameters: {
				backrest: settings.furnitureBackrest,
				headboard: settings.furnitureHeadboard,
				shelfCount: settings.furnitureShelfCount
			}
		});
		const corners = furnitureFootprintCorners(
			x,
			z,
			input.width,
			input.depth,
			settings.furnitureRotationY
		);
		const cornerYs = corners.map((corner) =>
			this.worldSurfaceSampler.getSupportingSurfaceY(corner.x, corner.z, hit.y + 0.2)
		);
		let valid = true;
		let reason: string | null = null;
		if (!supportSpreadOk(cornerYs, FURNITURE_SUPPORT_SLOPE)) {
			valid = false;
			reason = 'Uneven ground';
		}
		const aabb = furnitureWorldAabb(
			x,
			y,
			z,
			input.width,
			input.depth,
			input.height,
			settings.furnitureRotationY
		);
		if (valid) {
			for (const rect of this.getWallRects()) {
				if (aabbOverlapsWallRect(aabb, rect, FURNITURE_WALL_CLEARANCE)) {
					valid = false;
					reason = 'Blocked by a wall';
					break;
				}
			}
		}
		if (valid) {
			for (const item of this.furnitureManager.getAll()) {
				if (item.kind === 'torch' || item.kind === 'lantern') continue;
				const other = resolveFurnitureBuildInput({
					kind: item.kind,
					dimensions: item.dimensions,
					parameters: item.parameters
				});
				const otherAabb = furnitureWorldAabb(
					item.x,
					item.y,
					item.z,
					other.width,
					other.depth,
					other.height,
					item.rotationY ?? 0
				);
				if (aabbOverlap(aabb, otherAabb, FURNITURE_OBJECT_GAP)) {
					valid = false;
					reason = 'Overlaps furniture';
					break;
				}
			}
		}
		const resolvedFoundation =
			foundationId ?? this.foundationManager.getFoundationContaining(x, z)?.id ?? null;
		return {
			x,
			y,
			z,
			nx: 0,
			ny: 1,
			nz: 0,
			foundationId: resolvedFoundation,
			valid,
			reason
		};
	}

	private refreshGhost(): void {
		if (!this.preview || !this.ghost) {
			this.overlay.visible = false;
			return;
		}
		const item = this.ghostDefinition();
		item.x = this.preview.x;
		item.y = this.preview.y;
		item.z = this.preview.z;
		item.nx = this.preview.nx;
		item.ny = this.preview.ny;
		item.nz = this.preview.nz;
		composeFurnitureMatrix(item, this.matrix);
		this.ghost.matrix.copy(this.matrix);
		this.ghost.matrixAutoUpdate = false;
		this.ghost.updateMatrixWorld(true);

		const input = resolveFurnitureBuildInput({
			kind: item.kind,
			dimensions: item.dimensions,
			parameters: item.parameters
		});
		const showFoot = item.kind !== 'torch' && item.kind !== 'lantern';
		this.footprint.visible = showFoot;
		if (showFoot) {
			this.footprint.position.set(this.preview.x, this.preview.y + 0.01, this.preview.z);
			this.footprint.rotation.set(-Math.PI / 2, 0, this.buildingSettings.furnitureRotationY);
			this.footprint.scale.set(input.width, input.depth, 1);
			this.footprint.updateMatrixWorld(true);
			(this.footprint.material as THREE.MeshBasicMaterial).color.setHex(
				this.preview.valid ? VALID_COLOR : INVALID_COLOR
			);
		}
		this.outlineMaterial.color.setHex(this.preview.valid ? VALID_COLOR : INVALID_COLOR);
		this.overlay.visible = true;
	}

	private emitHud(): void {
		const entry = getFurnitureCatalogueEntry(this.buildingSettings.furnitureKind);
		const rotation = furnitureRotationDegrees(this.buildingSettings.furnitureRotationY);
		const input = resolveFurnitureBuildInput({
			kind: this.buildingSettings.furnitureKind,
			dimensions: {
				width: this.buildingSettings.furnitureWidth,
				depth: this.buildingSettings.furnitureDepth,
				height: this.buildingSettings.furnitureHeight
			}
		});
		const placeLine = this.preview
			? this.preview.valid
				? 'Click: Place'
				: (this.preview.reason ?? 'Cannot place here')
			: 'Aim at a floor, foundation, or the ground';
		this.onHudChange?.({
			toolId: 'torch',
			crosshair: this.preview?.valid ? 'valid' : 'invalid',
			hintLines: [
				'PLACE OBJECT',
				entry.name,
				`${input.width.toFixed(2)}m × ${input.depth.toFixed(2)}m × ${input.height.toFixed(2)}m`,
				`Rotation: ${rotation}°`,
				'',
				'↑/↓  Switch object',
				'E    Customize',
				'R    Rotate',
				placeLine,
				'X: Remove'
			],
			notice: this.preview && !this.preview.valid ? (this.preview.reason ?? undefined) : undefined
		});
	}
}

function isTypingTarget(target: EventTarget | null): boolean {
	if (!(target instanceof HTMLElement)) return false;
	if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return true;
	return target.isContentEditable;
}
