import { BIOME_COUNT } from '../biomes/BiomeTypes';
import { lakeRadiusAt } from '../hydrology/HydrologyMath';
import type { LakeDefinition, RiverDefinition } from '../hydrology/HydrologyTypes';
import { BIOME_MAP_RGB, NEUTRAL_LAND_RGB, WATER_RGB } from './biomeMapPalette';

/**
 * Biome map tiles (biome minimap, technical plan §4): pure maths and pixel drawing, shared by the
 * map worker and the tests. No DOM, no Three.js.
 *
 * Orientation: north up. Screen up is world −Z (where the camera faces at yaw 0), screen right is
 * world +X. A tile's pixel row 0 is its northern (smallest Z) edge.
 */

/** Pixels per tile edge. */
export const TILE_PIXELS = 128;
/** Levels 0–6: 2, 4, … 128 metres per pixel (§4.1). */
export const MAP_LEVELS = 7;
/** Levels at or below this read the biome lattice (borders match the game exactly). */
export const LATTICE_MAX_LEVEL = 2;

export const metresPerPixel = (level: number) => 2 << level;
export const tileMetres = (level: number) => TILE_PIXELS * metresPerPixel(level);

/** The tile containing a world point at a level. */
export function tileAt(level: number, worldX: number, worldZ: number): { tx: number; tz: number } {
	const size = tileMetres(level);
	return { tx: Math.floor(worldX / size), tz: Math.floor(worldZ / size) };
}

/** Stable key for a tile of one world generation. */
export const tileKey = (generation: number, level: number, tx: number, tz: number) =>
	`${generation}:${level}:${tx}:${tz}`;

/**
 * The tiles covering a view of `widthMetres` × `heightMetres` (square by default) centred on
 * (x, z) at a level, nearest to the
 * centre first (the order they're drawn in, §4.3).
 */
export function tilesForView(
	level: number,
	centreX: number,
	centreZ: number,
	widthMetres: number,
	heightMetres = widthMetres
): { tx: number; tz: number }[] {
	const size = tileMetres(level);
	const halfX = widthMetres / 2,
		halfZ = heightMetres / 2;
	const x0 = Math.floor((centreX - halfX) / size),
		x1 = Math.floor((centreX + halfX) / size);
	const z0 = Math.floor((centreZ - halfZ) / size),
		z1 = Math.floor((centreZ + halfZ) / size);
	const out: { tx: number; tz: number; d: number }[] = [];
	for (let tz = z0; tz <= z1; tz++)
		for (let tx = x0; tx <= x1; tx++)
			out.push({
				tx,
				tz,
				d: Math.hypot((tx + 0.5) * size - centreX, (tz + 0.5) * size - centreZ)
			});
	out.sort((a, b) => a.d - b.d);
	return out.map(({ tx, tz }) => ({ tx, tz }));
}

/** What the drawing needs from the world. The worker backs it with its own terrain and biomes. */
export interface MapLandSource {
	/** Biome weights (sum 1) at a point into `out`; returns the dominant index. Null: biomes off. */
	biomeWeights:
		((worldX: number, worldZ: number, exact: boolean, out: Float32Array) => number) | null;
	/** Pre-water base terrain height (m). */
	baseHeight(worldX: number, worldZ: number): number;
	/**
	 * The base height the last exact `biomeWeights` call computed on its way (saves sampling it
	 * twice), or NaN when it didn't.
	 */
	lastHeight?(): number;
}

const SUN = (() => {
	// Light from the north-west, 45° up: x −, z − (north), y +.
	const v = [-1, Math.SQRT2, -1];
	const n = Math.hypot(v[0], v[1], v[2]);
	return { x: v[0] / n, y: v[1] / n, z: v[2] / n };
})();

/** Statistics a tile reports back (timings for the performance record). */
export interface TileDrawStats {
	landMs: number;
	waterMs: number;
}

