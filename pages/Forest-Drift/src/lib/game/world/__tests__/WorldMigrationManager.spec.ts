import { describe, expect, it } from 'vitest';
import { migrateWorld } from '../WorldMigrationManager';
import { CURRENT_WORLD_SCHEMA_VERSION } from '../WorldTypes';
import { validateWorldDefinition } from '../WorldValidation';
import { richWorld } from './worldFixtures';

describe('migrateWorld', () => {
	it('passes a current-schema world straight through', () => {
		const world = richWorld();
		const result = migrateWorld(world);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.migrated).toBe(false);
		expect(result.value.schemaVersion).toBe(CURRENT_WORLD_SCHEMA_VERSION);
	});

	it('rejects a world from a newer schema rather than guessing at its shape', () => {
		const future = { ...richWorld(), schemaVersion: CURRENT_WORLD_SCHEMA_VERSION + 1 };
		const result = migrateWorld(future);
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.reason).toBe('newer-schema');
		// The message has to tell the player what to actually do about it.
		expect(result.error).toContain('newer version of the game');
	});

	it('rejects data with no usable schema version', () => {
		expect(migrateWorld({ ...richWorld(), schemaVersion: undefined }).ok).toBe(false);
		expect(migrateWorld({ ...richWorld(), schemaVersion: 'one' }).ok).toBe(false);
		expect(migrateWorld({ ...richWorld(), schemaVersion: 0 }).ok).toBe(false);
	});

	it('rejects non-object input', () => {
		expect(migrateWorld(null).ok).toBe(false);
		expect(migrateWorld('a world').ok).toBe(false);
		expect(migrateWorld([richWorld()]).ok).toBe(false);
	});

	it('does not mutate the input world', () => {
		const world = richWorld();
		const before = JSON.stringify(world);
		migrateWorld(world);
		expect(JSON.stringify(world)).toBe(before);
	});

	it('adds an empty furniture list when migrating schema 5 worlds', () => {
		const old = { ...richWorld(), schemaVersion: 5 };
		delete (old as { furniture?: unknown }).furniture;
		const result = migrateWorld(old);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.migrated).toBe(true);
		expect(result.value.schemaVersion).toBe(CURRENT_WORLD_SCHEMA_VERSION);
		expect(result.value.furniture).toEqual([]);
		expect(validateWorldDefinition(result.value).ok).toBe(true);
	});

	it('adds empty Mini Builds to schema 6 worlds without touching existing furniture', () => {
		const world = richWorld();
		const old = { ...world, schemaVersion: 6 };
		delete (old as { miniBuilds?: unknown }).miniBuilds;
		const result = migrateWorld(old);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.fromVersion).toBe(6);
		expect(result.value.miniBuilds).toEqual({ definitions: [], instances: [] });
		expect(result.value.furniture).toEqual(world.furniture);
		expect(validateWorldDefinition(result.value).ok).toBe(true);
	});

	it('produces a world that still passes validation after migrating', () => {
		const result = migrateWorld(richWorld());
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(validateWorldDefinition(result.value).ok).toBe(true);
	});

	it('reports an unreachable schema version instead of loading it partially', () => {
		// Simulates a save written by a build whose migration step was never shipped here: version 0
		// is below the floor, and any gap in the chain must fail loudly rather than load half-migrated
		// data into the building managers.
		const orphan = { ...richWorld(), schemaVersion: -1 };
		const result = migrateWorld(orphan);
		expect(result.ok).toBe(false);
	});
});
