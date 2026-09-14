import * as THREE from 'three';
import type { BuildingManager } from './BuildingManager';
import type { BuildUiState, BuildingSettings, ToolId } from './FoundationTypes';
import type { BuildUndoManager } from './BuildUndoManager';
import type { FoundationManager } from './FoundationManager';
import {
	composeFurnitureMatrix,
	createFurnitureGroup,
	disposeFurnitureGroup,
	type FurnitureVisualMaterials
} from './FurnitureGeometry';
import type { FurnitureManager } from './FurnitureManager';
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
import type { FurnitureDefinition } from './FurnitureTypes';
import { furnitureColorMaterial } from './FurnitureTypes';
import type { BuildTool } from './BuildToolManager';
import type { WorldSurfaceSampler } from './WorldSurfaceSampler';
import type { WallCollisionRect } from './wallCollision';
import { colorMaterialFromHex } from './MaterialTypes';
import { nextQuarterTurn } from '../miniBuild/miniBuildGrid';
import { MiniBuildGhost } from '../miniBuild/MiniBuildGhost';
import {
	solveMiniBuildPlacement,
	type MiniBuildPlacementContext,
	type MiniBuildPlacementPreview
} from '../miniBuild/MiniBuildPlacement';
import { formatAreaDetail, type MiniBuildSystem } from '../miniBuild/MiniBuildSystem';
import type { QuarterTurn } from '../miniBuild/MiniBuildTypes';

const VALID_COLOR = 0x39d353;
const INVALID_COLOR = 0xf85149;
const HOVER_FILL_COLOR = 0x39d353;
const HOVER_EDGE_COLOR = 0x56d364;

export interface MoveToolOptions {
	scene: THREE.Scene;
	camera: THREE.PerspectiveCamera;
	buildingManager: BuildingManager;
	foundationManager: FoundationManager;
	furnitureManager: FurnitureManager;
	undoManager?: BuildUndoManager;
	buildingSettings: BuildingSettings;
	worldSurfaceSampler: WorldSurfaceSampler;
	getTerrainMeshes: () => readonly THREE.Object3D[];
	getWallRects: () => readonly WallCollisionRect[];
	onHudChange?: (hud: BuildUiState | null) => void;
	openPlacementCustomize?: () => void;
	/** Mini Build placement context — when present, placed Mini Builds can be picked up and moved. */
	miniBuildPlacement?: MiniBuildPlacementContext;
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
 * Move Mode tool (`M` key) — global editing overlay to pick up existing objects (furniture items),
 * drag them around across surfaces, rotate them with `R`, edit them with `E`, and drop/place them
 * with left-click or drag-and-release.
 */
export class MoveTool implements BuildTool {
	readonly toolId: ToolId = 'move';

	private readonly scene: THREE.Scene;
	private readonly camera: THREE.PerspectiveCamera;
	private readonly buildingManager: BuildingManager;
	private readonly foundationManager: FoundationManager;
	private readonly furnitureManager: FurnitureManager;
	private readonly undoManager?: BuildUndoManager;
	private readonly buildingSettings: BuildingSettings;
	private readonly worldSurfaceSampler: WorldSurfaceSampler;
	private readonly getTerrainMeshes: () => readonly THREE.Object3D[];
	private readonly getWallRects: () => readonly WallCollisionRect[];
	private readonly onHudChange?: (hud: BuildUiState | null) => void;
	private readonly openPlacementCustomize?: () => void;
	private readonly miniBuildPlacement?: MiniBuildPlacementContext;
	private readonly miniBuilds?: MiniBuildSystem;
	private readonly miniBuildGhost?: MiniBuildGhost;
	private hoveredMiniBuildId: string | null = null;
	/** A placed Mini Build being moved: hidden in place (budget and index untouched) until dropped. */
	private heldMiniBuild: { id: string; rotationY: QuarterTurn } | null = null;
	private miniBuildPreview: MiniBuildPlacementPreview | null = null;

