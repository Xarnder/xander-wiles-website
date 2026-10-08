import * as THREE from 'three';
import type { MaterialQuality, ResolvedMaterialRecipe, RgbColor } from '../ProceduralMaterialTypes';
import type {
	SurfaceShaderKind,
	SurfaceShaderQuality,
	SurfaceShaderUniforms
} from './surfaceShader';

/** Shape of a shader-laid stone surface. Sizes in metres. */
interface StoneShape {
	kind: 'coursed' | 'cellular';
	/** Coursed: nominal course height. Cellular: nominal stone size. */
	size: number;
	/** Coursed: nominal block length (unused for cellular). */
	length: number;
	jitter: number;
	/** Cellular: stone height ÷ width (flattened fieldstone < 1). */
	aspect: number;
	jointHalf: number;
	bevel: number;
	dome: number;
	proud: number;
	warp: number;
	irregularity: number;
	/** Cellular only: rounded cobbles (1) vs polygonal flags (0). */
	roundness: number;
	worn: boolean;
}

/**
 * Per-variant stone layouts for the world-scale shader — the shader-side counterpart of
 * `generators/stone.ts` (which, in anti-tiling mode, only supplies structureless stone grain).
 */
const STONE_SHAPES: Record<string, StoneShape> = {
	'masonry:dressed': {
		kind: 'coursed',
		size: 0.3,
		length: 0.75,
		jitter: 0.3,
		aspect: 1,
		jointHalf: 0.005,
		bevel: 0.012,
		dome: 0.002,
		proud: 0.006,
		warp: 0,
		irregularity: 0.15,
		roundness: 0,
		worn: false
	},
	'masonry:cut-block': {
		kind: 'coursed',
		size: 0.34,
		length: 0.68,
		jitter: 0.65,
		aspect: 1,
		jointHalf: 0.011,
		bevel: 0.035,
		dome: 0.013,
		proud: 0.007,
		warp: 0,
		irregularity: 0.6,
		roundness: 0,
		worn: false
	},
	'masonry:rough': {
		kind: 'coursed',
		size: 0.27,
		length: 0.5,
		jitter: 0.75,
		aspect: 1,
		jointHalf: 0.012,
		bevel: 0.045,
		dome: 0.012,
		proud: 0.008,
		warp: 0,
		irregularity: 0.9,
		roundness: 0,
		worn: false
	},
	'masonry:fieldstone': {
		kind: 'cellular',
		size: 0.32,
		length: 0,
		jitter: 0.95,
		aspect: 0.55,
		jointHalf: 0.016,
		bevel: 0.05,
		dome: 0.012,
		proud: 0.008,
		warp: 0.6,
		irregularity: 0.7,
		roundness: 0.45,
		worn: false
	},
	'paving:cobble': {
		kind: 'cellular',
		size: 0.22,
		length: 0,
		jitter: 0.9,
		aspect: 0.85,
		jointHalf: 0.008,
		bevel: 0.05,
		dome: 0.012,
		proud: 0.004,
		warp: 1,
		irregularity: 0.6,
		roundness: 0.85,
		worn: true
	},
	'paving:setts': {
		kind: 'coursed',
		size: 0.16,
		length: 0.26,
		jitter: 0.4,
		aspect: 1,
		jointHalf: 0.006,
		bevel: 0.02,
		dome: 0.005,
		proud: 0.006,
		warp: 0,
		irregularity: 0.3,
		roundness: 0,
		worn: true
	},
	'paving:flagstone': {
		kind: 'cellular',
		size: 0.65,
		length: 0,
		jitter: 0.9,
		aspect: 0.8,
		jointHalf: 0.007,
		bevel: 0.012,
		dome: 0.001,
		proud: 0.005,
		warp: 0.5,
		irregularity: 0.5,
		roundness: 0.12,
		worn: true
	}
};

