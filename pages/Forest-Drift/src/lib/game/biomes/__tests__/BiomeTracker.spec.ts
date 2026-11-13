import { describe, expect, it } from 'vitest';
import { BIOME_CARD_COOLDOWN_SECONDS, BIOME_HOLD_SECONDS, BiomeTracker } from '../BiomeTracker';

/** Advance `seconds` in frames of `dt`, feeding the same biome; returns every change reported. */
function run(tracker: BiomeTracker, biome: number | null, seconds: number, dt = 1 / 60) {
	const changes = [];
	for (let t = 0; t < seconds - 1e-9; t += dt) {
		const change = tracker.update(biome, dt);
		if (change) changes.push(change);
	}
	return changes;
}

describe('BiomeTracker', () => {
	it('announces the starting biome once it has held for the hold time', () => {
		const tracker = new BiomeTracker();
		expect(run(tracker, 3, BIOME_HOLD_SECONDS - 0.1)).toEqual([]);
		expect(run(tracker, 3, 0.2)).toEqual([{ current: 3, announce: true }]);
		expect(tracker.getCurrent()).toBe(3);
	});

	it('ignores a biome crossed in less than the hold time', () => {
		const tracker = new BiomeTracker();
		run(tracker, 3, BIOME_HOLD_SECONDS + 0.1);
		expect(run(tracker, 7, BIOME_HOLD_SECONDS - 0.5)).toEqual([]);
		expect(run(tracker, 3, 5)).toEqual([]);
		expect(tracker.getCurrent()).toBe(3);
	});

	it('does not flicker on a border that alternates every frame', () => {
		const tracker = new BiomeTracker();
		run(tracker, 3, BIOME_HOLD_SECONDS + 0.1);
		const changes = [];
		for (let i = 0; i < 600; i++) {
			const change = tracker.update(i % 2 ? 3 : 7, 1 / 60);
			if (change) changes.push(change);
		}
		expect(changes).toEqual([]);
	});

	it('changes biome quietly during the cooldown, then announces when it ends', () => {
		const tracker = new BiomeTracker();
		run(tracker, 3, BIOME_HOLD_SECONDS + 0.1);
		// Into a new biome five seconds later: current updates (pause menu), no card yet.
		expect(run(tracker, 7, BIOME_HOLD_SECONDS + 0.1)).toEqual([{ current: 7, announce: false }]);
		const later = run(tracker, 7, BIOME_CARD_COOLDOWN_SECONDS);
		expect(later).toEqual([{ current: 7, announce: true }]);
	});

	it('announces straight away once the cooldown has passed', () => {
		const tracker = new BiomeTracker();
		run(tracker, 3, BIOME_CARD_COOLDOWN_SECONDS + 1);
		expect(run(tracker, 7, BIOME_HOLD_SECONDS + 0.1)).toEqual([{ current: 7, announce: true }]);
	});

	it('reports biomes switching off, and is frame-rate independent', () => {
		const slow = new BiomeTracker();
		const fast = new BiomeTracker();
		expect(run(slow, 2, 3.2, 1 / 20)).toEqual(run(fast, 2, 3.2, 1 / 144));
		expect(slow.update(null, 1 / 60)).toEqual({ current: null, announce: false });
		expect(slow.update(null, 1 / 60)).toBeNull();
	});

	it('announces again after a reset (a new world)', () => {
		const tracker = new BiomeTracker();
		run(tracker, 3, BIOME_HOLD_SECONDS + 0.1);
		tracker.reset();
		expect(run(tracker, 3, BIOME_HOLD_SECONDS + 0.1)).toEqual([{ current: 3, announce: true }]);
	});
});
