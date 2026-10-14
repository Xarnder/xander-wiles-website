import * as THREE from 'three';
import {
	woodHash,
	woodLogFor,
	writeWoodCoord,
	type Vec3,
	type WoodPieceFrame
} from '../materials/woodCoords';
import type { BarrierLayout, BarrierRailJointMember, BarrierRailMember } from './barrierLayout';
import {
	buildBalusterPrototype,
	buildCapPrototype,
	buildPostPrototype,
	type BarrierLod,
	type BarrierPrototype
} from './barrierProfiles';
import type { BarrierRailProfile, BarrierStyleDefinition } from './BarrierTypes';

/**
 * Members → merged geometry. A whole barrier compiles to ONE indexed BufferGeometry per material
 * slot (main wood, plus accent caps when the style asks for a second wood), so a 20 m balustrade
 * with 150 balusters is one or two draw calls, never 150 meshes.
 *
 * Repeated members (balusters, posts, caps) come from cached prototypes (barrierProfiles.ts) and
 * are transformed into place; rails are extruded directly with their mitred ends. Every member also
 * gets its own solid-wood "log" (`woodCoord`, see materials/woodCoords.ts) with the grain along its
 * long axis — up a post, along a rail — so wood never runs sideways or stretches over a long rail.
 *
 * LOD 0 is the full design, LOD 1 drops lathe sides and rings, LOD 2 keeps only the silhouette
 * (box posts, plain rails, no balusters).
 */

export interface BarrierCompileOptions {
	lod: BarrierLod;
	/** Subtracted from every position (keeps vertex coordinates small and precise). */
	origin: { x: number; y: number; z: number };
	/** Per-barrier seed for wood variety. */
	seed: number;
}

export interface CompiledBarrierLevel {
	main: THREE.BufferGeometry | null;
	/** Caps in the accent wood — `null` when the style has none (or no caps). */
	accent: THREE.BufferGeometry | null;
	vertices: number;
	triangles: number;
	bytes: number;
}

const prototypeCache = new Map<string, BarrierPrototype>();
const PROTOTYPE_CACHE_LIMIT = 512;
let prototypeBuilds = 0;

/** Number of prototypes actually generated since start-up (tests and the stats overlay). */
export function barrierPrototypeBuildCount(): number {
	return prototypeBuilds;
}

function cachedPrototype(key: string, build: () => BarrierPrototype): BarrierPrototype {
	let proto = prototypeCache.get(key);
	if (!proto) {
		if (prototypeCache.size >= PROTOTYPE_CACHE_LIMIT) prototypeCache.clear();
		proto = build();
		prototypeBuilds++;
		prototypeCache.set(key, proto);
	}
	return proto;
}

const q = (v: number) => v.toFixed(4);

class Accumulator {
	readonly positions: number[] = [];
	readonly normals: number[] = [];
	readonly colors: number[] = [];
	readonly wood: number[] = [];
	readonly indices: number[] = [];
	private readonly woodScratch = new Float32Array(3);
	private readonly point: Vec3 = [0, 0, 0];

	get vertexCount(): number {
		return this.positions.length / 3;
	}

	/** `p` is absolute (barrier space); the origin is subtracted here, wood stays absolute. */
	push(
		px: number,
		py: number,
		pz: number,
		nx: number,
		ny: number,
		nz: number,
		tone: number,
		frame: WoodPieceFrame,
		log: ReturnType<typeof woodLogFor>,
		origin: BarrierCompileOptions['origin']
	): void {
		this.positions.push(px - origin.x, py - origin.y, pz - origin.z);
		this.normals.push(nx, ny, nz);
		this.colors.push(tone, tone, tone);
		this.point[0] = px;
		this.point[1] = py;
		this.point[2] = pz;
		writeWoodCoord(this.woodScratch, 0, this.point, frame, log);
		this.wood.push(this.woodScratch[0], this.woodScratch[1], this.woodScratch[2]);
	}

	toGeometry(): THREE.BufferGeometry | null {
		if (this.indices.length === 0) return null;
		const geometry = new THREE.BufferGeometry();
		geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
		// Normals and tones fit in a byte each: 30 bytes a vertex instead of 48.
		const normals = new Int8Array(this.normals.length);
		for (let i = 0; i < normals.length; i++) normals[i] = Math.round(this.normals[i] * 127);
		const colors = new Uint8Array(this.colors.length);
		for (let i = 0; i < colors.length; i++) colors[i] = Math.round(this.colors[i] * 255);
		geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3, true));
		geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3, true));
		geometry.setAttribute('woodCoord', new THREE.Float32BufferAttribute(this.wood, 3));
		geometry.setIndex(this.indices);
		geometry.computeBoundingBox();
		geometry.computeBoundingSphere();
		return geometry;
	}
}

