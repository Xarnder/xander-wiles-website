import { describe, expect, it } from 'vitest';
import { createDefaultTerrainSettings } from '../../terrain/TerrainSettings';
import { InMemoryWorldRepository } from '../WorldRepository';
import {
	applyContentToWorld,
	captureWorldContent,
	createWorldDefinition,
	sanitizePlayerState
} from '../WorldSerializer';
import { CURRENT_WORLD_SCHEMA_VERSION } from '../WorldTypes';
import { validateWorldDefinition } from '../WorldValidation';
import { defaultEnvironment, richWorld, runtimeFromWorld } from './worldFixtures';

describe('world round trip', () => {
	it('survives capture → save → load with an equivalent definition', async () => {
		const repository = new InMemoryWorldRepository();
		const world = richWorld();
		await repository.saveWorld(world);

		const loaded = await repository.loadWorld(world.id);
		expect(loaded).toEqual(world);
	});

	it('reproduces every authored building type exactly', async () => {
		const repository = new InMemoryWorldRepository();
		const world = richWorld();
		await repository.saveWorld(world);
		const loaded = (await repository.loadWorld(world.id))!;

		const building = loaded.buildings[0];
		expect(loaded.foundations).toEqual(world.foundations);
		expect(building.walls).toEqual(world.buildings[0].walls);
		expect(building.wallPaths).toEqual(world.buildings[0].wallPaths);
		expect(building.slabs).toEqual(world.buildings[0].slabs);
		expect(building.stairs).toEqual(world.buildings[0].stairs);
		expect(building.floorDetails).toEqual(world.buildings[0].floorDetails);
		expect(loaded.buildingLevels).toEqual(world.buildingLevels);
		expect(loaded.furniture).toEqual(world.furniture);
	});

	it('keeps window and door openings, including which wall path segment owns them', async () => {
		const repository = new InMemoryWorldRepository();
		const world = richWorld();
		await repository.saveWorld(world);
		const loaded = (await repository.loadWorld(world.id))!;

		const wallOpenings = loaded.buildings[0].walls[0].openings;
		expect(wallOpenings.map((opening) => opening.type)).toEqual(['window', 'door']);
		expect(loaded.buildings[0].walls[0].beams?.map((beam) => beam.id)).toEqual(['beam-1']);
		expect(loaded.buildings[0].wallPaths[0].segments[0].openings).toHaveLength(1);
		expect(loaded.buildings[0].wallPaths[0].segments[0].beams?.map((beam) => beam.id)).toEqual([
			'beam-2'
		]);
		expect(loaded.buildings[0].wallPaths[0].segments[1].openings).toHaveLength(0);
	});

	it('keeps paint/material assignments on every surface kind that can carry one', async () => {
		const repository = new InMemoryWorldRepository();
		const world = richWorld();
		await repository.saveWorld(world);
		const loaded = (await repository.loadWorld(world.id))!;

		expect(loaded.foundations[0].material).toEqual({ type: 'color', color: '#8a8578' });
		expect(loaded.buildings[0].walls[0].material).toEqual({ type: 'color', color: '#d9d1c3' });
		expect(loaded.buildings[0].wallPaths[0].segments[0].material).toEqual({
			type: 'color',
			color: '#123456'
		});
		expect(loaded.buildings[0].slabs[0].material).toEqual({ type: 'color', color: '#d8d2c4' });
		// An unpainted surface stays unpainted rather than being given a colour on the way through.
		expect(loaded.buildings[0].slabs[1].material).toBeUndefined();
	});

	it('keeps placement colour on a window and a beam', async () => {
		const repository = new InMemoryWorldRepository();
		const world = richWorld();
		world.buildings[0].walls[0].openings[0].material = { type: 'color', color: '#FF00AA' };
		world.buildings[0].walls[0].beams![0].material = { type: 'color', color: '#112233' };
		await repository.saveWorld(world);
		const loaded = (await repository.loadWorld(world.id))!;

		expect(loaded.buildings[0].walls[0].openings[0].material).toEqual({
			type: 'color',
			color: '#FF00AA'
		});
		expect(loaded.buildings[0].walls[0].beams![0].material).toEqual({
			type: 'color',
			color: '#112233'
		});
	});

	it('keeps the stair-owned slab opening linked to the stair that made it', async () => {
		const repository = new InMemoryWorldRepository();
		const world = richWorld();
		await repository.saveWorld(world);
		const loaded = (await repository.loadWorld(world.id))!;

		expect(loaded.buildings[0].slabs[0].openings[0].sourceStairId).toBe('stair-1');
		expect(loaded.buildings[0].stairs[0].id).toBe('stair-1');
	});
});

