/**
 * Seamlessly tiling noise primitives for procedural material textures.
 *
 * Why not `simplex-noise` (already a dependency, used by terrain)? A material texture has to repeat
 * across a surface without a visible seam, which means every noise layer must be exactly periodic
 * over the texture tile. Simplex noise only tiles by sampling a 4D torus — several times the cost per
 * sample, and generation already touches millions of texels. Lattice noise with a wrapped integer
 * lattice tiles for free, so these few small functions are worth owning. Terrain keeps using
 * `simplex-noise`; nothing here replaces it.
 *
 * Conventions:
 * - Texture space is `(s, t)` in `[0, 1)`; a noise layer with period `p` places `p` lattice cells
 *   across the tile, so integer periods (and only integer periods) tile seamlessly.
 * - Everything is a pure function of its inputs and an integer seed: no `Math.random()`, no module
 *   state that a call could leave behind. The same seed always produces the same texel.
 */

/** Stable 32-bit hash of an integer lattice coordinate and seed — same mixing family as vegetation's `hashCellToFloat01`. */
export function hash2(x: number, y: number, seed: number): number {
	let h = seed | 0;
	h = Math.imul(h ^ x, 0x27d4eb2d);
	h = Math.imul(h ^ y, 0x165667b1);
	h ^= h >>> 15;
	h = Math.imul(h, 0x85ebca6b);
	h ^= h >>> 13;
	h = Math.imul(h, 0xc2b2ae35);
	h ^= h >>> 16;
	return h >>> 0;
}

/** `hash2` mapped to `[0, 1)`. */
export function hash01(x: number, y: number, seed: number): number {
	return hash2(x, y, seed) / 4294967296;
}

/** Derives an independent sub-seed for a named layer, so adding a layer never changes another layer's output. */
export function subSeed(seed: number, layer: number): number {
	return hash2(layer, 0x5bd1e995, seed);
}

/** Positive modulo — lattice wrapping must be correct for negative coordinates too. */
export function wrapIndex(value: number, period: number): number {
	const r = value % period;
	return r < 0 ? r + period : r;
}

const GRADIENT_COUNT = 64;
const GRADIENT_X = new Float32Array(GRADIENT_COUNT);
const GRADIENT_Y = new Float32Array(GRADIENT_COUNT);
for (let i = 0; i < GRADIENT_COUNT; i++) {
	const angle = (i / GRADIENT_COUNT) * Math.PI * 2;
	GRADIENT_X[i] = Math.cos(angle);
	GRADIENT_Y[i] = Math.sin(angle);
}

function fade(t: number): number {
	return t * t * t * (t * (t * 6 - 15) + 10);
}

/**
 * Periodic 2D gradient (Perlin) noise in roughly `[-1, 1]`. `x`/`y` are in lattice units; the
 * lattice wraps every `periodX`/`periodY` cells, so sampling `x = s * periodX` for `s` in `[0, 1)`
 * tiles exactly.
 */
export function gradientNoise(
	x: number,
	y: number,
	periodX: number,
	periodY: number,
	seed: number
): number {
	const xFloor = Math.floor(x);
	const yFloor = Math.floor(y);
	const fx = x - xFloor;
	const fy = y - yFloor;
	const x0 = wrapIndex(xFloor, periodX);
	const y0 = wrapIndex(yFloor, periodY);
	const x1 = x0 + 1 === periodX ? 0 : x0 + 1;
	const y1 = y0 + 1 === periodY ? 0 : y0 + 1;

	const g00 = hash2(x0, y0, seed) & (GRADIENT_COUNT - 1);
	const g10 = hash2(x1, y0, seed) & (GRADIENT_COUNT - 1);
	const g01 = hash2(x0, y1, seed) & (GRADIENT_COUNT - 1);
	const g11 = hash2(x1, y1, seed) & (GRADIENT_COUNT - 1);

	const n00 = GRADIENT_X[g00] * fx + GRADIENT_Y[g00] * fy;
	const n10 = GRADIENT_X[g10] * (fx - 1) + GRADIENT_Y[g10] * fy;
	const n01 = GRADIENT_X[g01] * fx + GRADIENT_Y[g01] * (fy - 1);
	const n11 = GRADIENT_X[g11] * (fx - 1) + GRADIENT_Y[g11] * (fy - 1);

	const u = fade(fx);
	const v = fade(fy);
	const nx0 = n00 + (n10 - n00) * u;
	const nx1 = n01 + (n11 - n01) * u;
	return (nx0 + (nx1 - nx0) * v) * 1.41421356;
}

