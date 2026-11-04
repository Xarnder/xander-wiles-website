import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
	parseAmbientCreatureId,
	resolveAmbientCreature,
	resolveCarryableCreature
} from './carryableCreatureRef';
import { generatePopulationCell } from './CreaturePopulationSystem';
import type { CreatureWorldAccess, PersistentCreatureDefinition } from './CreatureTypes';

const flat: CreatureWorldAccess = { surface: () => 0, blocked: () => false };

describe('ambient creature ids', () => {
	it('parses ids, reading the numbers from the end so seeds may contain colons', () => {
		expect(parseAmbientCreatureId('group:forest:-3:5:2:1')).toEqual({
			seed: 'forest',
			cellX: -3,
			cellZ: 5,
			slot: 2,
			member: 1
		});
		expect(parseAmbientCreatureId('group:my:odd:seed:0:0:0:0')?.seed).toBe('my:odd:seed');
	});

	it('rejects malformed, oversized and out-of-range ids', () => {
		for (const bad of [
			null,
			42,
			'',
			'group:forest:1:2:3',
			'herd:forest:1:2:0:0',
			'group::1:2:0:0',
			'group:forest:1.5:2:0:0',
			'group:forest:1:2:9:0',
			'group:forest:1:2:0:-1',
			'group:forest:99999999999:2:0:0',
			`group:${'x'.repeat(200)}:1:2:0:0`
		])
			expect(parseAmbientCreatureId(bad), String(bad)).toBeNull();
	});

	it('rebuilds exactly the recipe the population generator spawned', () => {
		let checked = 0;
		for (let x = -12; x < 12; x++)
			for (let z = -6; z < 6; z++)
				for (const spawn of generatePopulationCell('forest', x, z, 1, flat)) {
					expect(resolveAmbientCreature('forest', spawn.id)).toEqual({
						species: spawn.species,
						individual: spawn.individual
					});
					checked++;
				}
		expect(checked).toBeGreaterThan(400);
	});

	it("refuses another world's ids and members a group doesn't have", () => {
		const spawn = generatePopulationCell('forest', 2, 3, 1, flat)[0];
		expect(resolveAmbientCreature('other-seed', spawn.id)).toBeNull();
		expect(resolveAmbientCreature('forest', spawn.id.replace(/:\d+$/, ':31'))).toBeNull();
	});

	it('finds Lab-placed creatures among the saved ones', () => {
		const spawn = generatePopulationCell('forest', 2, 3, 1, flat)[0];
		const placed: PersistentCreatureDefinition = {
			id: 'placed_x_1',
			species: spawn.species,
			individual: spawn.individual,
			position: { x: 0, y: 0, z: 0 },
			heading: 0,
			state: 'IDLE'
		};
		expect(resolveCarryableCreature('forest', 'placed_x_1', [placed])?.placed).toBe(true);
		expect(resolveCarryableCreature('forest', 'placed_missing', [placed])).toBeNull();
		expect(resolveCarryableCreature('forest', spawn.id, [])?.placed).toBe(false);
	});

	it('stays free of Three.js and DOM imports (the multiplayer room bundles it)', () => {
		for (const file of [
			'carryableCreatureRef.ts',
			'creatureAbilities.ts',
			'creatureDimensions.ts'
		]) {
			const source = readFileSync(fileURLToPath(new URL(file, import.meta.url)), 'utf8');
			expect(source, file).not.toMatch(/from 'three'|document\.|window\./);
		}
	});
});
