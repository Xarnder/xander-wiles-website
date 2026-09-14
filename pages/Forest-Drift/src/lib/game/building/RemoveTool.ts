import type { MusicPlantPlacementTool } from '../music/MusicPlantPlacementTool';
import type { MiniBuildSystem } from '../miniBuild/MiniBuildSystem';
import * as THREE from 'three';
import type { BuildingManager } from './BuildingManager';
import type { FurnitureManager } from './FurnitureManager';
import { getFurnitureCatalogueEntry } from './furnitureCatalogue';
import type { BuildingRemovalManager } from './BuildingRemovalManager';
import { levelDisplayName } from './BuildingLevelTypes';
import type { BuildingSettings, BuildUiState, ToolId } from './FoundationTypes';
import { applyWallTransform } from './WallGeometryBuilder';
import { ROOF_TYPE_LABELS } from './RoofTypes';
import { computeStairMetrics } from './stairMath';
import { computeWallLength, wallLocalToWorld } from './wallGeometryMath';
import type { SlabType } from './SlabTypes';
import type {
	WallBeamDefinition,
	WallDefinition,
	WallOpeningDefinition,
	WallOpeningType
} from './WallTypes';
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

interface BeamPickingProxy {
	mesh: THREE.Mesh;
	wallId: string;
	beamId: string;
	foundationId: string;
	widthMeters: number;
	heightMeters: number;
}

export interface RemoveToolOptions {
	music?: MusicPlantPlacementTool;
	furniture?: FurnitureManager;
	miniBuilds?: MiniBuildSystem;
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
 * picking mesh, stair mesh, slab (ceiling/floor) mesh, roof mesh, floor-detail mesh, and this
 * tool's own OpeningPickingProxy meshes — nearest hit wins, with an opening's proxy built
 * deliberately thicker than its wall so it always resolves ahead of the (opening-unaware) solid
 * wall/segment box it physically overlaps. The nearest hit's `userData` is resolved to a logical
 * RemovalTarget (RemovalTypes.ts) — highlighting, HUD text, and the actual removal call all operate
 * on that logical target, never on the raw mesh.
 */
export class RemoveTool implements BuildTool {
	readonly toolId: ToolId = 'remove';
	private music?: MusicPlantPlacementTool;
	private furniture?: FurnitureManager;
	private musicId?: string;
	private furnitureId?: string;
	private miniBuilds?: MiniBuildSystem;
	private miniBuildId?: string;
	private musicHighlight = new THREE.BoxHelper(new THREE.Group(), 0xff6655);
	private readonly furnitureAabb = new THREE.Box3();
	private readonly furnitureHighlightCenter = new THREE.Vector3();
	private readonly furnitureHighlightSize = new THREE.Vector3();
	private readonly furnitureHighlight: THREE.Mesh;

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
	private beamProxies: BeamPickingProxy[] = [];

	private active = false;
	private hoveredKey: string | null = null;
	private hoveredTarget: RemovalTarget | null = null;

	constructor(options: RemoveToolOptions) {
		this.music = options.music;
		this.furniture = options.furniture;
		this.miniBuilds = options.miniBuilds;
		options.scene.add(this.musicHighlight);
		this.musicHighlight.visible = false;
		const furnitureHighlightGeometry = new THREE.BoxGeometry(1, 1, 1);
		this.furnitureHighlight = new THREE.Mesh(
			furnitureHighlightGeometry,
			new THREE.MeshBasicMaterial({
				color: HIGHLIGHT_COLOR,
				transparent: true,
				opacity: 0.45,
				depthWrite: false,
				depthTest: false
			})
		);
		this.furnitureHighlight.visible = false;
		this.furnitureHighlight.renderOrder = 21;
		options.scene.add(this.furnitureHighlight);
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
		this.rebuildRemovalProxies();
	}

