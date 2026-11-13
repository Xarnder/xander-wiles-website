import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ParticleEffectManager } from '../../particles/ParticleEffectManager';
import { resolveEffectiveSky } from '../../sky/dayNightMath';
import { createDefaultSkySettings } from '../../sky/SkyTypes';
import {
	localizeWeather,
	RAIN_TEMPERATURE,
	SNOW_TEMPERATURE,
	snowShare
} from '../../weather/localWeather';
import { WeatherSystem } from '../../weather/WeatherSystem';
import { createWeatherEnvironment } from '../../weather/WeatherTypes';
import { applyBiomeAtmosphere } from '../biomeAtmosphere';
import type { BiomeField } from '../BiomeField';
import { LocalClimate } from '../LocalClimate';
import { BIOME_IDS, createDefaultBiomeSettings, type BiomeId } from '../BiomeTypes';

function pureField(id: BiomeId, temperature = 0.5, enabled = true): BiomeField {
	const index = BIOME_IDS.indexOf(id);
	const settings = { ...createDefaultBiomeSettings(), enabled };
	return {
		isEnabled: () => settings.enabled,
		weightsAt: (_x: number, _z: number, out: Float32Array) => {
			out.fill(0);
			out[index] = 1;
			return index;
		},
		climateAt: (_x: number, _z: number, out: { temperature: number; moisture: number }) => {
			out.temperature = temperature;
			out.moisture = 0.5;
		}
	} as unknown as BiomeField;
}

describe('localizeWeather', () => {
	const rainy = () => ({ ...createWeatherEnvironment(), rain: 0.8, snow: 0, coolness: 0.1 });

	it('turns rain into snow in the cold and snow into rain where it is mild', () => {
		expect(snowShare(SNOW_TEMPERATURE)).toBe(1);
		expect(snowShare(RAIN_TEMPERATURE)).toBe(0);
		const cold = localizeWeather(
			rainy(),
			{ temperature: 0.05, precipitation: 1 },
			createWeatherEnvironment()
		);
		expect(cold.snow).toBeCloseTo(0.8, 6);
		expect(cold.rain).toBe(0);
		expect(cold.coolness).toBeGreaterThan(0.4);
		const snowDay = { ...createWeatherEnvironment(), rain: 0, snow: 0.7 };
		const mild = localizeWeather(
			snowDay,
			{ temperature: 0.6, precipitation: 1 },
			createWeatherEnvironment()
		);
		expect(mild.rain).toBeCloseTo(0.7, 6);
		expect(mild.snow).toBe(0);
	});

	it('lets nothing fall in the desert, more in the swamp, and keeps clouds and wind as scheduled', () => {
		const storm = { ...rainy(), cloudiness: 0.9, windX: 3, lightning: 0.6 };
		const desert = localizeWeather(
			storm,
			{ temperature: 0.95, precipitation: 0 },
			createWeatherEnvironment()
		);
		expect(desert.rain).toBe(0);
		expect(desert.snow).toBe(0);
		expect(desert.cloudiness).toBe(0.9);
		expect(desert.windX).toBe(3);
		expect(desert.lightning).toBe(0.6);
		const swamp = localizeWeather(
			storm,
			{ temperature: 0.6, precipitation: 1.3 },
			createWeatherEnvironment()
		);
		expect(swamp.rain).toBeCloseTo(1, 6);
	});
});

