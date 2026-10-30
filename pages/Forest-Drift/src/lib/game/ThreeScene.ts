import { TerrainEdits, type TerrainStroke } from './terrain/TerrainEdits';
import { ShovelTool } from './terrain/ShovelTool';
import type { WallCollisionRect } from './building/wallCollision';
import { resolvePlayerInteractionPose } from './player/PlayerInteractionPoseResolver';
import { MiniBuildInteractionRuntime } from './miniBuild/MiniBuildInteractionRuntime';
import type { InteractionPrompt } from './player/PlayerInteractionController';
import { PLAYER_BODY } from './player/PlayerBodyDimensions';
import { PillarTool } from './building/PillarTool';
import { skyBackgroundBlend } from './sky/skyBackgroundBlend';
import { CreatureRuntimeManager } from './creatures/CreatureRuntimeManager';
import type { CreatureDefinition } from './creatures/CreatureTypes';
import type { SceneMultiplayerHooks } from './net/MultiplayerSession';
import type { PlayerBookmark, SharedEnvironment } from './net/protocol';
import type { AffectedContent, SharedWorldPort } from './net/WorldOpFeed';
import type { AuthoredContent } from './net/worldEntities';
import {
	LOCAL_SKY_KEYS,
	SHARED_WEATHER_KEYS,
	applyKnownFields,
	omitKeys,
	pickKeys
} from './net/sharedEnvironment';
import {
	timelineDefinition,
	type MusicPlantDefinition,
	type MusicTreeDefinition
} from './music/MusicModel';
import { MusicPlantPlacementTool } from './music/MusicPlantPlacementTool';
import { MiniBuildPersonalLibrary } from './miniBuild/MiniBuildPersonalLibrary';
import { MiniBuildPreferences } from './miniBuild/MiniBuildPreferences';
import {
	MiniBuildSystem,
	type MiniBuildChunkReadout,
	type MiniBuildDebugStats
} from './miniBuild/MiniBuildSystem';
import { MiniBuildChunkBoundaries } from './miniBuild/MiniBuildChunkBoundaries';
import { MiniBuildThumbnailRenderer } from './miniBuild/MiniBuildThumbnails';
import {
	createEmptyMiniBuildWorldState,
	MINI_BUILD_LIMITS,
	MINI_BUILD_WORLD_LIMITS,
	type MiniBuildWorldState,
	type PlaceObjectSelection
} from './miniBuild/MiniBuildTypes';
import type { MiniBuildPlacementContext } from './miniBuild/MiniBuildPlacement';
import { PlaceObjectTool } from './miniBuild/PlaceObjectTool';
import { effectiveSize } from './miniBuild/miniBuildGrid';
import {
	clearMiniBuildBenchmark,
	placeMiniBuildBenchmark,
	type MiniBuildBenchmarkPlacement,
	type MiniBuildBenchmarkScenario
} from './miniBuild/MiniBuildBenchmark';
import { createDefaultSustainSettings, type SustainSettings } from './music/SustainTrailBuilder';
import * as THREE from 'three';
import { BuildingLevelManager } from './building/BuildingLevelManager';
import { BuildingMaterialManager } from './building/BuildingMaterialManager';
import { getGlassMaterial } from './building/OpeningVisualBuilder';
import { BuildingRemovalManager } from './building/BuildingRemovalManager';
import { deleteFoundationAndBuilding as removeConfirmedFoundation } from './building/foundationDeletion';
import { BuildUndoManager } from './building/BuildUndoManager';
import { BuildingManager } from './building/BuildingManager';
import { BuildToolManager } from './building/BuildToolManager';
import { CeilingTool } from './building/CeilingTool';
import {
	DoorInteractionController,
	type OpeningInteractionState
} from './building/DoorInteractionController';
import { CollisionVisualizer } from './building/CollisionVisualizer';
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
import { regroundedFoundationBottom, vertexSpacingFor } from './building/foundationMath';
import type { PaintUiState } from './building/PaintTool';
import { PaintTool } from './building/PaintTool';
import { PolygonWallTool } from './building/PolygonWallTool';
import { BarrierManager, type BarrierRenderStats } from './building/BarrierManager';
import { BarrierTool } from './building/BarrierTool';
import { SkirtingRunManager } from './building/SkirtingRunManager';
import { SkirtingTool } from './building/SkirtingTool';
import {
	cloneBarrierStyle,
	getBarrierPreset,
	type BarrierDefinition,
	type BarrierPresetId,
	type BarrierStyleDefinition
} from './building/BarrierTypes';
import { RemoveTool } from './building/RemoveTool';
import { MoveTool } from './building/MoveTool';
import { RoofManager } from './building/RoofManager';
import { RoofTool } from './building/RoofTool';
import { roomLidsFromSlabs } from './building/skirtingMath';
import { SlabManager } from './building/SlabManager';
import { StairLevelTrigger } from './building/StairLevelTrigger';
import { StairManager } from './building/StairManager';
import { StairTool } from './building/StairTool';
import { resolvePlayerPositionAgainstWalls } from './building/wallCollision';
import { WallManager } from './building/WallManager';
import { WallPathManager } from './building/WallPathManager';
import { WallTool } from './building/WallTool';
import { WindowTool } from './building/WindowTool';
import { WorldSurfaceSampler } from './building/WorldSurfaceSampler';
import { GraphicsPipeline } from './graphics/GraphicsPipeline';
import { foundationLocalFrame } from './building/FoundationLocalMath';
import type { BuildingMaterialDefinition } from './building/MaterialTypes';
import {
	FLOOR_DETAIL_STONE_STYLE,
	FLOOR_DETAIL_WOOD_STYLE,
	GLASS_SURFACE_STYLE,
	TERRAIN_SURFACE_STYLE
} from './materials/buildingSurfaceStyles';
import {
	ProceduralMaterialLibrary,
	type ProceduralMaterialStats
} from './materials/ProceduralMaterialLibrary';
import { materialQualityForGraphics } from './materials/ProceduralMaterialTypes';
import { SurfaceMappingBinder } from './materials/SurfaceMappingBinder';
import {
	createDefaultMusicVisualSettings,
	type GameSettingsHost
} from './settings/GameSettingsHost';
import { FrameDropMeter } from './graphics/frameStats';
import { GraphicsSettingsStore } from './graphics/GraphicsSettingsStore';
import {
	createDefaultGraphicsSettings,
	ENHANCED_LIGHTING,
	GRAPHICS_PRESETS,
	type AntiAliasMode,
	type AoQuality,
	type GraphicsQuality,
	type GraphicsSettings,
	clampFieldOfView,
	ZOOM_MAGNIFICATION,
	zoomedFieldOfView
} from './graphics/GraphicsTypes';
import {
	FirstPersonController,
	type FlightState,
	type LandingEvent
} from './player/FirstPersonController';
import { FALL_WATER_CANCEL_DEPTH, fallDamageSegments } from './player/fallDamage';
import { PUNCH_COOLDOWN_MS, PUNCH_SWING_MS } from './player/punch';
import { LocalHealthAuthority, type HealthAuthority } from './player/HealthAuthority';
import {
	PLAYER_HEALTH_ENABLED,
	type DamageSource,
	type HealthSnapshot
} from './player/PlayerHealth';
import { resolveFogColor } from './sky/atmosphereMath';
import {
	advanceTimeOfDay,
	ensureDayCycleSettings,
	resolveEffectiveSky,
	wrapTimeOfDay,
	type EffectiveSkyLook
} from './sky/dayNightMath';
import { CloudSystem } from './sky/CloudSystem';
import { HdriEnvironmentSystem } from './sky/HdriEnvironmentSystem';
import { SkySystem } from './sky/SkySystem';
import { createDefaultSkySettings, type SkySettings } from './sky/SkyTypes';
import { BaseTerrainSampler } from './hydrology/BaseTerrainSampler';
import { HydrologyDebugView } from './hydrology/HydrologyDebugView';
import { HydrologySystem } from './hydrology/HydrologySystem';
import {
	createDefaultHydrologyDebug,
	createDefaultHydrologySettings,
	createDefaultHydrologyVisual,
	createHydrologySample,
	DEEP_WATER_DEPTH,
	SHALLOW_WATER_DEPTH,
	type HydrologyDebugSettings,
	type HydrologySettings,
	type HydrologyVisualSettings
} from './hydrology/HydrologyTypes';
import { foundationOverlapsWater } from './hydrology/foundationWater';
import { UnderwaterTint } from './hydrology/underwater';
import { WaterRenderer, type WaterRenderStats } from './hydrology/WaterRenderer';
import { ParticleEffectManager } from './particles/ParticleEffectManager';
import { WEATHER_SURFACE_UNIFORMS } from './materials/shader/weatherSurface';
import { WeatherExposureMap } from './weather/WeatherExposureMap';
import { WeatherSystem, type WeatherFrame, type WeatherStats } from './weather/WeatherSystem';
import { WEATHER_TYPES, type WeatherType } from './weather/WeatherTypes';
import {
	createDefaultParticleDebugSettings,
	PARTICLE_QUALITY,
	type ParticleDebugSettings,
	type ParticleStats
} from './particles/ParticleTypes';
import {
	LakeShoreSplashSource,
	type LakeShoreSplashStats
} from './particles/effects/LakeShoreSplashSource';
import { hashStringToUint32 } from './terrain/seededRandom';
import { worldToChunkCoord } from './terrain/chunkKey';
import { terrainMaterial } from './terrain/TerrainChunk';
import { terrainColorOptions } from './terrain/terrainColor';
import { TerrainManager } from './terrain/TerrainManager';
import { createDefaultTerrainSettings, type TerrainSettings } from './terrain/TerrainSettings';
import {
	TreeManager,
	type TreeQualityProfile,
	type TreeRenderStats
} from './vegetation/TreeManager';
import { GrassManager, type GrassRenderStats } from './vegetation/grass/GrassManager';
import { PlantManager, type PlantRenderStats } from './vegetation/plants/PlantManager';
import type { PlantQualityProfile } from './vegetation/plants/PlantTypes';
import type { GrassQualityProfile } from './vegetation/grass/GrassTypes';
import {
	createDefaultVegetationSettings,
	type VegetationSettings
} from './vegetation/VegetationTypes';
import type { WorldRevisionCounters, WorldRuntime } from './world/WorldSerializer';
import { sanitizePlayerState } from './world/WorldSerializer';
import {
	createEmptyProceduralOverrides,
	resolveWorldRules,
	type ProceduralWorldOverrides,
	type SavedPlayerState,
	type WorldDefinition,
	type WorldEnvironmentDefinition,
	type WorldRules
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
const PLAYER_COLLISION_RADIUS = PLAYER_BODY.collisionRadius;

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
	/** Detailed tree-system stats (LODs, batches, memory) — only populated while render stats are shown. */
	trees?: TreeRenderStats;
	/** Grass stats (visible tufts per LOD, draw calls, memory, generation) — with render stats only. */
	grass?: GrassRenderStats;
	/** Flower / ground-plant stats — with render stats only. */
	plants?: PlantRenderStats;
	graphicsQuality: GraphicsQuality;
	renderScale: number;
	pixelRatio: number;
	drawCalls: number;
	geometries: number;
	textures: number;
	/** Particle system and lake-shore splash stats — only populated while render stats are shown. */
	particles?: ParticleStats & { splash: LakeShoreSplashStats };
	/** Weather state, precipitation and lightning — only populated while render stats are shown. */
	weather?: WeatherStats;
	water?: WaterRenderStats & {
		regions: number;
		rivers: number;
		logicalLakes: number;
		regionMs: number;
	};
	shadowsEnabled: boolean;
	shadowCascades: number;
	shadowDistance: number;
	aoEnabled: boolean;
	aoQuality: AoQuality;
	antialiasing: AntiAliasMode;
	showRenderStats: boolean;
	/** Player-facing FPS pill. Independent of the F3 render-stats overlay. */
	showFpsCounter: boolean;
	/** Missed refreshes in the last second, relative to the graphics target FPS. */
	frameDrops: number;
	dayCycleEnabled: boolean;
	timeOfDay: number;
	/** Only populated while render stats are shown — see emitStats. */
	miniBuilds?: MiniBuildDebugStats;
	/** Debug info for the Mini Build under the crosshair (render stats only). */
	miniBuildTarget?: MiniBuildTargetDebug;
	/**
	 * Mini Build primitive usage for the player's chunk — or, while placing/moving a Mini Build, the
	 * chunk under the ghost including what it would add. Absent when the counter is turned off.
	 */
	miniBuildChunk?: MiniBuildChunkReadout & { placing: boolean };
}

/** The graphics preset's tree knobs (LOD distance scale, density, shadow LODs, wind). */
/** Fence / railing LOD distance multipliers per graphics preset (see BarrierManager). */
const BARRIER_LOD_SCALE: Record<GraphicsQuality, number> = {
	low: 0.55,
	medium: 0.8,
	high: 1,
	ultra: 1.4
};

function plantQualityFor(quality: GraphicsQuality): PlantQualityProfile {
	const preset = GRAPHICS_PRESETS[quality];
	return {
		densityScale: preset.plantDensityScale,
		distanceScale: preset.plantDistanceScale,
		nearScale: preset.plantNearScale,
		speciesScale: preset.plantSpeciesScale,
		maxPrototypes: preset.plantMaxPrototypes,
		receiveShadows: preset.plantReceiveShadows,
		wind: preset.plantWind,
		maxVisibleInstances: preset.plantMaxVisibleInstances
	};
}

function grassQualityFor(quality: GraphicsQuality): GrassQualityProfile {
	const preset = GRAPHICS_PRESETS[quality];
	return {
		densityScale: preset.grassDensityScale,
		distanceScale: preset.grassDistanceScale,
		crossedCards: preset.grassCrossedCards,
		receiveShadows: preset.grassReceiveShadows,
		wind: preset.grassWind,
		maxVisibleInstances: preset.grassMaxVisibleInstances
	};
}

function treeQualityFor(quality: GraphicsQuality): TreeQualityProfile {
	const preset = GRAPHICS_PRESETS[quality];
	return {
		lodDistanceScale: preset.treeLodDistanceScale,
		densityScale: preset.treeDensityScale,
		maxShadowLod: preset.treeShadowMaxLod,
		wind: preset.treeWind,
		surfaceDetail: preset.treeSurfaceDetail,
		cardMaxLod: preset.treeCardMaxLod
	};
}

export interface MiniBuildBenchmarkReport extends MiniBuildBenchmarkPlacement {
	fps: number;
	avgFrameMs: number;
	p95FrameMs: number;
	/** Main-thread CPU per frame: simulation update + render submission. */
	cpuFrameMs: number;
	/** Main-thread CPU inside the render call (draw submission, culling, shadow passes). */
	cpuRenderMs: number;
	drawCalls: number;
	triangles: number;
	geometries: number;
	miniBuildInstancedMeshes: number;
	miniBuildBatches: number;
	renderedInstances: number;
	cacheEntries: number;
	cacheBytes: number;
	collisionBoxesNearPlayer: number;
	chunkActivationMs: number;
	saveBytes: number;
	jsHeapMb: number | null;
	/** Present when `naiveComparison` was requested: the same objects as one Mesh per cuboid. */
	naive?: {
		meshes: number;
		fps: number;
		avgFrameMs: number;
		cpuFrameMs: number;
		cpuRenderMs: number;
		drawCalls: number;
	};
}

export interface MiniBuildTargetDebug {
	instanceId: string;
	designId: string;
	designName: string;
	revision: number;
	blocks: number;
	chunkId: string;
	materialSlots: number;
	vertices: number;
	triangles: number;
	collisionBoxes: number;
	batchKey: string;
}

export interface ThreeSceneOptions {
	container: HTMLElement;
	settings: TerrainSettings;
	buildingSettings: BuildingSettings;
	vegetationSettings: VegetationSettings;
	skySettings: SkySettings;
	onStatsUpdate?: (stats: SceneStats) => void;
	onPointerLockChange?: (locked: boolean) => void;
	/** Flying toggled (F) or its speed changed (scroll wheel while flying). */
	onFlightChange?: (state: FlightState) => void;
	/** The player's displayed health changed (never sent every frame). */
	onHealthChange?: (snapshot: HealthSnapshot) => void;
	/** Points were taken, for the vignette and landing sound. */
	onPlayerDamaged?: (event: { amount: number; source: DamageSource }) => void;
	/** Health reached zero; the scene has already blocked movement until `respawnAfterDeath`. */
	onPlayerDeath?: (event: { source: DamageSource | null }) => void;
	onHotbarChange?: (state: HotbarUiState) => void;
	onBuildHudChange?: (hud: BuildUiState | null) => void;
	onLookedAtDoorChange?: (openingId: string | null) => void;
	onMiniBuildInteractionChange?: (prompt: InteractionPrompt | null) => void;
	onOpeningInteractionChange?: (state: OpeningInteractionState | null) => void;
	onPaintPaletteChange?: (open: boolean) => void;
	onPaintStateChange?: (state: PaintUiState) => void;
	onGraphicsQualityChange?: (quality: GraphicsQuality) => void;
	onPlacementCustomizeChange?: (open: boolean) => void;
	onPlacementHeightChange?: (open: boolean) => void;
	/**
	 * Remove Mode asked to delete one foundation and the build on it. The page shows a prompt that
	 * accepts only the typed phrase "Confirm Delete" before calling `deleteFoundationAndBuilding`.
	 */
	onRequestFoundationDelete?: (foundationId: string) => void;
	/** `F` on a placed Mini Build in Place Object mode. */
	onMiniBuildEditRequest?: (instanceId: string) => void;
	/** Short player-facing Mini Build messages (copied, detail limit, load warnings). */
	onMiniBuildNotice?: (message: string) => void;
	onPlaceObjectSelectionChange?: (selection: PlaceObjectSelection) => void;
	/**
	 * The world to open. Its `environment` settings are copied into the live settings objects and
	 * its authored content is loaded, so the scene starts as an exact reproduction of the save
	 * rather than as defaults that are then patched. Omitted only by tests/tools that want a
	 * scratch scene.
	 */
	world?: WorldDefinition;
	/**
	 * Present only in an online world: sends the local pose each frame and draws the other players.
	 * Single player passes nothing and runs exactly as it always has.
	 */
	multiplayer?: SceneMultiplayerHooks;
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
/** A floor dropping further than a stair riser under the player counts as removed (Q21). */
const SUPPORT_LOSS_TOLERANCE = 0.3;

export class ThreeScene implements WorldRuntime {
	devPanelOpen = false;
	/** Debug sidebar keeps rendering and networking alive, while blocking manual game input. */
	debugControlsOpen = false;
	setDebugControls(open: boolean, exampleMovement: boolean, blockManual = open): void {
		this.debugControlsOpen = open;
		this.debugInputBlocked = blockManual;
		this.applyInputBlock();
		this.controller.setExampleMovement(open && exampleMovement);
	}
	private debugInputBlocked = false;
	private applyInputBlock(): void {
		this.controller.setManualInputBlocked(this.debugInputBlocked || this.health.snapshot().dead);
	}

