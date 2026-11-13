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
 * Future generator changes need their own compatibility review; never blindly relabel them.
 */
export function migrateGenerator<T extends { generatorVersion: number }>(
	manifest: T,
	biomesEnabled: () => boolean
): T {
	if (GENERATOR_VERSION !== 4) return manifest;
	const version = manifest.generatorVersion;
	if (version !== 1 && version !== 2 && version !== 3) return manifest;
	if (biomesEnabled()) return manifest;
	return { ...manifest, generatorVersion: 4 };
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
