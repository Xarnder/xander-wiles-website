import type { ParticleEffectDefinition } from '../ParticleTypes';

/** A small soft puff where a seed pellet leaves a creature's mouth or lands (ranged weapons Q1). */
export const CREATURE_PELLET_PUFF_ID = 'creature-pellet-puff';

/**
 * Pale, pollen-coloured mist with a few seed-coloured flecks: soft and non-violent by design, gone
 * within half a second. Normal priority, so ambient splashes never crowd it out.
 */
export const CREATURE_PELLET_PUFF: ParticleEffectDefinition = {
	id: CREATURE_PELLET_PUFF_ID,
	priority: 'normal',
	maxParticles: 400,
	burstMin: 6,
	burstMax: 10,
	lifetimeMin: 0.25,
	lifetimeMax: 0.55,
	sizeStart: 0.12,
	sizeEnd: 0.22,
	sizeJitter: 0.35,
	speedMin: 0.4,
	speedMax: 1.3,
	upMin: 0.3,
	upMax: 1.1,
	spread: 0.9,
	spawnRadius: 0.06,
	gravity: 1.5,
	drag: 2.2,
	opacityStart: 0.7,
	opacityEnd: 0,
	fadeIn: 0.04,
	spin: 1.5,
	color: [0.96, 0.9, 0.66],
	lighting: 0.8,
	textureId: 'water-mist',
	blending: 'normal',
	killDepth: 0.5,
	variants: [
		{
			weight: 0.5,
			sizeScale: 0.35,
			speedScale: 1.4,
			lifetimeScale: 0.8,
			opacityScale: 1,
			dragScale: 0.6,
			textureId: 'water-droplet'
		}
	]
};