	deactivate(): void {
		this.musicId = undefined;
		this.furnitureId = undefined;
		this.miniBuildId = undefined;
		this.musicHighlight.visible = false;
		this.furnitureHighlight.visible = false;
		this.active = false;
		this.hoveredKey = null;
		this.hoveredTarget = null;
		this.clearHighlight();
		this.disposeRemovalProxies();
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
			...this.buildingManager.getRaycastableSlabMeshes(),
			...this.buildingManager.getRaycastableRoofMeshes(),
			...this.buildingManager.getRaycastableFloorDetailMeshes(),
			...this.openingProxies.map((proxy) => proxy.mesh),
			...this.beamProxies.map((proxy) => proxy.mesh)
		];
		const hits = candidates.length > 0 ? this.raycaster.intersectObjects(candidates, false) : [];
		const hit = hits[0];
		this.musicId = undefined;
		this.furnitureId = undefined;
		this.miniBuildId = undefined;
		this.musicHighlight.visible = false;
		this.furnitureHighlight.visible = false;
		const miniBuildHit = this.miniBuilds?.instances.raycast(this.raycaster) ?? null;
		const plantHit = this.music
			? this.raycaster.intersectObjects([...this.music.plants.visuals.values()], true)[0]
			: undefined;
		const furnitureHit = this.pickFurniture();
		const furnitureCloser = furnitureHit && (!hit || furnitureHit.distance < hit.distance);
		if (
			plantHit &&
			(!hit || plantHit.distance < hit.distance) &&
			(!furnitureHit || plantHit.distance <= furnitureHit.distance) &&
			(!miniBuildHit || plantHit.distance <= miniBuildHit.distance)
		) {
			this.musicId = plantHit.object.userData.musicPlantId;
			this.setHoveredTarget(null, null);
			this.musicHighlight.setFromObject(this.music!.plants.visuals.get(this.musicId!)!);
			this.musicHighlight.visible = true;
			this.onHudChange?.({
				toolId: 'remove',
				crosshair: 'valid',
				hintLines: ['REMOVE MUSIC PLANT', 'Click Remove · X Exit']
			});
			return;
		}
		if (
			miniBuildHit &&
			this.miniBuilds &&
			(!hit || miniBuildHit.distance < hit.distance) &&
			(!furnitureHit || miniBuildHit.distance < furnitureHit.distance)
		) {
			this.miniBuildId = miniBuildHit.id;
			this.setHoveredTarget(null, null);
			const box = this.miniBuilds.instances.worldAabb(miniBuildHit.id);
			if (box) {
				// A bounds overlay — instanced objects have no per-object mesh to recolour, and duplicating
				// runtime geometry just for hover would defeat the batching.
				this.furnitureHighlight.position.set(
					(box.minX + box.maxX) / 2,
					(box.minY + box.maxY) / 2,
					(box.minZ + box.maxZ) / 2
				);
				this.furnitureHighlight.scale.set(
					box.maxX - box.minX + 0.03,
					box.maxY - box.minY + 0.03,
					box.maxZ - box.minZ + 0.03
				);
				this.furnitureHighlight.updateMatrixWorld(true);
				this.furnitureHighlight.visible = true;
			}
			const instance = this.miniBuilds.instances.get(miniBuildHit.id);
			const name = instance
				? (this.miniBuilds.getDesign(instance.designId)?.name ?? 'Object')
				: 'Object';
			this.onHudChange?.({
				toolId: 'remove',
				crosshair: 'valid',
				notice: name,
				hintLines: [
					`REMOVE ${name.toUpperCase()}`,
					'Removes this copy only — the design stays in your library',
					'Click Remove · X Exit'
				]
			});
			return;
		}
		if (furnitureCloser && furnitureHit && this.furniture) {
			this.furnitureId = furnitureHit.id;
			this.setHoveredTarget(null, null);
			if (this.furniture.getWorldAabb(furnitureHit.id, this.furnitureAabb)) {
				this.furnitureAabb.getCenter(this.furnitureHighlightCenter);
				this.furnitureAabb.getSize(this.furnitureHighlightSize);
				this.furnitureHighlight.position.copy(this.furnitureHighlightCenter);
				this.furnitureHighlight.scale.copy(this.furnitureHighlightSize);
				this.furnitureHighlight.scale.x = Math.max(0.08, this.furnitureHighlight.scale.x);
				this.furnitureHighlight.scale.y = Math.max(0.08, this.furnitureHighlight.scale.y);
				this.furnitureHighlight.scale.z = Math.max(0.08, this.furnitureHighlight.scale.z);
				this.furnitureHighlight.updateMatrixWorld(true);
				this.furnitureHighlight.visible = true;
			}
			const kind = this.furniture.get(furnitureHit.id)?.kind;
			const label = kind ? getFurnitureCatalogueEntry(kind).name.toUpperCase() : 'OBJECT';
			this.onHudChange?.({
				toolId: 'remove',
				crosshair: 'valid',
				hintLines: [`REMOVE ${label}`, 'Click Remove · X Exit']
			});
			return;
		}
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
		if (this.active && this.musicId) {
			this.music?.remove(this.musicId);
			this.musicId = undefined;
			this.musicHighlight.visible = false;
			return;
		}
		if (this.active && this.miniBuildId) {
			this.miniBuilds?.removeInstance(this.miniBuildId);
			this.miniBuildId = undefined;
			this.furnitureHighlight.visible = false;
			return;
		}
		if (this.active && this.furnitureId) {
			this.furniture?.remove(this.furnitureId);
			this.furnitureId = undefined;
			this.furnitureHighlight.visible = false;
			return;
		}
		if (!this.active || !this.hoveredTarget) return;
		const removed = this.removalManager.remove(this.hoveredTarget);
		if (!removed) return;

