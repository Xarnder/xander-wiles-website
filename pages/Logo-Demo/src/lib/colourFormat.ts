export type Rgb = { r: number; g: number; b: number }

export type ParsedColour = {
	hex: string
	rgb: Rgb
}

const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/
const RGB_RE =
	/^rgba?\(\s*([0-9.]+%?)\s*[, ]\s*([0-9.]+%?)\s*[, ]\s*([0-9.]+%?)(?:\s*[,/]\s*([0-9.]+%?))?\s*\)$/i

function clampByte(n: number): number {
	return Math.min(255, Math.max(0, Math.round(n)))
}

function parseChannel(raw: string): number | null {
	const t = raw.trim()
	if (!t) return null
	if (t.endsWith('%')) {
		const p = Number.parseFloat(t.slice(0, -1))
		if (!Number.isFinite(p)) return null
		return clampByte((p / 100) * 255)
	}
	const n = Number.parseFloat(t)
	if (!Number.isFinite(n)) return null
	return clampByte(n)
}

function parseAlpha(raw: string | undefined): number {
	if (raw == null || raw === '') return 1
	const t = raw.trim()
	if (t.endsWith('%')) {
		const p = Number.parseFloat(t.slice(0, -1))
		if (!Number.isFinite(p)) return 1
		return Math.min(1, Math.max(0, p / 100))
	}
	const n = Number.parseFloat(t)
	if (!Number.isFinite(n)) return 1
	return Math.min(1, Math.max(0, n))
}

/** Composite translucent RGB onto white → opaque. */
export function compositeOnWhite(r: number, g: number, b: number, alpha: number): Rgb {
	const a = Math.min(1, Math.max(0, alpha))
	return {
		r: clampByte(r * a + 255 * (1 - a)),
		g: clampByte(g * a + 255 * (1 - a)),
		b: clampByte(b * a + 255 * (1 - a)),
	}
}

export function rgbToHex(rgb: Rgb): string {
	const h =
		((clampByte(rgb.r) << 16) | (clampByte(rgb.g) << 8) | clampByte(rgb.b))
			.toString(16)
			.padStart(6, '0')
			.toUpperCase()
	return `#${h}`
}

export function hexToRgb(hex: string): Rgb | null {
	const expanded = expandHex(hex)
	if (!expanded) return null
	const n = Number.parseInt(expanded.slice(1), 16)
	return {
		r: (n >> 16) & 0xff,
		g: (n >> 8) & 0xff,
		b: n & 0xff,
	}
}

/** Expand #RGB / #RRGGBB / #RRGGBBAA → uppercase #RRGGBB (alpha composited on white). */
export function expandHex(hex: string): string | null {
	const m = hex.trim().match(HEX_RE)
	if (!m) return null
	const h = m[1]
	if (h.length === 3) {
		return `#${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}`.toUpperCase()
	}
	if (h.length === 6) {
		return `#${h}`.toUpperCase()
	}
	// 8-digit: RRGGBBAA
	const r = Number.parseInt(h.slice(0, 2), 16)
	const g = Number.parseInt(h.slice(2, 4), 16)
	const b = Number.parseInt(h.slice(4, 6), 16)
	const a = Number.parseInt(h.slice(6, 8), 16) / 255
	return rgbToHex(compositeOnWhite(r, g, b, a))
}

export function formatRgbCss(rgb: Rgb): string {
	return `rgb(${clampByte(rgb.r)}, ${clampByte(rgb.g)}, ${clampByte(rgb.b)})`
}

export type Hsl = { h: number; s: number; l: number }

export type Oklch = { l: number; c: number; h: number }

/** Convert sRGB 0–255 to HSL (h: 0–360, s/l: 0–100). */
export function rgbToHsl(rgb: Rgb): Hsl {
	const r = clampByte(rgb.r) / 255
	const g = clampByte(rgb.g) / 255
	const b = clampByte(rgb.b) / 255
	const max = Math.max(r, g, b)
	const min = Math.min(r, g, b)
	const l = (max + min) / 2
	if (max === min) {
		return { h: 0, s: 0, l: l * 100 }
	}
	const d = max - min
	const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
	let h = 0
	switch (max) {
		case r:
			h = ((g - b) / d + (g < b ? 6 : 0)) / 6
			break
		case g:
			h = ((b - r) / d + 2) / 6
			break
		default:
			h = ((r - g) / d + 4) / 6
			break
	}
	return { h: h * 360, s: s * 100, l: l * 100 }
}

