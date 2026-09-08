import * as THREE from 'three';
import {
	createActiveLevelWatch,
	pullActiveLevelChange,
	type BuildingLevelManager
} from './BuildingLevelManager';
import type { BuildingLevelUiState } from './BuildingLevelTypes';
import type { BuildingManager } from './BuildingManager';
import type { BuildUndoManager } from './BuildUndoManager';
import type { BuildingGridPoint } from './FoundationLocalMath';
import { foundationLocalFrame, foundationLocalSize } from './FoundationLocalMath';
import type { FoundationManager } from './FoundationManager';
import type { BuildingSettings, BuildUiState, ToolId } from './FoundationTypes';
import { raycastLevelConstructionPlane } from './foundationTopTargeting';
import { vertexSpacingFor } from './foundationMath';
import { buildFloorDetailGeometry } from './FloorDetailGeometryBuilder';
import {
	axisAlignedRectFromPoints,
	buildFloorDetailBoxes,
	pathBendIsStraight,
	pathRibbonLocalRing,
	rectanglePointsFromCorners,
	validateFloorDetailFootprint
} from './floorDetailMath';
import {
	cycleFloorPathDrawMode,
	floorPathDrawModeBadge,
	floorPathDrawModeLabel,
	type FloorPathDrawMode
} from './floorPathDraw';
import {
	cycleFloorDetailTilePattern,
	defaultFloorDetailColors,
	type FloorDetailDefinition,
	type FloorDetailKind
} from './FloorDetailTypes';
import { snapDrawingPoint } from './polygonDrawSnap';
import type { TerrainSettings } from '../terrain/TerrainSettings';
import type { BuildTool } from './BuildToolManager';

const MAX_FULL_GRID_POINTS = 4096;
const FALLBACK_RADIUS_CELLS = 12;
const MAX_OUTLINE_VERTICES = 512;

const NEAREST_COLOR: readonly [number, number, number] = [0.55, 0.85, 0.65];
const FAR_COLOR: readonly [number, number, number] = [0.4, 0.7, 0.5];
const FIRST_POINT_COLOR = 0x7ad0a0;
const END_POINT_COLOR = 0x5ec8ff;
const HANDLE_COLOR = 0xf0c14a;
const VALID_COLOR = 0x39d353;
const INVALID_COLOR = 0xff4d4d;

const KIND_LABEL: Record<FloorDetailKind, string> = {
	carpet: 'CARPET',
	path: 'PATH',
	planks: 'PLANKS',
	tiles: 'TILES'
};

const TOOL_ID: Record<FloorDetailKind, ToolId> = {
	carpet: 'floor-carpet',
	path: 'floor-path',
	planks: 'floor-planks',
	tiles: 'floor-tiles'
};

const markerGeometry = new THREE.SphereGeometry(0.1, 10, 8);

function makeMarker(color: number): THREE.Mesh {
	const material = new THREE.MeshBasicMaterial({ color, depthTest: false });
	const mesh = new THREE.Mesh(markerGeometry, material);
	mesh.renderOrder = 10;
	mesh.visible = false;
	return mesh;
}

export interface FloorDetailToolOptions {
	scene: THREE.Scene;
	camera: THREE.PerspectiveCamera;
	foundationManager: FoundationManager;
	buildingManager: BuildingManager;
	levelManager: BuildingLevelManager;
	undoManager: BuildUndoManager;
	terrainSettings: TerrainSettings;
	buildingSettings: BuildingSettings;
	kind: FloorDetailKind;
	onHudChange?: (hud: BuildUiState | null) => void;
}

/**
 * Two-click floor detailing: a rectangle (carpet / planks / tiles) or a path on the current
 * level's construction plane. Path C cycles axis snap, free heading, and Bezier (start → end →
 * bend). Sits above the floor with no collision.
 */
export class FloorDetailTool implements BuildTool {
	readonly toolId: ToolId;
	readonly kind: FloorDetailKind;

