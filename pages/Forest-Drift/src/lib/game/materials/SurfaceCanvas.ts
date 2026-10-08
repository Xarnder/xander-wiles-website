import type { MaterialMapData, RgbColor } from './ProceduralMaterialTypes';

/**
 * Working buffers a material generator paints into, before they are packed into GPU-ready maps.
 * All buffers are `size × size`, row `j` is texture V = j / size (DataTextures are uploaded with
 * `flipY = false`), and every neighbourhood operation wraps around the edges so the result tiles.
 *
 * Colour is stored as sRGB floats (the palette's own space) — generators blend in the space an
 * artist picks colours in, and the output is encoded straight to 8-bit sRGB.
 */
export class SurfaceCanvas {
	readonly size: number;
	/** Physical size of the tile along U/V, in metres — makes normals and feature sizes physical. */
	readonly tileWidth: number;
	readonly tileHeight: number;
	readonly red: Float32Array;
	readonly green: Float32Array;
	readonly blue: Float32Array;
	/** Surface height in metres (relative; only gradients matter). */
	readonly height: Float32Array;
	readonly roughness: Float32Array;
	/** Ambient occlusion, 1 = fully open. */
	readonly ao: Float32Array;

	constructor(size: number, tileWidth: number, tileHeight: number) {
		if (!Number.isInteger(Math.log2(size))) {
			throw new Error(`SurfaceCanvas: size must be a power of two, got ${size}`);
		}
		this.size = size;
		this.tileWidth = tileWidth;
		this.tileHeight = tileHeight;
		const count = size * size;
		this.red = new Float32Array(count);
		this.green = new Float32Array(count);
		this.blue = new Float32Array(count);
		this.height = new Float32Array(count);
		this.roughness = new Float32Array(count);
		this.ao = new Float32Array(count).fill(1);
	}

	setColor(index: number, color: RgbColor): void {
		this.red[index] = color[0];
		this.green[index] = color[1];
		this.blue[index] = color[2];
	}

	/** Blends the texel toward `color` by `amount` (0..1). */
	mixColor(index: number, color: RgbColor, amount: number): void {
		if (amount <= 0) return;
		const t = amount > 1 ? 1 : amount;
		this.red[index] += (color[0] - this.red[index]) * t;
		this.green[index] += (color[1] - this.green[index]) * t;
		this.blue[index] += (color[2] - this.blue[index]) * t;
	}

	/** Multiplies the texel's brightness (keeps hue). */
	scaleColor(index: number, factor: number): void {
		this.red[index] *= factor;
		this.green[index] *= factor;
		this.blue[index] *= factor;
	}
}

