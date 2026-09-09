import * as THREE from 'three';
import {
	createActiveLevelWatch,
	pullActiveLevelChange,
	type BuildingLevelManager
} from './BuildingLevelManager';
import type { BuildingLevelUiState } from './BuildingLevelTypes';
import { levelDisplayName } from './BuildingLevelTypes';
import type { BuildingManager } from './BuildingManager';
import type { BuildingGridPoint } from './FoundationLocalMath';
import {
	buildingGridToLocal,
	foundationLocalFrame,
	foundationLocalSize,
	isBuildingGridPointInsideFoundation
} from './FoundationLocalMath';
import { colorMaterialFromHex } from './MaterialTypes';
import type { FoundationManager } from './FoundationManager';
import type { BuildingSettings, BuildUiState, StairToolState, ToolId } from './FoundationTypes';
import { raycastStairPlacement } from './foundationTopTargeting';
import { vertexSpacingFor } from './foundationMath';
import { pointInPolygon2D } from './slabMath';
import { buildStairGeometry } from './StairGeometryBuilder';
import {
	classifyStairPreviewFit,
	computeStairMetrics,
	cycleStairDirection,
	validDirectionsForFootprint,
	type StairPreviewFit
} from './stairMath';
import {
	approachStairBaseY,
	foundationGridCellCounts,
	MAX_STAIR_EXTERIOR_CELLS,
	snapStairFootprintToFoundation,
	stairBottomCenterLocal,
	validateStairFoundationPlacement
} from './stairPlacementMath';
import type { StairDirection } from './StairTypes';
import type { TerrainHeightSampler } from '../terrain/TerrainHeightSampler';
import type { TerrainSettings } from '../terrain/TerrainSettings';
import type { BuildTool } from './BuildToolManager';

const MAX_FULL_GRID_POINTS = 4096;
const FALLBACK_RADIUS_CELLS = 12;

const NEAREST_COLOR: readonly [number, number, number] = [1, 0.85, 0.2];
const FAR_COLOR: readonly [number, number, number] = [1, 0.6, 0.3];

const FIRST_CORNER_COLOR = 0xff9d4d;
/** Reserved specifically for "this footprint/height exactly reaches the ceiling above" — never used for merely-valid-but-not-matching placements, so green stays a meaningful, distinct signal. */
const HEIGHT_MATCH_COLOR = 0x39d353;
/** Footprint would overshoot the ceiling above — too long, and therefore too tall. */
const TOO_TALL_COLOR = 0x4da6ff;
/** Below the minimum cells, or too short to reach the ceiling above. */
const TOO_SMALL_COLOR = 0xff4d4d;
/** Valid size, but no slab above to judge height against. Distinct from too-tall blue. */
const NEUTRAL_VALID_COLOR = 0xc5ced8;
const INVALID_COLOR = TOO_SMALL_COLOR;
const BOTTOM_MARKER_COLOR = 0x4da6ff;
const TOP_MARKER_COLOR = 0xffcc33;
/** How close (world units) a candidate top elevation must be to a detected ceiling's underside — actually its top surface, since a flush transition means the topmost tread reaches the ceiling's own walkable surface — to count as "matching" for the green highlight. Half a typical minimum grid size, so it only lights up for a genuine match, not a near-miss. */
const HEIGHT_MATCH_TOLERANCE = 0.05;

function colorForPreviewFit(fit: StairPreviewFit): number {
	switch (fit) {
		case 'match':
			return HEIGHT_MATCH_COLOR;
		case 'too-small':
			return TOO_SMALL_COLOR;
		case 'too-tall':
			return TOO_TALL_COLOR;
		case 'neutral':
			return NEUTRAL_VALID_COLOR;
	}
}

const markerGeometry = new THREE.SphereGeometry(0.12, 10, 8);

function makeMarker(color: number): THREE.Mesh {
	const material = new THREE.MeshBasicMaterial({ color, depthTest: false });
	const mesh = new THREE.Mesh(markerGeometry, material);
	mesh.renderOrder = 10;
	mesh.visible = false;
	return mesh;
}

export interface StairToolOptions {
	scene: THREE.Scene;
	camera: THREE.PerspectiveCamera;
	foundationManager: FoundationManager;
	buildingManager: BuildingManager;
	levelManager: BuildingLevelManager;
	terrainHeightSampler: TerrainHeightSampler;
	getTerrainMeshes: () => readonly THREE.Object3D[];
	terrainSettings: TerrainSettings;
	buildingSettings: BuildingSettings;
	onHudChange?: (hud: BuildUiState | null) => void;
}

/**
 * The Stair Tool: a rectangular two-click footprint (mirrors FoundationTool) targeted on the
 * current building level's construction plane *or* the terrain beside a foundation (approach
 * stairs onto the pad — see stairPlacementMath.ts), followed by a direction-selection step
 * (Left/Right Arrow cycles `StairDirection`, Enter or click confirms).
 */
export class StairTool implements BuildTool {
	readonly toolId: ToolId = 'stairs';

	private readonly scene: THREE.Scene;
	private readonly camera: THREE.PerspectiveCamera;
	private readonly foundationManager: FoundationManager;
	private readonly buildingManager: BuildingManager;
	private readonly levelManager: BuildingLevelManager;
	private readonly terrainHeightSampler: TerrainHeightSampler;
	private readonly getTerrainMeshes: () => readonly THREE.Object3D[];
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
	private readonly outlineMaterial = new THREE.LineBasicMaterial({ color: NEUTRAL_VALID_COLOR });
	private readonly outline: THREE.LineSegments;

	private readonly firstCornerMarker = makeMarker(FIRST_CORNER_COLOR);
	private readonly bottomMarker = makeMarker(BOTTOM_MARKER_COLOR);
	private readonly topMarker = makeMarker(TOP_MARKER_COLOR);

