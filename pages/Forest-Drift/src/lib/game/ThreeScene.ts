import { CreatureRuntimeManager } from './creatures/CreatureRuntimeManager';
import type { CreatureDefinition } from './creatures/CreatureTypes';
import { timelineDefinition } from './music/MusicModel';
import { MusicPlantPlacementTool } from './music/MusicPlantPlacementTool';
import { createDefaultSustainSettings, type SustainSettings } from './music/SustainTrailBuilder';
import * as THREE from 'three';
import { BuildingLevelManager } from './building/BuildingLevelManager';
import { BuildingMaterialManager } from './building/BuildingMaterialManager';
import { getGlassMaterial } from './building/OpeningVisualBuilder';
import { BuildingRemovalManager } from './building/BuildingRemovalManager';
import { BuildUndoManager } from './building/BuildUndoManager';
import { BuildingManager } from './building/BuildingManager';
import { BuildToolManager } from './building/BuildToolManager';
import { CeilingTool } from './building/CeilingTool';
import { DoorInteractionController } from './building/DoorInteractionController';
import { BeamTool } from './building/BeamTool';
import { DoorTool } from './building/DoorTool';
import { FloorDetailManager } from './building/FloorDetailManager';
import { FloorDetailTool } from './building/FloorDetailTool';
import { FloorTool } from './building/FloorTool';
import { FurnitureManager } from './building/FurnitureManager';
import { FurnitureTool } from './building/FurnitureTool';
import type { FurnitureDefinition } from './building/FurnitureTypes';
import { FoundationManager } from './building/FoundationManager';
import { FoundationTool } from './building/FoundationTool';
import type {
	BuildingSettings,
	BuildUiState,
	FoundationDefinition,
	HotbarUiState
} from './building/FoundationTypes';
import type { BuildingLevelDefinition } from './building/BuildingLevelTypes';
import type { FoundationBuildingDefinition } from './building/WallTypes';
import { vertexSpacingFor } from './building/foundationMath';
import type { PaintUiState } from './building/PaintTool';
import { PaintTool } from './building/PaintTool';
import { PolygonWallTool } from './building/PolygonWallTool';
import { RemoveTool } from './building/RemoveTool';
import { RoofManager } from './building/RoofManager';
import { RoofTool } from './building/RoofTool';
import { roomLidsFromSlabs } from './building/skirtingMath';
import { SlabManager } from './building/SlabManager';
import { StairLevelTrigger } from './building/StairLevelTrigger';
import { StairManager, stairMaterial } from './building/StairManager';
import { StairTool } from './building/StairTool';
import { resolvePlayerPositionAgainstWalls } from './building/wallCollision';
import { WallManager } from './building/WallManager';
import { WallPathManager } from './building/WallPathManager';
import { WallTool } from './building/WallTool';
import { WindowTool } from './building/WindowTool';
import { WorldSurfaceSampler } from './building/WorldSurfaceSampler';
import { GraphicsPipeline } from './graphics/GraphicsPipeline';
import {
	createDefaultMusicVisualSettings,
	type GameSettingsHost
} from './settings/GameSettingsHost';
import { GraphicsSettingsStore } from './graphics/GraphicsSettingsStore';
import {
	createDefaultGraphicsSettings,
	GRAPHICS_PRESETS,
	type AntiAliasMode,
	type AoQuality,
	type GraphicsQuality,
	type GraphicsSettings
} from './graphics/GraphicsTypes';
import { FirstPersonController } from './player/FirstPersonController';
import { resolveFogColor } from './sky/atmosphereMath';
import {
	advanceTimeOfDay,
	ensureDayCycleSettings,
	resolveEffectiveSky,
	type EffectiveSkyLook
} from './sky/dayNightMath';
import { CloudSystem } from './sky/CloudSystem';
import { HdriEnvironmentSystem } from './sky/HdriEnvironmentSystem';
import { SkySystem } from './sky/SkySystem';
import { createDefaultSkySettings, type SkySettings } from './sky/SkyTypes';
import { worldToChunkCoord } from './terrain/chunkKey';
import { terrainMaterial } from './terrain/TerrainChunk';
import { TerrainManager } from './terrain/TerrainManager';
import { createDefaultTerrainSettings, type TerrainSettings } from './terrain/TerrainSettings';
import { TreeManager } from './vegetation/TreeManager';
import {
	createDefaultVegetationSettings,
	type VegetationSettings
} from './vegetation/VegetationTypes';
import type { WorldRevisionCounters, WorldRuntime } from './world/WorldSerializer';
import { sanitizePlayerState } from './world/WorldSerializer';
import {
	createEmptyProceduralOverrides,
	type ProceduralWorldOverrides,
	type SavedPlayerState,
	type WorldDefinition,
	type WorldEnvironmentDefinition
} from './world/WorldTypes';

/** Sun light offset distance (world units) from the camera — see updateSunLightPosition(). */
const SUN_LIGHT_DISTANCE = 300;

/**
 * Recursively copies `source`'s own values into `target`, keeping `target`'s object identity at
 * every level.
 *
 * Loading a world must not swap the settings *objects*: every manager, build tool and the settings
 * menu captured a reference to the exact instances created at startup, so replacing them would
 * leave half the game reading a settings object nothing else can see. Assigning into them in place
 * keeps one authoritative instance per settings tree, which is the same reason the settings menu
 * mutates these objects rather than emitting new ones.
 */
function deepAssign<T extends object>(target: T, source: Partial<T>): void {
	for (const [key, value] of Object.entries(source)) {
		const current = (target as Record<string, unknown>)[key];
		if (
			value !== null &&
			typeof value === 'object' &&
			!Array.isArray(value) &&
			current !== null &&
			typeof current === 'object' &&
			!Array.isArray(current)
		) {
			deepAssign(current as object, value as object);
		} else if (value !== undefined) {
			(target as Record<string, unknown>)[key] = Array.isArray(value) ? [...value] : value;
		}
	}
}

/** Player's horizontal collision radius against building walls — see resolveHorizontalCollision wiring below. */
const PLAYER_COLLISION_RADIUS = 0.35;

export interface SceneStats {
	creatures: CreatureRuntimeManager['stats'];
	fps: number;
	frameTimeMs: number;
	playerX: number;
	playerY: number;
	playerZ: number;
	chunkX: number;
	chunkZ: number;
	loadedChunks: number;
	queuedChunks: number;
	revision: number;
	triangles: number;
	loadedVegetationChunks: number;
	queuedVegetationChunks: number;
	treeInstances: number;
	vegetationRevision: number;
	graphicsQuality: GraphicsQuality;
	renderScale: number;
	pixelRatio: number;
	drawCalls: number;
	geometries: number;
	textures: number;
	shadowsEnabled: boolean;
	shadowCascades: number;
	shadowDistance: number;
	aoEnabled: boolean;
	aoQuality: AoQuality;
	antialiasing: AntiAliasMode;
	showRenderStats: boolean;
	dayCycleEnabled: boolean;
	timeOfDay: number;
}

export interface ThreeSceneOptions {
	container: HTMLElement;
	settings: TerrainSettings;
	buildingSettings: BuildingSettings;
	vegetationSettings: VegetationSettings;
	skySettings: SkySettings;
	onStatsUpdate?: (stats: SceneStats) => void;
	onPointerLockChange?: (locked: boolean) => void;
	onHotbarChange?: (state: HotbarUiState) => void;
	onBuildHudChange?: (hud: BuildUiState | null) => void;
	onLookedAtDoorChange?: (openingId: string | null) => void;
	onPaintPaletteChange?: (open: boolean) => void;
	onPaintStateChange?: (state: PaintUiState) => void;
	onGraphicsQualityChange?: (quality: GraphicsQuality) => void;
	onPlacementCustomizeChange?: (open: boolean) => void;
	onPlacementHeightChange?: (open: boolean) => void;
	/**
	 * The world to open. Its `environment` settings are copied into the live settings objects and
	 * its authored content is loaded, so the scene starts as an exact reproduction of the save
	 * rather than as defaults that are then patched. Omitted only by tests/tools that want a
	 * scratch scene.
	 */
	world?: WorldDefinition;
}

