/**
 * ProceduralPlantTextureGenerator: ONE small atlas (8 × 4 tiles) of neutral plant masks, generated
 * once at startup and coloured entirely by shaders from species palettes — never a bitmap per
 * species or per plant. Pure (typed arrays, no canvas), so it runs in Node tests.
 *
 * Tiles:
 *   0–7    petals: round, pointed, teardrop, wide, narrow, heart, diamond, curved
 *   8–9    flower centres: seed disk, fuzzy floret ball
 *   10–17  leaves: lance, oval, heart, fern frond (pinnate), trefoil, succulent, spatulate, strap tuft
 *   18–30  far-card impostors, one per plant family (side-view silhouettes)
 *   31     clover patch (a mat of trefoils, seen from above)
 *
 * Channels are masks, not colours:
 *   petal / leaf / centre tiles: R = shade (×2 in the shader; darker base, lighter tip, veins),
 *                                G = secondary-colour weight (petal tip, leaf tip, speckles)
 *   impostor tiles:              R = petal weight, G = centre weight, B = shade, foliage = the rest
 * Every shape is drawn to fill its tile tightly (little empty alpha → little wasted overdraw), with
 * the coverage-preserving mips from `atlas/alphaAtlas.ts`.
 */
import {
	buildAtlasLevels,
	compositeOver,
	createAtlasTile,
	finishTile,
	rasterStroke,
	rng,
	type AtlasLevel,
	type AtlasTile
} from '../atlas/alphaAtlas';
import {
	LEAF_SHAPES,
	PETAL_SHAPES,
	PLANT_FAMILIES,
	type LeafShape,
	type PetalShape,
	type PlantFamily
} from './PlantTypes';

export const PLANT_ATLAS_COLUMNS = 8;
export const PLANT_ATLAS_ROWS = 4;
export const PLANT_ATLAS_ALPHA_CUTOFF = 0.5;
export const CENTRE_DISK_TILE = 8;
export const CENTRE_FLORET_TILE = 9;
export const CLOVER_PATCH_TILE = 31;

export function petalTile(shape: PetalShape): number {
	return PETAL_SHAPES.indexOf(shape);
}
export function leafTile(shape: LeafShape): number {
	return 10 + LEAF_SHAPES.indexOf(shape);
}
export function impostorTile(family: PlantFamily): number {
	return 18 + PLANT_FAMILIES.indexOf(family);
}

/** Atlas UV rectangle [u0, v0, u1, v1] of a tile, inset half a texel at `tileSize`. */
export function plantTileRect(tile: number, tileSize = 64): [number, number, number, number] {
	const column = tile % PLANT_ATLAS_COLUMNS;
	const row = Math.floor(tile / PLANT_ATLAS_COLUMNS);
	const inset = 0.5 / tileSize;
	return [
		(column + inset) / PLANT_ATLAS_COLUMNS,
		(row + inset) / PLANT_ATLAS_ROWS,
		(column + 1 - inset) / PLANT_ATLAS_COLUMNS,
		(row + 1 - inset) / PLANT_ATLAS_ROWS
	];
}

export interface PlantAtlas {
	tileSize: number;
	levels: AtlasLevel[];
	coverage: number[];
}

type Channels = readonly [number, number, number];

/** Small painter over one tile: shapes are composited back to front. */
class Painter {
	readonly tile: AtlasTile;
	private readonly cover: Float32Array;
	constructor(readonly size: number) {
		this.tile = createAtlasTile(size);
		this.cover = new Float32Array(size * size);
	}

	/** A tapering polyline in unit tile coordinates (y up), half widths in unit tile units too. */
	stroke(points: [number, number][], half: number[], channels: Channels): void {
		const s = this.size;
		rasterStroke(
			{
				points: points.map(([x, y]) => [x * s, y * s]),
				half: half.map((h) => Math.max(0.35, h * s))
			},
			s,
			this.cover
		);
		compositeOver(this.tile, this.cover, channels);
	}

