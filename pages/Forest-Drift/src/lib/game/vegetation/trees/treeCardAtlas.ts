/**
 * The procedural foliage-card atlas: ONE small atlas (4 × 2 tiles) of neutral spray masks — a twig
 * with its leaves, a needle brush, a spruce frond, a cypress spray, a willow strand — painted
 * analytically at startup and coloured entirely by the tree card shader from each crown's vertex
 * colours. No bitmaps are loaded; pure typed arrays, so it runs in Node tests.
 *
 * Tiles (`TREE_CARD_TILES` order): broadleaf, oak (lobed), small-leaf, birch, needles, spruce,
 * scales, willow. Each tile is a spray seen face-on: v = 0 is where it grows from the crown,
 * v = 1 its tip.
 *
 * Channels are masks, not colours:
 *   R = shade (×2 in the shader: darker inner leaves and twigs, lighter outer ones, midribs),
 *   G = new-growth weight (tips lighten and warm toward yellow-green),
 *   B = per-leaf hue roll (0.5 neutral) — each leaf leans slightly warm or cool,
 *   A = coverage (alpha-tested at `TREE_CARD_ALPHA_CUTOFF`).
 * Mips are the coverage-preserving chain from `atlas/alphaAtlas.ts`, so distant cards keep their
 * density instead of thinning out under the alpha test.
 */
import {
	buildAtlasLevels,
	createAtlasTile,
	finishTile,
	rng,
	type AtlasLevel,
	type AtlasTile
} from '../atlas/alphaAtlas';
import { TREE_CARD_TILES, type TreeCardTile } from './TreeSpeciesTypes';

export const TREE_CARD_ATLAS_COLUMNS = 4;
export const TREE_CARD_ATLAS_ROWS = 2;
export const TREE_CARD_ALPHA_CUTOFF = 0.5;

export interface TreeCardAtlas {
	tileSize: number;
	levels: AtlasLevel[];
	/** Level-0 fraction of each tile's texels that pass the alpha test. */
	coverage: number[];
}

export function cardTileIndex(tile: TreeCardTile): number {
	return TREE_CARD_TILES.indexOf(tile);
}

/** Atlas UV rectangle [u0, v0, u1, v1] of a tile, inset half a texel at `tileSize`. */
export function cardTileRect(tile: TreeCardTile, tileSize = 256): [number, number, number, number] {
	const index = cardTileIndex(tile);
	const column = index % TREE_CARD_ATLAS_COLUMNS;
	const row = Math.floor(index / TREE_CARD_ATLAS_COLUMNS);
	const inset = 0.5 / tileSize;
	return [
		(column + inset) / TREE_CARD_ATLAS_COLUMNS,
		(row + inset) / TREE_CARD_ATLAS_ROWS,
		(column + 1 - inset) / TREE_CARD_ATLAS_COLUMNS,
		(row + 1 - inset) / TREE_CARD_ATLAS_ROWS
	];
}

type Channels = readonly [number, number, number];
type Point = [number, number];

/**
 * Paints one tile. Every shape touches only its own bounding box (a frond is ~1000 needles, so
 * whole-tile passes per shape would be far too slow for startup).
 */
class SprayPainter {
	readonly tile: AtlasTile;
	private readonly cover: Float32Array;

	constructor(readonly size: number) {
		this.tile = createAtlasTile(size);
		this.cover = new Float32Array(size * size);
	}

	private composite(minX: number, maxX: number, minY: number, maxY: number, color: Channels): void {
		const { tile, cover, size } = this;
		for (let y = minY; y <= maxY; y++) {
			for (let x = minX; x <= maxX; x++) {
				const p = y * size + x;
				const a = cover[p];
				if (a <= 0) continue;
				cover[p] = 0;
				const keep = 1 - a;
				tile.rgb[p * 3] = color[0] * a + tile.rgb[p * 3] * keep;
				tile.rgb[p * 3 + 1] = color[1] * a + tile.rgb[p * 3 + 1] * keep;
				tile.rgb[p * 3 + 2] = color[2] * a + tile.rgb[p * 3 + 2] * keep;
				tile.alpha[p] = a + tile.alpha[p] * keep;
			}
		}
	}

