import { describe, expect, it } from 'vitest';
import { ParticleEffectManager } from '../../particles/ParticleEffectManager';
import type { ParticleFieldFrame } from '../../particles/ParticleFieldMath';
import { particleAtlasBuildCount } from '../../particles/ParticleTextureGenerator';
import { PARTICLE_QUALITY } from '../../particles/ParticleTypes';
import { createDefaultSkySettings } from '../../sky/SkyTypes';
import { resolveEffectiveSky } from '../../sky/dayNightMath';
import { validateWorldDefinition } from '../../world/WorldValidation';
import { richWorld } from '../../world/__tests__/worldFixtures';
import {
	flashEnvelope,
	generateLightningBolt,
	LightningController,
	lightningPulses,
	SPEED_OF_SOUND,
	thunderDelaySeconds
} from '../LightningController';
import {
	PrecipitationController,
	WEATHER_RAIN_FIELD,
	WEATHER_SNOW_FIELD,
	type PrecipitationSurfaces,
	type PrecipitationView
} from '../PrecipitationController';
import {
	ThunderAudioController,
	thunderVoiceFor,
	type ThunderVoice
} from '../ThunderAudioController';
import { WeatherController } from '../WeatherController';
import { applyWeatherToLook } from '../WeatherEnvironmentController';
import { WeatherScheduleGenerator } from '../WeatherSchedule';
import {
	createWeatherEnvironment,
	createWeatherState,
	environmentForState,
	lerpWeatherEnvironment,
	sanitizeWeatherSave,
	WEATHER_QUALITY,
	type WeatherEnvironment,
	type WeatherType
} from '../WeatherTypes';

const ALL_FIELDS: (keyof WeatherEnvironment)[] = [
	'rain',
	'snow',
	'cloudiness',
	'cloudDarkness',
	'sunScale',
	'ambientScale',
	'skyBrightness',
	'fogMultiplier',
	'desaturation',
	'coolness',
	'windX',
	'windZ',
	'lightning'
];

function envOf(type: WeatherType, intensity?: number): WeatherEnvironment {
	return environmentForState(createWeatherState(type, intensity));
}

/** Runs a manual change to completion, sampling the environment on the way. */
function transition(from: WeatherType, to: WeatherType): WeatherEnvironment[] {
	const controller = new WeatherController(1234);
	controller.setManual(createWeatherState(from), 0.001);
	controller.update(1);
	controller.setManual(createWeatherState(to), 30);
	const samples: WeatherEnvironment[] = [];
	for (let t = 0; t <= 32; t += 0.5) {
		samples.push({ ...controller.update(0.5) });
	}
	return samples;
}

describe('weather state and transitions', () => {
	for (const [from, to] of [
		['clear', 'rain'],
		['rain', 'thunderstorm'],
		['thunderstorm', 'rain'],
		['rain', 'clear'],
		['clear', 'snow']
	] as [WeatherType, WeatherType][]) {
		it(`${from} → ${to} interpolates smoothly, stays finite and lands on the target`, () => {
			const samples = transition(from, to);
			const target = envOf(to);
			for (const sample of samples) {
				for (const key of ALL_FIELDS) expect(Number.isFinite(sample[key])).toBe(true);
			}
			// No single half-second step jumps (no popping).
			for (let i = 1; i < samples.length; i++) {
				for (const key of ['cloudiness', 'sunScale', 'rain', 'snow', 'fogMultiplier'] as const) {
					expect(Math.abs(samples[i][key] - samples[i - 1][key])).toBeLessThan(0.15);
				}
			}
			const last = samples[samples.length - 1];
			for (const key of ALL_FIELDS) expect(last[key]).toBeCloseTo(target[key], 5);
		});
	}

	it('clouds gather before the rain starts, and the rain stops before the sky clears', () => {
		const from = envOf('clear');
		const to = envOf('rain', 0.8);
		const out = createWeatherEnvironment();
		lerpWeatherEnvironment(from, to, 0.3, out);
		const cloudProgress = (out.cloudiness - from.cloudiness) / (to.cloudiness - from.cloudiness);
		expect(cloudProgress).toBeGreaterThan(0.4);
		expect(out.rain).toBe(0);
		lerpWeatherEnvironment(to, from, 0.5, out);
		expect(out.rain).toBeLessThan(to.rain * 0.2);
		expect(out.cloudiness).toBeGreaterThan(from.cloudiness + (to.cloudiness - from.cloudiness) * 0.5);
	});

	it('a thunderstorm is more than heavy rain: darker, windier, with lightning', () => {
		const rain = envOf('rain', 1);
		const storm = envOf('thunderstorm', 1);
		expect(storm.sunScale).toBeLessThan(rain.sunScale);
		expect(storm.cloudDarkness).toBeGreaterThan(rain.cloudDarkness);
		expect(Math.hypot(storm.windX, storm.windZ)).toBeGreaterThan(Math.hypot(rain.windX, rain.windZ));
		expect(storm.lightning).toBeGreaterThan(0);
		expect(rain.lightning).toBe(0);
		// Still playable: never pitch black.
		expect(storm.ambientScale).toBeGreaterThan(0.4);
	});
});

