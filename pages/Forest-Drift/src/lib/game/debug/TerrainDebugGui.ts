import GUI from 'lil-gui';
import type { BuildingSettings } from '../building/FoundationTypes';
import type { SkySettings } from '../sky/SkyTypes';
import type { TerrainSettings } from '../terrain/TerrainSettings';
import type { VegetationSettings } from '../vegetation/VegetationTypes';

export interface TerrainDebugGuiCallbacks {
	/** chunkSize / chunkResolution changed — vertex topology must be rebuilt. */
	onTopologyChange: () => void;
	/** viewDistance changed — active chunk area must be recomputed, no geometry rebuild needed. */
	onViewDistanceChange: () => void;
	/** Any noise/shape/warp parameter changed — regenerate visible chunks in place. */
	onSettingsChange: () => void;
	/** seed text changed — reseed noise generators, then regenerate. */
	onSeedChange: () => void;
	/** Rendering toggle changed — apply directly, no regeneration. */
	onRenderingChange: () => void;
}

/**
 * Builds the lil-gui debug panel. Every control mutates `settings` in place and then calls the
 * matching callback; ThreeScene decides how (and how often, per frame) to act on those callbacks
 * so rapid slider dragging never stalls the main thread or the GUI itself.
 */
export class TerrainDebugGui {
	private readonly gui: GUI;

