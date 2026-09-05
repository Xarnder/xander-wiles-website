import * as THREE from 'three';
import type { BuildingLevelManager } from './BuildingLevelManager';
import type { BuildingLevelUiState } from './BuildingLevelTypes';
import type { BuildingManager } from './BuildingManager';
import type { BuildUndoManager } from './BuildUndoManager';
import type { BuildingGridPoint } from './FoundationLocalMath';
import { foundationLocalFrame, foundationLocalSize } from './FoundationLocalMath';
import type { FoundationManager } from './FoundationManager';
import type { BuildingSettings, BuildUiState, ToolId, WallToolState } from './FoundationTypes';
import { raycastLevelConstructionPlane } from './foundationTopTargeting';
import { vertexSpacingFor } from './foundationMath';
import { cycleSnapMode, snapDrawingPoint, snapModeLabel } from './polygonDrawSnap';
import type { SnapMode } from './polygonDrawSnap';
import { applyWallTransform, buildWallGeometry } from './WallGeometryBuilder';
import { computeSolidWallSegments, computeWallLength } from './wallGeometryMath';
import type { TerrainSettings } from '../terrain/TerrainSettings';
import type { BuildTool } from './BuildToolManager';

/** Preallocated capacity for the full-footprint grid overlay before falling back to a radius around the cursor — see updateGridOverlay. */
const MAX_FULL_GRID_POINTS = 4096;
const FALLBACK_RADIUS_CELLS = 12;

const NEAREST_COLOR: readonly [number, number, number] = [1, 0.85, 0.2];
const FAR_COLOR: readonly [number, number, number] = [0.5, 0.8, 1];

const FIRST_POINT_COLOR = 0x4da6ff;
const VALID_COLOR = 0x39d353;
const INVALID_COLOR = 0xff4d4d;

const markerGeometry = new THREE.SphereGeometry(0.08, 10, 8);

function makeMarker(color: number): THREE.Mesh {
	const material = new THREE.MeshBasicMaterial({ color, depthTest: false });
	const mesh = new THREE.Mesh(markerGeometry, material);
	mesh.renderOrder = 10;
	mesh.visible = false;
	return mesh;
}

interface HoverTarget {
	foundationId: string;
	point: BuildingGridPoint;
}

export interface WallToolOptions {
	scene: THREE.Scene;
	camera: THREE.PerspectiveCamera;
	foundationManager: FoundationManager;
	buildingManager: BuildingManager;
	levelManager: BuildingLevelManager;
	undoManager: BuildUndoManager;
	terrainSettings: TerrainSettings;
	buildingSettings: BuildingSettings;
	onHudChange?: (hud: BuildUiState | null) => void;
}

/**
 * The Wall Tool: targets a foundation's top surface (never terrain), snaps to the fine
 * foundation-local building grid, and runs the same two-click state machine as FoundationTool.
 * Every point is resolved to (foundationId, gridX, gridZ) — BuildingManager.addWall is the one
 * place that actually validates and stores it; this tool only targets, previews, and confirms.
 */
export class WallTool implements BuildTool {
	readonly toolId: ToolId = 'wall';

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

	private readonly boundaryGeometry = new THREE.BufferGeometry();
	private readonly boundaryMaterial = new THREE.LineBasicMaterial({ color: 0x9fe8ff });
	private readonly boundary: THREE.LineSegments;

	private readonly firstPointMarker = makeMarker(FIRST_POINT_COLOR);
	private readonly targetMarker = makeMarker(VALID_COLOR);

	private readonly previewMaterial = new THREE.MeshBasicMaterial({
		color: VALID_COLOR,
		transparent: true,
		opacity: 0.5,
		depthWrite: false,
		side: THREE.DoubleSide
	});
	private previewGeometry: THREE.BufferGeometry | null = null;
	private readonly previewMesh: THREE.Mesh;

	private active = false;
	private state: WallToolState = 'idle';
	private target: HoverTarget | null = null;
	private lastGridX: number | null = null;
	private lastGridZ: number | null = null;
	private lastFoundationId: string | null = null;
	private firstPoint: HoverTarget | null = null;