describe('procedural schedule', () => {
	it('is deterministic from its seed and lasts game-world lengths of time', () => {
		const a = new WeatherScheduleGenerator(99);
		const b = new WeatherScheduleGenerator(99);
		for (let t = 0; t < 4 * 3600; t += 600) {
			expect(a.segmentAt(t).state).toEqual(b.segmentAt(t).state);
			expect(a.segmentAt(t).duration).toBeGreaterThanOrEqual(4 * 60);
		}
	});

	it('only chooses snow when allowed, and never jumps straight to a storm from snow', () => {
		const types = (allowSnow: boolean) => {
			const schedule = new WeatherScheduleGenerator(5);
			schedule.setAllowSnow(allowSnow);
			const seen: WeatherType[] = [];
			for (let t = 0; t < 400 * 3600; t += 900) seen.push(schedule.segmentAt(t).state.type);
			return seen;
		};
		expect(types(false)).not.toContain('snow');
		const withSnow = types(true);
		expect(withSnow).toContain('snow');
		for (let i = 1; i < withSnow.length; i++) {
			if (withSnow[i - 1] === 'snow') expect(withSnow[i]).not.toBe('thunderstorm');
		}
	});

	it('advances through the schedule with the weather clock (accelerated for testing)', () => {
		const controller = new WeatherController(7);
		controller.timeScale = 600;
		const seen = new Set<string>();
		for (let i = 0; i < 2000; i++) {
			controller.update(1 / 10);
			seen.add(controller.state.type);
		}
		expect(seen.size).toBeGreaterThan(1);
	});
});

// ---------------------------------------------------------------------------------- precipitation

function precipitationRig(cover: (x: number, z: number) => number | null = () => null) {
	const particles = new ParticleEffectManager({ renderers: false });
	particles.setQuality(PARTICLE_QUALITY.high);
	const frames = new Map<string, ParticleFieldFrame>();
	const update = particles.updateField.bind(particles);
	particles.updateField = (id, frame) => {
		frames.set(id, { ...frame });
		update(id, frame);
	};
	const water = new Set<string>();
	const surfaces: PrecipitationSurfaces = {
		groundY: () => 0,
		coverAbove: (x, z, fromY) => {
			const roof = cover(x, z);
			return roof !== null && roof > fromY ? roof : null;
		},
		waterY: (x, z) => (water.has(`${Math.round(x)}:${Math.round(z)}`) ? 0.2 : Number.NaN)
	};
	const precipitation = new PrecipitationController(particles, surfaces);
	precipitation.setQuality(WEATHER_QUALITY.high);
	const view: PrecipitationView = {
		x: 0,
		y: 1.7,
		z: 0,
		feetY: 0,
		lookX: 0,
		lookZ: 1,
		pixelAngle: 0.0015,
		visible: () => true
	};
	return { particles, precipitation, frames, view };
}

