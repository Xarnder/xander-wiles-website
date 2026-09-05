import * as THREE from 'three';
import type { BuildingLevelManager } from './BuildingLevelManager';
import type { BuildingLevelUiState } from './BuildingLevelTypes';
import type { BuildingManager } from './BuildingManager';
import type { BuildUndoManager } from './BuildUndoManager';
import type { BuildingGridPoint } from './FoundationLocalMath';
import { foundationLocalFrame, foundationLocalSize } from './FoundationLocalMath';
import type { FoundationManager } from './FoundationManager';
import type { BuildingSettings, BuildUiState, SlabToolState, ToolId } from './FoundationTypes';
import { raycastSlabConstructionPlane } from './foundationTopTargeting';
import { vertexSpacingFor } from './foundationMath';
import {
	cycleSnapMode,
	snapDrawingPoint,
	snapModeLabel,
	snapToNearestCorner
} from './polygonDrawSnap';
import type { SnapMode } from './polygonDrawSnap';
import { buildSlabGeometry } from './SlabGeometryBuilder';
import { validateSlabPolygon } from './slabMath';
import type { SlabType } from './SlabTypes';
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

export interface SlabToolConfig {
	toolId: 'ceiling' | 'floor' | 'flat-roof';
	slabType: SlabType;
	label: string;
	getThickness: (settings: BuildingSettings) => number;
}

interface HoverTarget {
	foundationId: string;
	point: BuildingGridPoint;
}

/**
 * Shared implementation behind Ceiling/Floor/Flat Roof Tool: draw a closed polygon on ONE
 * foundation's current-level construction plane and fill it with a solid extruded slab — see
 * SlabGeometryBuilder.ts for the triangulation/extrusion. Interaction deliberately mirrors
 * PolygonWallTool (point-by-point, close on the first point, Backspace to undo, right-click to
 * cancel) since it's the same mental model, minus the "finish as an open chain" option a slab
 * polygon doesn't have — a slab is always a closed shape.
 *
 * All three slab tools default to the *same* elevation (`level.baseY + level.wallHeight` — the top
 * of the current level's walls), which is what lets a "Floor" placed at level 0 and a "Ceiling"
 * placed at level 0 be, physically, the exact same slab: BuildingManager.addSlab's same-level
 * overlap rule rejects the second one as a duplicate rather than creating two coplanar objects —
 * see SlabTypes.ts's doc comment.
 */
export class SlabToolBase implements BuildTool {
	readonly toolId: ToolId;

	private readonly scene: THREE.Scene;
	private readonly camera: THREE.PerspectiveCamera;
	private readonly foundationManager: FoundationManager;
	private readonly buildingManager: BuildingManager;
	private readonly levelManager: BuildingLevelManager;
	private readonly undoManager: BuildUndoManager;
	private readonly terrainSettings: TerrainSettings;
	private readonly buildingSettings: BuildingSettings;
	private readonly config: SlabToolConfig;
	private readonly onHudChange?: (hud: BuildUiState | null) => void;

	private readonly raycaster = new THREE.Raycaster();
	private readonly screenCenter = new THREE.Vector2(0, 0);

	private readonly overlayGroup = new THREE.Group();
	private readonly gridPositions = new Float32Array(MAX_FULL_GRID_POINTS * 3);
	private readonly gridColors = new Float32Array(MAX_FULL_GRID_POINTS * 3);
	private readonly gridGeometry = new THREE.BufferGeometry();
	private readonly gridPoints: THREE.Points;

	private readonly boundaryGeometry = new THREE.BufferGeometry();
	private readonly boundaryMaterial = new THREE.LineBasicMaterial({ color: 0xffa64d });
	private readonly boundary: THREE.LineSegments;

	private readonly pointMarkers: THREE.Mesh[] = [];
	private readonly hoverMarker = makeMarker(VALID_COLOR);

	private readonly previewMaterial = new THREE.MeshBasicMaterial({
		color: VALID_COLOR,
		transparent: true,
		opacity: 0.45,
		depthWrite: false,
		side: THREE.DoubleSide
	});
	private previewGeometry: THREE.BufferGeometry | null = null;
	private readonly previewMesh: THREE.Mesh;

	private active = false;
	private state: SlabToolState = 'idle';
	private points: BuildingGridPoint[] = [];
	private activeFoundationId: string | null = null;
	private activeLocalY = 0;

	private hoverTarget: HoverTarget | null = null;
	private lastGridX: number | null = null;
	private lastGridZ: number | null = null;
	private lastFoundationId: string | null = null;

	/**
	 * Cycled by pressing `C` — see polygonDrawSnap.ts. Defaults to `'wall-corners'` every time the
	 * tool is activated (see `activate()`) rather than persisting the player's last choice — tracing
	 * a ceiling/floor/roof polygon exactly over the room's own walls below is the common case for
	 * these three tools, per the README's "Draw-snap" section. Harmless even before any wall exists
	 * on the current level: `snapToNearestCorner` simply passes the raw point through when there's
	 * nothing to snap to.
	 */
	private snapMode: SnapMode = 'wall-corners';

