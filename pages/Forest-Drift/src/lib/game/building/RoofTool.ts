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
import type { BuildingSettings, BuildUiState, RoofToolState, ToolId } from './FoundationTypes';
import { raycastSlabConstructionPlane } from './foundationTopTargeting';
import { vertexSpacingFor } from './foundationMath';
import {
	cycleSnapMode,
	snapDrawingPoint,
	snapModeLabel,
	snapToNearestCorner
} from './polygonDrawSnap';
import type { SnapMode } from './polygonDrawSnap';
import { buildRoofGeometry, RoofFootprintError } from './RoofGeometryBuilder';
import {
	axisAlignedRectangleOf,
	initialRoofDirection,
	pitchDegrees,
	rectDepth,
	rectWidth,
	roofTypeHasOrientationControl,
	roofTypeHasSlope
} from './roofMath';
import {
	ROOF_TYPE_LABELS,
	ROOF_TYPE_ORDER,
	type RoofDirection,
	type RoofProfileSettings,
	type RoofType,
	type ShedDirection
} from './RoofTypes';
import { validateSlabPolygon } from './slabMath';
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

const SHED_DIRECTION_ORDER: readonly ShedDirection[] = ['+x', '+z', '-x', '-z'];
const SHED_DIRECTION_LABELS: Readonly<Record<ShedDirection, string>> = {
	'+x': '+X',
	'-x': '-X',
	'+z': '+Z',
	'-z': '-Z'
};

const markerGeometry = new THREE.SphereGeometry(0.08, 10, 8);

function makeMarker(color: number): THREE.Mesh {
	const material = new THREE.MeshBasicMaterial({ color, depthTest: false });
	const mesh = new THREE.Mesh(markerGeometry, material);
	mesh.renderOrder = 10;
	mesh.visible = false;
	return mesh;
}

export interface RoofToolOptions {
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

interface HoverTarget {
	foundationId: string;
	point: BuildingGridPoint;
}

function nextShedDirection(current: ShedDirection): ShedDirection {
	const index = SHED_DIRECTION_ORDER.indexOf(current);
	return SHED_DIRECTION_ORDER[(index + 1) % SHED_DIRECTION_ORDER.length];
}

/** The perpendicular span (`v` in roofMath.ts's frame) the current type/direction/shedDirection combination climbs across — used only for the HUD's live pitch readout, never for real geometry (roofMath.ts derives this itself, independently, for the actual solid). */
function runForPitch(
	type: RoofType,
	rect: { minX: number; maxX: number; minZ: number; maxZ: number },
	direction: RoofDirection,
	shedDirection: ShedDirection
): number {
	if (type === 'hip' || type === 'mansard') {
		return Math.min(rectWidth(rect), rectDepth(rect)) / 2;
	}
	if (type === 'shed') {
		const axis: RoofDirection = shedDirection === '+x' || shedDirection === '-x' ? 'z' : 'x';
		return axis === 'z' ? rectWidth(rect) : rectDepth(rect);
	}
	return (direction === 'x' ? rectDepth(rect) : rectWidth(rect)) / 2;
}

/** Live per-point validity feedback while still drawing (before the loop is closed) — same reasoning as SlabToolBase's identical helper: duplicate/zero-length edges and self-intersection are meaningful on an open chain too; full closed-polygon validation happens once the loop actually closes. */
function validateOpenChain(points: { x: number; z: number }[]): {
	valid: boolean;
	reason?: string;
} {
	return validateSlabPolygon(points);
}

/**
 * Multi-type pitched Roof Tool — draws the SAME closed-polygon footprint every slab tool draws (see
 * SlabToolBase, which this deliberately does NOT extend: a roof needs a whole extra modal phase
 * SlabToolBase has no concept of), then enters an `'adjusting'` phase once the polygon closes: `V`
 * cycles the roof type, `R` rotates its orientation (ridge direction, or shed's high edge), and
 * `↑`/`↓` adjust rise (Shift for the finer step) — all live against a real preview built via
 * `RoofGeometryBuilder.buildRoofGeometry`, exactly the geometry that will actually be placed. A
 * second click confirms; right-click cancels the whole placement, mirroring StairTool's
 * `'choosing-direction'` phase (see its class doc comment) rather than stepping back to `'drawing'`.
 *
 * Only `'flat'` (via `SlabGeometryBuilder`, reused as-is) supports an arbitrary polygon; every other
 * type requires the closed footprint to be an axis-aligned rectangle (see roofMath.ts's
 * `axisAlignedRectangleOf`) — cycling `V` onto an incompatible type while adjusting shows "requires a
 * compatible footprint" instead of ever building corrupt geometry, exactly like
 * `BuildingManager.addRoof` itself would reject it at confirm time.
 */
export class RoofTool implements BuildTool {
	readonly toolId: ToolId = 'flat-roof';

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
	private readonly boundaryMaterial = new THREE.LineBasicMaterial({ color: 0xffa64d });
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
	private state: RoofToolState = 'idle';
	private points: BuildingGridPoint[] = [];
	private activeFoundationId: string | null = null;
	private activeLevelIndex = 0;
	private activeBaseY = 0;

