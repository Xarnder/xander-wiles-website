/**
 * Shared machinery for small procedural alpha-tested atlases (grass tufts, plant petals/leaves):
 * analytic stroke rasterisation, "over" compositing, colour dilation into transparent texels, and a
 * coverage-preserving mip chain. Pure — typed arrays only, runs in Node tests.
 *
 * Why custom mips: alpha-tested foliage falls apart under plain box filtering — averaged alpha
 * drops below the cutoff and distant cards thin out or vanish. Each level here is (1) colour
 * averaged with alpha weights, so transparent texels never darken edges, and (2) alpha-rescaled so
 * the fraction of texels passing the alpha test matches level 0. Transparent texels carry dilated
 * neighbour colour, so bilinear filtering never pulls in a halo. Levels stop at a minimum tile edge
 * so tiles never bleed into each other.
 */

export interface AtlasLevel {
	width: number;
	height: number;
	/** RGBA8, row 0 = bottom of the atlas (texture v = 0). */
	data: Uint8Array;
}

/** One tile being built: straight (un-premultiplied) RGB and alpha, row 0 at the bottom. */
export interface AtlasTile {
	size: number;
	rgb: Float32Array;
	alpha: Float32Array;
}

export function createAtlasTile(size: number): AtlasTile {
	return { size, rgb: new Float32Array(size * size * 3), alpha: new Float32Array(size * size) };
}