	/** A tapering polyline (twig, needle) in unit tile coordinates, half widths in tile units. */
	stroke(points: readonly Point[], half: readonly number[], color: Channels): void {
		const s = this.size;
		const pts = points.map(([x, y]) => [x * s, y * s]);
		const hs = half.map((h) => Math.max(0.45, h * s));
		const reach = Math.max(...hs) + 1.5;
		const minX = Math.max(0, Math.floor(Math.min(...pts.map((p) => p[0])) - reach));
		const maxX = Math.min(s - 1, Math.ceil(Math.max(...pts.map((p) => p[0])) + reach));
		const minY = Math.max(0, Math.floor(Math.min(...pts.map((p) => p[1])) - reach));
		const maxY = Math.min(s - 1, Math.ceil(Math.max(...pts.map((p) => p[1])) + reach));
		if (minX > maxX || minY > maxY) return;
		const cover = this.cover;
		for (let i = 0; i < pts.length - 1; i++) {
			const [ax, ay] = pts[i];
			const [bx, by] = pts[i + 1];
			const ha = hs[i];
			const hb = hs[i + 1];
			const r = Math.max(ha, hb) + 1.5;
			const x0 = Math.max(minX, Math.floor(Math.min(ax, bx) - r));
			const x1 = Math.min(maxX, Math.ceil(Math.max(ax, bx) + r));
			const y0 = Math.max(minY, Math.floor(Math.min(ay, by) - r));
			const y1 = Math.min(maxY, Math.ceil(Math.max(ay, by) + r));
			const dx = bx - ax;
			const dy = by - ay;
			const lengthSq = dx * dx + dy * dy || 1e-6;
			for (let y = y0; y <= y1; y++) {
				const py = y + 0.5;
				for (let x = x0; x <= x1; x++) {
					const px = x + 0.5;
					const t = Math.min(1, Math.max(0, ((px - ax) * dx + (py - ay) * dy) / lengthSq));
					const qx = ax + dx * t - px;
					const qy = ay + dy * t - py;
					const c = Math.min(
						1,
						Math.max(0, ha + (hb - ha) * t - Math.sqrt(qx * qx + qy * qy) + 0.5)
					);
					const p = y * s + x;
					if (c > cover[p]) cover[p] = c;
				}
			}
		}
		this.composite(minX, maxX, minY, maxY, color);
	}

	/**
	 * A leaf growing from `base` in direction `angle` (radians, 0 = +x): `outline(t)` is its half
	 * width at t (0 base … 1 tip) as a fraction of `width`. Shaded darker at the base with a
	 * darker midrib; `color` is [shade, new growth, hue].
	 */
	leaf(
		base: Point,
		angle: number,
		length: number,
		width: number,
		outline: (t: number) => number,
		color: Channels
	): void {
		const s = this.size;
		const dir: Point = [Math.cos(angle), Math.sin(angle)];
		const tip: Point = [base[0] + dir[0] * length, base[1] + dir[1] * length];
		const reach = width * 0.6;
		const minX = Math.max(0, Math.floor((Math.min(base[0], tip[0]) - reach) * s));
		const maxX = Math.min(s - 1, Math.ceil((Math.max(base[0], tip[0]) + reach) * s));
		const minY = Math.max(0, Math.floor((Math.min(base[1], tip[1]) - reach) * s));
		const maxY = Math.min(s - 1, Math.ceil((Math.max(base[1], tip[1]) + reach) * s));
		const tile = this.tile;
		const halves = outlineTable(outline);
		const ribWidth = width * 0.05 + 0.6 / s;
		for (let y = minY; y <= maxY; y++) {
			for (let x = minX; x <= maxX; x++) {
				const u = (x + 0.5) / s - base[0];
				const v = (y + 0.5) / s - base[1];
				const along = u * dir[0] + v * dir[1];
				const t = along / length;
				if (t < 0 || t > 1) continue;
				const across = Math.abs(u * -dir[1] + v * dir[0]);
				const d = halves[Math.round(t * OUTLINE_STEPS)] * width * 0.5 - across;
				const a = Math.min(1, Math.max(0, d * s + 0.5));
				if (a <= 0) continue;
				// Darker midrib: a narrow tent along the leaf's axis, fading toward the tip.
				const rib = Math.max(0, 1 - across / ribWidth) * 0.08 * (1 - t);
				const shade = color[0] * (0.84 + 0.3 * t) - rib;
				const p = y * s + x;
				const keep = 1 - a;
				tile.rgb[p * 3] = shade * a + tile.rgb[p * 3] * keep;
				tile.rgb[p * 3 + 1] = color[1] * a + tile.rgb[p * 3 + 1] * keep;
				tile.rgb[p * 3 + 2] = color[2] * a + tile.rgb[p * 3 + 2] * keep;
				tile.alpha[p] = a + tile.alpha[p] * keep;
			}
		}
	}

