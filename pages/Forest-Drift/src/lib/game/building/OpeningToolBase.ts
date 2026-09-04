import * as THREE from 'three';
import type { BuildingManager } from './BuildingManager';
import type { BuildingSettings, BuildUiState, ToolId } from './FoundationTypes';
import { applyWallTransform } from './WallGeometryBuilder';
import {
	computeWallLength,
	doOpeningsOverlap,
	isOpeningWithinWallBounds,
	wallLocalToWorld,
	worldToWallLocal
} from './wallGeometryMath';
import type { WallTransform } from './wallGeometryMath';
import type { WallManager } from './WallManager';
import type { WallOpeningType } from './WallTypes';
import type { BuildTool } from './BuildToolManager';

const VALID_COLOR = 0x39d353;
const INVALID_COLOR = 0xff4d4d;
const HIGHLIGHT_COLOR = 0xffd23f;

export interface OpeningVerticalExtent {
	minY: number;
	maxY: number;
}

/** What differs between Window Tool and Door Tool — everything else (raycasting, snapping, overlap/bounds validation, preview, HUD) is shared. */
export interface OpeningToolConfig {
	toolId: 'window' | 'door';
	openingType: WallOpeningType;
	label: string;
	getWidth: (settings: BuildingSettings) => number;
	getVerticalExtent: (settings: BuildingSettings) => OpeningVerticalExtent;
	dimensionsHint: (settings: BuildingSettings) => string;
}

interface Target {
	wallId: string;
	centerU: number;
	minU: number;
	maxU: number;
	minY: number;
	maxY: number;
	valid: boolean;
	reason?: string;
}

/**
 * Shared implementation behind WindowTool/DoorTool: raycast against wall meshes only (never
 * terrain/foundation), convert the hit into that wall's local (U, Y) coordinates, snap
 * horizontally to `openingGridSize`, validate against the SAME bounds/overlap rules
 * BuildingManager.addOpening enforces authoritatively, and preview/confirm. Stays in a single
 * "idle" state re-evaluated every frame, per the spec — there's no two-click sequence for openings.
 */
export class OpeningToolBase implements BuildTool {
	readonly toolId: ToolId;

	private readonly scene: THREE.Scene;
	private readonly camera: THREE.PerspectiveCamera;
	private readonly wallManager: WallManager;
	private readonly buildingManager: BuildingManager;
	private readonly buildingSettings: BuildingSettings;
	private readonly config: OpeningToolConfig;
	private readonly onHudChange?: (hud: BuildUiState | null) => void;

	private readonly raycaster = new THREE.Raycaster();
	private readonly screenCenter = new THREE.Vector2(0, 0);

	private readonly overlayGroup = new THREE.Group();
	private readonly previewMaterial = new THREE.MeshBasicMaterial({
		color: VALID_COLOR,
		transparent: true,
		opacity: 0.55,
		depthWrite: false,
		side: THREE.DoubleSide
	});
	private previewGeometry: THREE.BoxGeometry | null = null;
	private readonly previewMesh: THREE.Mesh;

	private readonly highlightMaterial = new THREE.LineBasicMaterial({ color: HIGHLIGHT_COLOR });
	private highlightGeometry: THREE.EdgesGeometry | null = null;
	private readonly highlightMesh: THREE.LineSegments;

	private active = false;
	private hoveredWallId: string | null = null;
	private target: Target | null = null;

	constructor(
		config: OpeningToolConfig,
		options: {
			scene: THREE.Scene;
			camera: THREE.PerspectiveCamera;
			wallManager: WallManager;
			buildingManager: BuildingManager;
			buildingSettings: BuildingSettings;
			onHudChange?: (hud: BuildUiState | null) => void;
		}
	) {
		this.toolId = config.toolId;
		this.config = config;
		this.scene = options.scene;
		this.camera = options.camera;
		this.wallManager = options.wallManager;
		this.buildingManager = options.buildingManager;
		this.buildingSettings = options.buildingSettings;
		this.onHudChange = options.onHudChange;

		this.previewMesh = new THREE.Mesh(
			new THREE.BoxGeometry(0.01, 0.01, 0.01),
			this.previewMaterial
		);
		this.previewMesh.visible = false;

		this.highlightMesh = new THREE.LineSegments(new THREE.BufferGeometry(), this.highlightMaterial);
		this.highlightMesh.visible = false;

		this.overlayGroup.add(this.previewMesh, this.highlightMesh);
	}

	activate(): void {
		this.active = true;
		this.hoveredWallId = null;
		this.target = null;
		this.scene.add(this.overlayGroup);
	}

	deactivate(): void {
		this.active = false;
		this.hoveredWallId = null;
		this.target = null;
		this.previewMesh.visible = false;
		this.highlightMesh.visible = false;
		this.scene.remove(this.overlayGroup);
		this.onHudChange?.(null);
	}