/**
 * Owns the Three.js scene graph, render loop and window/element resize handling. This is the
 * only place that talks to both TerrainManager and FirstPersonController — Svelte never touches
 * Three.js objects directly, it just mounts a container element and forwards lifecycle calls here.
 *
 * NOTE on huge worlds: every world position here (chunk vertices, player position, camera
 * position) is a "logical world coordinate" in the same space TerrainHeightSampler samples from.
 * A future floating-origin system could periodically re-center the renderer (moving the Three.js
 * scene contents near (0,0,0) for float precision) without changing how terrain is *generated* —
 * generation must keep using true logical world coordinates so it stays deterministic and
 * multiplayer-compatible. That rebasing step is intentionally not implemented yet.
 */
export class ThreeScene implements WorldRuntime {
	devPanelOpen = false;
	/** Pause menu: the render loop keeps running, but the day/night clock does not. */
	simulationPaused = false;
	readonly buildingSettings: BuildingSettings;
	private readonly container: HTMLElement;
	private readonly settings: TerrainSettings;
	private readonly vegetationSettings: VegetationSettings;
	private readonly skySettings: SkySettings;
	private readonly onStatsUpdate?: (stats: SceneStats) => void;

	private readonly scene: THREE.Scene;
	private readonly camera: THREE.PerspectiveCamera;
	private readonly renderer: THREE.WebGLRenderer;
	private readonly terrainManager: TerrainManager;
	private readonly treeManager: TreeManager;
	private readonly materialManager: BuildingMaterialManager;
	private readonly foundationManager: FoundationManager;
	private readonly wallManager: WallManager;
	private readonly wallPathManager: WallPathManager;
	private readonly slabManager: SlabManager;
	private readonly stairManager: StairManager;
	private readonly stairLevelTrigger: StairLevelTrigger;
	private readonly roofManager: RoofManager;
	private readonly floorDetailManager: FloorDetailManager;
	private readonly furnitureManager: FurnitureManager;
	private readonly levelManager: BuildingLevelManager;
	private readonly undoManager: BuildUndoManager;
	private readonly buildingManager: BuildingManager;
	private readonly removalManager: BuildingRemovalManager;
	private readonly worldSurfaceSampler: WorldSurfaceSampler;
	private readonly controller: FirstPersonController;
	private readonly foundationTool: FoundationTool;
	private readonly wallTool: WallTool;
	private readonly windowTool: WindowTool;
	private readonly doorTool: DoorTool;
	private readonly beamTool: BeamTool;
	private readonly doorInteraction: DoorInteractionController;
	private readonly polygonWallTool: PolygonWallTool;
	private readonly ceilingTool: CeilingTool;
	private readonly floorTool: FloorTool;
	private readonly roofTool: RoofTool;
	private readonly stairTool: StairTool;
	private readonly floorCarpetTool: FloorDetailTool;
	private readonly floorPathTool: FloorDetailTool;
	private readonly floorPlanksTool: FloorDetailTool;
	private readonly floorTilesTool: FloorDetailTool;
	private readonly furnitureTool: FurnitureTool;
	readonly music: MusicPlantPlacementTool;
	readonly creatures: CreatureRuntimeManager;
	readonly sustainSettings: SustainSettings;
	readonly musicVisual = createDefaultMusicVisualSettings();
	readonly settingsHost: GameSettingsHost;
	private readonly removeTool: RemoveTool;
	private readonly paintTool: PaintTool;
	private readonly buildToolManager: BuildToolManager;
	private readonly resizeObserver: ResizeObserver;

	private readonly graphicsSettings: GraphicsSettings;
	private readonly graphicsSettingsStore = new GraphicsSettingsStore();
	private readonly graphicsPipeline: GraphicsPipeline;
	/**
	 * The world's own view distances — quality-driven render-distance scaling (see
	 * applyRenderDistanceForQuality) always derives from these fixed baselines, never from its own
	 * previous output, so repeated quality switching can't compound the scaling down to nothing.
	 * Re-established when a world is loaded, since the saved world defines the baseline and the local
	 * graphics preset only scales it.
	 */
	private baseTerrainViewDistance: number;
	private baseTreeViewDistanceChunks: number;

	/** Bumped whenever world-defining generation settings change (debug GUI edits, world load). Polled by world persistence — see WorldRevisionCounters. */
	private environmentRevision = 0;

	private readonly skySystem: SkySystem;
	private readonly cloudSystem: CloudSystem;
	private readonly hdriSystem: HdriEnvironmentSystem;
	private readonly hemisphereLight: THREE.HemisphereLight;
	private readonly sunLight: THREE.DirectionalLight;

	private lastFrameTimeMs = 0;
	private dayNightLook: EffectiveSkyLook | null = null;
	private dayCyclePersistAccum = 0;
	private lastPersistedTimeOfDay = -1;

	private animationFrameId = 0;
	private disposed = false;

	private statsAccumSeconds = 0;
	private statsFrameCount = 0;

	private readonly dirty = {
		topology: false,
		viewDistance: false,
		settings: false,
		seed: false,
		rendering: false,
		vegetationSettings: false,
		vegetationViewDistance: false
	};