	private readonly scene: THREE.Scene;
	private readonly camera: THREE.PerspectiveCamera;
	private readonly foundationManager: FoundationManager;
	private readonly buildingManager: BuildingManager;
	private readonly levelManager: BuildingLevelManager;
	private readonly undoManager: BuildUndoManager;
	private readonly terrainSettings: TerrainSettings;
	private readonly buildingSettings: BuildingSettings;
	private readonly onHudChange?: (hud: BuildUiState | null) => void;

	private readonly raycaster = new THREE.Raycaster();
	private readonly screenCenter = new THREE.Vector2(0, 0);

	private readonly overlayGroup = new THREE.Group();
	private readonly gridPositions = new Float32Array(MAX_FULL_GRID_POINTS * 3);
	private readonly gridColors = new Float32Array(MAX_FULL_GRID_POINTS * 3);
	private readonly gridGeometry = new THREE.BufferGeometry();
	private readonly gridPoints: THREE.Points;

	private readonly outlineGeometry = new THREE.BufferGeometry();
	private readonly outlineMaterial = new THREE.LineBasicMaterial({ color: VALID_COLOR });
	private readonly outline: THREE.LineSegments;

	private readonly firstPointMarker = makeMarker(FIRST_POINT_COLOR);
	private readonly endPointMarker = makeMarker(END_POINT_COLOR);
	private readonly handlePointMarker = makeMarker(HANDLE_COLOR);
	private readonly previewMaterial = new THREE.MeshStandardMaterial({
		vertexColors: true,
		transparent: true,
		opacity: 0.55,
		depthWrite: false,
		side: THREE.DoubleSide,
		polygonOffset: true,
		polygonOffsetFactor: -2,
		polygonOffsetUnits: -2
	});
	private previewGeometry: THREE.BufferGeometry | null = null;
	private readonly previewMesh: THREE.Mesh;

	private active = false;
	private state: 'idle' | 'first-point-selected' | 'bending' = 'idle';
	private foundationId: string | null = null;
	private firstPoint: BuildingGridPoint | null = null;
	private pathEndPoint: BuildingGridPoint | null = null;
	private pathDrawMode: FloorPathDrawMode = 'axis';
	private activeBaseY = 0;
	private activeLevelIndex = 0;

	private hoverPoint: BuildingGridPoint | null = null;
	private lastGridX: number | null = null;
	private lastGridZ: number | null = null;
	private lastFoundationId: string | null = null;
	private readonly activeLevelWatch = createActiveLevelWatch();

	private readonly handleKeyDown = (event: KeyboardEvent) => {
		if (!this.active) return;
		if (event.code === 'KeyC') {
			if (this.kind !== 'path') return;
			this.pathDrawMode = cycleFloorPathDrawMode(this.pathDrawMode);
			if (this.state === 'bending') {
				this.state = 'first-point-selected';
				this.pathEndPoint = null;
			}
			this.refreshVisuals();
			return;
		}
		if (event.code !== 'KeyR') return;
		if (this.kind === 'planks') {
			this.buildingSettings.floorDetailPlankDirection =
				this.buildingSettings.floorDetailPlankDirection === 'x' ? 'z' : 'x';
			this.refreshVisuals();
		} else if (this.kind === 'tiles') {
			this.buildingSettings.floorDetailTilePattern = cycleFloorDetailTilePattern(
				this.buildingSettings.floorDetailTilePattern
			);
			this.refreshVisuals();
		} else if (this.kind === 'path') {
			this.buildingSettings.floorDetailPathFraming =
				!this.buildingSettings.floorDetailPathFraming;
			this.refreshVisuals();
		}
	};

