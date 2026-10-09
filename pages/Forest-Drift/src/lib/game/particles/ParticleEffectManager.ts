import * as THREE from 'three';
import type { ParticleFieldFrame } from './ParticleFieldMath';
import { ParticleFieldRenderer } from './ParticleFieldRenderer';
import { createParticleSpawn, MAX_PARTICLE_EFFECTS, ParticlePool } from './ParticlePool';
import { ParticleRenderer } from './ParticleRenderer';
import { getParticleAtlas, type ParticleAtlas } from './ParticleTextureGenerator';
import {
	PARTICLE_PRIORITY_RANK,
	PARTICLE_QUALITY,
	type ParticleBlending,
	type ParticleEffectDefinition,
	type ParticleFieldDefinition,
	type ParticleQualityProfile,
	type ParticleStats,
	type ParticleVariantDefinition
} from './ParticleTypes';

/** A reusable deterministic PRNG (mulberry32) — reseeded per burst, never reallocated. */
class BurstRandom {
	private state = 0;
	seed(seed: number): void {
		this.state = seed >>> 0;
	}
	next(): number {
		this.state = (this.state + 0x6d2b79f5) >>> 0;
		let t = this.state;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	}
	range(min: number, max: number): number {
		return min + (max - min) * this.next();
	}
}

interface RegisteredEffect {
	index: number;
	definition: ParticleEffectDefinition;
	rank: number;
	/** Atlas cells per variant (index 0 = the base particle). */
	variantCells: number[][];
	variants: ParticleVariantDefinition[];
}

/** Where and how a burst starts. Reuse one; `emitBurst` only reads it. */
export interface ParticleBurst {
	x: number;
	y: number;
	z: number;
	/** Horizontal emit direction (unit). Particles fly along it, up, and spread around it. */
	dirX: number;
	dirZ: number;
	/** 0..1: scales count, speed and size a little. */
	strength: number;
	/** Deterministic per-burst seed (visual variation only). */
	seed: number;
	/** Extra multiplier on the particle count (distance bands). */
	countScale: number;
}

export function createParticleBurst(): ParticleBurst {
	return { x: 0, y: 0, z: 0, dirX: 1, dirZ: 0, strength: 1, seed: 0, countScale: 1 };
}

/** A registered GPU field: its live count always counts against the shared budget. */
interface RegisteredField {
	definition: ParticleFieldDefinition;
	renderer: ParticleFieldRenderer | null;
	capacity: number;
	count: number;
}

/**
 * The particle system's front door. Effects are registered once as plain definitions; emitters
 * (lake shores today; rain, smoke, embers… later) call `emitBurst`. Every effect shares:
 *
 *   - ONE budget: the pools' capacity comes from the graphics preset, and ambient-priority effects
 *     may only fill `ambientShare` of it, so a later important effect always has room. When the
 *     budget is full, new low-priority particles are simply dropped — nothing is allocated.
 *   - ONE pool and ONE renderer (one draw call) per blend mode.
 *   - ONE procedural atlas texture.
 */
export class ParticleEffectManager {
	readonly group = new THREE.Group();
	private readonly effects = new Map<string, RegisteredEffect>();
	private readonly effectList: RegisteredEffect[] = [];
	private readonly pools = new Map<ParticleBlending, ParticlePool>();
	private readonly fields = new Map<string, RegisteredField>();
	private readonly renderers = new Map<ParticleBlending, ParticleRenderer>();
	private readonly atlas: ParticleAtlas;
	private readonly spawn = createParticleSpawn();
	private readonly random = new BurstRandom();
	private readonly lightUniform = { value: new THREE.Color(1, 1, 1) };
	private profile: ParticleQualityProfile = PARTICLE_QUALITY.high;
	private budget = PARTICLE_QUALITY.high.budget;
	private paused = false;
	private enabled = true;
	private dropped = 0;
	private lastUpdateMs = 0;
	/** False in unit tests: pools and budgets only, no GPU objects. */
	private readonly withRenderers: boolean;