	/**
	 * Cycled by pressing `C` — see polygonDrawSnap.ts. Defaults to `'axis-inline'` every time the
	 * tool is activated (see `activate()`) rather than persisting the player's last choice, per the
	 * README's "Draw-snap" section; a straight wall never accumulates the 3+ points `'axis-inline'`
	 * needs to differ from plain `'axis'`, so in practice this just starts the player on axis-locked
	 * placement, one `C` press away from `'off'` (`cycleSnapMode('axis-inline', ...)` goes straight
	 * to `'off'` since `wallCornersAvailable` is never passed here).
	 */
	private snapMode: SnapMode = 'axis-inline';

	private readonly handleKeyDown = (event: KeyboardEvent) => {
		if (!this.active || event.code !== 'KeyC') return;
		this.snapMode = cycleSnapMode(this.snapMode, this.firstPoint ? 1 : 0);
		this.refreshVisuals();
	};

	constructor(options: WallToolOptions) {
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

		this.boundaryGeometry.setAttribute(
			'position',
			new THREE.BufferAttribute(new Float32Array(24), 3)
		);
		this.boundary = new THREE.LineSegments(this.boundaryGeometry, this.boundaryMaterial);
		this.boundary.renderOrder = 6;
		this.boundary.visible = false;

		this.previewMesh = new THREE.Mesh(new THREE.BufferGeometry(), this.previewMaterial);
		this.previewMesh.visible = false;

		this.overlayGroup.add(
			this.gridPoints,
			this.boundary,
			this.firstPointMarker,
			this.targetMarker,
			this.previewMesh
		);
	}

	private vertexSpacing(): number {
		return vertexSpacingFor(this.terrainSettings.chunkSize, this.terrainSettings.chunkResolution);
	}

	activate(): void {
		this.active = true;
		this.state = 'idle';
		this.firstPoint = null;
		this.target = null;
		this.lastGridX = null;
		this.lastGridZ = null;
		this.lastFoundationId = null;
		this.snapMode = 'axis-inline';
		this.scene.add(this.overlayGroup);
		window.addEventListener('keydown', this.handleKeyDown);
	}

	deactivate(): void {
		this.active = false;
		this.state = 'idle';
		this.firstPoint = null;
		this.levelManager.unlockActiveFoundation();
		this.hideAllVisuals();
		this.scene.remove(this.overlayGroup);
		window.removeEventListener('keydown', this.handleKeyDown);
		this.onHudChange?.(null);
	}

	update(): void {
		if (!this.active) return;

		const hit = this.findFoundationTopTarget();
		this.levelManager.reportHoveredFoundation(hit?.foundationId ?? null);
		if (!hit) {
			if (this.target) {
				this.target = null;
				this.lastGridX = null;
				this.lastGridZ = null;
				this.lastFoundationId = null;
				this.refreshVisuals();
			}
			return;
		}

		const { foundationId } = hit;
		const gridPoint =
			this.state === 'first-point-selected' &&
			this.firstPoint &&
			foundationId === this.firstPoint.foundationId
				? snapDrawingPoint([this.firstPoint.point], hit.gridPoint, this.snapMode)
				: hit.gridPoint;

		if (
			this.target &&
			gridPoint.gridX === this.lastGridX &&
			gridPoint.gridZ === this.lastGridZ &&
			foundationId === this.lastFoundationId
		) {
			return;
		}

		this.lastGridX = gridPoint.gridX;
		this.lastGridZ = gridPoint.gridZ;
		this.lastFoundationId = foundationId;
		this.target = { foundationId, point: gridPoint };
		this.refreshVisuals();
	}

	onPrimaryAction(): void {
		if (!this.active || !this.target) return;

		if (this.state === 'idle') {
			this.firstPoint = this.target;
			this.levelManager.lockActiveFoundation(this.target.foundationId);
			this.state = 'first-point-selected';
			this.refreshVisuals();
			return;
		}

		this.confirmWall();
	}

	onSecondaryAction(): void {
		if (!this.active || this.state !== 'first-point-selected') return;
		this.state = 'idle';
		this.firstPoint = null;
		this.levelManager.unlockActiveFoundation();
		this.refreshVisuals();
	}