	private hoverTarget: HoverTarget | null = null;
	private lastGridX: number | null = null;
	private lastGridZ: number | null = null;
	private lastFoundationId: string | null = null;
	private readonly activeLevelWatch = createActiveLevelWatch();

	/** Cycled by `C` while idle/drawing — same convention (and same "defaults to wall-corners on activate" reasoning) as every other polygon-drawing build tool; see SlabToolBase's doc comment. */
	private snapMode: SnapMode = 'wall-corners';

	// --- Live roof parameters, only meaningful once `state === 'adjusting'` (set in `enterAdjusting`) ---
	private roofType: RoofType = 'gable';
	private direction: RoofDirection = 'x';
	private shedDirection: ShedDirection = '+x';
	private rise = 4;

	private readonly handleKeyDown = (event: KeyboardEvent) => {
		if (!this.active) return;

		if (this.state === 'adjusting') {
			if (event.code === 'KeyV') {
				this.cycleType();
			} else if (event.code === 'KeyR') {
				this.rotate();
			} else if (event.code === 'ArrowUp') {
				this.adjustRise(1, event.shiftKey);
			} else if (event.code === 'ArrowDown') {
				this.adjustRise(-1, event.shiftKey);
			}
			return;
		}

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

	/** Every wall-endpoint/wall-path-point on `foundationId`, on the SAME level this roof is being drawn on — mirrors SlabToolBase's identical method (see its doc comment). */
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

	constructor(options: RoofToolOptions) {
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

	/** The default roof eave elevation for a foundation at the current level — top of that level's walls, exactly like a slab's `localY` (see SlabToolBase.defaultLocalY). */
	private defaultBaseY(foundationId: string): number {
		const level = this.levelManager.getOrCreateLevel(
			foundationId,
			this.levelManager.getCurrentLevelIndex(foundationId)
		);
		return level.baseY + level.wallHeight;
	}

	/** The active (frozen, once drawing/adjusting) or live (idle/hovering) eave elevation for `foundationId`. */
	private resolveBaseY(foundationId: string): number {
		if (this.activeFoundationId === foundationId) return this.activeBaseY;
		return this.defaultBaseY(foundationId);
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
		this.applyRoofDefaults();
		this.scene.add(this.overlayGroup);
		window.addEventListener('keydown', this.handleKeyDown);
		this.refreshVisuals();
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
		if (!this.active || this.state === 'adjusting') return;

		this.raycaster.setFromCamera(this.screenCenter, this.camera);
		const hit = raycastSlabConstructionPlane(
			this.raycaster,
			this.foundationManager,
			this.levelManager,
			this.vertexSpacing(),
			this.buildingSettings.buildingGridSize
		);
		this.levelManager.reportHoveredFoundation(hit?.foundationId ?? null);
		const levelChanged = pullActiveLevelChange(this.levelManager, this.activeLevelWatch);

		if (!hit) {
			if (this.hoverTarget || levelChanged) {
				this.hoverTarget = null;
				this.lastGridX = null;
				this.lastGridZ = null;
				this.lastFoundationId = null;
				this.refreshVisuals();
			}
			return;
		}

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
			hit.foundationId === this.lastFoundationId &&
			!levelChanged
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
		if (!this.active) return;

		if (this.state === 'adjusting') {
			this.confirmRoof();
			return;
		}

		if (!this.hoverTarget) return;

		if (this.state === 'idle') {
			this.points = [this.hoverTarget.point];
			this.activeFoundationId = this.hoverTarget.foundationId;
			this.levelManager.lockActiveFoundation(this.hoverTarget.foundationId);
			this.activeLevelIndex = this.levelManager.getCurrentLevelIndex(this.hoverTarget.foundationId);
			this.activeBaseY = this.defaultBaseY(this.hoverTarget.foundationId);
			this.state = 'drawing';
			this.refreshVisuals();
			return;
		}

		// drawing
		if (this.hoverTarget.foundationId !== this.activeFoundationId) return;

		if (this.isHoveringFirstPoint() && this.points.length >= 3) {
			this.enterAdjusting();
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
		if (!this.active || this.state === 'idle') return;
		// Cancels the WHOLE placement regardless of phase — mirrors StairTool's 'choosing-direction'
		// cancel (see the class doc comment), never steps back from 'adjusting' to 'drawing'.
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

	/** Gable + the configured default rise — applied on tool select and again when a footprint closes. */
	private applyRoofDefaults(): void {
		this.roofType = this.buildingSettings.defaultRoofType;
		this.rise = Math.max(0, this.buildingSettings.defaultRoofRise);
	}

	/** Freezes the footprint and enters the modal type/orientation/rise phase — auto-picks a starting type/direction/rise from the current settings, exactly once (see the class doc comment); every later `V`/`R`/↑/↓ press only ever mutates these live fields, never re-derives them. */
	private enterAdjusting(): void {
		this.applyRoofDefaults();
		this.shedDirection = '+x';

		const rect = axisAlignedRectangleOf(this.localPointsOf(this.points));
		this.direction = rect ? initialRoofDirection(rect) : 'x';

		this.state = 'adjusting';
		this.refreshVisuals();
	}

	private cycleType(): void {
		const index = ROOF_TYPE_ORDER.indexOf(this.roofType);
		this.roofType = ROOF_TYPE_ORDER[(index + 1) % ROOF_TYPE_ORDER.length];
		this.refreshVisuals();
	}

	private rotate(): void {
		if (this.roofType === 'shed') {
			this.shedDirection = nextShedDirection(this.shedDirection);
			this.refreshVisuals();
			return;
		}
		if (!roofTypeHasOrientationControl(this.roofType)) return;
		this.direction = this.direction === 'x' ? 'z' : 'x';
		this.refreshVisuals();
	}

	private adjustRise(delta: 1 | -1, fine: boolean): void {
		if (!roofTypeHasSlope(this.roofType)) return;
		const step = fine ? this.buildingSettings.roofRiseFineStep : this.buildingSettings.roofRiseStep;
		this.rise = Math.max(0, this.rise + delta * step);
		this.refreshVisuals();
	}

	private currentProfileSettings(): RoofProfileSettings {
		const settings = this.buildingSettings;
		return {
			gambrelLowerSlopeFraction: settings.gambrelLowerSlopeFraction,
			gambrelBreakHeightFraction: settings.gambrelBreakHeightFraction,
			mansardBreakFraction: settings.mansardBreakFraction,
			dutchGableHipFraction: settings.dutchGableHipFraction,
			mShapedValleyFraction: settings.mShapedValleyFraction
		};
	}

	private confirmRoof(): void {
		if (!this.activeFoundationId) return;

		const result = this.buildingManager.addRoof({
			points: this.points.map((p) => ({ ...p, foundationId: this.activeFoundationId! })),
			levelIndex: this.activeLevelIndex,
			baseY: this.activeBaseY,
			type: this.roofType,
			direction: this.direction,
			shedDirection: this.shedDirection,
			rise: this.rise,
			thickness: this.buildingSettings.roofDeckThickness,
			overhang: this.buildingSettings.roofOverhang,
			profileSettings: this.currentProfileSettings()
		});

		if (!result.valid || !result.value) return;
		this.undoManager.record({ kind: 'roof', roofId: result.value.id });

		this.state = 'idle';
		this.points = [];
		this.activeFoundationId = null;
		this.levelManager.unlockActiveFoundation();
		this.refreshVisuals();
	}

	private refreshVisuals(): void {
		if (this.state === 'adjusting') {
			this.gridPoints.visible = false;
			this.boundary.visible = false;
		} else if (this.buildingSettings.showBuildingGrid && this.hoverTarget) {
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

		if (this.state === 'adjusting') {
			this.updateHoverMarker(VALID_COLOR);
			this.refreshAdjustingPreview();
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
			if (candidatePoints.length >= 4) {
				const openCheck = validateOpenChain(localPoints);
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

		this.updateDrawingPreview(closingLoop);
		this.onHudChange?.(this.buildDrawingHud(closingLoop));
	}

	/** The live pitched-roof (or flat) preview while `state === 'adjusting'` — built from the exact same `buildRoofGeometry` the real placement uses, so what's shown is always what will actually be placed. */
	private refreshAdjustingPreview(): void {
		if (!this.activeFoundationId) {
			this.hidePreview();
			return;
		}
		const foundation = this.foundationManager.getFoundation(this.activeFoundationId);
		if (!foundation) {
			this.hidePreview();
			return;
		}

		const buildingGridSize = this.buildingSettings.buildingGridSize;
		let geometry: THREE.BufferGeometry;
		try {
			geometry = buildRoofGeometry(
				{
					points: this.points,
					type: this.roofType,
					direction: this.direction,
					shedDirection: this.shedDirection,
					baseY: this.activeBaseY,
					rise: this.rise,
					thickness: this.buildingSettings.roofDeckThickness,
					overhang: this.buildingSettings.roofOverhang,
					profileSettings: this.currentProfileSettings()
				},
				buildingGridSize
			);
		} catch (error) {
			if (error instanceof RoofFootprintError) {
				this.hidePreview();
				this.onHudChange?.(this.buildAdjustingHud(this.footprintErrorMessage()));
				return;
			}
			throw error;
		}

		const spacing = this.vertexSpacing();
		const frame = foundationLocalFrame(foundation, spacing);
		this.previewGeometry?.dispose();
		this.previewGeometry = geometry;
		this.previewMesh.geometry = this.previewGeometry;
		this.previewMesh.position.set(frame.originWorldX, frame.originWorldY, frame.originWorldZ);
		this.previewMaterial.color.setHex(VALID_COLOR);
		this.previewMaterial.opacity = this.buildingSettings.roofPreviewOpacity;
		this.previewMesh.visible = true;

		this.onHudChange?.(this.buildAdjustingHud());
	}

	private footprintErrorMessage(): string {
		return `${ROOF_TYPE_LABELS[this.roofType]} roof requires a compatible footprint`;
	}

	private updateDrawingPreview(closing: boolean): void {
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
		const thickness = this.buildingSettings.roofDeckThickness;

		this.previewGeometry?.dispose();
		this.previewGeometry = buildRoofGeometry(
			{
				points: previewPoints,
				type: 'flat',
				direction: 'x',
				shedDirection: '+x',
				baseY: this.activeBaseY,
				rise: 0,
				thickness,
				overhang: 0,
				profileSettings: this.currentProfileSettings()
			},
			this.buildingSettings.buildingGridSize
		);
		this.previewMesh.geometry = this.previewGeometry;
		this.previewMesh.position.set(frame.originWorldX, frame.originWorldY, frame.originWorldZ);
		this.previewMaterial.color.setHex(closing ? CLOSE_LOOP_COLOR : VALID_COLOR);
		this.previewMaterial.opacity = this.buildingSettings.roofPreviewOpacity;
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
			marker.visible = this.state !== 'adjusting';
		});
		for (let i = this.points.length; i < MAX_POINT_MARKERS; i++)
			this.pointMarkers[i].visible = false;
	}

	private updateHoverMarker(color: number): void {
		if (this.state === 'adjusting' || !this.hoverTarget) {
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
			frame.originWorldY + this.resolveBaseY(this.hoverTarget.foundationId) + 0.08,
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

	private currentLevelUiState(foundationId?: string): BuildingLevelUiState | undefined {
		const id = foundationId ?? this.levelManager.getActiveFoundationId() ?? undefined;
		return id ? this.levelManager.getLevelUiState(id) : undefined;
	}

	private levelHudLines(foundationId?: string): string[] {
		const level = this.currentLevelUiState(foundationId);
		if (!level) return ['Look at a foundation'];
		const lines = [level.displayName.toUpperCase()];
		if (foundationId) lines.push(`Elevation: ${this.resolveBaseY(foundationId).toFixed(2)}m`);
		return lines;
	}

	private snapHudLines(): string[] {
		const label = snapModeLabel(this.snapMode);
		return label ? [label] : [];
	}

	private buildIdleHud(): BuildUiState {
		return {
			toolId: this.toolId,
			snapMode: this.snapMode,
			level: this.currentLevelUiState(),
			crosshair: this.hoverTarget ? 'valid' : 'default',
			hintLines: [
				...this.levelHudLines(this.hoverTarget?.foundationId),
				'',
				'Roof',
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
		const common = ['Roof', '', `Points: ${this.points.length}`];

		if (closingLoop) {
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
					'Click to close footprint'
				]
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
				'Roof',
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

	/** The `V`/`R`/↑/↓ live-adjustment HUD — `footprintError`, when given, replaces the rise/pitch/orientation block with the reason a pitched type can't build on this footprint (see `refreshAdjustingPreview`). */
	private buildAdjustingHud(footprintError?: string): BuildUiState {
		const levelLines = this.levelHudLines(this.activeFoundationId ?? undefined);
		const typeLabel = ROOF_TYPE_LABELS[this.roofType];
		const hasSlope = roofTypeHasSlope(this.roofType);
		const hasOrientation = roofTypeHasOrientationControl(this.roofType);

		const statLines: string[] = [`${typeLabel} Roof`];
		if (footprintError) {
			statLines.push('', footprintError);
		} else if (hasSlope) {
			const localPoints = this.localPointsOf(this.points);
			const rect = axisAlignedRectangleOf(localPoints);
			const pitch = rect
				? pitchDegrees(
						this.rise,
						runForPitch(this.roofType, rect, this.direction, this.shedDirection)
					)
				: 0;
			statLines.push(`Rise: ${this.rise.toFixed(2)}m   Pitch: ${pitch.toFixed(1)}°`);
			statLines.push(this.orientationLine());
		} else {
			statLines.push('Rise: —   Pitch: 0°');
			if (this.roofType === 'hip') statLines.push('Ridge: auto (long axis)');
		}

		return {
			toolId: this.toolId,
			level: this.currentLevelUiState(this.activeFoundationId ?? undefined),
			crosshair: footprintError ? 'invalid' : 'valid',
			notice: footprintError,
			hintLines: [
				...levelLines,
				'',
				...statLines,
				'',
				'V: Cycle type',
				...(hasOrientation ? ['R: Rotate'] : []),
				...(hasSlope ? ['↑/↓: Adjust rise (Shift: fine)'] : []),
				'Click: Place roof',
				'Right click: Cancel'
			]
		};
	}

	private orientationLine(): string {
		if (this.roofType === 'shed') {
			return `High edge: ${SHED_DIRECTION_LABELS[this.shedDirection]}`;
		}
		if (!roofTypeHasOrientationControl(this.roofType)) {
			return 'Ridge: auto (long axis)';
		}
		return `Ridge: ${this.direction === 'x' ? 'X' : 'Z'} axis`;
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