/**
 * Draws one tile's land: biome colours blended by weight (soft borders, like the ground) or the
 * neutral land colour, with hill shading lit from the north-west. Writes RGBA into `out`
 * (TILE_PIXELS² × 4). Returns the dominant biome per pixel (−1 with biomes off) for tests.
 */
export function drawLand(
	source: MapLandSource,
	level: number,
	tx: number,
	tz: number,
	out: Uint8ClampedArray,
	dominant?: Int8Array
): void {
	const mpp = metresPerPixel(level);
	const size = TILE_PIXELS;
	const grid = size + 2;
	const originX = tx * size * mpp;
	const originZ = tz * size * mpp;
	const heights = new Float32Array(grid * grid);
	const filled = new Uint8Array(grid * grid);
	const weights = new Float32Array(BIOME_COUNT);
	const exact = level > LATTICE_MAX_LEVEL;
	const colour = new Float32Array(size * size * 3);
	for (let py = 0; py < size; py++) {
		const z = originZ + (py + 0.5) * mpp;
		for (let px = 0; px < size; px++) {
			const x = originX + (px + 0.5) * mpp;
			const p = py * size + px;
			let r: number, g: number, b: number;
			if (source.biomeWeights) {
				const top = source.biomeWeights(x, z, exact, weights);
				if (dominant) dominant[p] = top;
				r = g = b = 0;
				for (let k = 0; k < BIOME_COUNT; k++) {
					const w = weights[k];
					if (w === 0) continue;
					r += BIOME_MAP_RGB[k * 3] * w;
					g += BIOME_MAP_RGB[k * 3 + 1] * w;
					b += BIOME_MAP_RGB[k * 3 + 2] * w;
				}
				const h = exact && source.lastHeight ? source.lastHeight() : Number.NaN;
				if (!Number.isNaN(h)) {
					const gi = (py + 1) * grid + px + 1;
					heights[gi] = h;
					filled[gi] = 1;
				}
			} else {
				if (dominant) dominant[p] = -1;
				[r, g, b] = NEUTRAL_LAND_RGB;
			}
			colour[p * 3] = r;
			colour[p * 3 + 1] = g;
			colour[p * 3 + 2] = b;
		}
	}
	// Heights for the rest of the grid (the one-pixel border, and every pixel on lattice levels).
	for (let gy = 0; gy < grid; gy++)
		for (let gx = 0; gx < grid; gx++) {
			const gi = gy * grid + gx;
			if (filled[gi]) continue;
			heights[gi] = source.baseHeight(originX + (gx - 0.5) * mpp, originZ + (gy - 0.5) * mpp);
		}
	// Hill shading: zoomed out, slopes average away over a pixel, so exaggerate them more.
	const exaggerate = 1.3 + level * 0.25;
	const flat = SUN.y;
	for (let py = 0; py < size; py++)
		for (let px = 0; px < size; px++) {
			const gi = (py + 1) * grid + px + 1;
			const dx = ((heights[gi + 1] - heights[gi - 1]) / (2 * mpp)) * exaggerate;
			const dz = ((heights[gi + grid] - heights[gi - grid]) / (2 * mpp)) * exaggerate;
			// Surface normal (−dx, 1, −dz), normalised.
			const n = 1 / Math.sqrt(dx * dx + 1 + dz * dz);
			const lambert = (-dx * SUN.x + SUN.y - dz * SUN.z) * n;
			const shade = Math.min(1.18, Math.max(0.62, 1 + (lambert - flat) * 0.75));
			const p = py * size + px;
			const o = p * 4;
			out[o] = colour[p * 3] * shade;
			out[o + 1] = colour[p * 3 + 1] * shade;
			out[o + 2] = colour[p * 3 + 2] * shade;
			out[o + 3] = 255;
		}
}

/** Keeps the strongest water coverage per pixel, so overlapping segments don't darken joints. */
function cover(coverage: Float32Array, p: number, value: number) {
	if (value > coverage[p]) coverage[p] = Math.min(1, value);
}

/**
 * Draws rivers (lines along their samples, at least about a pixel wide so they stay visible when
 * zoomed out) and lakes (their shoreline shape), anti-aliased, over the land in `out`.
 */