describe('precipitation', () => {
	it('light rain shows fewer drops than heavy rain, within the fixed capacity', () => {
		const { particles, precipitation, view } = precipitationRig();
		precipitation.update(1 / 60, envOf('rain', 0.1), view, { rain: 1, snow: 1 });
		const light = particles.getFieldCount(WEATHER_RAIN_FIELD.id);
		precipitation.update(1 / 60, envOf('rain', 1), view, { rain: 1, snow: 1 });
		const heavy = particles.getFieldCount(WEATHER_RAIN_FIELD.id);
		expect(light).toBeGreaterThan(0);
		expect(heavy).toBeGreaterThan(light * 2);
		expect(heavy).toBeLessThanOrEqual(WEATHER_QUALITY.high.rainCapacity);
	});

	it('changing intensity and moving never allocates more storage', () => {
		const { particles, precipitation, view } = precipitationRig();
		precipitation.update(1 / 60, envOf('rain', 0.5), view, { rain: 1, snow: 1 });
		const bytes = particles.getStats().bufferBytes;
		for (let i = 0; i < 600; i++) {
			view.x += 0.3;
			view.z -= 0.2;
			const type: WeatherType = i % 200 < 100 ? 'rain' : 'snow';
			precipitation.update(1 / 60, envOf(type, (i % 50) / 50), view, { rain: 1, snow: 1 });
			particles.update(1 / 60);
		}
		expect(particles.getStats().bufferBytes).toBe(bytes);
		expect(particles.activeParticles).toBeLessThanOrEqual(PARTICLE_QUALITY.high.budget);
	});

	it('the volume follows the player: its anchor is wherever the camera is now', () => {
		const { precipitation, frames, view } = precipitationRig();
		const env = envOf('rain', 0.7);
		for (let i = 0; i < 120; i++) {
			view.x += 0.2; // running
			precipitation.update(1 / 60, env, view, { rain: 1, snow: 1 });
			const frame = frames.get(WEATHER_RAIN_FIELD.id)!;
			expect(frame.anchorX).toBe(view.x);
			expect(frame.anchorZ).toBe(view.z);
		}
	});

	it('rain falls down, slanted by the wind', () => {
		const { precipitation, frames, view } = precipitationRig();
		const calm = { ...envOf('rain', 0.7), windX: 0, windZ: 0 };
		precipitation.update(1 / 60, calm, view, { rain: 1, snow: 1 });
		const still = frames.get(WEATHER_RAIN_FIELD.id)!;
		expect(still.dirY).toBeCloseTo(-1, 5);
		const windy = { ...calm, windX: 10 };
		precipitation.update(1 / 60, windy, view, { rain: 1, snow: 1 });
		const slanted = frames.get(WEATHER_RAIN_FIELD.id)!;
		expect(slanted.dirY).toBeLessThan(-0.7);
		expect(slanted.dirX).toBeGreaterThan(0.2);
		const driftBefore = slanted.driftX;
		precipitation.update(0.1, windy, view, { rain: 1, snow: 1 });
		expect(frames.get(WEATHER_RAIN_FIELD.id)!.driftX).not.toBe(driftBefore);
	});

	it('snow falls far more slowly than rain, flutters sideways and drifts further with the wind', () => {
		const { precipitation, frames, view } = precipitationRig();
		const wind = { windX: 6, windZ: 0 };
		precipitation.update(1 / 60, { ...envOf('rain', 0.7), ...wind }, view, { rain: 1, snow: 1 });
		precipitation.update(1 / 60, { ...envOf('snow', 0.7), ...wind }, view, { rain: 1, snow: 1 });
		const rain = frames.get(WEATHER_RAIN_FIELD.id)!;
		const snow = frames.get(WEATHER_SNOW_FIELD.id)!;
		const speed = (f: ParticleFieldFrame, period: number) =>
			((f.cycleMin + f.cycleRange / 2) * f.height) / period;
		expect(speed(snow, 256)).toBeLessThan(speed(rain, 64) / 4);
		expect(snow.flutterAmplitude).toBeGreaterThan(0.1);
		expect(rain.flutterAmplitude).toBe(0);
		// Over the same second, wind carries snow further sideways than rain.
		const rainStart = rain.driftX;
		const snowStart = snow.driftX;
		for (let i = 0; i < 10; i++) {
			precipitation.update(0.1, { ...envOf('rain', 0.7), ...wind }, view, { rain: 1, snow: 1 });
		}
		for (let i = 0; i < 10; i++) {
			precipitation.update(0.1, { ...envOf('snow', 0.7), ...wind }, view, { rain: 1, snow: 1 });
		}
		const rainMoved = frames.get(WEATHER_RAIN_FIELD.id)!.driftX - rainStart;
		const snowMoved = frames.get(WEATHER_SNOW_FIELD.id)!.driftX - snowStart;
		expect(snowMoved).toBeGreaterThan(rainMoved);
	});

	it('snow reuses the shared atlas: no texture is generated per flake or per effect', () => {
		const before = particleAtlasBuildCount();
		const { precipitation, view } = precipitationRig();
		for (let i = 0; i < 30; i++) {
			precipitation.update(1 / 60, envOf('snow', 1), view, { rain: 1, snow: 1 });
		}
		expect(particleAtlasBuildCount()).toBe(Math.max(1, before));
	});

	it('indoors: finds the building around the camera and hides precipitation inside it', () => {
		// A 10 × 8 m roof at 3 m over x ∈ [-4, 6], z ∈ [-3, 5].
		const roof = (x: number, z: number) => (x > -4 && x < 6 && z > -3 && z < 5 ? 3 : null);
		const { precipitation, frames, view } = precipitationRig(roof);
		precipitation.update(0.25, envOf('rain', 0.8), view, { rain: 1, snow: 1 });
		const shelter = precipitation.shelter;
		expect(shelter.active).toBe(true);
		expect(shelter.minX).toBeLessThanOrEqual(-3);
		expect(shelter.maxX).toBeGreaterThanOrEqual(5);
		expect(shelter.minZ).toBeLessThanOrEqual(-2);
		expect(shelter.maxZ).toBeGreaterThanOrEqual(4);
		expect(shelter.topY).toBeGreaterThan(3);
		expect(frames.get(WEATHER_RAIN_FIELD.id)!.shelterEnabled).toBe(true);
		// Outside again (re-probed within a fifth of a second): nothing hidden.
		view.x = 20;
		for (let i = 0; i < 4; i++) precipitation.update(0.1, envOf('rain', 0.8), view, { rain: 1, snow: 1 });
		expect(precipitation.shelter.active).toBe(false);
	});

	it('makes a few representative impacts per second, never one per drop, and none under cover', () => {
		const { particles, precipitation, view } = precipitationRig((x) => (x < 0 ? 5 : null));
		const env = envOf('rain', 1);
		let started = 0;
		const emit = particles.emitBurst.bind(particles);
		particles.emitBurst = (id, burst) => {
			expect(burst.x).toBeGreaterThanOrEqual(0); // never under the roof (x < 0)
			started++;
			return emit(id, burst);
		};
		for (let i = 0; i < 60; i++) precipitation.update(1 / 60, env, view, { rain: 1, snow: 1 });
		expect(started).toBeGreaterThan(5);
		expect(started).toBeLessThanOrEqual(WEATHER_QUALITY.high.impactsPerSecond);
	});
});

