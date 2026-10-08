import { describe, expect, it } from 'vitest';
import { generateMaterialMaps, mapResolutionFor } from '../generateMaterialMaps';
import { resolveMaterialRecipe } from '../materialPresets';
import {
	PROCEDURAL_MATERIAL_TYPES,
	type MaterialMapData,
	type ProceduralMaterialType
} from '../ProceduralMaterialTypes';

const generated = new Map<ProceduralMaterialType, MaterialMapData>();
function maps(type: ProceduralMaterialType): MaterialMapData {
	let data = generated.get(type);
	if (!data) {
		data = generateMaterialMaps(resolveMaterialRecipe(type, { quality: 'low' }));
		generated.set(type, data);
	}
	return data;
}

/** Mean absolute RGB difference between columns x0 and x1 (wrapping) of an RGBA image. */
function columnDifference(pixels: Uint8Array, size: number, x0: number, x1: number): number {
	let sum = 0;
	for (let y = 0; y < size; y++) {
		for (let c = 0; c < 3; c++) {
			sum += Math.abs(pixels[(y * size + x0) * 4 + c] - pixels[(y * size + x1) * 4 + c]);
		}
	}
	return sum / (size * 3);
}

function rowDifference(pixels: Uint8Array, size: number, y0: number, y1: number): number {
	let sum = 0;
	for (let x = 0; x < size; x++) {
		for (let c = 0; c < 3; c++) {
			sum += Math.abs(pixels[(y0 * size + x) * 4 + c] - pixels[(y1 * size + x) * 4 + c]);
		}
	}
	return sum / (size * 3);
}

describe('generateMaterialMaps', () => {
	it.each(PROCEDURAL_MATERIAL_TYPES)('%s produces valid maps of the expected size', (type) => {
		const data = maps(type);
		const recipe = resolveMaterialRecipe(type, { quality: 'low' });
		expect(data.size).toBe(mapResolutionFor(recipe));
		expect(data.albedo.length).toBe(data.size * data.size * 4);
		expect(data.normal.length).toBe(data.size * data.size * 4);
		expect(data.orm.length).toBe(data.ormSize * data.ormSize * 4);
		for (let i = 3; i < data.albedo.length; i += 4) {
			if (data.albedo[i] !== 255 || data.normal[i] !== 255) throw new Error('alpha must be opaque');
		}
		// Tangent-space normals point out of the surface.
		for (let i = 2; i < data.normal.length; i += 4) {
			if (data.normal[i] < 128) throw new Error('normal z must be positive');
		}
		for (const channel of data.meanLinear) {
			expect(Number.isFinite(channel)).toBe(true);
			expect(channel).toBeGreaterThan(0);
			expect(channel).toBeLessThanOrEqual(1);
		}
	});

	it.each(PROCEDURAL_MATERIAL_TYPES)('%s is deterministic for an identical recipe', (type) => {
		const again = generateMaterialMaps(resolveMaterialRecipe(type, { quality: 'low' }));
		expect(Buffer.from(again.albedo).equals(Buffer.from(maps(type).albedo))).toBe(true);
		expect(Buffer.from(again.normal).equals(Buffer.from(maps(type).normal))).toBe(true);
		expect(Buffer.from(again.orm).equals(Buffer.from(maps(type).orm))).toBe(true);
	});

	it.each(PROCEDURAL_MATERIAL_TYPES)('%s changes with the seed', (type) => {
		const other = generateMaterialMaps(
			resolveMaterialRecipe(type, { quality: 'low', seed: 'another seed' })
		);
		expect(Buffer.from(other.albedo).equals(Buffer.from(maps(type).albedo))).toBe(false);
	});

	it.each(PROCEDURAL_MATERIAL_TYPES)(
		'%s tiles seamlessly: the wrap edge is no harsher than interior edges',
		(type) => {
			const { albedo, normal, size } = maps(type);
			for (const pixels of [albedo, normal]) {
				let harshestX = 0;
				let harshestY = 0;
				for (let i = 0; i < size - 1; i++) {
					harshestX = Math.max(harshestX, columnDifference(pixels, size, i, i + 1));
					harshestY = Math.max(harshestY, rowDifference(pixels, size, i, i + 1));
				}
				// Structured materials have genuine edges inside the tile (joints, course steps); a seam
				// would be an edge harsher than any of them.
				expect(columnDifference(pixels, size, size - 1, 0)).toBeLessThanOrEqual(
					harshestX * 1.05 + 1
				);
				expect(rowDifference(pixels, size, size - 1, 0)).toBeLessThanOrEqual(harshestY * 1.05 + 1);
			}
		}
	);

	it.each(['plaster', 'ground', 'grass', 'glass'] as const)(
		'%s (no structural joints) has a wrap edge indistinguishable from an average edge',
		(type) => {
			const { albedo, size } = maps(type);
			let meanX = 0;
			let meanY = 0;
			for (let i = 0; i < size - 1; i++) {
				meanX += columnDifference(albedo, size, i, i + 1);
				meanY += rowDifference(albedo, size, i, i + 1);
			}
			meanX /= size - 1;
			meanY /= size - 1;
			expect(columnDifference(albedo, size, size - 1, 0)).toBeLessThanOrEqual(meanX * 1.6 + 0.5);
			expect(rowDifference(albedo, size, size - 1, 0)).toBeLessThanOrEqual(meanY * 1.6 + 0.5);
		}
	);

	it('uses the configured physical tile size', () => {
		const data = generateMaterialMaps(
			resolveMaterialRecipe('paving', { quality: 'low', scale: 0.5 })
		);
		expect(data.tileWidth).toBeCloseTo(1.5);
		expect(data.tileHeight).toBeCloseTo(1.5);
	});
});
