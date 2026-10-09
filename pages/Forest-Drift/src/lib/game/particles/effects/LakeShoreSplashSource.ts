import * as THREE from 'three';
import type { LakeDefinition } from '../../hydrology/HydrologyTypes';
import { createParticleBurst, type ParticleEffectManager } from '../ParticleEffectManager';
import { particleHash, type ParticleDebugSettings } from '../ParticleTypes';
import {
	generateLakeSplashZones,
	LAKE_SHORE_SPLASH,
	LAKE_SHORE_SPLASH_ID,
	SPLASH_BAND_FACTORS,
	splashBand,
	splashInterval,
	type SplashZoneDefinition,
	type TerrainHeightAt
} from './lakeShoreSplash';

/**
 * What the splash source reads from hydrology. Hydrology knows nothing about particles; this is the
 * one-way dependency (particles → hydrology), and splashes simply stop if hydrology is off.
 */
export interface LakeShoreHydrology {
	readonly settings: { enabled: boolean };
	lakesNear(worldX: number, worldZ: number, radius: number): readonly LakeDefinition[];
	getRevision(): number;
}

interface LakeZones {
	lake: LakeDefinition;
	zones: SplashZoneDefinition[];
	/** Per zone: time of the next splash, and how many it has made (seeds the next one). */
	next: Float64Array;
	bursts: Uint32Array;
}

export interface LakeShoreSplashStats {
	lakes: number;
	zones: number;
	/** Zones close enough to simulate. */
	activeZones: number;
	/** Active zones inside the camera frustum. */
	visibleZones: number;
	pendingLakes: number;
	lastZoneBuildMs: number;
}

/** Lakes up to this far beyond the cull distance are kept generated (a little hysteresis). */
const KEEP_MARGIN = 160;
const LAKE_QUERY_MARGIN = 80;
const REFRESH_SECONDS = 0.5;

/**
 * Lake-shore splash emitters, without one object per emitter: each nearby lake's zones are
 * generated once (deterministically) when it comes within range, cached as plain data plus two
 * typed arrays of timers, and the scheduler walks only nearby lakes each frame. Dormant zones cost
 * a distance check; far lakes cost nothing and are evicted.
 */
export class LakeShoreSplashSource {
	readonly debugGroup = new THREE.Group();
	private readonly lakes = new Map<string, LakeZones>();
	private readonly pending: LakeDefinition[] = [];
	private readonly burst = createParticleBurst();
	private readonly frustumPoint = new THREE.Vector3();
	private time = 0;
	private refreshTimer = Infinity;
	private signature = '';
	private lastZoneBuildMs = 0;
	private readonly stats: LakeShoreSplashStats = {
		lakes: 0,
		zones: 0,
		activeZones: 0,
		visibleZones: 0,
		pendingLakes: 0,
		lastZoneBuildMs: 0
	};
	private debugLines: THREE.LineSegments | null = null;
	private debugDirty = true;

	constructor(
		private readonly particles: ParticleEffectManager,
		private readonly hydrology: LakeShoreHydrology,
		private readonly terrainHeight: TerrainHeightAt,
		private readonly getWorldSeed: () => number,
		private readonly settings: ParticleDebugSettings
	) {
		particles.register(LAKE_SHORE_SPLASH);
		this.debugGroup.name = 'particle-splash-debug';
	}

	/** Drops every cached zone; they regenerate lazily (settings, seed or hydrology changed). */
	invalidate(): void {
		this.lakes.clear();
		this.pending.length = 0;
		this.refreshTimer = Infinity;
		this.debugDirty = true;
	}

	update(deltaSeconds: number, playerX: number, playerZ: number, frustum?: THREE.Frustum): void {
		this.time += deltaSeconds;
		const enabled =
			this.settings.enabled && this.particles.isEnabled() && this.hydrology.settings.enabled;
		if (!enabled) {
			if (this.lakes.size > 0) this.invalidate();
			this.updateDebug(playerX, playerZ);
			return;
		}

		const signature = `${this.hydrology.getRevision()}|${this.getWorldSeed()}|${this.settings.splashDensity}|${this.settings.splashSlopeThreshold}|${this.settings.splashCandidateSpacing}`;
		if (signature !== this.signature) {
			this.signature = signature;
			this.invalidate();
		}

		const profile = this.particles.getQuality();
		const cull =
			this.settings.splashCullDistance > 0
				? this.settings.splashCullDistance
				: profile.cullDistance;

		this.refreshTimer += deltaSeconds;
		if (this.refreshTimer >= REFRESH_SECONDS) {
			this.refreshTimer = 0;
			this.refreshLakes(playerX, playerZ, cull);
		}
		// Generate at most one lake's zones per frame — streaming, never a hitch.
		const lake = this.pending.shift();
		if (lake) this.buildLake(lake);

		let active = 0;
		let visible = 0;
		const paused = this.settings.paused;
		const frequency = profile.frequencyScale;
		const b = this.burst;
		for (const entry of this.lakes.values()) {
			const { zones, next, bursts } = entry;
			for (let i = 0; i < zones.length; i++) {
				const zone = zones[i];
				const distance = Math.hypot(zone.x - playerX, zone.z - playerZ);
				const band = splashBand(distance, profile, this.settings.splashCullDistance);
				if (band === 'off') {
					// Out of range: keep the timer from piling up a backlog of splashes.
					if (next[i] < this.time)
						next[i] = this.time + splashInterval(zone, bursts[i], frequency, 'full');
					continue;
				}
				active++;
				if (frustum) {
					this.frustumPoint.set(zone.x, zone.y, zone.z);
					if (frustum.containsPoint(this.frustumPoint)) visible++;
				}
				if (paused || this.time < next[i]) continue;
				b.x = zone.x;
				b.y = zone.y;
				b.z = zone.z;
				b.dirX = zone.nx;
				b.dirZ = zone.nz;
				b.strength = zone.strength;
				b.seed = (zone.seed ^ Math.imul(bursts[i] + 1, 0x9e3779b1)) >>> 0;
				b.countScale = SPLASH_BAND_FACTORS[band].count;
				this.particles.emitBurst(LAKE_SHORE_SPLASH_ID, b);
				bursts[i]++;
				next[i] = this.time + splashInterval(zone, bursts[i], frequency, band);
			}
		}

		let zoneCount = 0;
		for (const entry of this.lakes.values()) zoneCount += entry.zones.length;
		const stats = this.stats;
		stats.lakes = this.lakes.size;
		stats.zones = zoneCount;
		stats.activeZones = active;
		stats.visibleZones = visible;
		stats.pendingLakes = this.pending.length;
		stats.lastZoneBuildMs = this.lastZoneBuildMs;
		this.updateDebug(playerX, playerZ, cull);
	}

