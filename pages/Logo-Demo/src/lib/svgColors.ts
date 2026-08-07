import { extractPalette, FALLBACK_EXTREMES } from './svgPalette'

export type SvgColorPair = { darkest: string; lightest: string }

/**
 * Lightest / darkest colours from an SVG (for company-name tinting).
 * Delegates to the shared palette extractor.
 */
export async function extractSvgColors(src: string): Promise<SvgColorPair> {
	try {
		const palette = await extractPalette(src)
		return {
			darkest: palette.darkest || FALLBACK_EXTREMES.darkest,
			lightest: palette.lightest || FALLBACK_EXTREMES.lightest,
		}
	} catch {
		return { ...FALLBACK_EXTREMES }
	}
}