	constructor(options: FloorDetailToolOptions) {
		this.kind = options.kind;
		this.toolId = TOOL_ID[options.kind];
		this.scene = options.scene;
		this.camera = options.camera;
		this.foundationManager = options.foundationManager;
		this.buildingManager = options.buildingManager;
		this.levelManager = options.levelManager;
		this.undoManager = options.undoManager;
		this.terrainSettings = options.terrainSettings;
		this.buildingSettings = options.buildingSettings;
		this.onHudChange = options.onHudChange;

		this.gridGeometry.setAttribute('position', new THREE.BufferAttribute(this.gridPositions, 3));
		this.gridGeometry.setAttribute('color', new THREE.BufferAttribute(this.gridColors, 3));
		this.gridGeometry.setDrawRange(0, 0);
		const gridMaterial = new THREE.PointsMaterial({
			size: 0.06,
			vertexColors: true,
			sizeAttenuation: true,
			depthTest: false,
			transparent: true
		});
		this.gridPoints = new THREE.Points(this.gridGeometry, gridMaterial);
		this.gridPoints.renderOrder = 5;
		this.gridPoints.visible = false;

		this.outlineGeometry.setAttribute(
			'position',
			new THREE.BufferAttribute(new Float32Array(MAX_OUTLINE_VERTICES * 3), 3)
		);
		this.outlineGeometry.setDrawRange(0, 0);
		this.outline = new THREE.LineSegments(this.outlineGeometry, this.outlineMaterial);
		this.outline.renderOrder = 6;
		this.outline.visible = false;

		this.previewMesh = new THREE.Mesh(new THREE.BufferGeometry(), this.previewMaterial);
		this.previewMesh.visible = false;

		this.overlayGroup.add(
			this.gridPoints,
			this.outline,
			this.firstPointMarker,
			this.endPointMarker,
			this.handlePointMarker,
			this.previewMesh
		);
	}

	private vertexSpacing(): number {
		return vertexSpacingFor(this.terrainSettings.chunkSize, this.terrainSettings.chunkResolution);
	}

	getPreviewMaterials(): THREE.Material[] {
		return [this.previewMaterial];
	}

	activate(): void {
		this.active = true;
		this.state = 'idle';
		this.foundationId = null;
		this.firstPoint = null;
		this.pathEndPoint = null;
		this.pathDrawMode = 'axis';
		this.hoverPoint = null;
		this.lastGridX = null;
		this.lastGridZ = null;
		this.lastFoundationId = null;
		this.scene.add(this.overlayGroup);
		window.addEventListener('keydown', this.handleKeyDown);
		this.refreshVisuals();
	}

	deactivate(): void {
		this.active = false;
		this.state = 'idle';
		this.foundationId = null;
		this.firstPoint = null;
		this.pathEndPoint = null;
		this.levelManager.unlockActiveFoundation();
		this.hideAllVisuals();
		this.scene.remove(this.overlayGroup);
		window.removeEventListener('keydown', this.handleKeyDown);
		this.onHudChange?.(null);
	}

	update(): void {
		if (!this.active) return;

		this.raycaster.setFromCamera(this.screenCenter, this.camera);
		const hit = raycastLevelConstructionPlane(
			this.raycaster,
			this.foundationManager,
			this.levelManager,
			this.vertexSpacing(),
			this.buildingSettings.buildingGridSize
		);
		this.levelManager.reportHoveredFoundation(hit?.foundationId ?? null);
		const levelChanged = pullActiveLevelChange(this.levelManager, this.activeLevelWatch);

		if (!hit) {
			if (this.hoverPoint || levelChanged) {
				this.hoverPoint = null;
				this.lastGridX = null;
				this.lastGridZ = null;
				this.lastFoundationId = null;
				this.refreshVisuals();
			}
			return;
		}

		if (
			(this.state === 'first-point-selected' || this.state === 'bending') &&
			hit.foundationId !== this.foundationId
		) {
			return;
		}

		let gridPoint = hit.gridPoint;
		if (
			this.kind === 'path' &&
			this.pathDrawMode === 'axis' &&
			this.state === 'first-point-selected' &&
			this.firstPoint
		) {
			gridPoint = snapDrawingPoint([this.firstPoint], gridPoint, 'axis');
		}

		if (
			this.hoverPoint &&
			gridPoint.gridX === this.lastGridX &&
			gridPoint.gridZ === this.lastGridZ &&
			hit.foundationId === this.lastFoundationId &&
			!levelChanged
		) {
			return;
		}

		this.lastGridX = gridPoint.gridX;
		this.lastGridZ = gridPoint.gridZ;
		this.lastFoundationId = hit.foundationId;
		this.hoverPoint = gridPoint;
		this.refreshVisuals();
	}