	/**
	 * A filled shape given by a signed-distance-like function in texels (positive inside); colour
	 * may vary per texel (shading).
	 */
	fill(
		distance: (u: number, v: number) => number,
		channels: (u: number, v: number) => Channels
	): void {
		const s = this.size;
		const tile = this.tile;
		for (let y = 0; y < s; y++) {
			for (let x = 0; x < s; x++) {
				const u = (x + 0.5) / s;
				const v = (y + 0.5) / s;
				const a = Math.min(1, Math.max(0, distance(u, v) * s + 0.5));
				if (a <= 0) continue;
				const c = channels(u, v);
				const p = y * s + x;
				const keep = 1 - a;
				tile.rgb[p * 3] = c[0] * a + tile.rgb[p * 3] * keep;
				tile.rgb[p * 3 + 1] = c[1] * a + tile.rgb[p * 3 + 1] * keep;
				tile.rgb[p * 3 + 2] = c[2] * a + tile.rgb[p * 3 + 2] * keep;
				tile.alpha[p] = a + tile.alpha[p] * keep;
			}
		}
	}

	ellipse(cx: number, cy: number, rx: number, ry: number, angle: number, channels: Channels): void {
		const cos = Math.cos(angle);
		const sin = Math.sin(angle);
		this.fill(
			(u, v) => {
				const dx = u - cx;
				const dy = v - cy;
				const lx = (dx * cos + dy * sin) / rx;
				const ly = (-dx * sin + dy * cos) / ry;
				// Approximate distance to the ellipse edge in tile units.
				return (1 - Math.hypot(lx, ly)) * Math.min(rx, ry);
			},
			() => channels
		);
	}

	finish(): AtlasTile {
		return finishTile(this.tile);
	}
}

/** Half width (tile units) of a petal at height t (0 base → 1 tip) and its centre-line offset. */
function petalProfile(shape: PetalShape, t: number): { half: number; offset: number } {
	const s = Math.sin(Math.PI * Math.min(1, Math.max(0, t)));
	switch (shape) {
		case 'round':
			return { half: 0.44 * Math.pow(s, 0.6), offset: 0 };
		case 'pointed':
			return {
				half: 0.4 * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.75)), 0.85) * (1 - t * t * t),
				offset: 0
			};
		case 'teardrop':
			return { half: 0.47 * Math.pow(t, 0.55) * Math.pow(Math.max(0, 1 - t), 0.35), offset: 0 };
		case 'wide':
			return { half: 0.48 * Math.pow(s, 0.35), offset: 0 };
		case 'narrow':
			return { half: 0.22 * Math.pow(s, 0.5), offset: 0 };
		case 'heart':
			return { half: 0.47 * Math.pow(s, 0.45), offset: 0 };
		case 'diamond':
			return { half: 0.44 * (1 - Math.abs(2 * t - 1)), offset: 0 };
		case 'curved':
			return { half: 0.36 * Math.pow(s, 0.6), offset: 0.1 * Math.sin(Math.PI * t) };
	}
}

function petal(shape: PetalShape, size: number): AtlasTile {
	const painter = new Painter(size);
	const base = 0.03;
	const tip = 0.97;
	painter.fill(
		(u, v) => {
			const t = (v - base) / (tip - base);
			if (t < 0 || t > 1) return -1;
			const { half, offset } = petalProfile(shape, t);
			let d = half - Math.abs(u - 0.5 - offset);
			// Heart: a notch in the tip.
			if (shape === 'heart' && t > 0.8) d = Math.min(d, Math.abs(u - 0.5) - (t - 0.8) * 0.7);
			return d;
		},
		(u, v) => {
			const t = Math.min(1, Math.max(0, (v - base) / (tip - base)));
			const { offset } = petalProfile(shape, t);
			const vein = Math.exp(-Math.pow((u - 0.5 - offset) / 0.025, 2)) * (1 - t) * 0.07;
			// Darker base, lighter edges/tip, a faint central vein.
			return [0.4 + 0.14 * t - vein, Math.min(1, Math.max(0, (t - 0.3) / 0.6)), 0];
		}
	);
	return painter.finish();
}