	private readonly raycaster = new THREE.Raycaster();
	private readonly screenCenter = new THREE.Vector2(0, 0);
	private readonly worldNormal = new THREE.Vector3();
	private readonly matrix = new THREE.Matrix4();
	private readonly furnitureAabb = new THREE.Box3();
	private readonly highlightCenter = new THREE.Vector3();
	private readonly highlightSize = new THREE.Vector3();

	// Hover highlight around targeted existing object
	private readonly hoverHighlight: THREE.Mesh;
	private readonly hoverWireframe: THREE.LineSegments;
	private hoveredId: string | null = null;

	// Dragging overlay & ghost
	private readonly overlay = new THREE.Group();
	private readonly footprint: THREE.Mesh;
	private readonly outlineMaterial = new THREE.LineBasicMaterial({ color: VALID_COLOR });
	private ghost: THREE.Group | null = null;
	private ghostOutline: THREE.LineSegments | null = null;
	private ghostKey = '';

	private readonly ghostMaterials: FurnitureVisualMaterials;

	private active = false;
	private heldItem: FurnitureDefinition | null = null;
	private originalItem: FurnitureDefinition | null = null;
	private preview: PlacementPreview | null = null;

	// Mouse drag tracking
	private pointerIsDown = false;
	private mouseDownTime = 0;

	private readonly handleKeyDown = (event: KeyboardEvent) => {
		if (!this.active || event.repeat) return;
		if (event.metaKey || event.ctrlKey || event.altKey) return;
		if (isTypingTarget(event.target)) return;
		if (event.code === 'KeyR') {
			this.rotate();
		}
	};

	private readonly handleMouseUp = (event: MouseEvent) => {
		if (!this.active || event.button !== 0 || !this.pointerIsDown) return;
		this.pointerIsDown = false;
		const elapsed = performance.now() - this.mouseDownTime;
		// If the user held the button down for more than 250ms and dragged, drop the object on release
		if (this.heldItem && elapsed > 250 && this.preview?.valid) {
			this.placeHeldObject();
		} else if (this.heldMiniBuild && elapsed > 250 && this.miniBuildPreview?.valid) {
			this.placeHeldMiniBuild();
		}
	};

	constructor(options: MoveToolOptions) {
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
		this.openPlacementCustomize = options.openPlacementCustomize;
		this.miniBuildPlacement = options.miniBuildPlacement;
		this.miniBuilds = options.miniBuildPlacement?.system;
		if (this.miniBuilds) this.miniBuildGhost = new MiniBuildGhost(this.miniBuilds.cache);

		// Hover highlight setup
		const boxGeo = new THREE.BoxGeometry(1, 1, 1);
		this.hoverHighlight = new THREE.Mesh(
			boxGeo,
			new THREE.MeshBasicMaterial({
				color: HOVER_FILL_COLOR,
				transparent: true,
				opacity: 0.2,
				depthWrite: false,
				side: THREE.DoubleSide
			})
		);
		this.hoverHighlight.visible = false;
		this.hoverHighlight.renderOrder = 22;

		const edgesGeo = new THREE.EdgesGeometry(boxGeo);
		this.hoverWireframe = new THREE.LineSegments(
			edgesGeo,
			new THREE.LineBasicMaterial({
				color: HOVER_EDGE_COLOR,
				transparent: true,
				opacity: 0.9
			})
		);
		this.hoverWireframe.renderOrder = 23;
		this.hoverHighlight.add(this.hoverWireframe);

		// Ghost materials
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

		// Footprint plane
		this.footprint = new THREE.Mesh(
			new THREE.PlaneGeometry(1, 1),
			new THREE.MeshBasicMaterial({
				color: VALID_COLOR,
				transparent: true,
				opacity: 0.18,
				depthWrite: false,
				side: THREE.DoubleSide
			})
		);
		this.footprint.rotation.x = -Math.PI / 2;
		this.footprint.renderOrder = 11;
		this.overlay.add(this.footprint);
		this.overlay.visible = false;
	}