	finish(): AtlasTile {
		return finishTile(this.tile);
	}
}

/** Leaf outlines are sampled once per shape (per-texel `pow`/`sin` made the atlas slow to build). */
const OUTLINE_STEPS = 96;
const outlineTables = new Map<(t: number) => number, Float32Array>();
function outlineTable(outline: (t: number) => number): Float32Array {
	let table = outlineTables.get(outline);
	if (!table) {
		table = new Float32Array(OUTLINE_STEPS + 1);
		for (let i = 0; i <= OUTLINE_STEPS; i++) table[i] = outline(i / OUTLINE_STEPS);
		outlineTables.set(outline, table);
	}
	return table;
}

const ovalLeaf = (t: number) => Math.pow(Math.sin(Math.PI * t), 0.62);
const pointedLeaf = (t: number) =>
	Math.pow(Math.sin(Math.PI * Math.pow(t, 0.8)), 0.8) * (1 - t * t * 0.4);
const lanceLeaf = (t: number) => Math.pow(Math.sin(Math.PI * Math.pow(t, 0.65)), 1.1);
/** Rounded oak lobes: three or four soft waves per side, narrowing toward the stalk. */
const oakLeaf = (t: number) =>
	Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.02)), 0.5) *
	(0.82 + 0.18 * Math.cos(t * Math.PI * 7 + 0.6)) *
	Math.min(1, 0.4 + t * 2.4);

function clampPoint(p: Point, margin: number): Point {
	return [
		Math.min(1 - margin, Math.max(margin, p[0])),
		Math.min(1 - margin, Math.max(margin, p[1]))
	];
}

/** Points along a gently curving twig from `from`, heading `angle`, `length` long. */
function twigPath(from: Point, angle: number, length: number, curl: number, steps = 6): Point[] {
	const points: Point[] = [from];
	let a = angle;
	let p = from;
	for (let i = 0; i < steps; i++) {
		a += curl / steps;
		p = [p[0] + Math.cos(a) * (length / steps), p[1] + Math.sin(a) * (length / steps)];
		points.push(p);
	}
	return points;
}

function pointAlong(path: readonly Point[], t: number): { point: Point; angle: number } {
	const f = Math.min(path.length - 1.0001, Math.max(0, t * (path.length - 1)));
	const i = Math.floor(f);
	const k = f - i;
	const a = path[i];
	const b = path[i + 1];
	return {
		point: [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k],
		angle: Math.atan2(b[1] - a[1], b[0] - a[0])
	};
}

/**
 * Leafy twig sprays (broadleaf, oak, small-leaf): a main twig with alternating side twigs, leaves
 * along each and a terminal cluster, drawn inner (dark) to outer (light).
 */
