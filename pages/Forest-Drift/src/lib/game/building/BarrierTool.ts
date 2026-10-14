import * as THREE from 'three';
import type { TerrainSettings } from '../terrain/TerrainSettings';
import { compileBarrierLevel } from './BarrierGeometryCompiler';
import { layoutBarrier } from './barrierLayout';
import type { BarrierManager } from './BarrierManager';
import {
	BARRIER_MAX_POINTS,
	BARRIER_MAX_SEGMENT_LENGTH,
	BARRIER_MIN_SEGMENT_LENGTH,
	cloneBarrierStyle,
	getBarrierPreset,
	sanitizeBarrierStyle,
	type BarrierBaseMode,
	type BarrierDefinition,
	type BarrierPathPoint,
	type BarrierStyleDefinition
} from './BarrierTypes';
import { defaultStairRailingStyle } from './stairRailingMath';
import {
	createActiveLevelWatch,
	pullActiveLevelChange,
	type BuildingLevelManager
} from './BuildingLevelManager';
import type { BuildingLevelUiState } from './BuildingLevelTypes';
import type { BuildTool } from './BuildToolManager';
import type { BuildUndoManager } from './BuildUndoManager';
import type { BuildingGridPoint } from './FoundationLocalMath';
import {
	foundationLocalFrame,
	foundationLocalSize,
	isBuildingGridPointInsideFoundation,
	snapLocalToBuildingGrid
} from './FoundationLocalMath';
import type { FoundationManager } from './FoundationManager';
import type { BuildingSettings, BuildUiState, ToolId } from './FoundationTypes';
import { raycastFoundationTop } from './foundationTopTargeting';
import { vertexSpacingFor } from './foundationMath';
import {
	autoPromotePolygonWallSnap,
	cycleSnapMode,
	snapDrawingPoint,
	snapModeLabel,
	type SnapMode
} from './polygonDrawSnap';
import { computePathLength, pathSelfIntersects } from './wallPathMath';

const MAX_POINT_MARKERS = 64;
const GRID_PATCH_RADIUS = 6;
const VALID_COLOR = 0x39d353;
const INVALID_COLOR = 0xff4d4d;
const FIRST_POINT_COLOR = 0xffcc33;
const CONFIRMED_POINT_COLOR = 0x4da6ff;
/** Above this preview length the in-progress fence previews as its LOD-2 silhouette (no balusters). */
const DETAILED_PREVIEW_LENGTH = 30;

const markerGeometry = new THREE.SphereGeometry(0.07, 10, 8);

function makeMarker(color: number): THREE.Mesh {
	const mesh = new THREE.Mesh(
		markerGeometry,
		new THREE.MeshBasicMaterial({ color, depthTest: false })
	);
	mesh.renderOrder = 10;
	mesh.visible = false;
	return mesh;
}

type DrawSurface = 'foundation' | 'terrain';

interface HoverTarget {
	surface: DrawSurface;
	/** `null` on terrain. */
	foundationId: string | null;
	/** Grid integers: the foundation's building grid, or the world grid on terrain. */
	gridPoint: BuildingGridPoint;
	/** Base elevation in barrier space (foundation-local or world Y). */
	y: number;
}

export interface BarrierToolOptions {
	scene: THREE.Scene;
	camera: THREE.PerspectiveCamera;
	foundationManager: FoundationManager;
	levelManager: BuildingLevelManager;
	barrierManager: BarrierManager;
	undoManager: BuildUndoManager;
	terrainSettings: TerrainSettings;
	buildingSettings: BuildingSettings;
	getTerrainMeshes: () => readonly THREE.Object3D[];
	/**
	 * Stairs, so `R` / `Q` also work on a staircase's railings (they are fences in this style).
	 * Optional — without them the keys only act on drawn fences.
	 */
	stairs?: {
		getMeshes: () => THREE.Object3D[];
		getRailingStyle: (stairId: string) => BarrierStyleDefinition | undefined;
		restyle: (stairId: string, style: BarrierStyleDefinition) => void;
	};
	/** `WorldSurfaceSampler.getSupportingSurfaceY`. */
	sampleSurface: (worldX: number, worldZ: number, referenceY: number) => number;
	sampleTerrain: (worldX: number, worldZ: number) => number;
	onHudChange?: (hud: BuildUiState | null) => void;
}

