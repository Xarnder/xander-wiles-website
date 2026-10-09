/**
 * Procedural particle system — shared types. Framework-free (no Three.js), like every other
 * `*Types.ts` in the project.
 *
 *   effect definitions (this file, plain data)
 *     → ParticleEffectManager: registry, shared budget, priorities, bursts
 *       → ParticlePool: one fixed-capacity, typed-array store for every live particle
 *         → ParticleRenderer: one instanced billboard mesh per blend mode (one draw call each)
 *   ParticleTextureGenerator: procedural sprites packed once into one shared atlas
 *   ParticleFieldRenderer: GPU-animated fields (rain, snow) — fixed seeds, motion in the vertex
 *     shader, one draw call each, counted against the same budget
 *
 * Effects (lake-shore splashes first) only decide WHERE and WHEN to emit; how particles move and
 * render is entirely this module's job.
 */

export interface Vec3 {
	x: number;
	y: number;
	z: number;
}

/** Higher wins when the shared pool is under pressure. Ambient effects are dropped first. */
export type ParticlePriority = 'ambient' | 'normal' | 'important';

export const PARTICLE_PRIORITY_RANK: Readonly<Record<ParticlePriority, number>> = {
	ambient: 0,
	normal: 1,
	important: 2
};

export type ParticleBlending = 'normal' | 'additive';

/** `billboard` faces the camera; `ground` lies flat on the XZ plane (ripples on water). */
export type ParticleOrientation = 'billboard' | 'ground';

/**
 * A secondary particle kind inside the same effect (e.g. fine mist droplets inside a splash).
 * Scales are applied to the effect's own ranges; no separate emitter or renderer is created.
 */
export interface ParticleVariantDefinition {
	/** Relative chance of a particle in a burst being this variant. */
	weight: number;
	sizeScale: number;
	speedScale: number;
	lifetimeScale: number;
	opacityScale: number;
	dragScale: number;
	/** Texture used by this variant (defaults to the effect's). */
	textureId?: string;
	/** Only used at qualities that allow secondary particles. */
	secondary?: boolean;
}

/** Everything about how one kind of particle behaves and looks. Plain data. */
export interface ParticleEffectDefinition {
	id: string;
	priority: ParticlePriority;
	/** Hard cap on this effect's live particles (the global budget still applies on top). */
	maxParticles: number;

	burstMin: number;
	burstMax: number;

	lifetimeMin: number;
	lifetimeMax: number;

	sizeStart: number;
	sizeEnd: number;
	/** ± random size variation, as a fraction. */
	sizeJitter: number;

	/** Speed along the emit direction (m/s). */
	speedMin: number;
	speedMax: number;
	/** Extra upward speed (m/s). */
	upMin: number;
	upMax: number;
	/** Random spread around the emit direction (m/s, each axis). */
	spread: number;
	/** Random offset of spawn positions along the emitter's tangent (m). */
	spawnRadius: number;

	/** Downward acceleration (m/s²). */
	gravity: number;
	/** Linear drag per second (fraction of velocity lost). */
	drag: number;

	opacityStart: number;
	opacityEnd: number;
	/** 0..1 of the lifetime spent fading in. */
	fadeIn: number;

	/** Random spin, radians per second (±). */
	spin: number;

	/** Linear RGB tint multiplied with the sprite and the scene light. */
	color: readonly [number, number, number];
	/** 0 = unlit (glows), 1 = fully lit by the scene's sun/sky light. */
	lighting: number;

	textureId: string;
	blending: ParticleBlending;
	/** Particles below `spawnY - killDepth` vanish (falling back into water, etc.). */
	killDepth: number;
	/** Defaults to `billboard`. */
	orientation?: ParticleOrientation;

	variants?: readonly ParticleVariantDefinition[];
}

/**
 * A camera-local field of identical particles (rain, snow) animated entirely on the GPU: each
 * particle is a fixed random seed; the vertex shader derives its position from the seed, the time
 * and the camera, wrapping it through a volume that follows the camera. Nothing per particle is
 * touched on the CPU, nothing is allocated after the capacity is set, and the live count is just
 * the instance count. Plain data, like effect definitions.
 */
export interface ParticleFieldDefinition {
	id: string;
	textureId: string;
	/** `streak`: a quad stretched along the fall direction (rain). `flake`: camera-facing, spinning, fluttering (snow). */
	shape: 'streak' | 'flake';
	blending: ParticleBlending;
	/** 0 = unlit, 1 = lit by the scene light. */
	lighting: number;
	color: readonly [number, number, number];
}

