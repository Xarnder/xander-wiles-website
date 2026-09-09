import { describe, expect, it, vi } from 'vitest';
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
import {
	buildSettingsCatalog,
	categoryMatchesQuery,
	firstMatchingCategoryId
} from '../settingsCatalog';

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
			category.groups.flatMap((group) => [
				group.title,
				...(group.groups ?? []).map((child) => child.title)
			])
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

describe('creature settings', () => {
	function creatureHost() {
		const host = testHost();
		host.creatures = {
			state: { settings: { enabled: true, creatureDensity: 1, maxActiveCreatures: 30 } },
			debug: {
				showSkeleton: false,
				showBehaviourState: false,
				showTarget: false,
				showSpeciesId: false,
				showIndividualId: false,
				showLOD: false
			},
			settingsChanged: vi.fn()
		};
		host.actions.creatureLab = vi.fn();
		host.actions.creatureDemo = vi.fn();
		host.actions.creatureEndDemo = vi.fn();
		return host;
	}

	it('exposes searchable wildlife and debug controls with bounded population ranges', () => {
		const catalog = buildSettingsCatalog(creatureHost());
		for (const query of [
			'creature lab',
			'population density',
			'show skeleton',
			'individual id',
			'show lod'
		]) {
			expect(firstMatchingCategoryId(catalog, query)).toBe('creatures');
		}
		const fields = catalog.find((c) => c.id === 'creatures')!.groups.flatMap((g) => g.fields);
		expect(fields.find((f) => f.id === 'creatures.density')).toMatchObject({
			min: 0,
			max: 4,
			step: 0.1
		});
		expect(fields.find((f) => f.id === 'creatures.maxActive')).toMatchObject({
			min: 1,
			max: 100,
			step: 1
		});
	});

	it('mutates live settings and applies expensive population changes on commit', () => {
		const host = creatureHost();
		const fields = buildSettingsCatalog(host)
			.find((c) => c.id === 'creatures')!
			.groups.flatMap((g) => g.fields);
		const density = fields.find((f) => f.id === 'creatures.density')!;
		if (density.kind !== 'number') throw new Error('Missing density slider');
		density.set(2.5);
		expect(host.creatures!.state.settings.creatureDensity).toBe(2.5);
		expect(host.creatures!.settingsChanged).not.toHaveBeenCalled();
		density.onCommit?.();
		expect(host.creatures!.settingsChanged).toHaveBeenCalledOnce();
		const enabled = fields.find((f) => f.id === 'creatures.enabled')!;
		if (enabled.kind !== 'boolean') throw new Error('Missing enable toggle');
		enabled.set(false);
		enabled.onChange?.();
		expect(host.creatures!.state.settings.enabled).toBe(false);
		expect(host.creatures!.settingsChanged).toHaveBeenCalledTimes(2);
		const debug = fields.find((f) => f.id === 'creatures.debug.skeleton')!;
		if (debug.kind !== 'boolean') throw new Error('Missing skeleton toggle');
		debug.set(true);
		expect(host.creatures!.debug.showSkeleton).toBe(true);
	});

	it('forwards Lab and demo buttons without touching browser globals', () => {
		const host = creatureHost();
		const fields = buildSettingsCatalog(host)
			.find((c) => c.id === 'creatures')!
			.groups.flatMap((g) => g.fields);
		for (const field of fields) if (field.kind === 'button') field.onClick();
		expect(host.actions.creatureLab).toHaveBeenCalledOnce();
		expect(host.actions.creatureDemo).toHaveBeenCalledOnce();
		expect(host.actions.creatureEndDemo).toHaveBeenCalledOnce();
	});

	it('exposes Show all collision objects in building and rendering categories and forwards action', () => {
		const actionSpy = vi.fn();
		const host = testHost();
		host.actions.collisionGeometry = actionSpy;

		const catalog = buildSettingsCatalog(host);
		const building = catalog.find((c) => c.id === 'building')!;
		const rendering = catalog.find((c) => c.id === 'rendering')!;

		const buildingField = building.groups
			.flatMap((g) => g.fields)
			.find((f) => f.id === 'building.collision.show');
		expect(buildingField).toBeDefined();
		expect(buildingField?.kind).toBe('boolean');

		const renderingField = rendering.groups
			.flatMap((g) => g.fields)
			.find((f) => f.id === 'render.collision.show');
		expect(renderingField).toBeDefined();
		expect(renderingField?.kind).toBe('boolean');

		if (buildingField?.kind === 'boolean') {
			expect(buildingField.get()).toBe(false);
			buildingField.set(true);
			expect(host.building.showCollisionGeometry).toBe(true);
			buildingField.onChange?.();
			expect(actionSpy).toHaveBeenCalledOnce();
		}

		// Verify searching "collision" matches building and rendering
		expect(categoryMatchesQuery(building, 'collision')).toBe(true);
		expect(categoryMatchesQuery(rendering, 'collision')).toBe(true);
		expect(firstMatchingCategoryId(catalog, 'collision')).toBe('building');
	});
});