function memberLog(cx: number, cy: number, cz: number, halfThin: number, seed: number) {
	const x = Math.round(cx * 100);
	const y = Math.round(cy * 100);
	const z = Math.round(cz * 100);
	return woodLogFor(
		halfThin,
		woodHash(x, y, z, seed),
		woodHash(z, x, y, seed ^ 0x5bd1e995),
		woodHash(y, z, x, seed ^ 0x68e31da4)
	);
}

/** Slight per-member tone so neighbouring pieces read as separate timbers. */
function memberTone(cx: number, cz: number, seed: number): number {
	return 0.9 + 0.1 * woodHash(Math.round(cx * 50), Math.round(cz * 50), 7, seed);
}

function appendPrototype(
	acc: Accumulator,
	proto: BarrierPrototype,
	x: number,
	z: number,
	yaw: number,
	baseY: number,
	height: number,
	clampToHeight: boolean,
	halfThin: number,
	options: BarrierCompileOptions
): void {
	const c = Math.cos(yaw);
	const s = Math.sin(yaw);
	const centerY = baseY + Math.max(height, 0.01) / 2;
	const frame: WoodPieceFrame = {
		center: [x, centerY, z],
		grain: [0, 1, 0],
		wide: [c, 0, -s],
		thin: [s, 0, c],
		halfThin
	};
	const log = memberLog(x, centerY, z, halfThin, options.seed);
	const tone = memberTone(x + baseY, z, options.seed);
	const first = acc.vertexCount;
	for (let i = 0; i < proto.vertexCount; i++) {
		const lx = proto.xz[i * 2];
		const lz = proto.xz[i * 2 + 1];
		let ly = proto.yA[i] * height + proto.yB[i];
		if (clampToHeight) ly = Math.min(height, Math.max(0, ly));
		const nx = proto.normals[i * 3];
		const ny = proto.normals[i * 3 + 1];
		const nz = proto.normals[i * 3 + 2];
		acc.push(
			x + lx * c + lz * s,
			baseY + ly,
			z - lx * s + lz * c,
			nx * c + nz * s,
			ny,
			-nx * s + nz * c,
			tone,
			frame,
			log,
			options.origin
		);
	}
	for (const index of proto.indices) acc.indices.push(first + index);
}

/** The rail's cross-section as (across, down-from-top) points, convex, in drawing order. */
export function railSection(
	profile: BarrierRailProfile,
	width: number,
	height: number,
	lod: BarrierLod
): [number, number][] {
	const w = width / 2;
	if (lod === 2 || profile === 'rectangular' || profile === 'flat') {
		return [
			[-w, 0],
			[w, 0],
			[w, -height],
			[-w, -height]
		];
	}
	if (profile === 'chamfered') {
		const c = Math.min(width, height) * 0.24;
		return [
			[-w + c, 0],
			[w - c, 0],
			[w, -c],
			[w, -height],
			[-w, -height],
			[-w, -c]
		];
	}
	// Rounded: a half-ellipse over a square-sided lower part.
	const steps = lod === 0 ? 6 : 3;
	const shoulder = height * 0.5;
	const out: [number, number][] = [];
	for (let i = 0; i <= steps; i++) {
		const a = Math.PI - (i / steps) * Math.PI;
		out.push([Math.cos(a) * w, -shoulder + Math.sin(a) * shoulder]);
	}
	out.push([w, -height], [-w, -height]);
	return out;
}

