import { describe, expect, it } from 'vitest';
import { FoundationManager } from '../FoundationManager';
import type { FoundationDefinition } from '../FoundationTypes';
import { SlabManager } from '../SlabManager';
import { WorldSurfaceSampler } from '../WorldSurfaceSampler';

const SPACING = 2;

function makeSlabManager(foundationManager: FoundationManager): SlabManager {
	return new SlabManager({
		getFoundation: (id) => foundationManager.getFoundation(id),
		getVertexSpacing: () => SPACING,
		getBuildingGridSize: () => 0.25
	});
}

function makeDefinition(overrides: Partial<FoundationDefinition> = {}): FoundationDefinition {
	return {
		id: 'test-foundation',
		minGridX: -5,
		maxGridX: 5,
		minGridZ: -5,
		maxGridZ: 5,
		topY: 10,
		bottomY: 2,
		...overrides
	};
}

describe('FoundationManager.getTopYAt', () => {
	it('returns null when no foundation covers the point', () => {
		const manager = new FoundationManager(() => SPACING);
		manager.addFoundation(makeDefinition());
		expect(manager.getTopYAt(1000, 1000)).toBeNull();
	});

	it('returns the foundation topY for a point inside its footprint', () => {
		const manager = new FoundationManager(() => SPACING);
		manager.addFoundation(makeDefinition({ topY: 14.27 }));
		expect(manager.getTopYAt(0, 0)).toBeCloseTo(14.27);
	});

	it('respects exact boundary edges without a gap', () => {
		const manager = new FoundationManager(() => SPACING);
		manager.addFoundation(
			makeDefinition({ minGridX: 0, maxGridX: 10, minGridZ: 0, maxGridZ: 10, topY: 5 })
		);
		// minGridX * spacing = 0, maxGridX * spacing = 20 — check both edges land inside.
		expect(manager.getTopYAt(0, 0)).toBe(5);
		expect(manager.getTopYAt(20, 20)).toBe(5);
	});

	it('returns the highest topY when foundations overlap', () => {
		const manager = new FoundationManager(() => SPACING);
		manager.addFoundation(makeDefinition({ id: 'low', topY: 5 }));
		manager.addFoundation(makeDefinition({ id: 'high', topY: 9 }));
		expect(manager.getTopYAt(0, 0)).toBe(9);
	});

	it('no longer reports a removed foundation', () => {
		const manager = new FoundationManager(() => SPACING);
		manager.addFoundation(makeDefinition());
		manager.removeFoundation('test-foundation');
		expect(manager.getTopYAt(0, 0)).toBeNull();
	});
});

describe('FoundationManager serialize/load', () => {
	it('serializes plain data only, and load() reproduces it', () => {
		const manager = new FoundationManager(() => SPACING);
		const definition = makeDefinition();
		manager.addFoundation(definition);

		const serialized = manager.serialize();
		expect(serialized).toEqual([definition]);
		expect(JSON.parse(JSON.stringify(serialized))).toEqual(serialized);

		const other = new FoundationManager(() => SPACING);
		other.load(serialized);
		expect(other.getFoundations()).toEqual([definition]);
	});
});

describe('WorldSurfaceSampler', () => {
	it('returns the terrain height when no foundation covers the point', () => {
		const manager = new FoundationManager(() => SPACING);
		const sampler = new WorldSurfaceSampler(
			{ sample: () => 3.5 } as never,
			manager,
			makeSlabManager(manager)
		);
		expect(sampler.getSupportingSurfaceY(0, 0, Infinity)).toBe(3.5);
	});

	it("returns the foundation's topY when it stands above the terrain", () => {
		const manager = new FoundationManager(() => SPACING);
		manager.addFoundation(makeDefinition({ topY: 12 }));
		const sampler = new WorldSurfaceSampler(
			{ sample: () => 3.5 } as never,
			manager,
			makeSlabManager(manager)
		);
		expect(sampler.getSupportingSurfaceY(0, 0, Infinity)).toBe(12);
	});

	it('falls back to terrain height if the terrain happens to be higher than a nearby foundation elsewhere', () => {
		const manager = new FoundationManager(() => SPACING);
		manager.addFoundation(makeDefinition({ topY: 12 }));
		const sampler = new WorldSurfaceSampler(
			{ sample: () => 3.5 } as never,
			manager,
			makeSlabManager(manager)
		);
		// Outside the foundation footprint entirely.
		expect(sampler.getSupportingSurfaceY(1000, 1000, Infinity)).toBe(3.5);
	});

	it('does not return a surface above referenceY (no teleporting up onto a higher surface)', () => {
		const manager = new FoundationManager(() => SPACING);
		manager.addFoundation(makeDefinition({ topY: 12 }));
		const sampler = new WorldSurfaceSampler(
			{ sample: () => 0 } as never,
			manager,
			makeSlabManager(manager)
		);
		// referenceY (the player's current feet Y) is well below the foundation top — it must not be
		// snapped up onto it, only the terrain height (0) should come back.
		expect(sampler.getSupportingSurfaceY(0, 0, 1)).toBe(0);
	});
});
