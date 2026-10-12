import * as THREE from 'three';
import { woodHash, woodLogFor, writeWoodCoord, type WoodPieceFrame } from '../materials/woodCoords';
import type { FloorDetailBox, FloorDetailStrip, FloorDetailStripPoint } from './FloorDetailTypes';

/** Draw groups: 0 = flat vertex colour, 1 = solid wood, 2 = path-centre stone. */
export const FLOOR_DETAIL_FLAT_GROUP = 0;
export const FLOOR_DETAIL_WOOD_GROUP = 1;
export const FLOOR_DETAIL_STONE_GROUP = 2;

/**
 * The log-space frame of a wood box, in its own centred, un-yawed frame (`BoxGeometry`'s): grain
 * along the requested axis, `thin` across the smaller of the other two sides.
 */
function woodBoxFrame(box: FloorDetailBox, sx: number, sy: number, sz: number): WoodPieceFrame {
	const alongX = box.wood?.grain === 'x';
	const otherHorizontal = alongX ? sz : sx;
	const thinIsY = sy <= otherHorizontal;
	const horizontalAxis: [number, number, number] = alongX ? [0, 0, 1] : [1, 0, 0];
	return {
		center: [0, 0, 0],
		grain: alongX ? [1, 0, 0] : [0, 0, 1],
		wide: thinIsY ? horizontalAxis : [0, 1, 0],
		thin: thinIsY ? [0, 1, 0] : horizontalAxis,
		halfThin: (thinIsY ? sy : otherHorizontal) / 2
	};
}

/**
 * Merges coloured boxes (optionally yawed around their centre) into one BufferGeometry with
 * vertex colours — no textures. Empty input yields an empty geometry the caller can still assign.
 *
 * Flat boxes are emitted first, then wood, then path stone. Wood goes into
 * `FLOOR_DETAIL_WOOD_GROUP` with a `woodCoord` attribute (see `materials/woodCoords.ts`). Stone
 * goes into `FLOOR_DETAIL_STONE_GROUP` with UVs in foundation-local metres (X, Z) so the
 * stone texture continues along the path. Path strips are ribbons: equal points on both edges,
 * joined station by station. With a single material the groups are ignored and everything renders
 * flat (placement previews).
 */
export function buildFloorDetailGeometry(
	boxes: readonly FloorDetailBox[],
	strips: readonly FloorDetailStrip[] = []
): THREE.BufferGeometry {
	const positions: number[] = [];
	const normals: number[] = [];
	const colors: number[] = [];
	const uvs: number[] = [];
	const woodCoords: number[] = [];
	const indices: number[] = [];
	let base = 0;
	const indexCounts = { flat: 0, wood: 0, stone: 0 };
	let anyWood = false;
	let anyStone = false;
	const woodScratch = new Float32Array(3);
	const point: [number, number, number] = [0, 0, 0];

	const ordered = [
		...boxes.filter((box) => !box.wood && !box.stone),
		...boxes.filter((box) => box.wood),
		...boxes.filter((box) => box.stone && !box.wood)
	];
	for (const box of ordered) {
		const sx = box.maxX - box.minX;
		const sy = box.maxY - box.minY;
		const sz = box.maxZ - box.minZ;
		if (sx <= 1e-8 || sy <= 1e-8 || sz <= 1e-8) continue;

		const geom = new THREE.BoxGeometry(sx, sy, sz);
		const local = geom.getAttribute('position');
		if (box.wood) {
			anyWood = true;
			const frame = woodBoxFrame(box, sx, sy, sz);
			const seed = box.wood.seed;
			const log = woodLogFor(
				frame.halfThin,
				woodHash(1, 2, 3, seed),
				woodHash(4, 5, 6, seed),
				woodHash(7, 8, 9, seed)
			);
			// Laid end to end along the log: this box's near end sits `along` metres in.
			log.z += (box.wood.along ?? 0) + (box.wood.grain === 'x' ? sx : sz) / 2;
			for (let i = 0; i < local.count; i++) {
				point[0] = local.getX(i);
				point[1] = local.getY(i);
				point[2] = local.getZ(i);
				writeWoodCoord(woodScratch, 0, point, frame, log);
				woodCoords.push(woodScratch[0], woodScratch[1], woodScratch[2]);
			}
		} else {
			for (let i = 0; i < local.count; i++) woodCoords.push(0, 0, 0);
		}
		if (box.yaw) geom.rotateY(box.yaw);
		geom.translate((box.minX + box.maxX) / 2, (box.minY + box.maxY) / 2, (box.minZ + box.maxZ) / 2);

		const pos = geom.getAttribute('position');
		const nor = geom.getAttribute('normal');
		// White leaves the path centre as the dark-grey stone material.
		const color = box.stone ? new THREE.Color(1, 1, 1) : new THREE.Color(box.color);
		for (let i = 0; i < pos.count; i++) {
			positions.push(pos.getX(i), pos.getY(i), pos.getZ(i));
			normals.push(nor.getX(i), nor.getY(i), nor.getZ(i));
			colors.push(color.r, color.g, color.b);
			// Metres in the foundation frame. Vertical faces share the top edge's XZ, which is fine
			// on a slab only a few centimetres thick.
			uvs.push(box.stone ? pos.getX(i) : 0, box.stone ? pos.getZ(i) : 0);
		}
		const idx = geom.getIndex();
		const indexCount = idx ? idx.count : 0;
		if (idx) {
			for (let i = 0; i < idx.count; i++) indices.push(idx.getX(i) + base);
		}
		if (box.wood) indexCounts.wood += indexCount;
		else if (box.stone) {
			anyStone = true;
			indexCounts.stone += indexCount;
		} else indexCounts.flat += indexCount;
		base += pos.count;
		geom.dispose();
	}

	for (const strip of strips) {
		if (strip.role !== 'wood') continue;
		const added = appendStrip(strip, positions, normals, colors, uvs, woodCoords, indices, base);
		if (added.vertices > 0) anyWood = true;
		indexCounts.wood += added.indices;
		base += added.vertices;
	}
	for (const strip of strips) {
		if (strip.role !== 'stone') continue;
		const added = appendStrip(strip, positions, normals, colors, uvs, woodCoords, indices, base);
		if (added.vertices > 0) anyStone = true;
		indexCounts.stone += added.indices;
		base += added.vertices;
	}

	const geometry = new THREE.BufferGeometry();
	if (positions.length === 0) return geometry;
	geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
	geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
	geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
	geometry.setIndex(indices);
	if (anyWood) {
		geometry.setAttribute('woodCoord', new THREE.Float32BufferAttribute(woodCoords, 3));
	}
	if (anyStone) {
		geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
	}
	geometry.addGroup(0, indexCounts.flat, FLOOR_DETAIL_FLAT_GROUP);
	geometry.addGroup(indexCounts.flat, indexCounts.wood, FLOOR_DETAIL_WOOD_GROUP);
	if (indexCounts.stone > 0) {
		geometry.addGroup(
			indexCounts.flat + indexCounts.wood,
			indexCounts.stone,
			FLOOR_DETAIL_STONE_GROUP
		);
	}
	return geometry;
}

