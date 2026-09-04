import * as THREE from 'three';
import { computeFoundationSelection, vertexSpacingFor, worldToGridCoord } from './foundationMath';
import type { FoundationManager } from './FoundationManager';
import type {
	BuildingSettings,
	BuildUiState,
	FoundationToolState,
	TerrainGridPoint,
	ToolId
} from './FoundationTypes';
import type { TerrainHeightSampler } from '../terrain/TerrainHeightSampler';
import type { TerrainSettings } from '../terrain/TerrainSettings';
import type { BuildTool } from './BuildToolManager';

/** Preallocated capacity for the hover-grid overlay — foundationGridDisplayRadius is clamped to this in the GUI. */
const MAX_GRID_DISPLAY_RADIUS = 10;
const GRID_SIDE = MAX_GRID_DISPLAY_RADIUS * 2 + 1;
const MAX_GRID_POINTS = GRID_SIDE * GRID_SIDE;

const NEAREST_COLOR: readonly [number, number, number] = [1, 0.85, 0.2];
const FAR_COLOR: readonly [number, number, number] = [0.35, 0.75, 1];

const FIRST_CORNER_COLOR = 0x4da6ff;
const VALID_COLOR = 0x39d353;
const INVALID_COLOR = 0xff4d4d;
const HIGHEST_POINT_COLOR = 0xffcc33;

const markerGeometry = new THREE.SphereGeometry(0.25, 12, 8);

function makeMarker(color: number): THREE.Mesh {
	// Normal depth testing — markers sit slightly above the surface (see the +height offsets
	// below) so they don't need depthTest:false, and leaving it on means a marker on the far side
	// of a hill is correctly hidden rather than showing through solid terrain.
	const material = new THREE.MeshBasicMaterial({ color });
	const mesh = new THREE.Mesh(markerGeometry, material);
	mesh.visible = false;
	return mesh;
}

export interface FoundationToolOptions {
	scene: THREE.Scene;
	camera: THREE.PerspectiveCamera;
	terrainHeightSampler: TerrainHeightSampler;
	getTerrainMeshes: () => readonly THREE.Object3D[];
	foundationManager: FoundationManager;
	terrainSettings: TerrainSettings;
	buildingSettings: BuildingSettings;
	onHudChange?: (hud: BuildUiState | null) => void;
}

/**
 * The rectangular Foundation building tool: crosshair-based targeting against the terrain grid,
 * a two-click corner selection state machine, a live preview, and the placement command itself.
 * All terrain height queries go through TerrainHeightSampler — never rendered chunk geometry —
 * so a selection spanning several chunks (loaded or not) behaves identically.
 */
export class FoundationTool implements BuildTool {
	readonly toolId: ToolId = 'foundation';

	private readonly scene: THREE.Scene;
	private readonly camera: THREE.PerspectiveCamera;
	private readonly terrainHeightSampler: TerrainHeightSampler;
	private readonly getTerrainMeshes: () => readonly THREE.Object3D[];
	private readonly foundationManager: FoundationManager;
	private readonly terrainSettings: TerrainSettings;
	private readonly buildingSettings: BuildingSettings;
	private readonly onHudChange?: (hud: BuildUiState | null) => void;

	private readonly raycaster = new THREE.Raycaster();
	private readonly screenCenter = new THREE.Vector2(0, 0);

	private readonly overlayGroup = new THREE.Group();
	private readonly gridPositions = new Float32Array(MAX_GRID_POINTS * 3);
	private readonly gridColors = new Float32Array(MAX_GRID_POINTS * 3);
	private readonly gridGeometry = new THREE.BufferGeometry();
	private readonly gridPoints: THREE.Points;

	private readonly firstCornerMarker = makeMarker(FIRST_CORNER_COLOR);
	private readonly targetMarker = makeMarker(VALID_COLOR);
	private readonly highestPointMarker = makeMarker(HIGHEST_POINT_COLOR);

	private readonly previewMaterial = new THREE.MeshBasicMaterial({
		color: VALID_COLOR,
		transparent: true,
		opacity: 0.45,
		depthWrite: false,
		side: THREE.DoubleSide
	});
	private previewGeometry: THREE.BoxGeometry | null = null;
	private readonly previewMesh: THREE.Mesh;
	private readonly outlineGeometry = new THREE.BufferGeometry();
	private readonly outlineMaterial = new THREE.LineBasicMaterial({ color: VALID_COLOR });
	private readonly outline: THREE.LineSegments;