function leafySpray(
	size: number,
	seed: number,
	options: {
		sideTwigs: number;
		/** Forks per side twig. */
		subTwigs: number;
		leafLength: [number, number];
		leafWidth: number;
		spacing: number;
		outline: (t: number) => number;
		tipCluster: number;
	}
): AtlasTile {
	const painter = new SprayPainter(size);
	const random = rng(seed);
	const main = twigPath(
		[0.5, 0.02],
		Math.PI / 2 + (random() - 0.5) * 0.25,
		0.8,
		(random() - 0.5) * 0.5
	);
	const twigs: { path: Point[]; depth: number }[] = [{ path: main, depth: 0 }];
	for (let i = 0; i < options.sideTwigs; i++) {
		const t = 0.14 + (i / Math.max(1, options.sideTwigs - 1)) * 0.6 + (random() - 0.5) * 0.06;
		const { point, angle } = pointAlong(main, t);
		const side = i % 2 === 0 ? 1 : -1;
		const branchAngle = angle + side * (0.6 + random() * 0.35);
		const length = (0.26 + random() * 0.12) * (1 - t * 0.45);
		const path = twigPath(point, branchAngle, length, -side * 0.4, 4);
		twigs.push({ path, depth: 1 });
		// Each side twig forks once or twice more, so the spray fills out like a real one.
		for (let k = 0; k < options.subTwigs; k++) {
			const at = pointAlong(path, 0.35 + k * 0.3 + random() * 0.1);
			const s = k % 2 === 0 ? -side : side;
			twigs.push({
				path: twigPath(
					at.point,
					at.angle + s * (0.55 + random() * 0.3),
					length * (0.4 + random() * 0.15),
					-s * 0.3,
					3
				),
				depth: 2
			});
		}
	}
	// Twigs first (under the leaves), then leaves from the base outward.
	for (const twig of twigs) {
		const half =
			twig.depth === 0 ? [0.012, 0.004] : twig.depth === 1 ? [0.007, 0.003] : [0.004, 0.002];
		painter.stroke(
			twig.path,
			twig.path.map((_, k) => half[0] + (half[1] - half[0]) * (k / (twig.path.length - 1))),
			[0.3, 0, 0.5]
		);
	}
	const leaves: { base: Point; angle: number; length: number; order: number }[] = [];
	for (const twig of twigs) {
		let side = random() < 0.5 ? 1 : -1;
		for (let t = 0.12; t < 0.98; t += options.spacing * (0.8 + random() * 0.4)) {
			const { point, angle } = pointAlong(twig.path, t);
			const length =
				(options.leafLength[0] + random() * (options.leafLength[1] - options.leafLength[0])) *
				(twig.depth === 0 ? 1 : twig.depth === 1 ? 0.92 : 0.85);
			leaves.push({
				base: point,
				angle: angle + side * (0.7 + random() * 0.45),
				length,
				order: t * 0.5 + twig.depth * 0.15 + random() * 0.25
			});
			side = -side;
		}
		// Terminal cluster: a few leaves fanning past the twig tip.
		const end = twig.path[twig.path.length - 1];
		const endAngle = pointAlong(twig.path, 1).angle;
		for (let k = 0; k < options.tipCluster; k++) {
			const spread = (k - (options.tipCluster - 1) / 2) * 0.55 + (random() - 0.5) * 0.2;
			leaves.push({
				base: end,
				angle: endAngle + spread,
				length: options.leafLength[1] * (0.95 + random() * 0.15),
				order: 0.85 + random() * 0.15
			});
		}
	}
	leaves.sort((a, b) => a.order - b.order);
	for (const leaf of leaves) {
		// Keep each leaf whole inside the tile: pull long ones in rather than clipping them.
		let length = leaf.length;
		const width = length * options.leafWidth;
		const tipAt = () => [
			leaf.base[0] + Math.cos(leaf.angle) * length,
			leaf.base[1] + Math.sin(leaf.angle) * length
		];
		for (let k = 0; k < 6; k++) {
			const [x, y] = tipAt();
			if (x > 0.03 && x < 0.97 && y > 0.03 && y < 0.97) break;
			length *= 0.82;
		}
		const base = clampPoint(leaf.base, 0.03);
		const shade = 0.36 + leaf.order * 0.18 + (random() - 0.5) * 0.08;
		const growth = Math.max(0, leaf.order - 0.55) * 1.6 * (0.5 + random() * 0.5);
		painter.leaf(base, leaf.angle, length, Math.min(width, length), options.outline, [
			shade,
			Math.min(1, growth),
			random()
		]);
	}
	return painter.finish();
}

/** Birch: three or four thin, curving twigs with small pointed leaves and plenty of sky between. */
function birchSpray(size: number, seed: number): AtlasTile {
	const painter = new SprayPainter(size);
	const random = rng(seed);
	const twigs: Point[][] = [];
	const count = 6;
	for (let i = 0; i < count; i++) {
		const angle = Math.PI / 2 + (i - (count - 1) / 2) * 0.24 + (random() - 0.5) * 0.15;
		twigs.push(
			twigPath(
				[0.5 + (random() - 0.5) * 0.04, 0.02],
				angle,
				0.82 + random() * 0.1,
				(random() - 0.5) * 0.9,
				7
			)
		);
	}
	for (const path of twigs)
		painter.stroke(
			path,
			path.map((_, k) => 0.006 - k * 0.0005),
			[0.26, 0, 0.5]
		);
	for (const path of twigs) {
		let side = 1;
		for (let t = 0.12; t < 1; t += 0.06 + random() * 0.03) {
			const { point, angle } = pointAlong(path, t);
			const length = 0.085 + random() * 0.035;
			painter.leaf(
				clampPoint(point, 0.04),
				angle + side * (0.75 + random() * 0.4),
				length,
				length * 0.7,
				pointedLeaf,
				[
					0.4 + t * 0.16 + (random() - 0.5) * 0.08,
					Math.max(0, t - 0.5) * (0.6 + random() * 0.6),
					random()
				]
			);
			side = -side;
		}
	}
	return painter.finish();
}

