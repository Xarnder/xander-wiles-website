import * as THREE from 'three';
import layout from './characterSurfaces.json';
import { paintFabric } from '../materials/generators/fabric';
import { SurfaceCanvas } from '../materials/SurfaceCanvas';
import { resolveMaterialRecipe } from '../materials/materialPresets';
import { hash01 } from '../materials/noise/tileableNoise';

const width = layout.tileSize * layout.columns;
const height = layout.tileSize * layout.rows;

/** Small, deterministic CPU bake. No image downloads, animation updates or custom shaders. */
export function generateCharacterAtlas() {
	const color = new Uint8Array(width * height * 4).fill(255);
	const normal = new Uint8Array(width * height * 4);
	const orm = new Uint8Array(width * height * 4);
	const fabric = new SurfaceCanvas(layout.tileSize, 0.5, 0.5);
	paintFabric(fabric, { ...resolveMaterialRecipe('fabric'), colors: { base: [1, 1, 1] } });
	const inner = layout.tileSize - 2 * layout.gutter;
	for (let tile = 0; tile < layout.columns * layout.rows; tile++) {
		const kind = layout.surfaces[tile] ?? 'skin';
		const relief = new Float32Array(inner * inner);
		const shades = new Float32Array(inner * inner);
		const rough = new Float32Array(inner * inner);
		for (let y = 0; y < inner; y++) {
			for (let x = 0; x < inner; x++) {
				const i = y * inner + x;
				const noise = hash01(x, y, 713);
				const strand = Math.pow(0.5 + 0.5 * Math.cos(x * 1.6 + 0.55 * Math.sin(y * 0.045)), 3);
				let shade = 0.98,
					bump = 0,
					r = 0.75;
				if (kind === 'fabric') {
					const f =
						Math.floor((y / inner) * fabric.size) * fabric.size +
						Math.floor((x / inner) * fabric.size);
					shade = 0.55 + fabric.red[f] * 0.45;
					bump = fabric.height[f] * 170;
					r = fabric.roughness[f];
				} else if (kind === 'hair' || kind === 'fur') {
					const grain = kind === 'hair' ? strand : strand * (0.6 + noise * 0.4);
					shade = 0.89 + grain * 0.11;
					bump = grain * 0.12;
					r = kind === 'hair' ? 0.48 + (1 - grain) * 0.16 : 0.95;
				} else if (kind === 'leather') {
					shade = 0.97 + noise * 0.03;
					bump = noise * 0.035;
					r = 0.72 + noise * 0.12;
				} else if (kind === 'skin') {
					shade = 0.995 + noise * 0.005;
					bump = noise * 0.008;
					r = 0.78;
				} else if (kind === 'metal') {
					shade = 0.98 + noise * 0.02;
					bump = noise * 0.012;
					r = 0.3 + noise * 0.08;
				} else if (kind === 'eyes') {
					shade = 1;
					r = 0.2;
				}
				shades[i] = Math.max(0, Math.min(1, shade));
				relief[i] = bump;
				rough[i] = r;
			}
		}
		// Extruded gutters protect bilinear filtering and the first mip levels at seams.
		for (let y = 0; y < layout.tileSize; y++) {
			for (let x = 0; x < layout.tileSize; x++) {
				const u = Math.max(0, Math.min(inner - 1, x - layout.gutter));
				const v = Math.max(0, Math.min(inner - 1, y - layout.gutter));
				const i = v * inner + u;
				const dest =
					((Math.floor(tile / layout.columns) * layout.tileSize + y) * width +
						(tile % layout.columns) * layout.tileSize +
						x) *
					4;
				const dx =
					relief[v * inner + Math.max(0, u - 1)] - relief[v * inner + Math.min(inner - 1, u + 1)];
				const dy =
					relief[Math.max(0, v - 1) * inner + u] - relief[Math.min(inner - 1, v + 1) * inner + u];
				const length = Math.hypot(dx, dy, 1);
				color.set([shades[i] * 255, shades[i] * 255, shades[i] * 255, 255], dest);
				normal.set(
					[
						((dx / length) * 0.5 + 0.5) * 255,
						((dy / length) * 0.5 + 0.5) * 255,
						((1 / length) * 0.5 + 0.5) * 255,
						255
					],
					dest
				);
				orm.set([255, rough[i] * 255, kind === 'metal' ? 230 : 0, 255], dest);
			}
		}
	}
	return { color, normal, orm };
}

// CPU pixels survive renderer lifetimes; GPU resources are reference counted across caches.
let pixels: ReturnType<typeof generateCharacterAtlas> | undefined;
let shared:
	{ color: THREE.DataTexture; normal: THREE.DataTexture; orm: THREE.DataTexture } | undefined;
let users = 0;
export function acquireCharacterTextures() {
	if (!shared) {
		pixels ??= generateCharacterAtlas();
		const texture = (data: Uint8Array, srgb = false) => {
			const result = new THREE.DataTexture(data, width, height);
			result.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
			result.magFilter = THREE.LinearFilter;
			result.minFilter = THREE.LinearMipmapLinearFilter;
			result.generateMipmaps = true;
			result.needsUpdate = true;
			return result;
		};
		shared = {
			color: texture(pixels.color, true),
			normal: texture(pixels.normal),
			orm: texture(pixels.orm)
		};
	}
	users++;
	const maps = shared;
	let released = false;
	return {
		bind(material: THREE.MeshStandardMaterial) {
			material.map = maps.color;
			material.normalMap = maps.normal;
			material.roughnessMap = material.metalnessMap = maps.orm;
			material.roughness = material.metalness = 1;
			material.needsUpdate = true;
		},
		release() {
			if (released) return;
			released = true;
			if (--users === 0) {
				for (const map of Object.values(maps)) map.dispose();
				shared = undefined;
			}
		}
	};
}