function appendRail(
	acc: Accumulator,
	rail: BarrierRailMember,
	lod: BarrierLod,
	options: BarrierCompileOptions
): void {
	const section = railSection(rail.profile, rail.width, rail.height, lod);
	const dirX = rail.dirX;
	const dirZ = rail.dirZ;
	const yAt = (px: number, pz: number) =>
		rail.yA + rail.slope * ((px - rail.ax) * dirX + (pz - rail.az) * dirZ);
	const corner = (end: 0 | 1, t: number, v: number): Vec3 => {
		const cut = end === 0 ? rail.startCut : rail.endCut;
		const px = (end === 0 ? rail.ax : rail.bx) + cut.x * t;
		const pz = (end === 0 ? rail.az : rail.bz) + cut.z * t;
		return [px, yAt(px, pz) + v, pz];
	};
	const length = Math.hypot(rail.bx - rail.ax, rail.bz - rail.az);
	const grain = normalize([dirX, rail.slope, dirZ]);
	const across: Vec3 = [-dirZ, 0, dirX];
	const up = normalize(cross(across, grain));
	const wideIsAcross = rail.width >= rail.height;
	const mid: Vec3 = [
		(rail.ax + rail.bx) / 2,
		yAt((rail.ax + rail.bx) / 2, (rail.az + rail.bz) / 2) - rail.height / 2,
		(rail.az + rail.bz) / 2
	];
	const halfThin = Math.min(rail.width, rail.height) / 2;
	const frame: WoodPieceFrame = {
		center: mid,
		grain,
		wide: wideIsAcross ? across : up,
		thin: wideIsAcross ? up : across,
		halfThin
	};
	const log = memberLog(mid[0], mid[1], mid[2], halfThin, options.seed);
	const tone = memberTone(mid[0], mid[2] + length, options.seed);

	// Section centre, for orienting faces outwards.
	let ct = 0;
	let cv = 0;
	for (const [t, v] of section) {
		ct += t;
		cv += v;
	}
	ct /= section.length;
	cv /= section.length;

	const m = section.length;
	for (let i = 0; i < m; i++) {
		const [t0, v0] = section[i];
		const [t1, v1] = section[(i + 1) % m];
		const quad = [corner(0, t0, v0), corner(0, t1, v1), corner(1, t1, v1), corner(1, t0, v0)];
		const outT = (t0 + t1) / 2 - ct;
		const outV = (v0 + v1) / 2 - cv;
		const outward: Vec3 = [across[0] * outT, outV, across[2] * outT];
		appendQuad(acc, quad, outward, tone, frame, log, options);
	}
	// End caps.
	for (const end of [0, 1] as const) {
		const poly = section.map(([t, v]) => corner(end, t, v));
		const outward: Vec3 = end === 0 ? [-dirX, 0, -dirZ] : [dirX, 0, dirZ];
		appendPolygon(acc, poly, outward, tone, frame, log, options);
	}
}

function appendJoint(
	acc: Accumulator,
	joint: BarrierRailJointMember,
	options: BarrierCompileOptions
): void {
	const top = joint.topY;
	const bottom = joint.topY - joint.height;
	let cx = 0;
	let cz = 0;
	for (const p of joint.polygon) {
		cx += p.x;
		cz += p.z;
	}
	cx /= joint.polygon.length;
	cz /= joint.polygon.length;
	const halfThin = joint.height / 2;
	const frame: WoodPieceFrame = {
		center: [cx, (top + bottom) / 2, cz],
		grain: [1, 0, 0],
		wide: [0, 0, 1],
		thin: [0, 1, 0],
		halfThin
	};
	const log = memberLog(cx, top, cz, halfThin, options.seed);
	const tone = memberTone(cx, cz, options.seed);
	const n = joint.polygon.length;
	for (let i = 0; i < n; i++) {
		const a = joint.polygon[i];
		const b = joint.polygon[(i + 1) % n];
		const quad: Vec3[] = [
			[a.x, bottom, a.z],
			[b.x, bottom, b.z],
			[b.x, top, b.z],
			[a.x, top, a.z]
		];
		appendQuad(
			acc,
			quad,
			[(a.x + b.x) / 2 - cx, 0, (a.z + b.z) / 2 - cz],
			tone,
			frame,
			log,
			options
		);
	}
	appendPolygon(
		acc,
		joint.polygon.map((p) => [p.x, top, p.z] as Vec3),
		[0, 1, 0],
		tone,
		frame,
		log,
		options
	);
	appendPolygon(
		acc,
		joint.polygon.map((p) => [p.x, bottom, p.z] as Vec3),
		[0, -1, 0],
		tone,
		frame,
		log,
		options
	);
}

function appendQuad(
	acc: Accumulator,
	quad: Vec3[],
	outward: Vec3,
	tone: number,
	frame: WoodPieceFrame,
	log: ReturnType<typeof woodLogFor>,
	options: BarrierCompileOptions
): void {
	let normal = cross(sub(quad[1], quad[0]), sub(quad[2], quad[0]));
	if (length3(normal) < 1e-12) normal = cross(sub(quad[2], quad[0]), sub(quad[3], quad[0]));
	const flip = dot(normal, outward) < 0;
	const n = normalize(flip ? scale(normal, -1) : normal);
	const first = acc.vertexCount;
	for (const p of quad)
		acc.push(p[0], p[1], p[2], n[0], n[1], n[2], tone, frame, log, options.origin);
	if (flip) acc.indices.push(first, first + 2, first + 1, first, first + 3, first + 2);
	else acc.indices.push(first, first + 1, first + 2, first, first + 2, first + 3);
}