	private readonly previewMaterial = new THREE.MeshStandardMaterial({
		color: NEUTRAL_VALID_COLOR,
		transparent: true,
		opacity: 0.55,
		depthWrite: false,
		side: THREE.DoubleSide
	});
	private previewGeometry: THREE.BufferGeometry | null = null;
	private readonly previewMesh: THREE.Mesh;

	/**
	 * Rough axis-aligned bounding box shown while choosing the second corner (before a direction —
	 * and therefore the real stepped geometry — even exists yet), so the player can judge roughly
	 * how tall the staircase will be without needing to commit to a footprint first. Height is
	 * estimated from the footprint's longer dimension (the eventual run axis, per
	 * `validDirectionsForFootprint`) at one grid cell of rise per cell of run — the same rule the
	 * real stair uses, just without needing a chosen `direction` yet. A single reused unit box
	 * (scaled/positioned per frame) rather than rebuilt geometry, since it changes every frame while
	 * dragging.
	 */
	private readonly roughBoxMaterial = new THREE.MeshStandardMaterial({
		color: NEUTRAL_VALID_COLOR,
		transparent: true,
		opacity: 0.35,
		depthWrite: false,
		side: THREE.DoubleSide
	});
	private readonly roughBoxMesh = new THREE.Mesh(
		new THREE.BoxGeometry(1, 1, 1),
		this.roughBoxMaterial
	);

	private active = false;
	private state: StairToolState = 'idle';
	private foundationId: string | null = null;
	private firstCorner: BuildingGridPoint | null = null;
	private secondCorner: BuildingGridPoint | null = null;
	private direction: StairDirection = '+x';
	private activeBaseY = 0;
	private activeLevelIndex = 0;

	/**
	 * Set once a confirmed stair's total rise lines up with a specific level (see
	 * `findMatchingLevel`) — surfaced as a brief "]: Build on {level}" idle-HUD hint so the
	 * obvious next step (moving up to build on what was just connected) doesn't require guessing.
	 * Cleared once the player's own current level for that foundation reaches or passes the target,
	 * or once a new stair placement begins.
	 */
	private lastStairTarget: { foundationId: string; levelIndex: number } | null = null;

	private hoverPoint: BuildingGridPoint | null = null;
	private lastGridX: number | null = null;
	private lastGridZ: number | null = null;
	private lastFoundationId: string | null = null;
	private readonly activeLevelWatch = createActiveLevelWatch();

	private readonly handleKeyDown = (event: KeyboardEvent) => {
		if (!this.active || this.state !== 'choosing-direction') return;
		if (event.code === 'ArrowLeft') {
			this.rotateDirection(-1);
		} else if (event.code === 'ArrowRight') {
			this.rotateDirection(1);
		} else if (event.code === 'Enter') {
			this.confirmStair();
		}
	};

	constructor(options: StairToolOptions) {
		this.scene = options.scene;
		this.camera = options.camera;
		this.foundationManager = options.foundationManager;
		this.buildingManager = options.buildingManager;
		this.levelManager = options.levelManager;
		this.terrainHeightSampler = options.terrainHeightSampler;
		this.getTerrainMeshes = options.getTerrainMeshes;
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
			new THREE.BufferAttribute(new Float32Array(24), 3)
		);
		this.outline = new THREE.LineSegments(this.outlineGeometry, this.outlineMaterial);
		this.outline.renderOrder = 6;
		this.outline.visible = false;

		this.previewMesh = new THREE.Mesh(new THREE.BufferGeometry(), this.previewMaterial);
		this.previewMesh.visible = false;
		this.roughBoxMesh.visible = false;