describe('player state', () => {
	it('survives a round trip at full precision', async () => {
		const repository = new InMemoryWorldRepository();
		const world = richWorld();
		await repository.saveWorld(world);
		const loaded = (await repository.loadWorld(world.id))!;

		expect(loaded.player.position).toEqual({ x: 123.456, y: 18.25, z: -987.654 });
		expect(loaded.player.yaw).toBeCloseTo(1.2345, 10);
		expect(loaded.player.pitch).toBeCloseTo(-0.4321, 10);
		expect(loaded.player.activeFoundationId).toBe('foundation-1');
		expect(loaded.player.currentLevelIndexByFoundation).toEqual({ 'foundation-1': 1 });
	});

	it('falls back to a safe spawn instead of restoring a non-finite position', () => {
		const sanitized = sanitizePlayerState({
			position: { x: Number.NaN, y: Number.POSITIVE_INFINITY, z: 5 },
			yaw: Number.NaN,
			pitch: 0.5
		});
		expect(sanitized.position).toEqual({ x: 0, y: 0, z: 5 });
		expect(sanitized.yaw).toBe(0);
		expect(sanitized.pitch).toBe(0.5);
	});

	it('rejects an absurdly distant position that would strand the player', () => {
		const sanitized = sanitizePlayerState({
			position: { x: 1e12, y: 3, z: -4 },
			yaw: 0,
			pitch: 0
		});
		expect(sanitized.position.x).toBe(0);
		expect(sanitized.position.z).toBe(-4);
	});
});

describe('terrain and environment definition', () => {
	it('stores the seed and generation settings exactly', async () => {
		const repository = new InMemoryWorldRepository();
		const world = richWorld();
		await repository.saveWorld(world);
		const loaded = (await repository.loadWorld(world.id))!;

		expect(loaded.seed).toBe('quiet-valley-042');
		expect(loaded.environment.terrain.seed).toBe('quiet-valley-042');
		expect(loaded.environment.terrain).toEqual(world.environment.terrain);
		expect(loaded.environment.vegetation).toEqual(world.environment.vegetation);
		expect(loaded.environment.sky).toEqual(world.environment.sky);
	});

	it('keeps a world looking like itself after application defaults change', async () => {
		// A world authored when the default height multiplier was 1.0 …
		const repository = new InMemoryWorldRepository();
		const environment = defaultEnvironment();
		environment.terrain.heightMultiplier = 1;
		environment.terrain.baseHeight = 0;
		const world = createWorldDefinition({
			id: 'old-world',
			name: 'Old World',
			seed: 'ancient-ridge-001',
			environment
		});
		await repository.saveWorld(world);

		// … must not start generating different terrain just because a later release ships a
		// different default. This is why generation settings are snapshotted into the world rather
		// than re-derived from createDefault*Settings() at load time.
		const currentDefaults = createDefaultTerrainSettings();
		currentDefaults.heightMultiplier = 3.5;

		const loaded = (await repository.loadWorld('old-world'))!;
		expect(loaded.environment.terrain.heightMultiplier).toBe(1);
		expect(loaded.environment.terrain.heightMultiplier).not.toBe(currentDefaults.heightMultiplier);
	});
});

