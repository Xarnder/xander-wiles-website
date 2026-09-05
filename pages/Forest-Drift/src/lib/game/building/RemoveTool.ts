import * as THREE from 'three';
import type { BuildingManager } from './BuildingManager';
import type { BuildingRemovalManager } from './BuildingRemovalManager';
import { levelDisplayName } from './BuildingLevelTypes';
import type { BuildingSettings, BuildUiState, ToolId } from './FoundationTypes';
import { applyWallTransform } from './WallGeometryBuilder';
import { computeStairMetrics } from './stairMath';
import { computeWallLength, wallLocalToWorld } from './wallGeometryMath';
import type { WallDefinition, WallOpeningDefinition, WallOpeningType } from './WallTypes';
import type { BuildingPickUserData, RemovalTarget } from './RemovalTypes';
import { removalTargetKey, resolveRemovalTarget } from './RemovalTypes';
import type { BuildTool } from './BuildToolManager';

const HIGHLIGHT_COLOR = 0xff3b30;

/** How much deeper than the wall's own thickness an opening's invisible picking box is built — see OpeningPickingProxy's doc comment for why this matters for raycast priority. */
const OPENING_PROXY_DEPTH_BUFFER = 0.04;

const DEBUG_PROXY_COLOR = 0xffcc33;

/**
 * The invisible (unless `showRemovalPickingProxies` debug toggle is on) picking box RemoveTool
 * builds for every existing window/door opening — see the README's "Window/door opening picking"
 * section. Openings are holes in wall geometry: a standalone wall's real mesh has an actual gap
 * there (nothing to raycast against at all), and even a wall-path segment's solid picking box
 * doesn't know openings exist. A proxy occupying the opening's own logical bounds is what makes an
 * opening targetable in the first place; it is rebuilt from scratch (not incrementally patched)
 * every time the tool activates or a removal changes wall/opening state — see `rebuildOpeningProxies`.
 */
interface OpeningPickingProxy {
	mesh: THREE.Mesh;
	wallId: string;
	openingId: string;
	openingType: WallOpeningType;
	foundationId: string;
	widthMeters: number;
	heightMeters: number;
}

export interface RemoveToolOptions {
	scene: THREE.Scene;
	camera: THREE.PerspectiveCamera;
	buildingManager: BuildingManager;
	removalManager: BuildingRemovalManager;
	buildingSettings: BuildingSettings;
	onHudChange?: (hud: BuildUiState | null) => void;
}

/**
 * The global Remove/Demolition Mode tool — toggled by `X`, entirely independent of the numbered
 * hotbar (see BuildToolManager's class doc comment and the README's "Remove Mode" section). Unlike
 * every other BuildTool, this one is never placed in BuildToolManager's `tools` map or
 * `DEFAULT_HOTBAR_SLOTS`; BuildToolManager holds it as a separate field and routes input to it only
 * while remove mode is active, leaving the hotbar's own selection completely untouched underneath.
 *
 * Targeting is a single combined raycast against every standalone wall mesh, wall-path segment
 * picking mesh, stair mesh, and this tool's own OpeningPickingProxy meshes — nearest hit wins, with
 * an opening's proxy built deliberately thicker than its wall so it always resolves ahead of the
 * (opening-unaware) solid wall/segment box it physically overlaps. The nearest hit's `userData` is
 * resolved to a logical RemovalTarget (RemovalTypes.ts) — highlighting, HUD text, and the actual
 * removal call all operate on that logical target, never on the raw mesh.
 */
export class RemoveTool implements BuildTool {
	readonly toolId: ToolId = 'remove';

	private readonly scene: THREE.Scene;
	private readonly camera: THREE.PerspectiveCamera;
	private readonly buildingManager: BuildingManager;
	private readonly removalManager: BuildingRemovalManager;
	private readonly buildingSettings: BuildingSettings;
	private readonly onHudChange?: (hud: BuildUiState | null) => void;

	private readonly raycaster = new THREE.Raycaster();
	private readonly screenCenter = new THREE.Vector2(0, 0);

	private readonly overlayGroup = new THREE.Group();
	private readonly emptyGeometry = new THREE.BufferGeometry();
	private readonly highlightMaterial = new THREE.MeshBasicMaterial({
		color: HIGHLIGHT_COLOR,
		transparent: true,
		opacity: 0.5,
		depthWrite: false,
		depthTest: false,
		side: THREE.DoubleSide
	});
	private readonly highlightMesh: THREE.Mesh;

	private readonly proxyMaterial = new THREE.MeshBasicMaterial({
		color: DEBUG_PROXY_COLOR,
		transparent: true,
		opacity: 0.35,
		depthWrite: false,
		side: THREE.DoubleSide
	});