	private findFoundationTopTarget(): { foundationId: string; gridPoint: BuildingGridPoint } | null {
		this.raycaster.setFromCamera(this.screenCenter, this.camera);
		return raycastLevelConstructionPlane(
			this.raycaster,
			this.foundationManager,
			this.levelManager,
			this.vertexSpacing(),
			this.buildingSettings.buildingGridSize
		);
	}

	/** The Y a new wall on `foundationId` should start at, for whatever level is currently selected — see BuildingLevelManager's doc comment on why this is frozen per-level rather than derived live. */
	private currentBaseY(foundationId: string): number {
		return this.levelManager.getOrCreateLevel(
			foundationId,
			this.levelManager.getCurrentLevelIndex(foundationId)
		).baseY;
	}

	private confirmWall(): void {
		if (!this.firstPoint || !this.target) return;

		const result = this.buildingManager.addWall({
			start: {
				foundationId: this.firstPoint.foundationId,
				gridX: this.firstPoint.point.gridX,
				gridZ: this.firstPoint.point.gridZ
			},
			end: {
				foundationId: this.target.foundationId,
				gridX: this.target.point.gridX,
				gridZ: this.target.point.gridZ
			},
			baseY: this.currentBaseY(this.firstPoint.foundationId),
			height: this.buildingSettings.wallHeight,
			thickness: this.buildingSettings.wallThickness,
			minimumWallLength: this.buildingSettings.minimumWallLength
		});

		if (!result.valid || !result.value) return;
		this.undoManager.record({ kind: 'wall', wallId: result.value.id });

		this.state = 'idle';
		this.firstPoint = null;
		this.levelManager.unlockActiveFoundation();
		this.refreshVisuals();
	}

	private refreshVisuals(): void {
		if (this.buildingSettings.showBuildingGrid && this.target) {
			this.updateGridOverlay(this.target.foundationId, this.target.point);
		} else {
			this.gridPoints.visible = false;
			this.boundary.visible = false;
		}

		if (this.state === 'idle') {
			this.firstPointMarker.visible = false;
			this.hidePreview();
			this.updateTargetMarker(this.target, VALID_COLOR);
			this.onHudChange?.(this.buildIdleHud());
			return;
		}

		// first-point-selected
		this.updateTargetMarker(this.firstPoint, FIRST_POINT_COLOR);
		this.firstPointMarker.position.copy(this.targetMarker.position);
		this.firstPointMarker.visible = true;

		if (!this.firstPoint || !this.target) {
			this.hidePreview();
			this.onHudChange?.(this.buildWaitingHud());
			return;
		}

		const sameFoundation = this.firstPoint.foundationId === this.target.foundationId;
		const length = computeWallLength(
			{
				startGridX: this.firstPoint.point.gridX,
				startGridZ: this.firstPoint.point.gridZ,
				endGridX: this.target.point.gridX,
				endGridZ: this.target.point.gridZ
			},
			this.buildingSettings.buildingGridSize
		);
		const valid = sameFoundation && length >= this.buildingSettings.minimumWallLength;

		this.updateTargetMarker(this.target, valid ? VALID_COLOR : INVALID_COLOR);

		if (!valid) {
			this.hidePreview();
			const reason = !sameFoundation
				? 'Both points must be on the same foundation'
				: `Wall must be at least ${this.buildingSettings.minimumWallLength.toFixed(2)}m`;
			this.onHudChange?.(this.buildInvalidHud(reason));
			return;
		}

		this.updatePreview(length);
		this.onHudChange?.(this.buildValidHud(length));
	}