	activate(): void {
		this.active = true;
		this.hoveredId = null;
		this.heldItem = null;
		this.originalItem = null;
		this.preview = null;
		this.pointerIsDown = false;

		this.scene.add(this.hoverHighlight);
		this.scene.add(this.overlay);
		if (this.miniBuildGhost) this.scene.add(this.miniBuildGhost.group);
		this.hoveredMiniBuildId = null;
		if (typeof window !== 'undefined') {
			window.addEventListener('keydown', this.handleKeyDown);
			window.addEventListener('mouseup', this.handleMouseUp);
		}
		this.emitHud();
	}

	deactivate(): void {
		this.cancelMove();
		this.cancelMiniBuildMove();
		this.hoveredMiniBuildId = null;
		this.miniBuildGhost?.setVisible(false);
		this.miniBuildGhost?.group.removeFromParent();
		this.active = false;
		this.pointerIsDown = false;
		this.hoveredId = null;
		this.hoverHighlight.visible = false;
		this.hoverHighlight.removeFromParent();
		this.overlay.visible = false;
		this.overlay.removeFromParent();
		this.clearGhost();

		if (typeof window !== 'undefined') {
			window.removeEventListener('keydown', this.handleKeyDown);
			window.removeEventListener('mouseup', this.handleMouseUp);
		}
		this.onHudChange?.(null);
	}

	isHoldingObject(): boolean {
		return this.heldItem !== null || this.heldMiniBuild !== null;
	}

	getHeldMiniBuildId(): string | null {
		return this.heldMiniBuild?.id ?? null;
	}

	getHeldItem(): FurnitureDefinition | null {
		return this.heldItem;
	}

	canOpenCustomize(): boolean {
		// Mini Builds are edited in the Mini Build Editor (F in Place Object mode), not the furniture modal.
		if (this.heldMiniBuild || (this.hoveredMiniBuildId && !this.hoveredId)) return false;
		return this.active && (this.heldItem !== null || this.hoveredId !== null);
	}

	prepareForCustomize(): void {
		if (!this.heldItem && this.hoveredId) {
			this.pickUp(this.hoveredId);
		} else if (this.heldItem) {
			this.syncItemToSettings(this.heldItem);
		}
	}

	update(): void {
		if (!this.active) return;

		if (this.heldMiniBuild) {
			this.hoverHighlight.visible = false;
			this.overlay.visible = false;
			this.updateHeldMiniBuild();
			this.emitMiniBuildHud();
			return;
		}

		if (this.heldItem) {
			// In holding state: hide hover highlight, update placement preview & ghost
			this.hoverHighlight.visible = false;
			this.syncGhostGeometry();
			this.preview = this.pickPlacement();
			this.refreshGhost();
		} else {
			// In hovering state: raycast for existing furniture
			this.overlay.visible = false;
			this.updateHover();
		}

		this.emitHud();
	}

	onPrimaryAction(): void {
		if (!this.active) return;

		if (this.heldMiniBuild) {
			if (this.miniBuildPreview?.valid) this.placeHeldMiniBuild();
			return;
		}
		if (!this.heldItem && this.hoveredMiniBuildId) {
			this.pickUpMiniBuild(this.hoveredMiniBuildId);
			this.pointerIsDown = true;
			this.mouseDownTime = performance.now();
			return;
		}

		if (!this.heldItem) {
			// Try picking up hovered object
			if (this.hoveredId) {
				this.pickUp(this.hoveredId);
				this.pointerIsDown = true;
				this.mouseDownTime = performance.now();
			}
		} else {
			// Already holding: try placing it
			if (this.preview?.valid) {
				this.placeHeldObject();
			}
		}
	}

	onSecondaryAction(): void {
		if (this.heldItem) {
			this.cancelMove();
		}
		this.cancelMiniBuildMove();
	}

	pickUpMiniBuild(id: string): boolean {
		const instance = this.miniBuilds?.instances.get(id);
		if (!instance || !this.miniBuilds) return false;
		this.heldMiniBuild = { id, rotationY: instance.rotationY };
		this.miniBuilds.instances.setHidden(id, true);
		this.hoveredMiniBuildId = null;
		this.hoverHighlight.visible = false;
		return true;
	}