	/** Typed foundation-deletion prompt is open — blocks building keys the same way other modals do. */
	foundationDeletePromptOpen = false;
	/**
	 * Pause menu: the render loop keeps running, but the day/night clock does not. Ignored in an
	 * online world, whose clock is shared and keeps running while others play (Q12).
	 */
	simulationPaused = false;
	readonly buildingSettings: BuildingSettings;
	private readonly container: HTMLElement;
	private readonly settings: TerrainSettings;
	private readonly vegetationSettings: VegetationSettings;
	private readonly skySettings: SkySettings;
	private readonly onStatsUpdate?: (stats: SceneStats) => void;
	private readonly onMiniBuildNotice?: (message: string) => void;
	private readonly onHealthChange?: ThreeSceneOptions['onHealthChange'];
	private readonly onPlayerDamaged?: ThreeSceneOptions['onPlayerDamaged'];
	private readonly onPlayerDeath?: ThreeSceneOptions['onPlayerDeath'];

	private readonly scene: THREE.Scene;
	private readonly camera: THREE.PerspectiveCamera;
	private readonly renderer: THREE.WebGLRenderer;
	private readonly terrainManager: TerrainManager;
	private readonly hydrologySettings: HydrologySettings;
	private readonly hydrologyDebug: HydrologyDebugSettings;
	private readonly hydrologyVisual: HydrologyVisualSettings;
	private readonly hydrology: HydrologySystem;
	private readonly water: WaterRenderer;
	private readonly underwaterTint: UnderwaterTint;
	/** The shared procedural particle system (one pool, one draw call per blend mode). */
	readonly particles: ParticleEffectManager;
	private readonly lakeSplashes: LakeShoreSplashSource;
	private readonly particleSettings: ParticleDebugSettings;
	private readonly particleFrustum = new THREE.Frustum();
	private readonly weather: WeatherSystem;
	private readonly weatherFrame: WeatherFrame;
	private readonly weatherExposure: WeatherExposureMap;
	private lastWeatherPersistRevision = -1;
	private readonly particleMatrix = new THREE.Matrix4();
	private readonly particleLight = new THREE.Color();
	private readonly hydrologyDebugView: HydrologyDebugView;
	private hydrologyRebuildTimer = 0;
	private readonly treeManager: TreeManager;
	private readonly grassManager: GrassManager;
	private readonly plantManager: PlantManager;
	private readonly materialManager: BuildingMaterialManager;
	/** Procedural textures for buildings and terrain — see the README's "Procedural materials" section. */
	private readonly materialLibrary: ProceduralMaterialLibrary;
	private readonly surfaceBinder: SurfaceMappingBinder;
	private readonly foundationManager: FoundationManager;
	private readonly wallManager: WallManager;
	private readonly wallPathManager: WallPathManager;
	private readonly slabManager: SlabManager;
	private readonly stairManager: StairManager;
	private readonly stairLevelTrigger: StairLevelTrigger;
	private readonly roofManager: RoofManager;
	private readonly floorDetailManager: FloorDetailManager;
	/** Hand-drawn skirting boards (hotbar 2 → Skirting). */
	private readonly skirtingRunManager: SkirtingRunManager;
	private readonly skirtingTool: SkirtingTool;
	private readonly pillarTool: PillarTool;
	private readonly furnitureManager: FurnitureManager;
	/** Fences and railings (hotbar 2 → Fence / Railing) — see BarrierManager.ts. */
	private readonly barrierManager: BarrierManager;
	private readonly barrierTool: BarrierTool;
	private readonly levelManager: BuildingLevelManager;
	private readonly undoManager: BuildUndoManager;
	private readonly buildingManager: BuildingManager;
	private readonly removalManager: BuildingRemovalManager;
	private readonly worldSurfaceSampler: WorldSurfaceSampler;
	private readonly controller: FirstPersonController;
	/** Local in single player; replaced by the room's authority while online. */
	private health: HealthAuthority;
	/** Simulation clock for local health (ms). Stops whenever `animate` skips the simulation. */
	private healthClockMs = 0;
	private worldRules = resolveWorldRules(undefined);
	private multiplayer: SceneMultiplayerHooks | null = null;
	/**
	 * Online worlds: the room clock (seconds) when the sky, weather or time last changed, and the time
	 * of day and weather clock then. Each frame's time of day and weather are derived from it, so every
	 * player sees the same sky without any per-frame traffic.
	 */
	private sharedAnchor: SharedEnvironment['anchor'] | null = null;
	/** F3-C: no free flight in online worlds. */
	private flightDisabled = false;
	private readonly foundationTool: FoundationTool;
	readonly shovelTool: ShovelTool;
	private readonly terrainEdits: TerrainEdits;
	private terrainProtectedRects: WallCollisionRect[] = [];
	private terrainProtectedFoundations: FoundationDefinition[] = [];
	private readonly shovelWaterSample = createHydrologySample();
	private readonly wallTool: WallTool;
	private readonly windowTool: WindowTool;
	private readonly doorTool: DoorTool;
	private readonly beamTool: BeamTool;
	readonly miniBuildInteraction: MiniBuildInteractionRuntime;
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
	readonly miniBuilds: MiniBuildSystem;
	readonly miniBuildPersonalLibrary = new MiniBuildPersonalLibrary();
	readonly miniBuildPreferences = new MiniBuildPreferences();
	readonly miniBuildThumbnails: MiniBuildThumbnailRenderer;
	private readonly placeObjectTool: PlaceObjectTool;
	private readonly miniBuildChunkBoundaries: MiniBuildChunkBoundaries;
	/** Mini Build editor / Object Library overlays: world input is blocked, and the editor also pauses world rendering. */
	miniBuildUiOpen = false;
	miniBuildEditorOpen = false;
	/** Explicit preparation lease: no neural inference while this is false. */
	speechPreparationOpen = false;
	readonly music: MusicPlantPlacementTool;
	readonly creatures: CreatureRuntimeManager;
	readonly sustainSettings: SustainSettings;
	readonly musicVisual = createDefaultMusicVisualSettings();
	readonly settingsHost: GameSettingsHost;
	private readonly removeTool: RemoveTool;
	private readonly paintTool: PaintTool;
	private readonly moveTool: MoveTool;
	private readonly collisionVisualizer: CollisionVisualizer;
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
	private readonly cloudSunScratch = new THREE.Vector3();
	private readonly hdriSystem: HdriEnvironmentSystem;
	private readonly hemisphereLight: THREE.HemisphereLight;
	private readonly sunLight: THREE.DirectionalLight;

	private lastFrameTimeMs = 0;
	/** Non-null only while a benchmark samples main-thread CPU time per frame (update + render submission). */
	private frameCpuSamples: { frame: number; render: number }[] | null = null;
	private dayNightLook: EffectiveSkyLook | null = null;
	private dayCyclePersistAccum = 0;
	private lastPersistedTimeOfDay = -1;

	private animationFrameId = 0;
	private disposed = false;

	private statsAccumSeconds = 0;
	private statsFrameCount = 0;
	/** Monotonic clock for the one-second frame-drop window. Accumulated frame deltas, not wall time. */
	private statsClock = 0;
	private readonly frameDropMeter = new FrameDropMeter();

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
		this.onMiniBuildNotice = options.onMiniBuildNotice;
		this.onHealthChange = options.onHealthChange;
		this.onPlayerDamaged = options.onPlayerDamaged;
		this.onPlayerDeath = options.onPlayerDeath;
		this.baseTerrainViewDistance = options.settings.viewDistance;
		this.baseTreeViewDistanceChunks = options.vegetationSettings.loading.treeViewDistanceChunks;

		this.scene = new THREE.Scene();

		this.camera = new THREE.PerspectiveCamera(70, 1, 0.1, 2000);

		// `antialias: false` — MSAA on the main canvas would be redundant/wasteful once the
		// GraphicsPipeline's own postprocessing AA pass (FXAA/SMAA, chosen per quality preset) runs;
		// see GraphicsPipeline's class doc for the full postprocessing pipeline.
		this.renderer = new THREE.WebGLRenderer({ antialias: false });
		this.container.appendChild(this.renderer.domElement);
		this.underwaterTint = new UnderwaterTint(this.container);

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
		this.graphicsSettings.showFpsCounter = this.graphicsSettingsStore.getShowFpsCounter();
		this.graphicsSettings.showLocatorBar = this.graphicsSettingsStore.getShowLocatorBar();
		this.graphicsSettings.fieldOfView = clampFieldOfView(
			this.graphicsSettingsStore.getFieldOfView() ?? this.graphicsSettings.fieldOfView
		);
		this.camera.fov = this.graphicsSettings.fieldOfView;
		this.camera.updateProjectionMatrix();
		this.graphicsPipeline = new GraphicsPipeline({
			renderer: this.renderer,
			scene: this.scene,
			camera: this.camera,
			sunLight: this.sunLight,
			settings: this.graphicsSettings,
			onQualityChange: (quality) => {
				this.graphicsSettingsStore.setQuality(quality);
				this.materialLibrary.setQuality(materialQualityForGraphics(quality));
				this.materialLibrary.setAnisotropy(this.materialAnisotropy());
				this.treeManager.setQualityProfile(treeQualityFor(quality));
				this.grassManager.setQualityProfile(grassQualityFor(quality));
				this.plantManager.setQualityProfile(plantQualityFor(quality));
				this.barrierManager?.setLodScale(BARRIER_LOD_SCALE[quality]);
				this.barrierManager?.setShadowsEnabled(GRAPHICS_PRESETS[quality].shadowsEnabled);
				this.water.setQuality(quality);
				this.water.applyLook(this.hydrologyVisual);
				this.particles.setQuality(
					PARTICLE_QUALITY[quality],
					this.particleSettings.maxParticlesOverride
				);
				this.weather?.setQuality(quality);
				this.graphicsSettings.surfaceRelief = GRAPHICS_PRESETS[quality].materialRelief;
				this.graphicsSettings.surfaceSubdivision = GRAPHICS_PRESETS[quality].materialSubdivision;
				this.applySurfaceDetail();
				this.applyRenderDistanceForQuality(quality);
				options.onGraphicsQualityChange?.(quality);
			}
		});

		this.hdriSystem = new HdriEnvironmentSystem(
			this.renderer,
			this.scene,
			this.skySettings.hdri,
			() => {
				if (this.disposed) return;
				this.applySkySettings();
				this.furnitureManager.updateLights(this.camera.position, 0);
				this.graphicsPipeline.prewarm();
			}
		);

		this.terrainManager = new TerrainManager(this.settings);
		this.scene.add(this.terrainManager.group);
		this.hydrologySettings = createDefaultHydrologySettings();
		this.hydrologyDebug = createDefaultHydrologyDebug();
		this.hydrologyVisual = createDefaultHydrologyVisual();
		const heightSampler = this.terrainManager.getHeightSampler();
		this.hydrology = new HydrologySystem(
			new BaseTerrainSampler(heightSampler),
			this.hydrologySettings,
			this.settings.seed
		);
		heightSampler.attachHydrology(this.hydrology);
		this.terrainManager.setHydrologyGate({
			ready: (x, z) => this.hydrology.isReady(x, z),
			tick: () => this.hydrology.tick(),
			ensure: (x, z) => this.hydrology.ensureSync(x, z),
			sampleWater: (x, z, out) => this.hydrology.sampleWaterInto(x, z, out)
		});
		this.water = new WaterRenderer();
		this.water.setQuality(this.graphicsSettings.quality);
		this.water.applyLook(this.hydrologyVisual);
		this.scene.add(this.water.group);
		this.hydrologyDebugView = new HydrologyDebugView();
		this.scene.add(this.hydrologyDebugView.group);
		// Particles consume hydrology (never the reverse): splashes find steep lake shores from the
		// lake definitions and the authoritative carved terrain sampler.
		this.particleSettings = createDefaultParticleDebugSettings();
		this.particles = new ParticleEffectManager();
		this.particles.setQuality(PARTICLE_QUALITY[this.graphicsSettings.quality]);
		this.scene.add(this.particles.group);
		this.lakeSplashes = new LakeShoreSplashSource(
			this.particles,
			this.hydrology,
			(x, z) => this.terrainManager.getHeightSampler().sample(x, z),
			() => hashStringToUint32(this.settings.seed),
			this.particleSettings
		);
		this.scene.add(this.lakeSplashes.debugGroup);
		this.graphicsPipeline.registerMaterial(terrainMaterial);
		const glassMaterial = getGlassMaterial();
		this.graphicsPipeline.registerMaterial(glassMaterial);

		// `?materials=flat` starts with the original flat look — for side-by-side comparisons.
		const lookParams = new URLSearchParams(location.search);
		if (lookParams.get('materials') === 'flat') this.graphicsSettings.proceduralMaterials = false;
		if (lookParams.get('lighting') === 'classic') this.graphicsSettings.enhancedLighting = false;
		if (lookParams.get('tiling') === 'legacy') this.graphicsSettings.antiTiling = false;
		// Relief and subdivision follow the active preset (on at Ultra); the settings toggles override.
		const startPreset = GRAPHICS_PRESETS[this.graphicsSettings.quality];
		this.graphicsSettings.surfaceRelief = startPreset.materialRelief;
		this.graphicsSettings.surfaceSubdivision = startPreset.materialSubdivision;
		this.surfaceBinder = new SurfaceMappingBinder({
			getFoundationOrigin: (foundationId) => {
				const foundation = this.foundationManager.getFoundation(foundationId);
				if (!foundation) return null;
				const frame = foundationLocalFrame(
					foundation,
					vertexSpacingFor(this.settings.chunkSize, this.settings.chunkResolution)
				);
				return new THREE.Vector3(frame.originWorldX, frame.originWorldY, frame.originWorldZ);
			},
			getWorldSeed: () => this.settings.seed,
			subdivide: this.graphicsSettings.surfaceSubdivision
		});
		this.materialLibrary = new ProceduralMaterialLibrary({
			binder: this.surfaceBinder,
			quality: materialQualityForGraphics(this.graphicsSettings.quality),
			enabled: this.graphicsSettings.proceduralMaterials,
			antiTiling: this.graphicsSettings.antiTiling,
			relief: this.graphicsSettings.surfaceRelief,
			anisotropy: this.materialAnisotropy(),
			onMaterialCreated: (material) => this.graphicsPipeline.registerMaterial(material)
		});
		this.materialLibrary.setWorldSeed(this.settings.seed);
		terrainColorOptions.groundVariation = this.graphicsSettings.proceduralMaterials;
		this.materialLibrary.bindMaterial(terrainMaterial, TERRAIN_SURFACE_STYLE, {
			detail: true,
			uvUnitMeters: 8
		});
		this.materialLibrary.bindMaterial(glassMaterial, GLASS_SURFACE_STYLE);

		const buildingSettings = options.buildingSettings;
		this.buildingSettings = buildingSettings;
		this.materialManager = new BuildingMaterialManager(
			(material) => this.graphicsPipeline.registerMaterial(material),
			this.materialLibrary
		);
		this.foundationManager = new FoundationManager(
			() => vertexSpacingFor(this.settings.chunkSize, this.settings.chunkResolution),
			this.materialManager,
			buildingSettings
		);
		this.scene.add(this.foundationManager.group);
		this.terrainEdits = new TerrainEdits(
			vertexSpacingFor(this.settings.chunkSize, this.settings.chunkResolution)
		);
		this.terrainManager.getHeightSampler().setHeightModifier((x, z, base) => {
			const automatic = this.foundationManager.sampleEarthHeight(x, z, base);
			return this.foundationManager.constrainTerrainHeight(
				x,
				z,
				automatic,
				this.terrainEdits.sample(x, z, automatic, this.sampleTerrainWithoutShovel)
			);
		});
		this.foundationManager.setTerrainEditHandler((bounds) => {
			this.terrainManager.notifyTerrainEdited(bounds);
			this.foundationManager.refreshTerrainSupport(bounds, (x, z) =>
				this.terrainManager.getHeightSampler().sample(x, z)
			);
		});

		this.wallManager = new WallManager({
			getFoundation: (id) => this.foundationManager.getFoundation(id),
			getVertexSpacing: () =>
				vertexSpacingFor(this.settings.chunkSize, this.settings.chunkResolution),
			getBuildingGridSize: () => buildingSettings.buildingGridSize,
			materialManager: this.materialManager,
			buildingSettings,
			glassMaterial,
			getShutterLoops: (foundationId) =>
				this.wallPathManager?.getPathsForFoundation(foundationId) ?? [],
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
			getShutterLoops: (foundationId) =>
				this.wallPathManager?.getPathsForFoundation(foundationId) ?? [],
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
			buildingSettings,
			sampleTerrainHeight: (x, z) => this.terrainManager.getHeightSampler().sample(x, z)
		});
		this.scene.add(this.stairManager.group);
		this.stairLevelTrigger = new StairLevelTrigger(this.stairManager, this.levelManager);

		this.roofManager = new RoofManager({
			getFoundation: (id) => this.foundationManager.getFoundation(id),
			getVertexSpacing: () =>
				vertexSpacingFor(this.settings.chunkSize, this.settings.chunkResolution),
			getBuildingGridSize: () => buildingSettings.buildingGridSize,
			materialManager: this.materialManager,
			getEndWallStyle: (foundationId) => this.endWallStyleFor(foundationId),
			buildingSettings,
			glassMaterial
		});
		this.scene.add(this.roofManager.group);

		this.floorDetailManager = new FloorDetailManager({
			getFoundation: (id) => this.foundationManager.getFoundation(id),
			getVertexSpacing: () =>
				vertexSpacingFor(this.settings.chunkSize, this.settings.chunkResolution),
			getBuildingGridSize: () => buildingSettings.buildingGridSize
		});
		this.scene.add(this.floorDetailManager.group);
		this.skirtingRunManager = new SkirtingRunManager({
			getFoundation: (id) => this.foundationManager.getFoundation(id),
			getVertexSpacing: () =>
				vertexSpacingFor(this.settings.chunkSize, this.settings.chunkResolution),
			getBuildingGridSize: () => buildingSettings.buildingGridSize,
			materialManager: this.materialManager
		});
		this.scene.add(this.skirtingRunManager.group);
		for (const material of this.floorDetailManager.getMaterials()) {
			this.graphicsPipeline.registerMaterial(material);
		}
		this.materialLibrary.bindMaterial(
			this.floorDetailManager.getWoodMaterial(),
			FLOOR_DETAIL_WOOD_STYLE,
			{ ownWoodCoords: true }
		);
		// Native UVs are written on the path geometry. A planar bind would let the surface mapper
		// rewrite the whole mesh and drop the rails' wood coordinates.
		this.materialLibrary.bindMaterial(
			this.floorDetailManager.getStoneMaterial(),
			FLOOR_DETAIL_STONE_STYLE
		);

