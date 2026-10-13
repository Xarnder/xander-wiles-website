/**
 * Near (LOD0) plant geometry: one small merged mesh per (species, prototype variant), compiled
 * lazily and shared by every instance of that variant (see PlantPrototypeCache). Pure typed
 * arrays — no Three.js — so tests can count triangles and check for NaNs.
 *
 * Vocabulary, all deliberately cheap:
 *   stems    3–4-sided tapered prisms in two bent segments
 *   petals   one card (2 triangles) each, textured with a petal mask from the atlas
 *   centres  a 6-triangle dome with the seed-disk mask
 *   leaves   1–3-segment bent cards (2–6 triangles); succulents fold theirs into a V for thickness
 *   orbs     three crossed floret cards; clover a flat trefoil mat plus a few raised trefoils
 * A flower is typically 30–100 triangles; a rosette 20–50.
 *
 * Per-vertex data: position, an up-biased normal (cards never go black edge-on), atlas UV, base and
 * secondary colour (the shader mixes them by the mask's G channel — petal tips, leaf tips,
 * speckles), and `plant` = (wind weight, flower-head flag, stiffness, species hash).
 */
import { rng } from '../atlas/alphaAtlas';
import type { RgbColor } from '../../materials/ProceduralMaterialTypes';
import {
	CENTRE_DISK_TILE,
	CENTRE_FLORET_TILE,
	CLOVER_PATCH_TILE,
	leafTile,
	petalTile,
	plantTileRect
} from './plantAtlas';
import type { PlantSpeciesDefinition } from './PlantTypes';

export interface PlantPrototypeGeometry {
	positions: Float32Array;
	normals: Float32Array;
	uvs: Float32Array;
	colors: Float32Array;
	colors2: Float32Array;
	/** wind weight (0 base → 1 top), flower-head flag, stiffness, species hash (debug colour). */
	plant: Float32Array;
	indices: Uint16Array;
	triangles: number;
	/** Height of the tallest vertex and horizontal radius, metres (bounds, cards). */
	height: number;
	radius: number;
}

type V3 = [number, number, number];
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
const cross = (a: V3, b: V3): V3 => [
	a[1] * b[2] - a[2] * b[1],
	a[2] * b[0] - a[0] * b[2],
	a[0] * b[1] - a[1] * b[0]
];
const length = (a: V3) => Math.hypot(a[0], a[1], a[2]);
const normalize = (a: V3): V3 => {
	const l = length(a) || 1;
	return [a[0] / l, a[1] / l, a[2] / l];
};
/** Rotates `v` about unit `axis` by `angle` (Rodrigues). */
function rotate(v: V3, axis: V3, angle: number): V3 {
	const c = Math.cos(angle);
	const s = Math.sin(angle);
	const d = (1 - c) * (axis[0] * v[0] + axis[1] * v[1] + axis[2] * v[2]);
	const k = cross(axis, v);
	return [
		v[0] * c + k[0] * s + axis[0] * d,
		v[1] * c + k[1] * s + axis[1] * d,
		v[2] * c + k[2] * s + axis[2] * d
	];
}
const UP: V3 = [0, 1, 0];
const horizontal = (angle: number): V3 => [Math.cos(angle), 0, Math.sin(angle)];
/** Direction at `yaw` raised `lift` radians above horizontal. */
const raised = (yaw: number, lift: number): V3 => [
	Math.cos(yaw) * Math.cos(lift),
	Math.sin(lift),
	Math.sin(yaw) * Math.cos(lift)
];

/** Bias a card's face normal toward world up (and keep it upward-facing) so thin cards light softly. */
function softNormal(face: V3, upBias = 0.6): V3 {
	const f = face[1] < 0 ? scale(face, -1) : face;
	return normalize(add(scale(normalize(f), 1 - upBias), scale(UP, upBias)));
}