	constructor(settings: TerrainSettings, callbacks: TerrainDebugGuiCallbacks) {
		this.gui = new GUI({ title: 'Forest Drift — Terrain' });

		const world = this.gui.addFolder('World');
		world.add(settings, 'seed').name('seed').onFinishChange(callbacks.onSeedChange);
		world.add(settings, 'heightMultiplier', 0, 4, 0.01).onChange(callbacks.onSettingsChange);
		world.add(settings, 'baseHeight', -50, 50, 0.5).onChange(callbacks.onSettingsChange);
		world.add(settings, 'terraceAmount', 0, 1, 0.01).onChange(callbacks.onSettingsChange);

		const chunkLoading = this.gui.addFolder('Chunk Loading');
		chunkLoading.add(settings, 'chunkSize', 16, 256, 1).onFinishChange(callbacks.onTopologyChange);
		chunkLoading
			.add(settings, 'chunkResolution', 4, 128, 1)
			.onFinishChange(callbacks.onTopologyChange);
		chunkLoading.add(settings, 'viewDistance', 1, 12, 1).onChange(callbacks.onViewDistanceChange);
		chunkLoading.add(settings, 'chunksGeneratedPerFrame', 1, 8, 1);
		chunkLoading.close();

		const regions = this.gui.addFolder('Terrain Regions');
		const onSettingsChange = callbacks.onSettingsChange;

		const biome = regions.addFolder('Biome Distribution');
		biome.add(settings.biome, 'scale', 100, 3000, 10).onChange(onSettingsChange);
		biome.add(settings.biome, 'contrast', 0.3, 3, 0.05).onChange(onSettingsChange);
		biome.add(settings.biome, 'blendWidth', 0, 1, 0.01).onChange(onSettingsChange);
		biome.add(settings.biome, 'warpStrength', 0, 400, 5).onChange(onSettingsChange);

		const macro = regions.addFolder('Macro Elevation');
		macro.add(settings.macroElevation, 'scale', 200, 8000, 50).onChange(onSettingsChange);
		macro.add(settings.macroElevation, 'amplitude', 0, 80, 0.5).onChange(onSettingsChange);

		const plains = regions.addFolder('Plains');
		plains.add(settings.plains, 'amplitude', 0, 20, 0.1).onChange(onSettingsChange);
		plains.add(settings.plains, 'flatness', 0, 1, 0.01).onChange(onSettingsChange);
		plains
			.add(settings.plains, 'detailStrength', 0, 2, 0.01)
			.name('detail strength')
			.onChange(onSettingsChange);

		const hills = regions.addFolder('Rolling Hills');
		hills.add(settings.hills, 'amplitude', 0, 60, 0.5).onChange(onSettingsChange);
		hills.add(settings.hills, 'scale', 20, 800, 5).onChange(onSettingsChange);
		hills.add(settings.hills, 'roundness', 0, 1, 0.01).onChange(onSettingsChange);
		hills
			.add(settings.hills, 'detailStrength', 0, 2, 0.01)
			.name('detail strength')
			.onChange(onSettingsChange);

		const highlands = regions.addFolder('Highlands');
		highlands.add(settings.highlands, 'amplitude', 0, 100, 0.5).onChange(onSettingsChange);
		highlands.add(settings.highlands, 'scale', 20, 800, 5).onChange(onSettingsChange);
		highlands.add(settings.highlands, 'ridgeAmount', 0, 1, 0.01).onChange(onSettingsChange);
		highlands
			.add(settings.highlands, 'detailStrength', 0, 2, 0.01)
			.name('detail strength')
			.onChange(onSettingsChange);

		const mountains = regions.addFolder('Mountains');
		mountains.add(settings.mountains, 'amplitude', 0, 200, 1).onChange(onSettingsChange);
		mountains.add(settings.mountains, 'scale', 40, 1500, 10).onChange(onSettingsChange);
		mountains.add(settings.mountains, 'sharpness', 0.2, 4, 0.05).onChange(onSettingsChange);
		mountains
			.add(settings.mountains, 'detailStrength', 0, 3, 0.01)
			.name('detail strength')
			.onChange(onSettingsChange);

		const mountainRanges = regions.addFolder('Mountain Ranges');
		mountainRanges.add(settings.mountains, 'regionScale', 100, 4000, 25).onChange(onSettingsChange);
		mountainRanges
			.add(settings.mountains, 'regionThreshold', 0, 1, 0.01)
			.onChange(onSettingsChange);
		mountainRanges.add(settings.mountains, 'regionBlend', 0, 1, 0.01).onChange(onSettingsChange);
		mountainRanges.add(settings.mountains, 'warpStrength', 0, 600, 5).onChange(onSettingsChange);

		const detailWarp = regions.addFolder('Detail Warp');
		detailWarp.add(settings.detailWarp, 'enabled').onChange(onSettingsChange);
		detailWarp.add(settings.detailWarp, 'frequency', 0.005, 0.3, 0.001).onChange(onSettingsChange);
		detailWarp.add(settings.detailWarp, 'strength', 0, 10, 0.1).onChange(onSettingsChange);
		detailWarp.add(settings.detailWarp, 'octaves', 1, 4, 1).onChange(onSettingsChange);

		for (const folder of [
			biome,
			macro,
			plains,
			hills,
			highlands,
			mountains,
			mountainRanges,
			detailWarp
		]) {
			folder.close();
		}

		const rendering = this.gui.addFolder('Rendering');
		rendering.add(settings.rendering, 'wireframe').onChange(callbacks.onRenderingChange);
		rendering.add(settings.rendering, 'showChunkBorders').onChange(callbacks.onRenderingChange);
		rendering.add(settings.rendering, 'showChunkCoordinates').onChange(callbacks.onRenderingChange);
		rendering
			.add(settings.rendering, 'debugView', {
				Normal: 'normal',
				'Biome Colours': 'biomeColors',
				'Biome Mask': 'biomeMask',
				Elevation: 'elevation',
				'Forest Density': 'forestDensity',
				'Terrain + Forest': 'terrainPlusForest'
			})
			.name('Debug View')
			.onChange(callbacks.onSettingsChange);

		const player = this.gui.addFolder('Player');
		player.add(settings.player, 'walkSpeed', 1, 20, 0.5);
		player.add(settings.player, 'runSpeed', 1, 30, 0.5);
		player.add(settings.player, 'eyeHeight', 0.5, 4, 0.1);
		player.add(settings.player, 'gravityEnabled');
	}

