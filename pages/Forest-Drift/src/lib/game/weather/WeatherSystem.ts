import * as THREE from 'three';
import type { ParticleEffectManager } from '../particles/ParticleEffectManager';
import type { EffectiveSkyLook } from '../sky/dayNightMath';
import { LightningBoltRenderer } from './LightningBoltRenderer';
import { LightningController, type LightningEvent } from './LightningController';
import {
	PrecipitationController,
	type PrecipitationSurfaces,
	type PrecipitationView
} from './PrecipitationController';
import { ThunderAudioController } from './ThunderAudioController';
import { WeatherAudio } from './WeatherAudio';
import { WeatherController } from './WeatherController';
import { WeatherDebugView } from './WeatherDebugView';
import {
	applyWeatherToLook,
	WeatherEnvironmentController,
	type TreeWindParams
} from './WeatherEnvironmentController';
import {
	clamp01,
	copyWeatherEnvironment,
	createDefaultWeatherDebugSettings,
	createWeatherEnvironment,
	createWeatherState,
	sanitizeWeatherSave,
	WEATHER_QUALITY,
	type WeatherDebugSettings,
	type WeatherEnvironment,
	type WeatherQualityTier,
	type WeatherSaveState,
	type WeatherType
} from './WeatherTypes';

/** Seconds a manual weather pick takes when the settings transition is left at 0. */
const MANUAL_WEATHER_TRANSITION = 6;

/**
 * The one weather system. Everything weather does to the world goes through here:
 *
 *   WeatherSystem
 *   ├── WeatherController             logical weather: clock, procedural schedule, manual override
 *   │   └── WeatherTransitionController   staged blends between weathers
 *   ├── PrecipitationController       rain/snow fields + impacts on the shared particle system
 *   ├── LightningController           irregular strikes, flash envelope
 *   │   └── LightningBoltRenderer         one reusable jagged ribbon
 *   ├── ThunderAudioController        thunder after distance / 343 m/s, voice-limited
 *   │   └── WeatherAudio                  Web Audio rain/wind ambience + synthesised thunder
 *   ├── WeatherEnvironmentController  sky/cloud/light/fog look, wetness, tree wind
 *   └── WeatherDebugView              volume, shelter and impact overlays
 *
 * Rain, thunderstorms and snow are modes of this system, not separate systems. ThreeScene feeds
 * it the camera and a few surface queries, and reads back the look (`applyToLook`), tree wind and
 * wetness. Only the logical state is saved; a future server would sync that (and lightning events),
 * never particles.
 */

/** Look values with no effect — what the world shows while weather is switched off. */
const NEUTRAL_ENVIRONMENT: WeatherEnvironment = {
	rain: 0,
	snow: 0,
	cloudiness: 0.3,
	cloudDarkness: 0,
	sunScale: 1,
	ambientScale: 1,
	skyBrightness: 1,
	fogMultiplier: 1,
	desaturation: 0,
	coolness: 0,
	windX: 0,
	windZ: 0,
	lightning: 0
};

export interface WeatherFrame {
	camera: THREE.PerspectiveCamera;
	/** Player's feet height (shelter probes start just above it). */
	feetY: number;
	/** Drawing-buffer height in pixels. */
	viewportHeight: number;
	frustum: THREE.Frustum;
	/** World height of the cloud layer (bolts start there). */
	cloudAltitude: number;
}

export interface WeatherStats {
	type: WeatherType;
	intensity: number;
	mode: 'schedule' | 'manual';
	/** 0..1 progress of the current change (1 = settled). */
	transition: number;
	weatherTime: number;
	rain: number;
	snow: number;
	rainCapacity: number;
	snowCapacity: number;
	impactsPerSecond: number;
	sheltered: boolean;
	densityScale: number;
	lightningStrikes: number;
	flash: number;
	thunderPlaying: number;
	thunderPending: number;
	wetness: number;
	snowCover: number;
	windSpeed: number;
	updateMs: number;
}

function hashString(value: string): number {
	let h = 2166136261;
	for (let i = 0; i < value.length; i++) {
		h ^= value.charCodeAt(i);
		h = Math.imul(h, 16777619);
	}
	return h >>> 0;
}