	onPrimaryAction(): void {
		if (!this.active || !this.hoverPoint) return;

		if (this.state === 'idle') {
			this.foundationId = this.lastFoundationId;
			if (!this.foundationId) return;
			this.levelManager.lockActiveFoundation(this.foundationId);
			this.firstPoint = this.hoverPoint;
			this.activeLevelIndex = this.levelManager.getCurrentLevelIndex(this.foundationId);
			this.activeBaseY = this.levelManager.getOrCreateLevel(
				this.foundationId,
				this.activeLevelIndex
			).baseY;
			this.state = 'first-point-selected';
			this.refreshVisuals();
			return;
		}

		if (
			this.kind === 'path' &&
			this.pathDrawMode === 'bezier' &&
			this.state === 'first-point-selected' &&
			this.firstPoint
		) {
			const endCheck = validateFloorDetailFootprint(
				'path',
				[this.firstPoint, this.hoverPoint],
				this.buildingSettings.floorDetailPathWidth,
				this.buildingSettings.buildingGridSize
			);
			if (!endCheck.valid) return;
			this.pathEndPoint = this.hoverPoint;
			this.state = 'bending';
			this.refreshVisuals();
			return;
		}

		this.confirmPlacement();
	}

	onSecondaryAction(): void {
		if (!this.active || this.state === 'idle') return;
		this.state = 'idle';
		this.foundationId = null;
		this.firstPoint = null;
		this.pathEndPoint = null;
		this.levelManager.unlockActiveFoundation();
		this.refreshVisuals();
	}

	private authoredPoints(): BuildingGridPoint[] | null {
		const a = this.firstPoint;
		const b = this.hoverPoint;
		if (!a || !b) return null;
		if (this.kind === 'path') {
			if (this.state === 'bending' && this.pathEndPoint) {
				return [a, b, this.pathEndPoint];
			}
			return [a, b];
		}
		return rectanglePointsFromCorners(a, b);
	}

	private confirmPlacement(): void {
		if (!this.foundationId) return;
		const points = this.authoredPoints();
		if (!points) return;

		let placePoints = points;
		if (
			this.kind === 'path' &&
			placePoints.length === 3 &&
			pathBendIsStraight(
				placePoints[0],
				placePoints[1],
				placePoints[2],
				this.buildingSettings.buildingGridSize
			)
		) {
			placePoints = [placePoints[0], placePoints[2]];
		}

		const result = this.buildingManager.addFloorDetail({
			foundationId: this.foundationId,
			kind: this.kind,
			points: placePoints,
			levelIndex: this.activeLevelIndex,
			hostY: this.activeBaseY,
			renderMode: this.buildingSettings.floorDetailRenderMode,
			colors: [
				this.buildingSettings.floorDetailColorA,
				this.buildingSettings.floorDetailColorB
			],
			plankWidth: this.buildingSettings.floorDetailPlankWidth,
			plankDirection: this.buildingSettings.floorDetailPlankDirection,
			tileSize: this.buildingSettings.floorDetailTileSize,
			tilePattern: this.buildingSettings.floorDetailTilePattern,
			pathWidth: this.buildingSettings.floorDetailPathWidth,
			pathFraming: this.buildingSettings.floorDetailPathFraming
		});
		if (!result.valid || !result.value) return;

		this.undoManager.record({ kind: 'floorDetail', detailId: result.value.id });
		this.state = 'idle';
		this.foundationId = null;
		this.firstPoint = null;
		this.pathEndPoint = null;
		this.levelManager.unlockActiveFoundation();
		this.refreshVisuals();
	}