	placeHeldMiniBuild(): boolean {
		const held = this.heldMiniBuild;
		const preview = this.miniBuildPreview;
		if (!held || !preview?.valid || !this.miniBuilds) return false;
		const moved = this.miniBuilds.moveInstance(held.id, preview.position, preview.rotationY);
		if (!moved.ok) return false;
		this.miniBuilds.instances.setHidden(held.id, false);
		this.heldMiniBuild = null;
		this.miniBuildPreview = null;
		this.miniBuildGhost?.setVisible(false);
		return true;
	}

	cancelMiniBuildMove(): void {
		if (!this.heldMiniBuild) return;
		this.miniBuilds?.instances.setHidden(this.heldMiniBuild.id, false);
		this.heldMiniBuild = null;
		this.miniBuildPreview = null;
		this.miniBuildGhost?.setVisible(false);
	}

	/** Target-chunk usage for a held Mini Build (moving within its own chunk adds nothing). */
	getHeldMiniBuildReadout() {
		const held = this.heldMiniBuild;
		const preview = this.miniBuildPreview;
		const instance = held ? this.miniBuilds?.instances.get(held.id) : undefined;
		const definition = instance ? this.miniBuilds?.getDesign(instance.designId) : undefined;
		if (!held || !preview || !definition || !this.miniBuilds) return null;
		return this.miniBuilds.getChunkReadout(
			preview.position.x,
			preview.position.z,
			definition.blocks.length,
			held.id
		);
	}

	private updateHeldMiniBuild(): void {
		const held = this.heldMiniBuild;
		const instance = held ? this.miniBuilds?.instances.get(held.id) : undefined;
		const definition = instance ? this.miniBuilds?.getDesign(instance.designId) : undefined;
		if (!held || !definition || !this.miniBuildPlacement || !this.miniBuildGhost) {
			this.cancelMiniBuildMove();
			return;
		}
		this.miniBuildGhost.setDefinition(definition);
		this.miniBuildPreview = solveMiniBuildPlacement(
			this.miniBuildPlacement,
			definition,
			held.rotationY,
			held.id
		);
		if (!this.miniBuildPreview) {
			this.miniBuildGhost.setVisible(false);
			return;
		}
		this.miniBuildGhost.setTransform(
			this.miniBuildPreview.position,
			this.miniBuildPreview.rotationY
		);
		this.miniBuildGhost.setValid(this.miniBuildPreview.valid);
		this.miniBuildGhost.setVisible(true);
	}

	private emitMiniBuildHud(): void {
		const id = this.heldMiniBuild?.id ?? this.hoveredMiniBuildId;
		const instance = id ? this.miniBuilds?.instances.get(id) : undefined;
		const name = instance
			? (this.miniBuilds?.getDesign(instance.designId)?.name ?? 'Object')
			: 'Object';
		if (this.heldMiniBuild) {
			const preview = this.miniBuildPreview;
			const readout = this.getHeldMiniBuildReadout();
			this.onHudChange?.({
				toolId: 'move',
				crosshair: preview?.valid ? 'valid' : 'invalid',
				hintLines: [
					'MOVE OBJECT',
					name,
					`Rotation: ${this.heldMiniBuild.rotationY}°`,
					'',
					preview
						? preview.valid
							? 'Click: Place object'
							: (preview.reason ?? 'Cannot place here').split('\n')[0]
						: 'Aim at a floor or the ground',
					'R    Rotate',
					'Right-Click / Esc: Cancel move',
					...(readout ? ['', formatAreaDetail(readout)] : [])
				],
				notice: preview
					? ((preview.valid ? preview.notice : preview.reason) ?? undefined)
					: undefined
			});
			return;
		}
		this.onHudChange?.({
			toolId: 'move',
			crosshair: 'valid',
			hintLines: [
				'MOVE OBJECT',
				name,
				`Rotation: ${instance?.rotationY ?? 0}°`,
				'',
				'Click: Pick up / drag',
				'R    Rotate in-place',
				'M: Exit Move Mode'
			]
		});
	}