	/**
	 * Dev-only building controls. showFoundationBounds/showWallBounds get real callbacks because
	 * they must apply immediately to already-placed foundations/walls; everything else here
	 * (including every Wall/Window/Door dimension) is simply read live by the building tools each
	 * time they need it (same pattern as the Player folder above) — changing a default only affects
	 * the *next* thing placed, since WallDefinition/WallOpeningDefinition copy these values at
	 * placement time rather than referencing settings, so no onChange wiring is needed for them.
	 */
	addBuildingFolder(
		settings: BuildingSettings,
		callbacks: {
			onShowFoundationBoundsChange: () => void;
			onShowWallBoundsChange: () => void;
			onShowSlabBoundsChange: () => void;
			onShowStairBoundsChange: () => void;
		}
	): void {
		const building = this.gui.addFolder('Building');

		const foundation = building.addFolder('Foundation');
		foundation.add(settings, 'showVertexGrid');
		foundation.add(settings, 'foundationGridDisplayRadius', 1, 10, 1);
		foundation.add(settings, 'maxFoundationCells', 4, 128, 1);
		foundation.add(settings, 'foundationUndergroundDepth', 0, 10, 0.1);
		foundation.add(settings, 'showFoundationHighestPoint');
		foundation
			.add(settings, 'showFoundationBounds')
			.onChange(callbacks.onShowFoundationBoundsChange);
		foundation.add(settings, 'previewOpacity', 0.1, 1, 0.05);

		const grid = building.addFolder('Grid');
		grid.add(settings, 'buildingGridSize', 0.05, 2, 0.05);
		grid.add(settings, 'showBuildingGrid');
		grid.add(settings, 'buildingGridOpacity', 0, 1, 0.05);

		const walls = building.addFolder('Walls');
		walls.add(settings, 'wallHeight', 0.5, 6, 0.05);
		walls.add(settings, 'wallThickness', 0.05, 0.5, 0.01);
		walls.add(settings, 'minimumWallLength', 0.05, 2, 0.05);
		walls.add(settings, 'showWallBounds').onChange(callbacks.onShowWallBoundsChange);
		walls
			.add(settings, 'wallJoinStyle', { Miter: 'miter', Bevel: 'bevel' })
			.name('Join style (Continuous Wall)');
		walls.add(settings, 'miterLimit', 1, 10, 0.5).name('Miter limit');
		walls.add(settings, 'cornerOpeningMargin', 0.05, 1, 0.01).name('Corner opening margin');

		const windows = building.addFolder('Windows');
		windows.add(settings, 'windowWidth', 0.2, 4, 0.05);
		windows.add(settings, 'windowHeight', 0.2, 3, 0.05);
		windows.add(settings, 'windowSillHeight', 0, 3, 0.05);
		windows.add(settings, 'openingGridSize', 0.02, 1, 0.01);
		windows.add(settings, 'openingEdgeMargin', 0, 1, 0.01);
		windows.add(settings, 'openingSpacing', 0, 1, 0.01);

		const doors = building.addFolder('Doors');
		doors.add(settings, 'doorWidth', 0.4, 3, 0.05);
		doors.add(settings, 'doorHeight', 0.5, 4, 0.05);
		doors.add(settings, 'openingGridSize', 0.02, 1, 0.01);
		doors.add(settings, 'openingEdgeMargin', 0, 1, 0.01);
		doors.add(settings, 'openingSpacing', 0, 1, 0.01);

		// currentBuildingLevelIndex is now a live, best-effort MIRROR of whichever foundation is
		// currently active's own level — BuildingLevelManager's own per-foundation map is the real
		// source of truth (see its class doc comment). `.listen()` keeps this display in sync; dragging
		// it directly no longer has any lasting effect (the next mirror update overwrites it), so it's
		// shown read-only-in-practice here rather than removed outright — the real player-facing
		// control is the on-screen floor selector / Page Up/Page Down.
		const levels = building.addFolder('Levels');
		levels
			.add(settings, 'currentBuildingLevelIndex', 0, 20, 1)
			.name('Current level (mirror)')
			.listen();
		levels.add(settings, 'defaultStoreyHeight', 1, 8, 0.1).name('Default storey height');
		levels.add(settings, 'maxBuildingLevels', 1, 30, 1).name('Max levels');
		levels.add(settings, 'showLevelConstructionPlane').name('Show construction plane');
		levels
			.add(settings, 'buildingLevelViewMode', {
				All: 'all',
				'Current + Below': 'current-and-below',
				'Current Only': 'current-only'
			})
			.name('Level view mode');
		levels.add(settings, 'fadeNonCurrentLevels').name('Fade other levels');

		const slabs = building.addFolder('Slabs');
		slabs.add(settings, 'floorThickness', 0.05, 1, 0.01).name('Floor thickness');
		slabs.add(settings, 'roofThickness', 0.05, 1, 0.01).name('Roof thickness');
		slabs.add(settings, 'showSlabBounds').onChange(callbacks.onShowSlabBoundsChange);
		slabs.add(settings, 'showSlabPolygonPoints').name('Show polygon points');
		slabs.add(settings, 'slabPreviewOpacity', 0.1, 1, 0.05).name('Preview opacity');

		const stairs = building.addFolder('Stairs');
		stairs.add(settings, 'minimumStairWidthCells', 1, 10, 1).name('Min width (cells)');
		stairs.add(settings, 'minimumStairRunCells', 1, 20, 1).name('Min run (cells)');
		stairs.add(settings, 'maxStepHeight', 0.05, 1, 0.01).name('Max step height');
		stairs.add(settings, 'stairPreviewOpacity', 0.1, 1, 0.05).name('Preview opacity');
		stairs.add(settings, 'showStairBounds').onChange(callbacks.onShowStairBoundsChange);
		stairs.add(settings, 'showStairDirection').name('Show direction markers');
		stairs.add(settings, 'stairHeadClearance', 1, 3, 0.05).name('Head clearance');
	}