/**
 * Hotbar slot 2 → Fence / Railing. Draws exactly like the Continuous Wall tool — click points, click
 * the first point again to close a loop, Enter to finish an open path, Backspace to undo a point,
 * right click to cancel, `B` to cycle axis snapping, `E` to customise — and reuses its targeting
 * (`raycastFoundationTop` + the storey's construction plane), snapping (`polygonDrawSnap.ts`) and
 * path checks (`wallPathMath.ts`).
 *
 * Unlike walls a barrier doesn't need a foundation: a path started on open ground is a terrain
 * fence in world coordinates whose posts follow the land, while one started on a building is stored
 * foundation-local on the storey it was drawn on. On a building each clicked point records the
 * surface under it (a stair tread, say), so drawing from the bottom of a flight to its top makes a
 * sloped stair railing.
 *
 * The preview is the real generator output at reduced LOD, rebuilt only when the snapped point
 * changes. `R` restyles the fence under the crosshair with the current settings and `Q` copies its
 * style into them — select, tweak with `E`, apply.
 */
export class BarrierTool implements BuildTool {
	readonly toolId: ToolId = 'barrier';

	private readonly options: BarrierToolOptions;
	private readonly raycaster = new THREE.Raycaster();
	private readonly screenCenter = new THREE.Vector2(0, 0);
	private readonly overlay = new THREE.Group();
	private readonly hoverMarker = makeMarker(VALID_COLOR);
	private readonly pointMarkers: THREE.Mesh[] = [];
	private readonly gridGeometry = new THREE.BufferGeometry();
	private readonly gridPoints: THREE.Points;
	private readonly previewMaterial = new THREE.MeshBasicMaterial({
		color: VALID_COLOR,
		transparent: true,
		opacity: 0.55,
		depthWrite: false
	});
	private readonly previewMesh: THREE.Mesh;
	private readonly highlight: THREE.Box3Helper;
	private readonly highlightBox = new THREE.Box3();

	private active = false;
	private drawing = false;
	private surface: DrawSurface = 'terrain';
	private foundationId: string | null = null;
	private levelIndex = 0;
	private levelBaseY = 0;
	private points: BuildingGridPoint[] = [];
	private pointYs: number[] = [];
	private hover: HoverTarget | null = null;
	private hoverKey = '';
	private aimedBarrierId: string | null = null;
	/** A staircase under the crosshair (when no fence is): `R` / `Q` act on its railings. */
	private aimedStairId: string | null = null;
	private snapMode: SnapMode = 'axis';
	private readonly levelWatch = createActiveLevelWatch();