/**
 * Which world-scale treatment a recipe gets when anti-tiling is on:
 * - masonry/paving: the full shader layout (stones are placed per pixel, never tiled);
 * - grass: ground-cover macro patches over stochastically sampled blades;
 * - plaster/ground: stochastic sampling only (no structure to preserve);
 * - timber, slate, glass: none — beams are short, slate courses must stay on the eave, and both
 *   already vary per piece/plane via `surfaceMapping.ts`.
 */
export function surfaceShaderKindFor(recipe: ResolvedMaterialRecipe): SurfaceShaderKind | null {
	if (recipe.type === 'masonry' || recipe.type === 'paving') {
		return STONE_SHAPES[`${recipe.type}:${recipe.variant}`]?.kind ?? null;
	}
	if (recipe.type === 'grass') return 'cover';
	if (recipe.type === 'plaster' || recipe.type === 'ground') return 'noTile';
	return null;
}

/** Whether the CPU texture should drop its own layout (the shader draws the stones instead). */
export function isShaderLaidOut(kind: SurfaceShaderKind | null): boolean {
	return kind === 'coursed' || kind === 'cellular';
}

export function shaderQualityFor(quality: MaterialQuality): SurfaceShaderQuality {
	return quality === 'low' ? 0 : quality === 'medium' ? 1 : 2;
}

function linear(color: RgbColor | undefined, fallback: RgbColor, target: THREE.Color): THREE.Color {
	const c = color ?? fallback;
	return target.setRGB(c[0], c[1], c[2], THREE.SRGBColorSpace);
}

/**
 * Fills shader uniforms for a recipe. `tint` is a painted colour (linear) or null; for stone it is
 * applied as a ratio to the palette's stone colour so paint keeps joints and variation intact.
 */
export function configureSurfaceUniforms(
	uniforms: SurfaceShaderUniforms,
	recipe: ResolvedMaterialRecipe,
	uvToMetres: number,
	tint: THREE.Color | null
): void {
	const seed = recipe.seed >>> 0;
	uniforms.uFsSeed.value.set(((seed & 0xffff) / 65536) * 997, ((seed >>> 16) / 65536) * 991);
	uniforms.uFsUvToMetres.value = uvToMetres;
	uniforms.uFsAmount.value.set(recipe.variation, recipe.weathering, recipe.dirt, recipe.moss);
	uniforms.uFsRoughness.value = recipe.roughness;
	uniforms.uFsTint.value.setRGB(1, 1, 1);

	const shape = STONE_SHAPES[`${recipe.type}:${recipe.variant}`];
	if (shape) {
		const scale = recipe.tileWidth / (recipe.type === 'paving' ? 3 : 2.4);
		uniforms.uFsLayout.value.set(
			shape.size * scale,
			shape.length * scale,
			shape.jitter,
			shape.aspect
		);
		uniforms.uFsProfile.value.set(shape.jointHalf, shape.bevel, shape.dome, shape.proud);
		uniforms.uFsWarp.value = shape.warp;
		uniforms.uFsIrregularity.value = shape.irregularity;
		uniforms.uFsRoundness.value = shape.roundness;
		uniforms.uFsWorn.value = shape.worn ? 1 : 0;
		const grey: RgbColor = [0.5, 0.5, 0.5];
		const colors = recipe.colors;
		linear(colors.stone, grey, uniforms.uFsStone.value);
		linear(colors.dark, grey, uniforms.uFsStoneDark.value);
		linear(colors.light, grey, uniforms.uFsStoneLight.value);
		linear(colors.mortar ?? colors.joint, grey, uniforms.uFsJoint.value);
		if (colors.dirt) linear(colors.dirt, grey, uniforms.uFsDirt.value);
		else linear(colors.joint, grey, uniforms.uFsDirt.value).multiplyScalar(0.6);
		linear(colors.moss, grey, uniforms.uFsMoss.value);
		if (tint) {
			const stone = uniforms.uFsStone.value;
			uniforms.uFsTint.value.setRGB(tint.r / stone.r, tint.g / stone.g, tint.b / stone.b);
		}
	}
}