function centre(kind: 'disk' | 'florets', size: number): AtlasTile {
	const painter = new Painter(size);
	const random = rng(kind === 'disk' ? 0x5eed1 : 0x5eed2);
	if (kind === 'disk') {
		painter.ellipse(0.5, 0.5, 0.47, 0.47, 0, [0.42, 0, 0]);
		// Seed spiral: darker dots (shade) — implies stamens without geometry.
		for (let i = 0; i < 70; i++) {
			const r = Math.sqrt(i / 70) * 0.42;
			const a = i * 2.39996;
			painter.ellipse(0.5 + Math.cos(a) * r, 0.5 + Math.sin(a) * r, 0.025, 0.025, 0, [
				0.3 + random() * 0.1,
				0.3,
				0
			]);
		}
	} else {
		painter.ellipse(0.5, 0.5, 0.46, 0.46, 0, [0.4, 0.2, 0]);
		for (let i = 0; i < 46; i++) {
			const r = Math.sqrt(random()) * 0.44;
			const a = random() * Math.PI * 2;
			painter.ellipse(0.5 + Math.cos(a) * r, 0.5 + Math.sin(a) * r, 0.05, 0.05, 0, [
				0.5 + random() * 0.1,
				random() < 0.4 ? 1 : 0,
				0
			]);
		}
	}
	return painter.finish();
}

function leafOutline(shape: LeafShape, t: number): number {
	const s = Math.sin(Math.PI * Math.min(1, Math.max(0, t)));
	switch (shape) {
		case 'lance':
			return 0.24 * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.7)), 0.9);
		case 'oval':
			return 0.42 * Math.pow(s, 0.65);
		case 'heart':
			return 0.47 * Math.pow(Math.max(0, 1 - t), 0.85) * Math.min(1, 0.55 + t * 4);
		case 'succulent':
			return 0.36 * Math.pow(Math.max(0, 1 - t), 1.1) * Math.min(1, 0.4 + t * 5);
		case 'spatulate':
			return (0.08 + 0.36 * Math.pow(t, 1.4)) * Math.sqrt(Math.max(0, 1 - Math.pow(t, 6)));
		default:
			return 0.4 * s;
	}
}

