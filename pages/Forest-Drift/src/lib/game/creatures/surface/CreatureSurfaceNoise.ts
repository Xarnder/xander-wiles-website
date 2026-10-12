import { Data3DTexture, LinearFilter, RedFormat, RepeatWrapping, UnsignedByteType } from 'three';
import { createMulberry32 } from '../../terrain/seededRandom';

/**
 * The one noise volume every creature samples: 32³ bytes (32 KB), tileable, band-limited (blurred)
 * and histogram-equalised so a threshold of `1 − coverage` covers exactly that fraction of a
 * surface. Species and individuals differ by scale and offset, never by texture.
 */
export const NOISE_SIZE = 32;

let data: Uint8Array | undefined;
export function creatureNoiseData(): Uint8Array {
	if (data) return data;
	const n = NOISE_SIZE,
		count = n * n * n;
	const rng = createMulberry32(0x5eed_c0de);
	let field = new Float32Array(count);
	for (let i = 0; i < count; i++) field[i] = rng();
	const index = (x: number, y: number, z: number) =>
		((x + n) % n) + ((y + n) % n) * n + ((z + n) % n) * n * n;
	// Separable wrap-around 3-tap box blur, three passes per axis: soft blobs ~8 texels apart
	// (about 60 per tile slice, so a body never shows the tile repeat), no visible texel grid.
	for (let pass = 0; pass < 3; pass++)
		for (let axis = 0; axis < 3; axis++) {
			const next = new Float32Array(count);
			for (let z = 0; z < n; z++)
				for (let y = 0; y < n; y++)
					for (let x = 0; x < n; x++) {
						let sum = 0;
						for (let k = -1; k <= 1; k++)
							sum +=
								axis === 0
									? field[index(x + k, y, z)]
									: axis === 1
										? field[index(x, y + k, z)]
										: field[index(x, y, z + k)];
						next[index(x, y, z)] = sum / 3;
					}
			field = next;
		}
	// Histogram-equalise to uniform 0–255.
	const order = Array.from({ length: count }, (_, i) => i).sort((a, b) => field[a] - field[b]);
	data = new Uint8Array(count);
	order.forEach((cell, rank) => (data![cell] = Math.floor((rank / count) * 256)));
	return data;
}

let texture: Data3DTexture | undefined;
/** Shared GPU copy (one per page; three uploads it once per renderer). */
export function creatureNoiseTexture(): Data3DTexture {
	if (texture) return texture;
	texture = new Data3DTexture(creatureNoiseData(), NOISE_SIZE, NOISE_SIZE, NOISE_SIZE);
	texture.format = RedFormat;
	texture.type = UnsignedByteType;
	texture.minFilter = texture.magFilter = LinearFilter;
	texture.wrapS = texture.wrapT = texture.wrapR = RepeatWrapping;
	texture.unpackAlignment = 1;
	texture.needsUpdate = true;
	return texture;
}

/**
 * CPU mirror of `texture(creatureNoise, p)` with linear filtering and repeat wrapping, in texture
 * coordinates (1 = one tile). Used by tests, golden fingerprints and far-LOD baking.
 */
export function sampleCreatureNoise(x: number, y: number, z: number): number {
	const d = creatureNoiseData(),
		n = NOISE_SIZE;
	const fx = x * n - 0.5,
		fy = y * n - 0.5,
		fz = z * n - 0.5;
	const x0 = Math.floor(fx),
		y0 = Math.floor(fy),
		z0 = Math.floor(fz);
	const tx = fx - x0,
		ty = fy - y0,
		tz = fz - z0;
	const at = (x: number, y: number, z: number) =>
		d[(((x % n) + n) % n) + (((y % n) + n) % n) * n + (((z % n) + n) % n) * n * n] / 255;
	const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
	const c00 = lerp(at(x0, y0, z0), at(x0 + 1, y0, z0), tx);
	const c10 = lerp(at(x0, y0 + 1, z0), at(x0 + 1, y0 + 1, z0), tx);
	const c01 = lerp(at(x0, y0, z0 + 1), at(x0 + 1, y0, z0 + 1), tx);
	const c11 = lerp(at(x0, y0 + 1, z0 + 1), at(x0 + 1, y0 + 1, z0 + 1), tx);
	return lerp(lerp(c00, c10, ty), lerp(c01, c11, ty), tz);
}