function edgeTangent(
	a: FloorDetailStripPoint,
	b: FloorDetailStripPoint
): { x: number; z: number } | null {
	const dx = b.x - a.x;
	const dz = b.z - a.z;
	const length = Math.hypot(dx, dz);
	if (length < 1e-8) return null;
	return { x: dx / length, z: dz / length };
}

interface RibbonVertex {
	x: number;
	y: number;
	z: number;
	u: number;
	v: number;
	cr: number;
	cg: number;
	cb: number;
	wx: number;
	wy: number;
	wz: number;
}

/**
 * Extrudes one path ribbon (top, bottom, both long sides, both ends). Stations share edges, so the
 * strip does not overlap itself and does not leave a crack between segments.
 */
function appendStrip(
	strip: FloorDetailStrip,
	positions: number[],
	normals: number[],
	colors: number[],
	uvs: number[],
	woodCoords: number[],
	indices: number[],
	base: number
): { indices: number; vertices: number } {
	const count = Math.min(strip.left.length, strip.right.length, strip.along.length);
	if (count < 2) return { indices: 0, vertices: 0 };

	const stone = strip.role === 'stone';
	const color = stone ? new THREE.Color(1, 1, 1) : new THREE.Color(strip.color);
	const halfThick = (strip.maxY - strip.minY) / 2;
	const midY = (strip.minY + strip.maxY) / 2;
	const span = Math.hypot(strip.right[0].x - strip.left[0].x, strip.right[0].z - strip.left[0].z);
	const halfWide = Math.max(span / 2, 1e-4);
	const thinIsY = halfThick <= halfWide;
	const seed = strip.woodSeed;
	const log =
		seed === undefined
			? null
			: woodLogFor(
					thinIsY ? halfThick : halfWide,
					woodHash(1, 2, 3, seed),
					woodHash(4, 5, 6, seed),
					woodHash(7, 8, 9, seed)
				);

	let indexCount = 0;
	let vertexCount = 0;
	const pushVertex = (vertex: RibbonVertex, nx: number, ny: number, nz: number) => {
		const id = base + vertexCount;
		vertexCount += 1;
		positions.push(vertex.x, vertex.y, vertex.z);
		normals.push(nx, ny, nz);
		colors.push(vertex.cr, vertex.cg, vertex.cb);
		uvs.push(vertex.u, vertex.v);
		woodCoords.push(vertex.wx, vertex.wy, vertex.wz);
		return id;
	};
	const corner = (side: 'left' | 'right', index: number, y: number): RibbonVertex => {
		const point = side === 'left' ? strip.left[index] : strip.right[index];
		const midX = (strip.left[index].x + strip.right[index].x) / 2;
		const midZ = (strip.left[index].z + strip.right[index].z) / 2;
		const across = (side === 'left' ? -1 : 1) * Math.hypot(point.x - midX, point.z - midZ);
		const up = y - midY;
		const along = strip.along[index] ?? 0;
		const wide = thinIsY ? across : up;
		const thin = thinIsY ? up : across;
		return {
			x: point.x,
			y,
			z: point.z,
			u: stone ? point.x : 0,
			v: stone ? point.z : 0,
			cr: color.r,
			cg: color.g,
			cb: color.b,
			wx: log ? wide - log.x : 0,
			wy: log ? thin - log.y : 0,
			wz: log ? along + log.z : 0
		};
	};
	const quad = (
		a: RibbonVertex,
		b: RibbonVertex,
		c: RibbonVertex,
		d: RibbonVertex,
		ox: number,
		oy: number,
		oz: number
	) => {
		const abx = b.x - a.x;
		const aby = b.y - a.y;
		const abz = b.z - a.z;
		const acx = c.x - a.x;
		const acy = c.y - a.y;
		const acz = c.z - a.z;
		const nx = aby * acz - abz * acy;
		const ny = abz * acx - abx * acz;
		const nz = abx * acy - aby * acx;
		if (nx * nx + ny * ny + nz * nz < 1e-16) return;
		const flip = nx * ox + ny * oy + nz * oz < 0;
		const ia = pushVertex(a, ox, oy, oz);
		const ib = pushVertex(b, ox, oy, oz);
		const ic = pushVertex(c, ox, oy, oz);
		const id = pushVertex(d, ox, oy, oz);
		if (flip) indices.push(ia, ic, ib, ia, id, ic);
		else indices.push(ia, ib, ic, ia, ic, id);
		indexCount += 6;
	};

	for (let i = 0; i < count - 1; i++) {
		quad(
			corner('left', i, strip.maxY),
			corner('left', i + 1, strip.maxY),
			corner('right', i + 1, strip.maxY),
			corner('right', i, strip.maxY),
			0,
			1,
			0
		);
		quad(
			corner('left', i, strip.minY),
			corner('right', i, strip.minY),
			corner('right', i + 1, strip.minY),
			corner('left', i + 1, strip.minY),
			0,
			-1,
			0
		);
		const leftEdge = edgeTangent(strip.left[i], strip.left[i + 1]);
		if (leftEdge) {
			quad(
				corner('left', i, strip.minY),
				corner('left', i + 1, strip.minY),
				corner('left', i + 1, strip.maxY),
				corner('left', i, strip.maxY),
				-leftEdge.z,
				0,
				leftEdge.x
			);
		}
		const rightEdge = edgeTangent(strip.right[i], strip.right[i + 1]);
		if (rightEdge) {
			quad(
				corner('right', i, strip.minY),
				corner('right', i, strip.maxY),
				corner('right', i + 1, strip.maxY),
				corner('right', i + 1, strip.minY),
				rightEdge.z,
				0,
				-rightEdge.x
			);
		}
	}

	const start = edgeTangent(
		{
			x: (strip.left[0].x + strip.right[0].x) / 2,
			z: (strip.left[0].z + strip.right[0].z) / 2
		},
		{
			x: (strip.left[1].x + strip.right[1].x) / 2,
			z: (strip.left[1].z + strip.right[1].z) / 2
		}
	);
	if (start) {
		quad(
			corner('left', 0, strip.minY),
			corner('right', 0, strip.minY),
			corner('right', 0, strip.maxY),
			corner('left', 0, strip.maxY),
			-start.x,
			0,
			-start.z
		);
	}
	const last = count - 1;
	const end = edgeTangent(
		{
			x: (strip.left[last - 1].x + strip.right[last - 1].x) / 2,
			z: (strip.left[last - 1].z + strip.right[last - 1].z) / 2
		},
		{
			x: (strip.left[last].x + strip.right[last].x) / 2,
			z: (strip.left[last].z + strip.right[last].z) / 2
		}
	);
	if (end) {
		quad(
			corner('left', last, strip.minY),
			corner('left', last, strip.maxY),
			corner('right', last, strip.maxY),
			corner('right', last, strip.minY),
			end.x,
			0,
			end.z
		);
	}
	return { indices: indexCount, vertices: vertexCount };
}
