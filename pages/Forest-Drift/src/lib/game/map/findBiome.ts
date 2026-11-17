import { BIOME_DEFINITIONS } from '../biomes/biomeDefinitions';
import type { BiomeScanResult } from './BiomeMapClient';
import type { BiomeListGroup } from './biomeGroups';
import { formatDistance } from './BiomeMapSystem';

/**
 * Find a biome's list on the full map (technical plan §6), without the DOM: the switch, the order
 * of each group's rows, and their words.
 */

/**
 * Release switch (plan §10): off for everyone with the build constant, or for one session with
 * `?findBiome=off`. Off hides the full map's Biomes button and its keys.
 */
export const FIND_BIOME_AVAILABLE = true;
let switchedOff = false;
export function readFindBiomeSwitch(search: string): void {
	switchedOff = new URLSearchParams(search).get('findBiome') === 'off';
}
export const findBiomeAvailable = () => FIND_BIOME_AVAILABLE && !switchedOff;

/** What a row says about its biome. */
export type BiomeRowState = 'here' | 'distance' | 'none' | 'searching';

export interface BiomeRow {
	biome: number;
	name: string;
	state: BiomeRowState;
	/** Metres to the nearest pin (state 'distance'). */
	distance: number | null;
	/** Shown beside the name: "2.4 km", "Here", "None within 16 km" or "…". */
	text: string;
	/** The row's accessible name: "Desert, 2.4 km". */
	label: string;
}

const textOf = (state: BiomeRowState, distance: number | null) =>
	state === 'here'
		? 'Here'
		: state === 'none'
			? 'None within 16 km'
			: state === 'searching'
				? '…'
				: formatDistance(distance!);

/**
 * A group's rows (Q5, Q10): the biome you're in first, marked Here; then nearest first; then those
 * with none in range. While scanning (no finished result) they keep the group's own order. The map
 * passes an earlier scan's result while a new one runs, so its distances stay up (edge case E1).
 */
export function biomeRows(group: BiomeListGroup, result: BiomeScanResult | null): BiomeRow[] {
	const done = !!result?.done;
	const rows = group.biomes.map((biome): BiomeRow => {
		const name = BIOME_DEFINITIONS[biome].name;
		const distance = done ? (result!.nearest[biome] ?? null) : null;
		const state: BiomeRowState = !done
			? 'searching'
			: result!.here === biome
				? 'here'
				: distance === null
					? 'none'
					: 'distance';
		const text = textOf(state, distance);
		return {
			biome,
			name,
			state,
			distance,
			text,
			label: `${name}, ${state === 'searching' ? 'searching' : text}`
		};
	});
	if (!done) return rows;
	const rank = (row: BiomeRow) =>
		row.state === 'here' ? -1 : row.state === 'none' ? Infinity : row.distance!;
	return rows.sort((a, b) => rank(a) - rank(b));
}

/** The footer's name for a found patch: "Nearest Desert", then "Desert, 2 of 5". */
export function foundLabel(biome: number, index: number, count: number): string {
	const name = BIOME_DEFINITIONS[biome].name;
	return index === 0 ? `Nearest ${name}` : `${name}, ${index + 1} of ${count}`;
}

/** The footer's title for a found patch: "Nearest Desert · 1 of 5", then "Desert · 2 of 5". */
export function foundTitle(biome: number, index: number, count: number): string {
	const name = BIOME_DEFINITIONS[biome].name;
	return `${index === 0 ? `Nearest ${name}` : name} · ${index + 1} of ${count}`;
}

/** Next nearest past the last patch. */
export const noMoreText = (biome: number) =>
	`No more ${BIOME_DEFINITIONS[biome].name} within 16 km`;

/** What picking says when there's no patch to pin (edge cases E3 and Q3). */
export function nothingFoundText(biome: number, here: boolean): string {
	const name = BIOME_DEFINITIONS[biome].name;
	return here ? `No other ${name} within 16 km` : `No ${name} within 16 km`;
}
