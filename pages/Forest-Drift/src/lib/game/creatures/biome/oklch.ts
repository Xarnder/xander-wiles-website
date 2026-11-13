/**
 * OKLCh ↔ sRGB hex, pure math (no Three.js, no DOM), so creature coats compute identically on every
 * client and engine. OKLab lightness is perceptual: equal steps in L look like equal steps in
 * brightness, which is what species lightness steps need. Out-of-gamut colours keep their lightness
 * and hue and lose chroma (a fixed bisection, so the result is deterministic).
 */
export interface Oklch {
	/** Perceptual lightness, 0 (black) … 1 (white). */
	l: number;
	/** Chroma (colourfulness), 0 … ~0.32 for sRGB. */
	c: number;
	/** Hue in degrees, 0 … 360 (≈ 30 red, 70 orange-brown, 110 yellow, 145 green, 250 blue). */
	h: number;
}

const srgbToLinear = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const linearToSrgb = (v: number) => (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055);

function oklabToLinear(l: number, a: number, b: number): [number, number, number] {
	const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
	const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
	const s_ = l - 0.0894841775 * a - 1.291485548 * b;
	const L = l_ * l_ * l_,
		M = m_ * m_ * m_,
		S = s_ * s_ * s_;
	return [
		4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S,
		-1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S,
		-0.0041960863 * L - 0.7034186147 * M + 1.707614701 * S
	];
}

function linearToOklab(r: number, g: number, b: number): [number, number, number] {
	const l = Math.cbrt(0.4122214708 * r + 0.5363015253 * g + 0.0514459929 * b);
	const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
	const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
	return [
		0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
		1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
		0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
	];
}

function linearFor({ l, c, h }: Oklch): [number, number, number] {
	const rad = (h * Math.PI) / 180;
	return oklabToLinear(l, c * Math.cos(rad), c * Math.sin(rad));
}

const inGamut = (rgb: readonly number[]) => rgb.every((v) => v >= -1e-4 && v <= 1 + 1e-4);

/** The colour with chroma reduced (if needed) until it fits sRGB. */
export function fitGamut(colour: Oklch): Oklch {
	const l = Math.min(1, Math.max(0, colour.l));
	const fitted = { l, c: Math.max(0, colour.c), h: colour.h };
	if (inGamut(linearFor(fitted))) return fitted;
	let lo = 0,
		hi = fitted.c;
	for (let i = 0; i < 24; i++) {
		const mid = (lo + hi) / 2;
		if (inGamut(linearFor({ l, c: mid, h: colour.h }))) lo = mid;
		else hi = mid;
	}
	return { l, c: lo, h: colour.h };
}

/** `#rrggbb` for an OKLCh colour (gamut-mapped by chroma). */
export function oklchToHex(colour: Oklch): string {
	const rgb = linearFor(fitGamut(colour));
	return (
		'#' +
		rgb
			.map((v) =>
				Math.round(Math.min(1, Math.max(0, linearToSrgb(Math.min(1, Math.max(0, v))))) * 255)
					.toString(16)
					.padStart(2, '0')
			)
			.join('')
	);
}

/** OKLCh of a `#rrggbb` colour. */
export function hexToOklch(hex: string): Oklch {
	const value = parseInt(hex.slice(1, 7), 16);
	const [L, a, b] = linearToOklab(
		srgbToLinear(((value >> 16) & 255) / 255),
		srgbToLinear(((value >> 8) & 255) / 255),
		srgbToLinear((value & 255) / 255)
	);
	const h = (Math.atan2(b, a) * 180) / Math.PI;
	return { l: L, c: Math.hypot(a, b), h: (h + 360) % 360 };
}
