import * as THREE from 'three';
import type { BuildingLevelManager } from './BuildingLevelManager';
import type { BuildingManager } from './BuildingManager';
import type { BuildingGridPoint } from './FoundationLocalMath';
import { foundationLocalFrame, foundationLocalSize } from './FoundationLocalMath';
import type { FoundationManager } from './FoundationManager';
import type {
	BuildingSettings,
	BuildUiState,
	PolygonWallToolState,
	ToolId
} from './FoundationTypes';
import { raycastLevelConstructionPlane } from './foundationTopTargeting';
import { vertexSpacingFor } from './foundationMath';
import { cycleSnapMode, snapDrawingPoint, snapModeLabel } from './polygonDrawSnap';
import type { SnapMode } from './polygonDrawSnap';
import { buildWallPath } from './WallPathGeometryBuilder';
import { computePathLength, pathSelfIntersects } from './wallPathMath';
import type { TerrainSettings } from '../terrain/TerrainSettings';
import type { BuildTool } from './BuildToolManager';

const MAX_FULL_GRID_POINTS = 4096;
const FALLBACK_RADIUS_CELLS = 12;
const MAX_POINT_MARKERS = 64;

const NEAREST_COLOR: readonly [number, number, number] = [1, 0.85, 0.2];
const FAR_COLOR: readonly [number, number, number] = [0.5, 0.8, 1];

const FIRST_POINT_COLOR = 0xffcc33;
const CONFIRMED_POINT_COLOR = 0x4da6ff;
const VALID_COLOR = 0x39d353;
const INVALID_COLOR = 0xff4d4d;
const CLOSE_LOOP_COLOR = 0x39d353;

const markerGeometry = new THREE.SphereGeometry(0.08, 10, 8);

function makeMarker(color: number): THREE.Mesh {
	const material = new THREE.MeshBasicMaterial({ color, depthTest: false });
	const mesh = new THREE.Mesh(markerGeometry, material);
	mesh.renderOrder = 10;
	mesh.visible = false;
	return mesh;
}

export interface PolygonWallToolOptions {
	scene: THREE.Scene;
	camera: THREE.PerspectiveCamera;
	foundationManager: FoundationManager;
	buildingManager: BuildingManager;
	levelManager: BuildingLevelManager;
	terrainSettings: TerrainSettings;
	buildingSettings: BuildingSettings;
	onHudChange?: (hud: BuildUiState | null) => void;
}

/**
 * The Continuous/Polygon Wall Tool: draws a connected, ordered path of points on ONE foundation
 * and creates a WallPathDefinition with properly joined corners — see WallPathGeometryBuilder.ts
 * for how those joins are computed. Targeting/snapping/grid-visualization is identical to the
 * Straight Wall Tool (shared via foundationTopTargeting.ts); what differs is that this tool holds
 * an ordered list of confirmed points instead of just one, and previews the *exact* final geometry
 * (by literally running the in-progress path through buildWallPath()) rather than a disconnected
 * per-segment box.
 */
export class PolygonWallTool implements BuildTool {
	readonly toolId: ToolId = 'polygon-wall';

	private readonly scene: THREE.Scene;
	private readonly camera: THREE.PerspectiveCamera;
	private readonly foundationManager: FoundationManager;
	private readonly buildingManager: BuildingManager;
	private readonly levelManager: BuildingLevelManager;
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

	private readonly pointMarkers: THREE.Mesh[] = [];
	private readonly hoverMarker = makeMarker(VALID_COLOR);

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
	private state: PolygonWallToolState = 'idle';
	private points: BuildingGridPoint[] = [];
	private activeFoundationId: string | null = null;
	/** Frozen the moment drawing begins (alongside activeFoundationId), so an accidental level change mid-draw never shifts the polygon's elevation partway through — see BuildingLevelManager's doc comment. */
	private activeBaseY = 0;

	private hoverTarget: { foundationId: string; gridPoint: BuildingGridPoint } | null = null;
	private lastGridX: number | null = null;
	private lastGridZ: number | null = null;
	private lastFoundationId: string | null = null;

	/** Cycled by pressing `C` — see polygonDrawSnap.ts. Not reset on undo/cancel, only on deactivate, so a player's preferred snap mode persists across separate wall paths in the same session. */
	private snapMode: SnapMode = 'off';

