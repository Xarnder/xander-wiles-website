import { describe, expect, it } from 'vitest';
import {
	FURNITURE_CATALOGUE,
	clampFurnitureToRules,
	getFurnitureCatalogueEntry,
	resolveFurnitureBuildInput
} from '../furnitureCatalogue';
import { FURNITURE_KINDS } from '../FurnitureTypes';

describe('furniture catalogue', () => {
	it('registers every kind once with a builder-ready definition', () => {
		const kinds = FURNITURE_CATALOGUE.map((entry) => entry.kind);
		expect(kinds).toEqual([...FURNITURE_KINDS]);
		expect(new Set(kinds).size).toBe(FURNITURE_KINDS.length);
	});

	it('keeps dimension ranges valid and defaults inside them', () => {
		for (const entry of FURNITURE_CATALOGUE) {
			const d = entry.dimensions;
			expect(d.minWidth).toBeLessThanOrEqual(d.defaultWidth);
			expect(d.defaultWidth).toBeLessThanOrEqual(d.maxWidth);
			expect(d.minDepth).toBeLessThanOrEqual(d.defaultDepth);
			expect(d.defaultDepth).toBeLessThanOrEqual(d.maxDepth);
			expect(d.minHeight).toBeLessThanOrEqual(d.defaultHeight);
			expect(d.defaultHeight).toBeLessThanOrEqual(d.maxHeight);
			expect(d.widthStep).toBeGreaterThan(0);
			expect(entry.name.length).toBeGreaterThan(0);
			expect(entry.defaultPrimary).toMatch(/^#/);
			for (const param of entry.params) {
				if (param.type === 'integer') {
					expect(param.min).toBeLessThanOrEqual(param.defaultValue);
					expect(param.defaultValue).toBeLessThanOrEqual(param.max);
				}
			}
		}
	});

	it('clamps and snaps authored dimensions', () => {
		const clamped = clampFurnitureToRules('table', 99, -1, 0);
		const entry = getFurnitureCatalogueEntry('table');
		expect(clamped.width).toBe(entry.dimensions.maxWidth);
		expect(clamped.depth).toBe(entry.dimensions.minDepth);
		expect(clamped.height).toBe(entry.dimensions.minHeight);
	});

	it('keeps barrel depth equal to diameter', () => {
		const clamped = clampFurnitureToRules('barrel', 0.8, 0.4, 0.75);
		expect(clamped.width).toBe(clamped.depth);
	});

	it('resolves missing parameters from catalogue defaults', () => {
		const bed = resolveFurnitureBuildInput({ kind: 'bed' });
		expect(bed.headboard).toBe(true);
		expect(bed.width).toBe(1.4);
		const shelf = resolveFurnitureBuildInput({
			kind: 'shelf',
			parameters: { shelfCount: 20 }
		});
		expect(shelf.shelfCount).toBe(8);
	});
});
