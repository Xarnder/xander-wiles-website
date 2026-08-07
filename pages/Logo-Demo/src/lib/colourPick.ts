import { parseColourString } from './colourFormat'
import { createCustomColour, type PaletteColour } from './svgPalette'

type EyeDropperResult = { sRGBHex: string }

type EyeDropperConstructor = new () => {
	open: (options?: { signal?: AbortSignal }) => Promise<EyeDropperResult>
}

declare global {
	interface Window {
		EyeDropper?: EyeDropperConstructor
	}
}

export function isEyeDropperSupported(): boolean {
	return typeof window !== 'undefined' && typeof window.EyeDropper === 'function'
}

/**
 * Open the system EyeDropper and return a custom palette colour.
 * Returns null if unsupported, aborted, or colour cannot be parsed.
 */
export async function pickColourWithEyeDropper(): Promise<PaletteColour | null> {
	if (!isEyeDropperSupported() || !window.EyeDropper) return null

	try {
		const dropper = new window.EyeDropper()
		const result = await dropper.open()
		const parsed = parseColourString(result.sRGBHex)
		if (!parsed) return null
		return createCustomColour(parsed.hex)
	} catch {
		// User abort or transient failure
		return null
	}
}
