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
 * plus elevation decide the forest TYPE (broadleaf woods, conifer forest, mixed woodland between),
 * and density decides the character within it: tall spruces crowd dense and higher conifer
 * forest, Scots pines stand on open conifer ground, birches fill mixed woodland and forest edges,
 * and small ornamentals and weeping willows grow on open, gentle lowland (clearings and edges,
 * never deep forest). On top of that, each species has its own low-frequency STAND map, so trees
 * of a kind group into groves (a spruce stand, a birch copse) instead of an even mix — more
 * natural, and cheaper: a chunk holds fewer species, so it needs fewer prototype batches (draw
 * calls). Each location uses the strongest local stand, so neighbouring trees share a species.
 * The caller’s roll is only used when stand strength is zero (the optional mixed-forest mode).
 */
export class TreeSpeciesSelector {
	private readonly settings: TreeSpeciesMixSettings;
	private regionNoise: Noise2D | null = null;
	private standNoise: Noise2D | null = null;
	private seed = '';
	private readonly weights = new Float64Array(TREE_SPECIES_IDS.length);

	constructor(settings: TreeSpeciesMixSettings) {
		this.settings = settings;
	}

	setSeed(seed: string): void {
		if (seed === this.seed && this.regionNoise) return;
		this.seed = seed;
		this.regionNoise = createNoise2D(createNamedRandom(seed, 'treeSpeciesRegion'));
		this.standNoise = createNoise2D(createNamedRandom(seed, 'treeSpeciesStands'));
	}

	/**
	 * How strongly species `index` holds this spot (1 − standStrength … 1): one noise channel per
	 * species (offset far apart), so stands of different species overlap only at their edges.
	 */
	private stand(index: number, site: SpeciesSite): number {
		const s = this.settings;
		if (!this.standNoise || s.standStrength <= 0) return 1;
		const freq = 1 / Math.max(1, s.standScale);
		const n =
			this.standNoise(site.worldX * freq + index * 37.17, site.worldZ * freq - index * 53.71) *
				0.5 +
			0.5;
		return 1 - s.standStrength + s.standStrength * smoothstep(0.38, 0.72, n);
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
		const dense = Math.min(1, Math.max(0, site.density));
		this.weights[4] =
			s.spruceWeight * conifer * (0.35 + 0.65 * dense) * (0.55 + 0.45 * (1 - lowland));
		this.weights[5] =
			s.birchWeight * (1 - conifer * 0.6) * (0.45 + 0.55 * open) * (0.5 + 0.5 * gentle);
		this.weights[6] = s.scotsPineWeight * conifer * (0.3 + 0.7 * open) * (0.6 + 0.4 * gentle);
		this.weights[7] = s.willowWeight * open * open * gentle * lowland * (1 - conifer);
		for (let i = 0; i < this.weights.length; i++) this.weights[i] *= this.stand(i, site);
		return this.weights;
	}

	/** Picks the local grove’s species, or uses the roll in mixed mode. Zero weights fall back to oak. */
	pick(site: SpeciesSite, roll: number): TreeSpeciesId {
		const weights = this.weightsAt(site);
		if (this.settings.standStrength > 0) {
			// Pick one dominant stand from continuous world-space fields. Rolling again per tree
			// scatters minority species throughout otherwise coherent groves.
			let best = -1;
			let strongest = 0;
			for (let i = 0; i < weights.length; i++) {
				if (weights[i] > strongest) {
					strongest = weights[i];
					best = i;
				}
			}
			return best < 0 ? 'oak' : TREE_SPECIES_IDS[best];
		}
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
