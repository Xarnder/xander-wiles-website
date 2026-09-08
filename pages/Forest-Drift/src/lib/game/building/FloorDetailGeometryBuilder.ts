import * as THREE from 'three';
import type { FloorDetailBox } from './FloorDetailTypes';

/**
 * Merges coloured boxes (optionally yawed around their centre) into one BufferGeometry with
 * vertex colours — no textures. Empty input yields an empty geometry the caller can still assign.
 */
export function buildFloorDetailGeometry(boxes: readonly FloorDetailBox[]): THREE.BufferGeometry {
	const positions: number[] = [];
	const normals: number[] = [];
	const colors: number[] = [];
	const indices: number[] = [];
	let base = 0;

	for (const box of boxes) {
		const sx = box.maxX - box.minX;
		const sy = box.maxY - box.minY;
		const sz = box.maxZ - box.minZ;
		if (sx <= 1e-8 || sy <= 1e-8 || sz <= 1e-8) continue;

		const geom = new THREE.BoxGeometry(sx, sy, sz);
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
		base += pos.count;
		geom.dispose();
	}

	const geometry = new THREE.BufferGeometry();
	if (positions.length === 0) return geometry;
	geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
	geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
	geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
	geometry.setIndex(indices);
	return geometry;
}
