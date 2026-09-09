import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { furnitureBasis } from './furnitureMath';
import type { FurnitureConstruction, FurnitureMaterialSlot, FurniturePrimitive } from './furnitureConstruction';
import { buildFurnitureConstruction } from './furnitureConstruction';
import { resolveFurnitureBuildInput } from './furnitureCatalogue';
import type { FurnitureDefinition } from './FurnitureTypes';
import { furnitureRotationYOf } from './FurnitureTypes';
import { snapFurnitureRotation } from './furniturePlacementMath';

export type FurnitureSlotGeometries = Partial<Record<FurnitureMaterialSlot, THREE.BufferGeometry>>;

function primitiveToGeometry(primitive: FurniturePrimitive): THREE.BufferGeometry {
	if (primitive.shape === 'box') {
		const geom = new THREE.BoxGeometry(primitive.sx, primitive.sy, primitive.sz);
		geom.translate(primitive.cx, primitive.cy, primitive.cz);
		return geom;
	}
	if (primitive.shape === 'cylinder') {
		const geom = new THREE.CylinderGeometry(
			primitive.radiusTop,
			primitive.radiusBottom,
			primitive.height,
			primitive.radialSegments
		);
		geom.translate(primitive.cx, primitive.cy, primitive.cz);
		return geom;
	}
	if (primitive.shape === 'sphere') {
		const geom = new THREE.SphereGeometry(primitive.radius, 8, 6);
		geom.scale(1, primitive.scaleY, 1);
		geom.translate(primitive.cx, primitive.cy, primitive.cz);
		return geom;
	}
	if (primitive.shape === 'torus') {
		const geom = new THREE.TorusGeometry(primitive.radius, primitive.tube, 6, 10);
		if (primitive.rotateX) geom.rotateX(primitive.rotateX);
		geom.translate(primitive.cx, primitive.cy, primitive.cz);
		return geom;
	}
	const points = primitive.points.map((point) => new THREE.Vector2(point.x, point.y));
	const geom = new THREE.LatheGeometry(points, primitive.segments);
	geom.translate(primitive.cx, primitive.cy, primitive.cz);
	return geom;
}

export function createFurnitureSlotGeometries(
	construction: FurnitureConstruction
): FurnitureSlotGeometries {
	const buckets: Record<FurnitureMaterialSlot, THREE.BufferGeometry[]> = {
		primary: [],
		secondary: [],
		accent: [],
		emissive: []
	};
	for (const primitive of construction.primitives) {
		buckets[primitive.material].push(primitiveToGeometry(primitive));
	}
	const result: FurnitureSlotGeometries = {};
	for (const slot of Object.keys(buckets) as FurnitureMaterialSlot[]) {
		const parts = buckets[slot];
		if (parts.length === 0) continue;
		const merged = mergeGeometries(parts, false);
		for (const part of parts) part.dispose();
		if (merged) result[slot] = merged;
	}
	return result;
}

export function disposeSlotGeometries(slots: FurnitureSlotGeometries): void {
	for (const geom of Object.values(slots)) geom?.dispose();
}

export function constructionForItem(item: FurnitureDefinition): FurnitureConstruction {
	return buildFurnitureConstruction(
		resolveFurnitureBuildInput({
			kind: item.kind,
			dimensions: item.dimensions,
			parameters: item.parameters
		})
	);
}

const _basisX = new THREE.Vector3();
const _basisY = new THREE.Vector3();
const _basisZ = new THREE.Vector3();

/** Torch / wall-mounted items: local +Y along the handle, origin at the mount. */
export function composeFurnitureMatrix(
	item: FurnitureDefinition,
	target: THREE.Matrix4
): THREE.Matrix4 {
	if (item.kind !== 'torch') {
		target.makeRotationY(snapFurnitureRotation(furnitureRotationYOf(item)));
		target.setPosition(item.x, item.y, item.z);
		return target;
	}
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

export function createTorchBodyGeometry(): THREE.BufferGeometry {
	const slots = createFurnitureSlotGeometries(
		buildFurnitureConstruction(
			resolveFurnitureBuildInput({ kind: 'torch', dimensions: { width: 0.12, depth: 0.12, height: 0.5 } })
		)
	);
	const body = slots.primary;
	slots.secondary?.dispose();
	slots.accent?.dispose();
	slots.emissive?.dispose();
	return body ?? new THREE.CylinderGeometry(0.03, 0.03, 0.42, 8).translate(0, 0.21, 0);
}

export function createTorchFlameGeometry(): THREE.BufferGeometry {
	const slots = createFurnitureSlotGeometries(
		buildFurnitureConstruction(
			resolveFurnitureBuildInput({ kind: 'torch', dimensions: { width: 0.12, depth: 0.12, height: 0.5 } })
		)
	);
	slots.primary?.dispose();
	slots.secondary?.dispose();
	slots.accent?.dispose();
	return slots.emissive ?? new THREE.SphereGeometry(0.055, 8, 6).translate(0, 0.5, 0);
}

export interface FurnitureVisualMaterials {
	primary: THREE.Material;
	secondary: THREE.Material;
	accent: THREE.Material;
	emissive: THREE.Material;
}

export function createFurnitureGroup(
	item: FurnitureDefinition,
	materials: FurnitureVisualMaterials,
	options?: { opacity?: number }
): THREE.Group {
	const group = new THREE.Group();
	group.name = `furniture-${item.kind}`;
	group.userData.furnitureId = item.id;
	group.userData.furnitureKind = item.kind;
	const slots = createFurnitureSlotGeometries(constructionForItem(item));
	const opacity = options?.opacity;
	const add = (geom: THREE.BufferGeometry | undefined, material: THREE.Material, name: string) => {
		if (!geom) return;
		const meshMaterial =
			opacity !== undefined && opacity < 1 ? cloneTransparent(material, opacity) : material;
		const mesh = new THREE.Mesh(geom, meshMaterial);
		mesh.name = name;
		mesh.castShadow = name !== 'emissive';
		mesh.receiveShadow = name !== 'emissive';
		mesh.userData.furnitureId = item.id;
		mesh.userData.furnitureKind = item.kind;
		mesh.matrixAutoUpdate = false;
		mesh.updateMatrix();
		group.add(mesh);
	};
	add(slots.primary, materials.primary, 'primary');
	add(slots.secondary, materials.secondary, 'secondary');
	add(slots.accent, materials.accent, 'accent');
	add(slots.emissive, materials.emissive, 'emissive');
	group.matrixAutoUpdate = false;
	composeFurnitureMatrix(item, group.matrix);
	group.updateMatrixWorld(true);
	return group;
}

function cloneTransparent(material: THREE.Material, opacity: number): THREE.Material {
	const clone = material.clone();
	clone.transparent = true;
	clone.opacity = opacity;
	clone.depthWrite = false;
	return clone;
}

export function disposeFurnitureGroup(group: THREE.Group, disposeMaterials: boolean): void {
	for (const child of [...group.children]) {
		if (child instanceof THREE.Mesh) {
			child.geometry.dispose();
			if (disposeMaterials) {
				const material = child.material;
				if (Array.isArray(material)) material.forEach((entry) => entry.dispose());
				else material.dispose();
			}
		}
		child.removeFromParent();
	}
	group.removeFromParent();
}
