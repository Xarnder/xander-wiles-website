/**
 * Biome kill switch (technical plan §18, rollback). Two levers, both runtime-only:
 *
 * - `BIOMES_AVAILABLE`: a build constant — ship `false` to turn biomes off for everyone at once.
 * - `?biomes=off` in the address: off for this browser session (support, or comparing worlds).
 *
 * Either one makes every system take its pre-biome path (`BiomeField.isEnabled()` reports false),
 * but a world's SAVED `environment.biomes` is never touched, so lifting the switch restores its
 * biomes exactly. A world can't be downgraded by saving while the switch is on.
 *
 * Online, the switch is per player, so use the build constant there rather than the address flag
 * (two players would otherwise see different forests).
 */
export const BIOMES_AVAILABLE = true;

let sessionOff = false;

export function biomesAvailable(): boolean {
	return BIOMES_AVAILABLE && !sessionOff;
}

/** Reads `?biomes=off` from a location search string (called once at startup). */
export function readBiomeKillSwitch(search: string): void {
	sessionOff = new URLSearchParams(search).get('biomes') === 'off';
}
