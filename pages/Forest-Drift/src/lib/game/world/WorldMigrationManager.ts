import { CURRENT_WORLD_SCHEMA_VERSION } from './WorldTypes';

export type MigrationResult =
	| { ok: true; value: Record<string, unknown>; migrated: boolean; fromVersion: number }
	| { ok: false; error: string; reason: 'newer-schema' | 'unreadable' };

/**
 * One step from schema version N to N+1, operating on a plain object rather than a typed
 * `WorldDefinition`. That's deliberate: a migration's *input* is an old shape that no longer has a
 * TypeScript type in the codebase (the type always describes the current schema), so typing the
 * input would either require freezing every historical interface forever or lying about the shape.
 */
type MigrationStep = (world: Record<string, unknown>) => Record<string, unknown>;

/**
 * Sequential schema migrations, keyed by the version they upgrade *from*.
 *
 * Adding a schema change means: bump CURRENT_WORLD_SCHEMA_VERSION, add the step here keyed by the
 * previous version, and add a fixture test that migrates an old world forward. Nothing else in the
 * codebase should branch on schema version — the runtime managers only ever see current-schema data,
 * which is why migration lives here and not scattered through the building managers.
 *
 * Empty today because v1 is the first schema. It exists anyway, and is exercised by tests, so the
 * first real migration is a one-line addition rather than a retrofit.
 */
const MIGRATIONS: Record<number, MigrationStep> = {
	// Example of the intended shape, for whoever adds v2:
	// 1: (world) => ({ ...world, schemaVersion: 2, newField: defaultValue })
};

/**
 * Brings a stored/imported world up to the current schema, in memory.
 *
 * A world from a *newer* schema than this build understands is rejected outright rather than
 * guessed at — silently dropping fields it doesn't recognise would quietly corrupt someone's world
 * the moment they opened it in an older build, which is much worse than refusing to open it.
 */
export function migrateWorld(raw: unknown): MigrationResult {
	if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
		return { ok: false, error: 'World data is not an object.', reason: 'unreadable' };
	}

	const world = { ...(raw as Record<string, unknown>) };
	const version = world.schemaVersion;
	if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
		return {
			ok: false,
			error: 'World data has no usable schema version.',
			reason: 'unreadable'
		};
	}

	if (version > CURRENT_WORLD_SCHEMA_VERSION) {
		return {
			ok: false,
			error:
				'This world was created with a newer version of the game. Please update the game before opening it.',
			reason: 'newer-schema'
		};
	}

	let current = world;
	const from = version;
	while ((current.schemaVersion as number) < CURRENT_WORLD_SCHEMA_VERSION) {
		const fromVersion = current.schemaVersion as number;
		const step = MIGRATIONS[fromVersion];
		if (!step) {
			return {
				ok: false,
				error: `No migration path from world schema version ${fromVersion}.`,
				reason: 'unreadable'
			};
		}
		current = step(current);
		if ((current.schemaVersion as number) <= fromVersion) {
			// A migration that doesn't advance the version would loop forever — surface it as a bug
			// rather than hanging the load.
			return {
				ok: false,
				error: `Migration from version ${fromVersion} did not advance the schema version.`,
				reason: 'unreadable'
			};
		}
	}

	return {
		ok: true,
		value: current,
		migrated: from !== CURRENT_WORLD_SCHEMA_VERSION,
		fromVersion: from
	};
}
