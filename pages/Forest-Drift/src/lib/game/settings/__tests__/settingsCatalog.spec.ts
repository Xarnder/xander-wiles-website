import { describe, expect, it } from 'vitest';
import { createDefaultBuildingSettings } from '../../building/FoundationTypes';
import { createDefaultGraphicsSettings } from '../../graphics/GraphicsTypes';
import type { MusicPlantPlacementTool } from '../../music/MusicPlantPlacementTool';
import { createDefaultSustainSettings } from '../../music/SustainTrailBuilder';
import { createDefaultSkySettings } from '../../sky/SkyTypes';
import { createDefaultTerrainSettings } from '../../terrain/TerrainSettings';
import { createDefaultVegetationSettings } from '../../vegetation/VegetationTypes';
import {
	createDefaultMusicVisualSettings,
	type GameSettingsActions,
	type GameSettingsHost
} from '../GameSettingsHost';
import { buildSettingsCatalog, categoryMatchesQuery, firstMatchingCategoryId } from '../settingsCatalog';

function noopActions(): GameSettingsActions {
	return {
		terrainSeed: () => {},
		terrainSettings: () => {},
		terrainTopology: () => {},
		terrainViewDistance: () => {},
		terrainRendering: () => {},
		foundationBounds: () => {},
		wallBounds: () => {},
		slabBounds: () => {},
		stairBounds: () => {},
		roofBounds: () => {},
		floorDetailBounds: () => {},
		removalProxies: () => {},
		openingVisuals: () => {},
		wallFraming: () => {},
		stairwellFraming: () => {},
		vegetationSettings: () => {},
		vegetationViewDistance: () => {},
		vegetationBorders: () => {},
		sky: () => {},
		graphicsQuality: () => {},
		graphicsAdvanced: () => {},
		graphicsExposure: () => {},
		graphicsAo: () => {},
		graphicsExport: () => {},
		musicLoop: () => {},
		musicWave: () => {},
		musicVolume: () => {},
		musicTrails: () => {}
	};
}

function testHost(): GameSettingsHost {
	return {
		terrain: createDefaultTerrainSettings(),
		vegetation: createDefaultVegetationSettings(),
		sky: createDefaultSkySettings(),
		graphics: createDefaultGraphicsSettings(),
		building: createDefaultBuildingSettings(),
		music: {
			debug: {
				showRingIndices: false,
				showPlantTimingDebug: false,
				showAudioSchedulerDebug: false,
				showDurationSteps: false
			},
			activeTree: undefined,
			trees: [],
			changeLoop: () => {},
			runtimes: new Map(),
			rebuildAllTrails: () => {}
		} as unknown as MusicPlantPlacementTool,
		sustain: createDefaultSustainSettings(),
		musicVisual: createDefaultMusicVisualSettings(),
		actions: noopActions()
	};
}

describe('buildSettingsCatalog', () => {
	it('covers every former debug-panel section', () => {
		const catalog = buildSettingsCatalog(testHost());
		expect(catalog.map((category) => category.id)).toEqual([
			'world',
			'terrain',
			'player',
			'music',
			'building',
			'vegetation',
			'sky',
			'graphics',
			'rendering'
		]);

		const titles = catalog.flatMap((category) =>
			category.groups.flatMap((group) => [group.title, ...(group.groups ?? []).map((child) => child.title)])
		);
		for (const required of [
			'Landscape',
			'Chunk loading',
			'Biome distribution',
			'Grid',
			'Walls',
			'Windows',
			'Doors',
			'Levels',
			'Slabs',
			'Stairs',
			'Floor detailing',
			'Day & night',
			'HDRI',
			'Sun & atmosphere',
			'Clouds',
			'Ambient occlusion'
		]) {
			expect(titles).toContain(required);
		}
	});

	it('filters categories by search query', () => {
		const catalog = buildSettingsCatalog(testHost());
		const sky = catalog.find((category) => category.id === 'sky');
		expect(sky && categoryMatchesQuery(sky, 'hdri')).toBe(true);
		expect(sky && categoryMatchesQuery(sky, 'plank width')).toBe(false);
		expect(firstMatchingCategoryId(catalog, 'hdri')).toBe('sky');
		expect(firstMatchingCategoryId(catalog, 'day')).toBe('sky');
		expect(firstMatchingCategoryId(catalog, 'no-such-setting')).toBeUndefined();
	});
});