	/**
	 * Vegetation is a fully independent system from terrain regions (see VegetationRegionSampler) —
	 * changing anything here regenerates only vegetation chunks, never terrain, via
	 * onSettingsChange. showTreeChunkBorders is wired separately (onBorderToggle) since it can
	 * apply instantly to already-loaded chunks without a regeneration pass; the other two debug
	 * toggles need one, since they change what per-cell data gets collected during generation.
	 */
	addVegetationFolder(
		settings: VegetationSettings,
		callbacks: {
			onSettingsChange: () => void;
			onViewDistanceChange: () => void;
			onBorderToggle: () => void;
		}
	): void {
		const vegetation = this.gui.addFolder('Vegetation');

		const forest = vegetation.addFolder('Forest Regions');
		forest
			.add(settings.forest, 'forestRegionScale', 100, 4000, 25)
			.onChange(callbacks.onSettingsChange);
		forest.add(settings.forest, 'forestThreshold', 0, 1, 0.01).onChange(callbacks.onSettingsChange);
		forest
			.add(settings.forest, 'forestBlendWidth', 0.01, 0.5, 0.01)
			.onChange(callbacks.onSettingsChange);
		forest
			.add(settings.forest, 'forestWarpScale', 20, 1000, 10)
			.onChange(callbacks.onSettingsChange);
		forest
			.add(settings.forest, 'forestWarpStrength', 0, 400, 5)
			.onChange(callbacks.onSettingsChange);
		forest.add(settings.forest, 'clearingScale', 20, 600, 5).onChange(callbacks.onSettingsChange);
		forest
			.add(settings.forest, 'clearingStrength', 0, 1, 0.01)
			.onChange(callbacks.onSettingsChange);
		forest
			.add(settings.forest, 'clearingThreshold', 0, 1, 0.01)
			.onChange(callbacks.onSettingsChange);
		forest.add(settings.forest, 'treeClusterScale', 5, 200, 1).onChange(callbacks.onSettingsChange);
		forest
			.add(settings.forest, 'treeClusterStrength', 0, 1, 0.01)
			.onChange(callbacks.onSettingsChange);
		forest.close();

		const trees = vegetation.addFolder('Trees');
		trees.add(settings.trees, 'treeCellSize', 2, 20, 0.5).onChange(callbacks.onSettingsChange);
		trees
			.add(settings.trees, 'treeDensityMultiplier', 0, 3, 0.05)
			.onChange(callbacks.onSettingsChange);
		trees
			.add(settings.loading, 'treeViewDistanceChunks', 1, 10, 1)
			.name('viewDistanceChunks')
			.onChange(callbacks.onViewDistanceChange);
		trees
			.add(settings.loading, 'treeChunksGeneratedPerFrame', 1, 8, 1)
			.name('chunksGeneratedPerFrame');
		trees.add(settings.trees, 'minTreeScale', 0.2, 2, 0.05).onChange(callbacks.onSettingsChange);
		trees.add(settings.trees, 'maxTreeScale', 0.2, 3, 0.05).onChange(callbacks.onSettingsChange);
		trees.add(settings.trees, 'maxTreeSlopeDegrees', 5, 80, 1).onChange(callbacks.onSettingsChange);
		trees.add(settings.trees, 'enableTreeLine').onChange(callbacks.onSettingsChange);
		trees
			.add(settings.trees, 'treeLineStartHeight', -20, 150, 1)
			.onChange(callbacks.onSettingsChange);
		trees
			.add(settings.trees, 'treeLineEndHeight', -20, 200, 1)
			.onChange(callbacks.onSettingsChange);
		trees.close();

		const debug = vegetation.addFolder('Debug');
		debug.add(settings.debug, 'showTreeCells').onChange(callbacks.onSettingsChange);
		debug.add(settings.debug, 'showTreeChunkBorders').onChange(callbacks.onBorderToggle);
		debug.add(settings.debug, 'showRejectedTreeCandidates').onChange(callbacks.onSettingsChange);
		debug.close();
	}

