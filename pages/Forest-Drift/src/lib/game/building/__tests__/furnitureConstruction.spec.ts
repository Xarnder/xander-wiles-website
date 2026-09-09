import { describe, expect, it } from 'vitest';
import { FURNITURE_KINDS } from '../FurnitureTypes';
import { resolveFurnitureBuildInput } from '../furnitureCatalogue';
import {
	buildFurnitureConstruction,
	furnitureConstructionIsFinite,
	furniturePrimitivesWithRole
} from '../furnitureConstruction';
import { createFurnitureSlotGeometries, disposeSlotGeometries } from '../FurnitureGeometry';

function input(kind: (typeof FURNITURE_KINDS)[number], width?: number, depth?: number, height?: number) {
	const resolved = resolveFurnitureBuildInput({ kind });
	return resolveFurnitureBuildInput({
		kind,
		dimensions: {
			width: width ?? resolved.width,
			depth: depth ?? resolved.depth,
			height: height ?? resolved.height
		}
	});
}

describe('furniture construction', () => {
	it('produces finite primitives for every catalogue kind at min, default, and max size', () => {
		for (const kind of FURNITURE_KINDS) {
			const entry = resolveFurnitureBuildInput({ kind });
			const sizes = [
				input(kind, 0.01, 0.01, 0.01),
				entry,
				input(kind, 99, 99, 99)
			];
			for (const size of sizes) {
				const construction = buildFurnitureConstruction(size);
				expect(furnitureConstructionIsFinite(construction)).toBe(true);
				const slots = createFurnitureSlotGeometries(construction);
				for (const geom of Object.values(slots)) {
					expect(geom).toBeDefined();
					const pos = geom!.getAttribute('position');
					expect(pos.count).toBeGreaterThan(0);
					for (let i = 0; i < pos.array.length; i++) {
						expect(Number.isFinite(pos.array[i])).toBe(true);
					}
					geom!.computeBoundingBox();
					expect(geom!.boundingBox).not.toBeNull();
				}
				disposeSlotGeometries(slots);
			}
		}
	});

	it('lengthens a bench top when width doubles without thickening legs', () => {
		const small = buildFurnitureConstruction(input('bench', 1, 0.42, 0.85));
		const large = buildFurnitureConstruction(input('bench', 2, 0.42, 0.85));
		const smallTop = furniturePrimitivesWithRole(small, 'top').find((p) => p.shape === 'box');
		const largeTop = furniturePrimitivesWithRole(large, 'top').find((p) => p.shape === 'box');
		expect(smallTop?.shape).toBe('box');
		expect(largeTop?.shape).toBe('box');
		if (smallTop?.shape !== 'box' || largeTop?.shape !== 'box') return;
		expect(largeTop.sx).toBeGreaterThan(smallTop.sx * 1.5);
		expect(large.metrics.legThickness).toBeCloseTo(small.metrics.legThickness, 3);
		const smallLegs = furniturePrimitivesWithRole(small, 'leg').filter((p) => p.shape === 'box');
		const largeLegs = furniturePrimitivesWithRole(large, 'leg').filter((p) => p.shape === 'box');
		expect(largeLegs.length).toBeGreaterThanOrEqual(smallLegs.length);
		const smallSpan = Math.max(...smallLegs.map((p) => (p.shape === 'box' ? Math.abs(p.cx) : 0)));
		const largeSpan = Math.max(...largeLegs.map((p) => (p.shape === 'box' ? Math.abs(p.cx) : 0)));
		expect(largeSpan).toBeGreaterThan(smallSpan);
	});

	it('does not stretch table legs when the top gets wider', () => {
		const small = buildFurnitureConstruction(input('table', 1, 0.8, 0.75));
		const large = buildFurnitureConstruction(input('table', 2, 0.8, 0.75));
		expect(large.metrics.legThickness).toBeCloseTo(small.metrics.legThickness, 3);
		expect(large.metrics.topThickness).toBeCloseTo(small.metrics.topThickness, 3);
		const largeTop = furniturePrimitivesWithRole(large, 'top').find((p) => p.shape === 'box');
		const smallTop = furniturePrimitivesWithRole(small, 'top').find((p) => p.shape === 'box');
		if (smallTop?.shape === 'box' && largeTop?.shape === 'box') {
			expect(largeTop.sx).toBeGreaterThan(smallTop.sx * 1.5);
		}
	});

	it('extends a kitchen counter cabinet when width increases', () => {
		const small = buildFurnitureConstruction(input('kitchen-counter', 1, 0.6, 0.9));
		const large = buildFurnitureConstruction(input('kitchen-counter', 3, 0.6, 0.9));
		expect(large.metrics.footprintWidth).toBeGreaterThan(small.metrics.footprintWidth * 2);
		expect(large.metrics.maxX - large.metrics.minX).toBeGreaterThan(
			small.metrics.maxX - small.metrics.minX
		);
	});

	it('adds more shelf boards as height and shelf count grow', () => {
		const short = buildFurnitureConstruction({
			...input('shelf', 1.2, 0.3, 1),
			shelfCount: 2
		});
		const tall = buildFurnitureConstruction({
			...input('shelf', 1.2, 0.3, 2.2),
			shelfCount: 6
		});
		expect(furniturePrimitivesWithRole(tall, 'shelf').length).toBeGreaterThan(
			furniturePrimitivesWithRole(short, 'shelf').length
		);
		expect(tall.metrics.maxY).toBeGreaterThan(short.metrics.maxY);
	});

	it('keeps a curved barrel profile when diameter and height change', () => {
		const small = buildFurnitureConstruction(input('barrel', 0.4, 0.4, 0.5));
		const large = buildFurnitureConstruction(input('barrel', 0.8, 0.8, 1));
		const smallBody = small.primitives.find((p) => p.shape === 'lathe');
		const largeBody = large.primitives.find((p) => p.shape === 'lathe');
		expect(smallBody?.shape).toBe('lathe');
		expect(largeBody?.shape).toBe('lathe');
		if (smallBody?.shape !== 'lathe' || largeBody?.shape !== 'lathe') return;
		const smallMax = Math.max(...smallBody.points.map((p) => p.x));
		const largeMax = Math.max(...largeBody.points.map((p) => p.x));
		expect(largeMax).toBeGreaterThan(smallMax * 1.4);
		expect(largeBody.points.length).toBe(smallBody.points.length);
	});

	it('keeps a bed mattress inside a larger frame when width and length change', () => {
		const small = buildFurnitureConstruction(input('bed', 0.9, 2, 0.55));
		const large = buildFurnitureConstruction(input('bed', 1.8, 2.1, 0.6));
		const smallMattress = furniturePrimitivesWithRole(small, 'mattress').find((p) => p.shape === 'box');
		const largeMattress = furniturePrimitivesWithRole(large, 'mattress').find((p) => p.shape === 'box');
		if (smallMattress?.shape === 'box' && largeMattress?.shape === 'box') {
			expect(largeMattress.sx).toBeGreaterThan(smallMattress.sx);
			expect(largeMattress.sz).toBeGreaterThan(smallMattress.sz * 0.95);
			expect(largeMattress.sx).toBeLessThan(large.metrics.footprintWidth);
		}
	});
});