	private openingProxies: OpeningPickingProxy[] = [];

	private active = false;
	private hoveredKey: string | null = null;
	private hoveredTarget: RemovalTarget | null = null;

	constructor(options: RemoveToolOptions) {
		this.scene = options.scene;
		this.camera = options.camera;
		this.buildingManager = options.buildingManager;
		this.removalManager = options.removalManager;
		this.buildingSettings = options.buildingSettings;
		this.onHudChange = options.onHudChange;

		this.highlightMesh = new THREE.Mesh(this.emptyGeometry, this.highlightMaterial);
		this.highlightMesh.renderOrder = 20;
		this.highlightMesh.visible = false;
		this.overlayGroup.add(this.highlightMesh);
	}

	activate(): void {
		this.active = true;
		this.hoveredKey = null;
		this.hoveredTarget = null;
		this.scene.add(this.overlayGroup);
		this.rebuildOpeningProxies();
	}

	deactivate(): void {
		this.active = false;
		this.hoveredKey = null;
		this.hoveredTarget = null;
		this.clearHighlight();
		this.disposeOpeningProxies();
		this.scene.remove(this.overlayGroup);
		this.onHudChange?.(null);
	}

	update(): void {
		if (!this.active) return;

		this.raycaster.setFromCamera(this.screenCenter, this.camera);
		this.raycaster.far = this.buildingSettings.removeToolMaxDistance;

		const candidates: THREE.Object3D[] = [
			...this.buildingManager.getRaycastableWallMeshes(),
			...this.buildingManager.getRaycastableStairMeshes(),
			...this.openingProxies.map((proxy) => proxy.mesh)
		];
		const hits = candidates.length > 0 ? this.raycaster.intersectObjects(candidates, false) : [];
		const hit = hits[0];
		const target = hit ? resolveRemovalTarget(hit.object.userData as BuildingPickUserData) : null;

		if (!target || !hit) {
			this.setHoveredTarget(null, null);
			this.onHudChange?.(this.buildNoTargetHud());
			return;
		}

		this.setHoveredTarget(target, hit.object);
		this.onHudChange?.(this.buildTargetHud(target));
	}

	onPrimaryAction(): void {
		if (!this.active || !this.hoveredTarget) return;
		const removed = this.removalManager.remove(this.hoveredTarget);
		if (!removed) return;

		this.setHoveredTarget(null, null);
		this.rebuildOpeningProxies();
	}

	onSecondaryAction(): void {
		// Exiting remove mode on right-click is orchestrated by BuildToolManager (it also owns the
		// hotbar-restore step) — this tool has no pending, cancelable selection of its own since a
		// removal is a single click, never a multi-step placement.
	}

	/** Called by BuildToolManager when the `showRemovalPickingProxies` GUI toggle changes — see its class doc comment. */
	setShowPickingProxies(visible: boolean): void {
		for (const proxy of this.openingProxies) proxy.mesh.visible = visible;
	}

	private setHoveredTarget(target: RemovalTarget | null, hitObject: THREE.Object3D | null): void {
		const key = target ? removalTargetKey(target) : null;
		if (key === this.hoveredKey) {
			// Same target as last frame — still refresh the highlight's transform in case the
			// underlying mesh ever moved, matching OpeningToolBase's identical hover-tracking pattern.
			if (hitObject) this.trackHighlightTransform(hitObject);
			this.hoveredTarget = target;
			return;
		}

		this.hoveredKey = key;
		this.hoveredTarget = target;
		if (target && hitObject) {
			this.applyHighlight(hitObject);
		} else {
			this.clearHighlight();
		}
	}

	private applyHighlight(hitObject: THREE.Object3D): void {
		this.highlightMesh.geometry = (hitObject as THREE.Mesh).geometry;
		this.trackHighlightTransform(hitObject);
		this.highlightMesh.visible = true;
	}

	private trackHighlightTransform(hitObject: THREE.Object3D): void {
		hitObject.getWorldPosition(this.highlightMesh.position);
		hitObject.getWorldQuaternion(this.highlightMesh.quaternion);
	}

	private clearHighlight(): void {
		this.highlightMesh.visible = false;
		this.highlightMesh.geometry = this.emptyGeometry;
	}

