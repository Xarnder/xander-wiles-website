import {
	cellular,
	createCellularSample,
	fbm,
	fbm01,
	gradientNoise,
	hash01,
	smoothstep
} from '../noise/tileableNoise';
import type { ResolvedMaterialRecipe, RgbColor } from '../ProceduralMaterialTypes';
import { mixRgb, type SurfaceCanvas } from '../SurfaceCanvas';
import {
	layerSeeds,
	layoutRandom,
	paletteColor,
	periodFor,
	randomPartition,
	segmentIndex
} from './generatorUtils';

const LAYER = { cells: 1, edge: 2, face: 3, faceFine: 4, moss: 5, dirt: 6, grit: 7, tilt: 8 };

/** Where a texel falls in the stone layout: which stone, and how far from that stone's edge. */
interface StoneHit {
	/** Stable per-stone hash in [0, 1). */
	id: number;
	/** Second independent per-stone hash in [0, 1). */
	id2: number;
	/** Distance to the stone's outline, in metres (0 on the joint centreline). */
	edge: number;
	/** Position inside the stone relative to its centre, roughly −0.5..0.5 per axis (for tilt). */
	localX: number;
	localY: number;
}

interface StoneStyle {
	/** Half the mortar/joint width, metres. */
	jointHalf: number;
	/** Width of the rounded/chamfered band at each stone edge, metres. */
	bevel: number;
	/** How far stone faces stand proud of the joint fill, metres. */
	proud: number;
	/** Extra crowning of each stone (cobbles are domed, flags flat), metres. */
	dome: number;
	/** Rough face relief amplitude, metres. */
	faceRelief: number;
	/** Outline irregularity (chipped edges), metres. */
	edgeChip: number;
	/** Per-stone random tilt, metres across the stone. */
	tilt: number;
	/** Polished, lighter, smoother tops (paving under foot traffic). */
	worn: boolean;
	jointColor: RgbColor;
	jointRoughness: number;
}

type StoneLocator = (u: number, v: number, s: number, t: number, out: StoneHit) => void;

/** Running-bond courses: course heights vary, each course has its own random block lengths and offset. */
function coursedLocator(
	tileWidth: number,
	tileHeight: number,
	seed: number,
	courseHeight: number,
	blockLength: number,
	spread: number
): StoneLocator {
	const random = layoutRandom(seed, 11);
	const courseCount = Math.max(1, Math.round(tileHeight / courseHeight));
	const courses = randomPartition(tileHeight, courseCount, spread, random);
	const rows = Array.from({ length: courseCount }, () => {
		const blocks = Math.max(1, Math.round(tileWidth / blockLength));
		return {
			boundaries: randomPartition(tileWidth, blocks, spread * 1.2, random),
			offset: random() * tileWidth
		};
	});
	// Phase-shift the courses so the tile edge falls mid-course, not on a bed joint.
	const phaseV = random() * tileHeight;
	return (u, rawV, _s, _t, out) => {
		let v = (rawV + phaseV) % tileHeight;
		if (v < 0) v += tileHeight;
		const course = segmentIndex(courses, v);
		const bottom = courses[course];
		const top = courses[course + 1];
		const row = rows[course];
		let shifted = (u - row.offset) % tileWidth;
		if (shifted < 0) shifted += tileWidth;
		const block = segmentIndex(row.boundaries, shifted);
		const left = row.boundaries[block];
		const right = row.boundaries[block + 1];
		out.edge = Math.min(shifted - left, right - shifted, v - bottom, top - v);
		out.id = hash01(course, block, seed);
		out.id2 = hash01(block, course, seed + 3);
		out.localX = (shifted - left) / (right - left) - 0.5;
		out.localY = (v - bottom) / (top - bottom) - 0.5;
	};
}

/** Voronoi stones (cobbles, flagstones, fieldstone) with an exact joint distance. */
function cellularLocator(
	tileWidth: number,
	tileHeight: number,
	seed: number,
	stoneSize: number,
	jitter: number,
	aspectY: number
): StoneLocator {
	const cellsX = Math.max(2, Math.round(tileWidth / stoneSize));
	const cellsY = Math.max(2, Math.round(tileHeight / (stoneSize * aspectY)));
	const cellSizeX = tileWidth / cellsX;
	// Exact physical cell aspect after rounding, so distances are isotropic in metres.
	const cellAspect = tileHeight / cellsY / cellSizeX;
	const sample = createCellularSample();
	return (_u, _v, s, t, out) => {
		cellular(s * cellsX, t * cellsY, cellsX, cellsY, seed, jitter, sample, cellAspect);
		out.edge = sample.border * cellSizeX;
		out.id = (sample.cellId & 0xffff) / 65536;
		out.id2 = (sample.cellId >>> 16) / 65536;
		out.localX = -sample.toCenterX;
		out.localY = -sample.toCenterY;
	};
}

