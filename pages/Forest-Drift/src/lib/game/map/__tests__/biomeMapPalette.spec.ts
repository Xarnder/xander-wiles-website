import { describe, expect, it } from 'vitest';
import { BiomeField } from '../../biomes/BiomeField';
import { BIOME_COUNT, BIOME_IDS, createDefaultBiomeSettings } from '../../biomes/BiomeTypes';
import { hexToOklch } from '../../creatures/biome/oklch';
import { TerrainHeightSampler } from '../../terrain/TerrainHeightSampler';
import { createDefaultTerrainSettings } from '../../terrain/TerrainSettings';
import { biomeMapHex, WATER_RGB } from '../biomeMapPalette';

/** Colour-blind simulation in linear RGB (the Creature Lab's matrices, Machado et al.). */
const SIMULATIONS: Record<string, number[]> = {
	normal: [1, 0, 0, 0, 1, 0, 0, 0, 1],
	deuteranopia: [0.367, 0.861, -0.228, 0.28, 0.673, 0.047, -0.012, 0.043, 0.969],
	protanopia: [0.152, 1.053, -0.205, 0.115, 0.786, 0.099, -0.004, -0.048, 1.052]
};
const toLinear = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const toSrgb = (v: number) => (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055);

/** OKLab of a hex colour as seen under a simulation. */
function seen(hex: string, sim: number[]): [number, number, number] {
	const rgb = [1, 3, 5].map((i) => toLinear(parseInt(hex.slice(i, i + 2), 16) / 255));
	const out = [0, 1, 2].map((r) =>
		Math.min(
			1,
			Math.max(0, sim[r * 3] * rgb[0] + sim[r * 3 + 1] * rgb[1] + sim[r * 3 + 2] * rgb[2])
		)
	);
	const back =
		'#' +
		out
			.map((v) =>
				Math.round(toSrgb(v) * 255)
					.toString(16)
					.padStart(2, '0')
			)
			.join('');
	const { l, c, h } = hexToOklch(back);
	const rad = (h * Math.PI) / 180;
	return [l, c * Math.cos(rad), c * Math.sin(rad)];
}
const distance = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** Which biomes border which, and how often, in a few real worlds. */
function neighbourPairs(): Map<string, number> {
	const pairs = new Map<string, number>();
	for (const seed of ['palette-a', 'palette-b', 'palette-c']) {
		const terrain = new TerrainHeightSampler({ ...createDefaultTerrainSettings(), seed });
		const field = new BiomeField(terrain, { ...createDefaultBiomeSettings(), enabled: true });
		field.setSeed(seed);
		const { x: sx, z: sz } = field.getSpawnOffset();
		const step = 48,
			n = 120;
		const grid = new Int8Array(n * n);
		const out = new Float32Array(BIOME_COUNT);
		for (let j = 0; j < n; j++)
			for (let i = 0; i < n; i++)
				grid[j * n + i] = field.classifyPoint(
					sx + (i - n / 2) * step,
					sz + (j - n / 2) * step,
					out
				);
		for (let j = 0; j < n; j++)
			for (let i = 0; i < n; i++) {
				const a = grid[j * n + i];
				for (const b of [
					i + 1 < n ? grid[j * n + i + 1] : a,
					j + 1 < n ? grid[(j + 1) * n + i] : a
				])
					if (a !== b) {
						const key = [a, b].sort((x, y) => x - y).join(':');
						pairs.set(key, (pairs.get(key) ?? 0) + 1);
					}
			}
	}
	return pairs;
}

describe('biome map palette', () => {
	const hexes = BIOME_IDS.map((_, i) => biomeMapHex(i));

	it('gives every biome its own colour, none mistakable for water', () => {
		expect(new Set(hexes).size).toBe(BIOME_COUNT);
		const water = '#' + WATER_RGB.map((v) => v.toString(16).padStart(2, '0')).join('');
		for (const hex of hexes)
			expect(
				distance(seen(hex, SIMULATIONS.normal), seen(water, SIMULATIONS.normal))
			).toBeGreaterThan(0.08);
	});

	it('keeps biomes that border each other apart, for colour-blind players too', () => {
		const pairs = neighbourPairs();
		expect(pairs.size).toBeGreaterThan(20);
		const failures: string[] = [];
		for (const [key, count] of pairs) {
			const [a, b] = key.split(':').map(Number);
			for (const [name, sim] of Object.entries(SIMULATIONS)) {
				const d = distance(seen(hexes[a], sim), seen(hexes[b], sim));
				const need = name === 'normal' ? 0.06 : 0.035;
				if (d < need)
					failures.push(`${BIOME_IDS[a]}/${BIOME_IDS[b]} (${count}×) ${name}: ${d.toFixed(3)}`);
			}
		}
		expect(failures).toEqual([]);
	});
});
