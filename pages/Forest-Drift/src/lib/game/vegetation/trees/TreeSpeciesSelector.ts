import { createNoise2D } from 'simplex-noise';
import { fbm2D, type Noise2D } from '../../terrain/noiseLayer';
import { smoothstep } from '../../terrain/mathUtils';
import { createNamedRandom } from '../../terrain/seededRandom';
import type { TreeSpeciesMixSettings } from '../VegetationTypes';
import { TREE_SPECIES_IDS, type TreeSpeciesId } from './TreeSpeciesTypes';

/** The local conditions a candidate tree grows in. */
export interface SpeciesSite {
	worldX: number;
	worldZ: number;
	/** Terrain height, metres. */
	height: number;
	/** Forest density 0..1 from VegetationRegionSampler. */
	density: number;
	slopeDegrees: number;
}

/**
 * Decides which species grows at a site — the placement-layer half of the tree system (it never
 * touches geometry or rendering). Deterministic: a low-frequency, seed-named conifer/broadleaf map
 * plus elevation decide the forest TYPE (broadleaf woods, pine forest, mixed woodland between),
 * and density decides where small ornamentals appear (open, sparse ground — forest edges and
 * clearings, not deep forest). The caller supplies the random roll, so the same cell always picks
 * the same species.
 */
export class TreeSpeciesSelector {
	private readonly settings: TreeSpeciesMixSettings;
	private regionNoise: Noise2D | null = null;
	private seed = '';
	private readonly weights = new Float64Array(TREE_SPECIES_IDS.length);

	constructor(settings: TreeSpeciesMixSettings) {
		this.settings = settings;
	}

	setSeed(seed: string): void {
		if (seed === this.seed && this.regionNoise) return;
		this.seed = seed;
		this.regionNoise = createNoise2D(createNamedRandom(seed, 'treeSpeciesRegion'));
	}

	/** 0 = broadleaf country … 1 = conifer country, at a site. */
	coniferness(site: SpeciesSite): number {
		const s = this.settings;
		let region = 0.5;
		if (this.regionNoise) {
			const freq = 1 / Math.max(1, s.coniferRegionScale);
			region =
				fbm2D(this.regionNoise, site.worldX * freq, site.worldZ * freq, 2, 2, 0.5, 0) * 0.5 + 0.5;
		}
		const fromRegion = smoothstep(0.38, 0.66, region);
		const fromHeight = smoothstep(s.coniferStartHeight, s.coniferFullHeight, site.height);
		return Math.min(1, fromRegion + fromHeight * (1 - fromRegion) * 0.85);
	}

	/** Relative weights per species (index-aligned with TREE_SPECIES_IDS). Reuses an internal buffer. */
	weightsAt(site: SpeciesSite): Float64Array {
		const s = this.settings;
		const conifer = this.coniferness(site);
		const open = 1 - Math.min(1, Math.max(0, site.density));
		const gentle = 1 - smoothstep(10, 25, site.slopeDegrees);
		const lowland = 1 - smoothstep(s.coniferStartHeight, s.coniferFullHeight, site.height);
		this.weights[0] = s.oakWeight * (1 - conifer) * (0.4 + 0.6 * lowland);
		this.weights[1] = s.pineWeight * conifer;
		this.weights[2] = s.cypressWeight * (0.3 + 0.7 * conifer) * (0.5 + 0.5 * open);
		this.weights[3] = s.ornamentalWeight * open * open * gentle * lowland * (1 - conifer * 0.7);
		return this.weights;
	}

	/** Picks a species with a roll in [0, 1). Falls back to oak if every weight is zero. */
	pick(site: SpeciesSite, roll: number): TreeSpeciesId {
		const weights = this.weightsAt(site);
		let total = 0;
		for (const w of weights) total += Math.max(0, w);
		if (total <= 0) return 'oak';
		let target = roll * total;
		for (let i = 0; i < weights.length; i++) {
			target -= Math.max(0, weights[i]);
			if (target < 0) return TREE_SPECIES_IDS[i];
		}
		return TREE_SPECIES_IDS[TREE_SPECIES_IDS.length - 1];
	}
}