	update(): void {
		if (!this.active) return;

		this.raycaster.setFromCamera(this.screenCenter, this.camera);
		const meshes = this.wallManager.getWallMeshesForRaycast();
		const hits = meshes.length > 0 ? this.raycaster.intersectObjects(meshes, false) : [];
		const hit = hits.length > 0 ? hits[0] : null;

		if (!hit) {
			this.setHoveredWall(null);
			this.target = null;
			this.previewMesh.visible = false;
			this.onHudChange?.(this.buildIdleHud());
			return;
		}

		const wallId = hit.object.userData.wallId as string | undefined;
		if (!wallId) {
			this.setHoveredWall(null);
			this.target = null;
			this.previewMesh.visible = false;
			this.onHudChange?.(this.buildIdleHud());
			return;
		}

		this.setHoveredWall(wallId, hit.object as THREE.Mesh);

		const wall = this.buildingManager.getWall(wallId);
		const transform = this.wallManager.getWallTransform(wallId);
		if (!wall || !transform) {
			this.target = null;
			this.previewMesh.visible = false;
			return;
		}

		const hitLocal = worldToWallLocal(transform, hit.point.x, hit.point.y, hit.point.z);
		const gridSize = this.buildingSettings.openingGridSize;
		const centerU = Math.round(hitLocal.u / gridSize) * gridSize;
		const width = this.config.getWidth(this.buildingSettings);
		const minU = centerU - width / 2;
		const maxU = centerU + width / 2;
		const { minY, maxY } = this.config.getVerticalExtent(this.buildingSettings);

		const wallLength = computeWallLength(
			{
				startGridX: wall.startGridX,
				startGridZ: wall.startGridZ,
				endGridX: wall.endGridX,
				endGridZ: wall.endGridZ
			},
			this.buildingSettings.buildingGridSize
		);

		const candidate = { minU, maxU, minY, maxY };
		let valid = isOpeningWithinWallBounds(
			candidate,
			wallLength,
			wall.height,
			this.buildingSettings.openingEdgeMargin
		);
		let reason = valid ? undefined : 'Opening does not fit';

		if (valid) {
			const overlap = wall.openings.find((existing) =>
				doOpeningsOverlap(candidate, existing, this.buildingSettings.openingSpacing)
			);
			if (overlap) {
				valid = false;
				reason = `Opening overlaps existing ${overlap.type}`;
			}
		}

		this.target = { wallId, centerU, minU, maxU, minY, maxY, valid, reason };
		this.updatePreview(transform);
		this.onHudChange?.(valid ? this.buildValidHud(wallLength) : this.buildInvalidHud(reason ?? ''));
	}

	onPrimaryAction(): void {
		if (!this.active || !this.target || !this.target.valid) return;

		const result = this.buildingManager.addOpening({
			wallId: this.target.wallId,
			type: this.config.openingType,
			minU: this.target.minU,
			maxU: this.target.maxU,
			minY: this.target.minY,
			maxY: this.target.maxY,
			edgeMargin: this.buildingSettings.openingEdgeMargin,
			spacing: this.buildingSettings.openingSpacing
		});

		if (!result.valid) return;
		this.previewMesh.visible = false;
		this.target = null;
	}

	onSecondaryAction(): void {
		// No pending selection to cancel — openings are placed in a single click.
	}

	private setHoveredWall(wallId: string | null, mesh?: THREE.Mesh): void {
		if (wallId === this.hoveredWallId && wallId !== null) {
			if (mesh) {
				mesh.getWorldPosition(this.highlightMesh.position);
				mesh.getWorldQuaternion(this.highlightMesh.quaternion);
			}
			return;
		}
		this.hoveredWallId = wallId;
		this.highlightGeometry?.dispose();
		this.highlightGeometry = null;

		if (!wallId || !mesh) {
			this.highlightMesh.visible = false;
			return;
		}

		this.highlightGeometry = new THREE.EdgesGeometry(mesh.geometry);
		this.highlightMesh.geometry = this.highlightGeometry;
		mesh.getWorldPosition(this.highlightMesh.position);
		mesh.getWorldQuaternion(this.highlightMesh.quaternion);
		this.highlightMesh.visible = true;
	}

	private updatePreview(transform: WallTransform): void {
		if (!this.target) return;
		const width = this.target.maxU - this.target.minU;
		const height = this.target.maxY - this.target.minY;
		const centerY = (this.target.minY + this.target.maxY) / 2;

		this.previewGeometry?.dispose();
		this.previewGeometry = new THREE.BoxGeometry(width, height, 0.19);
		this.previewMesh.geometry = this.previewGeometry;

		const center = wallLocalToWorld(transform, this.target.centerU, centerY, 0);
		applyWallTransform(
			this.previewMesh,
			center.worldX,
			center.worldY,
			center.worldZ,
			transform.headingRadians
		);

		this.previewMaterial.color.setHex(this.target.valid ? VALID_COLOR : INVALID_COLOR);
		this.previewMesh.visible = true;
	}

	private buildIdleHud(): BuildUiState {
		return {
			toolId: this.toolId,
			crosshair: 'default',
			hintLines: [
				this.config.label,
				'',
				this.config.dimensionsHint(this.buildingSettings),
				'',
				'Look at a wall'
			]
		};
	}

	private buildValidHud(wallLength: number): BuildUiState {
		return {
			toolId: this.toolId,
			crosshair: 'valid',
			hintLines: [
				this.config.label,
				'',
				`Wall: ${wallLength.toFixed(2)}m`,
				this.config.dimensionsHint(this.buildingSettings),
				'',
				'Click wall to place'
			]
		};
	}

	private buildInvalidHud(reason: string): BuildUiState {
		return {
			toolId: this.toolId,
			crosshair: 'invalid',
			hintLines: [this.config.label, '', reason]
		};
	}

	dispose(): void {
		this.deactivate();
		this.previewGeometry?.dispose();
		this.previewMaterial.dispose();
		this.highlightGeometry?.dispose();
		this.highlightMaterial.dispose();
	}
}
