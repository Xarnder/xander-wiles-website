/**
 * Release switches for biome-specific creatures (technical plan §19). Biome coats and the coat
 * surface detail can each be turned off for everyone (build constants) or for one session (URL):
 * `?creatureCoats=off` gives today's regional showcase colours; `?creatureDetail=off` drops the
 * coat micro-texture (Phase 2). Neither touches saves or the network.
 */
export const CREATURE_COATS_AVAILABLE = true;
export const CREATURE_DETAIL_AVAILABLE = true;
/**
 * Biome-specific species (2026-11-13). `?creatureRosters=off` brings back today's regional species
 * for one session; it is a local switch, so online the room (which follows the published world)
 * would disagree about creature identity: a development switch only.
 */
export const CREATURE_ROSTERS_AVAILABLE = true;

let coatsOff = false;
let detailOff = false;
let rostersOff = false;

export function readCreatureCoatSwitches(search: string): void {
	const params = new URLSearchParams(search);
	coatsOff = params.get('creatureCoats') === 'off';
	detailOff = params.get('creatureDetail') === 'off';
	rostersOff = params.get('creatureRosters') === 'off';
}

export const creatureCoatsAvailable = () => CREATURE_COATS_AVAILABLE && !coatsOff;
export const creatureDetailAvailable = () => CREATURE_DETAIL_AVAILABLE && !detailOff;
export const creatureRostersAvailable = () => CREATURE_ROSTERS_AVAILABLE && !rostersOff;