// ---------------------------------------------------------------------------------- lightning

describe('lightning and thunder', () => {
	it('strikes at irregular intervals, more often in a wilder storm', () => {
		const run = (activity: number) => {
			const lightning = new LightningController(42);
			const times: number[] = [];
			for (let i = 0; i < 20 * 60 * 10; i++) {
				for (const event of lightning.update(0.1, activity, 0, 0)) times.push(event.time);
			}
			return times;
		};
		const wild = run(1);
		const calm = run(0.3);
		expect(wild.length).toBeGreaterThan(calm.length);
		const gaps = wild.slice(1).map((t, i) => t - wild[i]);
		const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
		const spread = Math.sqrt(gaps.reduce((a, g) => a + (g - mean) ** 2, 0) / gaps.length);
		expect(spread / mean).toBeGreaterThan(0.3); // not a fixed timer
		expect(new Set(gaps.map((g) => g.toFixed(2))).size).toBeGreaterThan(gaps.length * 0.6);
		expect(run(0).length).toBe(0);
	});

	it('flashes strong, goes dark, flickers again, then fades to nothing', () => {
		const pulses = lightningPulses(7);
		expect(pulses.length).toBeGreaterThanOrEqual(2);
		const peak = flashEnvelope(pulses, 0.012);
		const gap = flashEnvelope(pulses, pulses[1].start - 0.002);
		const second = flashEnvelope(pulses, pulses[1].start + 0.012);
		expect(peak).toBeGreaterThan(0.7);
		expect(gap).toBeLessThan(peak * 0.5);
		expect(second).toBeGreaterThan(gap);
		expect(flashEnvelope(pulses, 2)).toBeLessThan(1e-3);
		// The controller's flash returns to zero: lightning never changes the lighting permanently.
		const lightning = new LightningController(1);
		lightning.force(0, 0, 400);
		lightning.update(0.01, 0, 0, 0);
		expect(lightning.flash()).toBeGreaterThan(0.1);
		for (let i = 0; i < 30; i++) lightning.update(0.1, 0, 0, 0);
		expect(lightning.flash()).toBe(0);
	});

	it('nearer strikes flash brighter', () => {
		const near = new LightningController(3);
		near.force(0, 0, 150);
		near.update(0.012, 0, 0, 0);
		const far = new LightningController(3);
		far.force(0, 0, 3000);
		far.update(0.012, 0, 0, 0);
		expect(near.flash()).toBeGreaterThan(far.flash() * 2);
	});

	it('thunder arrives after the sound has travelled the strike distance (343 m/s)', () => {
		expect(thunderDelaySeconds(343)).toBeCloseTo(1, 5);
		expect(thunderDelaySeconds(1000)).toBeCloseTo(2.92, 2);
		const played: { at: number; voice: ThunderVoice }[] = [];
		let clock = 0;
		const thunder = new ThunderAudioController({
			now: () => clock,
			play: (voice) => {
				played.push({ at: clock, voice });
				return { end: clock + voice.duration, stop: () => {} };
			}
		});
		const lightning = new LightningController(9);
		const event = lightning.force(0, 0, 1029);
		thunder.schedule(event);
		for (let i = 0; i < 50; i++) {
			clock += 0.1;
			thunder.update(0.1);
		}
		expect(played).toHaveLength(1);
		expect(played[0].at).toBeCloseTo(1029 / SPEED_OF_SOUND, 0);
		// Near thunder: loud with a crack; far: quiet, longer, duller.
		const near = thunderVoiceFor(200, 1, 1);
		const far = thunderVoiceFor(2800, 1, 1);
		expect(near.gain).toBeGreaterThan(far.gain);
		expect(near.crack).toBeGreaterThan(0);
		expect(far.crack).toBe(0);
		expect(far.duration).toBeGreaterThan(near.duration);
		expect(far.brightness).toBeLessThan(near.brightness);
	});

	it('never plays more than the configured number of thunder voices at once', () => {
		let clock = 0;
		let playing = 0;
		let maxPlaying = 0;
		const ends: number[] = [];
		const thunder = new ThunderAudioController(
			{
				now: () => clock,
				play: (voice) => {
					ends.push(clock + voice.duration);
					return { end: clock + voice.duration, stop: () => ends.pop() };
				}
			},
			2
		);
		const lightning = new LightningController(11);
		for (let i = 0; i < 12; i++) thunder.schedule(lightning.force(0, 0, 200 + i * 10));
		for (let step = 0; step < 100; step++) {
			clock += 0.1;
			thunder.update(0.1);
			playing = thunder.stats.playing;
			maxPlaying = Math.max(maxPlaying, playing);
		}
		expect(maxPlaying).toBeLessThanOrEqual(2);
		expect(thunder.stats.skipped).toBeGreaterThan(0);
	});

	it('builds a cheap deterministic bolt: 16 main segments and a few branches', () => {
		const a = generateLightningBolt(5, 200);
		const b = generateLightningBolt(5, 200);
		expect(a.main).toEqual(b.main);
		expect(a.main.length / 3 - 1).toBe(16);
		expect(a.branches.length).toBeGreaterThanOrEqual(2);
		expect(a.branches.length).toBeLessThanOrEqual(4);
		expect(a.main[1]).toBeCloseTo(200, 0); // top at the cloud base
		expect(a.main[a.main.length - 2]).toBe(0); // ends on the ground
	});
});