	constructor(options: ThreeSceneOptions) {
		this.container = options.container;
		this.settings = options.settings;
		this.vegetationSettings = options.vegetationSettings;
		this.skySettings = options.skySettings;
		this.onStatsUpdate = options.onStatsUpdate;
		this.baseTerrainViewDistance = options.settings.viewDistance;
		this.baseTreeViewDistanceChunks = options.vegetationSettings.loading.treeViewDistanceChunks;

		this.scene = new THREE.Scene();

		this.camera = new THREE.PerspectiveCamera(70, 1, 0.1, 2000);

		// `antialias: false` — MSAA on the main canvas would be redundant/wasteful once the
		// GraphicsPipeline's own postprocessing AA pass (FXAA/SMAA, chosen per quality preset) runs;
		// see GraphicsPipeline's class doc for the full postprocessing pipeline.
		this.renderer = new THREE.WebGLRenderer({ antialias: false });
		this.container.appendChild(this.renderer.domElement);

		// Visible sky: a procedural gradient dome + a couple of large soft cloud sheets, both
		// re-centred on the camera every frame (see animate()) so an infinite world never has an
		// edge to reach. The HDRI below only ever contributes lighting/reflections — see SkyTypes.ts.
		this.skySystem = new SkySystem();
		this.scene.add(this.skySystem.mesh);
		this.cloudSystem = new CloudSystem();
		this.scene.add(this.cloudSystem.group);

		this.hemisphereLight = new THREE.HemisphereLight(0xdcefff, 0x40391f, 0.9);
		this.scene.add(this.hemisphereLight);
		this.sunLight = new THREE.DirectionalLight(0xffffff, 1);
		this.scene.add(this.sunLight);
		this.scene.add(this.sunLight.target);

		const savedGraphicsQuality = this.graphicsSettingsStore.getQuality();
		this.graphicsSettings = createDefaultGraphicsSettings();
		if (savedGraphicsQuality) this.graphicsSettings.quality = savedGraphicsQuality;
		this.graphicsPipeline = new GraphicsPipeline({
			renderer: this.renderer,
			scene: this.scene,
			camera: this.camera,
			sunLight: this.sunLight,
			settings: this.graphicsSettings,
			onQualityChange: (quality) => {
				this.graphicsSettingsStore.setQuality(quality);
				this.applyRenderDistanceForQuality(quality);
				options.onGraphicsQualityChange?.(quality);
			}
		});

		this.hdriSystem = new HdriEnvironmentSystem(this.renderer, this.scene, this.skySettings.hdri);

		this.terrainManager = new TerrainManager(this.settings);
		this.scene.add(this.terrainManager.group);
		this.graphicsPipeline.registerMaterial(terrainMaterial);
		this.graphicsPipeline.registerMaterial(stairMaterial);
		const glassMaterial = getGlassMaterial();
		this.graphicsPipeline.registerMaterial(glassMaterial);

		const buildingSettings = options.buildingSettings;
		this.buildingSettings = buildingSettings;
		this.materialManager = new BuildingMaterialManager((material) =>
			this.graphicsPipeline.registerMaterial(material)
		);
		this.foundationManager = new FoundationManager(
			() => vertexSpacingFor(this.settings.chunkSize, this.settings.chunkResolution),
			this.materialManager
		);
		this.scene.add(this.foundationManager.group);

		this.wallManager = new WallManager({
			getFoundation: (id) => this.foundationManager.getFoundation(id),
			getVertexSpacing: () =>
				vertexSpacingFor(this.settings.chunkSize, this.settings.chunkResolution),
			getBuildingGridSize: () => buildingSettings.buildingGridSize,
			materialManager: this.materialManager,
			buildingSettings,
			glassMaterial,
			getRoomLids: (foundationId) =>
				roomLidsFromSlabs(
					this.slabManager.getSlabsForFoundation(foundationId),
					buildingSettings.buildingGridSize
				)
		});
		this.scene.add(this.wallManager.group);
		this.wallPathManager = new WallPathManager({
			getFoundation: (id) => this.foundationManager.getFoundation(id),
			getVertexSpacing: () =>
				vertexSpacingFor(this.settings.chunkSize, this.settings.chunkResolution),
			getBuildingGridSize: () => buildingSettings.buildingGridSize,
			materialManager: this.materialManager,
			buildingSettings,
			glassMaterial,
			getRoomLids: (foundationId) =>
				roomLidsFromSlabs(
					this.slabManager.getSlabsForFoundation(foundationId),
					buildingSettings.buildingGridSize
				)
		});
		this.scene.add(this.wallPathManager.group);

		this.levelManager = new BuildingLevelManager(buildingSettings);

		this.slabManager = new SlabManager({
			getFoundation: (id) => this.foundationManager.getFoundation(id),
			getVertexSpacing: () =>
				vertexSpacingFor(this.settings.chunkSize, this.settings.chunkResolution),
			getBuildingGridSize: () => buildingSettings.buildingGridSize,
			materialManager: this.materialManager,
			buildingSettings
		});
		this.scene.add(this.slabManager.group);

		this.stairManager = new StairManager({
			getFoundation: (id) => this.foundationManager.getFoundation(id),
			getVertexSpacing: () =>
				vertexSpacingFor(this.settings.chunkSize, this.settings.chunkResolution),
			materialManager: this.materialManager,
			buildingSettings
		});
		this.scene.add(this.stairManager.group);
		this.stairLevelTrigger = new StairLevelTrigger(this.stairManager, this.levelManager);

		this.roofManager = new RoofManager({
			getFoundation: (id) => this.foundationManager.getFoundation(id),
			getVertexSpacing: () =>
				vertexSpacingFor(this.settings.chunkSize, this.settings.chunkResolution),
			getBuildingGridSize: () => buildingSettings.buildingGridSize,
			materialManager: this.materialManager
		});
		this.scene.add(this.roofManager.group);

		this.floorDetailManager = new FloorDetailManager({
			getFoundation: (id) => this.foundationManager.getFoundation(id),
			getVertexSpacing: () =>
				vertexSpacingFor(this.settings.chunkSize, this.settings.chunkResolution),
			getBuildingGridSize: () => buildingSettings.buildingGridSize
		});
		this.scene.add(this.floorDetailManager.group);

		this.furnitureManager = new FurnitureManager();
		this.scene.add(this.furnitureManager.group);
		for (const material of this.furnitureManager.getMaterials()) {
			this.graphicsPipeline.registerMaterial(material);
		}

		this.buildingManager = new BuildingManager({
			foundationManager: this.foundationManager,
			wallManager: this.wallManager,
			wallPathManager: this.wallPathManager,
			slabManager: this.slabManager,
			stairManager: this.stairManager,
			roofManager: this.roofManager,
			floorDetailManager: this.floorDetailManager,
			getVertexSpacing: () =>
				vertexSpacingFor(this.settings.chunkSize, this.settings.chunkResolution),
			getBuildingGridSize: () => buildingSettings.buildingGridSize,
			getCornerOpeningMargin: () => buildingSettings.cornerOpeningMargin
		});

		this.undoManager = new BuildUndoManager(this.buildingManager, {
			removeFurniture: (id) => this.furnitureManager.remove(id)
		});
		this.removalManager = new BuildingRemovalManager(this.buildingManager);

		this.worldSurfaceSampler = new WorldSurfaceSampler(
			this.terrainManager.getHeightSampler(),
			this.foundationManager,
			this.slabManager,
			this.stairManager,
			this.roofManager,
			() => buildingSettings.maxStepHeight
		);

		this.treeManager = new TreeManager({
			settings: options.vegetationSettings,
			terrainSettings: this.settings,
			terrainHeightSampler: this.terrainManager.getHeightSampler(),
			foundationManager: this.foundationManager,
			seed: this.settings.seed
		});
		this.scene.add(this.treeManager.group);
		this.terrainManager.setVegetationRegionSampler(this.treeManager.getVegetationRegionSampler());
		for (const material of this.treeManager.getSharedMaterials()) {
			this.graphicsPipeline.registerMaterial(material);
		}

		this.controller = new FirstPersonController({
			domElement: this.renderer.domElement,
			camera: this.camera,
			getSupportingSurfaceY: (x, z, referenceY) =>
				this.worldSurfaceSampler.getSupportingSurfaceY(x, z, referenceY),
			getCeilingBlockY: (x, z, fromY, toY) =>
				this.worldSurfaceSampler.getCeilingBlockY(x, z, fromY, toY),
			settings: this.settings.player,
			onPointerLockChange: options.onPointerLockChange,
			resolveHorizontalCollision: (x, z, feetY, headY) => {
				const creaturePosition = this.creatures?.resolvePlayer(x, z, feetY, headY) ?? { x, z };
				return resolvePlayerPositionAgainstWalls(
					creaturePosition.x,
					creaturePosition.z,
					feetY,
					headY,
					PLAYER_COLLISION_RADIUS,
					[
						...this.wallManager.getAllCollisionRects(),
						...this.wallPathManager.getAllCollisionRects(),
						...this.stairManager.getAllCollisionRects(),
						...(this.doorInteraction?.getCollisionRects() ?? [])
					]
				);
			}
		});

		this.controller.spawn(0, 0);
		this.terrainManager.primeAround(0, 0, 1);

		this.foundationTool = new FoundationTool({
			scene: this.scene,
			camera: this.camera,
			terrainHeightSampler: this.terrainManager.getHeightSampler(),
			getTerrainMeshes: () => this.terrainManager.getActiveMeshes(),
			foundationManager: this.foundationManager,
			terrainSettings: this.settings,
			buildingSettings,
			onHudChange: options.onBuildHudChange
		});

		this.wallTool = new WallTool({
			scene: this.scene,
			camera: this.camera,
			foundationManager: this.foundationManager,
			buildingManager: this.buildingManager,
			levelManager: this.levelManager,
			undoManager: this.undoManager,
			terrainSettings: this.settings,
			buildingSettings,
			onHudChange: options.onBuildHudChange
		});

		this.windowTool = new WindowTool({
			scene: this.scene,
			camera: this.camera,
			buildingManager: this.buildingManager,
			levelManager: this.levelManager,
			undoManager: this.undoManager,
			buildingSettings,
			onHudChange: options.onBuildHudChange
		});

		this.doorTool = new DoorTool({
			scene: this.scene,
			camera: this.camera,
			buildingManager: this.buildingManager,
			levelManager: this.levelManager,
			undoManager: this.undoManager,
			buildingSettings,
			onHudChange: options.onBuildHudChange
		});

		this.beamTool = new BeamTool({
			scene: this.scene,
			camera: this.camera,
			buildingManager: this.buildingManager,
			levelManager: this.levelManager,
			undoManager: this.undoManager,
			buildingSettings,
			onHudChange: options.onBuildHudChange
		});

		this.polygonWallTool = new PolygonWallTool({
			scene: this.scene,
			camera: this.camera,
			foundationManager: this.foundationManager,
			buildingManager: this.buildingManager,
			levelManager: this.levelManager,
			undoManager: this.undoManager,
			terrainSettings: this.settings,
			buildingSettings,
			onHudChange: options.onBuildHudChange
		});

		this.ceilingTool = new CeilingTool({
			scene: this.scene,
			camera: this.camera,
			foundationManager: this.foundationManager,
			buildingManager: this.buildingManager,
			levelManager: this.levelManager,
			undoManager: this.undoManager,
			terrainSettings: this.settings,
			buildingSettings,
			onHudChange: options.onBuildHudChange
		});

		this.floorTool = new FloorTool({
			scene: this.scene,
			camera: this.camera,
			foundationManager: this.foundationManager,
			buildingManager: this.buildingManager,
			levelManager: this.levelManager,
			undoManager: this.undoManager,
			terrainSettings: this.settings,
			buildingSettings,
			onHudChange: options.onBuildHudChange
		});

		this.roofTool = new RoofTool({
			scene: this.scene,
			camera: this.camera,
			foundationManager: this.foundationManager,
			buildingManager: this.buildingManager,
			levelManager: this.levelManager,
			undoManager: this.undoManager,
			terrainSettings: this.settings,
			buildingSettings,
			onHudChange: options.onBuildHudChange
		});

		this.stairTool = new StairTool({
			scene: this.scene,
			camera: this.camera,
			foundationManager: this.foundationManager,
			buildingManager: this.buildingManager,
			levelManager: this.levelManager,
			terrainSettings: this.settings,
			buildingSettings,
			onHudChange: options.onBuildHudChange
		});
		for (const material of this.stairTool.getPreviewMaterials()) {
			this.graphicsPipeline.registerMaterial(material);
		}

		const floorDetailToolOptions = {
			scene: this.scene,
			camera: this.camera,
			foundationManager: this.foundationManager,
			buildingManager: this.buildingManager,
			levelManager: this.levelManager,
			undoManager: this.undoManager,
			terrainSettings: this.settings,
			buildingSettings,
			onHudChange: options.onBuildHudChange
		};
		this.floorCarpetTool = new FloorDetailTool({ ...floorDetailToolOptions, kind: 'carpet' });
		this.floorPathTool = new FloorDetailTool({ ...floorDetailToolOptions, kind: 'path' });
		this.floorPlanksTool = new FloorDetailTool({ ...floorDetailToolOptions, kind: 'planks' });
		this.floorTilesTool = new FloorDetailTool({ ...floorDetailToolOptions, kind: 'tiles' });
		for (const tool of [
			this.floorCarpetTool,
			this.floorPathTool,
			this.floorPlanksTool,
			this.floorTilesTool
		]) {
			for (const material of tool.getPreviewMaterials()) {
				this.graphicsPipeline.registerMaterial(material);
			}
		}

		this.furnitureTool = new FurnitureTool({
			scene: this.scene,
			camera: this.camera,
			buildingManager: this.buildingManager,
			furnitureManager: this.furnitureManager,
			undoManager: this.undoManager,
			getTerrainMeshes: () => this.terrainManager.getActiveMeshes(),
			onHudChange: options.onBuildHudChange
		});
		for (const material of this.furnitureTool.getPreviewMaterials()) {
			this.graphicsPipeline.registerMaterial(material);
		}

		this.sustainSettings = createDefaultSustainSettings();
		let musicObstacleRevision = '';
		let musicObstacles: THREE.Box3[] = [];
		const naturalGroundBlocked = (x: number, z: number, radius = 0.2, height = 2) => {
			if (this.foundationManager.getTopYAt(x, z) !== null) return true;
			const y = this.worldSurfaceSampler.getSupportingSurfaceY(x, z, -Infinity);
			if (this.worldSurfaceSampler.getCeilingBlockY(x, z, y, y + 2) !== null) return true;
			const revision = `${this.buildingManager.getRevision()}:${this.foundationManager.getRevision()}`;
			if (revision !== musicObstacleRevision) {
				musicObstacleRevision = revision;
				musicObstacles = [
					...this.buildingManager.getRaycastableWallMeshes(),
					...this.buildingManager.getRaycastableStairMeshes(),
					...this.foundationManager.getMeshes()
				].map((m) => new THREE.Box3().setFromObject(m).expandByScalar(0.25));
			}
			return musicObstacles.some(
				(box) =>
					x + radius >= box.min.x &&
					x - radius <= box.max.x &&
					z + radius >= box.min.z &&
					z - radius <= box.max.z &&
					y < box.max.y &&
					y + height > box.min.y
			);
		};
		this.music = new MusicPlantPlacementTool({
			scene: this.scene,
			camera: this.camera,
			surface: (x, z) => this.worldSurfaceSampler.getSupportingSurfaceY(x, z, -Infinity),
			targets: () => [...this.terrainManager.getActiveMeshes()],
			sustainSettings: this.sustainSettings,
			blocked: naturalGroundBlocked,
			hud: options.onBuildHudChange
		});
		this.creatures = new CreatureRuntimeManager(
			this.settings.seed,
			{
				surface: (x, z) => this.worldSurfaceSampler.getSupportingSurfaceY(x, z, -Infinity),
				blocked: naturalGroundBlocked
			},
			options.world?.creatures,
			(m) => this.graphicsPipeline.registerMaterial(m)
		);
		this.scene.add(this.creatures.group);
		this.removeTool = new RemoveTool({
			music: this.music,
			furniture: this.furnitureManager,
			scene: this.scene,
			camera: this.camera,
			buildingManager: this.buildingManager,
			removalManager: this.removalManager,
			buildingSettings,
			onHudChange: options.onBuildHudChange
		});

		this.paintTool = new PaintTool({
			scene: this.scene,
			camera: this.camera,
			buildingManager: this.buildingManager,
			materialManager: this.materialManager,
			buildingSettings,
			onHudChange: options.onBuildHudChange,
			onPaintPaletteChange: options.onPaintPaletteChange,
			onPaintStateChange: options.onPaintStateChange
		});

		this.doorInteraction = new DoorInteractionController({
			camera: this.camera,
			getHingePivots: () => this.buildingManager.getDoorHingePivots(),
			onLookedAtDoorChange: options.onLookedAtDoorChange
		});

		this.buildToolManager = new BuildToolManager({
			domElement: this.renderer.domElement,
			tools: {
				foundation: this.foundationTool,
				wall: this.wallTool,
				window: this.windowTool,
				door: this.doorTool,
				beam: this.beamTool,
				'polygon-wall': this.polygonWallTool,
				ceiling: this.ceilingTool,
				floor: this.floorTool,
				'flat-roof': this.roofTool,
				stairs: this.stairTool,
				'floor-carpet': this.floorCarpetTool,
				'floor-path': this.floorPathTool,
				'floor-planks': this.floorPlanksTool,
				'floor-tiles': this.floorTilesTool,
				torch: this.furnitureTool
			},
			removeTool: this.removeTool,
			paintTool: this.paintTool,
			musicTool: this.music,
			isInputBlocked: () =>
				this.devPanelOpen || this.music.importPanelOpen || this.music.committing,
			isPointerLocked: () => this.controller.isPointerLocked(),
			onHotbarChange: options.onHotbarChange,
			onHudChange: options.onBuildHudChange,
			onPlacementCustomizeChange: options.onPlacementCustomizeChange,
			onPlacementHeightChange: options.onPlacementHeightChange
		});

		this.settingsHost = {
			creatures: this.creatures,
			terrain: this.settings,
			vegetation: this.vegetationSettings,
			sky: this.skySettings,
			graphics: this.graphicsSettings,
			building: buildingSettings,
			music: this.music,
			sustain: this.sustainSettings,
			musicVisual: this.musicVisual,
			actions: {
				creatureLab: () => window.dispatchEvent(new Event('forest:creature-lab')),
				creatureDemo: () => this.creatures.showDemo(this.controller.worldPosition),
				creatureEndDemo: () => this.creatures.endDemo(),
				terrainSeed: () => {
					this.environmentRevision++;
					this.dirty.seed = true;
				},
				terrainSettings: () => {
					this.environmentRevision++;
					this.dirty.settings = true;
				},
				terrainTopology: () => {
					this.environmentRevision++;
					this.dirty.topology = true;
				},
				terrainViewDistance: () => {
					// View distance is a local performance choice, not part of the world's definition, so
					// it deliberately doesn't bump `environmentRevision` — see normalizeEnvironmentForSave.
					this.baseTerrainViewDistance = this.settings.viewDistance;
					this.dirty.viewDistance = true;
				},
				terrainRendering: () => {
					this.dirty.rendering = true;
				},
				foundationBounds: () => {
					this.foundationManager.setShowBounds(buildingSettings.showFoundationBounds);
				},
				wallBounds: () => {
					this.wallManager.setShowBounds(buildingSettings.showWallBounds);
					this.wallPathManager.setShowBounds(buildingSettings.showWallBounds);
				},
				openingVisuals: () => {
					this.wallManager.rebuildAllWalls();
					this.wallPathManager.rebuildAllPaths();
				},
				wallFraming: () => {
					this.wallManager.rebuildAllWalls();
					this.wallPathManager.rebuildAllPaths();
				},
				stairwellFraming: () => {
					this.stairManager.rebuildAllStairs();
					this.slabManager.rebuildAllSlabs();
				},
				slabBounds: () => {
					this.slabManager.setShowBounds(buildingSettings.showSlabBounds);
				},
				stairBounds: () => {
					this.stairManager.setShowBounds(buildingSettings.showStairBounds);
				},
				roofBounds: () => {
					this.roofManager.setShowBounds(buildingSettings.showRoofBounds);
				},
				floorDetailBounds: () => {
					this.floorDetailManager.setShowBounds(buildingSettings.showFloorDetailBounds);
				},
				removalProxies: () => {
					this.removeTool.setShowPickingProxies(buildingSettings.showRemovalPickingProxies);
				},
				vegetationSettings: () => {
					this.environmentRevision++;
					this.dirty.vegetationSettings = true;
				},
				vegetationViewDistance: () => {
					this.baseTreeViewDistanceChunks = this.vegetationSettings.loading.treeViewDistanceChunks;
					this.dirty.vegetationViewDistance = true;
				},
				vegetationBorders: () => {
					this.treeManager.setBorderVisibility(this.vegetationSettings.debug.showTreeChunkBorders);
				},
				sky: () => {
					this.environmentRevision++;
					this.applySkySettings();
				},
				graphicsQuality: (quality) => {
					this.graphicsPipeline.setQuality(quality as GraphicsQuality);
				},
				graphicsAdvanced: () => {
					this.graphicsPipeline.refreshAdvancedSettings();
					this.emitStats();
				},
				graphicsExposure: () =>
					this.graphicsPipeline.setToneMappingExposure(this.graphicsSettings.toneMappingExposure),
				graphicsAo: () => this.graphicsPipeline.refreshAoTuning(),
				graphicsExport: () => this.exportGraphicsSettings(),
				musicLoop: (key, value) => {
					this.music.changeLoop({ [key]: value });
				},
				musicWave: () => {
					for (const runtime of this.music.runtimes.values()) {
						runtime.wave.material.uniforms.width.value = this.musicVisual.waveWidth;
						runtime.wave.material.uniforms.opacity.value = this.musicVisual.waveOpacity;
						runtime.wave.material.uniforms.glow.value = this.musicVisual.waveGlow;
					}
				},
				musicVolume: () => {
					for (const runtime of this.music.runtimes.values())
						runtime.sequencer.volume = this.musicVisual.masterMusicVolume;
				},
				musicTrails: () => this.music.rebuildAllTrails()
			}
		};

		// Sky/lights/fog are cheap to apply directly (no dirty-flag batching needed — see
		// the settings menu's sky actions) and don't depend on the HDRI having finished
		// loading, so the world looks right from the very first frame. The HDRI itself loads async
		// and only affects lighting/reflections (and optionally the background) once it resolves.
		this.applySkySettings();
		const hdrUrl = new URL('hdri/sky.hdr', document.baseURI).toString();
		void this.hdriSystem
			.initialize(hdrUrl, this.skySettings.sky.topColor, this.skySettings.sky.horizonColor)
			.then(() => this.applySkySettings());

		this.resizeObserver = new ResizeObserver(() => this.handleResize());
		this.resizeObserver.observe(this.container);
		this.handleResize();

		// Loading happens last, after every manager and tool exists, so restoring a world is exactly
		// the same code path as building one interactively — nothing has to be "pre-seeded" during
		// construction, which is what keeps load and play from drifting apart.
		if (options.world) this.loadWorld(options.world);

		if (new URLSearchParams(location.search).has('musicTest'))
			(window as unknown as { forestScene: ThreeScene }).forestScene = this;
		this.animationFrameId = requestAnimationFrame(this.animate);
	}