	rotate(): void {
		if (this.heldMiniBuild) {
			this.heldMiniBuild.rotationY = nextQuarterTurn(this.heldMiniBuild.rotationY);
			return;
		}
		if (!this.heldItem && this.hoveredMiniBuildId && this.miniBuilds) {
			const instance = this.miniBuilds.instances.get(this.hoveredMiniBuildId);
			if (instance)
				this.miniBuilds.moveInstance(
					instance.id,
					instance.position,
					nextQuarterTurn(instance.rotationY)
				);
			return;
		}
		if (this.heldItem) {
			this.buildingSettings.furnitureRotationY = cycleFurnitureRotation(
				this.buildingSettings.furnitureRotationY
			);
			this.heldItem.rotationY = this.buildingSettings.furnitureRotationY;
			this.syncGhostGeometry(true);
			this.preview = this.pickPlacement();
			this.refreshGhost();
			this.emitHud();
		} else if (this.hoveredId) {
			const item = this.furnitureManager.get(this.hoveredId);
			if (item && item.kind !== 'torch') {
				const nextRot = cycleFurnitureRotation(item.rotationY ?? 0);
				item.rotationY = nextRot;
				this.furnitureManager.add(item);
				this.emitHud();
			}
		}
	}

	pickUp(id: string): boolean {
		const item = this.furnitureManager.get(id);
		if (!item) return false;

		this.originalItem = structuredClone(item);
		this.heldItem = structuredClone(item);
		this.furnitureManager.remove(id);

		this.hoveredId = null;
		this.hoverHighlight.visible = false;

		this.syncItemToSettings(this.heldItem);
		this.syncGhostGeometry(true);
		this.preview = this.pickPlacement();
		this.refreshGhost();
		this.emitHud();
		return true;
	}

	pickUpHovered(): boolean {
		if (this.hoveredId) {
			return this.pickUp(this.hoveredId);
		}
		return false;
	}

	placeHeldObject(): boolean {
		if (!this.heldItem || !this.preview?.valid) return false;

		const s = this.buildingSettings;
		const input = resolveFurnitureBuildInput({
			kind: s.furnitureKind,
			dimensions: {
				width: s.furnitureWidth,
				depth: s.furnitureDepth,
				height: s.furnitureHeight
			},
			parameters: {
				backrest: s.furnitureBackrest,
				headboard: s.furnitureHeadboard,
				shelfCount: s.furnitureShelfCount
			}
		});

		const placedItem: FurnitureDefinition = {
			id: this.heldItem.id ?? crypto.randomUUID(),
			kind: s.furnitureKind,
			foundationId: this.preview.foundationId,
			x: this.preview.x,
			y: this.preview.y,
			z: this.preview.z,
			nx: this.preview.nx,
			ny: this.preview.ny,
			nz: this.preview.nz,
			rotationY: s.furnitureKind === 'torch' ? 0 : s.furnitureRotationY,
			dimensions: { width: input.width, depth: input.depth, height: input.height },
			material: colorMaterialFromHex(s.furniturePrimaryColor),
			secondaryMaterial: colorMaterialFromHex(s.furnitureSecondaryColor),
			parameters: {
				...this.heldItem.parameters,
				backrest: input.backrest,
				headboard: input.headboard,
				shelfCount: input.shelfCount
			}
		};

		this.furnitureManager.add(placedItem);
		this.undoManager?.record({ kind: 'furniture', furnitureId: placedItem.id });

		this.heldItem = null;
		this.originalItem = null;
		this.preview = null;
		this.overlay.visible = false;
		this.clearGhost();
		this.emitHud();
		return true;
	}

	cancelMove(): void {
		if (this.heldItem && this.originalItem) {
			this.furnitureManager.add(this.originalItem);
			this.heldItem = null;
			this.originalItem = null;
			this.preview = null;
			this.overlay.visible = false;
			this.clearGhost();
			this.emitHud();
		}
	}

