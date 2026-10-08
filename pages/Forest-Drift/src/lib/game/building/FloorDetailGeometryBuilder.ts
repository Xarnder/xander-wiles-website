import * as THREE from 'three';
import { woodHash, woodLogFor, writeWoodCoord, type WoodPieceFrame } from '../materials/woodCoords';
import type { FloorDetailBox } from './FloorDetailTypes';

/** Draw groups of a floor-detail geometry: material index 0 = flat vertex colour, 1 = solid wood. */
export const FLOOR_DETAIL_FLAT_GROUP = 0;
export const FLOOR_DETAIL_WOOD_GROUP = 1;

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
 * Boxes marked `wood` are emitted after the others, into draw group `FLOOR_DETAIL_WOOD_GROUP`, with
 * a `woodCoord` attribute (see `materials/woodCoords.ts`) for the solid wood shader; with a single
 * material the groups are ignored and everything renders flat (placement previews).
 */
export function buildFloorDetailGeometry(boxes: readonly FloorDetailBox[]): THREE.BufferGeometry {
	const positions: number[] = [];
	const normals: number[] = [];
	const colors: number[] = [];
	const woodCoords: number[] = [];
	const indices: number[] = [];
	let base = 0;
	let flatIndexCount = 0;
	const woodScratch = new Float32Array(3);
	const point: [number, number, number] = [0, 0, 0];

	const ordered = [...boxes.filter((box) => !box.wood), ...boxes.filter((box) => box.wood)];
	for (const box of ordered) {
		const sx = box.maxX - box.minX;
		const sy = box.maxY - box.minY;
		const sz = box.maxZ - box.minZ;
		if (sx <= 1e-8 || sy <= 1e-8 || sz <= 1e-8) continue;

		const geom = new THREE.BoxGeometry(sx, sy, sz);
		const local = geom.getAttribute('position');
		if (box.wood) {
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
		const color = new THREE.Color(box.color);
		for (let i = 0; i < pos.count; i++) {
			positions.push(pos.getX(i), pos.getY(i), pos.getZ(i));
			normals.push(nor.getX(i), nor.getY(i), nor.getZ(i));
			colors.push(color.r, color.g, color.b);
		}
		const idx = geom.getIndex();
		if (idx) {
			for (let i = 0; i < idx.count; i++) indices.push(idx.getX(i) + base);
		}
		if (!box.wood) flatIndexCount = indices.length;
		base += pos.count;
		geom.dispose();
	}

	const geometry = new THREE.BufferGeometry();
	if (positions.length === 0) return geometry;
	geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
	geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
	geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
	geometry.setIndex(indices);
	if (flatIndexCount < indices.length) {
		geometry.setAttribute('woodCoord', new THREE.Float32BufferAttribute(woodCoords, 3));
	}
	geometry.addGroup(0, flatIndexCount, FLOOR_DETAIL_FLAT_GROUP);
	geometry.addGroup(flatIndexCount, indices.length - flatIndexCount, FLOOR_DETAIL_WOOD_GROUP);
	return geometry;
}
