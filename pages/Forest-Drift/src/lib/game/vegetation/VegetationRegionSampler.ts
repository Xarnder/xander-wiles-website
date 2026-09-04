import { createNoise2D } from 'simplex-noise';
import type { Noise2D } from '../terrain/noiseLayer';
import { fbm2D } from '../terrain/noiseLayer';
import { clamp01, smoothstep } from '../terrain/mathUtils';
import { createNamedRandom } from '../terrain/seededRandom';
import type { VegetationSettings } from './VegetationTypes';

/**
 * Answers "how much forest exists here" — completely independent of terrain biome ("what shape is
 * the ground"). Every noise generator here is seeded from its own name (`forestRegion`,
 * `forestWarpX/Z`, `forestClearing`, `forestCluster`), distinct from every terrain-biome seed name,
 * so forest coverage never correlates with mountain/plains placement even though both ultimately
 * derive from the same world seed string — see the "Avoid correlation" note in the README.
 *
 * Pipeline, all in world-space coordinates:
 *   1. large-scale forest mask (single octave, warped for organic edges) -> smooth 0..1 weight
 *   2. local clustering (medium frequency) multiplies that weight — subtle, never overrides it
 *   3. clearings (medium frequency) subtract holes — also subtle relative to the large mask
 *
 * getForestDensity() never allocates and returns early (skipping the clustering/clearing samples
 * entirely) wherever the large mask says "no forest", which is most of the world at any moment.
 */
export class VegetationRegionSampler {
	private readonly settings: VegetationSettings;
	private seed = '';
	private initialized = false;

	private forestRegionNoise!: Noise2D;
	private forestWarpXNoise!: Noise2D;
	private forestWarpZNoise!: Noise2D;
	private clearingNoise!: Noise2D;
	private clusterNoise!: Noise2D;

	constructor(settings: VegetationSettings) {
		this.settings = settings;
	}

	setSeed(seed: string): void {
		if (seed === this.seed && this.initialized) return;
		this.seed = seed;
		this.initialized = true;

		this.forestRegionNoise = createNoise2D(createNamedRandom(seed, 'forestRegion'));
		this.forestWarpXNoise = createNoise2D(createNamedRandom(seed, 'forestWarpX'));
		this.forestWarpZNoise = createNoise2D(createNamedRandom(seed, 'forestWarpZ'));
		this.clearingNoise = createNoise2D(createNamedRandom(seed, 'forestClearing'));
		this.clusterNoise = createNoise2D(createNamedRandom(seed, 'forestCluster'));
	}

	/** Raw large-scale forest mask in [0, 1], before threshold/blend shaping — used by the debug view and tests. */
	sampleForestMaskValue01(worldX: number, worldZ: number): number {
		const f = this.settings.forest;
		const freq = 1 / Math.max(1, f.forestRegionScale);

		let x = worldX;
		let z = worldZ;
		if (f.forestWarpStrength > 0) {
			const warpFreq = 1 / Math.max(1, f.forestWarpScale);
			const dx = fbm2D(this.forestWarpXNoise, worldX * warpFreq, worldZ * warpFreq, 2, 2, 0.5, 0);
			const dz = fbm2D(this.forestWarpZNoise, worldX * warpFreq, worldZ * warpFreq, 2, 2, 0.5, 0);
			x = worldX + dx * f.forestWarpStrength;
			z = worldZ + dz * f.forestWarpStrength;
		}

		// Single octave, same reasoning as the terrain biome mask: extra octaves would fragment
		// large, readable forest regions into small noisy speckles.
		const raw = fbm2D(this.forestRegionNoise, x * freq, z * freq, 1, 2, 0.5, 0);
		return (raw + 1) * 0.5;
	}

	/** Continuous forest coverage in [0, 1] — 0 open ground, ~0.5 woodland, 1 dense forest. */
	getForestDensity(worldX: number, worldZ: number): number {
		const f = this.settings.forest;
		const maskValue = this.sampleForestMaskValue01(worldX, worldZ);
		const forestWeight = smoothstep(
			f.forestThreshold - f.forestBlendWidth,
			f.forestThreshold + f.forestBlendWidth,
			maskValue
		);
		if (forestWeight <= 0) return 0;

		let density = forestWeight;

		if (f.treeClusterStrength > 0) {
			const clusterFreq = 1 / Math.max(1, f.treeClusterScale);
			const clusterRaw = fbm2D(
				this.clusterNoise,
				worldX * clusterFreq,
				worldZ * clusterFreq,
				2,
				2,
				0.5,
				0
			);
			density *= Math.max(0, 1 + clusterRaw * f.treeClusterStrength);
		}

		if (f.clearingStrength > 0) {
			const clearingFreq = 1 / Math.max(1, f.clearingScale);
			const clearingRaw = fbm2D(
				this.clearingNoise,
				worldX * clearingFreq,
				worldZ * clearingFreq,
				1,
				2,
				0.5,
				0
			);
			const clearingNorm = (clearingRaw + 1) * 0.5;
			const clearingBlend = 0.1;
			const hole =
				smoothstep(
					f.clearingThreshold - clearingBlend,
					f.clearingThreshold + clearingBlend,
					clearingNorm
				) * f.clearingStrength;
			density -= hole;
		}

		return clamp01(density);
	}
}
