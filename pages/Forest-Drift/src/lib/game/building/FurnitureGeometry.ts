import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { furnitureBasis } from './furnitureMath';
import type { FurnitureDefinition } from './FurnitureTypes';

/** Shared torch body (handle + cup). Origin at the mount, +Y toward the flame. */
export function createTorchBodyGeometry(): THREE.BufferGeometry {
	const handle = new THREE.CylinderGeometry(0.028, 0.034, 0.4, 8);
	handle.translate(0, 0.2, 0);
	const cup = new THREE.CylinderGeometry(0.055, 0.04, 0.07, 8);
	cup.translate(0, 0.42, 0);
	const wrapped = new THREE.TorusGeometry(0.05, 0.012, 6, 10);
	wrapped.rotateX(Math.PI / 2);
	wrapped.translate(0, 0.36, 0);
	const merged = mergeGeometries([handle, cup, wrapped], false);
	handle.dispose();
	cup.dispose();
	wrapped.dispose();
	return merged ?? new THREE.CylinderGeometry(0.03, 0.03, 0.42, 8).translate(0, 0.21, 0);
}

export function createTorchFlameGeometry(): THREE.BufferGeometry {
	const flame = new THREE.SphereGeometry(0.055, 8, 6);
	flame.translate(0, 0.5, 0);
	flame.scale(0.75, 1.15, 0.75);
	return flame;
}

const _basisX = new THREE.Vector3();
const _basisY = new THREE.Vector3();
const _basisZ = new THREE.Vector3();

export function composeFurnitureMatrix(
	item: FurnitureDefinition,
	target: THREE.Matrix4
): THREE.Matrix4 {
	const basis = furnitureBasis({ x: item.nx, y: item.ny, z: item.nz });
	if (!basis) {
		target.makeTranslation(item.x, item.y, item.z);
		return target;
	}
	_basisX.set(basis.x.x, basis.x.y, basis.x.z);
	_basisY.set(basis.y.x, basis.y.y, basis.y.z);
	_basisZ.set(basis.z.x, basis.z.y, basis.z.z);
	target.makeBasis(_basisX, _basisY, _basisZ);
	target.setPosition(item.x, item.y, item.z);
	return target;
}