class PlantMeshBuilder {
	readonly positions: number[] = [];
	readonly normals: number[] = [];
	readonly uvs: number[] = [];
	readonly colors: number[] = [];
	readonly colors2: number[] = [];
	readonly head: number[] = [];
	readonly indices: number[] = [];
	headMode = 0;

	vertex(p: V3, n: V3, u: number, v: number, c1: RgbColor, c2: RgbColor): number {
		const index = this.positions.length / 3;
		this.positions.push(p[0], p[1], p[2]);
		this.normals.push(n[0], n[1], n[2]);
		this.uvs.push(u, v);
		this.colors.push(c1[0], c1[1], c1[2]);
		this.colors2.push(c2[0], c2[1], c2[2]);
		this.head.push(this.headMode);
		return index;
	}

	/**
	 * A card (petal, leaf, frond) from `origin` along `dir`, `width` across `side`, in `segments`
	 * rows that bend downward by `arch` toward the tip. `fold` raises the midline (thick succulent
	 * leaves). UVs map the card onto atlas `tile`.
	 */
	card(options: {
		origin: V3;
		dir: V3;
		side: V3;
		length: number;
		width: number;
		tile: number;
		c1: RgbColor;
		c2: RgbColor;
		segments?: number;
		arch?: number;
		fold?: number;
		upBias?: number;
	}): void {
		const { origin, length: len, width, tile, c1, c2 } = options;
		const segments = options.segments ?? 1;
		const arch = options.arch ?? 0;
		const fold = options.fold ?? 0;
		const side = normalize(options.side);
		const [u0, v0, u1, v1] = plantTileRect(tile);
		const columns = fold > 0 ? [0, 0.5, 1] : [0, 1];
		let dir = normalize(options.dir);
		// Rotation axis that bends the card's direction downward.
		const bendAxis = normalize(cross(dir, UP));
		const hasBendAxis = length(cross(dir, UP)) > 1e-4;
		let point = origin;
		const rows: number[][] = [];
		for (let i = 0; i <= segments; i++) {
			const t = i / segments;
			const face = cross(side, dir);
			const normal = softNormal(face, options.upBias ?? 0.6);
			const row: number[] = [];
			for (const c of columns) {
				const lift = fold > 0 && c === 0.5 ? fold * width : 0;
				const p = add(add(point, scale(side, (c - 0.5) * width)), scale(normal, lift));
				row.push(this.vertex(p, normal, u0 + (u1 - u0) * c, v0 + (v1 - v0) * t, c1, c2));
			}
			rows.push(row);
			if (i < segments) {
				point = add(point, scale(dir, len / segments));
				if (arch > 0 && hasBendAxis)
					dir = normalize(rotate(dir, bendAxis, (-arch * (Math.PI / 2.4)) / segments));
			}
		}
		for (let i = 0; i < segments; i++) {
			for (let c = 0; c < columns.length - 1; c++) {
				const a = rows[i][c];
				const b = rows[i][c + 1];
				const d = rows[i + 1][c];
				const e = rows[i + 1][c + 1];
				this.indices.push(a, b, d, b, e, d);
			}
		}
	}

