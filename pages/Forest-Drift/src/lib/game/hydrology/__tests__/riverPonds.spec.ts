import { describe, expect, it } from 'vitest';
import { HydrologySystem } from '../HydrologySystem';
import { pointInLake } from '../HydrologyMath';
import { createDefaultHydrologySettings, type HydrologySettings } from '../HydrologyTypes';

/** A long valley falling towards +z, with hillsides either side. */
const valley = (x: number, z: number) => 8 + Math.max(0, -z) * 0.04 + Math.abs(x) * 0.16;
/** Rolling hills: rivers meet, end and start all over. */
const hills = (x: number, z: number) =>
	20 + Math.sin(x * 0.006) * 9 + Math.cos(z * 0.005) * 8 + Math.sin((x + z) * 0.011) * 3;

function systemFor(
	sample: (x: number, z: number) => number,
	seed: string,
	overrides: Partial<HydrologySettings> = {}
): HydrologySystem {
	const settings = { ...createDefaultHydrologySettings(), riverDensity: 1, ...overrides };
	const system = new HydrologySystem({ sample }, settings, seed);
	system.ensureSync(0, -400);
	return system;
}

const active = (system: HydrologySystem) =>
	system.getRivers().filter((river) => river.endIndex >= 2 && river.samples.length >= 2);

describe('rivers start and end in small lakes', () => {
	for (const [name, terrain] of [
		['valley', valley],
		['hills', hills]
	] as const) {
		it(`rises in its own pond, with water from the very start (${name})`, () => {
			const system = systemFor(terrain, `pond-${name}`);
			const springs = active(system).filter((river) => river.id.startsWith('r:'));
			expect(springs.length).toBeGreaterThan(0);
			let withPond = 0;
			for (const river of springs) {
				const pond = system.getLakes().find((lake) => lake.id === river.outletOfLakeId);
				if (!pond) continue;
				withPond++;
				expect(pond.pond).toBe('source');
				expect(pond.riverId).toBe(river.id);
				// It starts on the pond, at the pond's level…
				expect(pointInLake(pond, river.samples[0].x, river.samples[0].z)).toBeLessThan(1);
				expect(river.samples[0].waterY).toBeCloseTo(pond.waterLevel, 6);
				// …and there's water all the way along its first stretch, pond then river.
				const firstStretch = Math.min(river.endIndex, 12);
				for (let i = 0; i < firstStretch; i++) {
					const s = river.samples[i];
					expect(system.sampleWater(s.x, s.z).waterType, `${river.id}@${i}`).not.toBe('none');
				}
			}
			// Almost every spring has room for its pond (a lake or a cliff right there is rare).
			expect(withPond / springs.length).toBeGreaterThan(0.8);
		});

		it(`never just stops: every river ends in a lake or joins another river (${name})`, () => {
			const system = systemFor(terrain, `end-${name}`);
			for (const river of active(system)) {
				const joins = river.endIndex < river.samples.length;
				const lake = system.getLakes().find((l) => l.id === river.sinkLakeId);
				expect(joins || !!lake, river.id).toBe(true);
				if (!joins && lake?.pond === 'end') {
					// It reaches its end pond, and the pond is there to see.
					const last = river.samples[river.samples.length - 1];
					expect(pointInLake(lake, last.x, last.z), river.id).toBeLessThan(1);
					expect(lake.inactive).toBeFalsy();
				}
			}
		});
	}

	it("dries out an end pond whose river joins another first, and keeps ponds' water level contained", () => {
		const system = systemFor(hills, 'join-hills');
		const ponds = system.getLakes().filter((lake) => lake.pond === 'end');
		expect(ponds.length).toBeGreaterThan(0);
		for (const pond of ponds) {
			const river = system.getRivers().find((r) => r.id === pond.riverId);
			if (!river) continue;
			const joined = river.endIndex < river.samples.length;
			expect(!!pond.inactive, pond.id).toBe(joined);
			if (joined) {
				expect(system.lakesNear(pond.x, pond.z, 1).some((l) => l.id === pond.id)).toBe(false);
				expect(system.sampleWater(pond.x, pond.z).lakeId).not.toBe(pond.id);
			}
		}
		// A pond's water sits no higher than the ground at its rim, so it never hangs over a slope.
		for (const pond of system.getLakes().filter((lake) => lake.pond && !lake.inactive)) {
			for (let i = 0; i < 16; i++) {
				const angle = (i / 16) * Math.PI * 2;
				const x = pond.x + Math.cos(angle) * pond.baseRadius * 1.6;
				const z = pond.z + Math.sin(angle) * pond.baseRadius * 1.6;
				if (pointInLake(pond, x, z) <= 1.34) continue;
				expect(hills(x, z), pond.id).toBeGreaterThan(pond.waterLevel - 2.5);
			}
		}
	});

	it('leaves version-1 worlds without ponds', () => {
		const system = systemFor(valley, 'legacy-ponds', { generatorVersion: 1 });
		expect(system.getLakes().some((lake) => lake.pond)).toBe(false);
	});
});