	/**
	 * Rebuilds every OpeningPickingProxy from scratch — called on activate() and after every
	 * successful removal (never incrementally patched, per the class doc comment: it's simpler and
	 * cheap at this prototype's expected opening counts, the same tradeoff every other manager in
	 * this codebase already makes for its own rebuild-the-whole-thing operations).
	 */
	private rebuildOpeningProxies(): void {
		this.disposeOpeningProxies();

		for (const wall of this.buildingManager.getAllWalls()) {
			for (const opening of wall.openings) this.addOpeningProxy(wall, opening);
		}
		for (const path of this.buildingManager.getAllWallPaths()) {
			for (const segment of path.segments) {
				const segmentWall = this.buildingManager.getWall(segment.id);
				if (!segmentWall) continue;
				for (const opening of segment.openings) this.addOpeningProxy(segmentWall, opening);
			}
		}
	}

	private addOpeningProxy(wall: WallDefinition, opening: WallOpeningDefinition): void {
		const transform = this.buildingManager.getWallTransform(wall.id);
		if (!transform) return;

		const width = opening.maxU - opening.minU;
		const height = opening.maxY - opening.minY;
		const depth = wall.thickness + OPENING_PROXY_DEPTH_BUFFER;

		const geometry = new THREE.BoxGeometry(width, height, depth);
		const mesh = new THREE.Mesh(geometry, this.proxyMaterial);
		mesh.visible = this.buildingSettings.showRemovalPickingProxies;
		mesh.userData.foundationId = wall.foundationId;
		mesh.userData.wallId = wall.id;
		mesh.userData.openingId = opening.id;
		mesh.userData.openingType = opening.type;

		const centerU = (opening.minU + opening.maxU) / 2;
		const centerY = (opening.minY + opening.maxY) / 2;
		const center = wallLocalToWorld(transform, centerU, centerY, 0);
		applyWallTransform(mesh, center.worldX, center.worldY, center.worldZ, transform.headingRadians);

		this.overlayGroup.add(mesh);
		this.openingProxies.push({
			mesh,
			wallId: wall.id,
			openingId: opening.id,
			openingType: opening.type,
			foundationId: wall.foundationId,
			widthMeters: width,
			heightMeters: height
		});
	}

	private disposeOpeningProxies(): void {
		for (const proxy of this.openingProxies) {
			proxy.mesh.geometry.dispose();
			proxy.mesh.removeFromParent();
		}
		this.openingProxies = [];
	}

	private findOpeningProxy(wallId: string, openingId: string): OpeningPickingProxy | undefined {
		return this.openingProxies.find((p) => p.wallId === wallId && p.openingId === openingId);
	}

	private buildNoTargetHud(): BuildUiState {
		return {
			toolId: 'remove',
			crosshair: 'default',
			notice: 'Look at a building element',
			hintLines: [
				'REMOVE',
				'',
				'Look at a building element',
				'Left Click: Remove',
				'X / Right Click: Exit'
			]
		};
	}

	private buildTargetHud(target: RemovalTarget): BuildUiState {
		const lines = ['REMOVE', '', ...this.describeTarget(target), '', 'Click to remove'];
		return {
			toolId: 'remove',
			crosshair: 'invalid',
			notice: this.shortLabel(target),
			hintLines: lines
		};
	}

	/** The HUD's middle block — what exactly will be removed, per the README's "HUD information" section. */
	private describeTarget(target: RemovalTarget): string[] {
		switch (target.type) {
			case 'wall': {
				const wall = this.buildingManager.getWall(target.wallId);
				const length = wall
					? computeWallLength(wall, this.buildingSettings.buildingGridSize)
					: null;
				return ['Wall', length !== null ? `${length.toFixed(2)}m` : ''];
			}
			case 'wall-segment':
				return ['Wall Segment', 'Continuous Wall'];
			case 'opening': {
				const proxy = this.findOpeningProxy(target.wallId, target.openingId);
				const label = target.openingType === 'window' ? 'Window' : 'Door';
				if (!proxy) return [label];
				return [label, `${proxy.widthMeters.toFixed(2)} × ${proxy.heightMeters.toFixed(2)}m`];
			}
			case 'stair': {
				const stair = this.buildingManager.getStair(target.stairId);
				if (!stair) return ['Stairs'];
				const metrics = computeStairMetrics(stair);
				return [
					'Stairs',
					`${metrics.stepCount} steps`,
					`${levelDisplayName(stair.levelIndex)} → ${levelDisplayName(stair.levelIndex + 1)}`
				];
			}
		}
	}

	private shortLabel(target: RemovalTarget): string {
		switch (target.type) {
			case 'wall':
				return 'Wall';
			case 'wall-segment':
				return 'Wall Segment';
			case 'opening':
				return target.openingType === 'window' ? 'Window' : 'Door';
			case 'stair':
				return 'Stairs';
		}
	}

	dispose(): void {
		this.deactivate();
		this.emptyGeometry.dispose();
		this.highlightMaterial.dispose();
		this.proxyMaterial.dispose();
	}
}