	/**
	 * Reproduces a saved world in the running scene.
	 *
	 * Order matters and is not arbitrary: environment settings first (so terrain/vegetation
	 * regenerate from the right parameters and seed), then foundations (walls reference them), then
	 * buildings and levels, then procedural overrides, and the player last. Nothing here creates
	 * geometry directly — it hands logical definitions to the same managers the build tools use, and
	 * they rebuild meshes, collision and picking data themselves.
	 */
	private loadWorld(world: WorldDefinition): void {
		this.applyEnvironment(world.environment, world.seed);

		this.foundationManager.load(structuredClone(world.foundations));
		this.buildingManager.load(structuredClone(world.buildings));
		this.levelManager.load(structuredClone(world.buildingLevels));
		this.music.load(world.musicTrees ?? [], world.musicPlants ?? []);
		this.furnitureManager.load(world.furniture ?? []);

		this.treeManager.setRemovedTreeIds(world.proceduralOverrides?.removedTreeIds ?? []);

		const player = sanitizePlayerState(world.player);
		if (world.saveRevision > 1 || player.position.y !== 0) {
			this.controller.restoreState(player.position, player.yaw, player.pitch);
		} else {
			// A never-played world has no meaningful saved position; spawn onto the terrain surface
			// rather than restoring the placeholder (0,0,0), which would drop the player underground.
			this.controller.spawn(player.position.x, player.position.z);
		}
		if (player.currentLevelIndexByFoundation) {
			this.levelManager.restoreCurrentLevelIndexes(player.currentLevelIndexByFoundation);
		}
		if (player.activeFoundationId)
			this.levelManager.lockActiveFoundation(player.activeFoundationId);

		this.terrainManager.primeAround(player.position.x, player.position.z, 1);
	}