	onCustomizeClosed(): void {
		if (this.heldItem) {
			const s = this.buildingSettings;
			this.heldItem.kind = s.furnitureKind;
			this.heldItem.dimensions = {
				width: s.furnitureWidth,
				depth: s.furnitureDepth,
				height: s.furnitureHeight
			};
			this.heldItem.rotationY = s.furnitureRotationY;
			this.heldItem.material = colorMaterialFromHex(s.furniturePrimaryColor);
			this.heldItem.secondaryMaterial = colorMaterialFromHex(s.furnitureSecondaryColor);
			this.heldItem.parameters = {
				...this.heldItem.parameters,
				backrest: s.furnitureBackrest,
				headboard: s.furnitureHeadboard,
				shelfCount: s.furnitureShelfCount
			};
			this.syncGhostGeometry(true);
			this.preview = this.pickPlacement();
			this.refreshGhost();
			this.emitHud();
		}
	}

	private syncItemToSettings(item: FurnitureDefinition): void {
		const input = resolveFurnitureBuildInput({
			kind: item.kind,
			dimensions: item.dimensions,
			parameters: item.parameters
		});
		this.buildingSettings.furnitureKind = item.kind;
		this.buildingSettings.furnitureWidth = input.width;
		this.buildingSettings.furnitureDepth = input.depth;
		this.buildingSettings.furnitureHeight = input.height;
		this.buildingSettings.furnitureRotationY = item.rotationY ?? 0;
		if (input.backrest !== undefined) {
			this.buildingSettings.furnitureBackrest = Boolean(input.backrest);
		}
		if (input.headboard !== undefined) {
			this.buildingSettings.furnitureHeadboard = Boolean(input.headboard);
		}
		if (input.shelfCount !== undefined) {
			this.buildingSettings.furnitureShelfCount = Number(input.shelfCount);
		}
		if (item.material && 'color' in item.material && item.material.color) {
			this.buildingSettings.furniturePrimaryColor = item.material.color;
		}
		if (
			item.secondaryMaterial &&
			'color' in item.secondaryMaterial &&
			item.secondaryMaterial.color
		) {
			this.buildingSettings.furnitureSecondaryColor = item.secondaryMaterial.color;
		}
	}

	private updateHover(): void {
		const hit = this.pickFurniture();
		const miniBuildHit = this.pickMiniBuild();
		if (miniBuildHit && (!hit || miniBuildHit.distance < hit.distance)) {
			this.hoveredId = null;
			this.hoveredMiniBuildId = miniBuildHit.id;
			const box = this.miniBuilds!.instances.worldAabb(miniBuildHit.id);
			if (box) {
				this.hoverHighlight.position.set(
					(box.minX + box.maxX) / 2,
					(box.minY + box.maxY) / 2,
					(box.minZ + box.maxZ) / 2
				);
				this.hoverHighlight.scale.set(
					Math.max(0.1, box.maxX - box.minX),
					Math.max(0.1, box.maxY - box.minY),
					Math.max(0.1, box.maxZ - box.minZ)
				);
				this.hoverHighlight.updateMatrixWorld(true);
				this.hoverHighlight.visible = true;
			}
			return;
		}
		this.hoveredMiniBuildId = null;
		if (!hit) {
			this.hoveredId = null;
			this.hoverHighlight.visible = false;
			return;
		}

		this.hoveredId = hit.id;
		if (this.furnitureManager.getWorldAabb(hit.id, this.furnitureAabb)) {
			this.furnitureAabb.getCenter(this.highlightCenter);
			this.furnitureAabb.getSize(this.highlightSize);
			this.hoverHighlight.position.copy(this.highlightCenter);
			this.hoverHighlight.scale.copy(this.highlightSize);
			this.hoverHighlight.scale.x = Math.max(0.1, this.hoverHighlight.scale.x);
			this.hoverHighlight.scale.y = Math.max(0.1, this.hoverHighlight.scale.y);
			this.hoverHighlight.scale.z = Math.max(0.1, this.hoverHighlight.scale.z);
			this.hoverHighlight.updateMatrixWorld(true);
			this.hoverHighlight.visible = true;
		}
	}