/** Pine: a bottle-brush of long needles around a twig, the newest growth lighter at the tip. */
function needleSpray(size: number, seed: number): AtlasTile {
	const painter = new SprayPainter(size);
	const random = rng(seed);
	const main = twigPath(
		[0.5, 0.02],
		Math.PI / 2 + (random() - 0.5) * 0.12,
		0.88,
		(random() - 0.5) * 0.3,
		8
	);
	painter.stroke(
		main,
		main.map((_, k) => 0.016 - k * 0.001),
		[0.3, 0, 0.5]
	);
	for (let t = 0.05; t < 1; t += 0.011) {
		const { point, angle } = pointAlong(main, t);
		const envelope = Math.sin(Math.PI * Math.min(1, 0.25 + t * 0.85));
		for (let k = 0; k < 3; k++) {
			const side = k === 2 ? (random() < 0.5 ? -1 : 1) : k === 0 ? 1 : -1;
			const spread = 0.5 + random() * 0.65;
			const a = angle + side * spread;
			const length = (0.17 + random() * 0.14) * (0.5 + envelope * 0.6);
			const end: Point = [point[0] + Math.cos(a) * length, point[1] + Math.sin(a) * length];
			const mid: Point = [
				point[0] + Math.cos(a - side * 0.08) * length * 0.55,
				point[1] + Math.sin(a - side * 0.08) * length * 0.55
			];
			painter.stroke(
				[point, mid, clampPoint(end, 0.01)],
				[0.0055, 0.0045, 0.0018],
				[0.38 + random() * 0.16 + t * 0.06, Math.max(0, t - 0.7) * 2.4 * random(), random()]
			);
		}
	}
	return painter.finish();
}

/** Spruce: a flat frond — a stem with alternating branchlets, all of it densely short-needled. */
function spruceSpray(size: number, seed: number): AtlasTile {
	const painter = new SprayPainter(size);
	const random = rng(seed);
	const main = twigPath(
		[0.5, 0.02],
		Math.PI / 2 + (random() - 0.5) * 0.08,
		0.92,
		(random() - 0.5) * 0.2,
		8
	);
	const branchlets: { path: Point[]; t: number }[] = [{ path: main, t: 0 }];
	let side = 1;
	for (let t = 0.05; t < 0.88; t += 0.058 + random() * 0.018) {
		const { point, angle } = pointAlong(main, t);
		const length = 0.1 + 0.3 * Math.pow(1 - t, 0.5) * (0.85 + random() * 0.3);
		branchlets.push({
			path: twigPath(point, angle + side * (0.85 + random() * 0.25), length, -side * 0.35, 4),
			t
		});
		side = -side;
	}
	for (const { path } of branchlets)
		painter.stroke(
			path,
			path.map((_, k) => (path === main ? 0.011 : 0.006) - k * 0.0006),
			[0.28, 0, 0.5]
		);
	for (const { path, t: at } of branchlets) {
		const isMain = path === main;
		const steps = isMain ? 90 : 30;
		for (let i = 0; i < steps; i++) {
			const t = (i + random() * 0.5) / steps;
			const { point, angle } = pointAlong(path, t);
			for (const s of [-1, 1]) {
				const a = angle + s * (0.9 + random() * 0.5);
				const length = (isMain ? 0.05 : 0.04) * (0.8 + random() * 0.4) * (1 - t * 0.35);
				const end = clampPoint(
					[point[0] + Math.cos(a) * length, point[1] + Math.sin(a) * length],
					0.01
				);
				const outer = isMain ? t : at * 0.4 + t * 0.6;
				painter.stroke(
					[point, end],
					[0.0052, 0.002],
					[
						0.34 + random() * 0.14 + outer * 0.1,
						Math.max(0, outer - 0.72) * 2.8 * random(),
						random()
					]
				);
			}
		}
	}
	return painter.finish();
}

/** Cypress / juniper: a branching fan of beaded scale-leaf sprays. */
function scaleSpray(size: number, seed: number): AtlasTile {
	const painter = new SprayPainter(size);
	const random = rng(seed);
	const branch = (from: Point, angle: number, length: number, depth: number) => {
		const steps = 7;
		const path = twigPath(from, angle, length, (random() - 0.5) * 0.5, steps);
		const width = 0.036 * Math.pow(0.74, depth);
		// Beaded: the half width pulses along the spray like overlapping scale leaves.
		const half = path.map((_, k) => width * (1 - k / (steps + 2)) * (k % 2 === 0 ? 1 : 0.78));
		painter.stroke(
			path.map((p) => clampPoint(p, 0.015)),
			half,
			[0.36 + depth * 0.06 + random() * 0.08, depth >= 2 ? random() * 0.6 : 0, random()]
		);
		if (depth >= 3) return;
		const children = depth === 0 ? 5 : depth === 1 ? 4 : 3;
		for (let c = 0; c < children; c++) {
			const t = 0.2 + (c / children) * 0.7;
			const { point, angle: a } = pointAlong(path, t);
			const s = c % 2 === 0 ? 1 : -1;
			branch(point, a + s * (0.55 + random() * 0.35), length * (0.5 + random() * 0.12), depth + 1);
		}
	};
	branch([0.5, 0.02], Math.PI / 2 + (random() - 0.5) * 0.15, 0.62, 0);
	return painter.finish();
}

