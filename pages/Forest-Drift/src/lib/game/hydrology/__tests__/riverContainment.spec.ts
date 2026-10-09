import { describe, expect, it } from 'vitest';
import { HydrologySystem } from '../HydrologySystem';
import { riverWaterEdge } from '../HydrologyMath';
import { createDefaultHydrologySettings } from '../HydrologyTypes';
import { createDefaultTerrainSettings } from '../../terrain/TerrainSettings';
import { TerrainHeightSampler } from '../../terrain/TerrainHeightSampler';
import { BaseTerrainSampler } from '../BaseTerrainSampler';

describe('river banks contain the water', () => {
	it('keeps ribbon edges on a bank or level with the other river', () => {
		const terrainSettings = createDefaultTerrainSettings();
		terrainSettings.seed = 'bank-fix-1';
		const terrain = new TerrainHeightSampler(terrainSettings);
		const base = new BaseTerrainSampler(terrain);
		const hydro = new HydrologySystem(base, createDefaultHydrologySettings(), 'bank-fix-1');
		for (let dz = -1; dz <= 1; dz++) {
			for (let dx = -1; dx <= 1; dx++) hydro.ensureSync(dx * 1280, dz * 1280);
		}
		let dryBelow = 0;
		let otherAbove = 0;
		let checked = 0;
		const bad: unknown[] = [];
		for (const river of hydro.getRivers()) {
			const last = Math.min(river.endIndex, river.samples.length);
			if (last < 4) continue;
			for (let i = 1; i < last - 1; i += 3) {
				const s = river.samples[i];
				if (Math.hypot(s.x, s.z) > 1800) continue;
				const edge = riverWaterEdge(s.width, 1);
				const px = -s.tangentZ;
				const pz = s.tangentX;
				for (const side of [1, -1]) {
					const x = s.x + px * edge * side;
					const z = s.z + pz * edge * side;
					const w = hydro.sampleWater(x, z);
					if (w.waterType === 'lake') continue;
					checked++;
					if (w.waterType === 'none') {
						if (w.terrainY <= s.waterY + 0.15) {
							dryBelow++;
							if (bad.length < 6) {
								bad.push({
									kind: 'dry',
									id: river.id,
									i,
									y: +s.waterY.toFixed(2),
									ty: +w.terrainY.toFixed(2)
								});
							}
						}
					} else if (w.riverId !== river.id && Number.isFinite(w.shoreWaterY)) {
						if (s.waterY > w.shoreWaterY + 0.2) {
							otherAbove++;
							if (bad.length < 6) {
								bad.push({
									kind: 'over',
									id: river.id,
									i,
									y: +s.waterY.toFixed(2),
									shore: +w.shoreWaterY.toFixed(2),
									ty: +w.terrainY.toFixed(2)
								});
							}
						}
					}
				}
			}
		}
		expect({ checked, dryBelow, otherAbove, bad }).toEqual({
			checked,
			dryBelow: 0,
			otherAbove: 0,
			bad: []
		});
	});
});