describe('LocalClimate', () => {
	it('stays neutral and inactive while biomes are off', () => {
		const climate = new LocalClimate(pureField('desert', 0.9, false));
		expect(climate.active()).toBe(false);
		expect(climate.update(0, 0, 1 / 60)).toBe(false);
		expect(climate.state.precipitation).toBe(1);
		expect(climate.state.fogAmount).toBe(0);
	});

	it('snaps on first use and caps the fog', () => {
		const climate = new LocalClimate(pureField('swamp', 0.6));
		expect(climate.update(0, 0, 1 / 60)).toBe(true);
		expect(climate.state.precipitation).toBeCloseTo(1.3, 6);
		expect(climate.state.fogAmount).toBeLessThanOrEqual(0.3);
		expect(climate.state.fogDensity).toBeLessThanOrEqual(1.7);
	});

	it('eases into a new biome over a few seconds, the same at any frame rate', () => {
		const walk = (dt: number) => {
			let biome: BiomeId = 'plains';
			const field = {
				isEnabled: () => true,
				weightsAt: (_x: number, _z: number, out: Float32Array) => {
					out.fill(0);
					out[BIOME_IDS.indexOf(biome)] = 1;
					return BIOME_IDS.indexOf(biome);
				},
				climateAt: (_x: number, _z: number, out: { temperature: number }) => {
					out.temperature = 0.5;
				}
			} as unknown as BiomeField;
			const climate = new LocalClimate(field);
			climate.update(0, 0, dt);
			biome = 'desert';
			const after = (seconds: number) => {
				for (let t = 0; t < seconds - 1e-9; t += dt) climate.update(0, 0, dt);
				return climate.state.precipitation;
			};
			return [after(1), after(5)];
		};
		const [oneSecond20, sixSeconds20] = walk(1 / 20);
		const [oneSecond144, sixSeconds144] = walk(1 / 144);
		// Part-way after a second, nearly there after six, and the same curve at 20 and 144 fps.
		expect(oneSecond20).toBeGreaterThan(0.3);
		expect(oneSecond20).toBeLessThan(0.7);
		expect(sixSeconds20).toBeLessThan(0.05);
		expect(oneSecond144).toBeCloseTo(oneSecond20, 1);
		expect(sixSeconds144).toBeCloseTo(sixSeconds20, 2);
	});

	it('reports a change only while the air is still moving', () => {
		const climate = new LocalClimate(pureField('jungle', 0.9));
		expect(climate.update(0, 0, 0.016)).toBe(true);
		expect(climate.update(0, 0, 0.016)).toBe(false);
	});

	it('tints swamp water darker and greener', () => {
		const out = new Float32Array(3);
		new LocalClimate(pureField('swamp')).waterTintAt(0, 0, out, 0);
		expect(out[1]).toBeGreaterThan(out[2]);
		expect(Math.max(...out)).toBeLessThan(1);
		new LocalClimate(pureField('plains')).waterTintAt(0, 0, out, 0);
		expect([...out]).toEqual([1, 1, 1]);
	});
});

describe('applyBiomeAtmosphere', () => {
	const look = resolveEffectiveSky(createDefaultSkySettings());

	it('leaves the look untouched in neutral air', () => {
		const climate = new LocalClimate(pureField('plains'));
		climate.update(0, 0, 0);
		expect(applyBiomeAtmosphere(look, climate.state)).toBe(look);
	});

	it('thickens and tints the fog in a swamp, within the caps', () => {
		const climate = new LocalClimate(pureField('swamp'));
		climate.update(0, 0, 0);
		const swamp = applyBiomeAtmosphere(look, climate.state);
		expect(swamp.atmosphere.fogFar).toBeLessThan(look.atmosphere.fogFar);
		expect(swamp.atmosphere.fogFar).toBeGreaterThan(look.atmosphere.fogFar / 1.8);
		expect(swamp.sky.horizonColor).not.toBe(look.sky.horizonColor);
	});
});

describe('WeatherSystem with a local climate', () => {
	function system() {
		const weather = new WeatherSystem(
			new ParticleEffectManager({ renderers: false }),
			{ groundY: () => 0, coverAbove: () => Number.NaN, waterY: () => Number.NaN },
			() => 0,
			'local-weather'
		);
		const frame = {
			camera: new THREE.PerspectiveCamera(),
			feetY: 0,
			viewportHeight: 800,
			frustum: new THREE.Frustum(),
			cloudAltitude: 300
		};
		return { weather, frame };
	}

	it('shows the shared weather unchanged without a local climate', () => {
		const { weather, frame } = system();
		weather.update(1 / 60, frame);
		expect(weather.local).toBe(weather.current);
	});

	it('localises scheduled weather, but shows a forced weather as chosen everywhere', () => {
		const { weather, frame } = system();
		const desert = new LocalClimate(pureField('desert', 0.95));
		desert.update(0, 0, 0);
		weather.setLocalClimate(desert);
		weather.update(1 / 60, frame);
		expect(weather.local).not.toBe(weather.current);
		expect(weather.local.rain).toBe(0);
		expect(weather.local.snow).toBe(0);

		weather.debug.selection = 'rain';
		weather.applyDebugSelection();
		weather.update(1 / 60, frame);
		expect(weather.local).toBe(weather.current);
	});
});
