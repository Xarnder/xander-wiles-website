import { Color, DataTexture, FloatType, NearestFilter, RGBAFormat, SRGBColorSpace } from 'three';
import type { CreatureLod } from '../CreatureTypes';
import {
	NOISE_FEATURE_TEXELS,
	patternCode,
	type CreatureSurfaceDefinition,
	type IndividualPattern
} from './CreaturePatternGenerator';
import { patternColor } from './CreatureSurfaceClassifier';

/**
 * Per-creature pattern parameters for the ONE shared creature material. Uniforms on a shared
 * MeshStandardMaterial are not re-uploaded per object, so each live creature owns a row of this
 * small float texture (8 texels) and its vertices carry the row index. One shader program serves
 * every creature; future instancing only needs the index as an instance attribute.
 *
 * Row layout (RGBA texels):
 *   0 A colour.rgb, A type     1 A scale, density, contrast, stretch
 *   2 A freq, phase, off.x, y  3 A off.z, 1/bodyScale, lodMode, debugMode
 *   4 B colour.rgb, B type     5 B scale, density, contrast, stretch
 *   6 B freq, phase, off.x, y  7 B off.z, unused…
 * Row 0 is reserved as "plain" (no pattern) for creatures without a surface (legacy compare).
 */
export const SURFACE_TABLE_WIDTH = 8;
export const SURFACE_TABLE_ROWS = 1024;
/** Debug modes: 0 normal, 1 vertex colours only, 2 primary-pattern mask, 3 secondary mask. */
export type SurfaceDebugMode = 0 | 1 | 2 | 3;

class SurfaceTable {
	readonly data = new Float32Array(SURFACE_TABLE_WIDTH * SURFACE_TABLE_ROWS * 4);
	readonly texture = new DataTexture(
		this.data,
		SURFACE_TABLE_WIDTH,
		SURFACE_TABLE_ROWS,
		RGBAFormat,
		FloatType
	);
	private free: number[] = [];
	private next = 1;
	used = 0;
	constructor() {
		this.texture.minFilter = this.texture.magFilter = NearestFilter;
		this.texture.generateMipmaps = false;
		this.texture.needsUpdate = true;
	}
	allocate(): number {
		const slot = this.free.pop() ?? (this.next < SURFACE_TABLE_ROWS ? this.next++ : 0);
		if (slot) this.used++;
		return slot;
	}
	release(slot: number) {
		if (!slot) return;
		this.data.fill(0, slot * SURFACE_TABLE_WIDTH * 4, (slot + 1) * SURFACE_TABLE_WIDTH * 4);
		this.free.push(slot);
		this.used--;
		this.texture.needsUpdate = true;
	}
	private texel(slot: number, index: number, values: number[]) {
		this.data.set(values, (slot * SURFACE_TABLE_WIDTH + index) * 4);
	}
	write(
		slot: number,
		surface: CreatureSurfaceDefinition,
		lod: CreatureLod,
		bodyScale: number,
		debug: SurfaceDebugMode = 0
	) {
		if (!slot) return;
		const colour = (hex: string) => new Color().setStyle(hex, SRGBColorSpace);
		const primary = colour(surface.palette.primary),
			secondary = colour(surface.palette.secondary),
			under = colour(surface.palette.underbelly),
			accent = colour(surface.palette.accent);
		const row = (base: number, p: IndividualPattern | undefined, c: Color) => {
			if (!p) {
				for (let i = 0; i < 4; i++) this.texel(slot, base + i, [0, 0, 0, 0]);
				return;
			}
			this.texel(slot, base, [c.r, c.g, c.b, patternCode(p.type)]);
			this.texel(slot, base + 1, [
				p.scale * NOISE_FEATURE_TEXELS,
				p.density,
				p.contrast,
				p.stretch
			]);
			this.texel(slot, base + 2, [p.frequency, p.phase, p.offset[0], p.offset[1]]);
			this.texel(slot, base + 3, [p.offset[2], 0, 0, 0]);
		};
		row(0, surface.primaryPattern, secondary);
		row(
			4,
			surface.secondaryPattern,
			surface.secondaryPattern
				? patternColor(surface.secondaryPattern, primary, secondary, under, accent)
				: secondary
		);
		this.texel(slot, 3, [
			surface.primaryPattern.offset[2],
			1 / Math.max(1e-4, bodyScale),
			lod,
			debug
		]);
		this.texture.needsUpdate = true;
	}
	setDebug(slot: number, debug: SurfaceDebugMode) {
		if (!slot) return;
		this.data[(slot * SURFACE_TABLE_WIDTH + 3) * 4 + 3] = debug;
		this.texture.needsUpdate = true;
	}
}
let table: SurfaceTable | undefined;
export function creatureSurfaceTable(): SurfaceTable {
	return (table ??= new SurfaceTable());
}