function leaf(shape: LeafShape, size: number): AtlasTile {
	const painter = new Painter(size);
	const random = rng(0x1eaf + LEAF_SHAPES.indexOf(shape) * 31);
	const shade = (t: number, u: number) => {
		const rib = Math.exp(-Math.pow((u - 0.5) / 0.02, 2)) * 0.1;
		const veins = Math.max(0, Math.cos((t * 9 + Math.abs(u - 0.5) * 6) * Math.PI)) * 0.025;
		return 0.38 + 0.16 * t + rib - veins;
	};
	if (shape === 'frond') {
		// Pinnate fern frond: a rachis with ~13 pairs of tapering leaflets — implies dozens of
		// leaflets on one card.
		painter.stroke(
			[
				[0.5, 0.02],
				[0.5, 0.98]
			],
			[0.018, 0.006],
			[0.4, 0.2, 0]
		);
		const pairs = 13;
		for (let i = 0; i < pairs; i++) {
			const t = 0.08 + (i / pairs) * 0.86;
			const length = 0.42 * Math.pow(1 - t, 0.7) + 0.04;
			for (const side of [-1, 1]) {
				painter.stroke(
					[
						[0.5, t],
						[0.5 + side * length * 0.55, t + 0.03],
						[0.5 + side * length, t + 0.06]
					],
					[0.035 * (1 - t * 0.6), 0.03, 0.008],
					[0.4 + 0.14 * t + random() * 0.03, t > 0.6 ? 0.6 : 0.1, 0]
				);
			}
		}
		return painter.finish();
	}
	if (shape === 'trefoil') {
		// Three heart-shaped leaflets around a centre, with the pale chevron clover often has.
		for (let i = 0; i < 3; i++) {
			const angle = Math.PI / 2 + (i * Math.PI * 2) / 3;
			const cx = 0.5 + Math.cos(angle) * 0.23;
			const cy = 0.5 + Math.sin(angle) * 0.23;
			painter.ellipse(cx, cy, 0.26, 0.21, angle, [0.42, 0, 0]);
			painter.ellipse(
				0.5 + Math.cos(angle) * 0.2,
				0.5 + Math.sin(angle) * 0.2,
				0.1,
				0.04,
				angle + Math.PI / 2,
				[0.55, 0.7, 0]
			);
		}
		return painter.finish();
	}
	if (shape === 'strap') {
		// A tuft of broad strap leaves (ground tuft cards).
		for (let i = 0; i < 6; i++) {
			const x0 = 0.5 + (random() - 0.5) * 0.3;
			const lean = (x0 - 0.5) * 1.2 + (random() - 0.5) * 0.3;
			const top = 0.65 + random() * 0.33;
			painter.stroke(
				[
					[x0, 0.02],
					[x0 + lean * 0.3, top * 0.55],
					[Math.min(0.97, Math.max(0.03, x0 + lean * 0.8)), top]
				],
				[0.07, 0.055, 0.008],
				[0.38 + random() * 0.08, top > 0.85 ? 0.5 : 0.15, 0]
			);
		}
		return painter.finish();
	}
	const base = 0.03;
	const tip = 0.97;
	painter.fill(
		(u, v) => {
			const t = (v - base) / (tip - base);
			if (t < 0 || t > 1) return -1;
			let d = leafOutline(shape, t) - Math.abs(u - 0.5);
			// Heart leaves: notch at the base where the stalk meets.
			if (shape === 'heart' && t < 0.12) d = Math.min(d, Math.abs(u - 0.5) - (0.12 - t) * 1.5);
			return d;
		},
		(u, v) => {
			const t = Math.min(1, Math.max(0, (v - base) / (tip - base)));
			const ridge = shape === 'succulent' ? Math.exp(-Math.pow((u - 0.5) / 0.08, 2)) * 0.12 : 0;
			return [shade(t, u) + ridge, Math.min(1, Math.max(0, (t - 0.45) / 0.5)), 0];
		}
	);
	return painter.finish();
}

const FOLIAGE: Channels = [0, 0, 0.45];
const FOLIAGE_TOP: Channels = [0, 0, 0.55];
const PETAL: Channels = [1, 0, 0.55];
const CENTRE: Channels = [0, 1, 0.5];