/** Weather seed for a world seed — the schedule and lightning derive from it. */
export function weatherSeedFor(worldSeed: string): number {
	return hashString(`${worldSeed}:weather`);
}

export class WeatherSystem {
	readonly group = new THREE.Group();
	readonly debug: WeatherDebugSettings = createDefaultWeatherDebugSettings();
	controller: WeatherController;
	readonly precipitation: PrecipitationController;
	lightning: LightningController;
	readonly thunder: ThunderAudioController;
	readonly environment = new WeatherEnvironmentController();
	private readonly audio = new WeatherAudio();
	private readonly bolt = new LightningBoltRenderer();
	private readonly debugView = new WeatherDebugView();
	private readonly applied: WeatherEnvironment = createWeatherEnvironment();
	private readonly treeWindParams: TreeWindParams = { strengthScale: 1, dirX: 0, dirZ: 1, lean: 0 };
	private readonly look = createWeatherEnvironment();
	private readonly lookDirection = new THREE.Vector3();
	private readonly probe = new THREE.Vector3();
	private quality = WEATHER_QUALITY.high;
	private flash = 0;
	private lookDirty = true;
	private adaptiveTimer = 0;
	private lastUpdateMs = 0;
	private view: PrecipitationView;
	private frustum: THREE.Frustum | null = null;

	constructor(
		particles: ParticleEffectManager,
		surfaces: PrecipitationSurfaces,
		private readonly terrainY: (x: number, z: number) => number,
		worldSeed: string
	) {
		this.group.name = 'weather';
		const seed = weatherSeedFor(worldSeed);
		this.controller = new WeatherController(seed, this.debug.allowSnow);
		this.lightning = new LightningController(seed);
		this.precipitation = new PrecipitationController(particles, surfaces);
		this.thunder = new ThunderAudioController(this.audio);
		this.group.add(this.bolt.mesh, this.debugView.group);
		const probe = this.probe;
		this.view = {
			x: 0,
			y: 0,
			z: 0,
			feetY: 0,
			lookX: 0,
			lookZ: 1,
			pixelAngle: 0.001,
			visible: (x, y, z) => !this.frustum || this.frustum.containsPoint(probe.set(x, y, z))
		};
	}

	/** The environment the world currently shows (neutral while weather is off). */
	get current(): WeatherEnvironment {
		return this.debug.enabled ? this.controller.environment : NEUTRAL_ENVIRONMENT;
	}

	get flashLevel(): number {
		return this.flash;
	}

	get wetness(): number {
		return this.environment.wetness;
	}

	get snowCover(): number {
		return this.environment.snowCover;
	}

	/**
	 * Changes whenever something worth saving changed: the target weather, or every 30 s of
	 * weather time (so the schedule resumes where it was).
	 */
	get persistRevision(): number {
		return this.controller.revision * 100000 + Math.floor(this.controller.weatherTime / 30);
	}

	/** True when the sky/fog/light look must be re-applied this frame (weather moved, or a flash). */
	consumeLookChange(): boolean {
		const dirty = this.lookDirty;
		this.lookDirty = false;
		return dirty;
	}

