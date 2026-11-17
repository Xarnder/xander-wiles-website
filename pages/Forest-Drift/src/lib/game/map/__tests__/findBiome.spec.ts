import { describe, expect, it } from 'vitest';
import { BIOME_DEFINITIONS, biomeIndex } from '../../biomes/biomeDefinitions';
import { BIOME_COUNT } from '../../biomes/BiomeTypes';
import type { BiomeScanResult } from '../BiomeMapClient';
import { BIOME_LIST_GROUPS } from '../biomeGroups';
import {
	biomeRows,
	findBiomeAvailable,
	foundLabel,
	foundTitle,
	noMoreText,
	nothingFoundText,
	readFindBiomeSwitch
} from '../findBiome';

const temperate = BIOME_LIST_GROUPS[0];
const forest = biomeIndex('forest'),
	meadow = biomeIndex('meadow'),
	plains = biomeIndex('plains'),
	cherry = biomeIndex('cherryGrove');

function result(
	nearest: Record<number, number | null>,
	here: number,
	done = true
): BiomeScanResult {
	const all = Array.from({ length: BIOME_COUNT }, (_, b) => (b in nearest ? nearest[b] : 5000));
	return { x: 0, z: 0, done, nearest: done ? all : [], here, ms: 1, sampled: 1 };
}

describe('the Biomes list', () => {
	it('has every biome once, in the docs groups and order', () => {
		expect(BIOME_LIST_GROUPS.map((g) => g.label)).toEqual([
			'Temperate',
			'Cold',
			'Tropical',
			'Warm and dry',
			'Wet'
		]);
		const all = BIOME_LIST_GROUPS.flatMap((g) => g.biomes);
		expect([...all].sort((a, b) => a - b)).toEqual([...Array(BIOME_COUNT).keys()]);
		for (const g of BIOME_LIST_GROUPS)
			for (const b of g.biomes) expect(BIOME_DEFINITIONS[b].group).toBe(g.group);
		// Variants sit in their parent's group (Q11).
		expect(temperate.biomes).toContain(cherry);
	});

	it('puts Here first, then nearest first, then none in range', () => {
		const rows = biomeRows(
			temperate,
			result({ [meadow]: 2400, [plains]: 640, [cherry]: null }, forest)
		);
		expect(rows[0]).toMatchObject({
			biome: forest,
			state: 'here',
			text: 'Here',
			label: 'Forest, Here'
		});
		expect(rows[1]).toMatchObject({ biome: plains, text: '640 m', label: 'Plains, 640 m' });
		expect(rows.find((r) => r.biome === meadow)!.text).toBe('2.4 km');
		expect(rows.at(-1)).toMatchObject({
			biome: cherry,
			state: 'none',
			text: 'None within 16 km',
			label: 'Cherry Grove, None within 16 km'
		});
		const distances = rows.filter((r) => r.state === 'distance').map((r) => r.distance!);
		expect([...distances].sort((a, b) => a - b)).toEqual(distances);
	});

	it('keeps the group order with "…" while scanning', () => {
		const rows = biomeRows(temperate, result({}, -1, false));
		expect(rows.map((r) => r.biome)).toEqual(temperate.biomes);
		for (const r of rows) {
			expect(r.text).toBe('…');
			expect(r.label).toBe(`${r.name}, searching`);
		}
		expect(biomeRows(temperate, null).every((r) => r.state === 'searching')).toBe(true);
	});

	it('words the footer and messages', () => {
		const desert = biomeIndex('desert');
		expect(foundLabel(desert, 0, 5)).toBe('Nearest Desert');
		expect(foundLabel(desert, 2, 5)).toBe('Desert, 3 of 5');
		expect(foundTitle(desert, 0, 5)).toBe('Nearest Desert · 1 of 5');
		expect(foundTitle(desert, 1, 5)).toBe('Desert · 2 of 5');
		expect(noMoreText(desert)).toBe('No more Desert within 16 km');
		expect(nothingFoundText(desert, false)).toBe('No Desert within 16 km');
		expect(nothingFoundText(desert, true)).toBe('No other Desert within 16 km');
	});

	it('can be switched off with ?findBiome=off', () => {
		readFindBiomeSwitch('?findBiome=off');
		expect(findBiomeAvailable()).toBe(false);
		readFindBiomeSwitch('?other=1');
		expect(findBiomeAvailable()).toBe(true);
	});
});
