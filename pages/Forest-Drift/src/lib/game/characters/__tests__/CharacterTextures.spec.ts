import { describe, expect, it, vi } from 'vitest';
import { MeshStandardMaterial, SRGBColorSpace, NoColorSpace } from 'three';
import { acquireCharacterTextures, generateCharacterAtlas } from '../CharacterTextures';
import layout from '../characterSurfaces.json';

describe('procedural character surfaces', () => {
	it('bakes deterministic bounded maps with cloth, directional hair and metal isolation', () => {
		const a = generateCharacterAtlas();
		expect(a).toEqual(generateCharacterAtlas());
		expect(a.color.byteLength + a.normal.byteLength + a.orm.byteLength).toBe(512 * 256 * 4 * 3);
		const width = layout.columns * layout.tileSize;
		const sample = (kind: string, x: number, y: number, channel: number, data = a.color) => {
			const tile = layout.surfaces.indexOf(kind);
			return data[
				((Math.floor(tile / layout.columns) * 128 + y + 8) * width +
					(tile % layout.columns) * 128 +
					x +
					8) *
					4 +
					channel
			];
		};
		for (let y = 0; y < 112; y++)
			for (let x = 0; x < 112; x++) expect(sample('fabric', x, y, 0)).toBeGreaterThan(200);
		let across = 0,
			down = 0;
		for (let y = 1; y < 100; y++)
			for (let x = 1; x < 100; x++) {
				across += Math.abs(sample('hair', x, y, 0) - sample('hair', x - 1, y, 0));
				down += Math.abs(sample('hair', x, y, 0) - sample('hair', x, y - 1, 0));
			}
		expect(across).toBeGreaterThan(down * 10);
		for (const kind of layout.surfaces) {
			expect(sample(kind, 20, 20, 2, a.orm)).toBe(kind === 'metal' ? 230 : 0);
		}
		// The bright atlas still retains tonal detail rather than becoming a flat white map.
		expect(new Set(a.color).size).toBeGreaterThan(16);
	});
	it('shares maps across instances and releases GPU resources only after the last cache', () => {
		const first = acquireCharacterTextures(),
			second = acquireCharacterTextures();
		const a = new MeshStandardMaterial(),
			b = new MeshStandardMaterial();
		first.bind(a);
		second.bind(b);
		expect(a.map).toBe(b.map);
		expect(a.normalMap).toBe(b.normalMap);
		expect(a.roughnessMap).toBe(a.metalnessMap);
		expect(a.map!.colorSpace).toBe(SRGBColorSpace);
		expect(a.normalMap!.colorSpace).toBe(NoColorSpace);
		const dispose = vi.spyOn(a.map!, 'dispose');
		first.release();
		first.release();
		expect(dispose).not.toHaveBeenCalled();
		second.release();
		expect(dispose).toHaveBeenCalledTimes(1);
		a.dispose();
		b.dispose();
	});
});
