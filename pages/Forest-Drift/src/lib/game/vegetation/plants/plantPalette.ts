/**
 * Coherent plant palettes from a few HSL relationships — never independent raw RGB picks. A palette
 * starts from a colour family (white, yellow, orange, pink, red, purple, blue, rare fantasy) and
 * derives everything else from it: the petal tip as a lighter / whiter / neighbouring-hue version
 * of the base, a centre that contrasts with the petals, and foliage from a plausible green range
 * (or, for fantasy species, purple or teal foliage). Output is linear RGB, ready for shaders.
 */
import type { RgbColor } from '../../materials/ProceduralMaterialTypes';
import type { ColourFamily, PlantFamily, PlantPaletteDefinition } from './PlantTypes';

export type Random = () => number;

const range = (random: Random, min: number, max: number) => min + random() * (max - min);
const wrapHue = (h: number) => ((h % 360) + 360) % 360;

function srgbToLinear(c: number): number {
	return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** HSL (h degrees, s/l 0..1, sRGB) → linear RGB. */
export function hslToLinear(h: number, s: number, l: number): RgbColor {
	const sat = Math.min(1, Math.max(0, s));
	const light = Math.min(1, Math.max(0, l));
	const c = (1 - Math.abs(2 * light - 1)) * sat;
	const hp = wrapHue(h) / 60;
	const x = c * (1 - Math.abs((hp % 2) - 1));
	const [r1, g1, b1] =
		hp < 1
			? [c, x, 0]
			: hp < 2
				? [x, c, 0]
				: hp < 3
					? [0, c, x]
					: hp < 4
						? [0, x, c]
						: hp < 5
							? [x, 0, c]
							: [c, 0, x];
	const m = light - c / 2;
	return [srgbToLinear(r1 + m), srgbToLinear(g1 + m), srgbToLinear(b1 + m)];
}

/** Relative luminance of a linear colour. */
export function luminance(c: RgbColor): number {
	return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

interface Hsl {
	h: number;
	s: number;
	l: number;
}

/** Petal base HSL for a colour family. */
function petalBase(family: ColourFamily, random: Random): Hsl {
	switch (family) {
		case 'white':
			return {
				h: range(random, 35, 70),
				s: range(random, 0.15, 0.4),
				l: range(random, 0.86, 0.94)
			};
		case 'yellow':
			return {
				h: range(random, 44, 57),
				s: range(random, 0.78, 0.95),
				l: range(random, 0.52, 0.62)
			};
		case 'orange':
			return { h: range(random, 20, 36), s: range(random, 0.8, 0.95), l: range(random, 0.5, 0.58) };
		case 'pink':
			return {
				h: range(random, 318, 350),
				s: range(random, 0.5, 0.75),
				l: range(random, 0.7, 0.8)
			};
		case 'red':
			return {
				h: wrapHue(range(random, -10, 8)),
				s: range(random, 0.7, 0.88),
				l: range(random, 0.42, 0.5)
			};
		case 'purple':
			return {
				h: range(random, 262, 300),
				s: range(random, 0.45, 0.7),
				l: range(random, 0.45, 0.6)
			};
		case 'blue':
			return {
				h: range(random, 205, 235),
				s: range(random, 0.55, 0.8),
				l: range(random, 0.5, 0.64)
			};
		case 'fantasy': {
			const hues = [176, 188, 300, 312, 82, 158];
			return {
				h: hues[Math.floor(random() * hues.length)],
				s: range(random, 0.82, 0.95),
				l: range(random, 0.55, 0.64)
			};
		}
	}
}

/** Weighted colour family for a plant family — bells lean blue/purple, spikes purple/pink, … */
export function pickColourFamily(family: PlantFamily, random: Random): ColourFamily {
	const weights: Record<ColourFamily, number> = {
		white: 2,
		yellow: 2.4,
		orange: 1,
		pink: 1.8,
		red: 1,
		purple: 1.8,
		blue: 1.2,
		fantasy: 0.22
	};
	if (family === 'bell-flower') {
		weights.blue *= 2.5;
		weights.purple *= 1.6;
		weights.yellow *= 0.4;
	} else if (family === 'spike-flower') {
		weights.purple *= 2;
		weights.pink *= 1.5;
	} else if (family === 'orb-flower') {
		weights.purple *= 1.6;
		weights.white *= 1.3;
		weights.blue *= 1.4;
	} else if (family === 'star-flower') {
		weights.white *= 1.6;
		weights.blue *= 1.4;
	} else if (family === 'clover') {
		weights.white *= 3;
		weights.pink *= 2;
		weights.fantasy = 0.05;
	}
	const entries = Object.entries(weights) as [ColourFamily, number][];
	const total = entries.reduce((sum, [, w]) => sum + w, 0);
	let target = random() * total;
	for (const [name, w] of entries) {
		target -= w;
		if (target < 0) return name;
	}
	return 'yellow';
}

/** Foliage HSL for a plant family (fantasy species may get purple or teal foliage). */
function leafBase(family: PlantFamily, colour: ColourFamily, random: Random): Hsl {
	if (colour === 'fantasy' && random() < 0.6) {
		return random() < 0.5
			? { h: range(random, 262, 290), s: range(random, 0.28, 0.42), l: range(random, 0.4, 0.5) }
			: { h: range(random, 160, 180), s: range(random, 0.35, 0.5), l: range(random, 0.42, 0.52) };
	}
	switch (family) {
		case 'succulent':
			return {
				h: range(random, 140, 172),
				s: range(random, 0.18, 0.34),
				l: range(random, 0.56, 0.68)
			};
		case 'fern':
			return {
				h: range(random, 92, 124),
				s: range(random, 0.4, 0.6),
				l: range(random, 0.42, 0.52)
			};
		case 'clover':
			return {
				h: range(random, 98, 122),
				s: range(random, 0.38, 0.55),
				l: range(random, 0.44, 0.52)
			};
		case 'ground-tuft':
			return { h: range(random, 70, 95), s: range(random, 0.32, 0.5), l: range(random, 0.48, 0.6) };
		case 'broadleaf':
			return {
				h: range(random, 100, 135),
				s: range(random, 0.35, 0.55),
				l: range(random, 0.38, 0.48)
			};
		default:
			return {
				h: range(random, 82, 140),
				s: range(random, 0.32, 0.58),
				l: range(random, 0.4, 0.54)
			};
	}
}

/** A centre that contrasts with the petals: yellow eye on cool petals, dark eye on warm ones. */
function centreFor(colour: ColourFamily, petal: Hsl, random: Random): Hsl {
	const style = random();
	if (colour === 'yellow' || colour === 'orange' || colour === 'red') {
		return style < 0.6
			? { h: range(random, 18, 32), s: range(random, 0.5, 0.75), l: range(random, 0.12, 0.22) }
			: { h: range(random, 40, 52), s: 0.85, l: range(random, 0.42, 0.5) };
	}
	if (colour === 'fantasy') return { h: wrapHue(petal.h + 180), s: 0.9, l: 0.6 };
	return style < 0.7
		? { h: range(random, 44, 56), s: range(random, 0.8, 0.95), l: range(random, 0.5, 0.6) }
		: { h: petal.h, s: petal.s, l: Math.max(0.12, petal.l - 0.35) };
}

export function generatePlantPalette(
	family: PlantFamily,
	colour: ColourFamily,
	random: Random
): PlantPaletteDefinition {
	const base = petalBase(colour, random);
	// Tip: lighter, whitening, or a neighbouring hue (a bicolour flower) — always related to the base.
	const tipStyle = random();
	const tip: Hsl =
		tipStyle < 0.45
			? { h: base.h, s: base.s * 0.85, l: Math.min(0.95, base.l + range(random, 0.06, 0.16)) }
			: tipStyle < 0.75
				? { h: base.h, s: base.s * 0.35, l: Math.min(0.96, base.l + 0.25) }
				: {
						h: wrapHue(base.h + (random() < 0.5 ? -1 : 1) * range(random, 18, 40)),
						s: base.s,
						l: base.l + 0.04
					};
	const centre = centreFor(colour, base, random);
	const leaf = leafBase(family, colour, random);
	const leafTip: Hsl = {
		h: leaf.h - range(random, 0, 14),
		s: leaf.s * 0.92,
		l: leaf.l + range(random, 0.04, 0.1)
	};
	// Stems: the leaf colour, a little yellower and darker (succulents and fantasy plants keep theirs).
	const stem: Hsl = { h: leaf.h - 10, s: leaf.s * 0.9, l: leaf.l * 0.9 };
	return {
		family: colour,
		petalBase: hslToLinear(base.h, base.s, base.l),
		petalTip: hslToLinear(tip.h, tip.s, tip.l),
		centre: hslToLinear(centre.h, centre.s, centre.l),
		stem: hslToLinear(stem.h, stem.s, stem.l),
		leafBase: hslToLinear(leaf.h, leaf.s, leaf.l),
		leafTip: hslToLinear(leafTip.h, leafTip.s, leafTip.l)
	};
}

/** Problems with a palette (empty when valid): out-of-range channels, flowers lost in their leaves. */
export function paletteIssues(palette: PlantPaletteDefinition, flowering: boolean): string[] {
	const issues: string[] = [];
	for (const [name, colour] of Object.entries(palette)) {
		if (name === 'family') continue;
		const c = colour as RgbColor;
		if (c.length !== 3 || c.some((v) => !Number.isFinite(v) || v < 0 || v > 1))
			issues.push(`${name} out of range`);
	}
	if (flowering) {
		const petal = luminance(palette.petalBase);
		const leaf = luminance(palette.leafBase);
		const hueContrast =
			Math.abs(palette.petalBase[0] - palette.leafBase[0]) +
			Math.abs(palette.petalBase[2] - palette.leafBase[2]);
		if (Math.abs(petal - leaf) < 0.04 && hueContrast < 0.12)
			issues.push('petals indistinguishable from leaves');
	}
	return issues;
}
