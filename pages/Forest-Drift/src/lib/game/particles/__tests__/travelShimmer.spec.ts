import { describe, expect, it } from 'vitest';
import { ParticleEffectManager } from '../ParticleEffectManager';
import { PARTICLE_QUALITY } from '../ParticleTypes';
import { TRAVEL_SHIMMER_RANGE, TravelShimmer } from '../effects/travelShimmer';

/** Fast travel Phase 3: the shimmer where a traveller vanishes and appears (plan §8). */

const here = { x: 0, z: 0 };
const feet = { x: 3, y: 12, z: -4 };

function setup() {
	const particles = new ParticleEffectManager({ renderers: false });
	particles.setQuality(PARTICLE_QUALITY.high);
	return { particles, shimmer: new TravelShimmer(particles) };
}

describe('TravelShimmer', () => {
	it('starts a ring of motes at the feet that rise and are gone within two seconds', () => {
		const { particles, shimmer } = setup();
		const started = shimmer.play(feet, here, false);
		expect(started).toBeGreaterThanOrEqual(20);
		expect(started).toBeLessThanOrEqual(80);
		expect(particles.getStats().activeParticles).toBe(started);
		for (let i = 0; i < 120; i++) particles.update(1 / 60);
		expect(particles.getStats().activeParticles).toBe(0);
	});

	it('with reduced motion, only a soft glow: a few still particles, no rising motes', () => {
		const { shimmer } = setup();
		const started = shimmer.play(feet, here, true);
		expect(started).toBeGreaterThan(0);
		expect(started).toBeLessThanOrEqual(3);
	});

	it('skips trips out of range, bad positions, and particles switched off', () => {
		const { particles, shimmer } = setup();
		expect(shimmer.play({ x: TRAVEL_SHIMMER_RANGE + 50, y: 0, z: 0 }, here, false)).toBe(0);
		expect(shimmer.play({ x: Number.NaN, y: 0, z: 0 }, here, false)).toBe(0);
		particles.setEnabled(false);
		expect(shimmer.play(feet, here, false)).toBe(0);
	});

	it('follows the quality setting: fewer motes on low', () => {
		const high = setup();
		const low = setup();
		low.particles.setQuality(PARTICLE_QUALITY.low);
		expect(low.shimmer.play(feet, here, false)).toBeLessThan(high.shimmer.play(feet, here, false));
	});
});