	private refreshVisuals(): void {
		if (this.buildingSettings.showBuildingGrid && this.hoverPoint && this.lastFoundationId) {
			this.updateGridOverlay(this.lastFoundationId, this.hoverPoint);
		} else {
			this.gridPoints.visible = false;
		}

		if (this.state === 'idle') {
			this.outline.visible = false;
			this.firstPointMarker.visible = false;
			this.endPointMarker.visible = false;
			this.handlePointMarker.visible = false;
			this.hidePreview();
			this.onHudChange?.(this.buildIdleHud());
			return;
		}

		this.updateFirstMarker();
		this.updateEndMarker();
		this.updateHandleMarker();
		const points = this.authoredPoints();
		if (!points || !this.foundationId) {
			this.outline.visible = false;
			this.hidePreview();
			this.onHudChange?.(this.buildWaitingHud());
			return;
		}

		const check = validateFloorDetailFootprint(
			this.kind,
			points,
			this.buildingSettings.floorDetailPathWidth,
			this.buildingSettings.buildingGridSize
		);
		const color = check.valid ? VALID_COLOR : INVALID_COLOR;
		this.updateOutline(this.foundationId, points, color);
		if (check.valid) this.updatePreview(this.foundationId, points);
		else this.hidePreview();
		this.onHudChange?.(this.buildDrawingHud(check.valid, check.reason));
	}

	private previewBaseY(foundationId: string): number {
		if (this.state !== 'idle') return this.activeBaseY;
		return this.levelManager.getOrCreateLevel(
			foundationId,
			this.levelManager.getCurrentLevelIndex(foundationId)
		).baseY;
	}

	private updateFirstMarker(): void {
		if (!this.firstPoint || !this.foundationId) {
			this.firstPointMarker.visible = false;
			return;
		}
		const foundation = this.foundationManager.getFoundation(this.foundationId);
		if (!foundation) {
			this.firstPointMarker.visible = false;
			return;
		}
		const frame = foundationLocalFrame(foundation, this.vertexSpacing());
		const buildingGridSize = this.buildingSettings.buildingGridSize;
		this.firstPointMarker.position.set(
			frame.originWorldX + this.firstPoint.gridX * buildingGridSize,
			frame.originWorldY + this.activeBaseY + 0.08,
			frame.originWorldZ + this.firstPoint.gridZ * buildingGridSize
		);
		this.firstPointMarker.visible = true;
	}

	private updateEndMarker(): void {
		if (this.state !== 'bending' || !this.pathEndPoint || !this.foundationId) {
			this.endPointMarker.visible = false;
			return;
		}
		const foundation = this.foundationManager.getFoundation(this.foundationId);
		if (!foundation) {
			this.endPointMarker.visible = false;
			return;
		}
		const frame = foundationLocalFrame(foundation, this.vertexSpacing());
		const buildingGridSize = this.buildingSettings.buildingGridSize;
		this.endPointMarker.position.set(
			frame.originWorldX + this.pathEndPoint.gridX * buildingGridSize,
			frame.originWorldY + this.activeBaseY + 0.08,
			frame.originWorldZ + this.pathEndPoint.gridZ * buildingGridSize
		);
		this.endPointMarker.visible = true;
	}

	private updateHandleMarker(): void {
		if (this.state !== 'bending' || !this.hoverPoint || !this.foundationId) {
			this.handlePointMarker.visible = false;
			return;
		}
		const foundation = this.foundationManager.getFoundation(this.foundationId);
		if (!foundation) {
			this.handlePointMarker.visible = false;
			return;
		}
		const frame = foundationLocalFrame(foundation, this.vertexSpacing());
		const buildingGridSize = this.buildingSettings.buildingGridSize;
		this.handlePointMarker.position.set(
			frame.originWorldX + this.hoverPoint.gridX * buildingGridSize,
			frame.originWorldY + this.activeBaseY + 0.1,
			frame.originWorldZ + this.hoverPoint.gridZ * buildingGridSize
		);
		this.handlePointMarker.visible = true;
	}