	private readonly handleKeyDown = (event: KeyboardEvent) => {
		if (!this.active) return;
		if (event.code === 'KeyC') {
			this.snapMode = cycleSnapMode(this.snapMode, this.points.length);
			this.refreshVisuals();
			return;
		}
		if (this.state !== 'drawing') return;
		if (event.code === 'Enter') {
			this.finishOpenPath();
		} else if (event.code === 'Backspace') {
			this.undoLastPoint();
		}
	};

	constructor(options: PolygonWallToolOptions) {
		this.scene = options.scene;
		this.camera = options.camera;
		this.foundationManager = options.foundationManager;
		this.buildingManager = options.buildingManager;
		this.levelManager = options.levelManager;
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

		for (let i = 0; i < MAX_POINT_MARKERS; i++)
			this.pointMarkers.push(makeMarker(CONFIRMED_POINT_COLOR));

		this.previewMesh = new THREE.Mesh(new THREE.BufferGeometry(), this.previewMaterial);
		this.previewMesh.visible = false;

		this.overlayGroup.add(
			this.gridPoints,
			this.boundary,
			this.hoverMarker,
			this.previewMesh,
			...this.pointMarkers
		);
	}

	private vertexSpacing(): number {
		return vertexSpacingFor(this.terrainSettings.chunkSize, this.terrainSettings.chunkResolution);
	}

	/** The active (frozen, once drawing) or live (while idle/hovering) baseY for `foundationId` — see `activeBaseY`'s doc comment. */
	private resolveBaseY(foundationId: string): number {
		if (this.activeFoundationId === foundationId) return this.activeBaseY;
		return this.levelManager.getOrCreateLevel(
			foundationId,
			this.levelManager.getCurrentLevelIndex()
		).baseY;
	}

	activate(): void {
		this.active = true;
		this.state = 'idle';
		this.points = [];
		this.activeFoundationId = null;
		this.hoverTarget = null;
		this.lastGridX = null;
		this.lastGridZ = null;
		this.lastFoundationId = null;
		this.scene.add(this.overlayGroup);
		window.addEventListener('keydown', this.handleKeyDown);
	}

	deactivate(): void {
		this.active = false;
		this.state = 'idle';
		this.points = [];
		this.activeFoundationId = null;
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
			this.levelManager.getCurrentLevelIndex(),
			this.vertexSpacing(),
			this.buildingSettings.buildingGridSize
		);

		if (!hit) {
			if (this.hoverTarget) {
				this.hoverTarget = null;
				this.lastGridX = null;
				this.lastGridZ = null;
				this.lastFoundationId = null;
				this.refreshVisuals();
			}
			return;
		}

		// Only snap against the in-progress path's own points, on its own foundation — a hover on a
		// different foundation (rejected on confirm anyway) has no meaningful "last point" to lock to.
		const gridPoint =
			this.state === 'drawing' && hit.foundationId === this.activeFoundationId
				? snapDrawingPoint(this.points, hit.gridPoint, this.snapMode)
				: hit.gridPoint;

		if (
			this.hoverTarget &&
			gridPoint.gridX === this.lastGridX &&
			gridPoint.gridZ === this.lastGridZ &&
			hit.foundationId === this.lastFoundationId
		) {
			return;
		}