		this.overlayGroup.add(
			this.gridPoints,
			this.outline,
			this.firstCornerMarker,
			this.bottomMarker,
			this.topMarker,
			this.previewMesh,
			this.roughBoxMesh
		);
	}

	private vertexSpacing(): number {
		return vertexSpacingFor(this.terrainSettings.chunkSize, this.terrainSettings.chunkResolution);
	}

	/** The two translucent `MeshStandardMaterial` ghosts this tool shows while placing a staircase — exposed so the graphics pipeline can register them with the cascaded-shadow system alongside every other lit material (see GraphicsPipeline.registerMaterial's doc comment). */
	getPreviewMaterials(): THREE.Material[] {
		return [this.previewMaterial, this.roughBoxMaterial];
	}

	activate(): void {
		this.active = true;
		this.state = 'idle';
		this.foundationId = null;
		this.firstCorner = null;
		this.secondCorner = null;
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
		this.firstCorner = null;
		this.secondCorner = null;
		this.levelManager.unlockActiveFoundation();
		this.hideAllVisuals();
		this.scene.remove(this.overlayGroup);
		window.removeEventListener('keydown', this.handleKeyDown);
		this.onHudChange?.(null);
	}

	update(): void {
		if (!this.active || this.state === 'choosing-direction') return;

		this.raycaster.setFromCamera(this.screenCenter, this.camera);
		const hit = raycastStairPlacement(
			this.raycaster,
			this.foundationManager,
			this.levelManager,
			this.vertexSpacing(),
			this.buildingSettings.buildingGridSize,
			this.getTerrainMeshes()
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

		if (this.state === 'first-corner-selected' && hit.foundationId !== this.foundationId) return;

		if (
			this.hoverPoint &&
			hit.gridPoint.gridX === this.lastGridX &&
			hit.gridPoint.gridZ === this.lastGridZ &&
			hit.foundationId === this.lastFoundationId &&
			!levelChanged
		) {
			return;
		}

		this.lastGridX = hit.gridPoint.gridX;
		this.lastGridZ = hit.gridPoint.gridZ;
		this.lastFoundationId = hit.foundationId;
		this.hoverPoint = hit.gridPoint;
		this.refreshVisuals();
	}

	onPrimaryAction(): void {
		if (!this.active || !this.hoverPoint) return;

		if (this.state === 'idle') {
			this.foundationId = this.lastFoundationId;
			this.levelManager.lockActiveFoundation(this.foundationId!);
			this.firstCorner = this.hoverPoint;
			const foundation = this.foundationManager.getFoundation(this.foundationId!);
			if (foundation && this.isHoverInsideFoundation(foundation, this.hoverPoint)) {
				this.activeLevelIndex = this.levelManager.getCurrentLevelIndex(this.foundationId!);
				this.activeBaseY = this.levelManager.getOrCreateLevel(
					this.foundationId!,
					this.activeLevelIndex
				).baseY;
			} else {
				this.activeLevelIndex = 0;
				this.activeBaseY = foundation
					? this.terrainHeightSampler.sample(
							this.worldXzForGrid(foundation, this.hoverPoint).x,
							this.worldXzForGrid(foundation, this.hoverPoint).z
						) - foundation.topY
					: 0;
			}
			this.lastStairTarget = null;
			this.state = 'first-corner-selected';
			this.refreshVisuals();
			return;
		}

		if (this.state === 'first-corner-selected') {
			if (!this.firstCorner) return;
			const placement = this.snappedPlacement();
			if (!placement) return;
			this.firstCorner = {
				gridX: placement.footprint.minGridX,
				gridZ: placement.footprint.minGridZ
			};
			this.secondCorner = {
				gridX: placement.footprint.maxGridX,
				gridZ: placement.footprint.maxGridZ
			};
			const xCells = placement.footprint.maxGridX - placement.footprint.minGridX;
			const zCells = placement.footprint.maxGridZ - placement.footprint.minGridZ;
			this.direction = placement.approach ?? validDirectionsForFootprint(xCells, zCells)[0];
			this.state = 'choosing-direction';
			this.refreshVisuals();
			return;
		}

		if (this.state === 'choosing-direction') {
			this.confirmStair();
		}
	}

	onSecondaryAction(): void {
		if (!this.active || this.state === 'idle') return;
		this.state = 'idle';
		this.foundationId = null;
		this.firstCorner = null;
		this.secondCorner = null;
		this.levelManager.unlockActiveFoundation();
		this.refreshVisuals();
	}

	private rotateDirection(delta: 1 | -1): void {
		const placement = this.snappedPlacement();
		if (!placement) return;
		if (placement.approach) return;
		const xCells = placement.footprint.maxGridX - placement.footprint.minGridX;
		const zCells = placement.footprint.maxGridZ - placement.footprint.minGridZ;
		this.direction = cycleStairDirection(this.direction, xCells, zCells, delta);
		this.refreshVisuals();
	}

	/**
	 * The lowest slab on `foundationId` that (a) is above `aboveLocalY` and (b) whose polygon
	 * contains the given foundation-local point — i.e. "the ceiling directly above here, if any",
	 * used purely for the live height-matching preview below. Deliberately checks real placed slabs
	 * (via `BuildingManager.getSlabsForFoundation`), not the abstract level system, so it reflects
	 * what's actually built rather than just where a level's nominal wall height would put a floor.
	 */
	private findCeilingLocalYAbove(
		foundationId: string,
		localX: number,
		localZ: number,
		aboveLocalY: number
	): number | null {
		const buildingGridSize = this.buildingSettings.buildingGridSize;
		const point = { x: localX, z: localZ };
		let best: number | null = null;
		for (const slab of this.buildingManager.getSlabsForFoundation(foundationId)) {
			if (slab.localY <= aboveLocalY) continue;
			const polygon = slab.points.map((p) => {
				const local = buildingGridToLocal(p, buildingGridSize);
				return { x: local.localX, z: local.localZ };
			});
			if (!pointInPolygon2D(point, polygon)) continue;
			if (best === null || slab.localY < best) best = slab.localY;
		}
		return best;
	}

	/** Foundation-local centre of a footprint, used to sample `findCeilingLocalYAbove` at a single representative point rather than every grid cell the stair covers. */
	private footprintCenterLocal(footprint: {
		minGridX: number;
		maxGridX: number;
		minGridZ: number;
		maxGridZ: number;
	}): { x: number; z: number } {
		const buildingGridSize = this.buildingSettings.buildingGridSize;
		return {
			x: ((footprint.minGridX + footprint.maxGridX) / 2) * buildingGridSize,
			z: ((footprint.minGridZ + footprint.maxGridZ) / 2) * buildingGridSize
		};
	}

	private rawFootprint(): {
		minGridX: number;
		maxGridX: number;
		minGridZ: number;
		maxGridZ: number;
	} | null {
		const a = this.firstCorner;
		const b = this.state === 'first-corner-selected' ? this.hoverPoint : this.secondCorner;
		if (!a || !b) return null;
		return {
			minGridX: Math.min(a.gridX, b.gridX),
			maxGridX: Math.max(a.gridX, b.gridX),
			minGridZ: Math.min(a.gridZ, b.gridZ),
			maxGridZ: Math.max(a.gridZ, b.gridZ)
		};
	}

	private snappedPlacement(): {
		footprint: {
			minGridX: number;
			maxGridX: number;
			minGridZ: number;
			maxGridZ: number;
		};
		approach: StairDirection | null;
	} | null {
		const raw = this.rawFootprint();
		if (!raw || !this.foundationId) return null;
		const foundation = this.foundationManager.getFoundation(this.foundationId);
		if (!foundation) return null;
		const { width, depth } = foundationLocalSize(foundation, this.vertexSpacing());
		const { cellsX, cellsZ } = foundationGridCellCounts(
			width,
			depth,
			this.buildingSettings.buildingGridSize
		);
		return snapStairFootprintToFoundation(raw, cellsX, cellsZ);
	}

	private normalizedFootprint(): {
		minGridX: number;
		maxGridX: number;
		minGridZ: number;
		maxGridZ: number;
	} | null {
		return this.snappedPlacement()?.footprint ?? null;
	}

	private isHoverInsideFoundation(
		foundation: Parameters<typeof foundationLocalSize>[0],
		point: BuildingGridPoint
	): boolean {
		const { width, depth } = foundationLocalSize(foundation, this.vertexSpacing());
		return isBuildingGridPointInsideFoundation(
			point,
			this.buildingSettings.buildingGridSize,
			width,
			depth
		);
	}

	private worldXzForGrid(
		foundation: Parameters<typeof foundationLocalFrame>[0],
		point: BuildingGridPoint
	): { x: number; z: number } {
		const frame = foundationLocalFrame(foundation, this.vertexSpacing());
		const buildingGridSize = this.buildingSettings.buildingGridSize;
		return {
			x: frame.originWorldX + point.gridX * buildingGridSize,
			z: frame.originWorldZ + point.gridZ * buildingGridSize
		};
	}

	private placementBaseY(
		foundationId: string,
		footprint: {
			minGridX: number;
			maxGridX: number;
			minGridZ: number;
			maxGridZ: number;
		},
		approach: StairDirection | null,
		direction: StairDirection
	): number {
		if (!approach) return this.activeBaseY;
		const foundation = this.foundationManager.getFoundation(foundationId);
		if (!foundation) return this.activeBaseY;
		const local = stairBottomCenterLocal(
			footprint,
			direction,
			this.buildingSettings.buildingGridSize
		);
		const frame = foundationLocalFrame(foundation, this.vertexSpacing());
		const bottomY = this.terrainHeightSampler.sample(
			frame.originWorldX + local.x,
			frame.originWorldZ + local.z
		);
		return approachStairBaseY(bottomY, foundation.topY);
	}

	private confirmStair(): void {
		if (!this.foundationId) return;
		const placement = this.snappedPlacement();
		if (!placement) return;
		const { footprint, approach } = placement;
		const direction = approach ?? this.direction;
		const baseY = this.placementBaseY(this.foundationId, footprint, approach, direction);
		const levelIndex = approach ? 0 : this.activeLevelIndex;

		const result = this.buildingManager.addStair({
			foundationId: this.foundationId,
			...footprint,
			baseY,
			direction,
			levelIndex,
			gridSizeAtCreation: this.buildingSettings.buildingGridSize,
			minimumStairWidthCells: this.buildingSettings.minimumStairWidthCells,
			minimumStairRunCells: this.buildingSettings.minimumStairRunCells,
			material: colorMaterialFromHex(this.buildingSettings.stairColor),
			frameEnabled: this.buildingSettings.stairFrameEnabled,
			railingsEnabled: this.buildingSettings.stairRailingsEnabled,
			openingEnabled: this.buildingSettings.stairOpeningEnabled,
			openingFrameEnabled: this.buildingSettings.slabOpeningFrameEnabled
		});
		if (!result.valid) return;

		const metrics = computeStairMetrics({
			...footprint,
			direction,
			gridSizeAtCreation: this.buildingSettings.buildingGridSize,
			baseY
		});
		const targetLevel = this.findMatchingLevel(metrics.topLocalY);
		this.lastStairTarget =
			targetLevel !== null ? { foundationId: this.foundationId, levelIndex: targetLevel } : null;

		this.state = 'idle';
		this.foundationId = null;
		this.firstCorner = null;
		this.secondCorner = null;
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
			this.firstCornerMarker.visible = false;
			this.hidePreview();
			if (
				this.lastStairTarget &&
				this.levelManager.getCurrentLevelIndex(this.lastStairTarget.foundationId) >=
					this.lastStairTarget.levelIndex
			) {
				// The player already moved up to (or past) the level these stairs reach — the hint has
				// served its purpose.
				this.lastStairTarget = null;
			}
			this.onHudChange?.(this.buildIdleHud());
			return;
		}

		if (this.state === 'first-corner-selected') {
			this.updateCornerMarker();
			const placement = this.snappedPlacement();
			const footprint = placement?.footprint;
			if (!footprint || !this.foundationId || !placement) {
				this.outline.visible = false;
				this.hidePreview();
				this.hideRoughBox();
				this.onHudChange?.(this.buildWaitingHud());
				return;
			}

			const xCells = footprint.maxGridX - footprint.minGridX;
			const zCells = footprint.maxGridZ - footprint.minGridZ;
			const direction = placement.approach ?? this.direction;
			const runCells = placement.approach
				? placement.approach === '+x' || placement.approach === '-x'
					? xCells
					: zCells
				: Math.max(xCells, zCells);
			const widthCells = placement.approach
				? placement.approach === '+x' || placement.approach === '-x'
					? zCells
					: xCells
				: Math.min(xCells, zCells);
			const estimatedTotalRise = runCells * this.buildingSettings.buildingGridSize;
			const baseY = this.placementBaseY(
				this.foundationId,
				footprint,
				placement.approach,
				direction
			);
			const estimatedTopLocalY = baseY + estimatedTotalRise;
			const ceilingLocalY = placement.approach
				? 0
				: this.ceilingAboveFootprint(this.foundationId, footprint);
			const fit = classifyStairPreviewFit({
				xCells,
				zCells,
				runCells,
				widthCells,
				estimatedTopLocalY,
				ceilingLocalY,
				minimumWidthCells: this.buildingSettings.minimumStairWidthCells,
				minimumRunCells: this.buildingSettings.minimumStairRunCells,
				heightMatchTolerance: HEIGHT_MATCH_TOLERANCE
			});

			this.hidePreview();
			this.updateOutline(this.foundationId, footprint, colorForPreviewFit(fit), baseY);
			if (xCells > 0 && zCells > 0) {
				this.updateRoughBox(this.foundationId, footprint, estimatedTotalRise, fit, baseY);
			} else {
				this.hideRoughBox();
			}
			this.onHudChange?.(
				this.buildFootprintHud(
					footprint,
					estimatedTotalRise,
					ceilingLocalY,
					fit,
					placement.approach
				)
			);
			return;
		}

		// choosing-direction
		this.firstCornerMarker.visible = false;
		this.hideRoughBox();
		const placement = this.snappedPlacement();
		const footprint = placement?.footprint;
		if (!footprint || !this.foundationId || !placement) {
			this.outline.visible = false;
			this.hidePreview();
			return;
		}

		const foundation = this.foundationManager.getFoundation(this.foundationId);
		if (!foundation) {
			this.outline.visible = false;
			this.hidePreview();
			return;
		}
		const { width, depth } = foundationLocalSize(foundation, this.vertexSpacing());
		const { cellsX, cellsZ } = foundationGridCellCounts(
			width,
			depth,
			this.buildingSettings.buildingGridSize
		);
		const check = validateStairFoundationPlacement(
			footprint,
			this.direction,
			cellsX,
			cellsZ,
			this.buildingSettings.minimumStairWidthCells,
			this.buildingSettings.minimumStairRunCells
		);

		if (!check.valid) {
			this.updateOutline(this.foundationId, footprint, INVALID_COLOR);
			this.hidePreview();
			this.bottomMarker.visible = false;
			this.topMarker.visible = false;
			this.onHudChange?.(this.buildInvalidDirectionHud(check.reason ?? 'Invalid stair'));
			return;
		}

		const baseY = this.placementBaseY(
			this.foundationId,
			footprint,
			placement.approach,
			this.direction
		);
		const metrics = computeStairMetrics({
			...footprint,
			direction: this.direction,
			gridSizeAtCreation: this.buildingSettings.buildingGridSize,
			baseY
		});
		const ceilingLocalY = placement.approach
			? 0
			: this.ceilingAboveFootprint(this.foundationId, footprint);
		const xCells = footprint.maxGridX - footprint.minGridX;
		const zCells = footprint.maxGridZ - footprint.minGridZ;
		const fit = classifyStairPreviewFit({
			xCells,
			zCells,
			runCells: metrics.runCells,
			widthCells: metrics.widthCells,
			estimatedTopLocalY: metrics.topLocalY,
			ceilingLocalY,
			minimumWidthCells: this.buildingSettings.minimumStairWidthCells,
			minimumRunCells: this.buildingSettings.minimumStairRunCells,
			heightMatchTolerance: HEIGHT_MATCH_TOLERANCE
		});

		this.updateOutline(this.foundationId, footprint, colorForPreviewFit(fit), baseY);
		this.updateStairPreview(this.foundationId, footprint, fit, baseY);
		this.onHudChange?.(this.buildDirectionHud(metrics, ceilingLocalY, fit, placement.approach));
	}

	/** The ceiling/floor slab directly above a footprint's centre point, at the tool's current active elevation — see `findCeilingLocalYAbove`. */
	private ceilingAboveFootprint(
		foundationId: string,
		footprint: { minGridX: number; maxGridX: number; minGridZ: number; maxGridZ: number }
	): number | null {
		const center = this.footprintCenterLocal(footprint);
		return this.findCeilingLocalYAbove(foundationId, center.x, center.z, this.activeBaseY);
	}

	private updateCornerMarker(): void {
		if (!this.firstCorner || !this.foundationId) {
			this.firstCornerMarker.visible = false;
			return;
		}
		const foundation = this.foundationManager.getFoundation(this.foundationId);
		if (!foundation) {
			this.firstCornerMarker.visible = false;
			return;
		}
		const frame = foundationLocalFrame(foundation, this.vertexSpacing());
		const buildingGridSize = this.buildingSettings.buildingGridSize;
		const markerY = this.isHoverInsideFoundation(foundation, this.firstCorner)
			? frame.originWorldY + this.activeBaseY + 0.08
			: this.terrainHeightSampler.sample(
					frame.originWorldX + this.firstCorner.gridX * buildingGridSize,
					frame.originWorldZ + this.firstCorner.gridZ * buildingGridSize
				) + 0.08;
		this.firstCornerMarker.position.set(
			frame.originWorldX + this.firstCorner.gridX * buildingGridSize,
			markerY,
			frame.originWorldZ + this.firstCorner.gridZ * buildingGridSize
		);
		this.firstCornerMarker.visible = true;
	}

	private updateOutline(
		foundationId: string,
		footprint: { minGridX: number; maxGridX: number; minGridZ: number; maxGridZ: number },
		color: number,
		baseY = this.activeBaseY
	): void {
		const foundation = this.foundationManager.getFoundation(foundationId);
		if (!foundation) {
			this.outline.visible = false;
			return;
		}
		const frame = foundationLocalFrame(foundation, this.vertexSpacing());
		const buildingGridSize = this.buildingSettings.buildingGridSize;
		const lift = 0.06;
		const y = frame.originWorldY + baseY + lift;
		const minX = frame.originWorldX + footprint.minGridX * buildingGridSize;
		const maxX = frame.originWorldX + footprint.maxGridX * buildingGridSize;
		const minZ = frame.originWorldZ + footprint.minGridZ * buildingGridSize;
		const maxZ = frame.originWorldZ + footprint.maxGridZ * buildingGridSize;

		const corners: [number, number][] = [
			[minX, minZ],
			[maxX, minZ],
			[maxX, maxZ],
			[minX, maxZ]
		];
		const positions = this.outlineGeometry.attributes.position.array as Float32Array;
		let i = 0;
		for (let c = 0; c < 4; c++) {
			const [x0, z0] = corners[c];
			const [x1, z1] = corners[(c + 1) % 4];
			positions[i++] = x0;
			positions[i++] = y;
			positions[i++] = z0;
			positions[i++] = x1;
			positions[i++] = y;
			positions[i++] = z1;
		}
		this.outlineGeometry.attributes.position.needsUpdate = true;
		this.outlineMaterial.color.setHex(color);
		this.outline.visible = true;
	}

	/**
	 * Rough estimated bounding box shown while choosing the second corner — before a `direction`
	 * (and therefore the real stepped geometry) exists — so the player can judge roughly how tall
	 * the staircase will be without committing to a footprint first. A single reused unit box,
	 * scaled/positioned per frame, colored from `classifyStairPreviewFit` (green = lands on the
	 * ceiling, red = too small, blue = too long / too tall).
	 */
	private updateRoughBox(
		foundationId: string,
		footprint: { minGridX: number; maxGridX: number; minGridZ: number; maxGridZ: number },
		estimatedTotalRise: number,
		fit: StairPreviewFit,
		baseY = this.activeBaseY
	): void {
		const foundation = this.foundationManager.getFoundation(foundationId);
		if (!foundation) {
			this.hideRoughBox();
			return;
		}
		const frame = foundationLocalFrame(foundation, this.vertexSpacing());
		const buildingGridSize = this.buildingSettings.buildingGridSize;
		const minX = frame.originWorldX + footprint.minGridX * buildingGridSize;
		const maxX = frame.originWorldX + footprint.maxGridX * buildingGridSize;
		const minZ = frame.originWorldZ + footprint.minGridZ * buildingGridSize;
		const maxZ = frame.originWorldZ + footprint.maxGridZ * buildingGridSize;
		const baseWorldY = frame.originWorldY + baseY;

		this.roughBoxMesh.scale.set(
			Math.max(maxX - minX, 0.01),
			Math.max(estimatedTotalRise, 0.01),
			Math.max(maxZ - minZ, 0.01)
		);
		this.roughBoxMesh.position.set(
			(minX + maxX) / 2,
			baseWorldY + estimatedTotalRise / 2,
			(minZ + maxZ) / 2
		);
		this.roughBoxMaterial.color.setHex(colorForPreviewFit(fit));
		// Slightly lighter than the real stepped preview, since this is only a rough estimate.
		this.roughBoxMaterial.opacity = this.buildingSettings.stairPreviewOpacity * 0.7;
		this.roughBoxMesh.visible = true;
	}

	private hideRoughBox(): void {
		this.roughBoxMesh.visible = false;
	}

	private updateStairPreview(
		foundationId: string,
		footprint: { minGridX: number; maxGridX: number; minGridZ: number; maxGridZ: number },
		fit: StairPreviewFit,
		baseY = this.activeBaseY
	): void {
		const foundation = this.foundationManager.getFoundation(foundationId);
		if (!foundation) {
			this.hidePreview();
			return;
		}
		const frame = foundationLocalFrame(foundation, this.vertexSpacing());
		const buildingGridSize = this.buildingSettings.buildingGridSize;
		const bounds = {
			minLocalX: footprint.minGridX * buildingGridSize,
			maxLocalX: footprint.maxGridX * buildingGridSize,
			minLocalZ: footprint.minGridZ * buildingGridSize,
			maxLocalZ: footprint.maxGridZ * buildingGridSize
		};
		const metrics = computeStairMetrics({
			...footprint,
			direction: this.direction,
			gridSizeAtCreation: buildingGridSize,
			baseY
		});

		this.previewGeometry?.dispose();
		this.previewGeometry = buildStairGeometry(bounds, this.direction, baseY, metrics);
		this.previewMesh.geometry = this.previewGeometry;
		this.previewMesh.position.set(frame.originWorldX, frame.originWorldY, frame.originWorldZ);
		this.previewMaterial.color.setHex(colorForPreviewFit(fit));
		this.previewMaterial.opacity = this.buildingSettings.stairPreviewOpacity;
		this.previewMesh.visible = true;

		if (this.buildingSettings.showStairDirection) {
			const bottomLocal = this.directionEndpoint(bounds, false);
			const topLocal = this.directionEndpoint(bounds, true);
			this.bottomMarker.position.set(
				frame.originWorldX + bottomLocal.x,
				frame.originWorldY + baseY + 0.15,
				frame.originWorldZ + bottomLocal.z
			);
			this.topMarker.position.set(
				frame.originWorldX + topLocal.x,
				frame.originWorldY + metrics.topLocalY + 0.15,
				frame.originWorldZ + topLocal.z
			);
			this.bottomMarker.visible = true;
			this.topMarker.visible = true;
		} else {
			this.bottomMarker.visible = false;
			this.topMarker.visible = false;
		}
	}

	private directionEndpoint(
		bounds: { minLocalX: number; maxLocalX: number; minLocalZ: number; maxLocalZ: number },
		top: boolean
	): { x: number; z: number } {
		const midX = (bounds.minLocalX + bounds.maxLocalX) / 2;
		const midZ = (bounds.minLocalZ + bounds.maxLocalZ) / 2;
		switch (this.direction) {
			case '+x':
				return { x: top ? bounds.maxLocalX : bounds.minLocalX, z: midZ };
			case '-x':
				return { x: top ? bounds.minLocalX : bounds.maxLocalX, z: midZ };
			case '+z':
				return { x: midX, z: top ? bounds.maxLocalZ : bounds.minLocalZ };
			case '-z':
				return { x: midX, z: top ? bounds.minLocalZ : bounds.maxLocalZ };
		}
	}

	private hidePreview(): void {
		this.previewMesh.visible = false;
		this.bottomMarker.visible = false;
		this.topMarker.visible = false;
	}

	/** Live storey while idle (so the grid sits on the selected floor before the first click); frozen `activeBaseY` once a placement has started. */
	private previewBaseY(foundationId: string): number {
		if (this.state !== 'idle') return this.activeBaseY;
		return this.levelManager.getOrCreateLevel(
			foundationId,
			this.levelManager.getCurrentLevelIndex(foundationId)
		).baseY;
	}

	private updateGridOverlay(foundationId: string, centerPoint: BuildingGridPoint): void {
		const foundation = this.foundationManager.getFoundation(foundationId);
		if (!foundation) {
			this.gridPoints.visible = false;
			return;
		}

		const spacing = this.vertexSpacing();
		const frame = foundationLocalFrame(foundation, spacing);
		const buildingGridSize = this.buildingSettings.buildingGridSize;
		const { width, depth } = foundationLocalSize(foundation, spacing);

		const fullCellsX = Math.floor(width / buildingGridSize);
		const fullCellsZ = Math.floor(depth / buildingGridSize);
		const exteriorPad = Math.min(MAX_STAIR_EXTERIOR_CELLS, FALLBACK_RADIUS_CELLS);
		const paddedCount =
			(fullCellsX + 1 + exteriorPad * 2) * (fullCellsZ + 1 + exteriorPad * 2);

		let minGridX: number;
		let maxGridX: number;
		let minGridZ: number;
		let maxGridZ: number;
		if (paddedCount <= MAX_FULL_GRID_POINTS) {
			minGridX = -exteriorPad;
			maxGridX = fullCellsX + exteriorPad;
			minGridZ = -exteriorPad;
			maxGridZ = fullCellsZ + exteriorPad;
		} else {
			minGridX = centerPoint.gridX - FALLBACK_RADIUS_CELLS;
			maxGridX = centerPoint.gridX + FALLBACK_RADIUS_CELLS;
			minGridZ = centerPoint.gridZ - FALLBACK_RADIUS_CELLS;
			maxGridZ = centerPoint.gridZ + FALLBACK_RADIUS_CELLS;
		}

		let i = 0;
		const lift = 0.02;
		const interiorY = frame.originWorldY + this.previewBaseY(foundationId);
		for (let gz = minGridZ; gz <= maxGridZ && i < MAX_FULL_GRID_POINTS; gz++) {
			for (let gx = minGridX; gx <= maxGridX && i < MAX_FULL_GRID_POINTS; gx++) {
				const p = i * 3;
				const worldX = frame.originWorldX + gx * buildingGridSize;
				const worldZ = frame.originWorldZ + gz * buildingGridSize;
				const onPad = gx >= 0 && gx <= fullCellsX && gz >= 0 && gz <= fullCellsZ;
				this.gridPositions[p] = worldX;
				this.gridPositions[p + 1] =
					(onPad ? interiorY : this.terrainHeightSampler.sample(worldX, worldZ)) + lift;
				this.gridPositions[p + 2] = worldZ;

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
	}

	private hideAllVisuals(): void {
		this.gridPoints.visible = false;
		this.outline.visible = false;
		this.firstCornerMarker.visible = false;
		this.hidePreview();
		this.hideRoughBox();
	}

	/** The current level's UI state for `foundationId`, or the globally "active" foundation if none is given — `undefined` once no foundation has ever been targeted. See BuildUiState.level. */
	private currentLevelUiState(foundationId?: string): BuildingLevelUiState | undefined {
		const id = foundationId ?? this.levelManager.getActiveFoundationId() ?? undefined;
		return id ? this.levelManager.getLevelUiState(id) : undefined;
	}

	/** Frozen level info once a footprint is being placed — `activeLevelIndex`/`activeBaseY` were captured at the first click (see `onPrimaryAction`), so this stays fixed for the rest of the placement even if the player's live current level changes elsewhere. */
	private activeLevelHudLines(): string[] {
		return [
			levelDisplayName(this.activeLevelIndex).toUpperCase(),
			`Start elevation: ${this.activeBaseY.toFixed(2)}m`
		];
	}

	private buildIdleHud(): BuildUiState {
		const level = this.currentLevelUiState(this.lastFoundationId ?? undefined);
		const hintExtra: string[] = [];
		if (this.lastStairTarget) {
			hintExtra.push('', `]: Build on ${levelDisplayName(this.lastStairTarget.levelIndex)}`);
		}
		return {
			toolId: 'stairs',
			level,
			crosshair: this.hoverPoint ? 'valid' : 'default',
			hintLines: [
				level ? level.displayName.toUpperCase() : 'Look at a foundation or the ground beside it',
				'',
				'STAIRS',
				'',
				'Click first corner',
				'E customise',
				...hintExtra
			]
		};
	}

	private buildWaitingHud(): BuildUiState {
		return {
			toolId: 'stairs',
			level: this.foundationId ? this.levelManager.getLevelUiState(this.foundationId) : undefined,
			crosshair: 'default',
			hintLines: [
				...this.activeLevelHudLines(),
				'',
				'STAIRS',
				'',
				'Choose opposite corner',
				'E customise',
				'Right click: Cancel'
			]
		};
	}

	private buildFootprintHud(
		footprint: { minGridX: number; maxGridX: number; minGridZ: number; maxGridZ: number },
		estimatedTotalRise: number,
		ceilingLocalY: number | null,
		fit: StairPreviewFit,
		approach: StairDirection | null = null
	): BuildUiState {
		const buildingGridSize = this.buildingSettings.buildingGridSize;
		const xCells = footprint.maxGridX - footprint.minGridX;
		const zCells = footprint.maxGridZ - footprint.minGridZ;
		const lines = [
			...this.activeLevelHudLines(),
			'',
			approach ? 'STAIRS · Approach' : 'STAIRS',
			'',
			`${(xCells * buildingGridSize).toFixed(2)}m × ${(zCells * buildingGridSize).toFixed(2)}m`,
			`Est. rise: ${estimatedTotalRise.toFixed(2)}m`
		];
		const belowMinimums =
			Math.min(xCells, zCells) < this.buildingSettings.minimumStairWidthCells ||
			Math.max(xCells, zCells) < this.buildingSettings.minimumStairRunCells;
		if (approach && ceilingLocalY !== null) {
			const riseNeeded = ceilingLocalY - this.placementBaseY(
				this.foundationId!,
				footprint,
				approach,
				approach
			);
			lines.push(`Rise to foundation: ${Math.max(0, riseNeeded).toFixed(2)}m`);
			if (fit === 'match') lines.push('Matches foundation height!');
			else if (fit === 'too-tall') lines.push('Too long — stairs would overshoot the pad');
			else if (fit === 'too-small' && belowMinimums) {
				lines.push(
					`Too small — need at least ${this.buildingSettings.minimumStairWidthCells} × ${this.buildingSettings.minimumStairRunCells} cells`
				);
			} else if (fit === 'too-small') lines.push('Too short to reach the foundation');
			else lines.push('Drag to match foundation height');
		} else if (ceilingLocalY !== null) {
			lines.push(`Ceiling above: ${(ceilingLocalY - this.activeBaseY).toFixed(2)}m`);
			if (fit === 'match') lines.push('Matches ceiling height!');
			else if (fit === 'too-tall') lines.push('Too long — stairs would be too tall');
			else if (fit === 'too-small' && belowMinimums) {
				lines.push(
					`Too small — need at least ${this.buildingSettings.minimumStairWidthCells} × ${this.buildingSettings.minimumStairRunCells} cells`
				);
			} else if (fit === 'too-small') lines.push('Too short to reach ceiling');
			else lines.push('Drag to match ceiling height');
		} else if (fit === 'too-small') {
			lines.push(
				`Too small — need at least ${this.buildingSettings.minimumStairWidthCells} × ${this.buildingSettings.minimumStairRunCells} cells`
			);
		}
		lines.push('', 'Click: Confirm footprint', 'E customise', 'Right click: Cancel');
		return {
			toolId: 'stairs',
			level: this.foundationId ? this.levelManager.getLevelUiState(this.foundationId) : undefined,
			crosshair: fit === 'too-small' ? 'invalid' : 'valid',
			hintLines: lines
		};
	}

	private buildDirectionHud(
		metrics: ReturnType<typeof computeStairMetrics>,
		ceilingLocalY: number | null,
		fit: StairPreviewFit,
		approach: StairDirection | null = null
	): BuildUiState {
		const targetLevel = this.findMatchingLevel(metrics.topLocalY);

		const lines = [
			...this.activeLevelHudLines(),
			'',
			approach ? 'STAIRS · Approach' : 'STAIRS',
			'',
			`Width: ${metrics.widthMeters.toFixed(2)}m`,
			`Run: ${metrics.runMeters.toFixed(2)}m`,
			`Steps: ${metrics.stepCount}`,
			`Rise per step: ${metrics.stepRise.toFixed(2)}m`,
			`Total rise: ${metrics.totalRise.toFixed(2)}m`,
			'',
			`Direction: ${this.direction.toUpperCase()}`
		];
		if (approach && ceilingLocalY !== null) {
			if (fit === 'match') lines.push('Matches foundation height!');
			else if (fit === 'too-tall') lines.push('Too long — stairs would overshoot the pad');
			else if (fit === 'too-small') lines.push('Too short to reach the foundation');
			else lines.push('Does not reach the foundation exactly');
			lines.push('Climbs onto the foundation');
		} else if (ceilingLocalY !== null) {
			if (fit === 'match') lines.push('Matches ceiling above!');
			else if (fit === 'too-tall') lines.push('Too long — stairs would be too tall');
			else if (fit === 'too-small') lines.push('Too short to reach ceiling');
			else lines.push('Does not reach ceiling exactly');
		}
		if (!approach) {
			if (targetLevel !== null) {
				lines.push(
					'Stairs connect:',
					`${levelDisplayName(this.activeLevelIndex)} → ${levelDisplayName(targetLevel)}`
				);
			} else {
				lines.push(`Top elevation: ${metrics.topLocalY.toFixed(2)}m`, 'No matching floor level');
			}
			lines.push('', '← / → Change direction', 'Enter / Click: Build', 'E customise', 'Right click: Cancel');
		} else {
			lines.push('', 'Enter / Click: Build', 'E customise', 'Right click: Cancel');
		}
		return {
			toolId: 'stairs',
			level: this.foundationId ? this.levelManager.getLevelUiState(this.foundationId) : undefined,
			crosshair: fit === 'too-small' ? 'invalid' : 'valid',
			hintLines: lines
		};
	}

	private buildInvalidDirectionHud(reason: string): BuildUiState {
		return {
			toolId: 'stairs',
			level: this.foundationId ? this.levelManager.getLevelUiState(this.foundationId) : undefined,
			crosshair: 'invalid',
			hintLines: [
				...this.activeLevelHudLines(),
				'',
				'STAIRS',
				'',
				reason,
				'',
				'← / → Change direction',
				'Right click: Cancel'
			]
		};
	}

	/** Whether `topLocalY` lines up (within one grid increment) with an existing building level's baseY — purely informational, never forces a resize; see the README. */
	private findMatchingLevel(topLocalY: number): number | null {
		if (!this.foundationId) return null;
		const tolerance = this.buildingSettings.buildingGridSize;
		for (let index = 0; index <= this.activeLevelIndex + 4; index++) {
			const level = this.levelManager.getLevel(this.foundationId, index);
			if (level && Math.abs(level.baseY - topLocalY) <= tolerance) return index;
		}
		// The level the stair would newly reach, even if not created yet.
		const nextLevel = this.levelManager.getOrCreateLevel(this.foundationId, this.activeLevelIndex);
		if (Math.abs(nextLevel.baseY + nextLevel.wallHeight - topLocalY) <= tolerance) {
			return this.activeLevelIndex + 1;
		}
		return null;
	}

	dispose(): void {
		this.deactivate();
		this.gridGeometry.dispose();
		(this.gridPoints.material as THREE.Material).dispose();
		this.outlineGeometry.dispose();
		this.outlineMaterial.dispose();
		(this.firstCornerMarker.material as THREE.Material).dispose();
		(this.bottomMarker.material as THREE.Material).dispose();
		(this.topMarker.material as THREE.Material).dispose();
		this.previewGeometry?.dispose();
		this.previewMaterial.dispose();
		this.roughBoxMesh.geometry.dispose();
		this.roughBoxMaterial.dispose();
	}
}