	private updateOutline(foundationId: string, points: BuildingGridPoint[], color: number): void {
		const foundation = this.foundationManager.getFoundation(foundationId);
		if (!foundation) {
			this.outline.visible = false;
			return;
		}
		const frame = foundationLocalFrame(foundation, this.vertexSpacing());
		const buildingGridSize = this.buildingSettings.buildingGridSize;
		const y = frame.originWorldY + this.activeBaseY + 0.05;
		let corners: [number, number][];
		if (this.kind === 'path') {
			const ring = pathRibbonLocalRing(
				points,
				this.buildingSettings.floorDetailPathWidth,
				buildingGridSize
			);
			if (ring.length < 4) {
				this.outline.visible = false;
				return;
			}
			corners = ring.map((p) => [frame.originWorldX + p.x, frame.originWorldZ + p.z]);
		} else {
			const rect = axisAlignedRectFromPoints(points);
			if (!rect) {
				this.outline.visible = false;
				return;
			}
			corners = [
				[frame.originWorldX + rect.minGridX * buildingGridSize, frame.originWorldZ + rect.minGridZ * buildingGridSize],
				[frame.originWorldX + rect.maxGridX * buildingGridSize, frame.originWorldZ + rect.minGridZ * buildingGridSize],
				[frame.originWorldX + rect.maxGridX * buildingGridSize, frame.originWorldZ + rect.maxGridZ * buildingGridSize],
				[frame.originWorldX + rect.minGridX * buildingGridSize, frame.originWorldZ + rect.maxGridZ * buildingGridSize]
			];
		}

		const positions = this.outlineGeometry.attributes.position.array as Float32Array;
		let i = 0;
		for (let c = 0; c < corners.length && i + 6 <= positions.length; c++) {
			const [x0, z0] = corners[c];
			const [x1, z1] = corners[(c + 1) % corners.length];
			positions[i++] = x0;
			positions[i++] = y;
			positions[i++] = z0;
			positions[i++] = x1;
			positions[i++] = y;
			positions[i++] = z1;
		}
		this.outlineGeometry.setDrawRange(0, i / 3);
		this.outlineGeometry.attributes.position.needsUpdate = true;
		this.outlineMaterial.color.setHex(color);
		this.outline.visible = true;
	}

	private updatePreview(foundationId: string, points: BuildingGridPoint[]): void {
		const foundation = this.foundationManager.getFoundation(foundationId);
		if (!foundation) {
			this.hidePreview();
			return;
		}
		const frame = foundationLocalFrame(foundation, this.vertexSpacing());
		const draft: FloorDetailDefinition = {
			id: 'preview',
			foundationId,
			levelIndex: this.activeLevelIndex,
			kind: this.kind,
			hostY: this.activeBaseY,
			renderMode: this.buildingSettings.floorDetailRenderMode,
			points,
			colors: [this.buildingSettings.floorDetailColorA, this.buildingSettings.floorDetailColorB],
			plankWidth: this.buildingSettings.floorDetailPlankWidth,
			plankDirection: this.buildingSettings.floorDetailPlankDirection,
			tileSize: this.buildingSettings.floorDetailTileSize,
			tilePattern: this.buildingSettings.floorDetailTilePattern,
			pathWidth: this.buildingSettings.floorDetailPathWidth,
			pathFraming: this.buildingSettings.floorDetailPathFraming
		};
		this.previewGeometry?.dispose();
		this.previewGeometry = buildFloorDetailGeometry(
			buildFloorDetailBoxes(draft, this.buildingSettings.buildingGridSize)
		);
		this.previewMesh.geometry = this.previewGeometry;
		this.previewMesh.position.set(frame.originWorldX, frame.originWorldY, frame.originWorldZ);
		this.previewMaterial.opacity = this.buildingSettings.floorDetailPreviewOpacity;
		this.previewMesh.visible = true;
	}

