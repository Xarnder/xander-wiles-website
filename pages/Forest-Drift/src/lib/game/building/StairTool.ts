import * as THREE from 'three';
import type { BuildingLevelManager } from './BuildingLevelManager';
import type { BuildingLevelUiState } from './BuildingLevelTypes';
import { levelDisplayName } from './BuildingLevelTypes';
import type { BuildingManager } from './BuildingManager';
import type { BuildingGridPoint } from './FoundationLocalMath';
import {
	buildingGridToLocal,
	foundationLocalFrame,
	foundationLocalSize
} from './FoundationLocalMath';
import type { FoundationManager } from './FoundationManager';
import type { BuildingSettings, BuildUiState, StairToolState, ToolId } from './FoundationTypes';
import { raycastLevelConstructionPlane } from './foundationTopTargeting';
import { vertexSpacingFor } from './foundationMath';
import { pointInPolygon2D } from './slabMath';
import { buildStairGeometry } from './StairGeometryBuilder';
import {
	computeStairMetrics,
	cycleStairDirection,
	validDirectionsForFootprint,
	validateStairFootprint
} from './stairMath';
import type { StairDirection } from './StairTypes';
import type { TerrainSettings } from '../terrain/TerrainSettings';
import type { BuildTool } from './BuildToolManager';

const MAX_FULL_GRID_POINTS = 4096;
const FALLBACK_RADIUS_CELLS = 12;

const NEAREST_COLOR: readonly [number, number, number] = [1, 0.85, 0.2];
const FAR_COLOR: readonly [number, number, number] = [1, 0.6, 0.3];

const FIRST_CORNER_COLOR = 0xff9d4d;
/** Reserved specifically for "this footprint/height exactly reaches the ceiling above" — never used for merely-valid-but-not-matching placements, so green stays a meaningful, distinct signal. */
const HEIGHT_MATCH_COLOR = 0x39d353;
/** Valid, but not (yet) matching a detected ceiling above — or no ceiling exists there at all. */
const NEUTRAL_VALID_COLOR = 0x4da6ff;
const INVALID_COLOR = 0xff4d4d;
const BOTTOM_MARKER_COLOR = 0x4da6ff;
const TOP_MARKER_COLOR = 0xffcc33;
/** How close (world units) a candidate top elevation must be to a detected ceiling's underside — actually its top surface, since a flush transition means the topmost tread reaches the ceiling's own walkable surface — to count as "matching" for the green highlight. Half a typical minimum grid size, so it only lights up for a genuine match, not a near-miss. */
const HEIGHT_MATCH_TOLERANCE = 0.05;

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
	terrainSettings: TerrainSettings;
	buildingSettings: BuildingSettings;
	onHudChange?: (hud: BuildUiState | null) => void;
}

/**
 * The Stair Tool: a rectangular two-click footprint (mirrors FoundationTool) targeted on the
 * current building level's construction plane (mirrors SlabToolBase/WallTool — see
 * foundationTopTargeting.raycastLevelConstructionPlane), followed by a direction-selection step
 * (Left/Right Arrow cycles `StairDirection`, Enter or click confirms) — see the README's "Stairs"
 * section and StairTypes.ts/stairMath.ts for the underlying model.
 */