	constructor(options: { renderers?: boolean } = {}) {
		this.group.name = 'particles';
		this.atlas = getParticleAtlas();
		this.withRenderers = options.renderers ?? true;
	}

	// ---------------------------------------------------------------- configuration

	register(definition: ParticleEffectDefinition): void {
		if (this.effects.has(definition.id)) return;
		if (this.effectList.length >= MAX_PARTICLE_EFFECTS)
			throw new Error('too many particle effects');
		const variants: ParticleVariantDefinition[] = [
			{
				weight: 1,
				sizeScale: 1,
				speedScale: 1,
				lifetimeScale: 1,
				opacityScale: 1,
				dragScale: 1
			},
			...(definition.variants ?? [])
		];
		const variantCells = variants.map((variant) => {
			const id = variant.textureId ?? definition.textureId;
			const cells = this.atlas.cells.get(id);
			if (!cells) throw new Error(`unknown particle texture "${id}"`);
			return [...cells];
		});
		const effect: RegisteredEffect = {
			index: this.effectList.length,
			definition,
			rank: PARTICLE_PRIORITY_RANK[definition.priority],
			variantCells,
			variants
		};
		this.effects.set(definition.id, effect);
		this.effectList.push(effect);
		this.poolFor(definition.blending);
	}

	/**
	 * Registers a GPU particle field (rain, snow). It draws nothing until its owner sets a count with
	 * `setFieldCount`; its capacity is allocated once and changed only with `setFieldCapacity`.
	 */
	registerField(definition: ParticleFieldDefinition, capacity: number): void {
		if (this.fields.has(definition.id)) return;
		const renderer = this.withRenderers
			? new ParticleFieldRenderer(definition, this.atlas, this.lightUniform, capacity)
			: null;
		if (renderer) this.group.add(renderer.mesh);
		this.fields.set(definition.id, {
			definition,
			renderer,
			capacity: Math.max(0, Math.floor(capacity)),
			count: 0
		});
	}

	/** Reallocates a field's seed buffer — only when the capacity changes (graphics quality). */
	setFieldCapacity(id: string, capacity: number): void {
		const field = this.fields.get(id);
		if (!field) return;
		field.capacity = Math.max(0, Math.floor(capacity));
		field.renderer?.setCapacity(field.capacity);
		if (field.count > field.capacity) this.setFieldCount(id, field.capacity);
	}

	/**
	 * Asks for `wanted` live particles in a field. Fields together may take `fieldShare` of the
	 * global budget; pooled effects keep the rest. Returns how many were granted.
	 */
	setFieldCount(id: string, wanted: number): number {
		const field = this.fields.get(id);
		if (!field) return 0;
		let others = 0;
		for (const [otherId, other] of this.fields) if (otherId !== id) others += other.count;
		const share = this.enabled ? Math.floor(this.budget * this.profile.fieldShare) : 0;
		const granted = Math.max(
			0,
			Math.min(Math.floor(wanted), field.capacity, share - others, this.budget - this.pooledActive - others)
		);
		field.count = granted;
		field.renderer?.setCount(granted);
		return granted;
	}

	getFieldCount(id: string): number {
		return this.fields.get(id)?.count ?? 0;
	}

	/** Per-frame uniforms of a field (camera anchor, phase, wind, shelter…). */
	updateField(id: string, frame: ParticleFieldFrame): void {
		this.fields.get(id)?.renderer?.update(frame);
	}

	setQuality(profile: ParticleQualityProfile, budgetOverride = 0): void {
		this.profile = profile;
		this.budget = budgetOverride > 0 ? Math.floor(budgetOverride) : profile.budget;
		for (const pool of this.pools.values()) pool.resize(this.budget);
		// Fields keep their counts only while the new budget allows them.
		for (const [id, field] of this.fields) this.setFieldCount(id, field.count);
	}

	getQuality(): ParticleQualityProfile {
		return this.profile;
	}