function paintStones(
	canvas: SurfaceCanvas,
	recipe: ResolvedMaterialRecipe,
	locate: StoneLocator,
	style: StoneStyle,
	colors: { stone: RgbColor; dark: RgbColor; light: RgbColor; dirt: RgbColor; moss: RgbColor }
): void {
	const { size, tileWidth, tileHeight } = canvas;
	const seeds = layerSeeds(recipe.seed, LAYER);
	const variation = recipe.variation;
	const weathering = recipe.weathering;

	const edgeP = periodFor(tileWidth, 0.05);
	const faceP = periodFor(tileWidth, 0.12);
	const faceFineP = periodFor(tileWidth, 0.025);
	const mossP = periodFor(tileWidth, 0.7);
	const dirtP = periodFor(tileWidth, 0.9);
	const gritP = Math.max(8, Math.round(size / 2));
	const hit: StoneHit = { id: 0, id2: 0, edge: 0, localX: 0, localY: 0 };

	for (let y = 0; y < size; y++) {
		const t = (y + 0.5) / size;
		const v = t * tileHeight;
		for (let x = 0; x < size; x++) {
			const s = (x + 0.5) / size;
			const u = s * tileWidth;
			const i = y * size + x;

			locate(u, v, s, t, hit);
			const chip = fbm(s, t, edgeP, edgeP, 2, seeds.edge) * style.edgeChip;
			const edge = hit.edge + chip;
			const stoneMask = smoothstep(style.jointHalf * 0.6, style.jointHalf * 1.25, edge);
			const bevel = smoothstep(style.jointHalf, style.jointHalf + style.bevel, edge);

			const face = fbm(s, t, faceP, faceP, 3, seeds.face);
			const faceFine = gradientNoise(
				s * faceFineP,
				t * faceFineP,
				faceFineP,
				faceFineP,
				seeds.faceFine
			);
			const grit = gradientNoise(s * gritP, t * gritP, gritP, gritP, seeds.grit);
			const mossField = fbm01(s, t, mossP, mossP, 3, seeds.moss);
			const dirtField = fbm01(s, t, dirtP, dirtP, 3, seeds.dirt);

			// Stone colour: per-stone tone + gentle face mottling.
			const tone = (hit.id - 0.5) * 2 * variation;
			const stoneColor =
				tone > 0
					? mixRgb(colors.stone, colors.light, tone * 0.8)
					: mixRgb(colors.stone, colors.dark, -tone * 0.9);
			canvas.setColor(i, stoneColor);
			if (hit.id2 > 0.88) canvas.mixColor(i, colors.dirt, 0.12 + weathering * 0.15);
			canvas.scaleColor(i, 1 + face * 0.08 + faceFine * 0.04 + grit * 0.025);
			// Worn, slightly lighter arrises.
			canvas.mixColor(i, colors.light, (1 - bevel) * stoneMask * 0.22 * (0.4 + weathering));
			if (style.worn) canvas.mixColor(i, colors.light, bevel * 0.08 * (1 - hit.id2));
			canvas.mixColor(i, colors.dirt, smoothstep(0.55, 0.95, dirtField) * recipe.dirt * 0.18);

			// Joint fill: mortar or sand/soil, dirtier and mossier than the stones.
			const jointColor = mixRgb(style.jointColor, colors.dirt, recipe.dirt * 0.45);
			// Joints read darker than the stone faces: shadowed, damp and dirt-filled.
			const jointShade = 0.72 + grit * 0.08;
			const jr = jointColor[0] * jointShade;
			const jg = jointColor[1] * jointShade;
			const jb = jointColor[2] * jointShade;
			canvas.mixColor(i, [jr, jg, jb], 1 - stoneMask);

			// Moss: in joints and creeping onto the edges of stones in damp patches.
			const mossPatch = smoothstep(0.45, 0.8, mossField) * recipe.moss;
			const mossInJoint = (1 - stoneMask) * mossPatch;
			const mossOnEdge =
				stoneMask * (1 - bevel) * mossPatch * 0.5 * smoothstep(0.3, 0.7, grit * 0.5 + 0.5);
			canvas.mixColor(i, colors.moss, Math.min(1, mossInJoint * 0.85 + mossOnEdge));

			const tilt = (hit.localX * (hit.id - 0.5) + hit.localY * (hit.id2 - 0.5)) * style.tilt * 2;
			const stoneHeight =
				style.proud + bevel * style.dome + (face * 0.6 + faceFine * 0.4) * style.faceRelief + tilt;
			const jointHeight = grit * 0.0006 + mossInJoint * 0.0015;
			canvas.height[i] = jointHeight + (stoneHeight - jointHeight) * stoneMask;

			const stoneRoughness =
				recipe.roughness + face * 0.04 - (style.worn ? bevel * 0.1 * (1 - hit.id2) : 0);
			canvas.roughness[i] = Math.min(
				1,
				stoneRoughness +
					(style.jointRoughness - stoneRoughness) * (1 - stoneMask) +
					mossInJoint * 0.05
			);
		}
	}
}

/**
 * Masonry for foundations, retaining walls and steps. Coursed variants (`dressed`, `cut-block`,
 * `rough`) lay random-length blocks in courses of varying height with mortar that recedes behind the
 * stone faces; `fieldstone` uses flattened Voronoi stones for irregular rubble walling. V is up on
 * vertical faces, so courses stay horizontal and line up around corners.
 */
