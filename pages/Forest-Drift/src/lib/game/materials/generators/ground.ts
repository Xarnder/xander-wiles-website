import {
	cellular,
	createCellularSample,
	fbm,
	fbm01,
	gradientNoise,
	hash01,
	smoothstep
} from '../noise/tileableNoise';
import type { ResolvedMaterialRecipe } from '../ProceduralMaterialTypes';
import { mixRgb, type SurfaceCanvas } from '../SurfaceCanvas';
import { layerSeeds, layoutRandom, paletteColor, periodFor } from './generatorUtils';

const GROUND_LAYER = { clump: 1, mottle: 2, fine: 3, pebbles: 4, pebblesSmall: 5, damp: 6 };

/** Pebble density (fraction of cells holding a stone) for each ground variant. */
const PEBBLE_DENSITY: Record<string, number> = { soil: 0.06, path: 0.32, gravel: 0.92 };

/**
 * Bare ground for paths and exposed earth. Several scales of soil clumping and colour, damp darker
 * patches, plus pebbles placed per Voronoi cell (so stones are discrete, rounded objects rather than
 * noise speckle). `soil` → `path` → `gravel` only changes pebble density and size, so the three blend
 * naturally where they meet.
 */
export function paintGround(canvas: SurfaceCanvas, recipe: ResolvedMaterialRecipe): void {
	const { size, tileWidth, tileHeight } = canvas;
	const seeds = layerSeeds(recipe.seed, GROUND_LAYER);
	const soil = paletteColor(recipe, 'soil');
	const dark = paletteColor(recipe, 'dark');
	const pebble = paletteColor(recipe, 'pebble');
	const gravel = paletteColor(recipe, 'gravel');
	const density = PEBBLE_DENSITY[recipe.variant] ?? PEBBLE_DENSITY.path;

	const clumpP = periodFor(tileWidth, 0.08);
	const mottleP = periodFor(tileWidth, 0.5);
	const dampP = periodFor(tileWidth, 1.2);
	const fineP = Math.max(8, Math.round(size / 2));
	const pebbleCells = Math.max(4, Math.round(tileWidth / 0.035));
	const smallCells = Math.max(4, Math.round(tileWidth / 0.012));
	const pebbleCellSize = tileWidth / pebbleCells;
	const smallCellSize = tileWidth / smallCells;
	const big = createCellularSample();
	const small = createCellularSample();
	const pebbleCellsY = Math.max(4, Math.round(tileHeight / pebbleCellSize));
	const smallCellsY = Math.max(4, Math.round(tileHeight / smallCellSize));

	for (let y = 0; y < size; y++) {
		const t = (y + 0.5) / size;
		for (let x = 0; x < size; x++) {
			const s = (x + 0.5) / size;
			const i = y * size + x;

			const clump = fbm(s, t, clumpP, clumpP, 3, seeds.clump);
			const mottle = fbm01(s, t, mottleP, mottleP, 3, seeds.mottle);
			const damp = smoothstep(0.55, 0.85, fbm01(s, t, dampP, dampP, 2, seeds.damp));
			const fine = gradientNoise(s * fineP, t * fineP, fineP, fineP, seeds.fine);

			canvas.setColor(i, mixRgb(soil, dark, mottle * 0.6 * recipe.variation + damp * 0.35));
			canvas.scaleColor(i, 1 + clump * 0.1 + fine * 0.05);
			let height = clump * 0.004 + fine * 0.0004;
			let roughness = recipe.roughness - damp * 0.08;

			// Two sizes of pebble, each a discrete rounded stone in its own Voronoi cell.
			cellular(
				s * pebbleCells,
				t * pebbleCellsY,
				pebbleCells,
				pebbleCellsY,
				seeds.pebbles,
				0.8,
				big
			);
			const bigPresent = hash01(big.cellId, 1, seeds.pebbles) < density;
			if (bigPresent) {
				const radius = 0.32 + hash01(big.cellId, 2, seeds.pebbles) * 0.15;
				const dome = 1 - smoothstep(radius * 0.55, radius, big.f1);
				if (dome > 0) {
					const tone = hash01(big.cellId, 3, seeds.pebbles);
					canvas.mixColor(i, mixRgb(pebble, gravel, tone), smoothstep(0, 0.3, dome));
					canvas.scaleColor(i, 0.9 + dome * 0.2);
					height = Math.max(height, Math.sqrt(dome) * pebbleCellSize * 0.35);
					roughness -= dome * 0.12;
				}
			}
			cellular(
				s * smallCells,
				t * smallCellsY,
				smallCells,
				smallCellsY,
				seeds.pebblesSmall,
				0.9,
				small
			);
			if (hash01(small.cellId, 1, seeds.pebblesSmall) < density * 0.8) {
				const dome = 1 - smoothstep(0.2, 0.42, small.f1);
				if (dome > 0) {
					canvas.mixColor(
						i,
						mixRgb(gravel, pebble, hash01(small.cellId, 2, seeds.pebblesSmall)),
						dome * 0.8
					);
					height = Math.max(height, dome * smallCellSize * 0.3);
				}
			}

			canvas.height[i] = height;
			canvas.roughness[i] = Math.min(1, Math.max(0, roughness));
		}
	}
}