/** Side-view silhouette of a whole plant, filling its tile (the far card stretches it to size). */
function impostor(family: PlantFamily, size: number): AtlasTile {
	const p = new Painter(size);
	const random = rng(0x1305 + PLANT_FAMILIES.indexOf(family) * 97);
	const stem = (top: number, x = 0.5, bend = 0.04) =>
		p.stroke(
			[
				[x, 0.02],
				[x + bend, top * 0.5],
				[x, top]
			],
			[0.035, 0.025, 0.02],
			FOLIAGE
		);
	const leaves = (count: number, length: number, width: number) => {
		for (let i = 0; i < count; i++) {
			const side = i % 2 ? 1 : -1;
			const y = 0.05 + (i / Math.max(1, count)) * 0.25;
			p.stroke(
				[
					[0.5, y],
					[0.5 + side * length * 0.6, y + length * 0.35],
					[0.5 + side * length, y + length * 0.5]
				],
				[width, width * 0.8, 0.01],
				FOLIAGE
			);
		}
	};
	switch (family) {
		case 'radial-flower':
			stem(0.78);
			leaves(3, 0.36, 0.06);
			p.ellipse(0.5, 0.82, 0.47, 0.15, 0, PETAL);
			p.ellipse(0.5, 0.86, 0.15, 0.09, 0, CENTRE);
			break;
		case 'star-flower':
			stem(0.76);
			leaves(2, 0.32, 0.05);
			for (let i = 0; i < 5; i++) {
				const a = (i / 5) * Math.PI * 2;
				p.stroke(
					[
						[0.5, 0.82],
						[0.5 + Math.cos(a) * 0.45, 0.82 + Math.sin(a) * 0.14]
					],
					[0.08, 0.01],
					PETAL
				);
			}
			p.ellipse(0.5, 0.83, 0.1, 0.07, 0, CENTRE);
			break;
		case 'cup-flower':
			stem(0.66);
			leaves(3, 0.34, 0.06);
			p.fill(
				(u, v) => {
					const dx = (u - 0.5) / 0.42;
					const dy = (v - 0.66) / 0.32;
					return dy < 0 ? -1 : (1 - Math.hypot(dx, dy * 0.95)) * 0.3 * (dy < 0.95 ? 1 : 0);
				},
				() => PETAL
			);
			p.ellipse(0.5, 0.94, 0.22, 0.05, 0, CENTRE);
			break;
		case 'bell-flower':
			p.stroke(
				[
					[0.45, 0.02],
					[0.5, 0.7],
					[0.75, 0.92]
				],
				[0.03, 0.025, 0.02],
				FOLIAGE
			);
			leaves(3, 0.3, 0.06);
			for (const [x, y] of [
				[0.84, 0.62],
				[0.6, 0.75],
				[0.3, 0.6]
			] as [number, number][]) {
				p.fill(
					(u, v) => {
						const dx = (u - x) / 0.14;
						const dy = (y + 0.08 - v) / 0.22;
						return dy < 0 || dy > 1 ? -1 : (1 - Math.abs(dx) / (0.4 + dy * 0.6)) * 0.1;
					},
					() => PETAL
				);
			}
			break;
		case 'spike-flower':
			stem(0.98);
			leaves(3, 0.3, 0.06);
			for (let i = 0; i < 9; i++) {
				const t = i / 8;
				p.ellipse(
					0.5 + (random() - 0.5) * 0.05,
					0.45 + t * 0.5,
					0.2 * (1 - t * 0.55),
					0.06,
					0,
					PETAL
				);
			}
			break;
		case 'orb-flower':
			stem(0.66);
			leaves(2, 0.34, 0.06);
			p.ellipse(0.5, 0.75, 0.3, 0.24, 0, PETAL);
			for (let i = 0; i < 9; i++)
				p.ellipse(
					0.5 + (random() - 0.5) * 0.4,
					0.75 + (random() - 0.5) * 0.3,
					0.04,
					0.04,
					0,
					[1, 0, 0.7]
				);
			break;
		case 'cluster-flower':
			stem(0.5);
			leaves(2, 0.32, 0.06);
			for (const [x, y] of [
				[0.22, 0.78],
				[0.5, 0.9],
				[0.78, 0.76],
				[0.38, 0.66],
				[0.64, 0.64]
			] as [number, number][]) {
				p.stroke(
					[
						[0.5, 0.5],
						[x, y]
					],
					[0.02, 0.015],
					FOLIAGE
				);
				p.ellipse(x, y, 0.13, 0.07, 0, PETAL);
				p.ellipse(x, y + 0.02, 0.04, 0.03, 0, CENTRE);
			}
			break;
		case 'rosette':
			for (let i = 0; i < 9; i++) {
				const x = 0.05 + (i / 8) * 0.9;
				p.stroke(
					[
						[0.5, 0.04],
						[(0.5 + x) / 2, 0.45],
						[x, 0.3 + random() * 0.6]
					],
					[0.1, 0.09, 0.02],
					i % 2 ? FOLIAGE : FOLIAGE_TOP
				);
			}
			break;
		case 'fern':
			for (let i = 0; i < 7; i++) {
				const side = i - 3;
				const x = 0.5 + side * 0.15;
				p.stroke(
					[
						[0.5, 0.02],
						[0.5 + side * 0.06, 0.7],
						[x, 0.98 - Math.abs(side) * 0.18]
					],
					[0.07, 0.07, 0.015],
					i % 2 ? FOLIAGE : FOLIAGE_TOP
				);
			}
			break;
		case 'broadleaf':
			for (let i = 0; i < 6; i++) {
				const x = 0.18 + (i / 5) * 0.64;
				const y = 0.4 + random() * 0.4;
				p.stroke(
					[
						[0.5, 0.02],
						[x, y - 0.15]
					],
					[0.025, 0.02],
					FOLIAGE
				);
				p.ellipse(x, y, 0.2, 0.13, (x - 0.5) * 1.4, i % 2 ? FOLIAGE : FOLIAGE_TOP);
			}
			break;
		case 'clover':
			for (let i = 0; i < 14; i++)
				p.ellipse(
					0.06 + random() * 0.88,
					0.15 + random() * 0.55,
					0.12,
					0.13,
					0,
					i % 3 ? FOLIAGE : FOLIAGE_TOP
				);
			for (let i = 0; i < 3; i++)
				p.ellipse(0.2 + random() * 0.6, 0.78 + random() * 0.12, 0.07, 0.08, 0, PETAL);
			break;
		case 'succulent':
			for (let i = 0; i < 9; i++) {
				const x = 0.06 + (i / 8) * 0.88;
				p.stroke(
					[
						[0.5, 0.03],
						[(0.5 + x) / 2, 0.4],
						[x, 0.55 + random() * 0.42]
					],
					[0.12, 0.09, 0.015],
					i % 2 ? FOLIAGE : FOLIAGE_TOP
				);
			}
			break;
		case 'ground-tuft':
			for (let i = 0; i < 8; i++) {
				const x = 0.05 + (i / 7) * 0.9;
				p.stroke(
					[
						[0.5 + (x - 0.5) * 0.3, 0.02],
						[0.5 + (x - 0.5) * 0.6, 0.55],
						[x, 0.7 + random() * 0.28]
					],
					[0.07, 0.05, 0.008],
					i % 2 ? FOLIAGE : FOLIAGE_TOP
				);
			}
			break;
	}
	return p.finish();
}