	getStats(): LakeShoreSplashStats {
		return this.stats;
	}

	/** Every cached zone (debug, tests). */
	getZones(): SplashZoneDefinition[] {
		return [...this.lakes.values()].flatMap((entry) => entry.zones);
	}

	dispose(): void {
		this.invalidate();
		this.debugLines?.geometry.dispose();
		(this.debugLines?.material as THREE.Material | undefined)?.dispose();
		this.debugLines = null;
	}

	private refreshLakes(playerX: number, playerZ: number, cull: number): void {
		const near = this.hydrology.lakesNear(playerX, playerZ, cull + LAKE_QUERY_MARGIN);
		for (const lake of near) {
			if (this.lakes.has(lake.id) || this.pending.some((p) => p.id === lake.id)) continue;
			this.pending.push(lake);
		}
		// Evict lakes well out of range (they regenerate identically if the player returns).
		for (const [id, entry] of this.lakes) {
			const lake = entry.lake;
			const dx = Math.max(lake.bounds.minX - playerX, 0, playerX - lake.bounds.maxX);
			const dz = Math.max(lake.bounds.minZ - playerZ, 0, playerZ - lake.bounds.maxZ);
			if (Math.hypot(dx, dz) > cull + KEEP_MARGIN) {
				this.lakes.delete(id);
				this.debugDirty = true;
			}
		}
	}

	private buildLake(lake: LakeDefinition): void {
		const start = performance.now();
		const zones = generateLakeSplashZones(
			lake,
			this.terrainHeight,
			{
				candidateSpacing: this.settings.splashCandidateSpacing,
				density: this.settings.splashDensity,
				slopeThreshold: this.settings.splashSlopeThreshold
			},
			this.getWorldSeed()
		);
		const next = new Float64Array(zones.length);
		const bursts = new Uint32Array(zones.length);
		// Deterministic phase per zone, so a shore never splashes in unison.
		for (let i = 0; i < zones.length; i++)
			next[i] = this.time + 0.3 + particleHash(i, 5, 0, zones[i].seed) * 4;
		this.lakes.set(lake.id, { lake, zones, next, bursts });
		this.lastZoneBuildMs = performance.now() - start;
		this.debugDirty = true;
	}

	/** Splash-zone markers: a short post per zone, taller for stronger zones; bright when active. */
	private updateDebug(playerX: number, playerZ: number, cull = 0): void {
		const show = this.settings.showSplashZones || this.settings.showEmitters;
		if (!show) {
			if (this.debugLines) this.debugLines.visible = false;
			return;
		}
		if (!this.debugDirty && this.debugLines && this.time % 0.5 > 0.1) {
			this.debugLines.visible = true;
			return;
		}
		this.debugDirty = false;
		const positions: number[] = [];
		const colors: number[] = [];
		for (const entry of this.lakes.values()) {
			for (const zone of entry.zones) {
				const activeZone = Math.hypot(zone.x - playerX, zone.z - playerZ) <= cull;
				if (!this.settings.showSplashZones && !activeZone) continue;
				const height = 0.4 + zone.strength * 1.2;
				positions.push(zone.x, zone.y, zone.z, zone.x, zone.y + height, zone.z);
				// Direction tick: where the splash flies.
				positions.push(
					zone.x,
					zone.y + 0.05,
					zone.z,
					zone.x + zone.nx * 0.6,
					zone.y + 0.05,
					zone.z + zone.nz * 0.6
				);
				const c = activeZone && this.settings.showEmitters ? [1, 0.85, 0.2] : [0.2, 0.8, 1];
				for (let k = 0; k < 4; k++) colors.push(c[0], c[1], c[2]);
			}
		}
		if (!this.debugLines) {
			this.debugLines = new THREE.LineSegments(
				new THREE.BufferGeometry(),
				new THREE.LineBasicMaterial({ vertexColors: true, depthTest: false, transparent: true })
			);
			this.debugLines.renderOrder = 10;
			this.debugLines.frustumCulled = false;
			this.debugGroup.add(this.debugLines);
		}
		const geometry = this.debugLines.geometry;
		geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
		geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
		this.debugLines.visible = positions.length > 0;
	}
}