export class StairTool implements BuildTool {
	readonly toolId: ToolId = 'stairs';

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
	 * `findMatchingLevel`) — surfaced as a brief "Page Up: Build on {level}" idle-HUD hint so the
	 * obvious next step (moving up to build on what was just connected) doesn't require guessing.
	 * Cleared once the player's own current level for that foundation reaches or passes the target,
	 * or once a new stair placement begins.
	 */
	private lastStairTarget: { foundationId: string; levelIndex: number } | null = null;

	private hoverPoint: BuildingGridPoint | null = null;
	private lastGridX: number | null = null;
	private lastGridZ: number | null = null;
	private lastFoundationId: string | null = null;

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
		const hit = raycastLevelConstructionPlane(
			this.raycaster,
			this.foundationManager,
			this.levelManager,
			this.vertexSpacing(),
			this.buildingSettings.buildingGridSize
		);
		this.levelManager.reportHoveredFoundation(hit?.foundationId ?? null);

		if (!hit) {
			if (this.hoverPoint) {
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
			hit.foundationId === this.lastFoundationId
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
			this.activeLevelIndex = this.levelManager.getCurrentLevelIndex(this.foundationId!);
			this.activeBaseY = this.levelManager.getOrCreateLevel(
				this.foundationId!,
				this.activeLevelIndex
			).baseY;
			this.lastStairTarget = null;
			this.state = 'first-corner-selected';
			this.refreshVisuals();
			return;
		}

		if (this.state === 'first-corner-selected') {
			if (!this.firstCorner) return;
			this.secondCorner = this.hoverPoint;
			const footprint = this.normalizedFootprint();
			if (!footprint) return;
			const xCells = footprint.maxGridX - footprint.minGridX;
			const zCells = footprint.maxGridZ - footprint.minGridZ;
			const valid = validDirectionsForFootprint(xCells, zCells);
			this.direction = valid[0];
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
		const footprint = this.normalizedFootprint();
		if (!footprint) return;
		const xCells = footprint.maxGridX - footprint.minGridX;
		const zCells = footprint.maxGridZ - footprint.minGridZ;
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

	private normalizedFootprint(): {
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

	private confirmStair(): void {
		if (!this.foundationId) return;
		const footprint = this.normalizedFootprint();
		if (!footprint) return;

		const result = this.buildingManager.addStair({
			foundationId: this.foundationId,
			...footprint,
			baseY: this.activeBaseY,
			direction: this.direction,
			levelIndex: this.activeLevelIndex,
			gridSizeAtCreation: this.buildingSettings.buildingGridSize,
			minimumStairWidthCells: this.buildingSettings.minimumStairWidthCells,
			minimumStairRunCells: this.buildingSettings.minimumStairRunCells
		});
		if (!result.valid) return;

		const metrics = computeStairMetrics({
			...footprint,
			direction: this.direction,
			gridSizeAtCreation: this.buildingSettings.buildingGridSize,
			baseY: this.activeBaseY
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
			const footprint = this.normalizedFootprint();
			if (!footprint || !this.foundationId) {
				this.outline.visible = false;
				this.hidePreview();
				this.hideRoughBox();
				this.onHudChange?.(this.buildWaitingHud());
				return;
			}

			const xCells = footprint.maxGridX - footprint.minGridX;
			const zCells = footprint.maxGridZ - footprint.minGridZ;
			const runCells = Math.max(xCells, zCells);
			const estimatedTotalRise = runCells * this.buildingSettings.buildingGridSize;
			const estimatedTopLocalY = this.activeBaseY + estimatedTotalRise;
			const ceilingLocalY = this.ceilingAboveFootprint(this.foundationId, footprint);
			const matches =
				ceilingLocalY !== null &&
				Math.abs(estimatedTopLocalY - ceilingLocalY) <= HEIGHT_MATCH_TOLERANCE;

			this.hidePreview();
			this.updateOutline(
				this.foundationId,
				footprint,
				matches ? HEIGHT_MATCH_COLOR : NEUTRAL_VALID_COLOR
			);
			if (xCells > 0 && zCells > 0) {
				this.updateRoughBox(this.foundationId, footprint, estimatedTotalRise, matches);
			} else {
				this.hideRoughBox();
			}
			this.onHudChange?.(
				this.buildFootprintHud(footprint, estimatedTotalRise, ceilingLocalY, matches)
			);
			return;
		}

		// choosing-direction
		this.firstCornerMarker.visible = false;
		this.hideRoughBox();
		const footprint = this.normalizedFootprint();
		if (!footprint || !this.foundationId) {
			this.outline.visible = false;
			this.hidePreview();
			return;
		}

		const check = validateStairFootprint(
			footprint,
			this.direction,
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

		const metrics = computeStairMetrics({
			...footprint,
			direction: this.direction,
			gridSizeAtCreation: this.buildingSettings.buildingGridSize,
			baseY: this.activeBaseY
		});
		const ceilingLocalY = this.ceilingAboveFootprint(this.foundationId, footprint);
		const matches =
			ceilingLocalY !== null &&
			Math.abs(metrics.topLocalY - ceilingLocalY) <= HEIGHT_MATCH_TOLERANCE;

		this.updateOutline(
			this.foundationId,
			footprint,
			matches ? HEIGHT_MATCH_COLOR : NEUTRAL_VALID_COLOR
		);
		this.updateStairPreview(this.foundationId, footprint, matches);
		this.onHudChange?.(this.buildDirectionHud(metrics, ceilingLocalY, matches));
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
		this.firstCornerMarker.position.set(
			frame.originWorldX + this.firstCorner.gridX * buildingGridSize,
			frame.originWorldY + this.activeBaseY + 0.08,
			frame.originWorldZ + this.firstCorner.gridZ * buildingGridSize
		);
		this.firstCornerMarker.visible = true;
	}

	private updateOutline(
		foundationId: string,
		footprint: { minGridX: number; maxGridX: number; minGridZ: number; maxGridZ: number },
		color: number
	): void {
		const foundation = this.foundationManager.getFoundation(foundationId);
		if (!foundation) {
			this.outline.visible = false;
			return;
		}
		const frame = foundationLocalFrame(foundation, this.vertexSpacing());
		const buildingGridSize = this.buildingSettings.buildingGridSize;
		const lift = 0.06;
		const y = frame.originWorldY + this.activeBaseY + lift;
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
	 * scaled/positioned per frame, colored `HEIGHT_MATCH_COLOR` when `estimatedTotalRise` would land
	 * exactly on a detected ceiling above, `NEUTRAL_VALID_COLOR` otherwise.
	 */
	private updateRoughBox(
		foundationId: string,
		footprint: { minGridX: number; maxGridX: number; minGridZ: number; maxGridZ: number },
		estimatedTotalRise: number,
		matches: boolean
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
		const baseWorldY = frame.originWorldY + this.activeBaseY;

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
		this.roughBoxMaterial.color.setHex(matches ? HEIGHT_MATCH_COLOR : NEUTRAL_VALID_COLOR);
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
		matches: boolean
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
			baseY: this.activeBaseY
		});

		this.previewGeometry?.dispose();
		this.previewGeometry = buildStairGeometry(bounds, this.direction, this.activeBaseY, metrics);
		this.previewMesh.geometry = this.previewGeometry;
		this.previewMesh.position.set(frame.originWorldX, frame.originWorldY, frame.originWorldZ);
		this.previewMaterial.color.setHex(matches ? HEIGHT_MATCH_COLOR : NEUTRAL_VALID_COLOR);
		this.previewMaterial.opacity = this.buildingSettings.stairPreviewOpacity;
		this.previewMesh.visible = true;

		if (this.buildingSettings.showStairDirection) {
			const bottomLocal = this.directionEndpoint(bounds, false);
			const topLocal = this.directionEndpoint(bounds, true);
			this.bottomMarker.position.set(
				frame.originWorldX + bottomLocal.x,
				frame.originWorldY + this.activeBaseY + 0.15,
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

	private updateGridOverlay(foundationId: string, centerPoint: BuildingGridPoint): void {
		const foundation = this.foundationManager.getFoundation(foundationId);
		if (!foundation) {
			this.gridPoints.visible = false;
			return;
		}

		const spacing = this.vertexSpacing();
		const frame = foundationLocalFrame(foundation, spacing);
		const y = frame.originWorldY + this.activeBaseY;
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
			hintExtra.push('', `Page Up: Build on ${levelDisplayName(this.lastStairTarget.levelIndex)}`);
		}
		return {
			toolId: 'stairs',
			level,
			crosshair: this.hoverPoint ? 'valid' : 'default',
			hintLines: [
				level ? level.displayName.toUpperCase() : 'Look at a foundation',
				'',
				'STAIRS',
				'',
				'Click first corner',
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
				'Right click: Cancel'
			]
		};
	}

	private buildFootprintHud(
		footprint: { minGridX: number; maxGridX: number; minGridZ: number; maxGridZ: number },
		estimatedTotalRise: number,
		ceilingLocalY: number | null,
		matches: boolean
	): BuildUiState {
		const buildingGridSize = this.buildingSettings.buildingGridSize;
		const xCells = footprint.maxGridX - footprint.minGridX;
		const zCells = footprint.maxGridZ - footprint.minGridZ;
		const lines = [
			...this.activeLevelHudLines(),
			'',
			'STAIRS',
			'',
			`${(xCells * buildingGridSize).toFixed(2)}m × ${(zCells * buildingGridSize).toFixed(2)}m`,
			`Est. rise: ${estimatedTotalRise.toFixed(2)}m`
		];
		if (ceilingLocalY !== null) {
			lines.push(`Ceiling above: ${(ceilingLocalY - this.activeBaseY).toFixed(2)}m`);
			lines.push(matches ? 'Matches ceiling height!' : 'Drag to match ceiling height');
		}
		lines.push('', 'Click: Confirm footprint', 'Right click: Cancel');
		return {
			toolId: 'stairs',
			level: this.foundationId ? this.levelManager.getLevelUiState(this.foundationId) : undefined,
			crosshair: 'valid',
			hintLines: lines
		};
	}

	private buildDirectionHud(
		metrics: ReturnType<typeof computeStairMetrics>,
		ceilingLocalY: number | null,
		matches: boolean
	): BuildUiState {
		const targetLevel = this.findMatchingLevel(metrics.topLocalY);

		const lines = [
			...this.activeLevelHudLines(),
			'',
			'STAIRS',
			'',
			`Width: ${metrics.widthMeters.toFixed(2)}m`,
			`Run: ${metrics.runMeters.toFixed(2)}m`,
			`Steps: ${metrics.stepCount}`,
			`Rise per step: ${metrics.stepRise.toFixed(2)}m`,
			`Total rise: ${metrics.totalRise.toFixed(2)}m`,
			'',
			`Direction: ${this.direction.toUpperCase()}`
		];
		if (ceilingLocalY !== null) {
			lines.push(matches ? 'Matches ceiling above!' : 'Does not reach ceiling exactly');
		}
		if (targetLevel !== null) {
			lines.push(
				'Stairs connect:',
				`${levelDisplayName(this.activeLevelIndex)} → ${levelDisplayName(targetLevel)}`
			);
		} else {
			lines.push(`Top elevation: ${metrics.topLocalY.toFixed(2)}m`, 'No matching floor level');
		}
		lines.push('', '← / → Change direction', 'Enter / Click: Build', 'Right click: Cancel');
		return {
			toolId: 'stairs',
			level: this.foundationId ? this.levelManager.getLevelUiState(this.foundationId) : undefined,
			crosshair: 'valid',
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
