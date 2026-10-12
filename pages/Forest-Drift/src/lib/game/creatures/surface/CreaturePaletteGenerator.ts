import { Color, SRGBColorSpace } from 'three';
import type {
	CreaturePalette,
	CreaturePatternTone,
	IndividualGenome,
	SpeciesGenome
} from '../CreatureTypes';

/**
 * Five related colours from controlled relationships (sRGB HSL), never unrelated random RGB:
 * primary body; secondary = pattern colour derived from primary by a tone rule; a lighter, softer
 * underbelly; a contrasting accent; a dark eye. Validation clamps neon, mud, inverted bellies and
 * accents that would blend into the body.
 */
export interface ResolvedCreaturePalette {
	primary: string;
	secondary: string;
	accent: string;
	underbelly: string;
	eye: string;
}
type HSL = { h: number; s: number; l: number };
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const toHsl = (hex: string): HSL => new Color(hex).getHSL({ h: 0, s: 0, l: 0 }, SRGBColorSpace);
const toHex = (c: HSL) =>
	'#' +
	new Color()
		.setHSL(((c.h % 1) + 1) % 1, clamp(c.s, 0, 1), clamp(c.l, 0, 1), SRGBColorSpace)
		.getHexString(SRGBColorSpace);
const hueGap = (a: number, b: number) => {
	const d = Math.abs(a - b) % 1;
	return Math.min(d, 1 - d);
};

/** Pattern colour from the body colour by tone (light/dark shade, toward underbelly or accent). */
export function patternTone(
	primary: HSL,
	underbelly: HSL,
	accent: HSL,
	tone: CreaturePatternTone
): HSL {
	const mix = (a: HSL, b: HSL, t: number): HSL => {
		const dh = ((b.h - a.h + 1.5) % 1) - 0.5;
		return { h: a.h + dh * t, s: a.s + (b.s - a.s) * t, l: a.l + (b.l - a.l) * t };
	};
	let c: HSL;
	switch (tone) {
		case 'light':
			c = { h: primary.h + 0.015, s: primary.s * 0.72, l: Math.min(0.88, primary.l + 0.17) };
			break;
		case 'dark':
			c = {
				h: primary.h - 0.01,
				s: Math.min(0.85, primary.s * 1.08),
				l: Math.max(0.1, primary.l - 0.17)
			};
			break;
		case 'underbelly':
			c = mix(primary, underbelly, 0.72);
			break;
		case 'accent':
			c = mix(primary, accent, 0.68);
	}
	// Contrast safety: a pattern must read against the body.
	if (Math.abs(c.l - primary.l) < 0.09) c.l = primary.l + (primary.l > 0.5 ? -0.12 : 0.12);
	return c;
}

/** Validated palette for one individual; `tone` selects the pattern (secondary) colour rule. */
export function resolveCreaturePalette(
	species: SpeciesGenome,
	individual: Pick<IndividualGenome, 'paletteVariation'>,
	tone: CreaturePatternTone,
	underbellyBrightness = 0
): ResolvedCreaturePalette {
	const p = species.appearance.palette,
		v = individual.paletteVariation;
	const vary = (c: HSL): HSL => ({ h: c.h + v.hue, s: c.s, l: c.l + v.lightness });
	// Primary: no neon, no mud.
	const primary = vary(toHsl(p.primary));
	primary.s = clamp(primary.s, 0.18, 0.82);
	primary.l = clamp(primary.l, 0.2, 0.74);
	// Underbelly: species palettes keep the pale underside in `secondary`.
	const underbelly = vary(toHsl(p.secondary));
	underbelly.s = clamp(underbelly.s, 0.08, 0.6);
	underbelly.l = clamp(Math.max(underbelly.l, primary.l + 0.12) + underbellyBrightness, 0, 0.93);
	// Accent: must read distinctly from the body.
	const accent = vary(toHsl(p.accent));
	accent.s = clamp(accent.s, 0.25, 0.85);
	accent.l = clamp(accent.l, 0.18, 0.82);
	if (hueGap(accent.h, primary.h) < 0.07 && Math.abs(accent.l - primary.l) < 0.15)
		accent.l = clamp(primary.l + (primary.l > 0.45 ? -0.24 : 0.24), 0.15, 0.85);
	const eye = toHsl(p.eye);
	eye.l = Math.min(eye.l, 0.14);
	return {
		primary: toHex(primary),
		secondary: toHex(patternTone(primary, underbelly, accent, tone)),
		accent: toHex(accent),
		underbelly: toHex(underbelly),
		eye: toHex(eye)
	};
}

/** Controlled random palette (Lab "Randomise Palette"): related hues, warm pale underside. */
export function generateCreaturePalette(
	rng: () => number
): Pick<CreaturePalette, 'primary' | 'secondary' | 'accent' | 'eye'> {
	const h = rng();
	const scheme = [0.42, 0.5, 0.58, 0.33, -0.33, 0.11][Math.floor(rng() * 6)];
	const cream = h + (((0.125 - h + 1.5) % 1) - 0.5) * (0.55 + rng() * 0.25);
	return {
		primary: toHex({ h, s: 0.45 + rng() * 0.2, l: 0.42 + rng() * 0.16 }),
		secondary: toHex({ h: cream, s: 0.32 + rng() * 0.18, l: 0.8 + rng() * 0.07 }),
		accent: toHex({
			h: h + scheme + (rng() - 0.5) * 0.08,
			s: 0.45 + rng() * 0.2,
			l: 0.48 + rng() * 0.14
		}),
		eye: toHex({ h, s: 0.25, l: 0.08 })
	};
}

/** Palette sanity checks used by tests and Lab validation. Returns problems found. */
export function paletteIssues(palette: ResolvedCreaturePalette): string[] {
	const issues: string[] = [];
	const p = toHsl(palette.primary),
		u = toHsl(palette.underbelly),
		a = toHsl(palette.accent),
		s = toHsl(palette.secondary),
		e = toHsl(palette.eye);
	if (u.l < p.l + 0.05) issues.push('underbelly not lighter than body');
	if (hueGap(a.h, p.h) < 0.05 && Math.abs(a.l - p.l) < 0.1) issues.push('accent too close to body');
	if (Math.abs(s.l - p.l) < 0.06 && hueGap(s.h, p.h) < 0.05)
		issues.push('pattern invisible on body');
	if (p.s > 0.86 || a.s > 0.9) issues.push('oversaturated');
	if (e.l > 0.2) issues.push('eye too light');
	return issues;
}
