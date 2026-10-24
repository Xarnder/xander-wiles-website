import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { BuildingMaterialManager } from '../BuildingMaterialManager';
import { buildSlabOverhangFrame } from '../SlabOverhangFrameBuilder';
import { exposedSlabEdges } from '../slabOverhangFrameMath';
import { pointInPolygon2D } from '../slabMath';

const rectangle = [
	{ x: 0, z: 0 },
	{ x: 6, z: 0 },
	{ x: 6, z: 4 },
	{ x: 0, z: 4 }
];
const diagonal = [
	{ x: 0, z: 0 },
	{ x: 6, z: 0 },
	{ x: 4, z: 4 },
	{ x: 0, z: 4 }
];
const concave = [
	{ x: 0, z: 0 },
	{ x: 6, z: 0 },
	{ x: 6, z: 2 },
	{ x: 3, z: 2 },
	{ x: 3, z: 4 },
	{ x: 0, z: 4 }
];

describe('overhang fascia clearance', () => {
	it.each([
		['rectangle', rectangle, []],
		['diagonal', diagonal, []],
		['concave', concave, []],
		[
			'partial support',
			rectangle,
			[{ start: { x: 1, z: 0 }, end: { x: 4, z: 0 }, halfWidth: 0.075 }]
		]
	] as const)(
		'keeps the %s beam top and bottom faces outside the slab footprint',
		(_name, polygon, supports) => {
			const group = buildSlabOverhangFrame(
				exposedSlabEdges(polygon, supports),
				3,
				2.8,
				new BuildingMaterialManager()
			)!;
			const geometry = (group.children[0] as THREE.Mesh).geometry;
			const positions = geometry.getAttribute('position');
			const index = geometry.getIndex()!;
			let caps = 0;
			for (let i = 0; i < index.count; i += 3) {
				const ids = [index.getX(i), index.getX(i + 1), index.getX(i + 2)];
				const ys = ids.map((id) => positions.getY(id));
				if (Math.max(...ys) - Math.min(...ys) > 1e-6) continue;
				caps++;
				const centre = {
					x: ids.reduce((sum, id) => sum + positions.getX(id), 0) / 3,
					z: ids.reduce((sum, id) => sum + positions.getZ(id), 0) / 3
				};
				expect(pointInPolygon2D(centre, polygon)).toBe(false);
			}
			expect(caps).toBeGreaterThan(0);
			geometry.dispose();
		}
	);

	it('keeps the original visible projection and clearance above and below the slab', () => {
		const group = buildSlabOverhangFrame(
			exposedSlabEdges(rectangle, []),
			3,
			2.8,
			new BuildingMaterialManager()
		)!;
		const bounds = new THREE.Box3().setFromObject(group);
		expect(bounds.min.x).toBeCloseTo(-0.035);
		expect(bounds.max.x).toBeCloseTo(6.035);
		expect(bounds.min.z).toBeCloseTo(-0.035);
		expect(bounds.max.z).toBeCloseTo(4.035);
		expect(bounds.min.y).toBeCloseTo(2.76);
		expect(bounds.max.y).toBeCloseTo(3.01);
		(group.children[0] as THREE.Mesh).geometry.dispose();
	});
});