	private hidePreview(): void {
		this.previewMesh.visible = false;
	}

	private updateGridOverlay(foundationId: string, centerPoint: BuildingGridPoint): void {
		const foundation = this.foundationManager.getFoundation(foundationId);
		if (!foundation) {
			this.gridPoints.visible = false;
			return;
		}

		const spacing = this.vertexSpacing();
		const frame = foundationLocalFrame(foundation, spacing);
		const y = frame.originWorldY + this.previewBaseY(foundationId);
		const buildingGridSize = this.buildingSettings.buildingGridSize;
		const { width, depth } = foundationLocalSize(foundation, spacing);

		const fullCellsX = Math.floor(width / buildingGridSize);
		const fullCellsZ = Math.floor(depth / buildingGridSize);
		const fullPointCount = (fullCellsX + 1) * (fullCellsZ + 1);

		let minGridX: number;
		let maxGridX: number;
		let minGridZ: number;
		let maxGridZ: number;
		if (fullPointCount <= MAX_FULL_GRID_POINTS) {
			minGridX = 0;
			maxGridX = fullCellsX;
			minGridZ = 0;
			maxGridZ = fullCellsZ;
		} else {
			minGridX = Math.max(0, centerPoint.gridX - FALLBACK_RADIUS_CELLS);
			maxGridX = Math.min(fullCellsX, centerPoint.gridX + FALLBACK_RADIUS_CELLS);
			minGridZ = Math.max(0, centerPoint.gridZ - FALLBACK_RADIUS_CELLS);
			maxGridZ = Math.min(fullCellsZ, centerPoint.gridZ + FALLBACK_RADIUS_CELLS);
		}

		let i = 0;
		const lift = 0.02;
		for (let gz = minGridZ; gz <= maxGridZ && i < MAX_FULL_GRID_POINTS; gz++) {
			for (let gx = minGridX; gx <= maxGridX && i < MAX_FULL_GRID_POINTS; gx++) {
				const p = i * 3;
				this.gridPositions[p] = frame.originWorldX + gx * buildingGridSize;
				this.gridPositions[p + 1] = y + lift;
				this.gridPositions[p + 2] = frame.originWorldZ + gz * buildingGridSize;
				const isNearest = gx === centerPoint.gridX && gz === centerPoint.gridZ;
				const tint = isNearest ? NEAREST_COLOR : FAR_COLOR;
				this.gridColors[p] = tint[0];
				this.gridColors[p + 1] = tint[1];
				this.gridColors[p + 2] = tint[2];
				i++;
			}
		}

		this.gridGeometry.setDrawRange(0, i);
		this.gridGeometry.attributes.position.needsUpdate = true;
		this.gridGeometry.attributes.color.needsUpdate = true;
		(this.gridPoints.material as THREE.PointsMaterial).opacity =
			this.buildingSettings.buildingGridOpacity;
		this.gridPoints.visible = true;
	}

	private hideAllVisuals(): void {
		this.gridPoints.visible = false;
		this.outline.visible = false;
		this.firstPointMarker.visible = false;
		this.endPointMarker.visible = false;
		this.handlePointMarker.visible = false;
		this.hidePreview();
	}

	private currentLevelUiState(foundationId?: string): BuildingLevelUiState | undefined {
		const id = foundationId ?? this.levelManager.getActiveFoundationId() ?? undefined;
		return id ? this.levelManager.getLevelUiState(id) : undefined;
	}

	private extraHints(): string[] {
		const lines = ['E customise'];
		if (this.kind === 'planks') lines.push('R plank direction');
		else if (this.kind === 'tiles') lines.push('R tile pattern');
		else if (this.kind === 'path') {
			lines.push('C path mode');
			lines.push('R path framing');
		}
		return lines;
	}