		this.setHoveredTarget(null, null);
		this.rebuildRemovalProxies();
	}

	onSecondaryAction(): void {
		// Exiting remove mode on right-click is orchestrated by BuildToolManager (it also owns the
		// hotbar-restore step) — this tool has no pending, cancelable selection of its own since a
		// removal is a single click, never a multi-step placement.
	}

	private pickFurniture(): { id: string; distance: number } | undefined {
		if (!this.furniture) return undefined;
		const meshes = this.furniture.getPickMeshes();
		if (meshes.length === 0) return undefined;
		const hit = this.raycaster.intersectObjects(meshes, true)[0];
		if (!hit) return undefined;
		if (hit.object === this.furniture.getPickMesh() && hit.instanceId !== undefined) {
			const id = this.furniture.idAtInstance(hit.instanceId);
			return id ? { id, distance: hit.distance } : undefined;
		}
		const id = this.furniture.idFromObject(hit.object);
		return id ? { id, distance: hit.distance } : undefined;
	}

	/** Called by BuildToolManager when the `showRemovalPickingProxies` GUI toggle changes — see its class doc comment. */
	setShowPickingProxies(visible: boolean): void {
		for (const proxy of this.openingProxies) proxy.mesh.visible = visible;
		for (const proxy of this.beamProxies) proxy.mesh.visible = visible;
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
		hitObject.getWorldScale(this.highlightMesh.scale);
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
	private rebuildRemovalProxies(): void {
		this.disposeRemovalProxies();

		for (const wall of this.buildingManager.getAllWalls()) {
			for (const opening of wall.openings) this.addOpeningProxy(wall, opening);
			for (const beam of wall.beams ?? []) this.addBeamProxy(wall, beam);
		}
		for (const path of this.buildingManager.getAllWallPaths()) {
			for (const segment of path.segments) {
				const segmentWall = this.buildingManager.getWall(segment.id);
				if (!segmentWall) continue;
				for (const opening of segment.openings) this.addOpeningProxy(segmentWall, opening);
				for (const beam of segment.beams ?? []) this.addBeamProxy(segmentWall, beam);
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

	private addBeamProxy(wall: WallDefinition, beam: WallBeamDefinition): void {
		const transform = this.buildingManager.getWallTransform(wall.id);
		if (!transform) return;

		const width = beam.maxU - beam.minU;
		const height = beam.maxY - beam.minY;
		const depth = wall.thickness + OPENING_PROXY_DEPTH_BUFFER;

		const geometry = new THREE.BoxGeometry(width, height, depth);
		const mesh = new THREE.Mesh(geometry, this.proxyMaterial);
		mesh.visible = this.buildingSettings.showRemovalPickingProxies;
		mesh.userData.foundationId = wall.foundationId;
		mesh.userData.wallId = wall.id;
		mesh.userData.beamId = beam.id;

		const centerU = (beam.minU + beam.maxU) / 2;
		const centerY = (beam.minY + beam.maxY) / 2;
		const center = wallLocalToWorld(transform, centerU, centerY, 0);
		applyWallTransform(mesh, center.worldX, center.worldY, center.worldZ, transform.headingRadians);

		this.overlayGroup.add(mesh);
		this.beamProxies.push({
			mesh,
			wallId: wall.id,
			beamId: beam.id,
			foundationId: wall.foundationId,
			widthMeters: width,
			heightMeters: height
		});
	}

	private disposeRemovalProxies(): void {
		for (const proxy of this.openingProxies) {
			proxy.mesh.geometry.dispose();
			proxy.mesh.removeFromParent();
		}
		this.openingProxies = [];
		for (const proxy of this.beamProxies) {
			proxy.mesh.geometry.dispose();
			proxy.mesh.removeFromParent();
		}
		this.beamProxies = [];
	}

	private findOpeningProxy(wallId: string, openingId: string): OpeningPickingProxy | undefined {
		return this.openingProxies.find((p) => p.wallId === wallId && p.openingId === openingId);
	}

	private findBeamProxy(wallId: string, beamId: string): BeamPickingProxy | undefined {
		return this.beamProxies.find((p) => p.wallId === wallId && p.beamId === beamId);
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
			case 'beam': {
				const proxy = this.findBeamProxy(target.wallId, target.beamId);
				if (!proxy) return ['Beam'];
				return ['Beam', `${proxy.widthMeters.toFixed(2)} × ${proxy.heightMeters.toFixed(2)}m`];
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
			case 'slab': {
				const slab = this.buildingManager.getSlab(target.slabId);
				const label = slabTypeLabel(slab?.type);
				if (!slab) return [label];
				return [label, `${slab.thickness.toFixed(2)}m thick`];
			}
			case 'roof': {
				const roof = this.buildingManager.getRoof(target.roofId);
				if (!roof) return ['Roof'];
				return [ROOF_TYPE_LABELS[roof.type], `Rise ${roof.rise.toFixed(2)}m`];
			}
			case 'floor-detail': {
				const detail = this.buildingManager.getFloorDetail(target.detailId);
				if (!detail) return ['Floor detailing'];
				const labels = {
					carpet: 'Carpet',
					path: 'Path',
					planks: 'Planks',
					tiles: 'Tiles'
				} as const;
				return ['Floor detailing', labels[detail.kind]];
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
			case 'beam':
				return 'Beam';
			case 'stair':
				return 'Stairs';
			case 'slab':
				return slabTypeLabel(this.buildingManager.getSlab(target.slabId)?.type);
			case 'roof': {
				const roof = this.buildingManager.getRoof(target.roofId);
				return roof ? ROOF_TYPE_LABELS[roof.type] : 'Roof';
			}
			case 'floor-detail': {
				const detail = this.buildingManager.getFloorDetail(target.detailId);
				if (!detail) return 'Floor detailing';
				if (detail.kind === 'carpet') return 'Carpet';
				if (detail.kind === 'path') return 'Path';
				if (detail.kind === 'planks') return 'Planks';
				return 'Tiles';
			}
		}
	}

	dispose(): void {
		this.musicHighlight.removeFromParent();
		this.musicHighlight.geometry.dispose();
		(this.musicHighlight.material as THREE.Material).dispose();
		this.furnitureHighlight.removeFromParent();
		this.furnitureHighlight.geometry.dispose();
		(this.furnitureHighlight.material as THREE.Material).dispose();
		this.deactivate();
		this.emptyGeometry.dispose();
		this.highlightMaterial.dispose();
		this.proxyMaterial.dispose();
	}
}

function slabTypeLabel(type: SlabType | undefined): string {
	if (type === 'ceiling') return 'Ceiling';
	if (type === 'flat-roof') return 'Flat Roof';
	return 'Floor';
}
