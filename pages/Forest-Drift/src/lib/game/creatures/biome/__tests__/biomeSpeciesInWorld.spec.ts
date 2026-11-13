import { describe, expect, it } from 'vitest';
import { BiomeField } from '../../../biomes/BiomeField';
import { BIOME_IDS } from '../../../biomes/BiomeTypes';
import { TerrainHeightSampler } from '../../../terrain/TerrainHeightSampler';
import { richWorld } from '../../../world/__tests__/worldFixtures';
import { resolveAmbientCreature } from '../../carryableCreatureRef';
import { abilityFor } from '../../creatureAbilities';
import { generatePopulationCell, type HerdBiomeSources } from '../../CreaturePopulationSystem';
import { rideFor } from '../../creatureRiding';
import type { CreatureWorldAccess } from '../../CreatureTypes';
import { biomeRoster } from '../BiomeRoster';
import { rosterKeyOf } from '../biomeRosters';
import { roomBiomeSources } from '../roomBiomeSources';

/** A published biome world, as the room stores it, and the client's own biome lookup for it. */
const world = richWorld({ seed: 'biome-species-world' });
world.environment.terrain.seed = world.seed;
world.environment.biomes.enabled = true;
const baseJson = JSON.stringify(world);
const clientField = new BiomeField(
	new TerrainHeightSampler(world.environment.terrain),
	world.environment.biomes
);
clientField.setSeed(world.seed);
const clientBiome = (x: number, z: number) => BIOME_IDS[clientField.dominantAt(x, z)];
const client: CreatureWorldAccess & HerdBiomeSources = {
	surface: () => 0,
	blocked: () => false,
	rosterAt: clientBiome,
	profileAt: clientBiome
};
const CELLS: [number, number][] = [];
for (let x = -40; x < 40; x += 7) for (let z = -40; z < 40; z += 9) CELLS.push([x, z]);

describe('biome-specific species in the world (Phase 1)', () => {
	it('gives the room the same biomes as a client, from the published world', () => {
		const room = roomBiomeSources(baseJson)!;
		expect(room).not.toBeNull();
		for (let i = 0; i < 400; i++) {
			const x = (i % 20) * 173 - 1700,
				z = Math.floor(i / 20) * 211 - 2100;
			expect(room.rosterAt!(x, z)).toBe(clientBiome(x, z));
		}
	});

	it('gives the room nothing for biomes-off or unreadable worlds (today’s species)', () => {
		expect(roomBiomeSources(null)).toBeNull();
		expect(roomBiomeSources('not json')).toBeNull();
		expect(
			roomBiomeSources(
				JSON.stringify({
					...world,
					environment: {
						...world.environment,
						biomes: { ...world.environment.biomes, enabled: false }
					}
				})
			)
		).toBeNull();
	});

	it('spawns herds from their centre family roster, and the room resolves them to the same animals', () => {
		const room = roomBiomeSources(baseJson)!;
		let checked = 0;
		for (const [cx, cz] of CELLS)
			for (const spawn of generatePopulationCell(world.seed, cx, cz, 1, client)) {
				const biome = clientBiome(spawn.groupCentre.x, spawn.groupCentre.z);
				const key = rosterKeyOf(biome)!;
				const roster = biomeRoster(world.seed, Math.floor(cx / 8), Math.floor(cz / 8), key);
				expect(
					roster.map((e) => e.species.id),
					biome
				).toContain(spawn.species.id);
				// The client resolver equals the population exactly (coats and morphs included).
				const mine = resolveAmbientCreature(world.seed, spawn.id, client)!;
				expect(mine.species).toEqual(spawn.species);
				expect(mine.individual).toEqual(spawn.individual);
				// The room resolves the same identity and therefore the same abilities.
				const theirs = resolveAmbientCreature(world.seed, spawn.id, room)!;
				expect(theirs.species.id).toBe(spawn.species.id);
				expect(theirs.species.proportions).toEqual(spawn.species.proportions);
				expect(!!abilityFor(theirs)).toBe(!!abilityFor(mine));
				expect(!!rideFor(theirs)).toBe(!!rideFor(mine));
				checked++;
			}
		expect(checked).toBeGreaterThan(100);
	});

	it('keeps biomes-off worlds exactly as today (no roster source)', () => {
		const plain: CreatureWorldAccess = { surface: () => 0, blocked: () => false };
		const offRoster: CreatureWorldAccess = { ...plain, rosterAt: () => undefined };
		for (const [cx, cz] of CELLS.slice(0, 20))
			expect(generatePopulationCell(world.seed, cx, cz, 1, offRoster)).toEqual(
				generatePopulationCell(world.seed, cx, cz, 1, plain)
			);
	});

	it('thins deserts and snowfields and fills jungles (family density, Q15)', () => {
		const count = (biome: string) => {
			const access: CreatureWorldAccess = {
				surface: () => 0,
				blocked: () => false,
				rosterAt: () => biome
			};
			let groups = 0;
			for (let x = -30; x < 30; x++)
				for (let z = -6; z < 6; z++)
					groups += new Set(
						generatePopulationCell('density', x, z, 1, access).map((s) => s.groupId)
					).size;
			return groups;
		};
		const desert = count('desert'),
			forest = count('forest'),
			jungle = count('jungle');
		expect(desert).toBeLessThan(forest * 0.75);
		expect(jungle).toBeGreaterThan(forest * 1.1);
	});
});
