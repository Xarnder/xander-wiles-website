import { describe, expect, it } from 'vitest';
import { CURRENT_WORLD_SCHEMA_VERSION } from '../WorldTypes';
import { IMPORT_LIMITS, validateWorldDefinition } from '../WorldValidation';
import { richWorld } from './worldFixtures';

function expectRejected(world: unknown, matching?: RegExp) {
	const result = validateWorldDefinition(world);
	expect(result.ok).toBe(false);
	if (result.ok) return;
	if (matching) expect(result.error).toMatch(matching);
}

describe('validateWorldDefinition', () => {
	it('accepts a complete, internally consistent world', () => {
		expect(validateWorldDefinition(richWorld()).ok).toBe(true);
	});

	it('rejects a schema version it does not understand', () => {
		expectRejected({ ...richWorld(), schemaVersion: CURRENT_WORLD_SCHEMA_VERSION + 5 }, /schema/i);
	});

	it('rejects missing identity or seed', () => {
		expectRejected({ ...richWorld(), id: '' }, /id/i);
		expectRejected({ ...richWorld(), seed: '' }, /seed/i);
	});
});

describe('numeric safety', () => {
	it('rejects non-finite geometry, which would otherwise produce NaN meshes', () => {
		const world = richWorld();
		world.foundations[0].topY = Number.NaN;
		expectRejected(world, /finite/i);
	});

	it('rejects a non-finite player position', () => {
		const world = richWorld();
		world.player.position.x = Number.POSITIVE_INFINITY;
		expectRejected(world, /finite/i);
	});

	it('rejects a zero or negative terrain chunk size', () => {
		const world = richWorld();
		world.environment.terrain.chunkSize = 0;
		expectRejected(world, /positive/i);
	});

	it('rejects a stair whose creation grid size is not positive, which would divide by zero', () => {
		const world = richWorld();
		world.buildings[0].stairs[0].gridSizeAtCreation = 0;
		expectRejected(world, /gridSizeAtCreation/);
	});
});

describe('enum and material safety', () => {
	it('rejects an unknown opening type', () => {
		const world = richWorld();
		(world.buildings[0].walls[0].openings[0] as { type: string }).type = 'portal';
		expectRejected(world, /opening type/i);
	});

	it('rejects an unknown slab type', () => {
		const world = richWorld();
		(world.buildings[0].slabs[0] as { type: string }).type = 'trapdoor';
		expectRejected(world, /slab type/i);
	});

	it('rejects an unknown stair direction', () => {
		const world = richWorld();
		(world.buildings[0].stairs[0] as { direction: string }).direction = 'up';
		expectRejected(world, /stair direction/i);
	});

	it('rejects an unknown roof type', () => {
		const world = richWorld();
		(world.buildings[0].roofs[0] as { type: string }).type = 'onion-dome';
		expectRejected(world, /roof type/i);
	});

	it('rejects a non-finite roof rise', () => {
		const world = richWorld();
		world.buildings[0].roofs[0].rise = Number.NaN;
		expectRejected(world, /finite/i);
	});

	it('rejects a colour that is not a colour, rather than handing it to THREE.Color', () => {
		const world = richWorld();
		world.buildings[0].walls[0].material = {
			type: 'color',
			color: 'javascript:alert(1)'
		} as never;
		expectRejected(world, /colour/i);
	});

	it('accepts both #rgb and #rrggbb forms', () => {
		const world = richWorld();
		world.buildings[0].walls[0].material = { type: 'color', color: '#abc' };
		expect(validateWorldDefinition(world).ok).toBe(true);
	});
});

describe('relationship integrity', () => {
	it('rejects a wall whose foundation is not in the file', () => {
		const world = richWorld();
		world.buildings[0].walls[0].foundationId = 'ghost-foundation';
		expectRejected(world, /unknown foundation/i);
	});

	it('rejects a building level attached to a missing foundation', () => {
		const world = richWorld();
		world.buildingLevels[0].foundationId = 'ghost-foundation';
		expectRejected(world, /unknown foundation/i);
	});

	it('rejects a saved active foundation the world does not contain', () => {
		const world = richWorld();
		world.player.activeFoundationId = 'ghost-foundation';
		expectRejected(world, /active foundation/i);
	});

	it('rejects duplicate foundation ids', () => {
		const world = richWorld();
		world.foundations.push({ ...world.foundations[0] });
		expectRejected(world, /duplicate/i);
	});

	it('tolerates a slab opening whose owning stair is gone — a cosmetic leftover, not corruption', () => {
		const world = richWorld();
		world.buildings[0].stairs = [];
		expect(validateWorldDefinition(world).ok).toBe(true);
	});
});

describe('malicious or corrupt size guards', () => {
	it('rejects a file declaring an impossible number of foundations before building any geometry', () => {
		const world = richWorld();
		world.foundations = Array.from({ length: IMPORT_LIMITS.foundations + 1 }, (_, index) => ({
			...richWorld().foundations[0],
			id: `f-${index}`
		}));
		expectRejected(world, /too many foundations/i);
	});

	it('rejects an absurd wall count on a single foundation', () => {
		const world = richWorld();
		const wall = world.buildings[0].walls[0];
		world.buildings[0].walls = Array.from(
			{ length: IMPORT_LIMITS.wallsPerFoundation + 1 },
			(_, i) => ({
				...wall,
				id: `w-${i}`
			})
		);
		expectRejected(world, /too many walls/i);
	});

	it('rejects an absurd roof count on a single foundation', () => {
		const world = richWorld();
		const roof = world.buildings[0].roofs[0];
		world.buildings[0].roofs = Array.from(
			{ length: IMPORT_LIMITS.roofsPerFoundation + 1 },
			(_, i) => ({
				...roof,
				id: `r-${i}`
			})
		);
		expectRejected(world, /too many roofs/i);
	});

	it('rejects an absurd wall-path point count', () => {
		const world = richWorld();
		world.buildings[0].wallPaths[0].points = Array.from(
			{ length: IMPORT_LIMITS.pointsPerWallPath + 1 },
			() => ({ gridX: 0, gridZ: 0 })
		);
		expectRejected(world, /too many points/i);
	});

	it('rejects an absurd number of procedural overrides', () => {
		const world = richWorld();
		world.proceduralOverrides.removedTreeIds = Array.from(
			{ length: IMPORT_LIMITS.removedTreeIds + 1 },
			(_, i) => `${i}:0`
		);
		expectRejected(world, /too many procedural overrides/i);
	});

	it('rejects procedural override entries that are not ids', () => {
		const world = richWorld();
		world.proceduralOverrides.removedTreeIds = [42 as never];
		expectRejected(world, /removedTreeIds/);
	});
});
