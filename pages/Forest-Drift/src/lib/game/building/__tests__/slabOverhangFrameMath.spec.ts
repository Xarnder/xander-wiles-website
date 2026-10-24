import { describe, expect, it } from 'vitest';
import { exposedSlabEdges, type SlabEdgeSupport } from '../slabOverhangFrameMath';

const rectangle = [
	{ x: 0, z: 0 },
	{ x: 6, z: 0 },
	{ x: 6, z: 4 },
	{ x: 0, z: 4 }
];
const support = (a: number, b: number, z = 0, halfWidth = 0.075): SlabEdgeSupport => ({
	start: { x: a, z },
	end: { x: b, z },
	halfWidth
});

describe('exposed slab edges', () => {
	it('frames every unsupported edge, with outward normals independent of polygon winding', () => {
		const edges = exposedSlabEdges(rectangle, []);
		expect(edges).toHaveLength(4);
		expect(edges[0]).toEqual({
			start: { x: 0, z: 0 },
			end: { x: 6, z: 0 },
			outward: { x: 0, z: -1 }
		});
		expect(exposedSlabEdges([...rectangle].reverse(), [])).toEqual(edges);
	});

	it('subtracts and merges wall coverage, leaving only the exposed parts of a partially supported edge', () => {
		const edges = exposedSlabEdges(rectangle, [support(1, 3), support(2, 4), support(5, 4)]);
		const bottom = edges.filter((edge) => edge.start.z === 0 && edge.end.z === 0);
		expect(bottom.map((edge) => [edge.start.x, edge.end.x])).toEqual([
			[0, 1],
			[5, 6]
		]);
	});

	it('counts wall thickness but not a nearby parallel wall or a perpendicular crossing', () => {
		expect(exposedSlabEdges(rectangle, [support(0, 6, 0.075)])).toHaveLength(3);
		expect(exposedSlabEdges(rectangle, [support(0, 6, 0.08)])).toHaveLength(4);
		expect(
			exposedSlabEdges(rectangle, [{ start: { x: 3, z: -1 }, end: { x: 3, z: 1 }, halfWidth: 0.1 }])
		).toHaveLength(4);
	});

	it('handles diagonal and concave slab outlines without relying on axis-aligned bounding boxes', () => {
		const triangle = [
			{ x: 0, z: 0 },
			{ x: 4, z: 0 },
			{ x: 4, z: 4 }
		];
		const diagonal = { start: { x: 1, z: 1 }, end: { x: 3, z: 3 }, halfWidth: 0.075 };
		const edges = exposedSlabEdges(triangle, [diagonal]);
		expect(edges).toHaveLength(4);
		expect(edges.some((edge) => edge.start.x === 3 && edge.end.x === 1)).toBe(false);
		const concave = [...rectangle.slice(0, 3), { x: 3, z: 2 }, rectangle[3]];
		expect(exposedSlabEdges(concave, [])).toHaveLength(5);
	});
});
