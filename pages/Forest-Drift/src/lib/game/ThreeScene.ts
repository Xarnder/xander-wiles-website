import * as THREE from 'three';
import { BuildToolManager } from './building/BuildToolManager';
import { FoundationManager } from './building/FoundationManager';
import { FoundationTool } from './building/FoundationTool';
import type { BuildingSettings, BuildUiState, HotbarUiState } from './building/FoundationTypes';
import { vertexSpacingFor } from './building/foundationMath';
import { WorldSurfaceSampler } from './building/WorldSurfaceSampler';
import { TerrainDebugGui } from './debug/TerrainDebugGui';
import { FirstPersonController } from './player/FirstPersonController';
import { resolveFogColor } from './sky/atmosphereMath';
import { CloudSystem } from './sky/CloudSystem';
import { HdriEnvironmentSystem } from './sky/HdriEnvironmentSystem';
import { SkySystem } from './sky/SkySystem';
import type { SkySettings } from './sky/SkyTypes';
import { worldToChunkCoord } from './terrain/chunkKey';
import { TerrainManager } from './terrain/TerrainManager';
import type { TerrainSettings } from './terrain/TerrainSettings';
import { TreeManager } from './vegetation/TreeManager';
import type { VegetationSettings } from './vegetation/VegetationTypes';

/** Sun light offset distance (world units) from the camera — see updateSunLightPosition(). */
const SUN_LIGHT_DISTANCE = 300;

export interface SceneStats {
	fps: number;
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
export class ThreeScene {
	private readonly container: HTMLElement;
	private readonly settings: TerrainSettings;
	private readonly skySettings: SkySettings;
	private readonly onStatsUpdate?: (stats: SceneStats) => void;

	private readonly scene: THREE.Scene;
	private readonly camera: THREE.PerspectiveCamera;
	private readonly renderer: THREE.WebGLRenderer;
	private readonly terrainManager: TerrainManager;
	private readonly treeManager: TreeManager;
	private readonly foundationManager: FoundationManager;
	private readonly worldSurfaceSampler: WorldSurfaceSampler;
	private readonly controller: FirstPersonController;
	private readonly foundationTool: FoundationTool;
	private readonly buildToolManager: BuildToolManager;
	private readonly gui: TerrainDebugGui;
	private readonly resizeObserver: ResizeObserver;

	private readonly skySystem: SkySystem;
	private readonly cloudSystem: CloudSystem;
	private readonly hdriSystem: HdriEnvironmentSystem;
	private readonly hemisphereLight: THREE.HemisphereLight;
	private readonly sunLight: THREE.DirectionalLight;

	private lastFrameTimeMs = 0;

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
		this.skySettings = options.skySettings;
		this.onStatsUpdate = options.onStatsUpdate;

		this.scene = new THREE.Scene();

		this.camera = new THREE.PerspectiveCamera(70, 1, 0.1, 2000);

		this.renderer = new THREE.WebGLRenderer({ antialias: true });
		this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
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

		this.hdriSystem = new HdriEnvironmentSystem(this.renderer, this.scene, this.skySettings.hdri);

		this.terrainManager = new TerrainManager(this.settings);
		this.scene.add(this.terrainManager.group);

		const buildingSettings = options.buildingSettings;
		this.foundationManager = new FoundationManager(() =>
			vertexSpacingFor(this.settings.chunkSize, this.settings.chunkResolution)
		);
		this.scene.add(this.foundationManager.group);