	private active = false;
	private state: FoundationToolState = 'idle';
	private hasTarget = false;
	private lastHoveredGridX: number | null = null;
	private lastHoveredGridZ: number | null = null;
	private currentHoverPoint: TerrainGridPoint | null = null;
	private firstCorner: TerrainGridPoint | null = null;

	constructor(options: FoundationToolOptions) {
		this.scene = options.scene;
		this.camera = options.camera;
		this.terrainHeightSampler = options.terrainHeightSampler;
		this.getTerrainMeshes = options.getTerrainMeshes;
		this.foundationManager = options.foundationManager;
		this.terrainSettings = options.terrainSettings;
		this.buildingSettings = options.buildingSettings;
		this.onHudChange = options.onHudChange;

		this.gridGeometry.setAttribute('position', new THREE.BufferAttribute(this.gridPositions, 3));
		this.gridGeometry.setAttribute('color', new THREE.BufferAttribute(this.gridColors, 3));
		this.gridGeometry.setDrawRange(0, 0);
		const gridMaterial = new THREE.PointsMaterial({
			size: 0.3,
			vertexColors: true,
			sizeAttenuation: true
		});
		this.gridPoints = new THREE.Points(this.gridGeometry, gridMaterial);
		this.gridPoints.visible = false;

		this.previewMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), this.previewMaterial);
		this.previewMesh.visible = false;

		this.outlineGeometry.setAttribute(
			'position',
			new THREE.BufferAttribute(new Float32Array(24), 3)
		);
		this.outline = new THREE.LineSegments(this.outlineGeometry, this.outlineMaterial);
		this.outline.visible = false;

		this.overlayGroup.add(
			this.gridPoints,
			this.firstCornerMarker,
			this.targetMarker,
			this.highestPointMarker,
			this.previewMesh,
			this.outline
		);
	}

	private vertexSpacing(): number {
		return vertexSpacingFor(this.terrainSettings.chunkSize, this.terrainSettings.chunkResolution);
	}

	activate(): void {
		this.active = true;
		this.state = 'idle';
		this.firstCorner = null;
		this.lastHoveredGridX = null;
		this.lastHoveredGridZ = null;
		this.hasTarget = false;
		this.scene.add(this.overlayGroup);
	}

	deactivate(): void {
		this.active = false;
		this.state = 'idle';
		this.firstCorner = null;
		this.hideAllVisuals();
		this.scene.remove(this.overlayGroup);
		this.onHudChange?.(null);
	}

	update(): void {
		if (!this.active) return;

		const hit = this.raycastTerrain();
		if (!hit) {
			if (this.hasTarget) {
				this.hasTarget = false;
				this.currentHoverPoint = null;
				this.lastHoveredGridX = null;
				this.lastHoveredGridZ = null;
				this.refreshVisuals();
			}
			return;
		}

		const spacing = this.vertexSpacing();
		const gridX = worldToGridCoord(hit.point.x, spacing);
		const gridZ = worldToGridCoord(hit.point.z, spacing);

		if (this.hasTarget && gridX === this.lastHoveredGridX && gridZ === this.lastHoveredGridZ) {
			return;
		}

		this.hasTarget = true;
		this.lastHoveredGridX = gridX;
		this.lastHoveredGridZ = gridZ;
		const worldX = gridX * spacing;
		const worldZ = gridZ * spacing;
		this.currentHoverPoint = {
			gridX,
			gridZ,
			worldX,
			worldZ,
			height: this.terrainHeightSampler.sample(worldX, worldZ)
		};

		this.refreshVisuals();
	}

	onPrimaryAction(): void {
		if (!this.active || !this.hasTarget || !this.currentHoverPoint) return;

		if (this.state === 'idle') {
			this.firstCorner = this.currentHoverPoint;
			this.state = 'first-corner-selected';
			this.refreshVisuals();
			return;
		}

		this.confirmPlacement();
	}

	onSecondaryAction(): void {
		if (!this.active || this.state !== 'first-corner-selected') return;
		this.state = 'idle';
		this.firstCorner = null;
		this.refreshVisuals();
	}

	private raycastTerrain(): THREE.Intersection | null {
		this.raycaster.setFromCamera(this.screenCenter, this.camera);
		const meshes = this.getTerrainMeshes();
		if (meshes.length === 0) return null;
		// intersectObjects only reads this array — the readonly parameter type upstream is conservative, not a real mutation risk.
		const hits = this.raycaster.intersectObjects(meshes as THREE.Object3D[], false);
		return hits.length > 0 ? hits[0] : null;
	}

	private confirmPlacement(): void {
		if (!this.firstCorner || !this.currentHoverPoint) return;

		const result = computeFoundationSelection(
			this.firstCorner,
			this.currentHoverPoint,
			this.vertexSpacing(),
			(x, z) => this.terrainHeightSampler.sample(x, z),
			this.buildingSettings.maxFoundationCells,
			this.buildingSettings.foundationUndergroundDepth
		);
		if (!result.valid) return;

		this.foundationManager.addFoundation({
			id: crypto.randomUUID(),
			minGridX: result.minGridX,
			maxGridX: result.maxGridX,
			minGridZ: result.minGridZ,
			maxGridZ: result.maxGridZ,
			topY: result.topY,
			bottomY: result.bottomY
		});

		this.state = 'idle';
		this.firstCorner = null;
		this.refreshVisuals();
	}

	/** Rebuilds every overlay visual + HUD text from current state. Only called when something actually changed. */
	private refreshVisuals(): void {
		if (this.buildingSettings.showVertexGrid && this.hasTarget && this.lastHoveredGridX !== null) {
			this.updateHoverGrid(this.lastHoveredGridX, this.lastHoveredGridZ as number);
		} else {
			this.gridPoints.visible = false;
		}

		if (this.state === 'idle') {
			this.firstCornerMarker.visible = false;
			this.highestPointMarker.visible = false;
			this.hidePreview();
			this.updateTargetMarker(this.currentHoverPoint, VALID_COLOR);
			this.onHudChange?.(this.buildIdleHud());
			return;
		}

		// first-corner-selected
		this.updateTargetMarker(this.firstCorner, FIRST_CORNER_COLOR);
		this.firstCornerMarker.position.copy(this.targetMarker.position);
		this.firstCornerMarker.visible = true;

		if (!this.firstCorner || !this.currentHoverPoint) {
			this.hidePreview();
			this.onHudChange?.(this.buildWaitingHud());
			return;
		}

		const result = computeFoundationSelection(
			this.firstCorner,
			this.currentHoverPoint,
			this.vertexSpacing(),
			(x, z) => this.terrainHeightSampler.sample(x, z),
			this.buildingSettings.maxFoundationCells,
			this.buildingSettings.foundationUndergroundDepth
		);

		this.updateTargetMarker(this.currentHoverPoint, result.valid ? VALID_COLOR : INVALID_COLOR);

		if (!result.valid) {
			this.hidePreview();
			this.highestPointMarker.visible = false;
			this.onHudChange?.(this.buildInvalidHud(result.reason ?? 'Invalid selection'));
			return;
		}

		this.updatePreview(result);
		this.onHudChange?.(this.buildValidHud(result));
	}

	private updateHoverGrid(centerGridX: number, centerGridZ: number): void {
		const radius = Math.max(
			1,
			Math.min(this.buildingSettings.foundationGridDisplayRadius, MAX_GRID_DISPLAY_RADIUS)
		);
		const spacing = this.vertexSpacing();
		let i = 0;

		for (let dz = -radius; dz <= radius; dz++) {
			for (let dx = -radius; dx <= radius; dx++) {
				const gx = centerGridX + dx;
				const gz = centerGridZ + dz;
				const worldX = gx * spacing;
				const worldZ = gz * spacing;
				const height = this.terrainHeightSampler.sample(worldX, worldZ);

				const p = i * 3;
				this.gridPositions[p] = worldX;
				this.gridPositions[p + 1] = height + 0.03;
				this.gridPositions[p + 2] = worldZ;

				const isNearest = dx === 0 && dz === 0;
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
		this.gridPoints.visible = true;
	}

	private updateTargetMarker(point: TerrainGridPoint | null, color: number): void {
		if (!point) {
			this.targetMarker.visible = false;
			return;
		}
		this.targetMarker.position.set(point.worldX, point.height + 0.15, point.worldZ);
		(this.targetMarker.material as THREE.MeshBasicMaterial).color.setHex(color);
		this.targetMarker.visible = true;
	}

	private updatePreview(result: ReturnType<typeof computeFoundationSelection>): void {
		const spacing = this.vertexSpacing();
		const minX = result.minGridX * spacing;
		const maxX = result.maxGridX * spacing;
		const minZ = result.minGridZ * spacing;
		const maxZ = result.maxGridZ * spacing;
		const width = maxX - minX;
		const depth = maxZ - minZ;
		const height = result.topY - result.bottomY;

		this.previewGeometry?.dispose();
		this.previewGeometry = new THREE.BoxGeometry(width, height, depth);
		this.previewMesh.geometry = this.previewGeometry;
		this.previewMesh.position.set(
			(minX + maxX) / 2,
			(result.topY + result.bottomY) / 2,
			(minZ + maxZ) / 2
		);
		this.previewMaterial.color.setHex(VALID_COLOR);
		this.previewMaterial.opacity = this.buildingSettings.previewOpacity;
		this.previewMesh.visible = true;

		const lift = 0.06;
		const outlineY = result.topY + lift;
		const positions = this.outlineGeometry.attributes.position.array as Float32Array;
		const corners: [number, number][] = [
			[minX, minZ],
			[maxX, minZ],
			[maxX, maxZ],
			[minX, maxZ]
		];
		let i = 0;
		for (let c = 0; c < 4; c++) {
			const [x0, z0] = corners[c];
			const [x1, z1] = corners[(c + 1) % 4];
			positions[i++] = x0;
			positions[i++] = outlineY;
			positions[i++] = z0;
			positions[i++] = x1;
			positions[i++] = outlineY;
			positions[i++] = z1;
		}
		this.outlineGeometry.attributes.position.needsUpdate = true;
		this.outlineMaterial.color.setHex(VALID_COLOR);
		this.outline.visible = true;

		if (this.buildingSettings.showFoundationHighestPoint) {
			this.highestPointMarker.position.set(
				result.highestPoint.worldX,
				result.highestPoint.height + 0.3,
				result.highestPoint.worldZ
			);
			this.highestPointMarker.visible = true;
		} else {
			this.highestPointMarker.visible = false;
		}
	}

	private hidePreview(): void {
		this.previewMesh.visible = false;
		this.outline.visible = false;
	}

	private hideAllVisuals(): void {
		this.gridPoints.visible = false;
		this.firstCornerMarker.visible = false;
		this.targetMarker.visible = false;
		this.highestPointMarker.visible = false;
		this.hidePreview();
	}

	private buildIdleHud(): BuildUiState {
		return {
			toolId: 'foundation',
			crosshair: this.hasTarget ? 'valid' : 'default',
			hintLines: ['FOUNDATION', '', 'Look at terrain', 'Left click: Select corner']
		};
	}

	private buildWaitingHud(): BuildUiState {
		return {
			toolId: 'foundation',
			crosshair: 'default',
			hintLines: ['FOUNDATION', '', 'Look at terrain', 'Right click: Cancel']
		};
	}

	private buildInvalidHud(reason: string): BuildUiState {
		return {
			toolId: 'foundation',
			crosshair: 'invalid',
			hintLines: ['FOUNDATION', '', reason, '', 'Right click: Cancel']
		};
	}

	private buildValidHud(result: ReturnType<typeof computeFoundationSelection>): BuildUiState {
		const spacing = this.vertexSpacing();
		const volume =
			result.cellsX * spacing * (result.cellsZ * spacing) * (result.topY - result.bottomY);
		return {
			toolId: 'foundation',
			crosshair: 'valid',
			hintLines: [
				'FOUNDATION',
				'',
				'Choose opposite corner',
				`${result.cellsX} × ${result.cellsZ} cells`,
				`Top: ${result.topY.toFixed(2)}m`,
				`Vol: ${Math.round(volume)}m³`,
				'',
				'Left click: Build',
				'Right click: Cancel'
			]
		};
	}

	dispose(): void {
		this.deactivate();
		this.gridGeometry.dispose();
		(this.gridPoints.material as THREE.Material).dispose();
		(this.firstCornerMarker.material as THREE.Material).dispose();
		(this.targetMarker.material as THREE.Material).dispose();
		(this.highestPointMarker.material as THREE.Material).dispose();
		this.previewGeometry?.dispose();
		this.previewMaterial.dispose();
		this.outlineGeometry.dispose();
		this.outlineMaterial.dispose();
	}
}