	/**
	 * Copies a saved environment into the live settings objects *in place* rather than replacing
	 * them: every manager, tool and GUI controller holds a reference to these exact objects, so
	 * swapping the references would leave half the game reading a stale settings instance.
	 */
	private applyEnvironment(environment: WorldEnvironmentDefinition, seed: string): void {
		this.environmentRevision++;

		deepAssign(this.settings, environment.terrain);
		this.settings.seed = seed;
		deepAssign(this.vegetationSettings, environment.vegetation);
		deepAssign(this.skySettings, environment.sky);
		ensureDayCycleSettings(this.skySettings);
		this.lastPersistedTimeOfDay = this.skySettings.dayCycle.timeOfDay;

		// The saved view distances are the world's own baseline; the active graphics preset re-applies
		// its multiplier on top (see applyRenderDistanceForQuality), so a world never inherits the
		// render distance of whatever machine last saved it.
		this.baseTerrainViewDistance = this.settings.viewDistance;
		this.baseTreeViewDistanceChunks = this.vegetationSettings.loading.treeViewDistanceChunks;
		this.applyRenderDistanceForQuality(this.graphicsSettings.quality);

		this.terrainManager.notifyTopologyChanged();
		this.terrainManager.notifySeedChanged();
		this.treeManager.notifySeedChanged(seed);
		this.applySkySettings();
	}