/**
 * Willow: a curtain of thin hanging strands with narrow leaves. The card is ~3× longer than wide,
 * so round-ish leaves in tile space stretch into long narrow willow leaves on the card.
 */
function willowSpray(size: number, seed: number): AtlasTile {
	const painter = new SprayPainter(size);
	const random = rng(seed);
	const strands = 6;
	for (let i = 0; i < strands; i++) {
		const x0 = 0.5 + (i - (strands - 1) / 2) * 0.13 + (random() - 0.5) * 0.05;
		const length = 0.8 + random() * 0.17;
		const sway = (random() - 0.5) * 0.12;
		const path: Point[] = [];
		for (let k = 0; k <= 10; k++) {
			const t = k / 10;
			path.push([x0 + sway * t * t + Math.sin(t * 5 + i) * 0.015, 0.02 + t * length]);
		}
		painter.stroke(
			path,
			path.map(() => 0.006),
			[0.3, 0, 0.5]
		);
		let side = 1;
		for (let t = 0.04; t < 1; t += 0.028 + random() * 0.012) {
			const { point, angle } = pointAlong(path, t);
			const l = 0.07 + random() * 0.03;
			painter.leaf(
				clampPoint(point, 0.02),
				angle + side * (0.25 + random() * 0.2),
				l,
				l * 0.42,
				lanceLeaf,
				[0.38 + random() * 0.14 + t * 0.06, Math.max(0, t - 0.6) * random() * 1.4, random()]
			);
			side = -side;
		}
	}
	return painter.finish();
}

function paintTile(tile: TreeCardTile, size: number): AtlasTile {
	const seed = 0x7ee0 + cardTileIndex(tile) * 7919;
	switch (tile) {
		case 'broadleaf':
			return leafySpray(size, seed, {
				sideTwigs: 5,
				subTwigs: 2,
				leafLength: [0.1, 0.14],
				leafWidth: 0.55,
				spacing: 0.13,
				outline: ovalLeaf,
				tipCluster: 3
			});
		case 'oak':
			return leafySpray(size, seed, {
				sideTwigs: 5,
				subTwigs: 2,
				leafLength: [0.11, 0.15],
				leafWidth: 0.6,
				spacing: 0.15,
				outline: oakLeaf,
				tipCluster: 4
			});
		case 'small-leaf':
			return leafySpray(size, seed, {
				sideTwigs: 6,
				subTwigs: 2,
				leafLength: [0.07, 0.095],
				leafWidth: 0.62,
				spacing: 0.085,
				outline: ovalLeaf,
				tipCluster: 3
			});
		case 'birch':
			return birchSpray(size, seed);
		case 'needles':
			return needleSpray(size, seed);
		case 'spruce':
			return spruceSpray(size, seed);
		case 'scales':
			return scaleSpray(size, seed);
		case 'willow':
			return willowSpray(size, seed);
	}
}

/**
 * Generates the atlas (deterministic — identical on every machine). 256-texel tiles keep near
 * sprays crisp; the whole chain is ~2.8 MB of RGBA8.
 */
export function generateTreeCardAtlas(tileSize = 256): TreeCardAtlas {
	const tiles = TREE_CARD_TILES.map((tile) => paintTile(tile, tileSize));
	const { levels, coverage } = buildAtlasLevels(
		tiles,
		TREE_CARD_ATLAS_COLUMNS,
		TREE_CARD_ATLAS_ROWS,
		{
			cutoff: TREE_CARD_ALPHA_CUTOFF,
			minTile: 8,
			rgbScale: 1
		}
	);
	return { tileSize, levels, coverage };
}

export function treeCardAtlasBytes(atlas: TreeCardAtlas): number {
	return atlas.levels.reduce((sum, level) => sum + level.data.byteLength, 0);
}
