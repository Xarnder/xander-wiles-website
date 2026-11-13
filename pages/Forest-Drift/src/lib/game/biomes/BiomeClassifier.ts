import { smoothstep } from '../terrain/mathUtils';
import { BIOME_DEFINITIONS, biomeIndex } from './biomeDefinitions';
import {
	BIOME_COUNT,
	type BiomeSettings,
	type BiomeWeightVector,
	type ClimateSample,
	type LandformClass,
	type LandformClassWeights
} from './BiomeTypes';

/**
 * Half-width of a border in climate units. Climate changes by roughly 1 / 3000 per metre at Normal
 * size, so this gives borders around 60–90 m wide before `borderSharpness` narrows them.
 */
export const CLIMATE_FEATHER = 0.03;
/** Half-width of the rarity border around a variant patch. */
const RARITY_FEATHER = 0.04;
/** Weights below this are dropped (and the rest renormalised) so blends stay small. */
const MIN_WEIGHT = 0.01;

const PLAINS_INDEX = biomeIndex('plains');

/** A 1D soft band: 1 inside [lo, hi], fading over ±feather. Open at the 0 and 1 ends. */
function band(value: number, lo: number, hi: number, feather: number): number {
	const enter = lo <= 0 ? 1 : smoothstep(lo - feather, lo + feather, value);
	if (enter <= 0) return 0;
	const leave = hi >= 1 ? 1 : 1 - smoothstep(hi - feather, hi + feather, value);
	return enter * leave;
}

/** Precomputed, flat definition data so `classify` does no lookups or allocation. */
interface CompiledBox {
	biome: number;
	landform: 0 | 1 | 2;
	t0: number;
	t1: number;
	m0: number;
	m1: number;
}

const LANDFORM_INDEX: Record<LandformClass, 0 | 1 | 2> = { lowland: 0, highland: 1, mountain: 2 };

const BOXES: readonly CompiledBox[] = BIOME_DEFINITIONS.flatMap((def, biome) =>
	def.boxes.map((b) => ({
		biome,
		landform: LANDFORM_INDEX[b.landform],
		t0: b.temperature[0],
		t1: b.temperature[1],
		m0: b.moisture[0],
		m1: b.moisture[1]
	}))
);

interface CompiledVariant {
	biome: number;
	parent: number;
}

const VARIANTS: readonly CompiledVariant[] = BIOME_DEFINITIONS.flatMap((def, biome) =>
	def.overlay?.kind === 'variant' ? [{ biome, parent: biomeIndex(def.overlay.parent) }] : []
);

const LOW_WET = BIOME_DEFINITIONS.flatMap((def, biome) =>
	def.overlay?.kind === 'lowWet' ? [{ biome, ...def.overlay }] : []
);

/**
 * Macro elevation band (metres, `TerrainHeightSampler.sampleMacroElevation`) over which ground turns
 * from lowland to upland: raised plateaus about a kilometre or more across, roughly the highest 15%
 * of the world. The terrain's own highlands landform is NOT used — it peaks every ~900 m as
 * 300–400 m bumps, which would scatter upland biomes across the map as spots.
 */
export const UPLAND_MACRO_BAND: readonly [number, number] = [5.5, 8.5];
/** (mountain landform weight × mountain range mask) band over which ground becomes real mountain. */
export const MOUNTAIN_BAND: readonly [number, number] = [0.25, 0.55];
/** Class weights are rounded to this grid (cross-engine safety, see ClimateSampler). */
const CLASS_QUANTUM = 1024;

function quantizeClass(value: number): number {
	return Math.round(value * CLASS_QUANTUM) / CLASS_QUANTUM;
}

/**
 * Lowland / upland / mountain weights from the terrain's large-scale inputs:
 * - `macroElevation`: plateaus and basins (`sampleMacroElevation`), metres;
 * - `mountainWeight`: the terrain's own mountain landform weight;
 * - `mountainRange`: the mountain range mask — 0 where the mountain recipe adds no height, so flat
 *   ground the landform mask merely calls "mountains" is never treated as a mountain.
 * Mountains can rise from lowland or plateau; what isn't mountain splits by plateau height. Inputs
 * are rounded to 1/1024 first, so the products are exact and the three always sum to exactly 1.
 */
export function landformClasses(
	macroElevation: number,
	mountainWeight: number,
	mountainRange: number,
	out: LandformClassWeights
): LandformClassWeights {
	const upland = quantizeClass(
		smoothstep(UPLAND_MACRO_BAND[0], UPLAND_MACRO_BAND[1], macroElevation)
	);
	const mountain = quantizeClass(
		smoothstep(MOUNTAIN_BAND[0], MOUNTAIN_BAND[1], mountainWeight * mountainRange)
	);
	out.mountain = mountain;
	out.highland = upland * (1 - mountain);
	out.lowland = (1 - upland) * (1 - mountain);
	return out;
}

