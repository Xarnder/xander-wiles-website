import { unzipSync, zipSync } from 'fflate';
import { migrateWorld } from './WorldMigrationManager';
import { APPLICATION_VERSION, type WorldDefinition } from './WorldTypes';
import { IMPORT_LIMITS, validateWorldDefinition } from './WorldValidation';

/** Custom rather than `.json`, so a world file reads as a game artifact people can double-click rather than a text file they're tempted to hand-edit. */
export const WORLD_FILE_EXTENSION = '.forestworld';
export const WORLD_PACKAGE_FORMAT = 'forest-drift-world';
export const WORLD_PACKAGE_FORMAT_VERSION = 1;

/**
 * Provenance and integrity, kept *outside* the compressed world payload so it can be read and
 * checked before anything large is decompressed or parsed.
 *
 * `checksum` guards against accidental corruption (a truncated download, a mangled file transfer),
 * not tampering — this is deliberately not a signature, and the importer treats every file as
 * untrusted regardless of whether the checksum matches.
 */
export interface WorldPackageManifest {
	format: string;
	formatVersion: number;
	schemaVersion: number;
	worldId: string;
	worldName: string;
	createdAt: string;
	exportedAt: string;
	applicationVersion: string;
	/** FNV-1a over the exact `world.json` bytes. */
	checksum: string;
}

export interface WorldPackage {
	manifest: WorldPackageManifest;
	world: WorldDefinition;
	thumbnail?: Blob;
}

export type ImportResult =
	| { ok: true; world: WorldDefinition; thumbnail?: Blob; manifest: WorldPackageManifest }
	| { ok: false; error: string };

const MANIFEST_ENTRY = 'manifest.json';
const WORLD_ENTRY = 'world.json';
const THUMBNAIL_ENTRY = 'thumbnail.webp';

/**
 * A small, fast, non-cryptographic hash. Worlds are JSON, so this runs over tens of kilobytes in
 * well under a millisecond; the goal is "did these bytes survive the round trip", which does not
 * need (and should not imply) cryptographic strength.
 */
export function checksumBytes(bytes: Uint8Array): string {
	let hash = 0x811c9dc5;
	for (let i = 0; i < bytes.length; i++) {
		hash ^= bytes[i];
		hash = Math.imul(hash, 0x01000193) >>> 0;
	}
	return hash.toString(16).padStart(8, '0');
}

/**
 * Builds the portable package: a ZIP holding a manifest, the world JSON, and (optionally) the
 * thumbnail. Deflate is used because logical building JSON is extremely repetitive and compresses
 * roughly an order of magnitude; the thumbnail is stored uncompressed since WebP/JPEG bytes are
 * already compressed and re-deflating them only costs CPU.
 *
 * Entirely local — no backend is involved in exporting or importing a world.
 */
export async function createWorldPackage(
	world: WorldDefinition,
	thumbnail?: Blob | null,
	now: string = new Date().toISOString()
): Promise<Uint8Array> {
	const worldBytes = new TextEncoder().encode(JSON.stringify(world));
	const manifest: WorldPackageManifest = {
		format: WORLD_PACKAGE_FORMAT,
		formatVersion: WORLD_PACKAGE_FORMAT_VERSION,
		schemaVersion: world.schemaVersion,
		worldId: world.id,
		worldName: world.name,
		createdAt: world.createdAt,
		exportedAt: now,
		applicationVersion: APPLICATION_VERSION,
		checksum: checksumBytes(worldBytes)
	};

	const entries: Record<string, [Uint8Array, { level?: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 }]> = {
		[MANIFEST_ENTRY]: [new TextEncoder().encode(JSON.stringify(manifest, null, 2)), { level: 6 }],
		[WORLD_ENTRY]: [worldBytes, { level: 6 }]
	};
	if (thumbnail) {
		entries[THUMBNAIL_ENTRY] = [new Uint8Array(await thumbnail.arrayBuffer()), { level: 0 }];
	}

	return zipSync(entries);
}