/** Mixes two sRGB colours. */
export function mixRgb(a: RgbColor, b: RgbColor, t: number): [number, number, number] {
	return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function srgbToLinear(c: number): number {
	return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function toByte(value: number): number {
	const v = Math.round(value * 255);
	return v < 0 ? 0 : v > 255 ? 255 : v;
}

/**
 * Separable box blur with wrap-around, used for cavity AO (height vs. its local average). `radius`
 * is in texels. Runs in O(size²) regardless of radius (running sums).
 */
export function wrappedBoxBlur(source: Float32Array, size: number, radius: number): Float32Array {
	const temp = new Float32Array(source.length);
	const out = new Float32Array(source.length);
	const r = Math.max(1, Math.round(radius));
	const window = r * 2 + 1;
	const mask = size - 1;
	for (let y = 0; y < size; y++) {
		const row = y * size;
		let sum = 0;
		for (let k = -r; k <= r; k++) sum += source[row + ((k + size) & mask)];
		for (let x = 0; x < size; x++) {
			temp[row + x] = sum / window;
			sum += source[row + ((x + r + 1) & mask)] - source[row + ((x - r + size) & mask)];
		}
	}
	for (let x = 0; x < size; x++) {
		let sum = 0;
		for (let k = -r; k <= r; k++) sum += temp[((k + size) & mask) * size + x];
		for (let y = 0; y < size; y++) {
			out[y * size + x] = sum / window;
			sum += temp[((y + r + 1) & mask) * size + x] - temp[((y - r + size) & mask) * size + x];
		}
	}
	return out;
}

export interface FinalizeOptions {
	normalStrength: number;
	ormSize: number;
	/** How strongly local cavities (cracks, joints, gaps) darken ambient occlusion. */
	cavityAo?: number;
	/** Cavity blur radius in metres. */
	cavityRadius?: number;
}

/**
 * Packs a painted canvas into GPU-ready RGBA8 maps: sRGB albedo, a tangent-space normal map derived
 * from the height field with PHYSICAL texel spacing (so a 1 cm groove has the same slope on a 2 m
 * tile and a 0.5 m tile), and a half-resolution ORM map. All derivatives wrap, so the normal map
 * tiles seamlessly whenever the height field does.
 */
export function finalizeSurface(canvas: SurfaceCanvas, options: FinalizeOptions): MaterialMapData {
	const { size, height } = canvas;
	const mask = size - 1;
	const count = size * size;
	const texelU = canvas.tileWidth / size;
	const texelV = canvas.tileHeight / size;

	const cavityAo = options.cavityAo ?? 0;
	if (cavityAo > 0) {
		const radiusTexels = Math.max(1, (options.cavityRadius ?? 0.02) / Math.min(texelU, texelV));
		const blurred = wrappedBoxBlur(height, size, Math.min(radiusTexels, size / 8));
		for (let i = 0; i < count; i++) {
			const depth = blurred[i] - height[i];
			if (depth > 0) canvas.ao[i] *= Math.max(0.25, 1 - depth * cavityAo);
		}
	}

	const albedo = new Uint8Array(count * 4);
	const normal = new Uint8Array(count * 4);
	let sumR = 0;
	let sumG = 0;
	let sumB = 0;
	const strength = options.normalStrength;

	for (let y = 0; y < size; y++) {
		const up = ((y + 1) & mask) * size;
		const down = ((y - 1 + size) & mask) * size;
		const row = y * size;
		for (let x = 0; x < size; x++) {
			const i = row + x;
			const o = i * 4;

			const r = Math.min(1, Math.max(0, canvas.red[i]));
			const g = Math.min(1, Math.max(0, canvas.green[i]));
			const b = Math.min(1, Math.max(0, canvas.blue[i]));
			albedo[o] = toByte(r);
			albedo[o + 1] = toByte(g);
			albedo[o + 2] = toByte(b);
			albedo[o + 3] = 255;
			sumR += srgbToLinearFast(r);
			sumG += srgbToLinearFast(g);
			sumB += srgbToLinearFast(b);

			const dhdu =
				(height[row + ((x + 1) & mask)] - height[row + ((x - 1 + size) & mask)]) / (2 * texelU);
			const dhdv = (height[up + x] - height[down + x]) / (2 * texelV);
			let nx = -dhdu * strength;
			let ny = -dhdv * strength;
			let nz = 1;
			const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
			nx /= len;
			ny /= len;
			nz /= len;
			normal[o] = toByte(nx * 0.5 + 0.5);
			normal[o + 1] = toByte(ny * 0.5 + 0.5);
			normal[o + 2] = toByte(nz * 0.5 + 0.5);
			normal[o + 3] = 255;
		}
	}

	const ormSize = options.ormSize;
	const step = size / ormSize;
	const orm = new Uint8Array(ormSize * ormSize * 4);
	for (let y = 0; y < ormSize; y++) {
		for (let x = 0; x < ormSize; x++) {
			let ao = 0;
			let rough = 0;
			for (let dy = 0; dy < step; dy++) {
				for (let dx = 0; dx < step; dx++) {
					const i = (y * step + dy) * size + (x * step + dx);
					ao += canvas.ao[i];
					rough += canvas.roughness[i];
				}
			}
			const n = step * step;
			const o = (y * ormSize + x) * 4;
			orm[o] = toByte(ao / n);
			orm[o + 1] = toByte(rough / n);
			orm[o + 2] = 0;
			orm[o + 3] = 255;
		}
	}

	return {
		size,
		ormSize,
		albedo,
		normal,
		orm,
		meanLinear: [sumR / count, sumG / count, sumB / count],
		tileWidth: canvas.tileWidth,
		tileHeight: canvas.tileHeight
	};
}

const SRGB_TO_LINEAR = (() => {
	const table = new Float32Array(1024);
	for (let i = 0; i < 1024; i++) table[i] = srgbToLinear(i / 1023);
	return table;
})();

function srgbToLinearFast(c: number): number {
	return SRGB_TO_LINEAR[Math.round(c * 1023)];
}
