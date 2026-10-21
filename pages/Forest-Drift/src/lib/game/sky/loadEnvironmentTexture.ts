import * as THREE from 'three';

/** These panoramas contain sRGB colour, not linear HDR radiance. Decode without blocking startup. */
export async function loadEnvironmentTexture(
	url: string,
	signal: AbortSignal
): Promise<THREE.Texture> {
	const response = await fetch(url, { signal });
	if (!response.ok) throw new Error(`Environment image request failed (${response.status})`);
	const blob = await response.blob();
	signal.throwIfAborted();

	let texture: THREE.Texture | undefined;
	if (typeof createImageBitmap === 'function') {
		try {
			const bitmap = await createImageBitmap(blob, {
				imageOrientation: 'flipY',
				premultiplyAlpha: 'none',
				colorSpaceConversion: 'none'
			});
			texture = new THREE.Texture(bitmap);
		} catch {
			// Native image decoding remains available on browsers lacking this bitmap decoder.
			signal.throwIfAborted();
		}
	}
	if (!texture) {
		const objectUrl = URL.createObjectURL(blob);
		try {
			texture = await new THREE.TextureLoader().loadAsync(objectUrl);
		} finally {
			URL.revokeObjectURL(objectUrl);
		}
	}
	if (signal.aborted) {
		disposeEnvironmentTexture(texture);
		signal.throwIfAborted();
	}
	texture.colorSpace = THREE.SRGBColorSpace;
	texture.mapping = THREE.EquirectangularReflectionMapping;
	texture.generateMipmaps = false;
	texture.minFilter = THREE.LinearFilter;
	texture.magFilter = THREE.LinearFilter;
	texture.needsUpdate = true;
	return texture;
}

/** Texture disposal frees the GPU copy; ImageBitmap also owns explicitly released CPU memory. */
export function disposeEnvironmentTexture(texture: THREE.Texture): void {
	texture.dispose();
	const image = texture.image as { close?: () => void } | undefined;
	image?.close?.();
}
