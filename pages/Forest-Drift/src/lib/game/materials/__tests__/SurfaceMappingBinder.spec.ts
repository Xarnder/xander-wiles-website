import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
	deindexInPlace,
	SurfaceMappingBinder,
	subdivideLargeTriangles
} from '../SurfaceMappingBinder';

function area(geometry: THREE.BufferGeometry): number {
	const position = geometry.getAttribute('position');
	const a = new THREE.Vector3();
	const b = new THREE.Vector3();
	const c = new THREE.Vector3();
	let total = 0;
	for (let i = 0; i < position.count; i += 3) {
		a.fromBufferAttribute(position, i);
		b.fromBufferAttribute(position, i + 1);
		c.fromBufferAttribute(position, i + 2);
		total += new THREE.Triangle(a, b, c).getArea();
	}
	return total;
}

describe('SurfaceMappingBinder geometry helpers', () => {
	it('de-indexes in place, keeping draw groups valid', () => {
		const box = new THREE.BoxGeometry(2, 1, 3);
		const groups = box.groups.map((g) => ({ ...g }));
		const before = area(box.toNonIndexed());
		deindexInPlace(box);
		expect(box.index).toBeNull();
		expect(box.getAttribute('position').count).toBe(36);
		expect(box.groups).toEqual(groups);
		expect(area(box)).toBeCloseTo(before, 6);
	});

	it('subdivides large faces without changing their area, and re-bases groups', () => {
		const box = new THREE.BoxGeometry(12, 0.5, 8);
		deindexInPlace(box);
		const before = area(box);
		subdivideLargeTriangles(box, 1.6);
		expect(area(box)).toBeCloseTo(before, 3);
		const count = box.getAttribute('position').count;
		expect(count).toBeGreaterThan(36);
		let covered = 0;
		for (const group of box.groups) covered += group.count;
		expect(covered).toBe(count);
		// Every edge now fits the limit.
		const position = box.getAttribute('position');
		const a = new THREE.Vector3();
		const b = new THREE.Vector3();
		for (let i = 0; i < count; i += 3) {
			for (let k = 0; k < 3; k++) {
				a.fromBufferAttribute(position, i + k);
				b.fromBufferAttribute(position, i + ((k + 1) % 3));
				expect(a.distanceTo(b)).toBeLessThanOrEqual(1.6 * Math.SQRT2 + 1e-6);
			}
		}
	});
});

describe('SurfaceMappingBinder', () => {
	function setup() {
		const origin = new THREE.Vector3(10, 2, -4);
		const binder = new SurfaceMappingBinder({
			getFoundationOrigin: (id) => (id === 'f1' ? origin : null),
			getWorldSeed: () => 'seed'
		});
		const material = new THREE.MeshStandardMaterial();
		binder.watch(material, { mode: 'planar', weathering: true });
		const root = new THREE.Group();
		root.userData.foundationId = 'f1';
		root.position.copy(origin);
		return { binder, material, root };
	}

	it('maps watched meshes in foundation-local metres with colours', () => {
		const { binder, material, root } = setup();
		const mesh = new THREE.Mesh(new THREE.PlaneGeometry(4, 3), material);
		root.add(mesh);
		binder.mapNow(root);
		const uv = mesh.geometry.getAttribute('uv');
		const color = mesh.geometry.getAttribute('color');
		expect(color.count).toBe(uv.count);
		let minU = Infinity;
		let maxU = -Infinity;
		for (let i = 0; i < uv.count; i++) {
			minU = Math.min(minU, uv.getX(i));
			maxU = Math.max(maxU, uv.getX(i));
		}
		expect(maxU - minU).toBeCloseTo(4, 4);
	});

	it('gives the same texture placement however a building is moved in the world', () => {
		const first = setup();
		const meshA = new THREE.Mesh(new THREE.PlaneGeometry(4, 3), first.material);
		first.root.add(meshA);
		first.binder.mapNow(first.root);

		const second = setup();
		second.root.position.set(500, 30, 200); // same building, elsewhere in the world
		const binder = new SurfaceMappingBinder({
			getFoundationOrigin: () => second.root.position.clone(),
			getWorldSeed: () => 'seed'
		});
		binder.watch(second.material, { mode: 'planar', weathering: true });
		const meshB = new THREE.Mesh(new THREE.PlaneGeometry(4, 3), second.material);
		second.root.add(meshB);
		binder.mapNow(second.root);

		expect(Array.from(meshB.geometry.getAttribute('uv').array)).toEqual(
			Array.from(meshA.geometry.getAttribute('uv').array)
		);
	});

	it('queues from onBeforeRender and maps on flush, once', () => {
		const { binder, material, root } = setup();
		const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
		root.add(mesh);
		root.updateWorldMatrix(true, true);
		const render = () =>
			material.onBeforeRender(
				null as never,
				null as never,
				null as never,
				mesh.geometry,
				mesh,
				null as never
			);
		render();
		expect(binder.flush()).toBe(1);
		render();
		expect(binder.flush()).toBe(0);
		expect(mesh.geometry.getAttribute('uv')).toBeDefined();
	});

	it('ignores meshes whose materials are not procedural', () => {
		const { binder, root } = setup();
		const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial());
		const before = mesh.geometry.getAttribute('uv');
		root.add(mesh);
		binder.mapNow(root);
		expect(mesh.geometry.getAttribute('uv')).toBe(before);
		expect(mesh.geometry.getAttribute('color')).toBeUndefined();
	});
});
