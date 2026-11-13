import { afterEach, describe, expect, it } from 'vitest';
import { TerrainHeightSampler } from '../../terrain/TerrainHeightSampler';
import { createDefaultTerrainSettings } from '../../terrain/TerrainSettings';
import { BiomeField } from '../BiomeField';
import { biomesAvailable, BIOMES_AVAILABLE, readBiomeKillSwitch } from '../biomeKillSwitch';
import { createDefaultBiomeSettings } from '../BiomeTypes';

describe('biome kill switch', () => {
	afterEach(() => readBiomeKillSwitch(''));

	it('is available by default', () => {
		expect(BIOMES_AVAILABLE).toBe(true);
		readBiomeKillSwitch('?seed=abc');
		expect(biomesAvailable()).toBe(true);
	});

	it('?biomes=off turns biomes off for the session without touching the saved setting', () => {
		const settings = createDefaultBiomeSettings();
		const field = new BiomeField(
			new TerrainHeightSampler(createDefaultTerrainSettings()),
			settings
		);
		expect(field.isEnabled()).toBe(true);
		readBiomeKillSwitch('?biomes=off');
		expect(biomesAvailable()).toBe(false);
		expect(field.isEnabled()).toBe(false);
		expect(settings.enabled).toBe(true);
		readBiomeKillSwitch('');
		expect(field.isEnabled()).toBe(true);
	});
});