		this.furnitureManager = new FurnitureManager(this.materialManager);
		this.scene.add(this.furnitureManager.group);

		this.miniBuilds = new MiniBuildSystem({
			materialManager: this.materialManager,
			getActivationRadius: () =>
				MINI_BUILD_WORLD_LIMITS.activationRadius *
				GRAPHICS_PRESETS[this.graphicsSettings.quality].terrainRenderDistanceMultiplier,
			getPersonalDesign: (id) => this.miniBuildPersonalLibrary.get(id)
		});
		this.scene.add(this.miniBuilds.group);
		this.miniBuildThumbnails = new MiniBuildThumbnailRenderer(
			this.renderer,
			this.miniBuilds.cache,
			this.miniBuildPersonalLibrary
		);
		void this.miniBuildPersonalLibrary.ready();
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
			skirtingRunManager: this.skirtingRunManager,
			getVertexSpacing: () =>
				vertexSpacingFor(this.settings.chunkSize, this.settings.chunkResolution),
			getBuildingGridSize: () => buildingSettings.buildingGridSize,
			getCornerOpeningMargin: () => buildingSettings.cornerOpeningMargin
		});

		this.undoManager = new BuildUndoManager(this.buildingManager, {
			canEdit: () =>
				!this.simulationPaused &&
				!this.devPanelOpen &&
				!this.miniBuildEditorOpen &&
				!this.speechPreparationOpen &&
				!this.miniBuildUiOpen &&
				!this.buildToolManager?.isLocked(),
			removeBarrier: (id) => this.barrierManager.remove(id),
			removeFurniture: (id) => this.furnitureManager.remove(id),
			removeMiniBuild: (id) => this.miniBuilds.removeInstance(id)
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

		const terrainSampler = this.terrainManager.getHeightSampler();
		this.barrierManager = new BarrierManager({
			materialManager: this.materialManager,
			getFoundation: (id) => this.foundationManager.getFoundation(id),
			getVertexSpacing: () =>
				vertexSpacingFor(this.settings.chunkSize, this.settings.chunkResolution),
			sampleSurface: (x, z, referenceY) =>
				this.worldSurfaceSampler.getSupportingSurfaceY(x, z, referenceY),
			sampleTerrain: (x, z) => terrainSampler.sample(x, z),
			getStoreyHeight: () => buildingSettings.defaultStoreyHeight
		});
		this.barrierManager.setLodScale(BARRIER_LOD_SCALE[this.graphicsSettings.quality]);
		this.barrierManager.setShadowsEnabled(
			GRAPHICS_PRESETS[this.graphicsSettings.quality].shadowsEnabled
		);
		this.scene.add(this.barrierManager.group);

		// Weather drives the shared particle system (rain/snow fields, impacts), the sky look, tree
		// wind and surface wetness. It only reads the world through these few point queries.
		const weatherWater = createHydrologySample();
		this.weather = new WeatherSystem(
			this.particles,
			{
				groundY: (x, z) => this.worldSurfaceSampler.getSupportingSurfaceY(x, z, Infinity),
				coverAbove: (x, z, fromY) =>
					this.worldSurfaceSampler.getCeilingBlockY(x, z, fromY, fromY + 80),
				waterY: (x, z) => {
					this.hydrology.sampleWaterInto(x, z, weatherWater);
					return weatherWater.waterType === 'none' ? Number.NaN : weatherWater.waterSurfaceY;
				}
			},
			(x, z) => this.terrainManager.getHeightSampler().sample(x, z),
			this.settings.seed
		);
		this.weather.setQuality(this.graphicsSettings.quality);
		this.scene.add(this.weather.group);
		// Transparent effects must not cast ambient occlusion (dark halos round drops and bolts).
		this.graphicsPipeline.excludeFromAo(this.weather.group);
		this.graphicsPipeline.excludeFromAo(this.particles.group);
		// Which surfaces are open to the sky (wet patches and snow only settle there).
		this.weatherExposure = new WeatherExposureMap(this.renderer, this.scene, () => [
			this.foundationManager.group,
			this.wallManager.group,
			this.wallPathManager.group,
			this.slabManager.group,
			this.stairManager.group,
			this.roofManager.group,
			this.floorDetailManager.group,
			this.furnitureManager.group,
			this.miniBuilds.group
		]);
		this.weatherFrame = {
			camera: this.camera,
			feetY: 0,
			viewportHeight: 1,
			frustum: this.particleFrustum,
			cloudAltitude: 220
		};

		this.miniBuildChunkBoundaries = new MiniBuildChunkBoundaries({
			camera: this.camera,
			getLabelContainer: () => this.container,
			getSurfaceY: (x, z, referenceY) =>
				this.worldSurfaceSampler.getSupportingSurfaceY(x, z, referenceY),
			getReadout: (x, z) => this.miniBuilds.getChunkReadout(x, z)
		});
		this.miniBuildChunkBoundaries.setEnabled(this.miniBuildPreferences.display.showChunkBoundaries);
		this.scene.add(this.miniBuildChunkBoundaries.group);

		this.treeManager = new TreeManager({
			settings: options.vegetationSettings,
			terrainSettings: this.settings,
			terrainHeightSampler: this.terrainManager.getHeightSampler(),
			foundationManager: this.foundationManager,
			seed: this.settings.seed,
			waterDepthAt: (x, z) => this.hydrology.waterColumnDepth(x, z)
		});
		this.scene.add(this.treeManager.group);
		// Alpha-tested foliage cards would draw as solid quads in the AO pre-pass (dark halos).
		this.graphicsPipeline.excludeFromAo(this.treeManager.cardGroup);
		this.treeManager.setQualityProfile(treeQualityFor(this.graphicsSettings.quality));
		this.treeManager.setProceduralSurfaces(this.graphicsSettings.proceduralMaterials);
		this.terrainManager.setVegetationRegionSampler(this.treeManager.getVegetationRegionSampler());
		for (const material of this.treeManager.getSharedMaterials()) {
			this.graphicsPipeline.registerMaterial(material);
		}

		this.grassManager = new GrassManager({
			settings: options.vegetationSettings.grass,
			debug: options.vegetationSettings.debug,
			seed: this.settings.seed,
			terrain: {
				chunkSize: () => this.settings.chunkSize,
				getRevision: () => this.terrainManager.getRevision(),
				getSurfaceLattice: (x, z) => this.terrainManager.getSurfaceLattice(x, z)
			},
			heightSampler: this.terrainManager.getHeightSampler(),
			vegetationRegionSampler: this.treeManager.getVegetationRegionSampler(),
			groundCover: (x, z) => this.plantManager?.flowerCover(x, z) ?? 0,
			getExclusions: () => [
				...this.foundationManager.getFootprints(),
				...this.terrainEdits.getFootprints()
			],
			getExclusionRevision: () => this.foundationManager.getRevision() + this.terrainEdits.revision,
			waterDepthAt: (x, z) => this.hydrology.waterColumnDepth(x, z),
			hasWaterNear: (minX, minZ, maxX, maxZ) => {
				const x = (minX + maxX) / 2;
				const z = (minZ + maxZ) / 2;
				const radius = Math.hypot(maxX - minX, maxZ - minZ) / 2;
				return (
					this.hydrology.riversNear(x, z, radius).length > 0 ||
					this.hydrology.lakesNear(x, z, radius).length > 0
				);
			}
		});
		this.scene.add(this.grassManager.group);
		// Instanced cards built in the vertex shader: GTAO's override material would draw them untransformed.
		this.graphicsPipeline.excludeFromAo(this.grassManager.group);
		this.grassManager.setQualityProfile(grassQualityFor(this.graphicsSettings.quality));
		for (const material of this.grassManager.getSharedMaterials()) {
			this.graphicsPipeline.registerMaterial(material);
		}

		this.plantManager = new PlantManager({
			settings: options.vegetationSettings.plants,
			debug: options.vegetationSettings.debug,
			seed: this.settings.seed,
			terrain: {
				chunkSize: () => this.settings.chunkSize,
				getRevision: () => this.terrainManager.getRevision(),
				getSurfaceLattice: (x, z) => this.terrainManager.getSurfaceLattice(x, z)
			},
			heightSampler: this.terrainManager.getHeightSampler(),
			vegetationRegionSampler: this.treeManager.getVegetationRegionSampler(),
			getExclusions: () => [
				...this.foundationManager.getFootprints(),
				...this.terrainEdits.getFootprints()
			],
			getExclusionRevision: () => this.foundationManager.getRevision() + this.terrainEdits.revision,
			waterDepthAt: (x, z) => this.hydrology.waterColumnDepth(x, z),
			hasWaterNear: (minX, minZ, maxX, maxZ) => {
				const x = (minX + maxX) / 2;
				const z = (minZ + maxZ) / 2;
				const radius = Math.hypot(maxX - minX, maxZ - minZ) / 2;
				return (
					this.hydrology.riversNear(x, z, radius).length > 0 ||
					this.hydrology.lakesNear(x, z, radius).length > 0
				);
			}
		});
		this.scene.add(this.plantManager.group);
		this.graphicsPipeline.excludeFromAo(this.plantManager.group);
		this.plantManager.setQualityProfile(plantQualityFor(this.graphicsSettings.quality));
		this.terrainManager.setGroundTint(this.plantManager.terrainTint());
		for (const material of this.plantManager.getSharedMaterials()) {
			this.graphicsPipeline.registerMaterial(material);
		}

		this.controller = new FirstPersonController({
			getCameraObstacles: () => ({
				walls: [
					...this.wallManager.getAllCollisionRects(),
					...this.wallPathManager.getAllCollisionRects(),
					...this.stairManager.getAllCollisionRects(),
					...(this.doorInteraction?.getCollisionRects() ?? []),
					...this.furnitureManager.getCollisionRects(),
					...this.barrierManager.getCollisionRects(),
					...this.miniBuilds.instances.getNearbyCollisionRects()
				],
				meshes: [
					...this.foundationManager.getMeshes(),
					...this.slabManager.getMeshesForRaycast(),
					...this.roofManager.getMeshesForRaycast()
				],
				terrain: (x, z) => this.terrainManager.getHeightSampler().sample(x, z)
			}),
			domElement: this.renderer.domElement,
			camera: this.camera,
			getSupportingSurfaceY: (x, z, referenceY) =>
				this.worldSurfaceSampler.getSupportingSurfaceY(x, z, referenceY),
			getCeilingBlockY: (x, z, fromY, toY) =>
				this.worldSurfaceSampler.getCeilingBlockY(x, z, fromY, toY),
			settings: this.settings.player,
			onPointerLockChange: options.onPointerLockChange,
			onFlightChange: options.onFlightChange,
			onLanded: (event) => this.handleLanding(event),
			isMoveBlocked: (x, z) => this.hydrology.walkBlockedByWater(x, z),
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
						...(this.doorInteraction?.getCollisionRects() ?? []),
						...this.furnitureManager.getCollisionRects(),
						...this.barrierManager.getCollisionRects(),
						...this.miniBuilds.instances.getNearbyCollisionRects()
					]
				);
			}
		});

		this.health = this.createLocalHealth(undefined);
		this.renderer.domElement.addEventListener('mousedown', this.handlePunchMouseDown);

		const origin = this.dryGroundNear(0, 0);
		this.controller.spawn(origin.x, origin.z);
		this.terrainManager.primeAround(origin.x, origin.z, 1);

		this.shovelTool = new ShovelTool({
			scene: this.scene,
			camera: this.camera,
			edits: this.terrainEdits,
			undo: this.undoManager,
			meshes: () => this.terrainManager.getActiveMeshes(),
			sample: (x, z) => this.terrainManager.getHeightSampler().sample(x, z),
			prepare: () => {
				this.terrainProtectedFoundations = this.foundationManager.getFoundations();
				this.terrainProtectedRects = [
					...this.furnitureManager.getCollisionRects(),
					...this.barrierManager.getCollisionRects(),
					...this.miniBuilds.instances.getNearbyCollisionRects(),
					...this.wallManager.getAllCollisionRects(),
					...this.wallPathManager.getAllCollisionRects(),
					...(this.doorInteraction?.getCollisionRects() ?? [])
				];
			},
			allowed: this.terrainEditBlockReason,
			changed: (stroke) => this.publishTerrainStroke(stroke),
			canUse: () =>
				!this.simulationPaused &&
				!this.devPanelOpen &&
				!this.debugControlsOpen &&
				!this.speechPreparationOpen &&
				!this.miniBuildUiOpen &&
				!this.miniBuildEditorOpen &&
				!this.foundationDeletePromptOpen &&
				!this.buildToolManager?.isPlacementCustomizeOpen() &&
				!this.buildToolManager?.isLocked(),
			heldInput: () => this.controller.isPointerLocked(),
			onHud: options.onBuildHudChange
		});

		this.foundationTool = new FoundationTool({
			scene: this.scene,
			camera: this.camera,
			terrainHeightSampler: this.terrainManager.getHeightSampler(),
			getTerrainMeshes: () => this.terrainManager.getActiveMeshes(),
			foundationManager: this.foundationManager,
			terrainSettings: this.settings,
			buildingSettings,
			onHudChange: options.onBuildHudChange,
			waterBlocksFoundation: (minX, maxX, minZ, maxZ) =>
				foundationOverlapsWater(
					(x, z) => this.hydrology.waterColumnDepth(x, z),
					minX,
					maxX,
					minZ,
					maxZ
				)
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

		this.barrierTool = new BarrierTool({
			scene: this.scene,
			camera: this.camera,
			foundationManager: this.foundationManager,
			levelManager: this.levelManager,
			barrierManager: this.barrierManager,
			undoManager: this.undoManager,
			terrainSettings: this.settings,
			buildingSettings,
			getTerrainMeshes: () => this.terrainManager.getActiveMeshes(),
			sampleSurface: (x, z, referenceY) =>
				this.worldSurfaceSampler.getSupportingSurfaceY(x, z, referenceY),
			sampleTerrain: (x, z) => terrainSampler.sample(x, z),
			stairs: {
				getMeshes: () => this.buildingManager.getRaycastableStairMeshes(),
				getRailingStyle: (id) => this.buildingManager.getStair(id)?.railingStyle,
				restyle: (id, style) => this.buildingManager.restyleStairRailings(id, style)
			},
			onHudChange: options.onBuildHudChange
		});

		this.skirtingTool = new SkirtingTool({
			scene: this.scene,
			camera: this.camera,
			foundationManager: this.foundationManager,
			levelManager: this.levelManager,
			buildingManager: this.buildingManager,
			undoManager: this.undoManager,
			terrainSettings: this.settings,
			buildingSettings,
			getPlayerPosition: () => this.controller.worldPosition,
			onHudChange: options.onBuildHudChange
		});

		this.pillarTool = new PillarTool({
			scene: this.scene,
			camera: this.camera,
			foundationManager: this.foundationManager,
			levelManager: this.levelManager,
			furnitureManager: this.furnitureManager,
			undoManager: this.undoManager,
			buildingSettings,
			getVertexSpacing: () =>
				vertexSpacingFor(this.settings.chunkSize, this.settings.chunkResolution),
			onHudChange: options.onBuildHudChange
		});
		for (const material of this.pillarTool.getPreviewMaterials())
			this.graphicsPipeline.registerMaterial(material);

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
			terrainHeightSampler: this.terrainManager.getHeightSampler(),
			getTerrainMeshes: () => this.terrainManager.getActiveMeshes(),
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
			foundationManager: this.foundationManager,
			furnitureManager: this.furnitureManager,
			undoManager: this.undoManager,
			buildingSettings,
			worldSurfaceSampler: this.worldSurfaceSampler,
			getTerrainMeshes: () => this.terrainManager.getActiveMeshes(),
			getWallRects: () => [
				...this.wallManager.getAllCollisionRects(),
				...this.wallPathManager.getAllCollisionRects(),
				...(this.doorInteraction?.getCollisionRects() ?? [])
			],
			onHudChange: options.onBuildHudChange
		});
		for (const material of this.furnitureTool.getPreviewMaterials()) {
			this.graphicsPipeline.registerMaterial(material);
		}

		const miniBuildPlacement: MiniBuildPlacementContext = {
			camera: this.camera,
			buildingManager: this.buildingManager,
			foundationManager: this.foundationManager,
			furnitureManager: this.furnitureManager,
			worldSurfaceSampler: this.worldSurfaceSampler,
			system: this.miniBuilds,
			getTerrainMeshes: () => this.terrainManager.getActiveMeshes(),
			getWallRects: () => [
				...this.wallManager.getAllCollisionRects(),
				...this.wallPathManager.getAllCollisionRects(),
				...this.stairManager.getAllCollisionRects(),
				...(this.doorInteraction?.getCollisionRects() ?? [])
			],
			getGridSize: () => buildingSettings.buildingGridSize
		};
		this.placeObjectTool = new PlaceObjectTool({
			scene: this.scene,
			placement: miniBuildPlacement,
			system: this.miniBuilds,
			furnitureTool: this.furnitureTool,
			undoManager: this.undoManager,
			preferences: this.miniBuildPreferences,
			onHudChange: options.onBuildHudChange,
			onSelectionChange: options.onPlaceObjectSelectionChange,
			onEditInstanceRequest: options.onMiniBuildEditRequest,
			onNotice: options.onMiniBuildNotice
		});
		for (const material of this.placeObjectTool.getPreviewMaterials()) {
			this.graphicsPipeline.registerMaterial(material);
		}

		this.sustainSettings = createDefaultSustainSettings();
		let musicObstacleRevision = '';
		let musicObstacles: THREE.Box3[] = [];
		const naturalGroundBlocked = (x: number, z: number, radius = 0.2, height = 2) => {
			if (this.hydrology.waterColumnDepth(x, z) > DEEP_WATER_DEPTH) return true;
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
			prepareSurfaces: (points, cancelled) => this.hydrology.preparePoints(points, cancelled),
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
				blocked: naturalGroundBlocked,
				// Terrestrial feet never plant on a lake floor under deep water.
				standable: (x, z) => this.hydrology.waterColumnDepth(x, z) <= DEEP_WATER_DEPTH
			},
			options.world?.creatures,
			(m) => this.graphicsPipeline.registerMaterial(m)
		);
		this.scene.add(this.creatures.group);
		this.removeTool = new RemoveTool({
			trees: this.treeManager,
			music: this.music,
			furniture: this.furnitureManager,
			miniBuilds: this.miniBuilds,
			barriers: this.barrierManager,
			scene: this.scene,
			camera: this.camera,
			buildingManager: this.buildingManager,
			removalManager: this.removalManager,
			buildingSettings,
			onHudChange: options.onBuildHudChange,
			onRequestFoundationDelete: options.onRequestFoundationDelete
		});

		this.paintTool = new PaintTool({
			scene: this.scene,
			camera: this.camera,
			buildingManager: this.buildingManager,
			materialManager: this.materialManager,
			buildingSettings,
			barriers: this.barrierManager,
			onHudChange: options.onBuildHudChange,
			onPaintPaletteChange: options.onPaintPaletteChange,
			onPaintStateChange: options.onPaintStateChange
		});

		this.moveTool = new MoveTool({
			scene: this.scene,
			camera: this.camera,
			buildingManager: this.buildingManager,
			foundationManager: this.foundationManager,
			furnitureManager: this.furnitureManager,
			undoManager: this.undoManager,
			buildingSettings,
			worldSurfaceSampler: this.worldSurfaceSampler,
			getTerrainMeshes: () => this.terrainManager.getActiveMeshes(),
			getWallRects: () => [
				...this.wallManager.getAllCollisionRects(),
				...this.wallPathManager.getAllCollisionRects(),
				...(this.doorInteraction?.getCollisionRects() ?? [])
			],
			onHudChange: options.onBuildHudChange,
			openPlacementCustomize: () => this.buildToolManager.togglePlacementCustomize(),
			miniBuildPlacement
		});

		this.doorInteraction = new DoorInteractionController({
			camera: this.camera,
			getPlayerEye: () => this.controller.worldPosition,
			getHingePivots: () => this.buildingManager.getOpeningInteractionPivots(),
			// The shared active-id list stores closed shutters and open doors.
			onToggle: (id, open) =>
				this.multiplayer?.doorToggled(id, this.doorInteraction.isShutter(id) ? !open : open),
			onLookedAtDoorChange: options.onLookedAtDoorChange,
			onInteractionChange: options.onOpeningInteractionChange
		});

		this.buildToolManager = new BuildToolManager({
			domElement: this.renderer.domElement,
			tools: {
				foundation: this.foundationTool,
				shovel: this.shovelTool,
				wall: this.wallTool,
				window: this.windowTool,
				door: this.doorTool,
				beam: this.beamTool,
				'polygon-wall': this.polygonWallTool,
				barrier: this.barrierTool,
				skirting: this.skirtingTool,
				pillar: this.pillarTool,
				ceiling: this.ceilingTool,
				floor: this.floorTool,
				'flat-roof': this.roofTool,
				stairs: this.stairTool,
				'floor-carpet': this.floorCarpetTool,
				'floor-path': this.floorPathTool,
				'floor-planks': this.floorPlanksTool,
				'floor-tiles': this.floorTilesTool,
				'place-object': this.placeObjectTool
			},
			buildingSettings,
			removeTool: this.removeTool,
			paintTool: this.paintTool,
			moveTool: this.moveTool,
			musicTool: this.music,
			isInputBlocked: () =>
				this.devPanelOpen ||
				this.debugControlsOpen ||
				this.foundationDeletePromptOpen ||
				this.speechPreparationOpen ||
				this.miniBuildUiOpen ||
				this.miniBuildEditorOpen ||
				this.music.importPanelOpen ||
				this.music.committing,
			isPointerLocked: () => this.controller.isPointerLocked(),
			onHotbarChange: options.onHotbarChange,
			onHudChange: options.onBuildHudChange,
			onPlacementCustomizeChange: options.onPlacementCustomizeChange,
			onPlacementHeightChange: options.onPlacementHeightChange
		});
		this.miniBuildInteraction = new MiniBuildInteractionRuntime({
			system: this.miniBuilds,
			scene: this.scene,
			camera: this.camera,
			player: this.controller,
			surfaces: this.worldSurfaceSampler,
			getWalls: () => [
				...this.wallManager.getAllCollisionRects(),
				...this.wallPathManager.getAllCollisionRects(),
				...this.stairManager.getAllCollisionRects(),
				...this.doorInteraction.getCollisionRects(),
				...this.furnitureManager.getCollisionRects(),
				...this.barrierManager.getCollisionRects()
			],
			getOccluders: () => [
				...this.buildingManager.getRaycastableWallMeshes(),
				...this.buildingManager.getRaycastableSlabMeshes(),
				...this.buildingManager.getRaycastableRoofMeshes(),
				...this.foundationManager.getMeshes()
			],
			inputAllowed: () =>
				this.controller.isPointerLocked() &&
				!this.simulationPaused &&
				!this.devPanelOpen &&
				!this.debugControlsOpen &&
				!this.speechPreparationOpen &&
				!this.miniBuildUiOpen &&
				!this.miniBuildEditorOpen &&
				!this.buildToolManager.isEditingWorld(),
			waterBlocked: (x, z) => this.hydrology.walkBlockedByWater(x, z),
			eyeHeight: () => this.settings.player.eyeHeight,
			onPrompt: (prompt) => options.onMiniBuildInteractionChange?.(prompt),
			registerMaterial: (m) => this.graphicsPipeline.registerMaterial(m)
		});

		this.miniBuildInteraction.controller.onStateChange = (location) =>
			this.multiplayer?.interactionChanged?.(location);
		this.miniBuildInteraction.showDebug =
			this.miniBuildPreferences.display.showInteractionLocations;
		this.music.onSpeciesChange = () => this.buildToolManager.refreshHotbar();

		this.collisionVisualizer = new CollisionVisualizer(this.scene, {
			getWallRects: () => this.wallManager.getAllCollisionRects(),
			getWallPathRects: () => this.wallPathManager.getAllCollisionRects(),
			getStairRects: () => this.stairManager.getAllCollisionRects(),
			getDoorRects: () => this.doorInteraction?.getCollisionRects() ?? [],
			getFurnitureRects: () => [
				...this.furnitureManager.getCollisionRects(),
				...this.barrierManager.getCollisionRects(),
				...this.miniBuilds.instances.getNearbyCollisionRects()
			],
			getCreatureColliders: () => {
				if (!this.creatures) return [];
				const list = [];
				for (const { compiled: c } of this.creatures.live.values()) {
					const p = c.object.position;
					list.push({
						x: p.x,
						y: p.y,
						z: p.z,
						radius: c.compilation.collision.radius + 0.3,
						height: c.compilation.collision.height
					});
				}
				return list;
			}
		});

		this.settingsHost = {
			creatures: this.creatures,
			terrain: this.settings,
			hydrology: {
				settings: this.hydrologySettings,
				debug: this.hydrologyDebug,
				visual: this.hydrologyVisual
			},
			particles: this.particleSettings,
			weather: this.weather.debug,
			vegetation: this.vegetationSettings,
			sky: this.skySettings,
			graphics: this.graphicsSettings,
			building: buildingSettings,
			music: this.music,
			sustain: this.sustainSettings,
			musicVisual: this.musicVisual,
			miniBuildDisplay: this.miniBuildPreferences.display,
			worldAccess: 'local',
			rules: this.rulesSettingsPort(),
			actions: {
				miniBuildDisplay: () => {
					this.miniBuildChunkBoundaries.setEnabled(
						this.miniBuildPreferences.display.showChunkBoundaries
					);
					this.miniBuildInteraction.showDebug =
						this.miniBuildPreferences.display.showInteractionLocations;
					this.miniBuildPreferences.saveDisplay();
					this.emitStats();
				},
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
				hydrologyStructure: () => {
					this.environmentRevision++;
					window.clearTimeout(this.hydrologyRebuildTimer);
					this.hydrologyRebuildTimer = window.setTimeout(() => this.rebuildHydrology(), 220);
				},
				hydrologyVisual: () => {
					this.water.applyLook(this.hydrologyVisual);
				},
				weather: () => {
					this.weather.applyDebugSelection();
					this.sharedEnvironmentEdited();
				},
				weatherSelect: () => {
					this.weather.presetDebugValues();
					this.weather.applyDebugSelection();
					this.sharedEnvironmentEdited();
				},
				weatherLightning: () => this.weather.forceLightning(this.weatherFrame),
				weatherForce: (type) => {
					this.weather.debug.selection = type;
					this.weather.presetDebugValues();
					this.weather.applyDebugSelection();
					this.sharedEnvironmentEdited();
				},
				particles: () => {
					this.particles.setEnabled(this.particleSettings.enabled);
					this.particles.setPaused(this.particleSettings.paused);
					this.particles.setQuality(
						PARTICLE_QUALITY[this.graphicsSettings.quality],
						this.particleSettings.maxParticlesOverride
					);
				},
				hydrologyDebug: () => {
					if (this.hydrologyDebug.showWaterDepth) this.settings.rendering.debugView = 'water';
					this.dirty.rendering = true;
				},
				foundationBounds: () => {
					this.foundationManager.setShowBounds(buildingSettings.showFoundationBounds);
				},
				wallBounds: () => {
					this.wallManager.setShowBounds(buildingSettings.showWallBounds);
					this.wallPathManager.setShowBounds(buildingSettings.showWallBounds);
				},
				collisionGeometry: () => {
					this.collisionVisualizer.setEnabled(buildingSettings.showCollisionGeometry);
				},
				openingVisuals: () => {
					this.wallManager.rebuildAllWalls();
					this.wallPathManager.rebuildAllPaths();
					this.roofManager.rebuildAllRoofs();
				},
				wallFraming: () => {
					this.wallManager.rebuildAllWalls();
					this.wallPathManager.rebuildAllPaths();
					this.foundationManager.rebuildAllFrames();
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
				vegetationRendering: () => this.treeManager.notifyRenderingChanged(),
				vegetationViewDistance: () => {
					this.baseTreeViewDistanceChunks = this.vegetationSettings.loading.treeViewDistanceChunks;
					this.dirty.vegetationViewDistance = true;
				},
				vegetationBorders: () => {
					this.treeManager.setBorderVisibility(this.vegetationSettings.debug.showTreeChunkBorders);
				},
				grassSettings: () => {
					this.environmentRevision++;
					this.grassManager.notifySettingsChanged();
				},
				grassRendering: () => {
					this.environmentRevision++;
				},
				grassDebug: () => this.grassManager.notifyDebugChanged(),
				plantSettings: () => {
					this.environmentRevision++;
					this.plantManager.notifySettingsChanged();
				},
				plantRendering: () => {
					this.environmentRevision++;
				},
				plantDebug: () => this.plantManager.notifyDebugChanged(),
				terrainTint: () => {
					this.environmentRevision++;
					this.terrainManager.notifySettingsChanged();
				},
				sky: () => {
					this.environmentRevision++;
					this.applySkySettings();
					this.sharedEnvironmentEdited();
				},
				graphicsQuality: (quality) => {
					this.graphicsPipeline.setQuality(quality as GraphicsQuality);
				},
				graphicsAdvanced: () => {
					this.graphicsPipeline.refreshAdvancedSettings();
					this.emitStats();
				},
				graphicsFieldOfView: () => {
					this.graphicsSettings.fieldOfView = clampFieldOfView(this.graphicsSettings.fieldOfView);
					this.graphicsSettingsStore.setFieldOfView(this.graphicsSettings.fieldOfView);
					// Applied (with any zoom) by updateFieldOfView on the next frame.
				},
				graphicsFpsCounter: () => {
					this.graphicsSettingsStore.setShowFpsCounter(this.graphicsSettings.showFpsCounter);
					this.emitStats();
				},
				graphicsLocatorBar: () => {
					this.graphicsSettingsStore.setShowLocatorBar(this.graphicsSettings.showLocatorBar);
				},
				graphicsExposure: () =>
					this.graphicsPipeline.setToneMappingExposure(this.graphicsSettings.toneMappingExposure),
				graphicsAo: () => this.graphicsPipeline.refreshAoTuning(),
				graphicsExport: () => this.exportGraphicsSettings(),
				graphicsMaterials: () =>
					this.setProceduralMaterialsEnabled(this.graphicsSettings.proceduralMaterials),
				graphicsLighting: () => this.applySkySettings(),
				graphicsAntiTiling: () => this.setAntiTilingEnabled(this.graphicsSettings.antiTiling),
				graphicsSurfaceDetail: () => this.applySurfaceDetail(),
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
				musicTrails: () => this.music.rebuildAllTrails(),
				miniBuildBenchmark: (scenario, count) => {
					void this.runMiniBuildBenchmark(scenario, count).then((report) => {
						console.info('[mini-builds] benchmark', report);
						this.onMiniBuildNotice?.(
							`Benchmark ${scenario}: ${report.placed} placed · ${report.fps} FPS · ${report.miniBuildInstancedMeshes} Mini Build draws`
						);
					});
				},
				miniBuildBenchmarkClear: () => {
					const removed = this.clearMiniBuildBenchmark();
					this.onMiniBuildNotice?.(`Removed ${removed} benchmark objects`);
				}
			}
		};

		// Sky/lights/fog are cheap to apply directly (no dirty-flag batching needed — see
		// the settings menu's sky actions) and don't depend on the HDRI having finished
		// loading, so the world looks right from the very first frame. The HDRI itself loads async
		// and only affects lighting/reflections (and optionally the background) once it resolves.
		this.applySkySettings();
		void this.hdriSystem.initialize(
			this.skySettings.sky.topColor,
			this.skySettings.sky.horizonColor
		);

		this.resizeObserver = new ResizeObserver(() => this.handleResize());
		this.resizeObserver.observe(this.container);
		this.handleResize();

		// Loading happens last, after every manager and tool exists, so restoring a world is exactly
		// the same code path as building one interactively — nothing has to be "pre-seeded" during
		// construction, which is what keeps load and play from drifting apart.
		if (options.world) this.loadWorld(options.world);

		if (new URLSearchParams(location.search).has('musicTest'))
			(window as unknown as { forestScene: ThreeScene }).forestScene = this;
		if (options.multiplayer) {
			// Until the room says who we are: no flight (ever, online), no building, and the world's
			// shared settings read-only. The role in `welcome` then unlocks what it allows.
			this.setFlightDisabled(true);
			this.setBuildingLocked(true);
			this.setWorldSettingsAccess('member');
			this.sharedAnchor = {
				roomSeconds: 0,
				timeOfDay: ensureDayCycleSettings(this.skySettings).timeOfDay,
				weatherTime: this.weather.controller.weatherTime
			};
			this.multiplayer = options.multiplayer;
			if (options.multiplayer.createHealthAuthority) {
				this.health.dispose();
				this.health = options.multiplayer.createHealthAuthority(this.healthEvents);
			}
			this.multiplayer.attach({
				resolveInteractionPose: (ref) => {
					const location = this.miniBuildInteraction.resolve(ref.instanceId, ref.locationId);
					return location
						? resolvePlayerInteractionPose(location.type, location.position, location.yaw)
						: null;
				},
				setInteractions: (locations, self, authoritative) => {
					const controller = this.miniBuildInteraction.controller;
					controller.occupancy.sync(locations, self);
					const state = controller.state;
					if (
						authoritative &&
						state.type === 'mini-build' &&
						!locations.some(
							(l) =>
								l.playerId === self &&
								l.instanceId === state.location.instanceId &&
								l.locationId === state.location.locationId
						)
					)
						controller.exit();
				},
				characterSurface: (x, z, y) => this.worldSurfaceSampler.getSupportingSurfaceY(x, z, y),
				scene: this.scene,
				camera: this.camera,
				registerMaterial: (material) => this.graphicsPipeline.registerMaterial(material),
				excludeFromAo: (object) => this.graphicsPipeline.excludeFromAo(object),
				environment: {
					capture: () => this.captureSharedEnvironment(),
					apply: (env) => this.applySharedEnvironment(env)
				},
				world: this.sharedWorldPort(),
				setDoorOpen: (id, active) => this.doorInteraction.setActiveState(id, active),
				restorePlayer: (bookmark) => this.restoreBookmark(bookmark),
				setBuildingLocked: (locked) => this.setBuildingLocked(locked),
				setPublishedFallDamage: (enabled) => (this.sharedFallDamage = enabled),
				showLocatorBar: () => this.graphicsSettings.showLocatorBar
			});
		}
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
		this.terrainEdits.spacing = vertexSpacingFor(
			this.settings.chunkSize,
			this.settings.chunkResolution
		);
		this.terrainEdits.load(world.proceduralOverrides?.terrainEdits);

		// Terrain under a foundation may have changed since it was placed: re-ground each one so its
		// block always reaches half a metre below the lowest terrain point under it.
		this.foundationManager.load(
			structuredClone(world.foundations).map((foundation) => ({
				...foundation,
				bottomY: foundation.bottomY
			}))
		);
		this.buildingManager.load(structuredClone(world.buildings));
		this.levelManager.load(structuredClone(world.buildingLevels));
		this.music.load(world.musicTrees ?? [], world.musicPlants ?? []);
		this.furnitureManager.load(world.furniture ?? []);
		this.barrierManager.load(world.barriers ?? []);
		const miniBuildWarnings = this.miniBuilds.load(
			world.miniBuilds ?? createEmptyMiniBuildWorldState()
		);
		if (miniBuildWarnings.length > 0) {
			console.warn('[mini-builds]', ...miniBuildWarnings);
			queueMicrotask(() => {
				for (const warning of miniBuildWarnings) this.onMiniBuildNotice?.(warning);
			});
		}

		this.treeManager.setRemovedTreeIds(world.proceduralOverrides?.removedTreeIds ?? []);

		this.worldRules = resolveWorldRules(world.rules);
		const player = sanitizePlayerState(world.player);
		this.health.dispose();
		this.health = this.createLocalHealth(player.health);
		if (world.saveRevision > 1 || player.position.y !== 0) {
			this.controller.restoreState(player.position, player.yaw, player.pitch);
		} else {
			// A never-played world has no meaningful saved position; spawn onto the terrain surface
			// rather than restoring the placeholder (0,0,0), which would drop the player underground.
			// Step off a lake or river if the origin landed in deep water.
			const spot = this.dryGroundNear(player.position.x, player.position.z);
			this.controller.spawn(spot.x, spot.z);
		}
		if (player.currentLevelIndexByFoundation) {
			this.levelManager.restoreCurrentLevelIndexes(player.currentLevelIndexByFoundation);
		}
		if (player.activeFoundationId)
			this.levelManager.lockActiveFoundation(player.activeFoundationId);

		this.terrainManager.primeAround(
			this.controller.worldPosition.x,
			this.controller.worldPosition.z,
			1
		);
	}

	/**
	 * Copies a saved environment into the live settings objects *in place* rather than replacing
	 * them: every manager, tool and GUI controller holds a reference to these exact objects, so
	 * swapping the references would leave half the game reading a stale settings instance.
	 */
	private rebuildHydrology(): void {
		this.hydrology.invalidate();
		this.water.clear();
		this.terrainManager.notifySettingsChanged();
		this.treeManager.notifyTerrainChanged();
	}

	private applyEnvironment(environment: WorldEnvironmentDefinition, seed: string): void {
		this.environmentRevision++;

		deepAssign(this.settings, environment.terrain);
		this.settings.seed = seed;
		if (environment.hydrology) deepAssign(this.hydrologySettings, environment.hydrology);
		else
			Object.assign(this.hydrologySettings, {
				...createDefaultHydrologySettings(),
				enabled: false
			});
		this.hydrology.setSeed(seed);
		this.materialLibrary.setWorldSeed(seed);
		this.weather.load(environment.weather, seed);
		this.weatherExposure?.invalidate();
		this.lastWeatherPersistRevision = this.weather.persistRevision;
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
		this.grassManager.setSeed(seed);
		this.plantManager.setSeed(seed);
		this.applySkySettings();
	}

	/** F: toggles free flight. Returns the new state (flying, speed). Always off in online worlds. */
	toggleFlying(): FlightState {
		const flying = this.flightDisabled ? false : this.controller.toggleFlying();
		return { flying, speed: this.controller.getFlySpeed() };
	}

	isFlightDisabled(): boolean {
		return this.flightDisabled;
	}

	/** F3-C: online worlds have no free flight (the room's speed check assumes running speed). */
	setFlightDisabled(disabled: boolean): void {
		this.flightDisabled = disabled;
		if (disabled) this.controller.setFlying(false);
	}

	/** Viewers (and everyone, until the room confirms their role) can look but not build. */
	setBuildingLocked(locked: boolean): void {
		this.buildToolManager.setLocked(locked);
	}

	/**
	 * Which world settings this player may change: everything in single player; in an online world
	 * the land is locked for everyone and the sky, weather and time are the owner's (Q14-A).
	 */
	setWorldSettingsAccess(access: 'local' | 'owner' | 'member'): void {
		this.settingsHost.worldAccess = access;
	}

	/**
	 * Online worlds (Phase 3): how `WorldOpFeed` reads this scene's authored content and makes it
	 * show what the room committed. Applying goes through the managers' low-level add/remove paths
	 * (the same ones `loadWorld` uses), one foundation's building at a time, so nothing cascades,
	 * nothing enters the undo history, and only what changed is rebuilt.
	 */
	private sharedWorldPort(): SharedWorldPort {
		return {
			captureContent: () => this.captureAuthoredContent(),
			// Creatures are local (Q9-A) and bump their counter every few seconds: left out.
			contentRevision: () =>
				this.music.revision +
				this.buildingManager.getRevision() +
				this.foundationManager.getRevision() +
				this.levelManager.getRevision() +
				this.furnitureManager.getRevision() +
				this.barrierManager.getRevision() +
				this.miniBuilds.revision +
				this.treeManager.getOverrideRevision() +
				this.terrainEdits.revision,
			isTransactionOpen: () => this.moveTool.isHoldingObject() || this.shovelTool.isStrokeOpen(),
			applyContent: (target, affected) => this.applyAuthoredContent(target, affected)
		};
	}

	private captureAuthoredContent(): AuthoredContent {
		return structuredClone({
			foundations: this.getFoundations(),
			buildings: this.getBuildings(),
			buildingLevels: this.getBuildingLevels(),
			barriers: this.getBarriers(),
			furniture: this.getFurniture(),
			miniBuilds: this.getMiniBuilds(),
			musicTrees: this.getMusicTrees(),
			musicPlants: this.getMusicPlants(),
			proceduralOverrides: this.getProceduralOverrides()
		});
	}

	private applyAuthoredContent(target: AuthoredContent, affected: AffectedContent): void {
		const byId = <T extends { id: string }>(list: readonly T[]) =>
			new Map(list.map((item) => [item.id, item] as const));
		const spacing = vertexSpacingFor(this.settings.chunkSize, this.settings.chunkResolution);
		const sampler = this.terrainManager.getHeightSampler();
		const sample = (x: number, z: number) => sampler.sample(x, z);

		// Foundations first (building parts are placed relative to them), removals last.
		const foundations = byId(target.foundations as FoundationDefinition[]);
		const removedFoundations: string[] = [];
		for (const id of affected.foundations) {
			const definition = foundations.get(id);
			if (!definition) {
				removedFoundations.push(id);
				continue;
			}
			this.foundationManager.removeFoundation(id);
			this.foundationManager.addFoundation({
				...structuredClone(definition),
				bottomY: regroundedFoundationBottom(definition, spacing, sample)
			});
			affected.buildingFoundations.add(id);
		}
		const buildings = new Map(
			(target.buildings as FoundationBuildingDefinition[]).map((b) => [b.foundationId, b] as const)
		);
		for (const foundationId of affected.buildingFoundations) {
			const building = buildings.get(foundationId);
			this.buildingManager.replaceFoundationBuilding(
				foundationId,
				building ? structuredClone(building) : undefined
			);
		}
		if (affected.levels || removedFoundations.length > 0) {
			for (const id of removedFoundations) this.levelManager.removeLevelsForFoundation(id);
			this.levelManager.load(structuredClone(target.buildingLevels as BuildingLevelDefinition[]));
		}
		const furniture = byId(target.furniture as FurnitureDefinition[]);
		for (const id of affected.furniture) {
			this.furnitureManager.remove(id);
			const definition = furniture.get(id);
			if (definition) this.furnitureManager.add(structuredClone(definition));
		}
		const barriers = byId(target.barriers as BarrierDefinition[]);
		for (const id of affected.barriers) {
			this.barrierManager.remove(id);
			const definition = barriers.get(id);
			if (definition) this.barrierManager.add(structuredClone(definition));
		}
		if (affected.miniBuildDefinitions.size > 0) {
			// A design changed (rare): reload the lot, so every copy recompiles from it.
			this.miniBuilds.load(structuredClone(target.miniBuilds as MiniBuildWorldState));
		} else if (affected.miniBuildInstances.size > 0) {
			const instances = byId(target.miniBuilds.instances as MiniBuildWorldState['instances']);
			for (const id of affected.miniBuildInstances) {
				const instance = instances.get(id);
				if (instance) this.miniBuilds.upsertInstance(instance);
				else this.miniBuilds.removeInstance(id);
			}
		}
		if (affected.music) {
			this.music.load(
				structuredClone(target.musicTrees as MusicTreeDefinition[]),
				structuredClone(target.musicPlants as MusicPlantDefinition[])
			);
		}
		if (affected.terrain) {
			this.shovelTool.prepareForCustomize();
			const before = this.terrainEdits.serialize();
			this.terrainEdits.load(target.proceduralOverrides.terrainEdits);
			const after = this.terrainEdits.serialize();
			const old = new Map(before.points.map((p) => [`${p[0]},${p[1]}`, p]));
			const changed: [number, number, number][] = [];
			for (const p of after.points) {
				const key = `${p[0]},${p[1]}`;
				if (old.get(key)?.[2] !== p[2]) changed.push(p);
				old.delete(key);
			}
			changed.push(...old.values());
			// Publish only changed tiles, not one huge rectangle spanning distant edits.
			const tiles = new Map<string, { minX: number; maxX: number; minZ: number; maxZ: number }>();
			for (const p of changed) {
				const tx = Math.floor(p[0] / 16),
					tz = Math.floor(p[1] / 16),
					s = after.spacing;
				tiles.set(`${tx},${tz}`, {
					minX: (tx * 16 - 1) * s,
					maxX: (tx * 16 + 17) * s,
					minZ: (tz * 16 - 1) * s,
					maxZ: (tz * 16 + 17) * s
				});
			}
			for (const bounds of tiles.values()) this.publishTerrainStroke({ patches: [], bounds });
		}
		if (affected.removedTrees) {
			this.treeManager.setRemovedTreeIds(target.proceduralOverrides.removedTreeIds);
		}
		for (const id of removedFoundations) this.foundationManager.removeFoundation(id);
	}

	/** Q18: back where this player last left the world. The room stores feet height. */
	private restoreBookmark(bookmark: PlayerBookmark): void {
		this.controller.restoreState(
			{ x: bookmark.x, y: bookmark.y + this.settings.player.eyeHeight, z: bookmark.z },
			bookmark.yaw,
			bookmark.pitch
		);
		this.terrainManager.primeAround(bookmark.x, bookmark.z, 1);
	}

	/** The sky, weather and time anchor as the owner shares them (see `SharedEnvironment`). */
	private captureSharedEnvironment(): SharedEnvironment {
		return {
			anchor: { ...this.currentSharedAnchor() },
			sky: omitKeys(this.skySettings, LOCAL_SKY_KEYS),
			weather: pickKeys(this.weather.debug, SHARED_WEATHER_KEYS),
			rules: { fallDamage: this.sharedFallDamage, playerDamage: this.sharedPlayerDamage }
		};
	}

	/** Applies the owner's shared sky, weather and time (welcome, or a live change). */
	private applySharedEnvironment(env: SharedEnvironment): void {
		if (env.rules?.fallDamage !== undefined) this.sharedFallDamage = env.rules.fallDamage;
		if (env.rules?.playerDamage !== undefined) this.sharedPlayerDamage = env.rules.playerDamage;
		applyKnownFields(this.skySettings, env.sky, LOCAL_SKY_KEYS);
		ensureDayCycleSettings(this.skySettings);
		const weather = { ...env.weather };
		if (
			weather.selection !== 'schedule' &&
			!WEATHER_TYPES.includes(weather.selection as WeatherType)
		) {
			delete weather.selection;
		}
		applyKnownFields(this.weather.debug, weather);
		this.weather.applyDebugSelection();
		this.sharedAnchor = {
			roomSeconds: env.anchor.roomSeconds,
			timeOfDay: wrapTimeOfDay(env.anchor.timeOfDay),
			weatherTime: env.anchor.weatherTime
		};
		this.updateSharedClock(true);
		this.applySkySettings();
	}

	/**
	 * The anchor for "now": the room clock, and the time of day and weather clock as shown this
	 * frame. When the owner changes anything, everything after is derived from this.
	 */
	private currentSharedAnchor(): SharedEnvironment['anchor'] {
		const room = this.multiplayer?.roomSeconds() ?? this.sharedAnchor?.roomSeconds ?? 0;
		return {
			roomSeconds: room,
			timeOfDay: ensureDayCycleSettings(this.skySettings).timeOfDay,
			weatherTime: this.weather.controller.weatherTime
		};
	}

	/** The owner changed the sky, weather or time in the settings menu: re-anchor and share it. */
	private sharedEnvironmentEdited(): void {
		if (!this.multiplayer) return;
		this.sharedAnchor = this.currentSharedAnchor();
		this.multiplayer.environmentChanged();
	}

	/**
	 * Online worlds: sets the time of day from the room clock and the shared anchor. Returns whether
	 * the sky needs re-applying.
	 */
	private updateSharedClock(force = false): boolean {
		const anchor = this.sharedAnchor;
		const room = this.multiplayer?.roomSeconds() ?? null;
		if (!anchor || room === null) return false;
		const cycle = ensureDayCycleSettings(this.skySettings);
		const next = cycle.enabled
			? advanceTimeOfDay(anchor.timeOfDay, room - anchor.roomSeconds, cycle.durationSeconds)
			: anchor.timeOfDay;
		if (!force && Math.abs(next - cycle.timeOfDay) < 1e-7) return false;
		cycle.timeOfDay = next;
		return true;
	}

	/** Online worlds: the weather clock every player shares, or undefined to run it locally. */
	private sharedWeatherTime(): number | undefined {
		const anchor = this.sharedAnchor;
		const room = this.multiplayer?.roomSeconds() ?? null;
		if (!anchor || room === null) return undefined;
		return Math.max(0, anchor.weatherTime + (room - anchor.roomSeconds));
	}

	/** Lets the Svelte hotbar UI's trash icon toggle Remove Mode by click, in addition to the `X` key shortcut. */
	toggleRemoveMode(): void {
		this.buildToolManager.toggleRemoveMode();
	}

	/** Lets the Svelte hotbar UI's paint icon toggle Paint Mode by click, in addition to the `P` key shortcut. */
	togglePaintMode(): void {
		this.buildToolManager.togglePaintMode();
	}

	/** Lets the Svelte hotbar UI's move icon toggle Move Mode by click, in addition to the `M` key shortcut. */
	toggleMoveMode(): void {
		this.buildToolManager.toggleMoveMode();
	}

	isMoveModeActive(): boolean {
		return this.buildToolManager.isMoveModeActive();
	}

	/** Lets the touch controls or UI toggle Music Mode by click. */
	toggleMusicMode(): void {
		this.buildToolManager.toggleMusicMode();
	}

	isMusicModeActive(): boolean {
		return this.buildToolManager.isMusicModeActive();
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

	// ---------------------------------------------------------------------------------------------
	// Mini Builds — UI-facing API (Object Library, editor, edit dialogs, debug/benchmark tooling).
	// ---------------------------------------------------------------------------------------------

	getPlaceObjectSelection(): PlaceObjectSelection {
		return this.placeObjectTool.getSelection();
	}

	selectPlaceObject(selection: PlaceObjectSelection): void {
		this.placeObjectTool.setSelection(selection);
	}

	/** Selects hotbar 8 (Place Object) — used after saving a design from the editor. */
	enterPlaceObjectMode(): void {
		this.buildToolManager.selectSlot(8);
	}

	/** Blocks world input while a Mini Build overlay is open; the editor additionally pauses world rendering. */
	setMiniBuildOverlay(state: { libraryOpen?: boolean; editorOpen?: boolean }): void {
		if (state.libraryOpen !== undefined) this.miniBuildUiOpen = state.libraryOpen;
		if (state.editorOpen !== undefined) {
			this.miniBuildEditorOpen = state.editorOpen;
			if (!state.editorOpen) this.lastFrameTimeMs = 0;
		}
		if (
			(this.speechPreparationOpen || this.miniBuildUiOpen || this.miniBuildEditorOpen) &&
			typeof document !== 'undefined'
		) {
			document.exitPointerLock?.();
		}
	}

	/** The Mini Build under the crosshair (any tool), for Edit / debug. */
	getLookedAtMiniBuildId(maxDistance = 12): string | null {
		const raycaster = new THREE.Raycaster();
		raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
		raycaster.far = maxDistance;
		return this.miniBuilds.instances.raycast(raycaster)?.id ?? null;
	}

	/**
	 * Developer stress scene: places a benchmark set just east of the player through the normal
	 * Mini Build API, then samples real frames. See MiniBuildBenchmark.ts and docs/MiniBuild.md.
	 */
	async runMiniBuildBenchmark(
		scenario: MiniBuildBenchmarkScenario | 'baseline',
		count: number,
		options: { sampleMs?: number; naiveComparison?: boolean } = {}
	): Promise<MiniBuildBenchmarkReport> {
		const position = this.controller.worldPosition;
		const placement: MiniBuildBenchmarkPlacement =
			scenario === 'baseline' || count <= 0
				? {
						scenario: 'repeated',
						requested: 0,
						placed: 0,
						rejectedByBudget: 0,
						designsCreated: 0,
						compiles: 0,
						compileMs: 0,
						placeMs: 0,
						chunksUsed: 0,
						primitiveUnits: 0
					}
				: placeMiniBuildBenchmark(this.miniBuilds, scenario, count, {
						originX: position.x,
						originZ: position.z,
						surfaceY: (x, z) => this.worldSurfaceSampler.getSupportingSurfaceY(x, z, Infinity)
					});
		// Chunk activation cost: stream everything out, then time bringing it all back in at once
		// (normal play spreads this over frames, a few chunks at a time).
		this.miniBuilds.instances.update(position.x + 1e6, position.z);
		const activationStarted = performance.now();
		this.miniBuilds.instances.update(position.x, position.z);
		this.miniBuilds.instances.flushStreaming();
		const chunkActivationMs = performance.now() - activationStarted;
		const report = await this.measureFrames(options.sampleMs ?? 2000);
		const debug = this.miniBuilds.getDebugStats();
		const memory = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
		const result: MiniBuildBenchmarkReport = {
			...placement,
			...report,
			miniBuildInstancedMeshes: debug.instances.instancedMeshes,
			miniBuildBatches: debug.instances.batches,
			renderedInstances: debug.instances.renderedInstances,
			cacheEntries: debug.cache.entries,
			cacheBytes: debug.cache.estimatedBytes,
			collisionBoxesNearPlayer: debug.instances.collisionBoxes,
			chunkActivationMs: Math.round(chunkActivationMs * 100) / 100,
			saveBytes: JSON.stringify(this.getMiniBuilds()).length,
			jsHeapMb: memory ? Math.round(memory.usedJSHeapSize / 1048576) : null
		};
		if (options.naiveComparison)
			result.naive = await this.measureNaiveMiniBuilds(options.sampleMs ?? 2000);
		return result;
	}

	/**
	 * Developer comparison only: temporarily renders every placed Mini Build as one Mesh per cuboid —
	 * the architecture the system exists to avoid — to quantify what compiling + instancing saves.
	 */
	private async measureNaiveMiniBuilds(
		sampleMs: number
	): Promise<MiniBuildBenchmarkReport['naive']> {
		const group = new THREE.Group();
		const box = new THREE.BoxGeometry(1, 1, 1);
		let meshes = 0;
		for (const instance of this.miniBuilds.instances.getAll()) {
			const definition = this.miniBuilds.getDesign(instance.designId);
			if (!definition) continue;
			const holder = new THREE.Group();
			holder.position.set(instance.position.x, instance.position.y, instance.position.z);
			holder.rotation.y = (instance.rotationY * Math.PI) / 180;
			const g = MINI_BUILD_LIMITS.gridSize;
			const anchorX = (definition.bounds.min.x + definition.bounds.max.x) / 2;
			const anchorZ = (definition.bounds.min.z + definition.bounds.max.z) / 2;
			for (const block of definition.blocks) {
				const size = effectiveSize(block);
				const mesh = new THREE.Mesh(
					box,
					this.miniBuilds.resolveMaterial(definition.materials[block.materialSlot])
				);
				// Planes (size 0 on one axis) get a sliver so the naive box keeps an invertible matrix.
				mesh.scale.set(
					Math.max(size.x * g, 1e-3),
					Math.max(size.y * g, 1e-3),
					Math.max(size.z * g, 1e-3)
				);
				mesh.position.set(
					(block.positionGrid.x + size.x / 2 - anchorX) * g,
					(block.positionGrid.y + size.y / 2 - definition.bounds.min.y) * g,
					(block.positionGrid.z + size.z / 2 - anchorZ) * g
				);
				mesh.castShadow = true;
				mesh.receiveShadow = true;
				holder.add(mesh);
				meshes++;
			}
			group.add(holder);
		}
		this.miniBuilds.group.visible = false;
		this.scene.add(group);
		try {
			const frames = await this.measureFrames(sampleMs);
			return {
				meshes,
				fps: frames.fps,
				avgFrameMs: frames.avgFrameMs,
				cpuFrameMs: frames.cpuFrameMs,
				cpuRenderMs: frames.cpuRenderMs,
				drawCalls: frames.drawCalls
			};
		} finally {
			group.removeFromParent();
			box.dispose();
			this.miniBuilds.group.visible = true;
		}
	}

	private async measureFrames(
		sampleMs: number
	): Promise<
		Pick<
			MiniBuildBenchmarkReport,
			| 'fps'
			| 'avgFrameMs'
			| 'p95FrameMs'
			| 'cpuFrameMs'
			| 'cpuRenderMs'
			| 'drawCalls'
			| 'triangles'
			| 'geometries'
		>
	> {
		this.frameCpuSamples = [];
		const frames = await this.sampleFrameTimes(sampleMs);
		const cpu = this.frameCpuSamples;
		this.frameCpuSamples = null;
		const sorted = [...frames].sort((a, b) => a - b);
		const avgFrameMs = frames.reduce((sum, value) => sum + value, 0) / Math.max(1, frames.length);
		const average = (values: number[]) =>
			Math.round(
				(values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length)) * 100
			) / 100;
		const render = this.graphicsPipeline.getRenderStats();
		return {
			fps: Math.round((1000 / Math.max(0.001, avgFrameMs)) * 10) / 10,
			avgFrameMs: Math.round(avgFrameMs * 100) / 100,
			p95FrameMs: Math.round((sorted[Math.floor(sorted.length * 0.95)] ?? 0) * 100) / 100,
			cpuFrameMs: average(cpu.map((sample) => sample.frame)),
			cpuRenderMs: average(cpu.map((sample) => sample.render)),
			drawCalls: render.drawCalls,
			triangles: render.triangles,
			geometries: render.geometries
		};
	}

	clearMiniBuildBenchmark(): number {
		return clearMiniBuildBenchmark(this.miniBuilds);
	}

	private sampleFrameTimes(durationMs: number): Promise<number[]> {
		return new Promise((resolve) => {
			const samples: number[] = [];
			const started = performance.now();
			let last = started;
			const step = (now: number) => {
				samples.push(now - last);
				last = now;
				if (now - started < durationMs) requestAnimationFrame(step);
				else resolve(samples.slice(1));
			};
			requestAnimationFrame(step);
		});
	}

	/** Placement target while building (ghost chunk + object cost), otherwise the player's own chunk. */
	private getMiniBuildChunkReadout(): MiniBuildChunkReadout & { placing: boolean } {
		const target =
			this.placeObjectTool.getPlacementReadout() ?? this.moveTool.getHeldMiniBuildReadout();
		if (target) return { ...target, placing: true };
		const position = this.controller.worldPosition;
		return { ...this.miniBuilds.getChunkReadout(position.x, position.z), placing: false };
	}

	private getMiniBuildTargetDebug(): MiniBuildTargetDebug | undefined {
		const id = this.getLookedAtMiniBuildId();
		const instance = id ? this.miniBuilds.instances.get(id) : undefined;
		const definition = instance ? this.miniBuilds.getDesign(instance.designId) : undefined;
		if (!instance || !definition) return undefined;
		const data = this.miniBuilds.cache.getData(definition);
		return {
			instanceId: instance.id,
			designId: definition.id,
			designName: definition.name,
			revision: definition.revision,
			blocks: definition.blocks.length,
			chunkId: this.miniBuilds.instances.getChunkOf(instance.id) ?? '',
			materialSlots: definition.materials.length,
			vertices: data.stats.vertices,
			triangles: data.stats.triangles,
			collisionBoxes: data.collision.length,
			batchKey: this.miniBuilds.instances.getBatchForInstance(instance.id)?.key ?? '(streamed out)'
		};
	}

	syncFurnitureVariant(): void {
		this.buildToolManager.syncFurnitureVariant();
	}

	closePlacementHeight(): void {
		this.buildToolManager.closePlacementHeight();
	}

	/** Lets the Svelte hotbar UI select a slot by click, in addition to the number-key shortcuts. */
	selectHotbarSlot(slot: number): void {
		this.buildToolManager.selectSlot(slot);
	}

	/** Compose Mode hotbar: choose Flower, Mushroom, Fern, Reed, or Crystal. */
	selectMusicSpecies(index: number): void {
		this.buildToolManager.selectMusicSpecies(index);
	}

	/** Lets the on-screen floor selector's ▲ button move up a level by click, identically to Page Up. */
	moveLevelUp(): void {
		this.levelManager.moveUp();
	}

	/**
	 * Resets the player to the start location (0, 0), landing cleanly on the highest
	 * supporting surface at eye height, and primes the terrain around the spawn.
	 */
	respawn(): void {
		const spot = this.dryGroundNear(0, 0);
		this.controller.respawn(spot.x, spot.z);
		this.terrainManager.primeAround(spot.x, spot.z, 1);
		this.treeManager.update(spot.x, spot.z);
	}

	/** First spawn only: walk a few rings outward until the feet are out of deep water. */
	private dryGroundNear(x: number, z: number): { x: number; z: number } {
		if (!this.hydrology.settings.enabled) return { x, z };
		if (this.hydrology.waterColumnDepth(x, z) <= DEEP_WATER_DEPTH) return { x, z };
		for (let ring = 1; ring <= 14; ring++) {
			const radius = ring * 14;
			for (let i = 0; i < 12; i++) {
				const angle = (i / 12) * Math.PI * 2 + ring * 0.4;
				const sx = x + Math.cos(angle) * radius;
				const sz = z + Math.sin(angle) * radius;
				if (this.hydrology.waterColumnDepth(sx, sz) <= SHALLOW_WATER_DEPTH) return { x: sx, z: sz };
			}
		}
		return { x, z };
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
		if (foundations.length === 1) {
			this.levelManager.suggestActiveFoundation(foundations[0].id);
		} else if (foundations.length > 1) {
			const spacing = vertexSpacingFor(this.settings.chunkSize, this.settings.chunkResolution);
			let closest = foundations[0];
			let minDistSq = Infinity;
			for (const f of foundations) {
				const centerX = ((f.minGridX + f.maxGridX) / 2) * spacing;
				const centerZ = ((f.minGridZ + f.maxGridZ) / 2) * spacing;
				const dx = centerX - position.x;
				const dz = centerZ - position.z;
				const distSq = dx * dx + dz * dz;
				if (distSq < minDistSq) {
					minDistSq = distSq;
					closest = f;
				}
			}
			this.levelManager.suggestActiveFoundation(closest.id);
		}
	}

	/** Lets the on-screen floor selector's ▼ button move down a level by click, identically to Page Down. */
	moveLevelDown(): void {
		this.levelManager.moveDown();
	}

	setTouchMovement(x: number, z: number): void {
		this.controller.setTouchMovement(x, z);
	}

	setTouchRunning(running: boolean): void {
		this.controller.setTouchRunning(running);
	}

	triggerTouchJump(): void {
		this.controller.triggerTouchJump();
	}

	addTouchLook(deltaX: number, deltaY: number): void {
		this.controller.addTouchLook(deltaX, deltaY);
	}

	setTouchActive(active: boolean): void {
		this.controller.setTouchActive(active);
	}

	triggerPrimaryAction(): void {
		this.buildToolManager.triggerPrimaryAction();
	}

	triggerSecondaryAction(): void {
		this.buildToolManager.triggerSecondaryAction();
	}

	cycleSlotVariant(direction: -1 | 1): void {
		this.buildToolManager.cycleSlotVariant(direction);
	}

	toggleBuildMode(): void {
		this.buildToolManager.toggleBuildMode();
	}

	/**
	 * Removes one foundation and everything built on it. `confirmation` must be exactly
	 * "Confirm Delete" — any other string leaves the foundation and its building in place.
	 * Returns true only when that foundation was actually removed, so the caller can close the
	 * prompt and a new foundation can be placed on the cleared ground.
	 */
	deleteFoundationAndBuilding(foundationId: string, confirmation: string): boolean {
		const removed = removeConfirmedFoundation(
			{
				buildingManager: this.buildingManager,
				foundationManager: this.foundationManager,
				levelManager: this.levelManager,
				furnitureManager: this.furnitureManager,
				barrierManager: this.barrierManager,
				removePlacedObjects: (id) => {
					this.miniBuilds.removeInstancesForFoundation(id);
				}
			},
			foundationId,
			confirmation
		);
		if (removed) this.removeTool.syncAfterExternalRemoval();
		return removed;
	}

	togglePlacementCustomize(): void {
		this.buildToolManager.togglePlacementCustomize();
	}

	togglePlacementHeight(): void {
		this.buildToolManager.togglePlacementHeight();
	}

	toggleLookedAtDoor(): void {
		this.doorInteraction?.toggleLookedAtDoor();
	}

	isDoorOpen(openingId?: string): boolean {
		const id = openingId ?? this.doorInteraction?.getLookedAtDoor();
		return id ? (this.doorInteraction?.isOpen(id) ?? false) : false;
	}

	isLookedAtDoorOpen(openingId?: string): boolean {
		return this.isDoorOpen(openingId);
	}

	simulateKey(code: string): void {
		window.dispatchEvent(new KeyboardEvent('keydown', { code }));
		window.dispatchEvent(new KeyboardEvent('keyup', { code }));
	}

	/** Grass stats against the current camera frustum (for the overlay and benchmarks). */
	grassRenderStats(): GrassRenderStats {
		this.camera.updateMatrixWorld();
		const frustum = new THREE.Frustum().setFromProjectionMatrix(
			new THREE.Matrix4().multiplyMatrices(
				this.camera.projectionMatrix,
				this.camera.matrixWorldInverse
			)
		);
		return this.grassManager.getRenderStats(frustum);
	}

	/**
	 * Grass benchmark sample for the current view: frame timing (FPS, p95, main-thread CPU per frame
	 * and inside render) from the shared frame sampler, plus the grass stats for the same frame.
	 */
	async measureGrassFrames(
		sampleMs = 3000
	): Promise<Awaited<ReturnType<ThreeScene['measureFrames']>> & { grass: GrassRenderStats }> {
		const frames = await this.measureFrames(sampleMs);
		return { ...frames, grass: this.grassRenderStats() };
	}

	/** Flower / ground-plant stats against the current camera frustum. */
	plantRenderStats(): PlantRenderStats {
		this.camera.updateMatrixWorld();
		const frustum = new THREE.Frustum().setFromProjectionMatrix(
			new THREE.Matrix4().multiplyMatrices(
				this.camera.projectionMatrix,
				this.camera.matrixWorldInverse
			)
		);
		return this.plantManager.getRenderStats(frustum);
	}

	/** Plant benchmark sample: frame timing plus grass and plant stats for the same frames. */
	async measureVegetationFrames(sampleMs = 3000): Promise<
		Awaited<ReturnType<ThreeScene['measureFrames']>> & {
			grass: GrassRenderStats;
			plants: PlantRenderStats;
		}
	> {
		const frames = await this.measureFrames(sampleMs);
		return { ...frames, grass: this.grassRenderStats(), plants: this.plantRenderStats() };
	}

	/** Benchmarks: hold plants at full quality instead of letting them adapt. */
	setPlantAdaptive(enabled: boolean): void {
		this.plantManager.setAdaptiveEnabled(enabled);
	}

	/** Benchmarks: hold grass at full quality instead of letting it adapt to the frame rate. */
	setGrassAdaptive(enabled: boolean): void {
		this.grassManager.setAdaptiveEnabled(enabled);
	}

	/** Tree-system stats against the current camera frustum (for the overlay and benchmarks). */
	treeRenderStats(): TreeRenderStats {
		this.camera.updateMatrixWorld();
		const frustum = new THREE.Frustum().setFromProjectionMatrix(
			new THREE.Matrix4().multiplyMatrices(
				this.camera.projectionMatrix,
				this.camera.matrixWorldInverse
			)
		);
		return this.treeManager.getRenderStats(frustum);
	}

	/**
	 * What a pitched roof's gable ends on a foundation should look like: the paint most of that
	 * foundation's walls use (unpainted when there are none) and their thickness.
	 */
	private endWallStyleFor(foundationId: string): {
		material?: BuildingMaterialDefinition;
		wallThickness: number;
	} {
		const counts = new Map<string, { material?: BuildingMaterialDefinition; count: number }>();
		let thickness = 0;
		const add = (material: BuildingMaterialDefinition | undefined, wallThickness: number) => {
			const key = material ? JSON.stringify(material) : '';
			const entry = counts.get(key) ?? { material, count: 0 };
			entry.count++;
			counts.set(key, entry);
			thickness = Math.max(thickness, wallThickness);
		};
		for (const wall of this.wallManager.getWallsForFoundation(foundationId))
			add(wall.material, wall.thickness);
		for (const path of this.wallPathManager.getPathsForFoundation(foundationId))
			for (const segment of path.segments) add(segment.material, path.wallThickness);
		let best: { material?: BuildingMaterialDefinition; count: number } | undefined;
		for (const entry of counts.values()) if (!best || entry.count > best.count) best = entry;
		return {
			material: best?.material,
			wallThickness: thickness || this.buildingSettings.wallThickness
		};
	}

	/** Turns procedural materials on/off (same as the Graphics settings toggle). */
	setProceduralMaterialsEnabled(enabled: boolean): void {
		this.graphicsSettings.proceduralMaterials = enabled;
		this.materialLibrary.setEnabled(enabled);
		this.treeManager.setProceduralSurfaces(enabled);
		if (terrainColorOptions.groundVariation !== enabled) {
			terrainColorOptions.groundVariation = enabled;
			this.dirty.settings = true;
		}
	}

	/** Applies the relief / subdivision settings (bump maps and extra triangles). */
	applySurfaceDetail(): void {
		this.materialLibrary.setRelief(this.graphicsSettings.surfaceRelief);
		this.surfaceBinder.setSubdivide(this.graphicsSettings.surfaceSubdivision);
	}

	/** Switches between world-scale non-repeating surfaces and the original tiled textures. */
	setAntiTilingEnabled(enabled: boolean): void {
		this.graphicsSettings.antiTiling = enabled;
		this.materialLibrary.setAntiTiling(enabled);
	}

	/** Resolves once every procedural texture requested so far is generated, applied and mapped — used by screenshot tests. */
	async whenMaterialsReady(): Promise<void> {
		await this.materialLibrary.whenIdle();
		this.surfaceBinder.flush();
	}

	getMaterialStats(): ProceduralMaterialStats & { mappedGeometries: number } {
		return {
			...this.materialLibrary.getStats(),
			mappedGeometries: this.surfaceBinder.getMappedGeometryCount()
		};
	}

	/**
	 * Texture anisotropy for procedural maps: the preset's value, capped at 4× (8× at Ultra) and by
	 * the GPU. Stochastic sampling can fetch twice per map, and beyond 4× the sharpening on oblique
	 * surfaces is small next to the extra filtering cost.
	 */
	private materialAnisotropy(): number {
		// Software rasterisers (no GPU acceleration) pay heavily for anisotropic filtering.
		if (this.isSoftwareRenderer()) return 1;
		const quality = this.graphicsSettings.quality;
		return Math.min(
			GRAPHICS_PRESETS[quality].anisotropy,
			quality === 'ultra' ? 8 : 4,
			this.renderer.capabilities.getMaxAnisotropy()
		);
	}

	private softwareRenderer: boolean | null = null;

	/** True when WebGL is running on a CPU rasteriser (SwiftShader, llvmpipe, Microsoft Basic Render). */
	private isSoftwareRenderer(): boolean {
		if (this.softwareRenderer !== null) return this.softwareRenderer;
		const gl = this.renderer.getContext();
		const info = gl.getExtension('WEBGL_debug_renderer_info');
		const name = String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
		this.softwareRenderer = /swiftshader|llvmpipe|software|basic render/i.test(name);
		return this.softwareRenderer;
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
		return {
			terrain,
			vegetation,
			sky,
			hydrology: structuredClone(this.hydrologySettings),
			weather: this.weather.save()
		};
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
	getBarriers(): BarrierDefinition[] {
		return this.barrierManager.serialize();
	}
	/** A copy of a fence / railing preset's style (tests and benchmarks build barriers from these). */
	barrierPresetStyle(presetId: BarrierPresetId): BarrierStyleDefinition {
		return cloneBarrierStyle(getBarrierPreset(presetId).style);
	}
	/** Fence / railing counts, meshes, triangles and memory (stats overlay, benchmarks). */
	barrierRenderStats(): BarrierRenderStats {
		return this.barrierManager.getStats();
	}
	getMiniBuilds(): MiniBuildWorldState {
		return this.miniBuilds.serialize();
	}
	getBuildings(): FoundationBuildingDefinition[] {
		return this.buildingManager.serialize();
	}

	getBuildingLevels(): BuildingLevelDefinition[] {
		return this.levelManager.serialize();
	}

	getTutorialPosition(): { x: number; z: number } {
		return { x: this.controller.worldPosition.x, z: this.controller.worldPosition.z };
	}

	getPlayerState(): SavedPlayerState {
		const state = this.miniBuildInteraction.controller.state;
		let position: { x: number; y: number; z: number } =
			state.type === 'mini-build' ? state.entry : this.controller.worldPosition;
		if (this.health.snapshot().dead) {
			// A save taken while dead reopens at the spawn with full health (see savedValue).
			const spot = this.dryGroundNear(0, 0);
			const ground = this.worldSurfaceSampler.getSupportingSurfaceY(spot.x, spot.z, Infinity);
			position = { x: spot.x, y: ground + this.settings.player.eyeHeight, z: spot.z };
		}
		const health = this.health.savedValue();
		return {
			position: { x: position.x, y: position.y, z: position.z },
			yaw: this.controller.getYaw(),
			pitch: this.controller.getPitch(),
			activeFoundationId: this.levelManager.getActiveFoundationId() ?? undefined,
			currentLevelIndexByFoundation: this.levelManager.getCurrentLevelIndexes(),
			...(health !== undefined ? { health } : {})
		};
	}

	getRules(): WorldRules {
		return { ...this.worldRules };
	}

	/** The "Fall damage" rule in force: this world's, or online the owner's shared one. */
	getFallDamageRule(): boolean {
		return this.fallDamageEnabled();
	}

	/** Settings toggle. Online only the owner can reach it, and it is shared with everyone. */
	setFallDamageRule(enabled: boolean): void {
		if (this.multiplayer) {
			if (this.sharedFallDamage === enabled) return;
			this.sharedFallDamage = enabled;
			this.sharedEnvironmentEdited();
			return;
		}
		if (this.worldRules.fallDamage === enabled) return;
		this.worldRules = { ...this.worldRules, fallDamage: enabled };
		this.environmentRevision++;
	}

	/** Settings fields read and assign `fallDamage`; this routes both to the rule above. */
	private rulesSettingsPort(): { fallDamage: boolean; playerDamage: boolean } {
		return Object.defineProperties({} as { fallDamage: boolean; playerDamage: boolean }, {
			fallDamage: {
				enumerable: true,
				get: () => this.getFallDamageRule(),
				set: (enabled: boolean) => this.setFallDamageRule(enabled)
			},
			playerDamage: {
				enumerable: true,
				get: () => this.sharedPlayerDamage,
				set: (enabled: boolean) => this.setPlayerDamageRule(enabled)
			}
		});
	}

	/** Online only (the owner): whether punches hurt. Shared with everyone through the room. */
	setPlayerDamageRule(enabled: boolean): void {
		if (!this.multiplayer || this.sharedPlayerDamage === enabled) return;
		this.sharedPlayerDamage = enabled;
		this.sharedEnvironmentEdited();
	}

	getHealth(): HealthSnapshot {
		return this.health.snapshot();
	}

	/** Back to full health at the world spawn after dying (the death card's Respawn button). */
	/** The death card's Respawn button: only once the respawn delay has passed. */
	respawnAfterDeath(): boolean {
		if (!this.health.snapshot().dead || !this.health.requestRespawn()) return false;
		this.standUp();
		this.respawn();
		this.applyInputBlock();
		return true;
	}

	/** Where the player was standing when knocked out (eye position); null while not down. */
	private knockedOutAt: { x: number; y: number; z: number } | null = null;

	/**
	 * Knocked out: lie on the floor where they fell, in the same lying pose beds use, and look at it
	 * from third person. Others see the same pose through the room's `down` presence.
	 */
	private lieDown(): void {
		this.miniBuildInteraction.controller.exit();
		const { x, y, z } = this.controller.worldPosition;
		this.knockedOutAt = { x, y, z };
		const feetY = y - this.settings.player.eyeHeight;
		this.controller.beginInteraction(
			resolvePlayerInteractionPose('lie', { x, y: feetY, z }, this.controller.getYaw())
		);
		this.controller.interactionThirdPerson = true;
	}

	private standUp(): void {
		if (!this.knockedOutAt) return;
		this.controller.endInteraction(this.knockedOutAt);
		this.knockedOutAt = null;
	}

	/**
	 * Test helper: lifts the player `metres` above the ground under them with fall tracking armed,
	 * so the landing goes through exactly the same path as a real fall.
	 */
	debugDropPlayer(metres: number): void {
		const { x, z } = this.controller.worldPosition;
		const ground = this.worldSurfaceSampler.getSupportingSurfaceY(x, z, Infinity);
		this.controller.setFlying(false);
		this.controller.spawn(x, z);
		this.controller.worldPosition.y = ground + metres + this.settings.player.eyeHeight;
		this.controller.armFallFromCurrentHeight();
	}

	private lastStructuralRevision = -1;

	/**
	 * Q21: when an edit (yours, an undo, or another player's) takes away the floor you are standing
	 * on, the drop that follows cannot hurt. Only runs when the authored world actually changed.
	 */
	private noticeRemovedSupport(): void {
		const revision = this.getRevisionCounters().structural;
		if (revision === this.lastStructuralRevision) return;
		this.lastStructuralRevision = revision;
		if (!this.controller.isGrounded() || this.controller.isFlying()) return;
		const { x, y, z } = this.controller.worldPosition;
		const feetY = y - this.settings.player.eyeHeight;
		const support = this.worldSurfaceSampler.getSupportingSurfaceY(x, z, feetY);
		if (support < feetY - SUPPORT_LOSS_TOLERANCE) this.controller.markSupportRemoved();
	}

	private fallDamageEnabled(): boolean {
		return this.multiplayer ? this.sharedFallDamage : this.worldRules.fallDamage;
	}

	/** Online worlds: the owner's fall-damage rule, from the shared environment. */
	private sharedFallDamage = false;

	/** Online worlds: the owner's player-damage rule (punching), on unless they turn it off. */
	private sharedPlayerDamage = true;
	private punchSwingUntil = 0;
	private nextPunchAt = 0;

	/** Punching is for walking around online: not while building, in a global mode, seated or dead. */
	canPunch(): boolean {
		return (
			PLAYER_HEALTH_ENABLED &&
			!!this.multiplayer?.punch &&
			this.sharedPlayerDamage &&
			this.buildToolManager.isNormalMode() &&
			this.miniBuildInteraction.controller.state.type === 'none' &&
			!this.controller.interactionPose &&
			!this.controller.isFlying() &&
			!this.debugControlsOpen &&
			!this.health.snapshot().dead
		);
	}

	/** Left click (or the touch Punch button) in normal mode. Returns whether a punch was thrown. */
	punch(): boolean {
		const now = performance.now();
		if (now < this.nextPunchAt || !this.canPunch()) return false;
		this.nextPunchAt = now + PUNCH_COOLDOWN_MS;
		this.punchSwingUntil = now + PUNCH_SWING_MS;
		const { x, y, z } = this.controller.worldPosition;
		this.multiplayer?.punch?.({
			x,
			y,
			z,
			yaw: this.controller.getYaw(),
			pitch: this.controller.getPitch()
		});
		return true;
	}

	private readonly handlePunchMouseDown = (event: MouseEvent): void => {
		if (event.button !== 0 || !this.controller.isPointerLocked()) return;
		this.punch();
	};

	private handleLanding(event: LandingEvent): void {
		if (!PLAYER_HEALTH_ENABLED || event.immune || !this.fallDamageEnabled()) return;
		if (fallDamageSegments(event.distance) === 0) return;
		if (
			this.hydrology.settings.enabled &&
			this.hydrology.waterColumnDepth(event.x, event.z) >= FALL_WATER_CANCEL_DEPTH
		)
			return;
		this.health.reportFall(event.distance);
	}

	private createLocalHealth(saved: unknown): LocalHealthAuthority {
		return new LocalHealthAuthority(() => this.healthClockMs, this.healthEvents, saved);
	}

	private readonly healthEvents = {
		change: (snapshot: HealthSnapshot) => this.onHealthChange?.(snapshot),
		damaged: (amount: number, source: DamageSource) => this.onPlayerDamaged?.({ amount, source }),
		death: (source: DamageSource | null) => {
			this.lieDown();
			this.applyInputBlock();
			this.onPlayerDeath?.({ source });
		}
	};

	private sampleTerrainWithoutShovel = (x: number, z: number): number =>
		this.foundationManager.sampleEarthHeight(
			x,
			z,
			this.terrainManager.getHeightSampler().sampleUnmodified(x, z)
		);

	private publishTerrainStroke(stroke: TerrainStroke): void {
		this.terrainManager.notifyTerrainEdited(stroke.bounds);
		this.grassManager.notifyTerrainRegion(stroke.bounds);
		this.plantManager.notifyTerrainRegion(stroke.bounds);
		this.foundationManager.refreshTerrainSupport(stroke.bounds, (x, z) =>
			this.terrainManager.getHeightSampler().sample(x, z)
		);
	}

	private terrainEditBlockReason = (
		x: number,
		z: number,
		height: number,
		footprintOnly = false
	): string | null => {
		if (!Number.isFinite(height) || Math.abs(height) > 1000) return 'Terrain height limit reached.';
		const s = this.terrainEdits.spacing;
		for (const d of this.terrainProtectedFoundations) {
			const dx = Math.max(d.minGridX * s - x, 0, x - d.maxGridX * s),
				dz = Math.max(d.minGridZ * s - z, 0, z - d.maxGridZ * s);
			const distance = Math.hypot(dx, dz);
			if (
				distance === 0 &&
				(d.style === 'earth' ||
					(x > d.minGridX * s && x < d.maxGridX * s && z > d.minGridZ * s && z < d.maxGridZ * s))
			) {
				if (footprintOnly) continue;
				return d.style === 'earth'
					? 'Grass foundation: the flat building surface is locked.'
					: 'Stone foundation: digging beneath buildings is protected.';
			}
			const current = this.terrainManager.getHeightSampler().sample(x, z);
			if (
				d.style !== 'earth' &&
				height > Math.max(current, d.topY - 0.05 + distance * 0.65) + 0.001
			)
				return 'Ground cannot cover a stone foundation.';
			if (d.style !== 'earth' && height < Math.min(current, d.topY - 4 - distance * 0.65) - 0.001)
				return 'Maximum exposed stone height reached.';
		}
		for (let dz = -2; dz <= 2; dz += 2)
			for (let dx = -2; dx <= 2; dx += 2) {
				this.hydrology.sampleWaterInto(x + dx, z + dz, this.shovelWaterSample);
				if (
					this.shovelWaterSample.waterDepth > 0.001 ||
					this.shovelWaterSample.terrainInfluence > 0.001
				)
					return 'Water and shorelines are protected.';
			}
		if (this.treeManager.isRootProtected(x, z, 1))
			return 'Remove the tree before editing its roots.';
		for (const r of this.terrainProtectedRects) {
			const dx = x - r.centerX,
				dz = z - r.centerZ;
			if (
				Math.abs(dx * r.dirX + dz * r.dirZ) <= r.halfLength + 0.75 &&
				Math.abs(-dx * r.dirZ + dz * r.dirX) <= r.halfThickness + 0.75
			)
				return 'Move the object or clear the doorway before editing here.';
		}
		if (!footprintOnly) {
			const base = this.sampleTerrainWithoutShovel(x, z);
			if (
				Math.abs(this.foundationManager.constrainTerrainHeight(x, z, base, height) - height) > 0.001
			)
				return 'Maximum safe bank slope reached.';
		}
		return null;
	};

	getProceduralOverrides(): ProceduralWorldOverrides {
		return {
			...createEmptyProceduralOverrides(),
			removedTreeIds: this.treeManager.getRemovedTreeIds(),
			...(this.terrainEdits.hasEdits ? { terrainEdits: this.terrainEdits.serialize() } : {})
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
				this.furnitureManager.getRevision() +
				this.barrierManager.getRevision() +
				this.miniBuilds.revision,
			environment: this.environmentRevision,
			procedural: this.treeManager.getOverrideRevision() + this.terrainEdits.revision
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

	/** Advances the clock and re-applies the sky when it moved. Returns whether it was applied. */
	private updateDayCycle(deltaSeconds: number): boolean {
		if (this.multiplayer) {
			if (!this.updateSharedClock()) return false;
			this.applySkySettings();
			return true;
		}
		const cycle = ensureDayCycleSettings(this.skySettings);
		if (!cycle.enabled || this.simulationPaused || deltaSeconds <= 0) return false;
		cycle.timeOfDay = advanceTimeOfDay(cycle.timeOfDay, deltaSeconds, cycle.durationSeconds);
		this.applySkySettings();
		this.dayCyclePersistAccum += deltaSeconds;
		if (this.dayCyclePersistAccum >= 15) {
			this.dayCyclePersistAccum = 0;
			this.markClockDirtyIfNeeded();
		}
		return true;
	}

	/**
	 * Advances the weather (with last frame's camera — the rain volume is world-anchored, so a frame
	 * of lag is invisible) and pushes its wind and wetness to trees and terrain. Returns whether the
	 * sky look needs re-applying.
	 */
	private updateWeather(deltaSeconds: number): boolean {
		const frame = this.weatherFrame;
		frame.feetY = this.controller.worldPosition.y - this.settings.player.eyeHeight;
		frame.viewportHeight = this.renderer.domElement.height || this.container.clientHeight || 1;
		frame.cloudAltitude = this.skySettings.clouds.altitude;
		if (this.multiplayer) this.weather.update(deltaSeconds, frame, this.sharedWeatherTime());
		else this.weather.update(this.simulationPaused ? 0 : deltaSeconds, frame);
		const { smoothedFps, targetFps } = this.graphicsPipeline.getFrameRate();
		this.weather.setPerformance(deltaSeconds, smoothedFps, targetFps);
		this.treeManager.setWeatherWind(this.weather.treeWind());
		this.grassManager.setWeather(this.weather.treeWind(), this.weather.wetness);
		this.grassManager.setPerformance(deltaSeconds, smoothedFps, targetFps);
		this.plantManager.setWeather(this.weather.treeWind(), this.weather.wetness);
		this.plantManager.setPerformance(deltaSeconds, smoothedFps, targetFps);
		const wet = this.weather.wetness;
		const snow = this.weather.snowCover;
		WEATHER_SURFACE_UNIFORMS.uWxWet.value = wet;
		WEATHER_SURFACE_UNIFORMS.uWxSnow.value = snow;
		if (this.scene.fog) WEATHER_SURFACE_UNIFORMS.uWxSky.value.copy(this.scene.fog.color);
		const position = this.controller.worldPosition;
		this.weatherExposure.update(
			position.x,
			position.y,
			position.z,
			this.buildingManager.getRevision() +
				this.foundationManager.getRevision() +
				this.levelManager.getRevision() +
				this.furnitureManager.getRevision() +
				this.miniBuilds.revision,
			wet > 0.005 || snow > 0.005
		);
		const persist = this.weather.persistRevision;
		if (persist !== this.lastWeatherPersistRevision) {
			if (this.lastWeatherPersistRevision >= 0) this.environmentRevision++;
			this.lastWeatherPersistRevision = persist;
		}
		return this.weather.consumeLookChange();
	}

	/** Apply the window editor selection to the opening under the crosshair. */
	applyWindowShuttersToAimedWindow(): boolean {
		const raycaster = new THREE.Raycaster();
		raycaster.setFromCamera(new THREE.Vector2(), this.camera);
		const hit = raycaster.intersectObjects(
			[
				...this.buildingManager.getRaycastableWallMeshes(),
				...this.buildingManager.getRaycastableRoofMeshes()
			],
			false
		)[0];
		return this.buildingManager.applyWindowShuttersFromView(
			this.camera.position,
			raycaster.ray.direction,
			this.buildingSettings.windowShutterMode ?? 'auto',
			hit ? hit.distance + 0.3 : Infinity
		);
	}

	/**
	 * Re-applies every sky/HDRI/atmosphere/cloud setting. Called once at startup, once more when
	 * the (async) HDRI finishes loading, and directly from the GUI on every change — all of these
	 * are cheap scene-property/shader-uniform updates, never a scene rebuild.
	 */
	private applySkySettings(): void {
		ensureDayCycleSettings(this.skySettings);
		// The day/night look first, then the weather on top (clouds, light, fog, lightning flash).
		const look = this.weather.applyToLook(resolveEffectiveSky(this.skySettings));
		this.dayNightLook = look;
		this.skySystem.applySettings(look.sky, look.atmosphere);
		this.cloudSystem.applyDebugSettings(this.skySettings.debug);
		this.hdriSystem.applySettings();
		this.scene.environmentIntensity = look.hdriIntensity;

		this.hemisphereLight.color.set(look.hemiSky);
		this.hemisphereLight.groundColor.set(look.hemiGround);
		this.hemisphereLight.intensity = look.atmosphere.hemisphereIntensity;
		this.sunLight.color.set(look.atmosphere.sunColor);
		this.sunLight.intensity = look.atmosphere.sunEnabled ? look.atmosphere.sunIntensity : 0;
		if (this.graphicsSettings.enhancedLighting) {
			const lighting = ENHANCED_LIGHTING;
			this.hemisphereLight.color.lerp(
				new THREE.Color(lighting.hemisphereSkyNeutral),
				lighting.hemisphereSkyNeutralAmount
			);
			this.hemisphereLight.groundColor.lerp(
				new THREE.Color(lighting.hemisphereGround),
				lighting.hemisphereGroundAmount
			);
			this.hemisphereLight.intensity *= lighting.hemisphereIntensityScale;
			this.sunLight.intensity *= lighting.sunIntensityScale;
			this.scene.environmentIntensity *= lighting.environmentIntensityScale;
		}
		this.graphicsPipeline.setSunColorIntensity(this.sunLight.color, this.sunLight.intensity);
		this.updateSunLightPosition();

		this.applyBackgroundAndFog();

		const showSkyOnly = this.skySettings.debug.showSkyOnly;
		this.terrainManager.group.visible = !showSkyOnly;
		this.treeManager.group.visible = !showSkyOnly;
		this.grassManager.group.visible = !showSkyOnly && this.vegetationSettings.grass.enabled;
		this.plantManager.group.visible = !showSkyOnly && this.vegetationSettings.plants.enabled;
		this.foundationManager.group.visible = !showSkyOnly;
		this.wallManager.group.visible = !showSkyOnly;
		this.wallPathManager.group.visible = !showSkyOnly;
		this.slabManager.group.visible = !showSkyOnly;
		this.stairManager.group.visible = !showSkyOnly;
		this.roofManager.group.visible = !showSkyOnly;
		this.floorDetailManager.group.visible = !showSkyOnly;
		this.furnitureManager.group.visible = !showSkyOnly;
		this.miniBuilds.group.visible = !showSkyOnly;
	}

	/** Blend the procedural dome/clouds over the sharp daytime panorama using game time. */
	private applyBackgroundAndFog(): void {
		const look = this.dayNightLook;
		const backgroundTexture = this.hdriSystem.getBackgroundTexture();
		const blend = backgroundTexture
			? skyBackgroundBlend(ensureDayCycleSettings(this.skySettings).timeOfDay)
			: 0;
		const sky = look?.sky ?? this.skySettings.sky;
		const clouds = look?.clouds ?? this.skySettings.clouds;
		this.skySystem.setHdriBlend(blend);
		this.skySystem.mesh.visible = sky.enabled && blend < 1;
		this.cloudSystem.applySettings({ ...clouds, opacity: clouds.opacity * (1 - blend) });
		this.cloudSystem.group.visible = clouds.enabled && blend < 1;
		this.scene.backgroundIntensity = sky.brightness;
		this.scene.background =
			backgroundTexture && blend > 0 ? backgroundTexture : new THREE.Color(sky.groundHazeColor);

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

		// Updated in place when the fog type is unchanged: weather and the day cycle re-apply this
		// every frame while they move, and a new Fog object each frame is needless garbage.
		const fog = this.scene.fog;
		if (atmosphere.fogDensityMode === 'exponential') {
			const density = 2.5 / Math.max(1, atmosphere.fogFar);
			if (fog instanceof THREE.FogExp2) {
				fog.color.copy(fogColor);
				fog.density = density;
			} else {
				this.scene.fog = new THREE.FogExp2(fogColor.getHex(), density);
			}
		} else if (fog instanceof THREE.Fog) {
			fog.color.copy(fogColor);
			fog.near = atmosphere.fogNear;
			fog.far = atmosphere.fogFar;
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

	// ---------------------------------------------------------------------------------------------
	// Best-quality screenshot (`\`)
	// ---------------------------------------------------------------------------------------------

	private captureInProgress = false;
	private captureRequest: ((blob: Blob | null) => void) | null = null;

	isCapturingScreenshot(): boolean {
		return this.captureInProgress;
	}

	/**
	 * `\`: freezes the player, switches to the best render mode (Ultra, full resolution — no dynamic
	 * downscaling), waits until the view has fully loaded at that quality (terrain and tree streaming,
	 * hydrology, procedural textures all idle for a moment), captures the canvas right after a render,
	 * then restores the exact previous render mode and releases the player — even if anything fails.
	 * Returns the PNG (or null if the browser could not encode it).
	 */
	async captureBestScreenshot(
		options: { timeoutMs?: number; onStage?: (stage: 'loading' | 'capturing') => void } = {}
	): Promise<{
		blob: Blob | null;
		width: number;
		height: number;
		waitedMs: number;
		timedOut: boolean;
	} | null> {
		if (this.captureInProgress) return null;
		this.captureInProgress = true;
		const saved = {
			quality: this.graphicsSettings.quality,
			dynamicResolutionEnabled: this.graphicsSettings.dynamicResolutionEnabled,
			surfaceRelief: this.graphicsSettings.surfaceRelief,
			surfaceSubdivision: this.graphicsSettings.surfaceSubdivision
		};
		const start = performance.now();
		this.controller.setMovementLocked(true);
		try {
			options.onStage?.('loading');
			this.graphicsSettings.dynamicResolutionEnabled = false;
			if (saved.quality !== 'ultra') this.graphicsPipeline.setQuality('ultra');
			else this.graphicsPipeline.refreshAdvancedSettings();
			this.graphicsSettings.surfaceRelief = true;
			this.graphicsSettings.surfaceSubdivision = true;
			this.applySurfaceDetail();
			const timedOut = !(await this.whenRenderSettled(options.timeoutMs ?? 30000));
			await this.whenMaterialsReady();
			options.onStage?.('capturing');
			const blob = await new Promise<Blob | null>((resolve) => (this.captureRequest = resolve));
			const canvas = this.renderer.domElement;
			return {
				blob,
				width: canvas.width,
				height: canvas.height,
				waitedMs: performance.now() - start,
				timedOut
			};
		} finally {
			this.captureRequest = null;
			if (this.graphicsSettings.quality !== saved.quality) {
				this.graphicsPipeline.setQuality(saved.quality);
			}
			this.graphicsSettings.dynamicResolutionEnabled = saved.dynamicResolutionEnabled;
			this.graphicsPipeline.refreshAdvancedSettings();
			this.graphicsSettings.surfaceRelief = saved.surfaceRelief;
			this.graphicsSettings.surfaceSubdivision = saved.surfaceSubdivision;
			this.applySurfaceDetail();
			this.controller.setMovementLocked(false);
			this.captureInProgress = false;
		}
	}

	/** Initial loading only: report real terrain work, then wait for a few settled frames.
	 * Distant vegetation continues streaming in play; a slow worker must not trap the player. */
	async whenInitialWorldReady(onProgress: (progress: number) => void): Promise<void> {
		const start = performance.now();
		let stable = 0;
		while (!this.disposed && performance.now() - start < 12000) {
			await new Promise((resolve) => setTimeout(resolve, 100));
			const position = this.controller.worldPosition;
			const x = worldToChunkCoord(position.x, this.settings.chunkSize);
			const z = worldToChunkCoord(position.z, this.settings.chunkSize);
			let loaded = 0;
			for (let dx = -1; dx <= 1; dx++) {
				for (let dz = -1; dz <= 1; dz++) {
					if (this.terrainManager.getSurfaceLattice(x + dx, z + dz)) loaded++;
				}
			}
			onProgress(loaded / 9);
			const ready = loaded === 9;
			stable = ready ? stable + 1 : 0;
			if (stable >= 3 && performance.now() - start >= 500) return;
		}
	}

	/**
	 * Resolves true once everything that streams in after a quality change has finished: terrain
	 * and tree chunk queues empty, hydrology regions built, procedural textures generated, and full
	 * render resolution — and has stayed that way for ~0.8 s (tree LODs and the last uploads
	 * settle), with at least 1.5 s overall for shader compiles. False on timeout.
	 */
	private async whenRenderSettled(timeoutMs: number): Promise<boolean> {
		const start = performance.now();
		let stable = 0;
		while (performance.now() - start < timeoutMs) {
			await new Promise((resolve) => setTimeout(resolve, 100));
			const idle =
				this.terrainManager.getStats().queuedChunks === 0 &&
				this.treeManager.getStats().queuedChunks === 0 &&
				this.hydrology.getStats().pendingRegions === 0 &&
				this.materialLibrary.getStats().pending === 0 &&
				this.graphicsPipeline.getRenderStats().renderScale === 1;
			stable = idle ? stable + 1 : 0;
			if (stable >= 8 && performance.now() - start >= 1500) return true;
		}
		return false;
	}

	/** Runs right after a render, while the drawing buffer still holds that frame. */
	private fulfilCaptureRequest(): void {
		const resolve = this.captureRequest;
		if (!resolve) return;
		this.captureRequest = null;
		this.renderer.domElement.toBlob((blob) => resolve(blob), 'image/png');
	}

	/** 0 = normal view … 1 = fully zoomed (C held); eased so zooming in and out is smooth. */
	private zoomAmount = 0;

	/**
	 * Applies the field-of-view setting and hold-C zoom. Zoom magnifies by `ZOOM_MAGNIFICATION`
	 * (dividing the half-angle tangent, so the image really is that much larger) and slows mouse
	 * look by the same factor. Only touches the projection (and the shadow cascades, which depend
	 * on it) when the FOV actually changes.
	 */
	private updateFieldOfView(deltaSeconds: number): void {
		const target = this.controller.isZoomHeld() ? 1 : 0;
		const ease = 1 - Math.exp(-Math.min(0.1, deltaSeconds) * 14);
		this.zoomAmount += (target - this.zoomAmount) * ease;
		if (Math.abs(target - this.zoomAmount) < 1e-3) this.zoomAmount = target;
		const magnification = 1 + (ZOOM_MAGNIFICATION - 1) * this.zoomAmount;
		const fov = zoomedFieldOfView(this.graphicsSettings.fieldOfView, magnification);
		this.controller.setLookScale(1 / magnification);
		if (Math.abs(fov - this.camera.fov) < 1e-3) return;
		this.camera.fov = fov;
		this.camera.updateProjectionMatrix();
		this.graphicsPipeline.refreshShadowFrustums();
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
			// The authored grid is world data. Changing chunk size may repartition it, never rescale it.
			if (this.terrainEdits.hasEdits || this.foundationManager.getFoundations().length > 0) {
				this.settings.chunkResolution = Math.max(
					1,
					Math.round(this.settings.chunkSize / this.terrainEdits.spacing)
				);
				this.settings.chunkSize = this.settings.chunkResolution * this.terrainEdits.spacing;
			} else
				this.terrainEdits.spacing = vertexSpacingFor(
					this.settings.chunkSize,
					this.settings.chunkResolution
				);
			this.terrainManager.notifyTopologyChanged();
			this.treeManager.notifyTerrainChanged();
			this.dirty.topology = false;
			this.dirty.settings = false;
			this.dirty.seed = false;
			this.dirty.viewDistance = false;
		} else {
			if (this.dirty.seed) {
				this.hydrology.setSeed(this.settings.seed);
				this.water.clear();
				this.terrainManager.notifySeedChanged();
				this.treeManager.notifySeedChanged(this.settings.seed);
				this.grassManager.setSeed(this.settings.seed);
				this.plantManager.setSeed(this.settings.seed);
				this.dirty.seed = false;
				this.dirty.settings = false;
			} else if (this.dirty.settings) {
				this.hydrology.invalidate();
				this.water.clear();
				this.terrainManager.notifySettingsChanged();
				this.treeManager.notifyTerrainChanged();
				this.barrierManager.rebuildTerrainBarriers();
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
			this.grassManager.notifySettingsChanged();
			this.plantManager.notifySettingsChanged();
			this.dirty.vegetationSettings = false;
		}
		if (this.dirty.vegetationViewDistance) {
			this.treeManager.notifyViewDistanceChanged();
			this.dirty.vegetationViewDistance = false;
		}
	}

	toggleThirdPerson(): void {
		this.controller.toggleThirdPerson();
	}

	private readonly animate = (nowMs: number): void => {
		if (this.disposed) return;
		this.animationFrameId = requestAnimationFrame(this.animate);

		const deltaSeconds =
			this.lastFrameTimeMs === 0 ? 0 : Math.min((nowMs - this.lastFrameTimeMs) / 1000, 0.1);
		this.lastFrameTimeMs = nowMs;

		if (this.devPanelOpen || this.miniBuildEditorOpen || this.speechPreparationOpen) return;
		const frameCpuStart = this.frameCpuSamples ? performance.now() : 0;
		const weatherLookChanged = this.updateWeather(deltaSeconds);
		const skyApplied = this.updateDayCycle(deltaSeconds);
		if (weatherLookChanged && !skyApplied) this.applySkySettings();
		this.flushDirtyFlags();

		this.doorInteraction.update(deltaSeconds);
		this.miniBuildInteraction.update(deltaSeconds);
		this.healthClockMs += deltaSeconds * 1000;
		this.noticeRemovedSupport();
		this.controller.update(deltaSeconds);
		this.health.poll();
		this.miniBuildInteraction.afterPlayerUpdate(
			deltaSeconds,
			this.buildToolManager.isConstructionGestureActive()
		);
		if (this.multiplayer) {
			const interaction = this.miniBuildInteraction.controller.state;
			// Seated or knocked out, others are told where the player stood, not the lowered eye.
			const position =
				interaction.type === 'mini-build'
					? interaction.entry
					: (this.knockedOutAt ?? this.controller.worldPosition);
			this.multiplayer.afterControllerUpdate({
				x: position.x,
				eyeY: position.y,
				z: position.z,
				yaw: this.controller.getYaw(),
				pitch: this.controller.getPitch(),
				flying: this.controller.isFlying(),
				grounded: this.controller.isGrounded(),
				running: this.controller.isRunning(),
				// A punch shows to others as the same arm reach the build tools use.
				building:
					this.buildToolManager.isConstructionGestureActive() ||
					performance.now() < this.punchSwingUntil,
				teleports: this.controller.teleports,
				eyeHeight: this.settings.player.eyeHeight
			});
		}
		this.underwaterTint.setActive(
			this.hydrology.cameraUnderwater(
				this.camera.position.x,
				this.camera.position.y,
				this.camera.position.z
			)
		);
		this.suggestBuildingLevelFoundation();
		this.stairLevelTrigger.update(
			this.controller.worldPosition.x,
			this.controller.worldPosition.y - this.settings.player.eyeHeight,
			this.controller.worldPosition.z
		);
		this.hydrology.prepareAround(this.controller.worldPosition.x, this.controller.worldPosition.z);
		this.terrainManager.update(this.controller.worldPosition.x, this.controller.worldPosition.z);
		const sunDirection = this.sunLight.position.clone().sub(this.sunLight.target.position);
		if (sunDirection.lengthSq() > 0) sunDirection.normalize();
		this.water.update(
			this.hydrology,
			this.controller.worldPosition.x,
			this.controller.worldPosition.z,
			deltaSeconds,
			this.camera.position,
			sunDirection,
			this.sunLight.color,
			this.hemisphereLight.color,
			Math.max(160, this.settings.viewDistance * this.settings.chunkSize)
		);
		this.hydrologyDebugView.update(
			this.hydrology,
			this.hydrologyDebug,
			this.controller.worldPosition.x,
			this.controller.worldPosition.z,
			(x, z) => this.terrainManager.getHeightSampler().sampleBase(x, z)
		);
		this.updateParticles(deltaSeconds, sunDirection);
		this.treeManager.update(this.controller.worldPosition.x, this.controller.worldPosition.z);
		this.treeManager.updateView(this.camera.position, deltaSeconds);
		this.grassManager.update(this.controller.worldPosition.x, this.controller.worldPosition.z);
		this.grassManager.updateView(this.camera, deltaSeconds, {
			x: this.controller.worldPosition.x,
			feetY: this.controller.worldPosition.y - this.settings.player.eyeHeight,
			z: this.controller.worldPosition.z
		});
		this.plantManager.update(this.controller.worldPosition.x, this.controller.worldPosition.z);
		this.plantManager.updateView(this.camera, deltaSeconds, {
			x: this.controller.worldPosition.x,
			feetY: this.controller.worldPosition.y - this.settings.player.eyeHeight,
			z: this.controller.worldPosition.z
		});
		this.miniBuilds.update(this.controller.worldPosition.x, this.controller.worldPosition.z);
		this.buildToolManager.update();
		this.miniBuildChunkBoundaries.update(
			this.controller.worldPosition,
			this.buildingManager.getRevision() + this.foundationManager.getRevision()
		);
		this.music.animate();
		this.creatures.setSeed(this.settings.seed);
		this.creatures.update(
			this.controller.worldPosition,
			deltaSeconds,
			this.graphicsPipeline.getQuality()
		);
		this.furnitureManager.updateLights(this.camera.position, nowMs / 1000);
		if (this.collisionVisualizer.isEnabled()) {
			this.collisionVisualizer.update();
		}

		this.skySystem.update(this.camera.position, nowMs / 1000);
		this.cloudSystem.setSunDirection(
			this.cloudSunScratch
				.copy(this.sunLight.position)
				.sub(this.sunLight.target.position)
				.normalize()
		);
		this.cloudSystem.update(
			deltaSeconds,
			this.skySettings.clouds,
			this.camera.position.x,
			this.camera.position.z
		);
		this.updateSunLightPosition();
		this.multiplayer?.beforeRender(deltaSeconds);

		this.updateFieldOfView(deltaSeconds);
		this.graphicsPipeline.update(deltaSeconds);
		// Gives meshes built since last frame their real-world UVs before they are drawn again.
		this.surfaceBinder.flush();
		const renderCpuStart = this.frameCpuSamples ? performance.now() : 0;
		this.graphicsPipeline.render();
		this.fulfilCaptureRequest();
		if (this.frameCpuSamples) {
			const end = performance.now();
			this.frameCpuSamples.push({ frame: end - frameCpuStart, render: end - renderCpuStart });
		}

		this.updateStats(deltaSeconds);
	};

	private updateStats(deltaSeconds: number): void {
		if (!this.onStatsUpdate) return;

		this.statsClock += deltaSeconds;
		this.frameDropMeter.push(this.statsClock, deltaSeconds, this.graphicsSettings.targetFps);
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

	/**
	 * Lake-shore splashes schedule bursts near the player; the shared particle system simulates and
	 * uploads every live particle (one draw call). Lit roughly like a droplet in the open: sky light
	 * plus sun when it is up.
	 */
	private updateParticles(deltaSeconds: number, sunDirection: THREE.Vector3): void {
		this.particleMatrix.multiplyMatrices(
			this.camera.projectionMatrix,
			this.camera.matrixWorldInverse
		);
		this.particleFrustum.setFromProjectionMatrix(this.particleMatrix);
		const sunUp = Math.max(0, sunDirection.y);
		this.particleLight
			.copy(this.hemisphereLight.color)
			.multiplyScalar(this.hemisphereLight.intensity * 0.75)
			.add(
				this.lakeSplashScratch
					.copy(this.sunLight.color)
					.multiplyScalar(this.sunLight.intensity * 0.3 * sunUp)
			);
		const max = Math.max(this.particleLight.r, this.particleLight.g, this.particleLight.b);
		if (max > 1.15) this.particleLight.multiplyScalar(1.15 / max);
		this.particles.setLight(this.particleLight);
		this.lakeSplashes.update(
			deltaSeconds,
			this.controller.worldPosition.x,
			this.controller.worldPosition.z,
			this.particleFrustum
		);
		this.particles.update(deltaSeconds);
	}

	private readonly lakeSplashScratch = new THREE.Color();

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
			frameDrops: this.frameDropMeter.count,
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
			trees: this.graphicsSettings.showRenderStats ? this.treeRenderStats() : undefined,
			grass: this.graphicsSettings.showRenderStats ? this.grassRenderStats() : undefined,
			plants: this.graphicsSettings.showRenderStats ? this.plantRenderStats() : undefined,
			particles: this.graphicsSettings.showRenderStats
				? { ...this.particles.getStats(), splash: { ...this.lakeSplashes.getStats() } }
				: undefined,
			weather: this.graphicsSettings.showRenderStats ? this.weather.getStats() : undefined,
			water: this.graphicsSettings.showRenderStats
				? {
						...this.water.getStats(),
						regions: this.hydrology.getStats().regions,
						rivers: this.hydrology.getStats().rivers,
						logicalLakes: this.hydrology.getStats().lakes,
						regionMs: this.hydrology.getStats().lastRegionMs
					}
				: undefined,
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
			showFpsCounter: this.graphicsSettings.showFpsCounter,
			dayCycleEnabled: cycle.enabled,
			timeOfDay: cycle.timeOfDay,
			...(this.miniBuildPreferences.display.showChunkUsage
				? { miniBuildChunk: this.getMiniBuildChunkReadout() }
				: {}),
			...(this.graphicsSettings.showRenderStats
				? {
						miniBuilds: this.miniBuilds.getDebugStats(),
						miniBuildTarget: this.getMiniBuildTargetDebug()
					}
				: {})
		});
	}

	dispose(): void {
		this.disposed = true;
		this.renderer.domElement.removeEventListener('mousedown', this.handlePunchMouseDown);
		this.health.dispose();
		this.multiplayer?.detach();
		this.multiplayer = null;
		window.clearTimeout(this.hydrologyRebuildTimer);
		this.water.dispose();
		this.lakeSplashes.dispose();
		this.weather.dispose();
		this.weatherExposure.dispose();
		this.particles.dispose();
		const debugWindow = window as unknown as { forestScene?: ThreeScene };
		if (debugWindow.forestScene === this) delete debugWindow.forestScene;
		cancelAnimationFrame(this.animationFrameId);
		this.resizeObserver.disconnect();
		this.buildToolManager.dispose();
		this.shovelTool.dispose();
		this.foundationTool.dispose();
		this.wallTool.dispose();
		this.windowTool.dispose();
		this.miniBuildInteraction.dispose();
		this.doorInteraction.dispose();
		this.doorTool.dispose();
		this.beamTool.dispose();
		this.polygonWallTool.dispose();
		this.barrierTool.dispose();
		this.ceilingTool.dispose();
		this.floorTool.dispose();
		this.roofTool.dispose();
		this.stairTool.dispose();
		this.floorCarpetTool.dispose();
		this.floorPathTool.dispose();
		this.floorPlanksTool.dispose();
		this.floorTilesTool.dispose();
		this.placeObjectTool.dispose();
		this.furnitureTool.dispose();
		this.furnitureManager.dispose();
		this.barrierManager.dispose();
		this.miniBuildThumbnails.dispose();
		this.miniBuildChunkBoundaries.dispose();
		this.miniBuilds.dispose();
		this.removeTool.dispose();
		this.music.dispose();
		this.creatures.dispose();
		this.paintTool.dispose();
		this.moveTool.dispose();
		this.materialManager.dispose();
		this.materialLibrary.dispose();
		this.surfaceBinder.dispose();
		this.collisionVisualizer.dispose();
		this.treeManager.dispose();
		this.grassManager.dispose();
		this.plantManager.dispose();
		this.wallManager.dispose();
		this.wallPathManager.dispose();
		this.slabManager.dispose();
		this.stairManager.dispose();
		this.floorDetailManager.dispose();
		this.skirtingTool.dispose();
		this.pillarTool.dispose();
		this.skirtingRunManager.dispose();
		this.levelManager.dispose();
		this.undoManager.dispose();
		this.foundationManager.dispose();
		this.controller.dispose();
		this.underwaterTint.dispose();
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