		this.lastGridX = gridPoint.gridX;
		this.lastGridZ = gridPoint.gridZ;
		this.lastFoundationId = hit.foundationId;
		this.hoverTarget = { foundationId: hit.foundationId, gridPoint };
		this.refreshVisuals();
	}

	onPrimaryAction(): void {
		if (!this.active || !this.hoverTarget) return;

		if (this.state === 'idle') {
			this.points = [this.hoverTarget.gridPoint];
			this.activeFoundationId = this.hoverTarget.foundationId;
			this.activeBaseY = this.levelManager.getOrCreateLevel(
				this.hoverTarget.foundationId,
				this.levelManager.getCurrentLevelIndex()
			).baseY;
			this.state = 'drawing';
			this.refreshVisuals();
			return;
		}

		// drawing
		if (this.hoverTarget.foundationId !== this.activeFoundationId) return; // invalid target, ignore click

		if (this.isHoveringFirstPoint() && this.points.length >= 3) {
			this.confirmPath(true);
			return;
		}

		const last = this.points[this.points.length - 1];
		if (
			last.gridX === this.hoverTarget.gridPoint.gridX &&
			last.gridZ === this.hoverTarget.gridPoint.gridZ
		) {
			return; // duplicate of the last point — ignore rather than create a zero-length segment
		}

		const candidatePoints = [...this.points, this.hoverTarget.gridPoint];
		if (this.wouldSelfIntersect(candidatePoints, false)) return;

		this.points = candidatePoints;
		this.refreshVisuals();
	}

	onSecondaryAction(): void {
		if (!this.active || this.state !== 'drawing') return;
		this.state = 'idle';
		this.points = [];
		this.activeFoundationId = null;
		this.refreshVisuals();
	}

	private undoLastPoint(): void {
		if (this.points.length <= 1) {
			this.state = 'idle';
			this.points = [];
			this.activeFoundationId = null;
		} else {
			this.points = this.points.slice(0, -1);
		}
		this.refreshVisuals();
	}

	private finishOpenPath(): void {
		if (this.points.length < 2) return;
		this.confirmPath(false);
	}

	private isHoveringFirstPoint(): boolean {
		if (!this.hoverTarget || this.points.length === 0) return false;
		const first = this.points[0];
		return (
			this.hoverTarget.foundationId === this.activeFoundationId &&
			this.hoverTarget.gridPoint.gridX === first.gridX &&
			this.hoverTarget.gridPoint.gridZ === first.gridZ
		);
	}

	private wouldSelfIntersect(points: BuildingGridPoint[], closed: boolean): boolean {
		if (!this.activeFoundationId) return false;
		const buildingGridSize = this.buildingSettings.buildingGridSize;
		const localPoints = points.map((p) => ({
			x: p.gridX * buildingGridSize,
			z: p.gridZ * buildingGridSize
		}));
		return pathSelfIntersects(localPoints, closed);
	}

	private confirmPath(closed: boolean): void {
		if (!this.activeFoundationId) return;

		const result = this.buildingManager.addWallPath({
			points: this.points.map((p) => ({ ...p, foundationId: this.activeFoundationId! })),
			closed,
			baseY: this.activeBaseY,
			wallHeight: this.buildingSettings.wallHeight,
			wallThickness: this.buildingSettings.wallThickness,
			joinStyle: this.buildingSettings.wallJoinStyle,
			miterLimit: this.buildingSettings.miterLimit,
			minimumSegmentLength: this.buildingSettings.minimumWallLength
		});

		if (!result.valid) return;

		this.state = 'idle';
		this.points = [];
		this.activeFoundationId = null;
		this.refreshVisuals();
	}

	private refreshVisuals(): void {
		if (this.buildingSettings.showBuildingGrid && this.hoverTarget) {
			this.updateGridOverlay(this.hoverTarget.foundationId, this.hoverTarget.gridPoint);
		} else {
			this.gridPoints.visible = false;
			this.boundary.visible = false;
		}

		this.updatePointMarkers();

		if (this.state === 'idle') {
			this.hidePreview();
			this.updateHoverMarker(VALID_COLOR);
			this.onHudChange?.(this.buildIdleHud());
			return;
		}

		// drawing
		if (!this.hoverTarget) {
			this.hidePreview();
			this.onHudChange?.(this.buildDrawingHud(false));
			return;
		}

		const sameFoundation = this.hoverTarget.foundationId === this.activeFoundationId;
		const closingLoop = this.isHoveringFirstPoint() && this.points.length >= 3;
		const last = this.points[this.points.length - 1];
		const duplicate =
			!closingLoop &&
			last.gridX === this.hoverTarget.gridPoint.gridX &&
			last.gridZ === this.hoverTarget.gridPoint.gridZ;

		let valid = sameFoundation && !duplicate;
		let reason: string | undefined;
		if (!sameFoundation) reason = 'Must stay on the same foundation';
		else if (duplicate) reason = 'Same as the last point';

		if (valid && !closingLoop) {
			const candidatePoints = [...this.points, this.hoverTarget.gridPoint];
			if (this.wouldSelfIntersect(candidatePoints, false)) {
				valid = false;
				reason = 'Wall path would cross itself';
			}
		}

		this.updateHoverMarker(closingLoop ? CLOSE_LOOP_COLOR : valid ? VALID_COLOR : INVALID_COLOR);

		if (!valid) {
			this.hidePreview();
			this.onHudChange?.(this.buildInvalidHud(reason ?? 'Invalid point'));
			return;
		}

		this.updatePreview(closingLoop);
		this.onHudChange?.(this.buildDrawingHud(closingLoop));
	}

	private updatePreview(closing: boolean): void {
		if (!this.activeFoundationId || !this.hoverTarget) return;
		const foundation = this.foundationManager.getFoundation(this.activeFoundationId);
		if (!foundation) {
			this.hidePreview();
			return;
		}

		const previewPoints = closing ? this.points : [...this.points, this.hoverTarget.gridPoint];
		if (previewPoints.length < 2) {
			this.hidePreview();
			return;
		}

		const spacing = this.vertexSpacing();
		const frame = foundationLocalFrame(foundation, spacing);
		const buildingGridSize = this.buildingSettings.buildingGridSize;

		const tentativePath = {
			id: 'preview',
			foundationId: this.activeFoundationId,
			points: previewPoints,
			closed: closing,
			baseY: this.activeBaseY,
			wallHeight: this.buildingSettings.wallHeight,
			wallThickness: this.buildingSettings.wallThickness,
			joinStyle: this.buildingSettings.wallJoinStyle,
			miterLimit: this.buildingSettings.miterLimit,
			segments: Array.from(
				{ length: closing ? previewPoints.length : previewPoints.length - 1 },
				() => ({ id: 'preview-segment', openings: [] })
			)
		};

		const built = buildWallPath(tentativePath, frame, buildingGridSize);

		this.previewGeometry?.dispose();
		this.previewGeometry = built.visibleGeometry;
		this.previewMesh.geometry = this.previewGeometry;
		this.previewMesh.position.set(frame.originWorldX, frame.originWorldY, frame.originWorldZ);
		this.previewMesh.rotation.set(0, 0, 0);
		this.previewMaterial.color.setHex(closing ? CLOSE_LOOP_COLOR : VALID_COLOR);
		this.previewMaterial.opacity = this.buildingSettings.previewOpacity;
		this.previewMesh.visible = true;
	}

	private hidePreview(): void {
		this.previewMesh.visible = false;
	}

	private updatePointMarkers(): void {
		if (!this.activeFoundationId) {
			for (const marker of this.pointMarkers) marker.visible = false;
			return;
		}
		const foundation = this.foundationManager.getFoundation(this.activeFoundationId);
		if (!foundation) {
			for (const marker of this.pointMarkers) marker.visible = false;
			return;
		}
		const frame = foundationLocalFrame(foundation, this.vertexSpacing());
		const levelY = frame.originWorldY + this.activeBaseY;
		const buildingGridSize = this.buildingSettings.buildingGridSize;
		const lift = 0.06;

		this.points.forEach((point, index) => {
			if (index >= MAX_POINT_MARKERS) return;
			const marker = this.pointMarkers[index];
			marker.position.set(
				frame.originWorldX + point.gridX * buildingGridSize,
				levelY + lift,
				frame.originWorldZ + point.gridZ * buildingGridSize
			);
			(marker.material as THREE.MeshBasicMaterial).color.setHex(
				index === 0 ? FIRST_POINT_COLOR : CONFIRMED_POINT_COLOR
			);
			marker.visible = true;
		});
		for (let i = this.points.length; i < MAX_POINT_MARKERS; i++)
			this.pointMarkers[i].visible = false;
	}

	private updateHoverMarker(color: number): void {
		if (!this.hoverTarget) {
			this.hoverMarker.visible = false;
			return;
		}
		const foundation = this.foundationManager.getFoundation(this.hoverTarget.foundationId);
		if (!foundation) {
			this.hoverMarker.visible = false;
			return;
		}
		const frame = foundationLocalFrame(foundation, this.vertexSpacing());
		const buildingGridSize = this.buildingSettings.buildingGridSize;
		this.hoverMarker.position.set(
			frame.originWorldX + this.hoverTarget.gridPoint.gridX * buildingGridSize,
			frame.originWorldY + this.resolveBaseY(this.hoverTarget.foundationId) + 0.08,
			frame.originWorldZ + this.hoverTarget.gridPoint.gridZ * buildingGridSize
		);
		(this.hoverMarker.material as THREE.MeshBasicMaterial).color.setHex(color);
		this.hoverMarker.visible = true;
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
		const levelY = frame.originWorldY + this.resolveBaseY(foundationId);
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
				this.gridPositions[p + 1] = levelY + lift;
				this.gridPositions[p + 2] = frame.originWorldZ + gz * buildingGridSize;

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

	private hideAllVisuals(): void {
		this.gridPoints.visible = false;
		this.boundary.visible = false;
		this.hoverMarker.visible = false;
		for (const marker of this.pointMarkers) marker.visible = false;
		this.hidePreview();
	}

	/** "LEVEL N" / "Elevation: X.XXm" — same level-context line every level-aware tool's HUD shows. */
	private levelHudLines(foundationId?: string): string[] {
		const levelIndex = this.levelManager.getCurrentLevelIndex();
		const lines = [`LEVEL ${levelIndex}`];
		if (foundationId) lines.push(`Elevation: ${this.resolveBaseY(foundationId).toFixed(2)}m`);
		return lines;
	}

	/** The current snap mode as an extra HUD line, or `[]` when off — spread directly into a hintLines array. */
	private snapHudLines(): string[] {
		const label = snapModeLabel(this.snapMode);
		return label ? [label] : [];
	}

	private buildIdleHud(): BuildUiState {
		return {
			toolId: 'polygon-wall',
			snapMode: this.snapMode,
			crosshair: this.hoverTarget ? 'valid' : 'default',
			hintLines: [
				...this.levelHudLines(this.hoverTarget?.foundationId),
				'',
				'CONTINUOUS WALL',
				'',
				'Click to start',
				...this.snapHudLines(),
				'C: Cycle snap'
			]
		};
	}

	private buildDrawingHud(closingLoop: boolean): BuildUiState {
		const buildingGridSize = this.buildingSettings.buildingGridSize;
		const localPoints = this.points.map((p) => ({
			x: p.gridX * buildingGridSize,
			z: p.gridZ * buildingGridSize
		}));
		const length = computePathLength(localPoints, false);
		const levelLines = this.levelHudLines(this.activeFoundationId ?? undefined);

		if (closingLoop) {
			return {
				toolId: 'polygon-wall',
				snapMode: this.snapMode,
				crosshair: 'valid',
				hintLines: [
					...levelLines,
					'',
					'CONTINUOUS WALL',
					'',
					`Points: ${this.points.length}`,
					`Total length: ${length.toFixed(2)}m`,
					'',
					...this.snapHudLines(),
					'Click: Close loop'
				]
			};
		}

		return {
			toolId: 'polygon-wall',
			snapMode: this.snapMode,
			crosshair: 'valid',
			hintLines: [
				...levelLines,
				'',
				'CONTINUOUS WALL',
				'',
				`Points: ${this.points.length}`,
				`Total length: ${length.toFixed(2)}m`,
				'',
				...this.snapHudLines(),
				'Click: Add point',
				'Enter: Finish',
				'Backspace: Undo point',
				'C: Cycle snap',
				'Right click: Cancel'
			]
		};
	}

	private buildInvalidHud(reason: string): BuildUiState {
		return {
			toolId: 'polygon-wall',
			snapMode: this.snapMode,
			crosshair: 'invalid',
			hintLines: [
				...this.levelHudLines(this.activeFoundationId ?? undefined),
				'',
				'CONTINUOUS WALL',
				'',
				`Points: ${this.points.length}`,
				reason,
				'',
				...this.snapHudLines(),
				'Enter: Finish',
				'Backspace: Undo point',
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
		(this.hoverMarker.material as THREE.Material).dispose();
		for (const marker of this.pointMarkers) (marker.material as THREE.Material).dispose();
		this.previewGeometry?.dispose();
		this.previewMaterial.dispose();
	}
}