		this.worldSurfaceSampler = new WorldSurfaceSampler(
			this.terrainManager.getHeightSampler(),
			this.foundationManager
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

		this.controller = new FirstPersonController({
			domElement: this.renderer.domElement,
			camera: this.camera,
			getTerrainHeight: (x, z) => this.worldSurfaceSampler.getGroundHeight(x, z),
			settings: this.settings.player,
			onPointerLockChange: options.onPointerLockChange
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

		this.buildToolManager = new BuildToolManager({
			domElement: this.renderer.domElement,
			tools: { foundation: this.foundationTool },
			isPointerLocked: () => this.controller.isPointerLocked(),
			onHotbarChange: options.onHotbarChange,
			onHudChange: options.onBuildHudChange
		});

		this.gui = new TerrainDebugGui(this.settings, {
			onTopologyChange: () => {
				this.dirty.topology = true;
			},
			onViewDistanceChange: () => {
				this.dirty.viewDistance = true;
			},
			onSettingsChange: () => {
				this.dirty.settings = true;
			},
			onSeedChange: () => {
				this.dirty.seed = true;
			},
			onRenderingChange: () => {
				this.dirty.rendering = true;
			}
		});
		this.gui.addBuildingFolder(buildingSettings, () => {
			this.foundationManager.setShowBounds(buildingSettings.showFoundationBounds);
		});
		this.gui.addVegetationFolder(options.vegetationSettings, {
			onSettingsChange: () => {
				this.dirty.vegetationSettings = true;
			},
			onViewDistanceChange: () => {
				this.dirty.vegetationViewDistance = true;
			},
			onBorderToggle: () => {
				this.treeManager.setBorderVisibility(options.vegetationSettings.debug.showTreeChunkBorders);
			}
		});
		this.gui.addSkyFolder(this.skySettings, () => this.applySkySettings());

		// Sky/lights/fog are cheap to apply directly (no dirty-flag batching needed — see
		// TerrainDebugGui.addSkyFolder's doc comment) and don't depend on the HDRI having finished
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

		this.animationFrameId = requestAnimationFrame(this.animate);
	}

	/** Lets the Svelte hotbar UI select a slot by click, in addition to the number-key shortcuts. */
	selectHotbarSlot(slot: number): void {
		this.buildToolManager.selectSlot(slot);
	}

	/**
	 * Re-applies every sky/HDRI/atmosphere/cloud setting. Called once at startup, once more when
	 * the (async) HDRI finishes loading, and directly from the GUI on every change — all of these
	 * are cheap scene-property/shader-uniform updates, never a scene rebuild.
	 */
	private applySkySettings(): void {
		this.skySystem.applySettings(this.skySettings.sky, this.skySettings.atmosphere);
		this.cloudSystem.applySettings(this.skySettings.clouds);
		this.cloudSystem.applyDebugSettings(this.skySettings.debug);
		this.hdriSystem.applySettings();

		this.hemisphereLight.intensity = this.skySettings.atmosphere.hemisphereIntensity;
		this.sunLight.color.set(this.skySettings.atmosphere.sunColor);
		this.sunLight.intensity = this.skySettings.atmosphere.sunEnabled
			? this.skySettings.atmosphere.sunIntensity
			: 0;
		this.updateSunLightPosition();

		this.applyBackgroundAndFog();

		const showSkyOnly = this.skySettings.debug.showSkyOnly;
		this.terrainManager.group.visible = !showSkyOnly;
		this.treeManager.group.visible = !showSkyOnly;
		this.foundationManager.group.visible = !showSkyOnly;
	}

	/** `scene.background` is contested between "let the sky dome show" and "debug: show the raw HDRI" — this is the single place that decides. */
	private applyBackgroundAndFog(): void {
		const backgroundTexture = this.hdriSystem.getBackgroundTexture();
		this.scene.background =
			backgroundTexture ?? new THREE.Color(this.skySettings.sky.groundHazeColor);

		const atmosphere = this.skySettings.atmosphere;
		if (!atmosphere.fogEnabled) {
			this.scene.fog = null;
			return;
		}

		const fogColor = resolveFogColor(
			this.skySystem.getHorizonColorHex(this.skySettings.sky),
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
	}

	private handleResize(): void {
		const width = this.container.clientWidth;
		const height = this.container.clientHeight;
		if (width === 0 || height === 0) return;

		this.camera.aspect = width / height;
		this.camera.updateProjectionMatrix();
		this.renderer.setSize(width, height);
	}

	/**
	 * Applies at most one terrain-manager notification per category per frame, however many slider
	 * ticks happened. Terrain changes also nudge vegetation (see TreeManager.notifyTerrainChanged)
	 * since tree Y/slope placement reads the same TerrainHeightSampler — vegetation's own revision
	 * counter still only bumps for vegetation-specific settings, so terrain tweaking never rebuilds
	 * terrain chunks unnecessarily and vice versa.
	 */
	private flushDirtyFlags(): void {
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

		this.flushDirtyFlags();

		this.controller.update(deltaSeconds);
		this.terrainManager.update(this.controller.worldPosition.x, this.controller.worldPosition.z);
		this.treeManager.update(this.controller.worldPosition.x, this.controller.worldPosition.z);
		this.buildToolManager.update();

		this.skySystem.update(this.camera.position);
		this.cloudSystem.update(
			deltaSeconds,
			this.skySettings.clouds,
			this.camera.position.x,
			this.camera.position.z
		);
		this.updateSunLightPosition();

		this.renderer.render(this.scene, this.camera);

		this.updateStats(deltaSeconds);
	};

	private updateStats(deltaSeconds: number): void {
		if (!this.onStatsUpdate) return;

		this.statsFrameCount++;
		this.statsAccumSeconds += deltaSeconds;
		if (this.statsAccumSeconds < 0.25) return;

		const fps = this.statsFrameCount / this.statsAccumSeconds;
		this.statsFrameCount = 0;
		this.statsAccumSeconds = 0;

		const stats = this.terrainManager.getStats();
		const vegetationStats = this.treeManager.getStats();
		const position = this.controller.worldPosition;

		this.onStatsUpdate({
			fps: Math.round(fps),
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
			vegetationRevision: vegetationStats.revision
		});
	}

	dispose(): void {
		this.disposed = true;
		cancelAnimationFrame(this.animationFrameId);
		this.resizeObserver.disconnect();
		this.gui.dispose();
		this.buildToolManager.dispose();
		this.foundationTool.dispose();
		this.treeManager.dispose();
		this.foundationManager.dispose();
		this.controller.dispose();
		this.terrainManager.dispose();
		this.skySystem.dispose();
		this.cloudSystem.dispose();
		this.hdriSystem.dispose();
		this.renderer.dispose();
		if (this.renderer.domElement.parentElement === this.container) {
			this.container.removeChild(this.renderer.domElement);
		}
	}
}