export interface BiomeClassifierInput {
	climate: ClimateSample;
	landform: LandformClassWeights;
	/** Pre-water, pre-edit terrain height (`sampleBase`), metres. */
	baseElevation: number;
}

/**
 * Turns climate + landform + elevation into a blend of biomes (a weight per biome, summing to 1).
 *
 * 1. Base biomes partition each landform class's climate square (see `biomeDefinitions.ts`). Each
 *    box's score is a product of two soft bands; along every border the two sides' bands sum to
 *    exactly 1, so the base scores already sum to 1 with no division.
 * 2. Scores are weighted by the landform class weights (`landformClasses`), so the edge of an upland
 *    blends the upland and lowland biomes for the same climate.
 * 3. Overlays: the swamp takes a share of everything in its warm, very wet, low lowland box; then
 *    each variant takes the high-rarity share of its parent.
 * 4. `borderSharpness` raises scores to a power and renormalises (narrower borders), and tiny
 *    weights are dropped.
 *
 * Never allocates. Returns the index of the dominant biome.
 */
export function classifyBiomes(
	input: BiomeClassifierInput,
	settings: BiomeSettings,
	out: BiomeWeightVector
): number {
	const { climate, landform } = input;
	const t = climate.temperature;
	const m = climate.moisture;
	out.fill(0);

	const classWeight0 = landform.lowland;
	const classWeight1 = landform.highland;
	const classWeight2 = landform.mountain;

	for (let i = 0; i < BOXES.length; i++) {
		const b = BOXES[i];
		const w = b.landform === 0 ? classWeight0 : b.landform === 1 ? classWeight1 : classWeight2;
		if (w <= 0) continue;
		const s = band(t, b.t0, b.t1, CLIMATE_FEATHER);
		if (s <= 0) continue;
		const sm = band(m, b.m0, b.m1, CLIMATE_FEATHER);
		if (sm <= 0) continue;
		out[b.biome] += w * s * sm;
	}

	for (let i = 0; i < LOW_WET.length; i++) {
		const o = LOW_WET[i];
		const c =
			classWeight0 *
			band(t, o.temperature[0], o.temperature[1], CLIMATE_FEATHER) *
			band(m, o.moisture[0], o.moisture[1], CLIMATE_FEATHER) *
			(1 - smoothstep(o.maxElevation[0], o.maxElevation[1], input.baseElevation));
		if (c <= 0) continue;
		let total = 0;
		for (let k = 0; k < BIOME_COUNT; k++) {
			if (k === o.biome) continue;
			total += out[k];
			out[k] *= 1 - c;
		}
		out[o.biome] += total * c;
	}

	const rarity = settings.variantRarity;
	if (rarity > 0) {
		const edge = 1 - rarity;
		const gate = smoothstep(edge - RARITY_FEATHER, edge + RARITY_FEATHER, climate.rarity);
		if (gate > 0) {
			for (let i = 0; i < VARIANTS.length; i++) {
				const v = VARIANTS[i];
				const parentWeight = out[v.parent];
				if (parentWeight <= 0) continue;
				out[v.biome] += parentWeight * gate;
				out[v.parent] = parentWeight * (1 - gate);
			}
		}
	}

	const sharpness = settings.borderSharpness;
	let total = 0;
	for (let k = 0; k < BIOME_COUNT; k++) {
		const w = out[k];
		if (w <= 0) continue;
		const sharpened = sharpness === 1 ? w : Math.pow(w, sharpness);
		out[k] = sharpened;
		total += sharpened;
	}
	if (!(total > 0)) {
		// Unreachable while the base boxes partition every landform class, but never return "no biome".
		out.fill(0);
		out[PLAINS_INDEX] = 1;
		return PLAINS_INDEX;
	}

	let kept = 0;
	for (let k = 0; k < BIOME_COUNT; k++) {
		const w = out[k] / total;
		if (w < MIN_WEIGHT) {
			out[k] = 0;
			continue;
		}
		out[k] = w;
		kept += w;
	}
	let dominant = PLAINS_INDEX;
	let best = -1;
	for (let k = 0; k < BIOME_COUNT; k++) {
		if (out[k] === 0) continue;
		out[k] /= kept;
		if (out[k] > best) {
			best = out[k];
			dominant = k;
		}
	}
	return dominant;
}