export function paintMasonry(canvas: SurfaceCanvas, recipe: ResolvedMaterialRecipe): void {
	const { tileWidth, tileHeight } = canvas;
	const seed = recipe.seed;
	const colors = {
		stone: paletteColor(recipe, 'stone'),
		dark: paletteColor(recipe, 'dark'),
		light: paletteColor(recipe, 'light'),
		dirt: paletteColor(recipe, 'dirt'),
		moss: paletteColor(recipe, 'moss')
	};
	const mortar = paletteColor(recipe, 'mortar');

	switch (recipe.variant) {
		case 'dressed':
			paintStones(
				canvas,
				recipe,
				coursedLocator(tileWidth, tileHeight, seed, 0.3, 0.75, 0.12),
				{
					jointHalf: 0.005,
					bevel: 0.012,
					proud: 0.006,
					dome: 0.002,
					faceRelief: 0.0015,
					edgeChip: 0.002,
					tilt: 0.001,
					worn: false,
					jointColor: mortar,
					jointRoughness: 0.95
				},
				colors
			);
			return;
		case 'fieldstone':
			paintStones(
				canvas,
				recipe,
				cellularLocator(tileWidth, tileHeight, seed, 0.32, 0.95, 0.55),
				{
					jointHalf: 0.016,
					bevel: 0.05,
					proud: 0.008,
					dome: 0.012,
					faceRelief: 0.005,
					edgeChip: 0.008,
					tilt: 0.004,
					worn: false,
					jointColor: mortar,
					jointRoughness: 0.97
				},
				colors
			);
			return;
		case 'rough':
			paintStones(
				canvas,
				recipe,
				coursedLocator(tileWidth, tileHeight, seed, 0.26, 0.5, 0.35),
				{
					jointHalf: 0.012,
					bevel: 0.045,
					proud: 0.008,
					dome: 0.012,
					faceRelief: 0.006,
					edgeChip: 0.012,
					tilt: 0.004,
					worn: false,
					jointColor: mortar,
					jointRoughness: 0.97
				},
				colors
			);
			return;
		default:
			// 'cut-block': quarry-faced blocks in irregular courses — the reference retaining wall.
			paintStones(
				canvas,
				recipe,
				coursedLocator(tileWidth, tileHeight, seed, 0.34, 0.7, 0.42),
				{
					jointHalf: 0.009,
					bevel: 0.03,
					proud: 0.007,
					dome: 0.007,
					faceRelief: 0.0045,
					edgeChip: 0.008,
					tilt: 0.003,
					worn: false,
					jointColor: mortar,
					jointRoughness: 0.96
				},
				colors
			);
	}
}

/**
 * Courtyard and path paving. `cobble` is small domed Voronoi stones with sandy, gritty joints;
 * `setts` is rectangular stones laid in courses; `flagstone` is large, flat, slightly tilted
 * irregular slabs with thin joints. Worn tops are a touch lighter and smoother than the edges.
 */
export function paintPaving(canvas: SurfaceCanvas, recipe: ResolvedMaterialRecipe): void {
	const { tileWidth, tileHeight } = canvas;
	const seed = recipe.seed;
	const colors = {
		stone: paletteColor(recipe, 'stone'),
		dark: paletteColor(recipe, 'dark'),
		light: paletteColor(recipe, 'light'),
		dirt: paletteColor(recipe, 'joint'),
		moss: paletteColor(recipe, 'moss')
	};
	const joint = paletteColor(recipe, 'joint');

	switch (recipe.variant) {
		case 'setts':
			paintStones(
				canvas,
				recipe,
				coursedLocator(tileWidth, tileHeight, seed, 0.16, 0.26, 0.2),
				{
					jointHalf: 0.006,
					bevel: 0.02,
					proud: 0.006,
					dome: 0.005,
					faceRelief: 0.002,
					edgeChip: 0.004,
					tilt: 0.003,
					worn: true,
					jointColor: joint,
					jointRoughness: 0.98
				},
				colors
			);
			return;
		case 'flagstone':
			paintStones(
				canvas,
				recipe,
				cellularLocator(tileWidth, tileHeight, seed, 0.65, 0.9, 0.8),
				{
					jointHalf: 0.007,
					bevel: 0.012,
					proud: 0.005,
					dome: 0.001,
					faceRelief: 0.0025,
					edgeChip: 0.006,
					tilt: 0.005,
					worn: true,
					jointColor: joint,
					jointRoughness: 0.98
				},
				colors
			);
			return;
		default:
			paintStones(
				canvas,
				recipe,
				cellularLocator(tileWidth, tileHeight, seed, 0.24, 0.85, 0.85),
				{
					jointHalf: 0.0075,
					bevel: 0.05,
					proud: 0.004,
					dome: 0.012,
					faceRelief: 0.002,
					edgeChip: 0.005,
					tilt: 0.003,
					worn: true,
					jointColor: joint,
					jointRoughness: 0.98
				},
				colors
			);
	}
}