/**
 * Periodic value noise in `[0, 1]` — cheaper and blobbier than gradient noise; good for colour
 * mottling and per-region masks where gradient noise's zero-mean ridges look too "noisy".
 */
export function valueNoise(
	x: number,
	y: number,
	periodX: number,
	periodY: number,
	seed: number
): number {
	const xFloor = Math.floor(x);
	const yFloor = Math.floor(y);
	const fx = x - xFloor;
	const fy = y - yFloor;
	const x0 = wrapIndex(xFloor, periodX);
	const y0 = wrapIndex(yFloor, periodY);
	const x1 = x0 + 1 === periodX ? 0 : x0 + 1;
	const y1 = y0 + 1 === periodY ? 0 : y0 + 1;
	const u = fade(fx);
	const v = fade(fy);
	const a = hash01(x0, y0, seed);
	const b = hash01(x1, y0, seed);
	const c = hash01(x0, y1, seed);
	const d = hash01(x1, y1, seed);
	const top = a + (b - a) * u;
	const bottom = c + (d - c) * u;
	return top + (bottom - top) * v;
}

/**
 * Fractal Brownian motion of periodic gradient noise, sampled at texture coordinate `(s, t)`.
 * Each octave doubles both periods, so the sum stays exactly tileable. Returns roughly `[-1, 1]`.
 * `periodX`/`periodY` may differ to stretch features along one axis (wood grain, rain streaks).
 */
export function fbm(
	s: number,
	t: number,
	periodX: number,
	periodY: number,
	octaves: number,
	seed: number,
	gain = 0.5
): number {
	let sum = 0;
	let amplitude = 1;
	let norm = 0;
	let px = periodX;
	let py = periodY;
	for (let octave = 0; octave < octaves; octave++) {
		sum += amplitude * gradientNoise(s * px, t * py, px, py, seed + octave * 1013);
		norm += amplitude;
		amplitude *= gain;
		px *= 2;
		py *= 2;
	}
	return sum / norm;
}

/** `fbm` remapped to `[0, 1]`. */
export function fbm01(
	s: number,
	t: number,
	periodX: number,
	periodY: number,
	octaves: number,
	seed: number,
	gain = 0.5
): number {
	const value = fbm(s, t, periodX, periodY, octaves, seed, gain) * 0.5 + 0.5;
	return value < 0 ? 0 : value > 1 ? 1 : value;
}

/**
 * Ridged multifractal (1 - |noise|), useful for crack networks and veins. Returns `[0, 1]`, with
 * values near 1 along the ridge lines.
 */
export function ridged(
	s: number,
	t: number,
	periodX: number,
	periodY: number,
	octaves: number,
	seed: number
): number {
	let sum = 0;
	let amplitude = 1;
	let norm = 0;
	let px = periodX;
	let py = periodY;
	for (let octave = 0; octave < octaves; octave++) {
		const n = 1 - Math.abs(gradientNoise(s * px, t * py, px, py, seed + octave * 7919));
		sum += amplitude * n * n;
		norm += amplitude;
		amplitude *= 0.5;
		px *= 2;
		py *= 2;
	}
	return sum / norm;
}

/** Output of `cellular` — reused across calls so a texture loop allocates nothing per texel. */
export interface CellularSample {
	/** Distance to the nearest feature point, in cell units. */
	f1: number;
	/** Distance to the second-nearest feature point, in cell units. */
	f2: number;
	/** Distance from the sample to the nearest Voronoi cell border, in cell units — exact, not the `f2 - f1` approximation, so mortar/joint widths stay even. */
	border: number;
	/** Stable hash of the nearest cell's wrapped lattice coordinate — use it to vary each stone. */
	cellId: number;
	/** Offset from the sample to the nearest feature point, in cell units. */
	toCenterX: number;
	toCenterY: number;
}

