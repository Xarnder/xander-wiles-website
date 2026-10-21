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

function rewritePackage(
	bytes: Uint8Array,
	edit: (files: Record<string, Uint8Array>) => void
): Uint8Array {
	const files = unzipSync(bytes);
	edit(files);
	return zipSync(files);
}

describe('bounded extraction and integrity', () => {
	it.each(['manifest.json', 'world.json', 'thumbnail.webp'])(
		'checks %s declared size before decompression',
		async (name) => {
			const bytes = await createWorldPackage(richWorld(), new Blob(['thumbnail']));
			// Change only the central-directory uncompressed size: no giant allocation is needed
			// to prove the importer rejects an archive claiming to expand to 2 GiB.
			const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
			for (let i = 0; i + 46 <= bytes.length; i++) {
				if (view.getUint32(i, true) !== 0x02014b50) continue;
				const length = view.getUint16(i + 28, true);
				if (new TextDecoder().decode(bytes.subarray(i + 46, i + 46 + length)) === name) {
					view.setUint32(i + 24, 0x7fffffff, true);
					break;
				}
			}
			const result = readWorldPackage(bytes);
			expect(result.ok).toBe(false);
			if (!result.ok) expect(result.error).toMatch(/too large/i);
		}
	);

	it('skips unrecognized archive entries rather than expanding them', async () => {
		const bytes = rewritePackage(await createWorldPackage(richWorld()), (files) => {
			files['unused.bin'] = new Uint8Array(1024);
		});
		const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
		for (let i = 0; i + 46 <= bytes.length; i++) {
			if (view.getUint32(i, true) !== 0x02014b50) continue;
			const length = view.getUint16(i + 28, true);
			if (new TextDecoder().decode(bytes.subarray(i + 46, i + 46 + length)) === 'unused.bin')
				view.setUint32(i + 24, 0x7fffffff, true);
		}
		expect(readWorldPackage(bytes).ok).toBe(true);
	});

	it.each([undefined, 123, 'not-a-checksum'])(
		'requires a valid checksum (%s)',
		async (checksum) => {
			const bytes = rewritePackage(await createWorldPackage(richWorld()), (files) => {
				const manifest = JSON.parse(new TextDecoder().decode(files['manifest.json']));
				manifest.checksum = checksum;
				files['manifest.json'] = encoder.encode(JSON.stringify(manifest));
			});
			expect(readWorldPackage(bytes).ok).toBe(false);
		}
	);

	it.each([0, -1, 1.5, '1', null])('rejects invalid package version %s', async (version) => {
		const bytes = rewritePackage(await createWorldPackage(richWorld()), (files) => {
			const manifest = JSON.parse(new TextDecoder().decode(files['manifest.json']));
			manifest.formatVersion = version;
			files['manifest.json'] = encoder.encode(JSON.stringify(manifest));
		});
		expect(readWorldPackage(bytes).ok).toBe(false);
	});

	it('rejects manifest identity mismatches', async () => {
		const bytes = rewritePackage(await createWorldPackage(richWorld()), (files) => {
			const manifest = JSON.parse(new TextDecoder().decode(files['manifest.json']));
			manifest.worldId = 'another-world';
			files['manifest.json'] = encoder.encode(JSON.stringify(manifest));
		});
		expect(readWorldPackage(bytes).ok).toBe(false);
	});

	it.each([
		null,
		[],
		{},
		{ schemaVersion: 1, buildings: [null] },
		{ schemaVersion: 9, musicTrees: [null] }
	])('returns a failure instead of throwing for malformed payload %j', async (payload) => {
		const bytes = rewritePackage(await createWorldPackage(richWorld()), (files) => {
			files['world.json'] = encoder.encode(JSON.stringify(payload));
			files['manifest.json'] = encoder.encode(
				JSON.stringify({
					format: WORLD_PACKAGE_FORMAT,
					formatVersion: 1,
					checksum: checksumBytes(files['world.json'])
				})
			);
		});
		expect(() => readWorldPackage(bytes)).not.toThrow();
		expect(readWorldPackage(bytes).ok).toBe(false);
	});

	it('removes control characters from exported filenames', () => {
		expect(worldFileName('My\u0000World\n')).toBe(`MyWorld${WORLD_FILE_EXTENSION}`);
	});
});

describe('complete authored content', () => {
	it('preserves buildings, openings, door styles, shutters, pillars, music, creatures, Mini Builds, sky and player state', async () => {
		const { exportAuditWorld } = await import('./exportAuditFixture');
		const world = exportAuditWorld();
		const bytes = await createWorldPackage(world);
		const result = readWorldPackage(bytes);
		expect(result.ok, result.ok ? undefined : result.error).toBe(true);
		if (result.ok) expect(result.world).toEqual(world);
	});
});

it('rejects duplicate required entries instead of accepting whichever appears last', async () => {
	const bytes = rewritePackage(await createWorldPackage(richWorld()), (files) => {
		files['spare.json'] = files['world.json'];
	});
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	for (let i = 0; i + 46 <= bytes.length; i++) {
		if (view.getUint32(i, true) !== 0x02014b50) continue;
		const length = view.getUint16(i + 28, true);
		if (new TextDecoder().decode(bytes.subarray(i + 46, i + 46 + length)) === 'spare.json')
			bytes.set(encoder.encode('world.json'), i + 46);
	}
	expect(readWorldPackage(bytes).ok).toBe(false);
});

it('refuses to produce a package whose metadata cannot be imported', async () => {
	const world = richWorld({ name: 'x'.repeat(70_000) });
	await expect(createWorldPackage(world)).rejects.toThrow(/metadata.*too large/i);
});