export function formatHslCss(rgb: Rgb): string {
	const { h, s, l } = rgbToHsl(rgb)
	return `hsl(${Math.round(h)} ${Math.round(s)}% ${Math.round(l)}%)`
}

/** sRGB → OKLCH via OKLab (Björn Ottosson). L 0–1, C ≥ 0, h 0–360. */
export function rgbToOklch(rgb: Rgb): Oklch {
	const r = channelLinear(rgb.r)
	const g = channelLinear(rgb.g)
	const b = channelLinear(rgb.b)

	const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b
	const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b
	const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b

	const l_ = Math.cbrt(l)
	const m_ = Math.cbrt(m)
	const s_ = Math.cbrt(s)

	const L = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_
	const a = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_
	const bOk = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_

	const C = Math.sqrt(a * a + bOk * bOk)
	let h = (Math.atan2(bOk, a) * 180) / Math.PI
	if (h < 0) h += 360
	if (C < 1e-8) h = 0

	return { l: L, c: C, h }
}

/** CSS `oklch()` with percentage lightness, e.g. oklch(62.8% 0.151 254.1). */
export function formatOklchCss(rgb: Rgb): string {
	const { l, c, h } = rgbToOklch(rgb)
	const lp = (l * 100).toFixed(1)
	const cp = Number(c.toFixed(3))
	const hp = cp < 0.0005 ? '0' : h.toFixed(1)
	return `oklch(${lp}% ${cp.toFixed(3)} ${hp})`
}

/**
 * Parse a CSS/SVG colour string into opaque #RRGGBB.
 * Supports hex and rgb/rgba. Returns null for unsupported values.
 */
export function parseColourString(raw: string): ParsedColour | null {
	const value = raw.trim()
	if (!value || value === 'none' || value === 'transparent') return null
	if (value === 'currentColor' || value === 'inherit' || value === 'context-fill' || value === 'context-stroke') {
		return null
	}

	if (value.startsWith('#')) {
		const hex = expandHex(value)
		if (!hex) return null
		const rgb = hexToRgb(hex)
		if (!rgb) return null
		return { hex, rgb }
	}

	const rgbMatch = value.match(RGB_RE)
	if (rgbMatch) {
		const r = parseChannel(rgbMatch[1])
		const g = parseChannel(rgbMatch[2])
		const b = parseChannel(rgbMatch[3])
		if (r == null || g == null || b == null) return null
		const alpha = parseAlpha(rgbMatch[4])
		const opaque = alpha < 1 ? compositeOnWhite(r, g, b, alpha) : { r, g, b }
		const hex = rgbToHex(opaque)
		return { hex, rgb: opaque }
	}

	return null
}

function channelLinear(c: number): number {
	const s = c / 255
	return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
}

/** Relative luminance (WCAG) for a #RRGGBB color. */
export function relativeLuminance(hex: string): number {
	const rgb = hexToRgb(hex)
	if (!rgb) return 0
	return (
		0.2126 * channelLinear(rgb.r) +
		0.7152 * channelLinear(rgb.g) +
		0.0722 * channelLinear(rgb.b)
	)
}

export function saturation(rgb: Rgb): number {
	const max = Math.max(rgb.r, rgb.g, rgb.b) / 255
	const min = Math.min(rgb.r, rgb.g, rgb.b) / 255
	if (max === min) return 0
	const l = (max + min) / 2
	const d = max - min
	return l > 0.5 ? d / (2 - max - min) : d / (max + min)
}

/** Euclidean RGB distance (0–≈441). Near-dupe threshold ≈ 18. */
export function rgbDistance(a: Rgb, b: Rgb): number {
	const dr = a.r - b.r
	const dg = a.g - b.g
	const db = a.b - b.b
	return Math.sqrt(dr * dr + dg * dg + db * db)
}

export const NEAR_DUPE_RGB_DISTANCE = 18

export async function copyText(text: string): Promise<boolean> {
	try {
		await navigator.clipboard.writeText(text)
		return true
	} catch {
		try {
			const ta = document.createElement('textarea')
			ta.value = text
			ta.setAttribute('readonly', '')
			ta.style.position = 'fixed'
			ta.style.left = '-9999px'
			document.body.appendChild(ta)
			ta.select()
			const ok = document.execCommand('copy')
			document.body.removeChild(ta)
			return ok
		} catch {
			return false
		}
	}
}