	/** Lets the Svelte hotbar UI's trash icon toggle Remove Mode by click, in addition to the `X` key shortcut. */
	toggleRemoveMode(): void {
		this.buildToolManager.toggleRemoveMode();
	}

	/** Lets the Svelte hotbar UI's paint icon toggle Paint Mode by click, in addition to the `P` key shortcut. */
	togglePaintMode(): void {
		this.buildToolManager.togglePaintMode();
	}

	/** Lets the Svelte MaterialPalette select a colour (or `undefined` for "Default") by click. */
	selectPaintMaterial(material: Parameters<PaintTool['selectMaterial']>[0]): void {
		this.paintTool.selectMaterial(material);
	}

	/** Saves the currently selected paint colour as a reusable preset — returns `null` if "Default" is selected (nothing to save). */
	savePaintPreset(name?: string): ReturnType<PaintTool['savePreset']> {
		return this.paintTool.savePreset(name);
	}

	removePaintPreset(id: string): void {
		this.paintTool.removePreset(id);
	}

	/** Lets the Svelte MaterialPalette's own Close button (or clicking outside it) close the palette without needing to simulate a `C` key press. */
	closePaintPalette(): void {
		this.paintTool.closePalette();
	}

	closePlacementCustomize(): void {
		this.buildToolManager.closePlacementCustomize();
	}

	closePlacementHeight(): void {
		this.buildToolManager.closePlacementHeight();
	}

	/** Lets the Svelte hotbar UI select a slot by click, in addition to the number-key shortcuts. */
	selectHotbarSlot(slot: number): void {
		this.buildToolManager.selectSlot(slot);
	}

	/** Lets the on-screen floor selector's ▲ button move up a level by click, identically to Page Up. */
	moveLevelUp(): void {
		this.levelManager.moveUp();
	}

	/**
	 * If no foundation is active yet, prefer the pad the player is standing on, or the only
	 * foundation in the world — so `]`/`[` and the floor selector work before a construction-plane hit.
	 */
	private suggestBuildingLevelFoundation(): void {
		if (this.levelManager.getActiveFoundationId() || this.levelManager.isFoundationLocked()) return;
		const position = this.controller.worldPosition;
		const standing = this.foundationManager.getFoundationContaining(position.x, position.z);
		if (standing) {
			this.levelManager.suggestActiveFoundation(standing.id);
			return;
		}
		const foundations = this.foundationManager.getFoundations();
		if (foundations.length === 1) this.levelManager.suggestActiveFoundation(foundations[0].id);
	}

	/** Lets the on-screen floor selector's ▼ button move down a level by click, identically to Page Down. */
	moveLevelDown(): void {
		this.levelManager.moveDown();
	}

	getGraphicsQuality(): GraphicsQuality {
		return this.graphicsPipeline.getQuality();
	}

	/** `L` cycles LOW → MEDIUM → HIGH → ULTRA → LOW, applies live (no reload, no world rebuild), and persists the choice — see GraphicsSettingsStore. Returns the newly-active quality so the caller (the `L`-key handler in +page.svelte) can show the "Graphics: X" HUD notification. */
	cycleGraphicsQuality(): GraphicsQuality {
		return this.graphicsPipeline.cycleQuality();
	}

	// ---------------------------------------------------------------------------------------------
	// WorldRuntime — the persistence port (see world/WorldSerializer.ts).
	//
	// These are the ONLY methods world persistence may call on the running game, and every one of
	// them returns plain logical data. Nothing here can reach a mesh, a geometry or a chunk cache,
	// which is what structurally guarantees the save format stays "the world" and never becomes "the
	// renderer's current contents".
	// ---------------------------------------------------------------------------------------------

	/**
	 * The world's generation settings, normalized so local machine preferences can't leak into a
	 * shared world: view distances are reported as the world's own baselines rather than whatever
	 * the active graphics preset scaled them to, and debug-view toggles are reset. Everything that
	 * genuinely defines how the world *looks* is included in full, including values equal to today's
	 * defaults — application defaults drift, and a world must keep looking like itself when they do.
	 */
	getEnvironment(): WorldEnvironmentDefinition {
		const terrain: TerrainSettings = {
			...structuredClone(this.settings),
			viewDistance: this.baseTerrainViewDistance,
			rendering: createDefaultTerrainSettings().rendering
		};
		const vegetation: VegetationSettings = structuredClone(this.vegetationSettings);
		vegetation.loading = {
			...vegetation.loading,
			treeViewDistanceChunks: this.baseTreeViewDistanceChunks
		};
		vegetation.debug = createDefaultVegetationSettings().debug;
		const sky: SkySettings = structuredClone(this.skySettings);
		sky.debug = createDefaultSkySettings().debug;
		return { terrain, vegetation, sky };
	}

	getFoundations(): FoundationDefinition[] {
		return this.foundationManager.serialize();
	}

	getMusicTrees() {
		return this.music.trees.map((t) => ({
			...t,
			loop: { ...t.loop, timeline: timelineDefinition(t.loop) }
		}));
	}
	getCreatureState() {
		return this.creatures.serialize();
	}
	placeCreature(definition: CreatureDefinition) {
		const forward = this.camera.getWorldDirection(new THREE.Vector3());
		const distance = Math.max(12, definition.species.proportions.bodyLength * 1.5);
		return this.creatures.place(definition, {
			x: this.camera.position.x + forward.x * distance,
			y: 0,
			z: this.camera.position.z + forward.z * distance
		});
	}
	getMusicPlants() {
		return this.music.plants.definitions;
	}
	getFurniture(): FurnitureDefinition[] {
		return this.furnitureManager.serialize();
	}
	getBuildings(): FoundationBuildingDefinition[] {
		return this.buildingManager.serialize();
	}

	getBuildingLevels(): BuildingLevelDefinition[] {
		return this.levelManager.serialize();
	}

	getPlayerState(): SavedPlayerState {
		const position = this.controller.worldPosition;
		return {
			position: { x: position.x, y: position.y, z: position.z },
			yaw: this.controller.getYaw(),
			pitch: this.controller.getPitch(),
			activeFoundationId: this.levelManager.getActiveFoundationId() ?? undefined,
			currentLevelIndexByFoundation: this.levelManager.getCurrentLevelIndexes()
		};
	}

	getProceduralOverrides(): ProceduralWorldOverrides {
		return {
			...createEmptyProceduralOverrides(),
			removedTreeIds: this.treeManager.getRemovedTreeIds()
		};
	}

	getRevisionCounters(): WorldRevisionCounters {
		return {
			structural:
				this.music.revision +
				this.creatures.revision +
				this.buildingManager.getRevision() +
				this.foundationManager.getRevision() +
				this.levelManager.getRevision() +
				this.furnitureManager.getRevision(),
			environment: this.environmentRevision,
			procedural: this.treeManager.getOverrideRevision()
		};
	}

	/**
	 * A small snapshot of the canvas for the Worlds browser.
	 *
	 * Re-renders once immediately before reading the canvas: with `preserveDrawingBuffer` left off
	 * (the default, and the faster one for every other frame the game draws), the buffer is not
	 * guaranteed to still hold the last frame by the time this runs. Failure is non-fatal by design —
	 * a world must never fail to save because a screenshot could not be produced.
	 */
	async captureThumbnail(width = 320, height = 180): Promise<Blob | null> {
		try {
			this.graphicsPipeline.render();
			const source = this.renderer.domElement;
			if (source.width === 0 || source.height === 0) return null;

			const canvas = document.createElement('canvas');
			canvas.width = width;
			canvas.height = height;
			const context = canvas.getContext('2d');
			if (!context) return null;

			// Cover-fit: crop to the thumbnail's aspect rather than squashing the view.
			const sourceAspect = source.width / source.height;
			const targetAspect = width / height;
			let sx = 0;
			let sy = 0;
			let sw = source.width;
			let sh = source.height;
			if (sourceAspect > targetAspect) {
				sw = source.height * targetAspect;
				sx = (source.width - sw) / 2;
			} else {
				sh = source.width / targetAspect;
				sy = (source.height - sh) / 2;
			}
			context.drawImage(source, sx, sy, sw, sh, 0, 0, width, height);

			return await new Promise<Blob | null>((resolve) => {
				canvas.toBlob((blob) => resolve(blob), 'image/webp', 0.7);
			});
		} catch {
			return null;
		}
	}