	/** A tapered prism along a polyline (stems, stalks). */
	prism(points: V3[], radius0: number, radius1: number, sides: number, colour: RgbColor): void {
		const [u0, v0, u1, v1] = plantTileRect(leafTile('oval'));
		// A solid patch in the middle of the oval leaf mask: alpha 1, neutral shade.
		const uMid = u0 + (u1 - u0) * 0.5;
		const vLow = v0 + (v1 - v0) * 0.3;
		const vHigh = v0 + (v1 - v0) * 0.5;
		const rings: number[][] = [];
		for (let i = 0; i < points.length; i++) {
			const t = i / (points.length - 1);
			const r = radius0 + (radius1 - radius0) * t;
			const along = normalize(
				i < points.length - 1
					? add(points[i + 1], scale(points[i], -1))
					: add(points[i], scale(points[i - 1], -1))
			);
			const a = normalize(
				Math.abs(along[0]) < 0.9 ? cross(along, [1, 0, 0]) : cross(along, [0, 0, 1])
			);
			const b = cross(along, a);
			const ring: number[] = [];
			for (let s = 0; s < sides; s++) {
				const angle = (s / sides) * Math.PI * 2;
				const n = normalize(add(scale(a, Math.cos(angle)), scale(b, Math.sin(angle))));
				ring.push(
					this.vertex(
						add(points[i], scale(n, r)),
						softNormal(n, 0.35),
						uMid,
						vLow + (vHigh - vLow) * t,
						colour,
						colour
					)
				);
			}
			rings.push(ring);
		}
		for (let i = 0; i < rings.length - 1; i++) {
			for (let s = 0; s < sides; s++) {
				const a = rings[i][s];
				const b = rings[i][(s + 1) % sides];
				const c = rings[i + 1][s];
				const d = rings[i + 1][(s + 1) % sides];
				this.indices.push(a, b, c, b, d, c);
			}
		}
	}

	/** A low dome (flower centre): 6 triangles around a raised middle, seed-disk mask. */
	dome(
		centre: V3,
		up: V3,
		radius: number,
		rise: number,
		c1: RgbColor,
		c2: RgbColor,
		tile = CENTRE_DISK_TILE
	): void {
		const [u0, v0, u1, v1] = plantTileRect(tile);
		const a = normalize(Math.abs(up[1]) < 0.9 ? cross(up, UP) : cross(up, [1, 0, 0]));
		const b = cross(up, a);
		const top = this.vertex(add(centre, scale(up, rise)), up, (u0 + u1) / 2, (v0 + v1) / 2, c1, c2);
		const rim: number[] = [];
		for (let i = 0; i < 6; i++) {
			const angle = (i / 6) * Math.PI * 2;
			const offset = add(scale(a, Math.cos(angle) * radius), scale(b, Math.sin(angle) * radius));
			rim.push(
				this.vertex(
					add(centre, offset),
					softNormal(add(up, scale(normalize(offset), 0.5)), 0.3),
					(u0 + u1) / 2 + Math.cos(angle) * (u1 - u0) * 0.47,
					(v0 + v1) / 2 + Math.sin(angle) * (v1 - v0) * 0.47,
					c1,
					c2
				)
			);
		}
		for (let i = 0; i < 6; i++) this.indices.push(top, rim[i], rim[(i + 1) % 6]);
	}
}

