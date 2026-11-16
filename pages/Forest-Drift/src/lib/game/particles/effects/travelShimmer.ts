import {
	createParticleBurst,
	type ParticleBurst,
	type ParticleEffectManager
} from '../ParticleEffectManager';
import type { ParticleEffectDefinition } from '../ParticleTypes';

/**
 * The fast travel shimmer (fast travel Q7, plan §8): warm motes rising round a traveller's feet
 * where they vanish and where they appear. Gentle and brief (about a second), unlit so it glows in
 * any light. It follows the particle quality setting and disappears with particles switched off.
 */
export const TRAVEL_SHIMMER_ID = 'travel-shimmer';
/** Reduced motion: no rising motes, just a soft glow that fades where the traveller stood. */
export const TRAVEL_GLOW_ID = 'travel-glow';

export const TRAVEL_SHIMMER: ParticleEffectDefinition = {
	id: TRAVEL_SHIMMER_ID,
	// Someone arriving matters more than ambient splashes when the pool is full.
	priority: 'important',
	maxParticles: 600,
	burstMin: 7,
	burstMax: 10,
	lifetimeMin: 0.8,
	lifetimeMax: 1.35,
	sizeStart: 0.24,
	sizeEnd: 0.05,
	sizeJitter: 0.4,
	speedMin: 0.05,
	speedMax: 0.3,
	upMin: 0.7,
	upMax: 1.9,
	spread: 0.16,
	spawnRadius: 0.4,
	// Negative: the motes drift upward a little faster as they go, to about head height.
	gravity: -0.6,
	drag: 0.8,
	opacityStart: 1,
	opacityEnd: 0,
	fadeIn: 0.1,
	spin: 1.2,
	color: [1.0, 0.74, 0.32],
	lighting: 0,
	textureId: 'water-mist',
	blending: 'additive',
	killDepth: 0.6,
	variants: [
		// Fine bright sparks among the motes.
		{
			weight: 0.3,
			sizeScale: 0.4,
			speedScale: 1.3,
			lifetimeScale: 1.1,
			opacityScale: 1,
			dragScale: 0.6,
			textureId: 'water-droplet'
		},
		// A few large soft puffs: the glow round the body.
		{
			weight: 0.12,
			sizeScale: 4,
			speedScale: 0.35,
			lifetimeScale: 0.8,
			opacityScale: 0.3,
			dragScale: 2
		}
	]
};

export const TRAVEL_GLOW: ParticleEffectDefinition = {
	id: TRAVEL_GLOW_ID,
	priority: 'important',
	maxParticles: 60,
	burstMin: 2,
	burstMax: 3,
	lifetimeMin: 0.45,
	lifetimeMax: 0.6,
	sizeStart: 0.9,
	sizeEnd: 1.1,
	sizeJitter: 0.15,
	speedMin: 0,
	speedMax: 0,
	upMin: 0,
	upMax: 0,
	spread: 0,
	spawnRadius: 0.1,
	gravity: 0,
	drag: 0,
	opacityStart: 0.55,
	opacityEnd: 0,
	fadeIn: 0.2,
	spin: 0,
	color: [1.0, 0.85, 0.5],
	lighting: 0,
	textureId: 'water-mist',
	blending: 'additive',
	killDepth: 2
};

/** Bursts round the feet: six directions, so the motes rise in a ring rather than a fan. */
const RING = 6;
/** Trips further than this from the viewer aren't worth drawing (metres). */
export const TRAVEL_SHIMMER_RANGE = 300;

export class TravelShimmer {
	private readonly burst: ParticleBurst = createParticleBurst();
	private seed = 1;

	constructor(private readonly particles: ParticleEffectManager) {
		particles.register(TRAVEL_SHIMMER);
		particles.register(TRAVEL_GLOW);
	}

	/**
	 * Plays the shimmer at feet position (x, y, z), if it's within range of `viewer`. Returns how many
	 * particles started (0 when out of range, or with particles off).
	 */
	play(
		at: { x: number; y: number; z: number },
		viewer: { x: number; z: number },
		reducedMotion: boolean
	): number {
		if (![at.x, at.y, at.z].every(Number.isFinite)) return 0;
		if (Math.hypot(at.x - viewer.x, at.z - viewer.z) > TRAVEL_SHIMMER_RANGE) return 0;
		const burst = this.burst;
		burst.strength = 1;
		burst.countScale = 1;
		if (reducedMotion) {
			burst.x = at.x;
			burst.y = at.y + 1;
			burst.z = at.z;
			burst.dirX = 1;
			burst.dirZ = 0;
			burst.seed = this.seed++;
			return this.particles.emitBurst(TRAVEL_GLOW_ID, burst);
		}
		let started = 0;
		for (let i = 0; i < RING; i++) {
			const angle = (i / RING) * Math.PI * 2;
			// Each burst spreads along the ring's tangent, offset outward a little from the feet.
			burst.dirX = Math.cos(angle);
			burst.dirZ = Math.sin(angle);
			burst.x = at.x + burst.dirX * 0.25;
			burst.y = at.y + 0.15;
			burst.z = at.z + burst.dirZ * 0.25;
			burst.seed = this.seed++;
			started += this.particles.emitBurst(TRAVEL_SHIMMER_ID, burst);
		}
		return started;
	}
}