/** Per-graphics-preset particle quality. One budget shared by every effect. */
export interface ParticleQualityProfile {
	/** Global maximum live particles: pooled particles plus field (rain/snow) particles. */
	budget: number;
	/** Fraction of the budget GPU fields (weather) may take; the rest stays for pooled effects. */
	fieldShare: number;
	/** Fraction of the budget ambient-priority effects may fill (the rest is reserved). */
	ambientShare: number;
	/** Multiplies effect burst sizes. */
	burstScale: number;
	/** Secondary (fine) variants enabled. */
	secondaryParticles: boolean;
	/** Multiplies how often ambient emitters fire. */
	frequencyScale: number;
	/** Effect distance bands (m): full detail, reduced, culled. */
	fullDistance: number;
	reducedDistance: number;
	cullDistance: number;
}

export type ParticleQualityTier = 'low' | 'medium' | 'high' | 'ultra';

/**
 * Starting points, tuned by profiling (see the README's "Particles" section). Ultra is the
 * highest *useful* level, not a stress test.
 */
export const PARTICLE_QUALITY: Readonly<Record<ParticleQualityTier, ParticleQualityProfile>> = {
	low: {
		budget: 1400,
		fieldShare: 0.75,
		ambientShare: 0.8,
		burstScale: 0.6,
		secondaryParticles: false,
		frequencyScale: 0.5,
		fullDistance: 25,
		reducedDistance: 45,
		cullDistance: 60
	},
	medium: {
		budget: 2600,
		fieldShare: 0.75,
		ambientShare: 0.8,
		burstScale: 0.85,
		secondaryParticles: false,
		frequencyScale: 0.8,
		fullDistance: 40,
		reducedDistance: 70,
		cullDistance: 90
	},
	high: {
		budget: 4500,
		fieldShare: 0.75,
		ambientShare: 0.8,
		burstScale: 1,
		secondaryParticles: true,
		frequencyScale: 1,
		fullDistance: 50,
		reducedDistance: 90,
		cullDistance: 110
	},
	ultra: {
		budget: 7000,
		fieldShare: 0.75,
		ambientShare: 0.8,
		burstScale: 1.15,
		secondaryParticles: true,
		frequencyScale: 1.15,
		fullDistance: 60,
		reducedDistance: 110,
		cullDistance: 140
	}
};

/** Developer controls (Settings → Particles). Not saved with worlds. */
export interface ParticleDebugSettings {
	enabled: boolean;
	paused: boolean;
	showEmitters: boolean;
	showSplashZones: boolean;
	/** 0 = use the graphics preset's budget. */
	maxParticlesOverride: number;
	splashDensity: number;
	splashSlopeThreshold: number;
	splashCandidateSpacing: number;
	/** 0 = use the graphics preset's cull distance. */
	splashCullDistance: number;
}

export function createDefaultParticleDebugSettings(): ParticleDebugSettings {
	return {
		enabled: true,
		paused: false,
		showEmitters: false,
		showSplashZones: false,
		maxParticlesOverride: 0,
		splashDensity: 0.45,
		splashSlopeThreshold: 24,
		splashCandidateSpacing: 5,
		splashCullDistance: 0
	};
}

export interface ParticleStats {
	/** Pooled plus field particles. */
	activeParticles: number;
	/** Live particles per GPU field (rain, snow). */
	fields: Record<string, number>;
	capacity: number;
	drawCalls: number;
	/** GPU instance-buffer bytes of every renderer, plus the pool's CPU arrays. */
	bufferBytes: number;
	/** CPU time of the last simulation + upload, ms. */
	updateMs: number;
	/** Particles refused this session because the budget or an effect cap was full. */
	dropped: number;
	textureBytes: number;
}

/** Small deterministic PRNG (mulberry32). Visual randomness never touches `Math.random`. */
export function createParticleRandom(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/** Deterministic 0..1 hash of a few integers and a seed. */
export function particleHash(a: number, b: number, c: number, seed: number): number {
	let h = seed | 0;
	h = Math.imul(h ^ (a | 0), 0x27d4eb2d);
	h = Math.imul(h ^ (b | 0), 0x165667b1);
	h = Math.imul(h ^ (c | 0), 0x85ebca6b);
	h ^= h >>> 15;
	h = Math.imul(h, 0xc2b2ae35);
	h ^= h >>> 13;
	return (h >>> 0) / 4294967296;
}
