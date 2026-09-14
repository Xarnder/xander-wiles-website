import { unzipSync, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import {
	checksumBytes,
	createWorldPackage,
	readWorldPackage,
	WORLD_FILE_EXTENSION,
	WORLD_PACKAGE_FORMAT,
	worldFileName
} from '../WorldImportExport';
import { CURRENT_WORLD_SCHEMA_VERSION } from '../WorldTypes';
import { richWorld } from './worldFixtures';

const encoder = new TextEncoder();

describe('package round trip', () => {
	it('exports and re-imports a world unchanged', async () => {
		const world = richWorld();
		const bytes = await createWorldPackage(world);
		const result = readWorldPackage(bytes);

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.world).toEqual(world);
	});

	it('carries every Mini Build design and instance, with no external library or compiled data', async () => {
		const world = richWorld();
		const bytes = await createWorldPackage(world);
		const result = readWorldPackage(bytes);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.world.miniBuilds.definitions.map((d) => d.id)).toEqual(['mb-chair', 'mb-table']);
		expect(result.world.miniBuilds.instances).toEqual(world.miniBuilds.instances);
		expect(result.world.miniBuilds.definitions[1].revision).toBe(3);
		const json = new TextDecoder().decode(unzipSync(bytes)['world.json']);
		expect(json).not.toMatch(/positions|BufferGeometry|InstancedMesh|normals/);
	});

	it('rejects an imported world whose Mini Build exceeds the 16-block limit', async () => {
		const world = richWorld();
		const chair = world.miniBuilds.definitions[0];
		chair.blocks = Array.from({ length: 17 }, (_, i) => ({
			...chair.blocks[0],
			id: `x${i}`,
			positionGrid: { x: i, y: 0, z: 0 }
		}));
		const result = readWorldPackage(await createWorldPackage(world));
		expect(result.ok).toBe(false);
	});

	it('includes a manifest with provenance and a checksum', async () => {
		const world = richWorld();
		const result = readWorldPackage(await createWorldPackage(world));
		expect(result.ok).toBe(true);
		if (!result.ok) return;

		expect(result.manifest.format).toBe(WORLD_PACKAGE_FORMAT);
		expect(result.manifest.worldId).toBe(world.id);
		expect(result.manifest.worldName).toBe(world.name);
		expect(result.manifest.schemaVersion).toBe(CURRENT_WORLD_SCHEMA_VERSION);
		expect(result.manifest.checksum).toMatch(/^[0-9a-f]{8}$/);
		expect(result.manifest.applicationVersion.length).toBeGreaterThan(0);
	});

	it('carries the thumbnail through', async () => {
		const bytes = await createWorldPackage(
			richWorld(),
			new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'image/webp' })
		);
		const result = readWorldPackage(bytes);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.thumbnail).toBeDefined();
		expect(await result.thumbnail!.arrayBuffer()).toHaveProperty('byteLength', 4);
	});

	it('compresses the repetitive building JSON substantially', async () => {
		// Many similar walls: exactly the shape real building data takes, and exactly where deflate
		// earns its place in the export path.
		const world = richWorld();
		const wall = world.buildings[0].walls[0];
		world.buildings[0].walls = Array.from({ length: 400 }, (_, i) => ({
			...wall,
			id: `wall-${i}`
		}));

		const raw = encoder.encode(JSON.stringify(world)).byteLength;
		const packaged = (await createWorldPackage(world)).byteLength;
		expect(packaged).toBeLessThan(raw / 4);
	});

	it('contains only the three expected entries — never a chunk or geometry cache', async () => {
		const bytes = await createWorldPackage(richWorld(), new Blob(['thumb']));
		expect(Object.keys(unzipSync(bytes)).sort()).toEqual([
			'manifest.json',
			'thumbnail.webp',
			'world.json'
		]);
	});
});