	/** Debug GUI's "Export Settings" button — prints the current AO tuning (plus exposure/quality/dynamic-resolution) as JSON to the console and tries to copy it to the clipboard, so a value dialed in by eye can be handed back as new code defaults. */
	exportGraphicsSettings(): void {
		const json = this.graphicsPipeline.exportSettings();
		console.info('[graphics] Exported settings:\n' + json);
		void navigator.clipboard?.writeText(json).catch(() => {
			// Clipboard access can be denied/unavailable (insecure context, no permission, etc) — the
			// console output above is already the authoritative copy, so this failing is harmless.
		});
	}

	/**
	 * Marks the clock dirty when time of day has moved since the last persisted value, so a quit or
	 * pause flush writes the current hour even if nothing else in the world changed.
	 */
	markClockDirtyIfNeeded(): void {
		const timeOfDay = ensureDayCycleSettings(this.skySettings).timeOfDay;
		if (Math.abs(timeOfDay - this.lastPersistedTimeOfDay) < 1e-6) return;
		this.lastPersistedTimeOfDay = timeOfDay;
		this.environmentRevision++;
	}

	private updateDayCycle(deltaSeconds: number): void {
		const cycle = ensureDayCycleSettings(this.skySettings);
		if (!cycle.enabled || this.simulationPaused || deltaSeconds <= 0) return;
		cycle.timeOfDay = advanceTimeOfDay(cycle.timeOfDay, deltaSeconds, cycle.durationSeconds);
		this.applySkySettings();
		this.dayCyclePersistAccum += deltaSeconds;
		if (this.dayCyclePersistAccum >= 15) {
			this.dayCyclePersistAccum = 0;
			this.markClockDirtyIfNeeded();
		}
	}

	/**
	 * Re-applies every sky/HDRI/atmosphere/cloud setting. Called once at startup, once more when
	 * the (async) HDRI finishes loading, and directly from the GUI on every change — all of these
	 * are cheap scene-property/shader-uniform updates, never a scene rebuild.
	 */
	private applySkySettings(): void {
		ensureDayCycleSettings(this.skySettings);
		const look = resolveEffectiveSky(this.skySettings);
		this.dayNightLook = look;
		this.skySystem.applySettings(look.sky, look.atmosphere);
		this.cloudSystem.applySettings(look.clouds);
		this.cloudSystem.applyDebugSettings(this.skySettings.debug);
		this.hdriSystem.applySettings();
		this.scene.environmentIntensity = look.hdriIntensity;

		this.hemisphereLight.color.set(look.hemiSky);
		this.hemisphereLight.groundColor.set(look.hemiGround);
		this.hemisphereLight.intensity = look.atmosphere.hemisphereIntensity;
		this.sunLight.color.set(look.atmosphere.sunColor);
		this.sunLight.intensity = look.atmosphere.sunEnabled ? look.atmosphere.sunIntensity : 0;
		this.graphicsPipeline.setSunColorIntensity(this.sunLight.color, this.sunLight.intensity);
		this.updateSunLightPosition();

		this.applyBackgroundAndFog();

		const showSkyOnly = this.skySettings.debug.showSkyOnly;
		this.terrainManager.group.visible = !showSkyOnly;
		this.treeManager.group.visible = !showSkyOnly;
		this.foundationManager.group.visible = !showSkyOnly;
		this.wallManager.group.visible = !showSkyOnly;
		this.wallPathManager.group.visible = !showSkyOnly;
		this.slabManager.group.visible = !showSkyOnly;
		this.stairManager.group.visible = !showSkyOnly;
		this.roofManager.group.visible = !showSkyOnly;
		this.floorDetailManager.group.visible = !showSkyOnly;
		this.furnitureManager.group.visible = !showSkyOnly;
	}

	/** `scene.background` is contested between "let the sky dome show" and "debug: show the raw HDRI" — this is the single place that decides. */
	private applyBackgroundAndFog(): void {
		const look = this.dayNightLook;
		const backgroundTexture = this.hdriSystem.getBackgroundTexture();
		this.scene.background =
			backgroundTexture ??
			new THREE.Color(look?.sky.groundHazeColor ?? this.skySettings.sky.groundHazeColor);

		const atmosphere = look?.atmosphere ?? this.skySettings.atmosphere;
		if (!atmosphere.fogEnabled) {
			this.scene.fog = null;
			return;
		}

		const fogColor = resolveFogColor(
			look?.sky.horizonColor ?? this.skySystem.getHorizonColorHex(this.skySettings.sky),
			atmosphere.fogColor,
			atmosphere.fogMatchHorizon
		);

		if (atmosphere.fogDensityMode === 'exponential') {
			const density = 2.5 / Math.max(1, atmosphere.fogFar);
			this.scene.fog = new THREE.FogExp2(fogColor.getHex(), density);
		} else {
			this.scene.fog = new THREE.Fog(fogColor.getHex(), atmosphere.fogNear, atmosphere.fogFar);
		}
	}

	/** Keeps the sun's apparent direction correct regardless of how far the player has walked — see the same reasoning as SkySystem/CloudSystem's camera-following. */
	private updateSunLightPosition(): void {
		const direction = this.skySystem.getSunDirection();
		const cameraPosition = this.camera.position;
		this.sunLight.position.set(
			cameraPosition.x + direction.x * SUN_LIGHT_DISTANCE,
			cameraPosition.y + direction.y * SUN_LIGHT_DISTANCE,
			cameraPosition.z + direction.z * SUN_LIGHT_DISTANCE
		);
		this.sunLight.target.position.copy(cameraPosition);
		this.graphicsPipeline.setSunDirection(direction);
	}

	/**
	 * Scales terrain/tree view distance by the new quality preset's render-distance multipliers —
	 * always relative to `baseTerrainViewDistance`/`baseTreeViewDistanceChunks` (the values set at
	 * startup), never relative to whatever the previous quality level left behind, so switching
	 * quality back and forth can't compound the scaling. Cheap chunk-loading-radius change, not a
	 * geometry rebuild — see flushDirtyFlags' viewDistance/vegetationViewDistance handling.
	 */
	private applyRenderDistanceForQuality(quality: GraphicsQuality): void {
		const preset = GRAPHICS_PRESETS[quality];

		const terrainViewDistance = Math.max(
			1,
			Math.round(this.baseTerrainViewDistance * preset.terrainRenderDistanceMultiplier)
		);
		if (this.settings.viewDistance !== terrainViewDistance) {
			this.settings.viewDistance = terrainViewDistance;
			this.dirty.viewDistance = true;
		}

		const treeViewDistance = Math.max(
			1,
			Math.round(this.baseTreeViewDistanceChunks * preset.treeRenderDistanceMultiplier)
		);
		if (this.vegetationSettings.loading.treeViewDistanceChunks !== treeViewDistance) {
			this.vegetationSettings.loading.treeViewDistanceChunks = treeViewDistance;
			this.dirty.vegetationViewDistance = true;
		}
	}

	private handleResize(): void {
		const width = this.container.clientWidth;
		const height = this.container.clientHeight;
		if (width === 0 || height === 0) return;

		this.camera.aspect = width / height;
		this.camera.updateProjectionMatrix();
		this.graphicsPipeline.handleResize(width, height);
	}