/** A clover patch seen from above: a mat of overlapping trefoils (one ground-cover instance). */
function cloverPatch(size: number): AtlasTile {
	const p = new Painter(size);
	const random = rng(0xc10e);
	for (let i = 0; i < 16; i++) {
		const cx = 0.14 + random() * 0.72;
		const cy = 0.14 + random() * 0.72;
		const r = 0.07 + random() * 0.04;
		const turn = random() * Math.PI * 2;
		for (let k = 0; k < 3; k++) {
			const a = turn + (k * Math.PI * 2) / 3;
			p.ellipse(cx + Math.cos(a) * r * 0.8, cy + Math.sin(a) * r * 0.8, r, r * 0.8, a, [
				0.36 + random() * 0.1,
				random() < 0.3 ? 0.6 : 0,
				0
			]);
		}
	}
	return p.finish();
}

/** Builds the atlas once (64 px tiles: 512 × 256, four mip levels, ~680 KB). */
export function generatePlantAtlas(tileSize = 64): PlantAtlas {
	const tiles: AtlasTile[] = [];
	for (const shape of PETAL_SHAPES) tiles.push(petal(shape, tileSize));
	tiles.push(centre('disk', tileSize), centre('florets', tileSize));
	for (const shape of LEAF_SHAPES) tiles.push(leaf(shape, tileSize));
	for (const family of PLANT_FAMILIES) tiles.push(impostor(family, tileSize));
	tiles.push(cloverPatch(tileSize));
	const { levels, coverage } = buildAtlasLevels(tiles, PLANT_ATLAS_COLUMNS, PLANT_ATLAS_ROWS, {
		cutoff: PLANT_ATLAS_ALPHA_CUTOFF,
		minTile: 8,
		rgbScale: 1
	});
	return { tileSize, levels, coverage };
}