/**
 * Reads a package back. Every step assumes hostile input: the archive may not be a ZIP, the manifest
 * may be missing or claim a format this build doesn't understand, the world may be from a newer
 * schema, and the world JSON may describe five hundred million walls. Nothing is instantiated — and
 * no Three.js geometry is built — until all of that has been checked.
 */
export function readWorldPackage(bytes: Uint8Array): ImportResult {
	if (bytes.byteLength > IMPORT_LIMITS.packageBytes) {
		return { ok: false, error: 'This world file is too large to import.' };
	}

	let files: Record<string, Uint8Array>;
	try {
		files = unzipSync(bytes);
	} catch {
		return { ok: false, error: 'This file is not a valid world package.' };
	}

	const manifestBytes = files[MANIFEST_ENTRY];
	const worldBytes = files[WORLD_ENTRY];
	if (!manifestBytes || !worldBytes) {
		return { ok: false, error: 'This world file is missing required data.' };
	}
	if (worldBytes.byteLength > IMPORT_LIMITS.worldJsonBytes) {
		return { ok: false, error: 'This world file is too large to import.' };
	}

	let manifest: WorldPackageManifest;
	try {
		manifest = JSON.parse(new TextDecoder().decode(manifestBytes)) as WorldPackageManifest;
	} catch {
		return { ok: false, error: 'This world file has an unreadable manifest.' };
	}
	if (manifest?.format !== WORLD_PACKAGE_FORMAT) {
		return { ok: false, error: 'This file was not exported by Forest Drift.' };
	}
	if (
		typeof manifest.formatVersion !== 'number' ||
		manifest.formatVersion > WORLD_PACKAGE_FORMAT_VERSION
	) {
		return {
			ok: false,
			error:
				'This world was exported by a newer version of the game. Please update the game before importing it.'
		};
	}

	if (typeof manifest.checksum === 'string' && checksumBytes(worldBytes) !== manifest.checksum) {
		return { ok: false, error: 'This world file appears to be corrupted (checksum mismatch).' };
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(new TextDecoder().decode(worldBytes));
	} catch {
		return { ok: false, error: 'This world file contains invalid world data.' };
	}

	// Migrate first, then validate: migrations own backwards compatibility, validation owns "is this
	// actually loadable", and keeping them in that order means validation only ever sees the current
	// schema and never has to know what old worlds looked like.
	const migrated = migrateWorld(parsed);
	if (!migrated.ok) return { ok: false, error: migrated.error };

	const validated = validateWorldDefinition(migrated.value);
	if (!validated.ok) {
		return { ok: false, error: `This world file is invalid: ${validated.error}` };
	}

	const thumbnailBytes = files[THUMBNAIL_ENTRY];
	const thumbnail =
		thumbnailBytes && thumbnailBytes.byteLength > 0
			? new Blob([thumbnailBytes as BlobPart], { type: 'image/webp' })
			: undefined;

	return { ok: true, world: validated.value, thumbnail, manifest };
}

/** Keeps exported filenames safe across platforms without mangling ordinary names into unreadable slugs. */
export function worldFileName(worldName: string): string {
	const safe = worldName
		.replace(/[/\\?%*:|"<>]/g, '-')
		.replace(/\s+/g, ' ')
		.trim()
		.slice(0, 60);
	return `${safe.length > 0 ? safe : 'World'}${WORLD_FILE_EXTENSION}`;
}

/** Triggers a browser download of an exported package. Split out so the export pipeline itself stays testable in a non-DOM environment. */
export function downloadWorldPackage(bytes: Uint8Array, fileName: string): void {
	const blob = new Blob([bytes as BlobPart], { type: 'application/zip' });
	const url = URL.createObjectURL(blob);
	const anchor = document.createElement('a');
	anchor.href = url;
	anchor.download = fileName;
	document.body.appendChild(anchor);
	anchor.click();
	anchor.remove();
	// Revoked on a later task so the download has definitely started first.
	setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