const GRASS_LAYER = { density: 1, dry: 2, direction: 3, soil: 4 };

/**
 * Grass ground cover, seen from above. Drawn as thousands of short blades (anti-aliased strokes with
 * a height buffer, so overlapping blades occlude each other) over dark soil, with broad patches of
 * lusher/drier grass and occasional bare earth and small flowers. Used on terrain as a DETAIL map:
 * the terrain's own vertex colours keep the biome/elevation colour, and the material colour is set
 * to the inverse of this texture's mean so it adds blade structure without shifting the average —
 * see `ProceduralMaterialLibrary.bindVertexColoredDetail`.
 */
export function paintGrass(canvas: SurfaceCanvas, recipe: ResolvedMaterialRecipe): void {
	const { size, tileWidth, tileHeight } = canvas;
	const seeds = layerSeeds(recipe.seed, GRASS_LAYER);
	const base = paletteColor(recipe, 'base');
	const dark = paletteColor(recipe, 'dark');
	const light = paletteColor(recipe, 'light');
	const dry = paletteColor(recipe, 'dry');
	const soil = paletteColor(recipe, 'soil');
	const flower = paletteColor(recipe, 'flower');

	const densityP = periodFor(tileWidth, 0.6);
	const dryP = periodFor(tileWidth, 1.3);
	const directionP = periodFor(tileWidth, 0.35);
	const soilP = periodFor(tileWidth, 0.15);
	const texelsPerMetre = size / tileWidth;
	const mask = size - 1;

	// Ground layer under the blades.
	for (let y = 0; y < size; y++) {
		const t = (y + 0.5) / size;
		for (let x = 0; x < size; x++) {
			const s = (x + 0.5) / size;
			const i = y * size + x;
			const soilNoise = fbm01(s, t, soilP, soilP, 2, seeds.soil);
			canvas.setColor(i, mixRgb(soil, dark, 0.35 + soilNoise * 0.4));
			canvas.height[i] = soilNoise * 0.002;
			canvas.roughness[i] = 0.98;
		}
	}

	const random = layoutRandom(recipe.seed, 21);
	const bladeCount = Math.round((size * size) / 5);
	const fieldAt = (u: number, v: number, period: number, seed: number) =>
		fbm01(
			u / tileWidth,
			v / tileHeight,
			period,
			Math.max(1, Math.round((period * tileHeight) / tileWidth)),
			3,
			seed
		);

	for (let b = 0; b < bladeCount; b++) {
		const u = random() * tileWidth;
		const v = random() * tileHeight;
		const roll = random();
		const density = fieldAt(u, v, densityP, seeds.density);
		// Sparse, patchy spots of bare earth where density is lowest.
		if (roll > 0.35 + density * 0.9) continue;
		const dryness =
			smoothstep(0.5, 0.85, fieldAt(u, v, dryP, seeds.dry)) * (0.4 + recipe.weathering);
		const flowDir = fieldAt(u, v, directionP, seeds.direction) * Math.PI * 4;
		const angle = flowDir + (random() - 0.5) * 1.6;
		const length = 0.018 + random() * 0.03;
		const halfWidth = Math.max(0.55, (0.0012 + random() * 0.001) * texelsPerMetre);
		const tone = random();
		let color = tone < 0.5 ? mixRgb(dark, base, tone * 2) : mixRgb(base, light, (tone - 0.5) * 2);
		if (random() < dryness) color = mixRgb(color, dry, 0.5 + random() * 0.5);
		const bladeTop = length * (0.5 + random() * 0.5);

		const dx = Math.cos(angle) * length * texelsPerMetre;
		const dy = Math.sin(angle) * length * texelsPerMetre;
		const steps = Math.max(2, Math.ceil(Math.hypot(dx, dy) * 2));
		const x0 = u * texelsPerMetre;
		const y0 = (v / tileHeight) * size;
		for (let k = 0; k <= steps; k++) {
			const f = k / steps;
			const px = x0 + dx * f;
			const py = y0 + dy * f;
			const h = 0.003 + bladeTop * f;
			const r = halfWidth * (1 - f * 0.6);
			const minX = Math.floor(px - r);
			const maxX = Math.ceil(px + r);
			const minY = Math.floor(py - r);
			const maxY = Math.ceil(py + r);
			for (let ty = minY; ty <= maxY; ty++) {
				for (let tx = minX; tx <= maxX; tx++) {
					const ddx = tx + 0.5 - px;
					const ddy = ty + 0.5 - py;
					const coverage = 1 - smoothstep(r * 0.5, r + 0.5, Math.sqrt(ddx * ddx + ddy * ddy));
					if (coverage <= 0) continue;
					const i = (ty & mask) * size + (tx & mask);
					if (h * coverage <= canvas.height[i]) continue;
					canvas.height[i] = h * coverage + canvas.height[i] * (1 - coverage);
					canvas.mixColor(i, color, coverage);
					// Lighter toward the tip, as blades catch the sky.
					canvas.scaleColor(i, 1 + f * 0.12 * coverage);
					canvas.roughness[i] = 0.9;
				}
			}
		}
	}

	// A few clusters of tiny flowers.
	const clusters = Math.round(tileWidth * tileHeight * 1.5);
	for (let c = 0; c < clusters; c++) {
		const cu = random() * tileWidth;
		const cv = random() * tileHeight;
		const count = 3 + Math.floor(random() * 6);
		for (let k = 0; k < count; k++) {
			const fx = Math.round((cu + (random() - 0.5) * 0.1) * texelsPerMetre);
			const fy = Math.round((cv / tileHeight + (random() - 0.5) * (0.1 / tileHeight)) * size);
			const radius = Math.max(1, Math.round(0.004 * texelsPerMetre));
			for (let oy = -radius; oy <= radius; oy++) {
				for (let ox = -radius; ox <= radius; ox++) {
					if (ox * ox + oy * oy > radius * radius) continue;
					const i = ((fy + oy) & mask) * size + ((fx + ox) & mask);
					canvas.setColor(i, flower);
					canvas.height[i] += 0.002;
				}
			}
		}
	}
}