	setEnabled(enabled: boolean): void {
		this.enabled = enabled;
		if (!enabled) {
			this.clear();
			for (const id of this.fields.keys()) this.setFieldCount(id, 0);
		}
		this.group.visible = enabled;
	}

	isEnabled(): boolean {
		return this.enabled;
	}

	setPaused(paused: boolean): void {
		this.paused = paused;
	}

	/** Scene light (linear) for lit particles — sun + sky, roughly what a small droplet receives. */
	setLight(color: THREE.Color): void {
		this.lightUniform.value.copy(color);
	}

	// ---------------------------------------------------------------- emission

	/** Live particles across every pool and field. */
	get activeParticles(): number {
		return this.pooledActive + this.fieldActive;
	}

	private get pooledActive(): number {
		let total = 0;
		for (const pool of this.pools.values()) total += pool.count;
		return total;
	}

	private get fieldActive(): number {
		let total = 0;
		for (const field of this.fields.values()) total += field.count;
		return total;
	}

	/**
	 * How many more pooled particles of this priority the budget still allows. Fields (weather) are
	 * taken off the top; ambient effects may fill `ambientShare` of what is left.
	 */
	headroom(priority: number): number {
		const available = this.budget - this.fieldActive;
		const limit = priority <= 0 ? Math.floor(available * this.profile.ambientShare) : available;
		return Math.max(0, limit - this.pooledActive);
	}

	/**
	 * Emits one burst of `effectId`. Returns how many particles actually started — fewer than asked
	 * when the shared budget, the effect's own cap, or the pool is full (the rest are dropped).
	 */
	emitBurst(effectId: string, burst: ParticleBurst): number {
		if (!this.enabled) return 0;
		const effect = this.effects.get(effectId);
		if (!effect) return 0;
		const def = effect.definition;
		const pool = this.poolFor(def.blending);
		const rng = this.random;
		rng.seed(burst.seed);

		const strength = Math.min(1, Math.max(0, burst.strength));
		const wanted = Math.round(
			rng.range(def.burstMin, def.burstMax) *
				(0.6 + 0.6 * strength) *
				this.profile.burstScale *
				burst.countScale
		);
		const allowed = Math.min(
			wanted,
			this.headroom(effect.rank),
			def.maxParticles - pool.perEffect[effect.index]
		);
		this.dropped += Math.max(0, wanted - Math.max(0, allowed));
		if (allowed <= 0) return 0;

		const dirLength = Math.hypot(burst.dirX, burst.dirZ) || 1;
		const dx = burst.dirX / dirLength;
		const dz = burst.dirZ / dirLength;
		const secondary = this.profile.secondaryParticles;
		let totalWeight = 0;
		for (const v of effect.variants) if (secondary || !v.secondary) totalWeight += v.weight;

		const p = this.spawn;
		let started = 0;
		for (let n = 0; n < allowed; n++) {
			// Variant by weight.
			let pick = rng.next() * totalWeight;
			let variantIndex = 0;
			for (let v = 0; v < effect.variants.length; v++) {
				const variant = effect.variants[v];
				if (!secondary && variant.secondary) continue;
				pick -= variant.weight;
				if (pick <= 0) {
					variantIndex = v;
					break;
				}
			}
			const variant = effect.variants[variantIndex];
			const cells = effect.variantCells[variantIndex];

			const along =
				rng.range(def.speedMin, def.speedMax) * (0.7 + 0.45 * strength) * variant.speedScale;
			const up = rng.range(def.upMin, def.upMax) * (0.75 + 0.4 * strength) * variant.speedScale;
			const offset = (rng.next() - 0.5) * 2 * def.spawnRadius;
			const sizeJitter = 1 + (rng.next() - 0.5) * 2 * def.sizeJitter;
			const sizeScale = sizeJitter * variant.sizeScale * (0.85 + 0.3 * strength);

			p.effect = effect.index;
			p.x = burst.x - dz * offset;
			p.y = burst.y;
			p.z = burst.z + dx * offset;
			p.vx = dx * along + (rng.next() - 0.5) * 2 * def.spread * variant.speedScale;
			p.vy = up + (rng.next() - 0.5) * def.spread * variant.speedScale;
			p.vz = dz * along + (rng.next() - 0.5) * 2 * def.spread * variant.speedScale;
			p.life = rng.range(def.lifetimeMin, def.lifetimeMax) * variant.lifetimeScale;
			p.size0 = def.sizeStart * sizeScale;
			p.size1 = def.sizeEnd * sizeScale;
			p.alpha0 = def.opacityStart * variant.opacityScale;
			p.alpha1 = def.opacityEnd * variant.opacityScale;
			p.fadeIn = def.fadeIn;
			p.rotation = rng.next() * Math.PI * 2;
			p.spin = (rng.next() - 0.5) * 2 * def.spin;
			p.gravity = def.gravity;
			p.drag = def.drag * variant.dragScale;
			p.killY = burst.y - def.killDepth;
			p.cell = cells[Math.floor(rng.next() * cells.length) % cells.length];
			p.lighting = def.lighting;
			p.r = def.color[0];
			p.g = def.color[1];
			p.b = def.color[2];
			p.flat = def.orientation === 'ground' ? 1 : 0;
			if (!pool.spawn(p)) break;
			started++;
		}
		this.dropped += allowed - started;
		return started;
	}