	/**
	 * Sky/HDRI/atmosphere/clouds. Unlike terrain, none of this needs a dirty-flag/revision
	 * mechanism — every control here is a cheap shader-uniform or scene-property update (no chunk
	 * regeneration, no HDRI re-fetch), so `onChange` is called directly and applies immediately.
	 */
	addSkyFolder(settings: SkySettings, onChange: () => void): void {
		const root = this.gui.addFolder('Sky');

		const sky = root.addFolder('Sky');
		sky.add(settings.sky, 'enabled').onChange(onChange);
		sky.addColor(settings.sky, 'topColor').onChange(onChange);
		sky.addColor(settings.sky, 'midColor').onChange(onChange);
		sky.addColor(settings.sky, 'horizonColor').onChange(onChange);
		sky.addColor(settings.sky, 'groundHazeColor').onChange(onChange);
		sky.add(settings.sky, 'horizonHeight', -0.3, 0.3, 0.005).onChange(onChange);
		sky.add(settings.sky, 'horizonSoftness', 0.01, 0.6, 0.005).onChange(onChange);
		sky.add(settings.sky, 'brightness', 0.3, 2, 0.01).name('skyBrightness').onChange(onChange);
		sky.add(settings.sky, 'showSunDisk').onChange(onChange);
		sky.add(settings.sky, 'sunDiskSize', 0.002, 0.15, 0.001).onChange(onChange);
		sky.add(settings.sky, 'sunDiskBrightness', 0, 10, 0.1).onChange(onChange);
		sky.add(settings.sky, 'sunDiskSoftness', 0.001, 0.1, 0.001).onChange(onChange);
		sky.close();

		const hdri = root.addFolder('HDRI');
		hdri.add(settings.hdri, 'enabled').name('hdriEnabled').onChange(onChange);
		hdri.add(settings.hdri, 'intensity', 0, 3, 0.05).name('hdriIntensity').onChange(onChange);
		hdri.add(settings.hdri, 'rotation', 0, 360, 1).name('hdriRotation').onChange(onChange);
		hdri.add(settings.hdri, 'showAsBackground').onChange(onChange);
		hdri.close();

		const atmosphere = root.addFolder('Sun & Atmosphere');
		atmosphere.add(settings.atmosphere, 'sunEnabled').onChange(onChange);
		atmosphere.add(settings.atmosphere, 'sunIntensity', 0, 3, 0.05).onChange(onChange);
		atmosphere.add(settings.atmosphere, 'sunElevation', -10, 90, 0.5).onChange(onChange);
		atmosphere.add(settings.atmosphere, 'sunAzimuth', 0, 360, 1).onChange(onChange);
		atmosphere.addColor(settings.atmosphere, 'sunColor').onChange(onChange);
		atmosphere.add(settings.atmosphere, 'hemisphereIntensity', 0, 2, 0.05).onChange(onChange);
		atmosphere.add(settings.atmosphere, 'fogEnabled').onChange(onChange);
		atmosphere.add(settings.atmosphere, 'fogNear', 1, 800, 1).onChange(onChange);
		atmosphere.add(settings.atmosphere, 'fogFar', 10, 2000, 1).onChange(onChange);
		atmosphere.addColor(settings.atmosphere, 'fogColor').onChange(onChange);
		atmosphere.add(settings.atmosphere, 'fogMatchHorizon').onChange(onChange);
		atmosphere
			.add(settings.atmosphere, 'fogDensityMode', { Linear: 'linear', Exponential: 'exponential' })
			.onChange(onChange);
		atmosphere.close();

		const clouds = root.addFolder('Clouds');
		clouds.add(settings.clouds, 'enabled').name('cloudsEnabled').onChange(onChange);
		clouds.add(settings.clouds, 'layerCount', 1, 3, 1).name('cloudLayerCount').onChange(onChange);
		clouds.add(settings.clouds, 'altitude', 30, 600, 5).name('cloudAltitude').onChange(onChange);
		clouds.add(settings.clouds, 'scale', 0.2, 4, 0.05).name('cloudScale').onChange(onChange);
		clouds.add(settings.clouds, 'coverage', 0, 1, 0.01).name('cloudCoverage').onChange(onChange);
		clouds.add(settings.clouds, 'softness', 0, 1, 0.01).name('cloudSoftness').onChange(onChange);
		clouds.add(settings.clouds, 'opacity', 0, 1, 0.01).name('cloudOpacity').onChange(onChange);
		clouds
			.add(settings.clouds, 'brightness', 0.2, 2, 0.02)
			.name('cloudBrightness')
			.onChange(onChange);
		clouds
			.add(settings.clouds, 'shadowTint', 0, 1, 0.01)
			.name('cloudShadowTint')
			.onChange(onChange);
		clouds.add(settings.clouds, 'speed1', 0, 3, 0.02).onChange(onChange);
		clouds.add(settings.clouds, 'speed2', 0, 3, 0.02).onChange(onChange);
		clouds.add(settings.clouds, 'direction1', 0, 360, 1).onChange(onChange);
		clouds.add(settings.clouds, 'direction2', 0, 360, 1).onChange(onChange);
		clouds.add(settings.clouds, 'driftStrength', 0, 3, 0.05).onChange(onChange);
		clouds.add(settings.clouds, 'macroScale', 0.2, 6, 0.05).onChange(onChange);
		clouds.add(settings.clouds, 'breakupScale', 0.5, 16, 0.1).onChange(onChange);
		clouds.add(settings.clouds, 'wispyScale', 1, 24, 0.1).onChange(onChange);
		clouds.add(settings.clouds, 'edgeThreshold', 0.1, 0.9, 0.01).onChange(onChange);
		clouds.add(settings.clouds, 'edgeSoftness', 0.02, 0.6, 0.01).onChange(onChange);
		clouds
			.add(settings.clouds, 'lightResponse', 0, 1, 0.01)
			.name('cloudLightResponse')
			.onChange(onChange);
		clouds.add(settings.clouds, 'warmth', 0, 1, 0.01).name('cloudWarmth').onChange(onChange);
		clouds.add(settings.clouds, 'coolTint', 0, 1, 0.01).name('cloudCoolTint').onChange(onChange);
		clouds.close();

		const debug = root.addFolder('Debug');
		debug.add(settings.debug, 'showCloudBounds').onChange(onChange);
		debug.add(settings.debug, 'showCloudLayerWireframe').onChange(onChange);
		debug.add(settings.debug, 'showSkyOnly').onChange(onChange);
		debug.close();
	}

	dispose(): void {
		this.gui.destroy();
	}
}