function lerp3(a: RgbColor, b: RgbColor, t: number): RgbColor {
	return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
function darker(c: RgbColor, k: number): RgbColor {
	return [c[0] * k, c[1] * k, c[2] * k];
}

/** Hash of the species id in [0, 1) — the debug "species colours" view. */
export function speciesHash01(species: PlantSpeciesDefinition): number {
	let h = species.seed | 0;
	h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
	h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
	return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** A stem from `base` rising `height`, bending sideways toward `bendDir`; returns its top and tangent. */
function stem(
	builder: PlantMeshBuilder,
	base: V3,
	height: number,
	bendDir: V3,
	bend: number,
	radius: number,
	colour: RgbColor,
	sides: number
): { top: V3; tangent: V3 } {
	const mid = add(base, add(scale(UP, height * 0.5), scale(bendDir, height * bend * 0.35)));
	const top = add(base, add(scale(UP, height), scale(bendDir, height * bend)));
	if (radius > 0) builder.prism([base, mid, top], radius, radius * 0.6, sides, colour);
	return { top, tangent: normalize(add(top, scale(mid, -1))) };
}

/** Builds prototype `variant` of a species. Deterministic in (species seed, variant). */
export function buildPlantPrototype(
	species: PlantSpeciesDefinition,
	variant: number
): PlantPrototypeGeometry {
	const random = rng(Math.imul(species.seed ^ 0x51ed, 31) + variant * 7919);
	const b = new PlantMeshBuilder();
	const pal = species.palette;
	const f = species.flower;
	const leaves = species.foliage;
	const [hMin, hMax] = species.structure.height;
	const height = hMin + (hMax - hMin) * (0.2 + random() * 0.6);
	const turn = random() * Math.PI * 2;
	const sides = height < 0.25 ? 3 : 4;
	const leafCount = Math.max(
		1,
		leaves.leafCount + (random() < 0.5 ? -1 : 0) + (random() < 0.3 ? 1 : 0)
	);

	/** Leaves fanning out from a point (basal rosette or along a stem). */
	const leafFan = (origin: V3, count: number, lengthScale = 1, angleJitter = 0.25) => {
		for (let i = 0; i < count; i++) {
			const yaw = turn + (i / count) * Math.PI * 2 + (random() - 0.5) * angleJitter * 2;
			const lift = ((leaves.leafAngle + (random() - 0.5) * 12) * Math.PI) / 180;
			const dir = raised(yaw, lift);
			const len = leaves.leafLength * lengthScale * (0.8 + random() * 0.4);
			b.card({
				origin,
				dir,
				side: horizontal(yaw + Math.PI / 2),
				length: len,
				width: leaves.leafWidth * lengthScale * (0.85 + random() * 0.3),
				tile: leafTile(leaves.leafShape),
				c1: pal.leafBase,
				c2: pal.leafTip,
				segments: leaves.leafShape === 'frond' ? 3 : len > 0.12 ? 2 : 1,
				arch: leaves.arch * (0.8 + random() * 0.4),
				fold: leaves.leafShape === 'succulent' ? 0.22 : 0
			});
		}
	};

	/** A radial head (daisy / star / cup / cluster floret) centred at `centre`, facing `up`. */
	const radialHead = (
		centre: V3,
		up: V3,
		petals: number,
		length: number,
		width: number,
		liftDeg: number,
		centreRadius: number
	) => {
		b.headMode = 1;
		const a = normalize(Math.abs(up[1]) < 0.95 ? cross(up, UP) : cross(up, [1, 0, 0]));
		const c = cross(up, a);
		const offset = random() * Math.PI * 2;
		const tile = petalTile(f?.petalShape ?? 'round');
		for (let i = 0; i < petals; i++) {
			const angle = offset + (i / petals) * Math.PI * 2 + (random() - 0.5) * 0.12;
			const radial = normalize(add(scale(a, Math.cos(angle)), scale(c, Math.sin(angle))));
			const lift = ((liftDeg + (random() - 0.5) * 8) * Math.PI) / 180;
			const dir = normalize(add(scale(radial, Math.cos(lift)), scale(up, Math.sin(lift))));
			const side = normalize(cross(up, radial));
			b.card({
				origin: add(centre, scale(radial, centreRadius * 0.55)),
				dir,
				side,
				length: length * (0.9 + random() * 0.2),
				width,
				tile,
				c1: pal.petalBase,
				c2: pal.petalTip,
				upBias: 0.45
			});
		}
		if (centreRadius > 0.006)
			b.dome(
				add(centre, scale(up, length * 0.02)),
				up,
				centreRadius,
				centreRadius * 0.45,
				pal.centre,
				darker(pal.centre, 0.6)
			);
		b.headMode = 0;
	};

	/** Orb: three crossed floret cards. */
	const orb = (centre: V3, radius: number) => {
		b.headMode = 1;
		const [u0, v0, u1, v1] = plantTileRect(CENTRE_FLORET_TILE);
		const quads: [V3, V3][] = [
			[
				[1, 0, 0],
				[0, 1, 0]
			],
			[
				[0, 0, 1],
				[0, 1, 0]
			],
			[
				[1, 0, 0],
				[0, 0, 1]
			]
		];
		for (const [ax, ay] of quads) {
			const r1 = rotate(ax, UP, turn);
			const r2 = rotate(ay, UP, turn);
			const n = softNormal(cross(r1, r2), 0.5);
			const corners: [number, number][] = [
				[-1, -1],
				[1, -1],
				[1, 1],
				[-1, 1]
			];
			const ids = corners.map(([x, y]) =>
				b.vertex(
					add(centre, add(scale(r1, x * radius), scale(r2, y * radius))),
					n,
					x < 0 ? u0 : u1,
					y < 0 ? v0 : v1,
					pal.petalBase,
					pal.petalTip
				)
			);
			b.indices.push(ids[0], ids[1], ids[2], ids[0], ids[2], ids[3]);
		}
		b.headMode = 0;
	};

	const family = species.family;
	const stems = Math.max(
		1,
		species.structure.stems + (species.structure.stems > 1 && random() < 0.5 ? -1 : 0)
	);
	if (f && family !== 'clover') {
		for (let s = 0; s < stems; s++) {
			const spread = stems > 1 ? species.structure.radius * 0.45 : 0;
			const base: V3 =
				s === 0 && stems === 1
					? [0, 0, 0]
					: [
							Math.cos(turn + s * 2.4) * spread * (0.4 + random() * 0.6),
							0,
							Math.sin(turn + s * 2.4) * spread * (0.4 + random() * 0.6)
						];
			const h = height * (s === 0 ? 1 : 0.75 + random() * 0.25);
			const bendDir = horizontal(turn + s * 1.9 + random());
			const bend =
				family === 'bell-flower'
					? 0.35 + random() * 0.15
					: species.structure.stemBend * (0.6 + random() * 0.8);
			const stemTop = family === 'cluster-flower' ? h * 0.72 : h;
			const { top, tangent } = stem(
				b,
				base,
				stemTop,
				bendDir,
				bend,
				species.structure.stemRadius,
				pal.stem,
				sides
			);
			const tiltAxis = normalize(cross(UP, bendDir));
			const headUp = normalize(
				rotate(UP, tiltAxis, ((f.headTilt * Math.PI) / 180) * (0.7 + random() * 0.6))
			);
			switch (family) {
				case 'bell-flower': {
					// Bells hang from the arching top; each is a downward cone of petals.
					for (let k = 0; k < f.blossoms; k++) {
						const at = add(
							top,
							add(scale(bendDir, -k * f.petalLength * 0.9), scale(UP, -k * f.petalLength * 0.4))
						);
						radialHead(
							add(at, [0, -f.petalLength * 0.15, 0]),
							[0, -1, 0],
							f.petalCount,
							f.petalLength,
							f.petalWidth,
							-f.petalLift - 90,
							f.centreRadius
						);
					}
					break;
				}
				case 'spike-flower': {
					// Florets up the top 45% of the stem, shrinking toward the tip, base → tip colour.
					b.headMode = 1;
					for (let k = 0; k < f.blossoms; k++) {
						const t = k / Math.max(1, f.blossoms - 1);
						const y = 0.55 + t * 0.45;
						const p = add(base, add(scale(UP, h * y), scale(bendDir, h * bend * y * y)));
						const size = f.petalLength * (1 - t * 0.5);
						const colour = lerp3(pal.petalBase, pal.petalTip, t);
						for (let q = 0; q < f.petalCount; q++) {
							const yaw = turn + (q / f.petalCount) * Math.PI * 2 + k * 0.9;
							b.card({
								origin: p,
								dir: raised(yaw, (f.petalLift * Math.PI) / 180),
								side: horizontal(yaw + Math.PI / 2),
								length: size,
								width: f.petalWidth * (1 - t * 0.4),
								tile: petalTile(f.petalShape),
								c1: colour,
								c2: pal.petalTip,
								upBias: 0.4
							});
						}
					}
					b.headMode = 0;
					break;
				}
				case 'orb-flower':
					orb(add(top, scale(headUp, f.centreRadius * 0.6)), f.centreRadius);
					break;
				case 'cluster-flower': {
					for (let k = 0; k < f.blossoms; k++) {
						const yaw = turn + (k / f.blossoms) * Math.PI * 2 + random() * 0.5;
						const branchEnd = add(
							top,
							add(scale(horizontal(yaw), h * 0.16), scale(UP, h * (0.18 + random() * 0.12)))
						);
						b.prism(
							[top, branchEnd],
							species.structure.stemRadius * 0.6,
							species.structure.stemRadius * 0.4,
							3,
							pal.stem
						);
						radialHead(
							branchEnd,
							normalize(add(UP, scale(horizontal(yaw), 0.4))),
							f.petalCount,
							f.petalLength,
							f.petalWidth,
							f.petalLift,
							f.centreRadius
						);
					}
					break;
				}
				default:
					radialHead(
						top,
						normalize(add(headUp, scale(tangent, 0.3))),
						f.petalCount,
						f.petalLength,
						f.petalWidth,
						f.petalLift,
						f.centreRadius
					);
			}
			// Leaves: a basal tuft on the first stem, or a few up the stem.
			if (s === 0) {
				if (leaves.basal) leafFan([0, 0, 0], leafCount);
				else
					for (let i = 0; i < leafCount; i++) {
						const y = 0.18 + (i / leafCount) * 0.45;
						const at = add(
							base,
							add(scale(UP, stemTop * y), scale(bendDir, stemTop * bend * y * y))
						);
						leafFan(at, 1, 0.9);
					}
			}
		}
	} else {
		switch (family) {
			case 'clover': {
				// The patch mat itself, a few raised trefoils, and optional blossoms on fine stalks.
				const r = species.structure.radius;
				const [u0, v0, u1, v1] = plantTileRect(CLOVER_PATCH_TILE);
				const corners: [number, number][] = [
					[-1, -1],
					[1, -1],
					[1, 1],
					[-1, 1]
				];
				const ids = corners.map(([x, z]) => {
					const p = rotate([x * r, 0.012, z * r], UP, turn);
					return b.vertex(p, UP, x < 0 ? u0 : u1, z < 0 ? v0 : v1, pal.leafBase, pal.leafTip);
				});
				b.indices.push(ids[0], ids[2], ids[1], ids[0], ids[3], ids[2]);
				for (let i = 0; i < leafCount; i++) {
					const yaw = random() * Math.PI * 2;
					const d = Math.sqrt(random()) * r * 0.75;
					const at: V3 = [Math.cos(yaw) * d, height * (0.35 + random() * 0.65), Math.sin(yaw) * d];
					const size = leaves.leafLength;
					const dir = raised(random() * Math.PI * 2, 0.15);
					b.card({
						origin: add(at, scale(dir, -size / 2)),
						dir,
						side: normalize(cross(UP, dir)),
						length: size,
						width: leaves.leafWidth,
						tile: leafTile('trefoil'),
						c1: pal.leafBase,
						c2: pal.leafTip,
						upBias: 0.8
					});
				}
				if (f) {
					for (let k = 0; k < f.blossoms; k++) {
						const yaw = random() * Math.PI * 2;
						const d = Math.sqrt(random()) * r * 0.6;
						const base: V3 = [Math.cos(yaw) * d, 0, Math.sin(yaw) * d];
						const top = add(base, [0, height * 1.5, 0]);
						b.prism([base, top], 0.002, 0.0015, 3, pal.stem);
						orb(top, f.centreRadius * 1.2);
					}
				}
				break;
			}
			case 'ground-tuft': {
				for (let i = 0; i < 3; i++) {
					const yaw = turn + (i * Math.PI) / 3;
					b.card({
						origin: add([0, 0, 0], scale(horizontal(yaw + Math.PI / 2), 0)),
						dir: [0.04 * Math.cos(yaw), 1, 0.04 * Math.sin(yaw)],
						side: horizontal(yaw),
						length: height,
						width: leaves.leafWidth,
						tile: leafTile('strap'),
						c1: pal.leafBase,
						c2: pal.leafTip,
						segments: 2,
						arch: 0.08,
						upBias: 0.5
					});
				}
				break;
			}
			case 'broadleaf': {
				for (let i = 0; i < leafCount; i++) {
					const yaw = turn + (i / leafCount) * Math.PI * 2 + (random() - 0.5) * 0.5;
					const stalkTop: V3 = add(scale(horizontal(yaw), leaves.leafLength * 0.15), [
						0,
						height * (0.35 + random() * 0.55),
						0
					]);
					b.prism([[0, 0, 0], stalkTop], 0.004, 0.003, 3, pal.stem);
					b.card({
						origin: stalkTop,
						dir: raised(yaw, (leaves.leafAngle * Math.PI) / 180),
						side: horizontal(yaw + Math.PI / 2),
						length: leaves.leafLength * (0.8 + random() * 0.4),
						width: leaves.leafWidth,
						tile: leafTile(leaves.leafShape),
						c1: pal.leafBase,
						c2: pal.leafTip,
						segments: 2,
						arch: leaves.arch
					});
				}
				break;
			}
			case 'succulent': {
				// Two rings: an outer spreading ring and an inner upright one.
				leafFan([0, 0, 0], Math.ceil(leafCount * 0.6), 1, 0.15);
				const inner = Math.floor(leafCount * 0.4);
				for (let i = 0; i < inner; i++) {
					const yaw = turn + 0.4 + (i / Math.max(1, inner)) * Math.PI * 2;
					const dir = raised(yaw, ((leaves.leafAngle + 22) * Math.PI) / 180);
					b.card({
						origin: [0, 0, 0],
						dir,
						side: horizontal(yaw + Math.PI / 2),
						length: leaves.leafLength * 0.7,
						width: leaves.leafWidth * 0.8,
						tile: leafTile('succulent'),
						c1: pal.leafBase,
						c2: pal.leafTip,
						fold: 0.22
					});
				}
				break;
			}
			default:
				// rosette, fern
				leafFan([0, 0, 0], leafCount);
		}
	}

	return finalize(b, species, height);
}

function finalize(
	b: PlantMeshBuilder,
	species: PlantSpeciesDefinition,
	nominalHeight: number
): PlantPrototypeGeometry {
	const count = b.positions.length / 3;
	let top = 0;
	let radius = 0;
	for (let i = 0; i < count; i++) {
		top = Math.max(top, b.positions[i * 3 + 1]);
		radius = Math.max(radius, Math.hypot(b.positions[i * 3], b.positions[i * 3 + 2]));
	}
	// Wind weight: (height / plant height)², so the base is pinned and tips move; low ground plants
	// use their own spread as the "height" so their leaf tips still stir a little.
	const span = Math.max(top, nominalHeight, 0.05);
	const plant = new Float32Array(count * 4);
	const hash = speciesHash01(species);
	for (let i = 0; i < count; i++) {
		const y = Math.max(0, b.positions[i * 3 + 1]) / span;
		const r = Math.hypot(b.positions[i * 3], b.positions[i * 3 + 2]) / Math.max(radius, 0.05);
		const reach = Math.max(y, r * 0.35);
		plant[i * 4] = Math.min(1, reach * reach);
		plant[i * 4 + 1] = b.head[i];
		plant[i * 4 + 2] = species.stiffness;
		plant[i * 4 + 3] = hash;
	}
	return {
		positions: new Float32Array(b.positions),
		normals: new Float32Array(b.normals),
		uvs: new Float32Array(b.uvs),
		colors: new Float32Array(b.colors),
		colors2: new Float32Array(b.colors2),
		plant,
		indices: new Uint16Array(b.indices),
		triangles: b.indices.length / 3,
		height: top,
		radius
	};
}
