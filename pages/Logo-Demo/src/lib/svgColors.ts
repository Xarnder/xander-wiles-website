export type SvgColorPair = { darkest: string; lightest: string }

const HEX_RE = /#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b/g

const FALLBACK: SvgColorPair = { darkest: '#111111', lightest: '#eeeeee' }

function expandHex(hex: string): string {
	const h = hex.slice(1).toLowerCase()
	if (h.length === 3) {
		return `#${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}`
	}
	return `#${h}`
}

function channelLinear(c: number): number {
	const s = c / 255
	return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
}

/** Relative luminance (WCAG) for a #RRGGBB color. */
function relativeLuminance(hex: string): number {
	const n = parseInt(hex.slice(1), 16)
	const r = (n >> 16) & 0xff
	const g = (n >> 8) & 0xff
	const b = n & 0xff
	return 0.2126 * channelLinear(r) + 0.7152 * channelLinear(g) + 0.0722 * channelLinear(b)
}

export async function extractSvgColors(src: string): Promise<SvgColorPair> {
	const res = await fetch(src)
	if (!res.ok) return { ...FALLBACK }

	const text = await res.text()
	const matches = text.match(HEX_RE)
	if (!matches?.length) return { ...FALLBACK }

	const unique = [...new Set(matches.map(expandHex))]

	let darkest = unique[0]
	let lightest = unique[0]
	let minL = relativeLuminance(darkest)
	let maxL = minL

	for (let i = 1; i < unique.length; i++) {
		const color = unique[i]
		const l = relativeLuminance(color)
		if (l < minL) {
			minL = l
			darkest = color
		}
		if (l > maxL) {
			maxL = l
			lightest = color
		}
	}

	return { darkest, lightest }
}