	private updateGridOverlay(foundationId: string, centerPoint: BuildingGridPoint): void {
		const foundation = this.foundationManager.getFoundation(foundationId);
		if (!foundation) {
			this.gridPoints.visible = false;
			this.boundary.visible = false;
			return;
		}

		const spacing = this.vertexSpacing();
		const frame = foundationLocalFrame(foundation, spacing);
		const levelY = frame.originWorldY + this.currentBaseY(foundationId);
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
				const local = { localX: gx * buildingGridSize, localZ: gz * buildingGridSize };
				const p = i * 3;
				this.gridPositions[p] = frame.originWorldX + local.localX;
				this.gridPositions[p + 1] = levelY + lift;
				this.gridPositions[p + 2] = frame.originWorldZ + local.localZ;

				const isNearest = gx === centerPoint.gridX && gz === centerPoint.gridZ;
				const color = isNearest ? NEAREST_COLOR : FAR_COLOR;
				this.gridColors[p] = color[0];
				this.gridColors[p + 1] = color[1];
				this.gridColors[p + 2] = color[2];
				i++;
			}
		}

		this.gridGeometry.setDrawRange(0, i);
		this.gridGeometry.attributes.position.needsUpdate = true;
		this.gridGeometry.attributes.color.needsUpdate = true;
		(this.gridPoints.material as THREE.PointsMaterial).opacity =
			this.buildingSettings.buildingGridOpacity;
		this.gridPoints.visible = true;

		const outlineY = levelY + lift;
		const corners: [number, number][] = [
			[frame.originWorldX, frame.originWorldZ],
			[frame.originWorldX + width, frame.originWorldZ],
			[frame.originWorldX + width, frame.originWorldZ + depth],
			[frame.originWorldX, frame.originWorldZ + depth]
		];
		const positions = this.boundaryGeometry.attributes.position.array as Float32Array;
		let bi = 0;
		for (let c = 0; c < 4; c++) {
			const [x0, z0] = corners[c];
			const [x1, z1] = corners[(c + 1) % 4];
			positions[bi++] = x0;
			positions[bi++] = outlineY;
			positions[bi++] = z0;
			positions[bi++] = x1;
			positions[bi++] = outlineY;
			positions[bi++] = z1;
		}
		this.boundaryGeometry.attributes.position.needsUpdate = true;
		this.boundary.visible = true;
	}

	private updateTargetMarker(target: HoverTarget | null, color: number): void {
		if (!target) {
			this.targetMarker.visible = false;
			return;
		}
		const foundation = this.foundationManager.getFoundation(target.foundationId);
		if (!foundation) {
			this.targetMarker.visible = false;
			return;
		}
		const frame = foundationLocalFrame(foundation, this.vertexSpacing());
		const buildingGridSize = this.buildingSettings.buildingGridSize;
		this.targetMarker.position.set(
			frame.originWorldX + target.point.gridX * buildingGridSize,
			frame.originWorldY + this.currentBaseY(target.foundationId) + 0.05,
			frame.originWorldZ + target.point.gridZ * buildingGridSize
		);
		(this.targetMarker.material as THREE.MeshBasicMaterial).color.setHex(color);
		this.targetMarker.visible = true;
	}

	private updatePreview(length: number): void {
		if (!this.firstPoint || !this.target) return;
		const foundation = this.foundationManager.getFoundation(this.firstPoint.foundationId);
		if (!foundation) {
			this.hidePreview();
			return;
		}

		const spacing = this.vertexSpacing();
		const frame = foundationLocalFrame(foundation, spacing);
		const buildingGridSize = this.buildingSettings.buildingGridSize;
		const wallHeight = this.buildingSettings.wallHeight;
		const wallThickness = this.buildingSettings.wallThickness;

		const startLocalX = this.firstPoint.point.gridX * buildingGridSize;
		const startLocalZ = this.firstPoint.point.gridZ * buildingGridSize;
		const endLocalX = this.target.point.gridX * buildingGridSize;
		const endLocalZ = this.target.point.gridZ * buildingGridSize;
		const dx = endLocalX - startLocalX;
		const dz = endLocalZ - startLocalZ;
		const headingRadians = Math.atan2(dz, dx);

		const segments = computeSolidWallSegments(length, wallHeight, []);
		this.previewGeometry?.dispose();
		this.previewGeometry = buildWallGeometry(segments, wallThickness);
		this.previewMesh.geometry = this.previewGeometry;

		applyWallTransform(
			this.previewMesh,
			frame.originWorldX + startLocalX,
			frame.originWorldY + this.currentBaseY(this.firstPoint.foundationId),
			frame.originWorldZ + startLocalZ,
			headingRadians
		);
		this.previewMaterial.color.setHex(VALID_COLOR);
		this.previewMaterial.opacity = this.buildingSettings.previewOpacity;
		this.previewMesh.visible = true;
	}

	private hidePreview(): void {
		this.previewMesh.visible = false;
	}

	private hideAllVisuals(): void {
		this.gridPoints.visible = false;
		this.boundary.visible = false;
		this.firstPointMarker.visible = false;
		this.targetMarker.visible = false;
		this.hidePreview();
	}

	/** The current level's UI state for `foundationId`, or the globally "active" foundation if none is given — `undefined` once no foundation has ever been targeted. See BuildUiState.level. */
	private currentLevelUiState(foundationId?: string): BuildingLevelUiState | undefined {
		const id = foundationId ?? this.levelManager.getActiveFoundationId() ?? undefined;
		return id ? this.levelManager.getLevelUiState(id) : undefined;
	}

	/** "GROUND FLOOR" / "Elevation: X.XXm" — the same level-context line every level-aware tool's HUD shows, per the README. */
	private levelHudLines(foundationId?: string): string[] {
		const level = this.currentLevelUiState(foundationId);
		if (!level) return ['Look at a foundation'];
		return [level.displayName.toUpperCase(), `Elevation: ${level.baseY.toFixed(2)}m`];
	}

	/** The current snap mode as an extra HUD line, or `[]` when off — spread directly into a hintLines array. */
	private snapHudLines(): string[] {
		const label = snapModeLabel(this.snapMode);
		return label ? [label] : [];
	}

	private buildIdleHud(): BuildUiState {
		return {
			toolId: 'wall',
			snapMode: this.snapMode,
			level: this.currentLevelUiState(this.target?.foundationId),
			crosshair: this.target ? 'valid' : 'default',
			hintLines: [
				...this.levelHudLines(this.target?.foundationId),
				'',
				'WALL',
				'',
				'Look at a foundation',
				`Grid: ${this.buildingSettings.buildingGridSize.toFixed(2)}m`,
				'Left click: Select start point',
				...this.snapHudLines(),
				'C: Cycle snap'
			]
		};
	}

	private buildWaitingHud(): BuildUiState {
		return {
			toolId: 'wall',
			snapMode: this.snapMode,
			level: this.currentLevelUiState(this.firstPoint?.foundationId),
			crosshair: 'default',
			hintLines: [
				...this.levelHudLines(this.firstPoint?.foundationId),
				'',
				'WALL',
				'',
				'Select end point',
				...this.snapHudLines(),
				'C: Cycle snap',
				'Right click: Cancel'
			]
		};
	}

	private buildInvalidHud(reason: string): BuildUiState {
		return {
			toolId: 'wall',
			snapMode: this.snapMode,
			level: this.currentLevelUiState(this.firstPoint?.foundationId),
			crosshair: 'invalid',
			hintLines: [
				...this.levelHudLines(this.firstPoint?.foundationId),
				'',
				'WALL',
				'',
				reason,
				'',
				...this.snapHudLines(),
				'C: Cycle snap',
				'Right click: Cancel'
			]
		};
	}

	private buildValidHud(length: number): BuildUiState {
		return {
			toolId: 'wall',
			snapMode: this.snapMode,
			level: this.currentLevelUiState(this.firstPoint?.foundationId),
			crosshair: 'valid',
			hintLines: [
				...this.levelHudLines(this.firstPoint?.foundationId),
				'',
				'WALL',
				'',
				`Length: ${length.toFixed(2)}m`,
				`Height: ${this.buildingSettings.wallHeight.toFixed(2)}m`,
				'',
				...this.snapHudLines(),
				'Left click: Build',
				'C: Cycle snap',
				'Right click: Cancel'
			]
		};
	}

	dispose(): void {
		this.deactivate();
		this.gridGeometry.dispose();
		(this.gridPoints.material as THREE.Material).dispose();
		this.boundaryGeometry.dispose();
		this.boundaryMaterial.dispose();
		(this.firstPointMarker.material as THREE.Material).dispose();
		(this.targetMarker.material as THREE.Material).dispose();
		this.previewGeometry?.dispose();
		this.previewMaterial.dispose();
	}
}
