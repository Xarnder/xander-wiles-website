import * as THREE from 'three';
import type { BuildingLevelManager } from './BuildingLevelManager';
import type { BuildingLevelUiState } from './BuildingLevelTypes';
import { levelDisplayName } from './BuildingLevelTypes';
import type { BuildingManager } from './BuildingManager';
import type { BuildingSettings, BuildUiState, ToolId } from './FoundationTypes';
import type { OpeningWallCandidate } from './openingWallPick';
import { isWallOnLevel, pickOpeningWall } from './openingWallPick';
import { applyWallTransform } from './WallGeometryBuilder';
import {
	computeWallLength,
	doOpeningsOverlap,
	isOpeningWithinWallBounds,
	wallLocalToWorld,
	worldToWallLocal
} from './wallGeometryMath';
import type { WallTransform } from './wallGeometryMath';
import type { WallDefinition, WallOpeningType } from './WallTypes';
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
 *
 * The wall an opening applies to is always the one directly in front of the crosshair, and it is
 * only accepted if it's on the currently-selected building level — see `pickWallHit` /
 * openingWallPick.ts. What you point at is what you get; a wall on another storey is highlighted
 * and explained rather than silently cut into.
 */
export class OpeningToolBase implements BuildTool {
	readonly toolId: ToolId;

	private readonly scene: THREE.Scene;
	private readonly camera: THREE.PerspectiveCamera;
	private readonly buildingManager: BuildingManager;
	private readonly levelManager: BuildingLevelManager;
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
			buildingManager: BuildingManager;
			levelManager: BuildingLevelManager;
			buildingSettings: BuildingSettings;
			onHudChange?: (hud: BuildUiState | null) => void;
		}
	) {
		this.toolId = config.toolId;
		this.config = config;
		this.scene = options.scene;
		this.camera = options.camera;
		this.buildingManager = options.buildingManager;
		this.levelManager = options.levelManager;
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

	/**
	 * Resolves the raycaster's hits (nearest-first) into wall candidates, then defers the actual
	 * choice to `pickOpeningWall` — see that module for why the wall in front of the crosshair is
	 * used rather than the nearest one that happens to be on the selected level. Hits that aren't
	 * walls, or whose wall has since been removed, are simply skipped.
	 */
	private pickWallHit(hits: THREE.Intersection[]): {
		hit: THREE.Intersection;
		wall: WallDefinition;
		onCurrentLevel: boolean;
	} | null {
		const candidates: OpeningWallCandidate<{ hit: THREE.Intersection; wall: WallDefinition }>[] =
			[];
		for (const hit of hits) {
			const wallId = hit.object.userData.wallId as string | undefined;
			if (!wallId) continue;
			const wall = this.buildingManager.getWall(wallId);
			if (!wall) continue;
			candidates.push({
				hit: { hit, wall },
				wallId,
				foundationId: wall.foundationId,
				baseY: wall.baseY
			});
		}

		const picked = pickOpeningWall(candidates, (foundationId) =>
			this.currentLevelBaseY(foundationId)
		);
		if (!picked) return null;
		return {
			hit: picked.hit.hit,
			wall: picked.hit.wall,
			onCurrentLevel: picked.onCurrentLevel
		};
	}

	private currentLevelBaseY(foundationId: string): number {
		return this.levelManager.getOrCreateLevel(
			foundationId,
			this.levelManager.getCurrentLevelIndex(foundationId)
		).baseY;
	}

	/** "First Floor" for a wall sitting at an authored level's `baseY`, else its raw elevation — used only for the "wrong storey" HUD message. */
	private levelNameForWall(foundationId: string, baseY: number): string {
		const level = this.levelManager
			.getLevelsForFoundation(foundationId)
			.find((candidate) => isWallOnLevel(baseY, candidate.baseY));
		return level ? levelDisplayName(level.index) : `elevation ${baseY.toFixed(2)}m`;
	}

	update(): void {
		if (!this.active) return;

		this.raycaster.setFromCamera(this.screenCenter, this.camera);
		const meshes = this.buildingManager.getRaycastableWallMeshes();
		const hits = meshes.length > 0 ? this.raycaster.intersectObjects(meshes, false) : [];
		const picked = this.pickWallHit(hits);

		if (!picked) {
			this.levelManager.reportHoveredFoundation(null);
			this.setHoveredWall(null);
			this.target = null;
			this.previewMesh.visible = false;
			this.onHudChange?.(this.buildIdleHud());
			return;
		}

		const { hit, wall, onCurrentLevel } = picked;
		const wallId = wall.id;
		this.setHoveredWall(wallId, hit.object as THREE.Mesh);

		// Keeps the on-screen floor selector / Page Up/Down usable while placing openings — the level
		// index itself is per-foundation, so it has to follow whichever foundation's wall is in front
		// of the crosshair.
		this.levelManager.reportHoveredFoundation(wall.foundationId);

		if (!onCurrentLevel) {
			// The wall being pointed at belongs to another storey. Highlight it so it's obvious what
			// the crosshair found, but refuse to cut an opening into it, and say which floor it's on —
			// never quietly redirect the opening to some other wall the player isn't looking at.
			this.target = null;
			this.previewMesh.visible = false;
			this.onHudChange?.(
				this.buildInvalidHud(
					`Wall is on ${this.levelNameForWall(wall.foundationId, wall.baseY)}`,
					'Page Up / Page Down to match'
				)
			);
			return;
		}

		const transform = this.buildingManager.getWallTransform(wallId);
		if (!transform) {
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
		const { startMargin, endMargin } = this.buildingManager.getOpeningMargins(
			wallId,
			this.buildingSettings.openingEdgeMargin
		);
		let valid = isOpeningWithinWallBounds(
			candidate,
			wallLength,
			wall.height,
			startMargin,
			endMargin
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

	/**
	 * The current level's UI state for the on-screen floor selector — purely informational here
	 * (never gates this tool's own targeting, which always follows the wall being looked at
	 * regardless of level). Falls back to whichever foundation `BuildingLevelManager` already
	 * considers active when nothing is currently hovered, so the selector — and Page Up/Down —
	 * keep working while the crosshair briefly isn't on a wall, e.g. between placements.
	 */
	private currentLevelUiState(): BuildingLevelUiState | undefined {
		const foundationId = this.levelManager.getActiveFoundationId();
		return foundationId ? this.levelManager.getLevelUiState(foundationId) : undefined;
	}

	private buildIdleHud(): BuildUiState {
		return {
			toolId: this.toolId,
			level: this.currentLevelUiState(),
			crosshair: 'default',
			notice: 'Look at a wall',
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
			level: this.currentLevelUiState(),
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

	private buildInvalidHud(reason: string, hint?: string): BuildUiState {
		return {
			toolId: this.toolId,
			level: this.currentLevelUiState(),
			crosshair: 'invalid',
			notice: hint ? `${reason} · ${hint}` : reason,
			hintLines: hint ? [this.config.label, '', reason, '', hint] : [this.config.label, '', reason]
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