// ---------------------------------------------------------------------------------- look & save

describe('weather look', () => {
	it('dims and greys the world for a storm without touching the input, and flashes add light', () => {
		const sky = createDefaultSkySettings();
		sky.dayCycle.enabled = false;
		const base = resolveEffectiveSky(sky);
		const snapshot = JSON.stringify(base);
		const storm = applyWeatherToLook(base, envOf('thunderstorm', 1));
		expect(JSON.stringify(base)).toBe(snapshot);
		expect(storm.atmosphere.sunIntensity).toBeLessThan(base.atmosphere.sunIntensity * 0.3);
		expect(storm.atmosphere.fogFar).toBeLessThan(base.atmosphere.fogFar);
		expect(storm.clouds.coverage).toBeGreaterThan(base.clouds.coverage);
		const flashed = applyWeatherToLook(base, envOf('thunderstorm', 1), 1);
		expect(flashed.atmosphere.hemisphereIntensity).toBeGreaterThan(
			storm.atmosphere.hemisphereIntensity + 1
		);
		expect(flashed.atmosphere.sunIntensity).toBe(storm.atmosphere.sunIntensity);
	});

	it('snow is soft and bright, not dark', () => {
		const sky = createDefaultSkySettings();
		sky.dayCycle.enabled = false;
		const base = resolveEffectiveSky(sky);
		const snow = applyWeatherToLook(base, envOf('snow', 0.8));
		const storm = applyWeatherToLook(base, envOf('thunderstorm', 0.8));
		expect(snow.atmosphere.hemisphereIntensity).toBeGreaterThan(storm.atmosphere.hemisphereIntensity);
		expect(snow.clouds.brightness).toBeGreaterThan(storm.clouds.brightness);
	});
});