export /** mulberry32 — the atlas is identical on every machine and every run. */
function rng(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/** A tapering polyline (blade, stem, vein): points in tile texels and the half width at each. */
export interface Stroke {
	points: [number, number][];
	half: number[];
}

export /** Coverage of one stroke over the tile (max over its segments, so joints never double up). */
function rasterStroke(stroke: Stroke, size: number, cover: Float32Array): void {
	cover.fill(0);
	const { points, half } = stroke;
	for (let i = 0; i < points.length - 1; i++) {
		const [ax, ay] = points[i];
		const [bx, by] = points[i + 1];
		const ha = half[i];
		const hb = half[i + 1];
		const reach = Math.max(ha, hb) + 1.5;
		const minX = Math.max(0, Math.floor(Math.min(ax, bx) - reach));
		const maxX = Math.min(size - 1, Math.ceil(Math.max(ax, bx) + reach));
		const minY = Math.max(0, Math.floor(Math.min(ay, by) - reach));
		const maxY = Math.min(size - 1, Math.ceil(Math.max(ay, by) + reach));
		const dx = bx - ax;
		const dy = by - ay;
		const lengthSq = dx * dx + dy * dy || 1e-6;
		for (let y = minY; y <= maxY; y++) {
			const py = y + 0.5;
			for (let x = minX; x <= maxX; x++) {
				const px = x + 0.5;
				const s = Math.min(1, Math.max(0, ((px - ax) * dx + (py - ay) * dy) / lengthSq));
				const qx = ax + dx * s - px;
				const qy = ay + dy * s - py;
				const distance = Math.sqrt(qx * qx + qy * qy);
				const coverage = Math.min(1, Math.max(0, ha + (hb - ha) * s - distance + 0.5));
				const index = y * size + x;
				if (coverage > cover[index]) cover[index] = coverage;
			}
		}
	}
}

/**
 * Composites a coverage mask over a tile with "over" (premultiplied accumulation — call
 * `finishTile` once every shape is down).
 */
export function compositeOver(
	tile: AtlasTile,
	cover: Float32Array,
	color: readonly number[]
): void {
	for (let p = 0; p < cover.length; p++) {
		const a = cover[p];
		if (a <= 0) continue;
		const keep = 1 - a;
		tile.rgb[p * 3] = color[0] * a + tile.rgb[p * 3] * keep;
		tile.rgb[p * 3 + 1] = color[1] * a + tile.rgb[p * 3 + 1] * keep;
		tile.rgb[p * 3 + 2] = color[2] * a + tile.rgb[p * 3 + 2] * keep;
		tile.alpha[p] = a + tile.alpha[p] * keep;
	}
}

/** Un-premultiplies the composited colour and dilates it into transparent texels. */
export function finishTile(tile: AtlasTile): AtlasTile {
	for (let p = 0; p < tile.alpha.length; p++) {
		if (tile.alpha[p] <= 0) continue;
		tile.rgb[p * 3] /= tile.alpha[p];
		tile.rgb[p * 3 + 1] /= tile.alpha[p];
		tile.rgb[p * 3 + 2] /= tile.alpha[p];
	}
	dilate(tile.rgb, tile.alpha, tile.size);
	return tile;
}

/** Fills colour into transparent texels from opaque neighbours (no halos under filtering). */
function dilate(rgb: Float32Array, alpha: Float32Array, size: number): void {
	const known = new Uint8Array(size * size);
	for (let i = 0; i < known.length; i++) known[i] = alpha[i] > 0.004 ? 1 : 0;
	// Each pass fills every unknown texel that touches a texel known before the pass, with the
	// mean of those neighbours. Walk only that frontier (not the whole tile): a 256² tile with a
	// sparse spray would otherwise be scanned twelve times.
	const queued = new Uint8Array(size * size);
	let frontier: number[] = [];
	const enqueueNeighbours = (index: number, into: number[]) => {
		const x = index % size;
		const y = (index - x) / size;
		if (x + 1 < size) push(index + 1, into);
		if (x > 0) push(index - 1, into);
		if (y + 1 < size) push(index + size, into);
		if (y > 0) push(index - size, into);
	};
	const push = (index: number, into: number[]) => {
		if (known[index] || queued[index]) return;
		queued[index] = 1;
		into.push(index);
	};
	for (let i = 0; i < known.length; i++) if (known[i]) enqueueNeighbours(i, frontier);
	for (let pass = 0; pass < 12 && frontier.length > 0; pass++) {
		for (const index of frontier) {
			const x = index % size;
			const y = (index - x) / size;
			let r = 0;
			let g = 0;
			let b = 0;
			let n = 0;
			// Right, left, up, down — the order the sums have always used (bit-identical atlases).
			for (let k = 0; k < 4; k++) {
				const nx = k === 0 ? x + 1 : k === 1 ? x - 1 : x;
				const ny = k === 2 ? y + 1 : k === 3 ? y - 1 : y;
				if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
				const neighbour = ny * size + nx;
				if (!known[neighbour]) continue;
				r += rgb[neighbour * 3];
				g += rgb[neighbour * 3 + 1];
				b += rgb[neighbour * 3 + 2];
				n++;
			}
			rgb[index * 3] = r / n;
			rgb[index * 3 + 1] = g / n;
			rgb[index * 3 + 2] = b / n;
		}
		for (const index of frontier) known[index] = 1;
		const next: number[] = [];
		for (const index of frontier) enqueueNeighbours(index, next);
		frontier = next;
	}
	// Whatever is still unreached gets the tile's mean blade colour.
	let r = 0;
	let g = 0;
	let b = 0;
	let n = 0;
	for (let i = 0; i < known.length; i++) {
		if (!known[i]) continue;
		r += rgb[i * 3];
		g += rgb[i * 3 + 1];
		b += rgb[i * 3 + 2];
		n++;
	}
	if (n === 0) return;
	for (let i = 0; i < known.length; i++) {
		if (known[i]) continue;
		rgb[i * 3] = r / n;
		rgb[i * 3 + 1] = g / n;
		rgb[i * 3 + 2] = b / n;
	}
}

export function coverageAbove(alpha: Float32Array, cutoff: number, scale = 1): number {
	let n = 0;
	for (let i = 0; i < alpha.length; i++) if (alpha[i] * scale > cutoff) n++;
	return n / alpha.length;
}

/** Alpha-weighted 2 × 2 box filter (colour of transparent texels never bleeds into blades). */
function downsample(tile: AtlasTile): AtlasTile {
	const size = tile.size / 2;
	const rgb = new Float32Array(size * size * 3);
	const alpha = new Float32Array(size * size);
	for (let y = 0; y < size; y++) {
		for (let x = 0; x < size; x++) {
			let r = 0;
			let g = 0;
			let b = 0;
			let a = 0;
			let fr = 0;
			let fg = 0;
			let fb = 0;
			for (let k = 0; k < 4; k++) {
				const src = (y * 2 + (k >> 1)) * tile.size + x * 2 + (k & 1);
				const w = tile.alpha[src];
				r += tile.rgb[src * 3] * w;
				g += tile.rgb[src * 3 + 1] * w;
				b += tile.rgb[src * 3 + 2] * w;
				a += w;
				fr += tile.rgb[src * 3];
				fg += tile.rgb[src * 3 + 1];
				fb += tile.rgb[src * 3 + 2];
			}
			const dst = y * size + x;
			alpha[dst] = a / 4;
			if (a > 1e-4) {
				rgb[dst * 3] = r / a;
				rgb[dst * 3 + 1] = g / a;
				rgb[dst * 3 + 2] = b / a;
			} else {
				rgb[dst * 3] = fr / 4;
				rgb[dst * 3 + 1] = fg / 4;
				rgb[dst * 3 + 2] = fb / 4;
			}
		}
	}
	return { size, rgb, alpha };
}

/** The alpha scale that makes this level pass the cutoff over the same fraction as level 0. */
function coverageScale(alpha: Float32Array, cutoff: number, target: number): number {
	// Same counts as `coverageAbove` (same products, same comparison), but from one sorted copy:
	// `alpha × scale > cutoff` is monotonic in alpha, so each count is a binary search.
	const sorted = Float32Array.from(alpha).sort();
	const above = (scale: number) => {
		let lo = 0;
		let hi = sorted.length;
		while (lo < hi) {
			const mid = (lo + hi) >> 1;
			if (sorted[mid] * scale > cutoff) hi = mid;
			else lo = mid + 1;
		}
		return (sorted.length - lo) / sorted.length;
	};
	let lo = 0.5;
	let hi = 6;
	for (let i = 0; i < 18; i++) {
		const mid = (lo + hi) / 2;
		if (above(mid) < target) lo = mid;
		else hi = mid;
	}
	return (lo + hi) / 2;
}

function writeTile(
	level: AtlasLevel,
	tile: AtlasTile,
	column: number,
	row: number,
	alphaScale: number,
	rgbScale: number
) {
	for (let y = 0; y < tile.size; y++) {
		for (let x = 0; x < tile.size; x++) {
			const src = y * tile.size + x;
			const dst = ((row * tile.size + y) * level.width + column * tile.size + x) * 4;
			level.data[dst] = Math.round(Math.min(1, Math.max(0, tile.rgb[src * 3] * rgbScale)) * 255);
			level.data[dst + 1] = Math.round(
				Math.min(1, Math.max(0, tile.rgb[src * 3 + 1] * rgbScale)) * 255
			);
			level.data[dst + 2] = Math.round(
				Math.min(1, Math.max(0, tile.rgb[src * 3 + 2] * rgbScale)) * 255
			);
			level.data[dst + 3] = Math.round(Math.min(1, tile.alpha[src] * alphaScale) * 255);
		}
	}
}

/**
 * Lays tiles out on a `columns` × `rows` grid and builds the mip chain down to `minTile` texels per
 * tile. `rgbScale` maps the tiles' RGB into 0..1 for storage (grass stores a multiplier around 1 as
 * ×0.5). Returns the levels and each tile's level-0 coverage at `cutoff`.
 */
export function buildAtlasLevels(
	tiles: readonly AtlasTile[],
	columns: number,
	rows: number,
	options: { cutoff: number; minTile: number; rgbScale: number }
): { levels: AtlasLevel[]; coverage: number[] } {
	const tileSize = tiles[0].size;
	const levels: AtlasLevel[] = [];
	for (let size = tileSize; size >= options.minTile; size /= 2) {
		levels.push({
			width: size * columns,
			height: size * rows,
			data: new Uint8Array(size * columns * size * rows * 4)
		});
	}
	const coverage: number[] = [];
	tiles.forEach((first, index) => {
		const column = index % columns;
		const row = Math.floor(index / columns);
		let tile = first;
		const target = coverageAbove(tile.alpha, options.cutoff);
		coverage.push(target);
		writeTile(levels[0], tile, column, row, 1, options.rgbScale);
		for (let level = 1; level < levels.length; level++) {
			tile = downsample(tile);
			const scale = target > 0 ? coverageScale(tile.alpha, options.cutoff, target) : 1;
			writeTile(levels[level], tile, column, row, scale, options.rgbScale);
		}
	});
	return { levels, coverage };
}