	private readonly handleKeyDown = (event: KeyboardEvent) => {
		if (!this.active) return;
		const target = event.target as HTMLElement | null;
		if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName ?? '')) return;
		if (event.code === 'KeyB') {
			this.snapMode = cycleSnapMode(this.snapMode, this.points.length);
			this.refresh();
			return;
		}
		if (!this.drawing) {
			if (event.code === 'KeyR') this.restyleAimed();
			else if (event.code === 'KeyQ') this.copyAimedStyle();
			return;
		}
		if (event.code === 'Enter') this.finish(false);
		else if (event.code === 'Backspace') this.undoPoint();
	};

	constructor(options: BarrierToolOptions) {
		this.options = options;
		const grid = new Float32Array((GRID_PATCH_RADIUS * 2 + 1) ** 2 * 3);
		this.gridGeometry.setAttribute('position', new THREE.BufferAttribute(grid, 3));
		this.gridPoints = new THREE.Points(
			this.gridGeometry,
			new THREE.PointsMaterial({
				size: 0.06,
				color: 0x9fd8ff,
				depthTest: false,
				transparent: true
			})
		);
		this.gridPoints.renderOrder = 5;
		this.gridPoints.visible = false;
		for (let i = 0; i < MAX_POINT_MARKERS; i++)
			this.pointMarkers.push(makeMarker(CONFIRMED_POINT_COLOR));
		this.previewMesh = new THREE.Mesh(new THREE.BufferGeometry(), this.previewMaterial);
		this.previewMesh.visible = false;
		this.previewMesh.renderOrder = 4;
		this.highlight = new THREE.Box3Helper(this.highlightBox, 0x7fe0ff);
		this.highlight.visible = false;
		this.overlay.add(
			this.hoverMarker,
			this.gridPoints,
			this.previewMesh,
			this.highlight,
			...this.pointMarkers
		);
	}

	private get settings(): BuildingSettings {
		return this.options.buildingSettings;
	}

	private get gridSize(): number {
		return this.settings.buildingGridSize;
	}

	private vertexSpacing(): number {
		const t = this.options.terrainSettings;
		return vertexSpacingFor(t.chunkSize, t.chunkResolution);
	}

	activate(): void {
		this.active = true;
		this.resetPath();
		this.snapMode = 'axis';
		this.hover = null;
		this.hoverKey = '';
		this.options.scene.add(this.overlay);
		window.addEventListener('keydown', this.handleKeyDown);
		this.refresh();
	}

	deactivate(): void {
		this.active = false;
		this.resetPath();
		this.options.levelManager.unlockActiveFoundation();
		this.overlay.removeFromParent();
		window.removeEventListener('keydown', this.handleKeyDown);
		this.options.onHudChange?.(null);
	}

	update(): void {
		if (!this.active) return;
		this.raycaster.setFromCamera(this.screenCenter, this.options.camera);
		const raw = this.target();
		this.options.levelManager.reportHoveredFoundation(raw?.foundationId ?? null);
		const levelChanged = pullActiveLevelChange(this.options.levelManager, this.levelWatch);

		let next = raw;
		if (
			raw &&
			this.drawing &&
			raw.surface === this.surface &&
			raw.foundationId === this.foundationId
		) {
			const snapped = snapDrawingPoint(this.points, raw.gridPoint, this.snapMode);
			if (snapped.gridX !== raw.gridPoint.gridX || snapped.gridZ !== raw.gridPoint.gridZ)
				next = {
					...raw,
					gridPoint: snapped,
					y: this.pointElevation(raw.surface, raw.foundationId, snapped)
				};
		}
		this.raycaster.far = this.settings.removeToolMaxDistance;
		const fenceHit = this.drawing ? null : this.options.barrierManager.pick(this.raycaster);
		const aimed = fenceHit?.barrierId ?? null;
		const stairHit =
			this.drawing || !this.options.stairs
				? undefined
				: this.raycaster.intersectObjects(this.options.stairs.getMeshes(), false)[0];
		const aimedStair =
			stairHit && (!fenceHit || stairHit.distance < fenceHit.distance)
				? ((stairHit.object.userData.stairId as string | undefined) ?? null)
				: null;
		this.raycaster.far = Infinity;
		const key = next
			? `${next.surface}:${next.foundationId}:${next.gridPoint.gridX}:${next.gridPoint.gridZ}:${next.y.toFixed(3)}`
			: '';
		if (
			key === this.hoverKey &&
			aimed === this.aimedBarrierId &&
			aimedStair === this.aimedStairId &&
			!levelChanged
		)
			return;
		this.hover = next;
		this.hoverKey = key;
		this.aimedBarrierId = aimedStair ? null : aimed;
		this.aimedStairId = aimedStair;
		this.refresh();
	}

	onPrimaryAction(): void {
		if (!this.active) return;
		const hover = this.hover;
		if (!hover) return;
		if (!this.drawing) {
			this.drawing = true;
			this.surface = hover.surface;
			this.foundationId = hover.foundationId;
			if (hover.foundationId) {
				const level = this.currentLevel(hover.foundationId);
				this.levelIndex = level.index;
				this.levelBaseY = level.baseY;
				this.options.levelManager.lockActiveFoundation(hover.foundationId);
			}
			this.points = [hover.gridPoint];
			this.pointYs = [hover.y];
			this.refresh();
			return;
		}
		const check = this.checkHover();
		if (check.closing) {
			this.finish(true);
			return;
		}
		if (!check.valid) return;
		this.points.push(hover.gridPoint);
		this.pointYs.push(hover.y);
		this.snapMode = autoPromotePolygonWallSnap(this.snapMode, this.points.length);
		this.refresh();
	}

	onSecondaryAction(): void {
		if (!this.active || !this.drawing) return;
		this.resetPath();
		this.options.levelManager.unlockActiveFoundation();
		this.refresh();
	}

	dispose(): void {
		this.deactivate();
		this.gridGeometry.dispose();
		(this.gridPoints.material as THREE.Material).dispose();
		(this.hoverMarker.material as THREE.Material).dispose();
		for (const marker of this.pointMarkers) (marker.material as THREE.Material).dispose();
		this.previewMesh.geometry.dispose();
		this.previewMaterial.dispose();
		this.highlight.dispose();
	}

	// ------------------------------------------------------------------------------- targeting

	private currentLevel(foundationId: string): { index: number; baseY: number } {
		const levels = this.options.levelManager;
		const index = levels.getCurrentLevelIndex(foundationId);
		return { index, baseY: levels.getOrCreateLevel(foundationId, index).baseY };
	}

	/**
	 * Building first (the foundation under the crosshair, or the one the player stands in, on its
	 * current storey's plane), terrain otherwise. While drawing, the surface the path started on is
	 * kept so a fence never jumps between a building and the ground mid-path.
	 */
	private target(): HoverTarget | null {
		if (this.drawing) {
			return this.surface === 'foundation' && this.foundationId
				? this.foundationTarget(this.foundationId, true)
				: this.terrainTarget();
		}
		const { foundationManager } = this.options;
		const meshHit = raycastFoundationTop(
			this.raycaster,
			foundationManager,
			this.vertexSpacing(),
			this.gridSize
		);
		const origin = this.raycaster.ray.origin;
		const foundationId =
			meshHit?.foundationId ?? foundationManager.getFoundationContaining(origin.x, origin.z)?.id;
		if (foundationId) {
			const onPlane = this.foundationTarget(foundationId, false);
			if (onPlane) return onPlane;
			if (meshHit) {
				return {
					surface: 'foundation',
					foundationId: meshHit.foundationId,
					gridPoint: meshHit.gridPoint,
					y: this.pointElevation('foundation', meshHit.foundationId, meshHit.gridPoint)
				};
			}
		}
		return this.terrainTarget();
	}

	private foundationTarget(foundationId: string, drawing: boolean): HoverTarget | null {
		const foundation = this.options.foundationManager.getFoundation(foundationId);
		if (!foundation) return null;
		const spacing = this.vertexSpacing();
		const baseY = drawing ? this.levelBaseY : this.currentLevel(foundationId).baseY;
		const planeY = foundation.topY + baseY;
		const ray = this.raycaster.ray;
		if (Math.abs(ray.direction.y) < 1e-6) return null;
		const t = (planeY - ray.origin.y) / ray.direction.y;
		if (t <= 0) return null;
		const frame = foundationLocalFrame(foundation, spacing);
		const gridPoint = snapLocalToBuildingGrid(
			ray.origin.x + ray.direction.x * t - frame.originWorldX,
			ray.origin.z + ray.direction.z * t - frame.originWorldZ,
			this.gridSize
		);
		const { width, depth } = foundationLocalSize(foundation, spacing);
		if (!isBuildingGridPointInsideFoundation(gridPoint, this.gridSize, width, depth)) return null;
		return {
			surface: 'foundation',
			foundationId,
			gridPoint,
			y: this.pointElevation('foundation', foundationId, gridPoint, baseY)
		};
	}

	private terrainTarget(): HoverTarget | null {
		const meshes = [
			...this.options.getTerrainMeshes(),
			...this.options.foundationManager.getMeshes()
		];
		if (meshes.length === 0) return null;
		const hit = this.raycaster.intersectObjects(meshes as THREE.Object3D[], false)[0];
		if (!hit) return null;
		const gridPoint = {
			gridX: Math.round(hit.point.x / this.gridSize) || 0,
			gridZ: Math.round(hit.point.z / this.gridSize) || 0
		};
		return {
			surface: 'terrain',
			foundationId: null,
			gridPoint,
			y: this.pointElevation('terrain', null, gridPoint)
		};
	}

	/**
	 * A clicked point's base elevation. Terrain: the ground (or a foundation top) under it. Building:
	 * the storey's floor, raised to a stair tread when one is under the point — unless the base mode
	 * is forced flat.
	 */
	private pointElevation(
		surface: DrawSurface,
		foundationId: string | null,
		point: BuildingGridPoint,
		levelBaseY = this.levelBaseY
	): number {
		const { sampleSurface, sampleTerrain } = this.options;
		if (surface === 'terrain') {
			const x = point.gridX * this.gridSize;
			const z = point.gridZ * this.gridSize;
			return sampleSurface(x, z, sampleTerrain(x, z) + 0.05);
		}
		const foundation = foundationId
			? this.options.foundationManager.getFoundation(foundationId)
			: undefined;
		if (!foundation || this.settings.barrier.baseMode === 'flat') return levelBaseY;
		const frame = foundationLocalFrame(foundation, this.vertexSpacing());
		const reach = this.settings.defaultStoreyHeight * 0.98;
		const world = sampleSurface(
			frame.originWorldX + point.gridX * this.gridSize,
			frame.originWorldZ + point.gridZ * this.gridSize,
			frame.originWorldY + levelBaseY + reach
		);
		const local = world - frame.originWorldY;
		return local > levelBaseY + 0.02 && local < levelBaseY + reach ? local : levelBaseY;
	}

	// ------------------------------------------------------------------------------- the path

	private pathPoints(extra?: HoverTarget): BarrierPathPoint[] {
		const grid = this.gridSize;
		const points = this.points.map((p, i) => ({
			x: p.gridX * grid,
			y: this.pointYs[i],
			z: p.gridZ * grid
		}));
		if (extra)
			points.push({ x: extra.gridPoint.gridX * grid, y: extra.y, z: extra.gridPoint.gridZ * grid });
		return points;
	}

	private resolvedBaseMode(points: readonly BarrierPathPoint[]): BarrierBaseMode {
		const setting = this.settings.barrier.baseMode;
		if (setting !== 'auto') return setting;
		if (this.surface === 'terrain') return 'follow-surface';
		const ys = points.map((p) => p.y);
		return Math.max(...ys) - Math.min(...ys) > 0.01 ? 'linear-slope' : 'flat';
	}

	private checkHover(): { valid: boolean; closing: boolean; reason?: string } {
		const hover = this.hover;
		if (!hover) return { valid: false, closing: false, reason: 'Look at the ground or a floor' };
		if (!this.drawing) return { valid: true, closing: false };
		if (hover.surface !== this.surface || hover.foundationId !== this.foundationId)
			return {
				valid: false,
				closing: false,
				reason:
					this.surface === 'foundation'
						? 'Must stay on the same building'
						: 'Must stay on the ground'
			};
		const first = this.points[0];
		const closing =
			this.points.length >= 3 &&
			hover.gridPoint.gridX === first.gridX &&
			hover.gridPoint.gridZ === first.gridZ;
		const last = this.points[this.points.length - 1];
		if (!closing && hover.gridPoint.gridX === last.gridX && hover.gridPoint.gridZ === last.gridZ)
			return { valid: false, closing: false, reason: 'Same as the last point' };
		if (!closing && this.points.length >= BARRIER_MAX_POINTS)
			return { valid: false, closing: false, reason: `At most ${BARRIER_MAX_POINTS} points` };
		const grid = this.gridSize;
		const length = Math.hypot(
			(hover.gridPoint.gridX - last.gridX) * grid,
			(hover.gridPoint.gridZ - last.gridZ) * grid
		);
		const style = sanitizeBarrierStyle(this.settings.barrier.style);
		const minimum = Math.max(BARRIER_MIN_SEGMENT_LENGTH, style.endPost.width * 1.5);
		if (length < minimum) return { valid: false, closing, reason: 'Too short for this style' };
		if (length > BARRIER_MAX_SEGMENT_LENGTH)
			return {
				valid: false,
				closing,
				reason: `Segments are at most ${BARRIER_MAX_SEGMENT_LENGTH} m — click to add a corner`
			};
		const plan = [...this.points, hover.gridPoint].map((p) => ({ x: p.gridX, z: p.gridZ }));
		if (closing) {
			if (pathSelfIntersects(plan.slice(0, -1), true))
				return { valid: false, closing, reason: 'Fence would cross itself' };
		} else if (pathSelfIntersects(plan, false)) {
			return { valid: false, closing, reason: 'Fence would cross itself' };
		}
		return { valid: true, closing };
	}

	private finish(closed: boolean): void {
		if (!this.drawing || this.points.length < 2 || (closed && this.points.length < 3)) return;
		const points = this.pathPoints();
		const draft = this.settings.barrier;
		const definition: BarrierDefinition = {
			id: crypto.randomUUID(),
			type: draft.type,
			foundationId: this.surface === 'foundation' ? this.foundationId : null,
			points,
			closed,
			baseMode: this.resolvedBaseMode(points),
			style: cloneBarrierStyle(draft.style)
		};
		if (definition.foundationId) definition.levelIndex = this.levelIndex;
		if (!this.options.barrierManager.add(definition)) return;
		this.options.undoManager.record({ kind: 'barrier', barrierId: definition.id });
		this.resetPath();
		this.options.levelManager.unlockActiveFoundation();
		this.refresh();
	}

	private undoPoint(): void {
		if (this.points.length <= 1) {
			this.resetPath();
			this.options.levelManager.unlockActiveFoundation();
		} else {
			this.points.pop();
			this.pointYs.pop();
		}
		this.refresh();
	}

	private resetPath(): void {
		this.drawing = false;
		this.points = [];
		this.pointYs = [];
		this.foundationId = null;
	}

	private restyleAimed(): void {
		const draft = this.settings.barrier;
		if (this.aimedStairId && this.options.stairs) {
			this.options.stairs.restyle(this.aimedStairId, draft.style);
		} else if (this.aimedBarrierId) {
			this.options.barrierManager.restyle(this.aimedBarrierId, draft.style, draft.type);
		} else {
			return;
		}
		this.refresh();
	}

	private copyAimedStyle(): void {
		if (this.aimedStairId && this.options.stairs) {
			const style =
				this.options.stairs.getRailingStyle(this.aimedStairId) ?? defaultStairRailingStyle();
			this.settings.barrier.style = cloneBarrierStyle(style);
			this.settings.barrier.type = 'railing';
			this.refresh();
			return;
		}
		const definition = this.aimedBarrierId
			? this.options.barrierManager.get(this.aimedBarrierId)
			: undefined;
		if (!definition) return;
		this.settings.barrier.style = cloneBarrierStyle(definition.style);
		this.settings.barrier.type = definition.type;
		this.refresh();
	}

	// ------------------------------------------------------------------------------- visuals

	/** Barrier space → world offset for the current (or hovered) surface. */
	private frameOffset(foundationId: string | null): { x: number; y: number; z: number } | null {
		if (!foundationId) return { x: 0, y: 0, z: 0 };
		const foundation = this.options.foundationManager.getFoundation(foundationId);
		if (!foundation) return null;
		const frame = foundationLocalFrame(foundation, this.vertexSpacing());
		return { x: frame.originWorldX, y: frame.originWorldY, z: frame.originWorldZ };
	}

	private refresh(): void {
		const hover = this.hover;
		const check = this.checkHover();
		const color = check.valid || check.closing ? VALID_COLOR : INVALID_COLOR;
		this.updateMarkers(hover, color);
		this.updateGrid(hover);
		this.updateHighlight();
		if (this.drawing && hover && (check.valid || check.closing))
			this.updatePreview(hover, check.closing);
		else this.previewMesh.visible = false;
		this.options.onHudChange?.(this.hud(check));
	}

	private updateMarkers(hover: HoverTarget | null, color: number): void {
		const offset = hover ? this.frameOffset(hover.foundationId) : null;
		if (hover && offset) {
			this.hoverMarker.position.set(
				offset.x + hover.gridPoint.gridX * this.gridSize,
				offset.y + hover.y + 0.07,
				offset.z + hover.gridPoint.gridZ * this.gridSize
			);
			(this.hoverMarker.material as THREE.MeshBasicMaterial).color.setHex(color);
			this.hoverMarker.visible = true;
		} else {
			this.hoverMarker.visible = false;
		}
		const pathOffset = this.frameOffset(this.foundationId);
		this.pointMarkers.forEach((marker, i) => {
			const point = this.points[i];
			if (!point || !pathOffset || !this.drawing) {
				marker.visible = false;
				return;
			}
			marker.position.set(
				pathOffset.x + point.gridX * this.gridSize,
				pathOffset.y + this.pointYs[i] + 0.06,
				pathOffset.z + point.gridZ * this.gridSize
			);
			(marker.material as THREE.MeshBasicMaterial).color.setHex(
				i === 0 ? FIRST_POINT_COLOR : CONFIRMED_POINT_COLOR
			);
			marker.visible = true;
		});
	}

	/** A small patch of the building grid around the cursor (buildings only). */
	private updateGrid(hover: HoverTarget | null): void {
		if (!hover || hover.surface !== 'foundation' || !this.settings.showBuildingGrid) {
			this.gridPoints.visible = false;
			return;
		}
		const offset = this.frameOffset(hover.foundationId);
		const foundation = hover.foundationId
			? this.options.foundationManager.getFoundation(hover.foundationId)
			: undefined;
		if (!offset || !foundation) {
			this.gridPoints.visible = false;
			return;
		}
		const { width, depth } = foundationLocalSize(foundation, this.vertexSpacing());
		const maxX = Math.floor(width / this.gridSize + 1e-6);
		const maxZ = Math.floor(depth / this.gridSize + 1e-6);
		const levelY =
			offset.y +
			(this.drawing ? this.levelBaseY : this.currentLevel(hover.foundationId!).baseY) +
			0.02;
		const positions = this.gridGeometry.attributes.position.array as Float32Array;
		let count = 0;
		for (let dz = -GRID_PATCH_RADIUS; dz <= GRID_PATCH_RADIUS; dz++) {
			for (let dx = -GRID_PATCH_RADIUS; dx <= GRID_PATCH_RADIUS; dx++) {
				const gx = hover.gridPoint.gridX + dx;
				const gz = hover.gridPoint.gridZ + dz;
				if (gx < 0 || gz < 0 || gx > maxX || gz > maxZ) continue;
				positions.set(
					[offset.x + gx * this.gridSize, levelY, offset.z + gz * this.gridSize],
					count * 3
				);
				count++;
			}
		}
		this.gridGeometry.setDrawRange(0, count);
		this.gridGeometry.attributes.position.needsUpdate = true;
		(this.gridPoints.material as THREE.PointsMaterial).opacity = this.settings.buildingGridOpacity;
		this.gridPoints.visible = count > 0;
	}

	private updateHighlight(): void {
		const id = !this.drawing ? this.aimedBarrierId : null;
		if (id && this.options.barrierManager.getWorldBox(id, this.highlightBox)) {
			this.highlightBox.expandByScalar(0.03);
			this.highlight.visible = true;
		} else {
			this.highlight.visible = false;
		}
	}

	/**
	 * The real generator on the in-progress path (+ the hover point), at LOD 1 — or LOD 2 for long
	 * paths — so drawing never compiles hundreds of turned balusters per mouse move.
	 */
	private updatePreview(hover: HoverTarget, closing: boolean): void {
		const offset = this.frameOffset(this.foundationId);
		if (!offset) {
			this.previewMesh.visible = false;
			return;
		}
		const points = closing ? this.pathPoints() : this.pathPoints(hover);
		if (points.length < 2) {
			this.previewMesh.visible = false;
			return;
		}
		const style = sanitizeBarrierStyle(this.settings.barrier.style);
		const baseMode = this.resolvedBaseMode(points);
		const { sampleSurface, sampleTerrain } = this.options;
		const terrain = this.surface === 'terrain';
		const layout = layoutBarrier({
			points,
			closed: closing,
			baseMode,
			style,
			sampleBase: terrain ? (x, z) => sampleSurface(x, z, sampleTerrain(x, z) + 0.05) : undefined
		});
		const length = computePathLength(points, closing);
		const compiled = compileBarrierLevel(layout, style, {
			lod: length > DETAILED_PREVIEW_LENGTH ? 2 : 1,
			origin: points[0],
			seed: 1
		});
		this.previewMesh.geometry.dispose();
		compiled.accent?.dispose();
		this.previewMesh.geometry = compiled.main ?? new THREE.BufferGeometry();
		this.previewMesh.position.set(
			offset.x + points[0].x,
			offset.y + points[0].y,
			offset.z + points[0].z
		);
		this.previewMaterial.color.setHex(VALID_COLOR);
		this.previewMaterial.opacity = Math.max(0.35, this.settings.previewOpacity);
		this.previewMesh.visible = true;
	}

	// ------------------------------------------------------------------------------- HUD

	private levelUi(): BuildingLevelUiState | undefined {
		const id = this.foundationId ?? this.hover?.foundationId ?? null;
		return id ? this.options.levelManager.getLevelUiState(id) : undefined;
	}

	private hud(check: { valid: boolean; closing: boolean; reason?: string }): BuildUiState {
		const draft = this.settings.barrier;
		const presetName = getBarrierPreset(draft.style.presetId).name;
		const level = this.levelUi();
		const where =
			(this.drawing ? this.surface : this.hover?.surface) === 'foundation' && level
				? [level.displayName.toUpperCase(), `Elevation: ${level.baseY.toFixed(2)}m`]
				: this.hover || this.drawing
					? ['GROUND — posts follow the terrain']
					: ['Look at the ground or a floor'];
		const snap = snapModeLabel(this.snapMode);
		const lines = [...where, '', 'FENCE / RAILING', presetName, ''];
		if (!this.drawing) {
			lines.push('Click to start', ...(snap ? [snap] : []), 'B: Cycle snap', 'E: Customise');
			if (this.aimedBarrierId)
				lines.push('R: Apply these settings to this fence', 'Q: Copy its style');
			else if (this.aimedStairId)
				lines.push("R: Apply this style to the stair's railings", 'Q: Copy their style');
			return {
				toolId: 'barrier',
				snapMode: this.snapMode,
				level,
				crosshair: this.hover ? 'valid' : 'default',
				hintLines: lines
			};
		}
		const length = computePathLength(
			this.pathPoints().map((p) => ({ x: p.x, z: p.z })),
			false
		);
		lines.push(`Points: ${this.points.length}`, `Length: ${length.toFixed(2)}m`, '');
		if (!check.valid && !check.closing && check.reason) lines.push(check.reason, '');
		lines.push(
			...(snap ? [snap] : []),
			check.closing ? 'Click: Close loop' : 'Click: Add point',
			'Enter: Finish',
			'Backspace: Undo point',
			'B: Cycle snap',
			'E: Customise',
			'Right click: Cancel'
		);
		return {
			toolId: 'barrier',
			snapMode: this.snapMode,
			level,
			crosshair: check.valid || check.closing ? 'valid' : 'invalid',
			notice: !check.valid && !check.closing ? check.reason : undefined,
			hintLines: lines
		};
	}
}