describe('weather save / load', () => {
	for (const type of ['rain', 'thunderstorm', 'snow'] as WeatherType[]) {
		it(`restores ${type} exactly, with no particles in the save`, () => {
			const controller = new WeatherController(77);
			controller.setManual(createWeatherState(type, 0.7), 20);
			for (let i = 0; i < 25; i++) controller.update(1);
			const save = JSON.parse(JSON.stringify(controller.save()));
			expect(Object.keys(save).sort()).toEqual(['allowSnow', 'manual', 'mode', 'seed', 'time', 'version']);
			const restored = new WeatherController(1);
			restored.load(sanitizeWeatherSave(save)!);
			expect(restored.state).toEqual(controller.state);
			for (const key of ALL_FIELDS) {
				expect(restored.environment[key]).toBeCloseTo(controller.environment[key], 6);
			}
		});
	}

	it('restores a change that was still in progress, and the procedural schedule at its clock', () => {
		const mid = new WeatherController(5);
		mid.setManual(createWeatherState('thunderstorm', 0.9), 40);
		mid.update(10);
		const save = sanitizeWeatherSave(JSON.parse(JSON.stringify(mid.save())))!;
		expect(save.transition?.progress).toBeGreaterThan(0.1);
		const restored = new WeatherController(5);
		restored.load(save);
		expect(restored.environment.cloudiness).toBeCloseTo(mid.environment.cloudiness, 6);

		const scheduled = new WeatherController(31);
		scheduled.timeScale = 50;
		for (let i = 0; i < 400; i++) scheduled.update(1);
		const again = new WeatherController(0);
		again.load(sanitizeWeatherSave(JSON.parse(JSON.stringify(scheduled.save())))!);
		expect(again.state).toEqual(scheduled.state);
		expect(again.weatherTime).toBeCloseTo(scheduled.weatherTime, 6);
	});

	it('rejects junk and keeps old worlds (no weather) valid', () => {
		expect(sanitizeWeatherSave(null)).toBeNull();
		expect(sanitizeWeatherSave({ mode: 'manual', manual: { type: 'hail' } })?.mode).toBe('schedule');
		const world = richWorld();
		delete (world.environment as { weather?: unknown }).weather;
		expect(validateWorldDefinition(world).ok).toBe(true);
		const controller = new WeatherController(3);
		controller.setManual(createWeatherState('snow', 0.5), 10);
		world.environment.weather = controller.save();
		expect(validateWorldDefinition(JSON.parse(JSON.stringify(world))).ok).toBe(true);
		(world.environment as { weather?: unknown }).weather = 'storm';
		expect(validateWorldDefinition(world).ok).toBe(false);
	});
});