describe('rejecting bad input', () => {
	it('rejects bytes that are not an archive at all', () => {
		const result = readWorldPackage(new Uint8Array([0, 1, 2, 3]));
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.error).toMatch(/not a valid world package/i);
	});

	it('rejects an archive missing the world payload', () => {
		const bytes = zipSync({ 'manifest.json': encoder.encode('{}') });
		const result = readWorldPackage(bytes);
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.error).toMatch(/missing required data/i);
	});

	it('rejects a package from another application', () => {
		const world = richWorld();
		const bytes = zipSync({
			'manifest.json': encoder.encode(
				JSON.stringify({ format: 'some-other-game', formatVersion: 1 })
			),
			'world.json': encoder.encode(JSON.stringify(world))
		});
		const result = readWorldPackage(bytes);
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.error).toMatch(/not exported by forest drift/i);
	});

	it('rejects a package format from a newer build', () => {
		const bytes = zipSync({
			'manifest.json': encoder.encode(
				JSON.stringify({ format: WORLD_PACKAGE_FORMAT, formatVersion: 99 })
			),
			'world.json': encoder.encode(JSON.stringify(richWorld()))
		});
		const result = readWorldPackage(bytes);
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.error).toMatch(/newer version of the game/i);
	});

	it('detects corruption via the checksum', async () => {
		const world = richWorld();
		const worldBytes = encoder.encode(JSON.stringify(world));
		const bytes = zipSync({
			'manifest.json': encoder.encode(
				JSON.stringify({
					format: WORLD_PACKAGE_FORMAT,
					formatVersion: 1,
					checksum: 'deadbeef'
				})
			),
			'world.json': worldBytes
		});
		const result = readWorldPackage(bytes);
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.error).toMatch(/corrupted/i);
	});

	it('rejects a world payload that is valid JSON but structurally invalid', () => {
		const broken = richWorld();
		broken.buildings[0].walls[0].foundationId = 'ghost';
		const worldBytes = encoder.encode(JSON.stringify(broken));
		const bytes = zipSync({
			'manifest.json': encoder.encode(
				JSON.stringify({
					format: WORLD_PACKAGE_FORMAT,
					formatVersion: 1,
					checksum: checksumBytes(worldBytes)
				})
			),
			'world.json': worldBytes
		});
		const result = readWorldPackage(bytes);
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.error).toMatch(/invalid/i);
	});

	it('rejects a world from a newer schema with an actionable message', () => {
		const future = { ...richWorld(), schemaVersion: CURRENT_WORLD_SCHEMA_VERSION + 1 };
		const worldBytes = encoder.encode(JSON.stringify(future));
		const bytes = zipSync({
			'manifest.json': encoder.encode(
				JSON.stringify({
					format: WORLD_PACKAGE_FORMAT,
					formatVersion: 1,
					checksum: checksumBytes(worldBytes)
				})
			),
			'world.json': worldBytes
		});
		const result = readWorldPackage(bytes);
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.error).toMatch(/newer version of the game/i);
	});

	it('refuses an oversized package before decompressing it', () => {
		// A zip bomb's compressed size is the first thing that can be checked, so it is.
		const huge = new Uint8Array(33 * 1024 * 1024);
		const result = readWorldPackage(huge);
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.error).toMatch(/too large/i);
	});
});

describe('checksumBytes', () => {
	it('is stable for identical bytes and differs for changed ones', () => {
		const a = encoder.encode('{"a":1}');
		const b = encoder.encode('{"a":2}');
		expect(checksumBytes(a)).toBe(checksumBytes(encoder.encode('{"a":1}')));
		expect(checksumBytes(a)).not.toBe(checksumBytes(b));
	});
});

describe('worldFileName', () => {
	it('uses the world name with the custom extension', () => {
		expect(worldFileName('Forest House')).toBe(`Forest House${WORLD_FILE_EXTENSION}`);
	});

	it('strips characters that are unsafe in filenames', () => {
		expect(worldFileName('a/b\\c:d*e?f"g<h>i|j')).not.toMatch(/[/\\?%*:|"<>]/);
	});

	it('falls back to a usable name when the world name is only unsafe characters', () => {
		expect(worldFileName('///')).toBe(`---${WORLD_FILE_EXTENSION}`);
		expect(worldFileName('   ')).toBe(`World${WORLD_FILE_EXTENSION}`);
	});
});