	update(deltaSeconds: number, frame: WeatherFrame): void {
		const start = performance.now();
		const dt = Math.min(0.25, Math.max(0, deltaSeconds));
		this.controller.paused = this.debug.paused;
		this.controller.timeScale = this.debug.timeScale;
		this.lightning.frequency = this.debug.lightningFrequency;
		this.controller.setAllowSnow(this.debug.allowSnow);
		this.controller.update(dt);
		const env = this.current;

		const camera = frame.camera.position;
		frame.camera.getWorldDirection(this.lookDirection);
		const horizontal = Math.hypot(this.lookDirection.x, this.lookDirection.z) || 1;
		const view = this.view;
		view.x = camera.x;
		view.y = camera.y;
		view.z = camera.z;
		view.feetY = frame.feetY;
		view.lookX = this.lookDirection.x / horizontal;
		view.lookZ = this.lookDirection.z / horizontal;
		view.pixelAngle =
			(2 * Math.tan(THREE.MathUtils.degToRad(frame.camera.fov) * 0.5)) /
			Math.max(1, frame.viewportHeight);
		this.frustum = frame.frustum;

		// Lightning: strikes → flash now, bolt now, thunder later.
		const weatherDt = this.debug.paused ? 0 : dt;
		const events = this.lightning.update(weatherDt, env.lightning, camera.x, camera.z);
		for (const event of events) this.onStrike(event, frame);
		const flash = this.lightning.flash();
		if (flash > 0.002 || this.flash > 0.002) this.lookDirty = true;
		this.flash = flash;
		this.bolt.update(dt);
		this.thunder.update(dt);

		this.precipitation.update(dt, env, view, {
			rain: this.debug.rainDensity,
			snow: this.debug.snowDensity
		});
		this.audio.update(
			dt,
			env.rain,
			Math.hypot(env.windX, env.windZ),
			this.precipitation.shelter.active,
			this.debug.enabled ? this.debug.audioVolume : 0
		);
		this.environment.updateWetness(dt, env, this.debug.wetnessOverride);
		this.environment.updateSnowCover(dt, env, this.debug.snowCoverOverride);
		this.environment.treeWind(env, this.treeWindParams);

		if (environmentMoved(this.applied, env)) {
			copyWeatherEnvironment(env, this.applied);
			this.lookDirty = true;
		}

		this.debugView.update(
			this.debug,
			camera,
			this.precipitation.volumeRadius,
			this.precipitation.volumeHeight,
			this.precipitation.shelter,
			this.precipitation.impactPoints
		);
		this.lastUpdateMs = performance.now() - start;
	}

	/** The sky's look with the weather (and any lightning flash) layered on. */
	applyToLook(look: EffectiveSkyLook): EffectiveSkyLook {
		copyWeatherEnvironment(this.current, this.look);
		return applyWeatherToLook(look, this.look, this.debug.enabled ? this.flash : 0);
	}

	treeWind(): TreeWindParams {
		return this.treeWindParams;
	}

	setQuality(tier: WeatherQualityTier): void {
		this.quality = WEATHER_QUALITY[tier];
		this.precipitation.setQuality(this.quality);
	}

	/**
	 * Adaptive quality: weather is the first thing to give way when the frame rate drops — its
	 * precipitation density and impacts fall (to 35%) before anything that affects play; they come
	 * back once there is headroom again. Checked once a second.
	 */
	setPerformance(deltaSeconds: number, smoothedFps: number, targetFps: number): void {
		this.adaptiveTimer -= deltaSeconds;
		if (this.adaptiveTimer > 0) return;
		this.adaptiveTimer = 1;
		const precipitating = this.current.rain > 0.02 || this.current.snow > 0.02;
		const p = this.precipitation;
		if (precipitating && smoothedFps < targetFps * 0.8 && smoothedFps < 50) {
			p.densityScale = Math.max(0.35, p.densityScale - 0.1);
		} else if (smoothedFps > Math.min(targetFps * 0.92, 55)) {
			p.densityScale = Math.min(1, p.densityScale + 0.05);
		}
	}

	/** Developer: a strike now, in view and near enough to see and hear. */
	forceLightning(frame: WeatherFrame): void {
		const camera = frame.camera.position;
		frame.camera.getWorldDirection(this.lookDirection);
		const bearing =
			Math.atan2(this.lookDirection.x, this.lookDirection.z) + (Math.random() - 0.5) * 0.9;
		const event = this.lightning.force(camera.x, camera.z, 300 + Math.random() * 800, bearing);
		this.onStrike(event, frame);
	}

	/**
	 * Applies the settings menu's weather selection (procedural schedule or a held weather).
	 * A duration of 0 means a short blend so a manual pick is visible without waiting out the
	 * schedule's 35–60 second change.
	 */
	applyDebugSelection(): void {
		const d = this.debug;
		if (d.selection === 'schedule') {
			this.controller.useSchedule();
			return;
		}
		const state = createWeatherState(
			d.selection,
			clamp01(d.intensity),
			(d.windDirection * Math.PI) / 180
		);
		state.windStrength = Math.max(0, d.windStrength);
		state.cloudiness = clamp01(d.cloudiness);
		const duration = d.transitionDuration > 0 ? d.transitionDuration : MANUAL_WEATHER_TRANSITION;
		this.controller.setManual(state, duration);
	}