describe('procedural world', () => {
	it('never writes generated trees into the save — only exceptions to them', () => {
		const world = richWorld();
		const serialized = JSON.stringify(world);

		// The world defines a dense infinite forest, and the save says nothing at all about the trees
		// it produces: only the two that were removed.
		expect(world.proceduralOverrides.removedTreeIds).toEqual(['12:-7', '3:9']);
		expect(Object.keys(world.proceduralOverrides)).toEqual(['removedTreeIds']);
		expect(serialized).not.toContain('treeInstances');
		expect(serialized).not.toContain('instanceMatrix');
		expect(serialized).not.toContain('trunkGeometry');
	});

	it('keeps a fully-explored world small, because terrain and forests are regenerated', () => {
		// An empty world's entire save is its seed plus its generation settings — walking 20km does
		// not add a single byte, because no generated chunk is ever persisted.
		const emptyWorld = createWorldDefinition({
			id: 'empty',
			name: 'Empty',
			seed: 'wide-open-123',
			environment: defaultEnvironment()
		});
		expect(JSON.stringify(emptyWorld).length).toBeLessThan(8 * 1024);
	});

	it('round-trips removed procedural tree ids', async () => {
		const repository = new InMemoryWorldRepository();
		const world = richWorld();
		await repository.saveWorld(world);
		const loaded = (await repository.loadWorld(world.id))!;
		expect(loaded.proceduralOverrides.removedTreeIds).toEqual(['12:-7', '3:9']);
	});
});

describe('captureWorldContent', () => {
	it('captures exactly the mutable world sections and nothing else', () => {
		const runtime = runtimeFromWorld(richWorld());
		const content = captureWorldContent(runtime);
		expect(Object.keys(content).sort()).toEqual(
			[
				'creatures',
				'musicTrees',
				'musicPlants',
				'furniture',
				'buildingLevels',
				'buildings',
				'environment',
				'foundations',
				'player',
				'proceduralOverrides'
			].sort()
		);
	});

	it('snapshots by value, so later live edits cannot mutate an already-captured world', () => {
		const runtime = runtimeFromWorld(richWorld());
		const content = captureWorldContent(runtime);

		runtime.environment.terrain.heightMultiplier = 99;
		runtime.foundations[0].topY = 999;

		expect(content.environment.terrain.heightMultiplier).not.toBe(99);
		expect(content.foundations[0].topY).not.toBe(999);
	});

	it('increments saveRevision and updatedAt on every applied capture, never createdAt or id', () => {
		const world = richWorld();
		const content = captureWorldContent(runtimeFromWorld(world));
		const updated = applyContentToWorld(world, content, '2026-02-02T00:00:00.000Z');

		expect(updated.id).toBe(world.id);
		expect(updated.createdAt).toBe(world.createdAt);
		expect(updated.updatedAt).toBe('2026-02-02T00:00:00.000Z');
		expect(updated.saveRevision).toBe(world.saveRevision + 1);
		expect(updated.schemaVersion).toBe(CURRENT_WORLD_SCHEMA_VERSION);
	});
});

describe('createWorldDefinition', () => {
	it('produces a world that passes validation immediately', () => {
		const world = createWorldDefinition({
			id: 'new-world',
			name: 'New World',
			seed: 'gentle-glade-777',
			environment: defaultEnvironment()
		});
		const result = validateWorldDefinition(world);
		expect(result.ok).toBe(true);
	});

	it('makes the world seed authoritative over the terrain settings copy', () => {
		const environment = defaultEnvironment();
		environment.terrain.seed = 'stale-seed-from-defaults';
		const world = createWorldDefinition({
			id: 'new-world',
			name: 'New World',
			seed: 'chosen-seed-123',
			environment
		});
		expect(world.seed).toBe('chosen-seed-123');
		expect(world.environment.terrain.seed).toBe('chosen-seed-123');
	});
});