	private pickMiniBuild(): { id: string; distance: number } | null {
		if (!this.miniBuilds) return null;
		this.raycaster.setFromCamera(this.screenCenter, this.camera);
		this.raycaster.far = FURNITURE_PLACE_MAX_DISTANCE;
		return this.miniBuilds.instances.raycast(this.raycaster);
	}

	private pickFurniture(): { id: string; distance: number } | undefined {
		const meshes = this.furnitureManager.getPickMeshes();
		if (meshes.length === 0) return undefined;

		this.raycaster.setFromCamera(this.screenCenter, this.camera);
		this.raycaster.far = FURNITURE_PLACE_MAX_DISTANCE;
		const hit = this.raycaster.intersectObjects(meshes, true)[0];
		if (!hit) return undefined;

		if (hit.object === this.furnitureManager.getPickMesh() && hit.instanceId !== undefined) {
			const id = this.furnitureManager.idAtInstance(hit.instanceId);
			return id ? { id, distance: hit.distance } : undefined;
		}
		const id = this.furnitureManager.idFromObject(hit.object);
		return id ? { id, distance: hit.distance } : undefined;
	}

	private ghostDefinition(): FurnitureDefinition {
		return {
			id: 'move-ghost',
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

	private syncGhostGeometry(force = false): void {
		const key = this.settingsKey();
		if (!force && key === this.ghostKey && this.ghost) return;

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
			// Keep previous tint if invalid
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
		if (this.hoveredMiniBuildId && !this.heldItem) {
			this.emitMiniBuildHud();
			return;
		}
		if (this.heldItem) {
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
					? 'Click: Place object'
					: (this.preview.reason ?? 'Cannot place here')
				: 'Aim at a floor or the ground';

			this.onHudChange?.({
				toolId: 'move',
				crosshair: this.preview?.valid ? 'valid' : 'invalid',
				hintLines: [
					'MOVE OBJECT',
					entry.name,
					`${input.width.toFixed(2)}m × ${input.depth.toFixed(2)}m × ${input.height.toFixed(2)}m`,
					`Rotation: ${rotation}°`,
					'',
					placeLine,
					'R    Rotate',
					'E    Edit object',
					'Right-Click / Esc: Cancel move'
				],
				notice: this.preview && !this.preview.valid ? (this.preview.reason ?? undefined) : undefined
			});
		} else if (this.hoveredId) {
			const item = this.furnitureManager.get(this.hoveredId);
			const entry = item ? getFurnitureCatalogueEntry(item.kind) : null;
			const name = entry?.name ?? 'Object';
			const rot = furnitureRotationDegrees(item?.rotationY ?? 0);

			this.onHudChange?.({
				toolId: 'move',
				crosshair: 'valid',
				hintLines: [
					'MOVE OBJECT',
					name,
					`Rotation: ${rot}°`,
					'',
					'Click: Pick up / drag',
					'R    Rotate in-place',
					'E    Edit object',
					'M: Exit Move Mode'
				]
			});
		} else {
			this.onHudChange?.({
				toolId: 'move',
				crosshair: 'default',
				hintLines: [
					'MOVE OBJECT',
					'Aim at an existing object',
					'',
					'Click: Pick up and drag',
					'M: Exit Move Mode'
				]
			});
		}
	}

	dispose(): void {
		this.deactivate();
		this.hoverHighlight.removeFromParent();
		this.hoverHighlight.geometry.dispose();
		(this.hoverHighlight.material as THREE.Material).dispose();
		this.hoverWireframe.geometry.dispose();
		if (Array.isArray(this.hoverWireframe.material)) {
			for (const m of this.hoverWireframe.material) m.dispose();
		} else {
			this.hoverWireframe.material.dispose();
		}

		this.footprint.geometry.dispose();
		(this.footprint.material as THREE.Material).dispose();
		this.outlineMaterial.dispose();
		this.miniBuildGhost?.dispose();
		for (const material of Object.values(this.ghostMaterials)) material.dispose();
	}
}

function isTypingTarget(target: EventTarget | null): boolean {
	if (!(target instanceof HTMLElement)) return false;
	if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return true;
	return target.isContentEditable;
}