	/** Loads the preset cloud/wind values for the selected weather into the debug panel. */
	presetDebugValues(): void {
		const d = this.debug;
		if (d.selection === 'schedule') return;
		const preset = createWeatherState(d.selection, clamp01(d.intensity));
		d.windStrength = Math.round(preset.windStrength * 10) / 10;
		d.cloudiness = Math.round(preset.cloudiness * 100) / 100;
	}

	save(): WeatherSaveState {
		const save = this.controller.save();
		save.wetness = Math.round(this.environment.wetness * 1000) / 1000;
		save.snowCover = Math.round(this.environment.snowCover * 1000) / 1000;
		return save;
	}

	/** Restores a world's weather; worlds saved before weather start the schedule from its seed. */
	load(save: unknown, worldSeed: string): void {
		const clean = sanitizeWeatherSave(save);
		const seed = weatherSeedFor(worldSeed);
		this.controller = new WeatherController(clean?.seed ?? seed, clean?.allowSnow ?? false);
		if (clean) this.controller.load(clean);
		this.lightning = new LightningController((clean?.seed ?? seed) ^ 0x5a5a);
		this.debug.allowSnow = this.controller.allowSnow;
		this.debug.selection =
			this.controller.weatherMode === 'manual' ? this.controller.state.type : 'schedule';
		this.thunder.clear();
		this.bolt.hide();
		this.environment.setWetness(clean?.wetness ?? (this.current.rain > 0.2 ? 0.6 : 0));
		this.environment.setSnowCover(clean?.snowCover ?? (this.current.snow > 0.2 ? 0.5 : 0));
		this.lookDirty = true;
	}

	getStats(): WeatherStats {
		const env = this.current;
		const state = this.controller.state;
		const precipitation = this.precipitation.getStats();
		const thunder = this.thunder.stats;
		return {
			type: state.type,
			intensity: state.intensity,
			mode: this.controller.weatherMode,
			transition: this.controller.transition.progress,
			weatherTime: this.controller.weatherTime,
			rain: precipitation.rain,
			snow: precipitation.snow,
			rainCapacity: precipitation.rainCapacity,
			snowCapacity: precipitation.snowCapacity,
			impactsPerSecond: precipitation.impactsPerSecond,
			sheltered: precipitation.sheltered,
			densityScale: precipitation.densityScale,
			lightningStrikes: this.lightning.strikes,
			flash: this.flash,
			thunderPlaying: thunder.playing,
			thunderPending: thunder.pending,
			wetness: this.environment.wetness,
			snowCover: this.environment.snowCover,
			windSpeed: Math.hypot(env.windX, env.windZ),
			updateMs: this.lastUpdateMs
		};
	}

	dispose(): void {
		this.bolt.dispose();
		this.debugView.dispose();
		this.audio.dispose();
		this.group.removeFromParent();
	}

	private onStrike(event: LightningEvent, frame: WeatherFrame): void {
		this.thunder.schedule(event);
		this.lookDirty = true;
		if (!this.quality.bolts || event.distance > 4500) return;
		const ground = this.terrainY(event.x, event.z);
		const top = Math.max(ground + 60, frame.cloudAltitude);
		this.bolt.show(event, Number.isFinite(ground) ? ground : 0, top, frame.camera.position);
	}
}

function environmentMoved(a: WeatherEnvironment, b: WeatherEnvironment): boolean {
	return (
		Math.abs(a.cloudiness - b.cloudiness) > 1e-4 ||
		Math.abs(a.cloudDarkness - b.cloudDarkness) > 1e-4 ||
		Math.abs(a.sunScale - b.sunScale) > 1e-4 ||
		Math.abs(a.ambientScale - b.ambientScale) > 1e-4 ||
		Math.abs(a.skyBrightness - b.skyBrightness) > 1e-4 ||
		Math.abs(a.fogMultiplier - b.fogMultiplier) > 1e-4 ||
		Math.abs(a.desaturation - b.desaturation) > 1e-4 ||
		Math.abs(a.coolness - b.coolness) > 1e-4 ||
		Math.abs(a.windX - b.windX) > 1e-3 ||
		Math.abs(a.windZ - b.windZ) > 1e-3
	);
}
