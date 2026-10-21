import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { disposeEnvironmentTexture, loadEnvironmentTexture } from '../loadEnvironmentTexture';

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});
function mockResponse() {
	const blob = new Blob(['webp'], { type: 'image/webp' });
	const fetcher = vi.fn().mockResolvedValue({ ok: true, blob: async () => blob });
	vi.stubGlobal('fetch', fetcher);
	return { blob, fetcher };
}

describe('environment panorama decoding', () => {
	it('uses asynchronous bitmap decoding with correct orientation, colour space and no source mipmaps', async () => {
		const { blob, fetcher } = mockResponse();
		const bitmap = { width: 1774, height: 887, close: vi.fn() };
		const decode = vi.fn().mockResolvedValue(bitmap);
		vi.stubGlobal('createImageBitmap', decode);
		const signal = new AbortController().signal;
		const texture = await loadEnvironmentTexture('/sky.webp', signal);
		expect(fetcher).toHaveBeenCalledWith('/sky.webp', { signal });
		expect(decode).toHaveBeenCalledWith(blob, {
			imageOrientation: 'flipY',
			premultiplyAlpha: 'none',
			colorSpaceConversion: 'none'
		});
		expect(texture.image).toBe(bitmap);
		expect(texture.colorSpace).toBe(THREE.SRGBColorSpace);
		expect(texture.mapping).toBe(THREE.EquirectangularReflectionMapping);
		expect(texture.minFilter).toBe(THREE.LinearFilter);
		expect(texture.generateMipmaps).toBe(false);
		disposeEnvironmentTexture(texture);
		expect(bitmap.close).toHaveBeenCalledOnce();
	});
	it('rejects missing assets without attempting a decode', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));
		await expect(
			loadEnvironmentTexture('/missing.webp', new AbortController().signal)
		).rejects.toThrow('404');
	});
	it('releases a bitmap if cancellation arrives while it is decoding', async () => {
		mockResponse();
		const controller = new AbortController();
		const bitmap = { close: vi.fn() };
		vi.stubGlobal(
			'createImageBitmap',
			vi.fn().mockImplementation(async () => {
				controller.abort();
				return bitmap;
			})
		);
		await expect(loadEnvironmentTexture('/sky.webp', controller.signal)).rejects.toThrow();
		expect(bitmap.close).toHaveBeenCalledOnce();
	});
	it.each([false, true])(
		'uses native image fallback when the bitmap decoder is unavailable or rejects (reject=%s)',
		async (reject) => {
			mockResponse();
			vi.stubGlobal(
				'createImageBitmap',
				reject ? vi.fn().mockRejectedValue(new Error('unsupported')) : undefined
			);
			const texture = new THREE.Texture<HTMLImageElement>();
			const imageLoad = vi
				.spyOn(THREE.TextureLoader.prototype, 'loadAsync')
				.mockResolvedValue(texture);
			vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:environment');
			const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
			expect(await loadEnvironmentTexture('/sky.webp', new AbortController().signal)).toBe(texture);
			expect(imageLoad).toHaveBeenCalledWith('blob:environment');
			expect(revoke).toHaveBeenCalledWith('blob:environment');
		}
	);
});