	private pathSnapBadge(): string | undefined {
		return this.kind === 'path' ? floorPathDrawModeBadge(this.pathDrawMode) : undefined;
	}

	private pathEndHint(): string {
		if (this.kind !== 'path') return 'Choose opposite corner';
		if (this.state === 'bending') return 'Click to set the bend';
		return this.pathDrawMode === 'bezier' ? 'Click path end, then bend' : 'Click path end';
	}

	private buildIdleHud(): BuildUiState {
		const level = this.currentLevelUiState(this.lastFoundationId ?? undefined);
		return {
			toolId: this.toolId,
			level,
			crosshair: this.hoverPoint ? 'valid' : 'default',
			snapBadge: this.pathSnapBadge(),
			hintLines: [
				level ? level.displayName.toUpperCase() : 'Look at a foundation',
				'',
				KIND_LABEL[this.kind],
				'',
				this.kind === 'path' ? 'Click path start' : 'Click first corner',
				...this.extraHints()
			]
		};
	}

	private buildWaitingHud(): BuildUiState {
		return {
			toolId: this.toolId,
			level: this.foundationId ? this.levelManager.getLevelUiState(this.foundationId) : undefined,
			crosshair: 'default',
			snapBadge: this.pathSnapBadge(),
			hintLines: [
				KIND_LABEL[this.kind],
				'',
				this.pathEndHint(),
				'Right click: Cancel',
				...this.extraHints()
			]
		};
	}

	private buildDrawingHud(valid: boolean, reason?: string): BuildUiState {
		const settings = this.buildingSettings;
		const extras: string[] = [];
		if (this.kind === 'planks') extras.push(`Direction: ${settings.floorDetailPlankDirection.toUpperCase()}`);
		if (this.kind === 'tiles') extras.push(`Pattern: ${settings.floorDetailTilePattern}`);
		if (this.kind === 'path') {
			extras.push(`Mode: ${floorPathDrawModeLabel(this.pathDrawMode)}`);
			extras.push(`Width: ${settings.floorDetailPathWidth.toFixed(2)}m`);
			extras.push(settings.floorDetailPathFraming ? 'Framing on' : 'Framing off');
		}
		extras.push(settings.floorDetailRenderMode === '3d' ? '3D boards' : '2D plane');
		const placeHint =
			this.kind === 'path' && this.pathDrawMode === 'bezier' && this.state === 'first-point-selected'
				? 'Click: Set end'
				: this.state === 'bending'
					? 'Click: Set bend'
					: 'Click: Place';
		return {
			toolId: this.toolId,
			level: this.foundationId ? this.levelManager.getLevelUiState(this.foundationId) : undefined,
			crosshair: valid ? 'valid' : 'invalid',
			notice: valid ? undefined : (reason ?? 'Invalid'),
			snapBadge: this.pathSnapBadge(),
			hintLines: [
				KIND_LABEL[this.kind],
				'',
				...extras,
				'',
				valid ? placeHint : (reason ?? 'Invalid'),
				'Right click: Cancel',
				...this.extraHints()
			]
		};
	}

	dispose(): void {
		this.deactivate();
		this.gridGeometry.dispose();
		(this.gridPoints.material as THREE.Material).dispose();
		this.outlineGeometry.dispose();
		this.outlineMaterial.dispose();
		(this.firstPointMarker.material as THREE.Material).dispose();
		(this.endPointMarker.material as THREE.Material).dispose();
		(this.handlePointMarker.material as THREE.Material).dispose();
		this.previewGeometry?.dispose();
		this.previewMaterial.dispose();
	}
}

export function applyKindDefaultColors(settings: BuildingSettings, kind: FloorDetailKind): void {
	const [a, b] = defaultFloorDetailColors(kind);
	settings.floorDetailColorA = a;
	settings.floorDetailColorB = b;
}
