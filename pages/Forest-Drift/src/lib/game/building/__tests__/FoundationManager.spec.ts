import { describe, expect, it } from 'vitest';
import { FoundationManager } from '../FoundationManager';
import type { FoundationDefinition } from '../FoundationTypes';
import { createDefaultBuildingSettings } from '../FoundationTypes';
import { RoofManager } from '../RoofManager';
import { SlabManager } from '../SlabManager';
import { StairManager } from '../StairManager';
import { WorldSurfaceSampler } from '../WorldSurfaceSampler';

const SPACING = 2;

function makeSlabManager(foundationManager: FoundationManager): SlabManager {
	return new SlabManager({
		getFoundation: (id) => foundationManager.getFoundation(id),
		getVertexSpacing: () => SPACING,
		getBuildingGridSize: () => 0.25
	});
}

function makeStairManager(foundationManager: FoundationManager): StairManager {
	return new StairManager({
		getFoundation: (id) => foundationManager.getFoundation(id),
		getVertexSpacing: () => SPACING
	});
}

function makeRoofManager(foundationManager: FoundationManager): RoofManager {
	return new RoofManager({
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
			makeSlabManager(manager),
			makeStairManager(manager),
			makeRoofManager(manager),
			() => 0.3
		);
		expect(sampler.getSupportingSurfaceY(0, 0, Infinity)).toBe(3.5);
	});

	it("returns the foundation's topY when it stands above the terrain", () => {
		const manager = new FoundationManager(() => SPACING);
		manager.addFoundation(makeDefinition({ topY: 12 }));
		const sampler = new WorldSurfaceSampler(
			{ sample: () => 3.5 } as never,
			manager,
			makeSlabManager(manager),
			makeStairManager(manager),
			makeRoofManager(manager),
			() => 0.3
		);
		expect(sampler.getSupportingSurfaceY(0, 0, Infinity)).toBe(12);
	});

	it('falls back to terrain height if the terrain happens to be higher than a nearby foundation elsewhere', () => {
		const manager = new FoundationManager(() => SPACING);
		manager.addFoundation(makeDefinition({ topY: 12 }));
		const sampler = new WorldSurfaceSampler(
			{ sample: () => 3.5 } as never,
			manager,
			makeSlabManager(manager),
			makeStairManager(manager),
			makeRoofManager(manager),
			() => 0.3
		);
		// Outside the foundation footprint entirely.
		expect(sampler.getSupportingSurfaceY(1000, 1000, Infinity)).toBe(3.5);
	});

	it('regression: DOES return a foundation top well above referenceY — unlike slabs, a foundation is never something a player can be standing underneath, so it must always be climbable up to directly, exactly like walking up to a raised platform or a kerb', () => {
		// A foundation levels out to the site's *highest* terrain point, so its edge is very often
		// several metres above the surrounding ground it was built on — restricting it the same way
		// slabs are restricted (an earlier bug) meant walking up to a foundation from lower ground
		// could silently fail, leaving the player clipped through it at the wrong height, which then
		// threw off everything measured relative to that foundation (stairs included, since their
		// baseY is foundation-local).
		const manager = new FoundationManager(() => SPACING);
		manager.addFoundation(makeDefinition({ topY: 12 }));
		const sampler = new WorldSurfaceSampler(
			{ sample: () => 0 } as never,
			manager,
			makeSlabManager(manager),
			makeStairManager(manager),
			makeRoofManager(manager),
			() => 0.3
		);
		// referenceY (the player's current feet Y, from much lower ground) is well below the
		// foundation top — it must still be returned, not the terrain height (0).
		expect(sampler.getSupportingSurfaceY(0, 0, 1)).toBe(12);
	});
});

describe('FoundationManager edge framing', () => {
	function findByName(
		root: { traverse: (fn: (child: { name: string }) => void) => void },
		name: string
	): { name: string } | undefined {
		let found: { name: string } | undefined;
		root.traverse((child) => {
			if (!found && child.name === name) found = child;
		});
		return found;
	}

	it('adds wall-style timber as a sibling of the cuboid, not a raycast target', () => {
		const manager = new FoundationManager(() => SPACING);
		manager.addFoundation(makeDefinition());
		expect(findByName(manager.group, 'foundation-frame')).toBeDefined();
		expect(findByName(manager.group, 'wall-frame-solid')).toBeDefined();
		const meshes = manager.getMeshes();
		expect(meshes).toHaveLength(1);
		expect(findByName(meshes[0], 'foundation-frame')).toBeUndefined();
	});

	it('drops framing when the shared wall-frame setting is turned off', () => {
		const settings = createDefaultBuildingSettings();
		const manager = new FoundationManager(() => SPACING, undefined, settings);
		manager.addFoundation(makeDefinition());
		expect(findByName(manager.group, 'foundation-frame')).toBeDefined();

		settings.wallFrameEnabled = false;
		manager.rebuildAllFrames();
		expect(findByName(manager.group, 'foundation-frame')).toBeUndefined();
	});

	it('removes framing with the foundation', () => {
		const manager = new FoundationManager(() => SPACING);
		manager.addFoundation(makeDefinition());
		expect(findByName(manager.group, 'foundation-frame')).toBeDefined();
		manager.removeFoundation('test-foundation');
		expect(findByName(manager.group, 'foundation-frame')).toBeUndefined();
		expect(manager.group.children).toHaveLength(0);
	});
});