function appendPolygon(
	acc: Accumulator,
	poly: Vec3[],
	outward: Vec3,
	tone: number,
	frame: WoodPieceFrame,
	log: ReturnType<typeof woodLogFor>,
	options: BarrierCompileOptions
): void {
	if (poly.length < 3) return;
	let normal: Vec3 = [0, 0, 0];
	for (let i = 1; i < poly.length - 1; i++) {
		const c = cross(sub(poly[i], poly[0]), sub(poly[i + 1], poly[0]));
		normal = [normal[0] + c[0], normal[1] + c[1], normal[2] + c[2]];
	}
	const flip = dot(normal, outward) < 0;
	const n = normalize(flip ? scale(normal, -1) : normal);
	const first = acc.vertexCount;
	for (const p of poly)
		acc.push(p[0], p[1], p[2], n[0], n[1], n[2], tone, frame, log, options.origin);
	for (let i = 1; i < poly.length - 1; i++) {
		if (flip) acc.indices.push(first, first + i + 1, first + i);
		else acc.indices.push(first, first + i, first + i + 1);
	}
}

/**
 * Compiles one LOD of a laid-out barrier. `style` must be the same (sanitized) style the layout was
 * made from.
 */
export function compileBarrierLevel(
	layout: BarrierLayout,
	style: BarrierStyleDefinition,
	options: BarrierCompileOptions
): CompiledBarrierLevel {
	const lod = options.lod;
	const main = new Accumulator();
	const accent = style.accentWood && style.accentWood !== style.wood ? new Accumulator() : main;

	for (const post of layout.posts) {
		const w = post.style.width;
		const proto = cachedPrototype(`post|${post.style.profile}|${q(w)}|${lod}`, () =>
			buildPostPrototype(post.style.profile, w, lod)
		);
		appendPrototype(
			main,
			proto,
			post.x,
			post.z,
			post.yaw,
			post.baseY,
			post.topY - post.baseY,
			true,
			w / 2,
			options
		);
		if (post.cap) {
			const cap = post.cap;
			const capProto = cachedPrototype(`cap|${cap}|${q(w)}|${lod}`, () =>
				buildCapPrototype(cap, w, lod)
			);
			appendPrototype(
				accent,
				capProto,
				post.x,
				post.z,
				post.yaw,
				post.topY,
				0,
				false,
				w / 2,
				options
			);
		}
	}

	if (lod < 2 && style.baluster.style !== 'none') {
		const b = style.baluster;
		const balusterStyle = b.style as Exclude<typeof b.style, 'none'>;
		const proto = cachedPrototype(`baluster|${b.style}|${q(b.width)}|${q(b.depth)}|${lod}`, () =>
			buildBalusterPrototype(balusterStyle, b.width, b.depth, lod)
		);
		const halfThin = Math.min(b.width, b.depth) / 2;
		for (const baluster of layout.balusters) {
			appendPrototype(
				main,
				proto,
				baluster.x,
				baluster.z,
				baluster.yaw,
				baluster.baseY,
				baluster.topY - baluster.baseY,
				true,
				halfThin,
				options
			);
		}
	}

	for (const rail of layout.rails) appendRail(main, rail, lod, options);
	for (const joint of layout.joints) appendJoint(main, joint, options);

	const mainGeometry = main.toGeometry();
	const accentGeometry = accent === main ? null : accent.toGeometry();
	let vertices = 0;
	let triangles = 0;
	let bytes = 0;
	for (const geometry of [mainGeometry, accentGeometry]) {
		if (!geometry) continue;
		vertices += geometry.attributes.position.count;
		triangles += (geometry.index?.count ?? 0) / 3;
		for (const attribute of Object.values(geometry.attributes))
			bytes += (attribute as THREE.BufferAttribute).array.byteLength;
		bytes += geometry.index?.array.byteLength ?? 0;
	}
	return { main: mainGeometry, accent: accentGeometry, vertices, triangles, bytes };
}

function sub(a: Vec3, b: Vec3): Vec3 {
	return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
function cross(a: Vec3, b: Vec3): Vec3 {
	return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function dot(a: Vec3, b: Vec3): number {
	return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
function scale(a: Vec3, s: number): Vec3 {
	return [a[0] * s, a[1] * s, a[2] * s];
}
function length3(a: Vec3): number {
	return Math.hypot(a[0], a[1], a[2]);
}
function normalize(a: Vec3): Vec3 {
	const len = length3(a);
	return len > 1e-12 ? [a[0] / len, a[1] / len, a[2] / len] : [0, 1, 0];
}