	/**
	 * Applies at most one terrain-manager notification per category per frame, however many slider
	 * ticks happened. Terrain changes also nudge vegetation (see TreeManager.notifyTerrainChanged)
	 * since tree Y/slope placement reads the same TerrainHeightSampler — vegetation's own revision
	 * counter still only bumps for vegetation-specific settings, so terrain tweaking never rebuilds
	 * terrain chunks unnecessarily and vice versa.
	 */
	private flushDirtyFlags(): void {
		const musicSurfaceChanged = this.dirty.topology || this.dirty.seed || this.dirty.settings;
		if (this.dirty.topology) {
			this.terrainManager.notifyTopologyChanged();
			this.treeManager.notifyTerrainChanged();
			this.dirty.topology = false;
			this.dirty.settings = false;
			this.dirty.seed = false;
			this.dirty.viewDistance = false;
		} else {
			if (this.dirty.seed) {
				this.terrainManager.notifySeedChanged();
				this.treeManager.notifySeedChanged(this.settings.seed);
				this.dirty.seed = false;
				this.dirty.settings = false;
			} else if (this.dirty.settings) {
				this.terrainManager.notifySettingsChanged();
				this.treeManager.notifyTerrainChanged();
				this.dirty.settings = false;
			}
			if (this.dirty.viewDistance) {
				this.terrainManager.notifyViewDistanceChanged();
				this.dirty.viewDistance = false;
			}
		}

		if (musicSurfaceChanged) this.music.refreshSurfaces();
		if (this.dirty.rendering) {
			this.terrainManager.applyRenderingSettings();
			this.dirty.rendering = false;
		}

		if (this.dirty.vegetationSettings) {
			this.treeManager.notifySettingsChanged();
			this.dirty.vegetationSettings = false;
		}
		if (this.dirty.vegetationViewDistance) {
			this.treeManager.notifyViewDistanceChanged();
			this.dirty.vegetationViewDistance = false;
		}
	}

	private readonly animate = (nowMs: number): void => {
		if (this.disposed) return;
		this.animationFrameId = requestAnimationFrame(this.animate);

		const deltaSeconds =
			this.lastFrameTimeMs === 0 ? 0 : Math.min((nowMs - this.lastFrameTimeMs) / 1000, 0.1);
		this.lastFrameTimeMs = nowMs;

		if (this.devPanelOpen) return;
		this.updateDayCycle(deltaSeconds);
		this.flushDirtyFlags();

		this.doorInteraction.update(deltaSeconds);
		this.controller.update(deltaSeconds);
		this.suggestBuildingLevelFoundation();
		this.stairLevelTrigger.update(
			this.controller.worldPosition.x,
			this.controller.worldPosition.y - this.settings.player.eyeHeight,
			this.controller.worldPosition.z
		);
		this.terrainManager.update(this.controller.worldPosition.x, this.controller.worldPosition.z);
		this.treeManager.update(this.controller.worldPosition.x, this.controller.worldPosition.z);
		this.buildToolManager.update();
		this.music.animate();
		this.creatures.setSeed(this.settings.seed);
		this.creatures.update(
			this.controller.worldPosition,
			deltaSeconds,
			this.graphicsPipeline.getQuality()
		);
		this.furnitureManager.updateLights(this.camera.position, nowMs / 1000);

		this.skySystem.update(this.camera.position);
		this.cloudSystem.update(
			deltaSeconds,
			this.skySettings.clouds,
			this.camera.position.x,
			this.camera.position.z
		);
		this.updateSunLightPosition();

		this.graphicsPipeline.update(deltaSeconds);
		this.graphicsPipeline.render();

		this.updateStats(deltaSeconds);
	};

	private updateStats(deltaSeconds: number): void {
		if (!this.onStatsUpdate) return;

		this.statsFrameCount++;
		this.statsAccumSeconds += deltaSeconds;
		if (this.statsAccumSeconds < 0.25) return;
		this.emitStats();
	}

	toggleRenderStats(): boolean {
		this.graphicsSettings.showRenderStats = !this.graphicsSettings.showRenderStats;
		this.emitStats();
		return this.graphicsSettings.showRenderStats;
	}

	private emitStats(): void {
		if (!this.onStatsUpdate) return;

		const elapsed = this.statsAccumSeconds;
		const frames = this.statsFrameCount;
		const fps = elapsed > 0 && frames > 0 ? frames / elapsed : 0;
		const frameTimeMs = frames > 0 && elapsed > 0 ? (elapsed / frames) * 1000 : 0;
		this.statsFrameCount = 0;
		this.statsAccumSeconds = 0;

		const stats = this.terrainManager.getStats();
		const vegetationStats = this.treeManager.getStats();
		const graphicsStats = this.graphicsPipeline.getRenderStats();
		const position = this.controller.worldPosition;
		const cycle = ensureDayCycleSettings(this.skySettings);

		this.onStatsUpdate({
			creatures: { ...this.creatures.stats },
			fps: Math.round(fps),
			frameTimeMs: Math.round(frameTimeMs * 10) / 10,
			playerX: position.x,
			playerY: position.y,
			playerZ: position.z,
			chunkX: worldToChunkCoord(position.x, this.settings.chunkSize),
			chunkZ: worldToChunkCoord(position.z, this.settings.chunkSize),
			loadedChunks: stats.loadedChunks,
			queuedChunks: stats.queuedChunks,
			revision: stats.revision,
			triangles: stats.triangles,
			loadedVegetationChunks: vegetationStats.loadedChunks,
			queuedVegetationChunks: vegetationStats.queuedChunks,
			treeInstances: vegetationStats.treeInstances,
			vegetationRevision: vegetationStats.revision,
			graphicsQuality: graphicsStats.quality,
			renderScale: graphicsStats.renderScale,
			pixelRatio: graphicsStats.pixelRatio,
			drawCalls: graphicsStats.drawCalls,
			geometries: graphicsStats.geometries,
			textures: graphicsStats.textures,
			shadowsEnabled: graphicsStats.shadowsEnabled,
			shadowCascades: graphicsStats.shadowCascades,
			shadowDistance: graphicsStats.shadowDistance,
			aoEnabled: graphicsStats.aoEnabled,
			aoQuality: graphicsStats.aoQuality,
			antialiasing: graphicsStats.antialiasing,
			showRenderStats: this.graphicsSettings.showRenderStats,
			dayCycleEnabled: cycle.enabled,
			timeOfDay: cycle.timeOfDay
		});
	}

	dispose(): void {
		this.disposed = true;
		const debugWindow = window as unknown as { forestScene?: ThreeScene };
		if (debugWindow.forestScene === this) delete debugWindow.forestScene;
		cancelAnimationFrame(this.animationFrameId);
		this.resizeObserver.disconnect();
		this.buildToolManager.dispose();
		this.foundationTool.dispose();
		this.wallTool.dispose();
		this.windowTool.dispose();
		this.doorInteraction.dispose();
		this.doorTool.dispose();
		this.beamTool.dispose();
		this.polygonWallTool.dispose();
		this.ceilingTool.dispose();
		this.floorTool.dispose();
		this.roofTool.dispose();
		this.stairTool.dispose();
		this.floorCarpetTool.dispose();
		this.floorPathTool.dispose();
		this.floorPlanksTool.dispose();
		this.floorTilesTool.dispose();
		this.furnitureTool.dispose();
		this.furnitureManager.dispose();
		this.removeTool.dispose();
		this.music.dispose();
		this.creatures.dispose();
		this.paintTool.dispose();
		this.materialManager.dispose();
		this.treeManager.dispose();
		this.wallManager.dispose();
		this.wallPathManager.dispose();
		this.slabManager.dispose();
		this.stairManager.dispose();
		this.floorDetailManager.dispose();
		this.levelManager.dispose();
		this.undoManager.dispose();
		this.foundationManager.dispose();
		this.controller.dispose();
		this.terrainManager.dispose();
		this.skySystem.dispose();
		this.cloudSystem.dispose();
		this.hdriSystem.dispose();
		this.graphicsPipeline.dispose();
		this.renderer.dispose();
		if (this.renderer.domElement.parentElement === this.container) {
			this.container.removeChild(this.renderer.domElement);
		}
	}
}
