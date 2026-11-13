import { GENERATOR_VERSION } from '../../src/lib/game/net/protocol';

/**
 * Relabels a published world's generator version when the new generator is known to produce the
 * same world for it, so it keeps opening without being republished or its invites replaced.
 *
 * - 1 → 2 → 3 only changed tree species/appearance, keeping terrain, tree cells and coordinates.
 * - 3 → 4 added biomes (2026-11). A world published at 1–3 came from a build without biomes, so it
 *   migrates with biomes OFF and generates exactly as before. `biomesEnabled` re-checks the stored
 *   world anyway: a world that somehow has biomes on is never relabelled (the client then asks the
 *   player to refresh, rather than two versions drawing different forests).
 *
 * - 4 → 5 changed which species live in biome worlds (biome-specific species, 2026-11-13). Worlds
 *   with biomes off keep today's species exactly, so 1–4 relabel to 5 when biomes are off. A biome
 *   world at 4 is never relabelled: its creatures would be different animals.
 *
 * Future generator changes need their own compatibility review; never blindly relabel them.
 */
export function migrateGenerator<T extends { generatorVersion: number }>(
	manifest: T,
	biomesEnabled: () => boolean
): T {
	if (GENERATOR_VERSION !== 5) return manifest;
	const version = manifest.generatorVersion;
	if (!(Number.isInteger(version) && version >= 1 && version <= 4)) return manifest;
	if (biomesEnabled()) return manifest;
	return { ...manifest, generatorVersion: 5 };
}

/** Whether a stored base world (JSON text) has biomes switched on. Unreadable means no. */
export function baseHasBiomes(baseJson: string | null): boolean {
	if (!baseJson) return false;
	try {
		const base = JSON.parse(baseJson) as { environment?: { biomes?: { enabled?: unknown } } };
		return base.environment?.biomes?.enabled === true;
	} catch {
		return false;
	}
}