	private readonly handleKeyDown = (event: KeyboardEvent) => {
		if (!this.active) return;
		if (event.code === 'KeyC') {
			const foundationId = this.activeFoundationId ?? this.hoverTarget?.foundationId ?? null;
			const wallCornersAvailable = foundationId
				? this.wallCornersOnCurrentLevel(foundationId).length > 0
				: false;
			this.snapMode = cycleSnapMode(this.snapMode, this.points.length, wallCornersAvailable);
			this.refreshVisuals();
			return;
		}
		if (this.state !== 'drawing') return;
		if (event.code === 'Backspace') this.undoLastPoint();
	};

	/**
	 * Every wall-endpoint/wall-path-point on `foundationId`, on the SAME level this slab is being
	 * drawn on — i.e. the corners of the room this ceiling/floor/roof sits above. A wall's `baseY`
	 * is frozen from `level.baseY` at the moment it's built (see WallTool/PolygonWallTool), so
	 * comparing against the current level's own `baseY` is an exact match, not a tolerance check.
	 */
	private wallCornersOnCurrentLevel(foundationId: string): BuildingGridPoint[] {
		const levelBaseY = this.levelManager.getOrCreateLevel(
			foundationId,
			this.levelManager.getCurrentLevelIndex(foundationId)
		).baseY;
		const building = this.buildingManager.getBuildingForFoundation(foundationId);
		const corners: BuildingGridPoint[] = [];
		for (const wall of building.walls) {
			if (wall.baseY !== levelBaseY) continue;
			corners.push({ gridX: wall.startGridX, gridZ: wall.startGridZ });
			corners.push({ gridX: wall.endGridX, gridZ: wall.endGridZ });
		}
		for (const path of building.wallPaths) {
			if (path.baseY !== levelBaseY) continue;
			for (const point of path.points) corners.push({ gridX: point.gridX, gridZ: point.gridZ });
		}
		return corners;
	}

