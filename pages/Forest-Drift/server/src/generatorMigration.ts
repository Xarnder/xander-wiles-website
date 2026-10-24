import { GENERATOR_VERSION } from '../../src/lib/game/net/protocol';

/**
 * Generators 1→2→3 only changed tree species/appearance, retaining terrain, tree cells and authored
 * coordinates. Upgrade these known versions without republishing the world or replacing invites.
 * Future generator changes require their own compatibility review; never blindly relabel them.
 */
export function migrateTreeGenerator<T extends { generatorVersion: number }>(manifest: T): T {
	if (
		GENERATOR_VERSION === 3 &&
		(manifest.generatorVersion === 1 || manifest.generatorVersion === 2)
	) {
		return { ...manifest, generatorVersion: 3 };
	}
	return manifest;
}
