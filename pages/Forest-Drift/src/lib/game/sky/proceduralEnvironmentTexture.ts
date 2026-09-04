import * as THREE from 'three';

/**
 * A tiny canvas-based vertical-gradient "environment" used when no real HDRI file is present at
 * the documented asset path. It exists so `hdriEnabled: true` (the default) works out of the box
 * without a missing-asset error — HdriEnvironmentSystem falls back to this automatically. It is
 * deliberately cheap (a 64x32 canvas) since it only needs to give PBR materials a plausible ambient
 * colour via PMREM, not look good as a literal background.
 */
export function createProceduralSkyTexture(
	topColorHex: string,
	horizonColorHex: string
): THREE.Texture {
	const width = 64;
	const height = 32;
	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;

	const ctx = canvas.getContext('2d');
	if (ctx) {
		const gradient = ctx.createLinearGradient(0, 0, 0, height);
		gradient.addColorStop(0, topColorHex);
		gradient.addColorStop(0.6, horizonColorHex);
		gradient.addColorStop(1, horizonColorHex);
		ctx.fillStyle = gradient;
		ctx.fillRect(0, 0, width, height);
	}

	const texture = new THREE.CanvasTexture(canvas);
	texture.mapping = THREE.EquirectangularReflectionMapping;
	texture.colorSpace = THREE.SRGBColorSpace;
	texture.needsUpdate = true;
	return texture;
}