export function drawWater(
	rivers: readonly RiverDefinition[],
	lakes: readonly LakeDefinition[],
	level: number,
	tx: number,
	tz: number,
	out: Uint8ClampedArray
): void {
	const mpp = metresPerPixel(level);
	const size = TILE_PIXELS;
	const x0 = tx * size * mpp,
		z0 = tz * size * mpp;
	const x1 = x0 + size * mpp,
		z1 = z0 + size * mpp;
	const minHalf = 0.6 * mpp;
	const coverage = new Float32Array(size * size);
	for (const lake of lakes) {
		const b = lake.bounds;
		if (b.maxX < x0 || b.minX > x1 || b.maxZ < z0 || b.minZ > z1) continue;
		const px0 = Math.max(0, Math.floor((b.minX - x0) / mpp)),
			px1 = Math.min(size - 1, Math.ceil((b.maxX - x0) / mpp));
		const pz0 = Math.max(0, Math.floor((b.minZ - z0) / mpp)),
			pz1 = Math.min(size - 1, Math.ceil((b.maxZ - z0) / mpp));
		for (let py = pz0; py <= pz1; py++)
			for (let px = px0; px <= px1; px++) {
				const dx = x0 + (px + 0.5) * mpp - lake.x,
					dz = z0 + (py + 0.5) * mpp - lake.z;
				const r = lakeRadiusAt(lake, Math.atan2(dz, dx));
				cover(coverage, py * size + px, (r - Math.hypot(dx, dz)) / mpp + 0.5);
			}
	}
	for (const river of rivers) {
		const b = river.bounds;
		const pad = 40 + minHalf;
		if (b.maxX + pad < x0 || b.minX - pad > x1 || b.maxZ + pad < z0 || b.minZ - pad > z1) continue;
		const samples = river.samples;
		const end = Math.min(river.endIndex, samples.length);
		for (let i = 0; i + 1 < end; i++) {
			const a = samples[i],
				c = samples[i + 1];
			const half = Math.max(minHalf, (a.width + c.width) / 4);
			const sx0 = Math.min(a.x, c.x) - half,
				sx1 = Math.max(a.x, c.x) + half;
			const sz0 = Math.min(a.z, c.z) - half,
				sz1 = Math.max(a.z, c.z) + half;
			if (sx1 < x0 || sx0 > x1 || sz1 < z0 || sz0 > z1) continue;
			const px0 = Math.max(0, Math.floor((sx0 - x0) / mpp)),
				px1 = Math.min(size - 1, Math.ceil((sx1 - x0) / mpp));
			const pz0 = Math.max(0, Math.floor((sz0 - z0) / mpp)),
				pz1 = Math.min(size - 1, Math.ceil((sz1 - z0) / mpp));
			const ex = c.x - a.x,
				ez = c.z - a.z;
			const len2 = ex * ex + ez * ez || 1;
			for (let py = pz0; py <= pz1; py++)
				for (let px = px0; px <= px1; px++) {
					const wx = x0 + (px + 0.5) * mpp - a.x,
						wz = z0 + (py + 0.5) * mpp - a.z;
					const t = Math.min(1, Math.max(0, (wx * ex + wz * ez) / len2));
					const d = Math.hypot(wx - ex * t, wz - ez * t);
					// Thin rivers fade a little instead of drawing a full-strength line wider than they are.
					const strength = Math.min(1, ((a.width + c.width) / 2 / mpp) * 0.8 + 0.45);
					cover(coverage, py * size + px, ((half - d) / mpp + 0.5) * strength);
				}
		}
	}
	for (let p = 0; p < size * size; p++) {
		const a = coverage[p] * 0.92;
		if (a <= 0) continue;
		const o = p * 4;
		out[o] += (WATER_RGB[0] - out[o]) * a;
		out[o + 1] += (WATER_RGB[1] - out[o + 1]) * a;
		out[o + 2] += (WATER_RGB[2] - out[o + 2]) * a;
	}
}