export function createCellularSample(): CellularSample {
	return { f1: 0, f2: 0, border: 0, cellId: 0, toCenterX: 0, toCenterY: 0 };
}

/**
 * Periodic Worley/Voronoi noise with an exact border distance (Inigo Quilez's two-pass method).
 * `x`/`y` are in cell units; the cell grid wraps every `cellsX`/`cellsY` cells. `jitter` in `[0, 1]`
 * controls how irregular the cells are (0 = square grid). `aspectY` scales vertical distances so
 * cells can be flattened into coursed fieldstone without changing the tiling period.
 */
export function cellular(
	x: number,
	y: number,
	cellsX: number,
	cellsY: number,
	seed: number,
	jitter: number,
	out: CellularSample,
	aspectY = 1
): CellularSample {
	const ix = Math.floor(x);
	const iy = Math.floor(y);
	const fx = x - ix;
	const fy = y - iy;

	let bestDistSq = Infinity;
	let secondDistSq = Infinity;
	let bestRx = 0;
	let bestRy = 0;
	let bestOffsetX = 0;
	let bestOffsetY = 0;
	let bestId = 0;
	// Flattened cells (aspectY < 1) can have their nearest point two rows away.
	const searchY = aspectY < 0.8 ? 2 : 1;

	for (let oy = -searchY; oy <= searchY; oy++) {
		for (let ox = -1; ox <= 1; ox++) {
			const cx = wrapIndex(ix + ox, cellsX);
			const cy = wrapIndex(iy + oy, cellsY);
			const h = hash2(cx, cy, seed);
			const px = 0.5 + ((h & 0xffff) / 65535 - 0.5) * jitter;
			const py = 0.5 + ((h >>> 16) / 65535 - 0.5) * jitter;
			const rx = ox + px - fx;
			const ry = (oy + py - fy) * aspectY;
			const d = rx * rx + ry * ry;
			if (d < bestDistSq) {
				secondDistSq = bestDistSq;
				bestDistSq = d;
				bestRx = rx;
				bestRy = ry;
				bestOffsetX = ox;
				bestOffsetY = oy;
				bestId = h;
			} else if (d < secondDistSq) {
				secondDistSq = d;
			}
		}
	}

	// Second pass: exact distance to the nearest border, searched around the winning cell.
	let border = Infinity;
	for (let oy = -searchY - 1; oy <= searchY + 1; oy++) {
		for (let ox = -2; ox <= 2; ox++) {
			const gx = bestOffsetX + ox;
			const gy = bestOffsetY + oy;
			const cx = wrapIndex(ix + gx, cellsX);
			const cy = wrapIndex(iy + gy, cellsY);
			const h = hash2(cx, cy, seed);
			if (ox === 0 && oy === 0) continue;
			const px = 0.5 + ((h & 0xffff) / 65535 - 0.5) * jitter;
			const py = 0.5 + ((h >>> 16) / 65535 - 0.5) * jitter;
			const rx = gx + px - fx;
			const ry = (gy + py - fy) * aspectY;
			const dx = rx - bestRx;
			const dy = ry - bestRy;
			const lenSq = dx * dx + dy * dy;
			if (lenSq < 1e-8) continue;
			const len = Math.sqrt(lenSq);
			const distance = ((bestRx + rx) * 0.5 * dx + (bestRy + ry) * 0.5 * dy) / len;
			if (distance < border) border = distance;
		}
	}

	out.f1 = Math.sqrt(bestDistSq);
	out.f2 = Math.sqrt(secondDistSq);
	out.border = border;
	out.cellId = bestId;
	out.toCenterX = bestRx;
	out.toCenterY = bestRy;
	return out;
}

export function clamp01(value: number): number {
	return value < 0 ? 0 : value > 1 ? 1 : value;
}

export function smoothstep(edge0: number, edge1: number, value: number): number {
	const t = clamp01((value - edge0) / (edge1 - edge0));
	return t * t * (3 - 2 * t);
}

export function lerp(a: number, b: number, t: number): number {
	return a + (b - a) * t;
}

/** Fractional part that is correct for negative inputs. */
export function fract(value: number): number {
	return value - Math.floor(value);
}