const GLASS_LAYER = { wave: 1, smudge: 2, tint: 3 };

/**
 * Window glass: a dark, environment-reflecting tint with very low roughness. The maps only add the
 * subtle imperfections that stop a pane looking like a flat colour: gentle waviness (stronger for
 * `old` crown glass) and faint smudges that raise roughness slightly.
 */
export function paintGlass(canvas: SurfaceCanvas, recipe: ResolvedMaterialRecipe): void {
	const { size, tileWidth } = canvas;
	const seeds = layerSeeds(recipe.seed, GLASS_LAYER);
	const tint = paletteColor(recipe, 'tint');
	const sheen = paletteColor(recipe, 'sheen');
	const old = recipe.variant === 'old';
	const waveP = periodFor(tileWidth, old ? 0.15 : 0.4);
	const smudgeP = periodFor(tileWidth, 0.2);
	const tintP = periodFor(tileWidth, 0.5);

	for (let y = 0; y < size; y++) {
		const t = (y + 0.5) / size;
		for (let x = 0; x < size; x++) {
			const s = (x + 0.5) / size;
			const i = y * size + x;
			const wave = fbm(s, t, waveP, waveP, 3, seeds.wave);
			const smudge = smoothstep(0.55, 0.85, fbm01(s, t, smudgeP, smudgeP, 3, seeds.smudge));
			const tintVariation = fbm01(s, t, tintP, tintP, 2, seeds.tint);
			canvas.setColor(i, mixRgb(tint, sheen, tintVariation * 0.08 * recipe.variation));
			canvas.height[i] = wave * (old ? 0.0006 : 0.00015);
			canvas.roughness[i] = Math.min(1, recipe.roughness + smudge * recipe.dirt * 0.25);
		}
	}
}