	constructor(
		config: SlabToolConfig,
		options: {
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
	) {
		this.toolId = config.toolId;
		this.config = config;
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

	/** The default slab elevation for a foundation at the current level — top of that level's walls, shared identically by all three slab tools; see class doc comment. */
	private defaultLocalY(foundationId: string): number {
		const level = this.levelManager.getOrCreateLevel(
			foundationId,
			this.levelManager.getCurrentLevelIndex(foundationId)
		);
		return level.baseY + level.wallHeight;
	}

	/** The active (frozen, once drawing) or live (idle/hovering) slab localY for `foundationId`. */
	private resolveLocalY(foundationId: string): number {
		if (this.activeFoundationId === foundationId) return this.activeLocalY;
		return this.defaultLocalY(foundationId);
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
		this.snapMode = 'wall-corners';
		this.scene.add(this.overlayGroup);
		window.addEventListener('keydown', this.handleKeyDown);
	}

	deactivate(): void {
		this.active = false;
		this.state = 'idle';
		this.points = [];
		this.activeFoundationId = null;
		this.levelManager.unlockActiveFoundation();
		this.hideAllVisuals();
		this.scene.remove(this.overlayGroup);
		window.removeEventListener('keydown', this.handleKeyDown);
		this.onHudChange?.(null);
	}

	update(): void {
		if (!this.active) return;

		this.raycaster.setFromCamera(this.screenCenter, this.camera);
		const hit = raycastSlabConstructionPlane(
			this.raycaster,
			this.foundationManager,
			this.levelManager,
			this.vertexSpacing(),
			this.buildingSettings.buildingGridSize
		);
		this.levelManager.reportHoveredFoundation(hit?.foundationId ?? null);

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

		// 'wall-corners' applies regardless of drawing state — even the very first point benefits
		// from starting exactly on a wall corner. The other modes only make sense once there's a
		// last-confirmed-point to lock an axis against, and only on the polygon's own foundation.
		let gridPoint = hit.gridPoint;
		if (this.snapMode === 'wall-corners') {
			gridPoint = snapToNearestCorner(
				hit.gridPoint,
				this.wallCornersOnCurrentLevel(hit.foundationId)
			);
		} else if (this.state === 'drawing' && hit.foundationId === this.activeFoundationId) {
			gridPoint = snapDrawingPoint(this.points, hit.gridPoint, this.snapMode);
		}

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
		this.hoverTarget = { foundationId: hit.foundationId, point: gridPoint };
		this.refreshVisuals();
	}

	onPrimaryAction(): void {
		if (!this.active || !this.hoverTarget) return;

		if (this.state === 'idle') {
			this.points = [this.hoverTarget.point];
			this.activeFoundationId = this.hoverTarget.foundationId;
			this.levelManager.lockActiveFoundation(this.hoverTarget.foundationId);
			this.activeLocalY = this.defaultLocalY(this.hoverTarget.foundationId);
			this.state = 'drawing';
			this.refreshVisuals();
			return;
		}

		// drawing
		if (this.hoverTarget.foundationId !== this.activeFoundationId) return;

		if (this.isHoveringFirstPoint() && this.points.length >= 3) {
			this.confirmSlab();
			return;
		}

		const last = this.points[this.points.length - 1];
		if (
			last.gridX === this.hoverTarget.point.gridX &&
			last.gridZ === this.hoverTarget.point.gridZ
		) {
			return; // duplicate of the last point — ignore rather than create a zero-length edge
		}

		this.points = [...this.points, this.hoverTarget.point];
		this.refreshVisuals();
	}

	onSecondaryAction(): void {
		if (!this.active || this.state !== 'drawing') return;
		this.state = 'idle';
		this.points = [];
		this.activeFoundationId = null;
		this.levelManager.unlockActiveFoundation();
		this.refreshVisuals();
	}

	private undoLastPoint(): void {
		if (this.points.length <= 1) {
			this.state = 'idle';
			this.points = [];
			this.activeFoundationId = null;
			this.levelManager.unlockActiveFoundation();
		} else {
			this.points = this.points.slice(0, -1);
		}
		this.refreshVisuals();
	}

	private isHoveringFirstPoint(): boolean {
		if (!this.hoverTarget || this.points.length === 0) return false;
		const first = this.points[0];
		return (
			this.hoverTarget.foundationId === this.activeFoundationId &&
			this.hoverTarget.point.gridX === first.gridX &&
			this.hoverTarget.point.gridZ === first.gridZ
		);
	}

	private localPointsOf(points: BuildingGridPoint[]): { x: number; z: number }[] {
		const buildingGridSize = this.buildingSettings.buildingGridSize;
		return points.map((p) => ({ x: p.gridX * buildingGridSize, z: p.gridZ * buildingGridSize }));
	}

	private confirmSlab(): void {
		if (!this.activeFoundationId) return;

		const result = this.buildingManager.addSlab({
			points: this.points.map((p) => ({ ...p, foundationId: this.activeFoundationId! })),
			type: this.config.slabType,
			levelIndex: this.levelManager.getCurrentLevelIndex(this.activeFoundationId),
			localY: this.activeLocalY,
			thickness: this.config.getThickness(this.buildingSettings)
		});

		if (!result.valid || !result.value) return;
		this.undoManager.record({ kind: 'slab', slabId: result.value.id });

		this.state = 'idle';
		this.points = [];
		this.activeFoundationId = null;
		this.levelManager.unlockActiveFoundation();
		this.refreshVisuals();
	}

	private refreshVisuals(): void {
		if (this.buildingSettings.showBuildingGrid && this.hoverTarget) {
			this.updateGridOverlay(this.hoverTarget.foundationId, this.hoverTarget.point);
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
			last.gridX === this.hoverTarget.point.gridX &&
			last.gridZ === this.hoverTarget.point.gridZ;

		let valid = sameFoundation && !duplicate;
		let reason: string | undefined;
		if (!sameFoundation) reason = 'Must stay on the same foundation';
		else if (duplicate) reason = 'Same as the last point';

		if (valid && !closingLoop) {
			const candidatePoints = [...this.points, this.hoverTarget.point];
			const localPoints = this.localPointsOf(candidatePoints);
			// Only run the full simple-polygon validation once there's enough points for it to mean
			// anything (self-intersection needs >= 4 points to even be possible) — avoids flashing
			// "invalid" while only 2-3 points are selected.
			if (candidatePoints.length >= 4) {
				// Validate as an open chain (closed=false) here — the true closed-polygon check only
				// applies once the user actually closes the loop; see confirmSlab's addSlab call.
				const openCheck = validateSlabPolygonOpenChain(localPoints);
				if (!openCheck.valid) {
					valid = false;
					reason = openCheck.reason;
				}
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

		const previewPoints = closing ? this.points : [...this.points, this.hoverTarget.point];
		if (previewPoints.length < 3) {
			this.hidePreview();
			return;
		}

		const spacing = this.vertexSpacing();
		const frame = foundationLocalFrame(foundation, spacing);
		const localPoints = this.localPointsOf(previewPoints);
		const thickness = this.config.getThickness(this.buildingSettings);

		this.previewGeometry?.dispose();
		this.previewGeometry = buildSlabGeometry(
			localPoints,
			this.activeLocalY,
			this.activeLocalY - thickness
		);
		this.previewMesh.geometry = this.previewGeometry;
		this.previewMesh.position.set(frame.originWorldX, frame.originWorldY, frame.originWorldZ);
		this.previewMaterial.color.setHex(closing ? CLOSE_LOOP_COLOR : VALID_COLOR);
		this.previewMaterial.opacity = this.buildingSettings.slabPreviewOpacity;
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
		const levelY = frame.originWorldY + this.activeLocalY;
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
			frame.originWorldX + this.hoverTarget.point.gridX * buildingGridSize,
			frame.originWorldY + this.resolveLocalY(this.hoverTarget.foundationId) + 0.08,
			frame.originWorldZ + this.hoverTarget.point.gridZ * buildingGridSize
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
		const levelY = frame.originWorldY + this.resolveLocalY(foundationId);
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

	/** The current level's UI state for `foundationId`, or the globally "active" foundation if none is given — `undefined` once no foundation has ever been targeted. See BuildUiState.level. */
	private currentLevelUiState(foundationId?: string): BuildingLevelUiState | undefined {
		const id = foundationId ?? this.levelManager.getActiveFoundationId() ?? undefined;
		return id ? this.levelManager.getLevelUiState(id) : undefined;
	}

	/** "GROUND FLOOR" / "Elevation: X.XXm" — same level-context line every level-aware tool's HUD shows. Elevation here is the slab's own surface (top of the level's walls), not the level's baseY — see `resolveLocalY`. */
	private levelHudLines(foundationId?: string): string[] {
		const level = this.currentLevelUiState(foundationId);
		if (!level) return ['Look at a foundation'];
		const lines = [level.displayName.toUpperCase()];
		if (foundationId) lines.push(`Elevation: ${this.resolveLocalY(foundationId).toFixed(2)}m`);
		return lines;
	}

	private thicknessLine(): string {
		return `Thickness: ${this.config.getThickness(this.buildingSettings).toFixed(2)}m`;
	}

	/** The current snap mode as an extra HUD line, or `[]` when off — spread directly into a hintLines array. */
	private snapHudLines(): string[] {
		const label = snapModeLabel(this.snapMode);
		return label ? [label] : [];
	}

	private buildIdleHud(): BuildUiState {
		return {
			toolId: this.toolId,
			snapMode: this.snapMode,
			level: this.currentLevelUiState(this.hoverTarget?.foundationId),
			crosshair: this.hoverTarget ? 'valid' : 'default',
			hintLines: [
				...this.levelHudLines(this.hoverTarget?.foundationId),
				'',
				this.config.label,
				'',
				this.thicknessLine(),
				'',
				'Look up: click to start',
				...this.snapHudLines(),
				'C: Cycle snap'
			]
		};
	}

	private buildDrawingHud(closingLoop: boolean): BuildUiState {
		const levelLines = this.levelHudLines(this.activeFoundationId ?? undefined);
		const level = this.currentLevelUiState(this.activeFoundationId ?? undefined);
		const common = [
			this.config.label,
			'',
			this.thicknessLine(),
			'',
			`Points: ${this.points.length}`
		];

		if (closingLoop) {
			return {
				toolId: this.toolId,
				snapMode: this.snapMode,
				level,
				crosshair: 'valid',
				hintLines: [...levelLines, '', ...common, '', ...this.snapHudLines(), 'Click to close slab']
			};
		}

		return {
			toolId: this.toolId,
			snapMode: this.snapMode,
			level,
			crosshair: 'valid',
			hintLines: [
				...levelLines,
				'',
				...common,
				'',
				...this.snapHudLines(),
				'Click: Add point',
				'Click first point: Close',
				'Backspace: Undo point',
				'C: Cycle snap',
				'Right click: Cancel'
			]
		};
	}

	private buildInvalidHud(reason: string): BuildUiState {
		return {
			toolId: this.toolId,
			snapMode: this.snapMode,
			level: this.currentLevelUiState(this.activeFoundationId ?? undefined),
			crosshair: 'invalid',
			hintLines: [
				...this.levelHudLines(this.activeFoundationId ?? undefined),
				'',
				this.config.label,
				'',
				reason,
				'',
				...this.snapHudLines(),
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

/** Live per-point validity feedback while still drawing (before the loop is closed) — checks only what's meaningful for an open chain (duplicate/zero-length edges, self-intersection so far); full closed-polygon validation (area, closing edge) happens once via BuildingManager.addSlab at confirm time. */
function validateSlabPolygonOpenChain(points: { x: number; z: number }[]): {
	valid: boolean;
	reason?: string;
} {
	// Re-use the same closed-polygon validator by temporarily NOT closing it — duplicate/zero-length
	// consecutive edges and self-intersection are both meaningful checks on an open chain too, and
	// validateSlabPolygon's zero-area / closing-edge checks are naturally satisfied trivially for a
	// chain with < 3 points, and don't meaningfully apply until the shape is actually closed.
	return validateSlabPolygon(points);
}