	// ---------------------------------------------------------------- per frame

	update(deltaSeconds: number): void {
		const start = performance.now();
		const dt = Math.min(0.1, Math.max(0, deltaSeconds));
		for (const [blending, pool] of this.pools) {
			if (this.paused) pool.writeRender();
			else pool.update(dt);
			this.renderers.get(blending)?.sync();
		}
		this.lastUpdateMs = performance.now() - start;
	}

	clear(): void {
		for (const pool of this.pools.values()) pool.clear();
		for (const renderer of this.renderers.values()) renderer.sync();
	}

	getStats(): ParticleStats {
		let drawCalls = 0;
		let bufferBytes = 0;
		const fields: Record<string, number> = {};
		for (const [id, field] of this.fields) {
			fields[id] = field.count;
			if (field.renderer) {
				bufferBytes += field.renderer.bufferBytes;
				if (field.count > 0) drawCalls++;
			}
		}
		for (const [blending, pool] of this.pools) {
			bufferBytes += pool.bytes;
			const renderer = this.renderers.get(blending);
			if (renderer) {
				bufferBytes += renderer.bufferBytes;
				if (pool.count > 0) drawCalls++;
			}
		}
		return {
			activeParticles: this.activeParticles,
			fields,
			capacity: this.budget,
			drawCalls,
			bufferBytes,
			updateMs: this.lastUpdateMs,
			dropped: this.dropped,
			textureBytes: this.atlas.pixels.byteLength
		};
	}

	/** Every material this manager owns (shadow/fog registration is not needed: particles are unshadowed). */
	getMaterials(): THREE.Material[] {
		const materials: THREE.Material[] = [...this.renderers.values()].map((r) => r.material);
		for (const field of this.fields.values()) if (field.renderer) materials.push(field.renderer.material);
		return materials;
	}

	dispose(): void {
		for (const renderer of this.renderers.values()) renderer.dispose();
		for (const field of this.fields.values()) field.renderer?.dispose();
		this.renderers.clear();
		this.pools.clear();
		this.fields.clear();
	}

	private poolFor(blending: ParticleBlending): ParticlePool {
		let pool = this.pools.get(blending);
		if (pool) return pool;
		pool = new ParticlePool(this.budget);
		this.pools.set(blending, pool);
		if (this.withRenderers) {
			const renderer = new ParticleRenderer(pool, blending, this.atlas, this.lightUniform);
			this.renderers.set(blending, renderer);
			this.group.add(renderer.mesh);
		}
		return pool;
	}
}
