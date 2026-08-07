/**
 * Layout metrics matching App.svelte desktop mark composition:
 * logo height 140×scale, max-width 220×scale, gap 1.25rem, text 3rem×scale.
 */

export const UI_LAYOUT = {
	logoBaseHeightPx: 140,
	logoMaxWidthPx: 220,
	/** 1.25rem at 16px root */
	gapPx: 20,
	/** 3rem at 16px root */
	textBaseFontPx: 48,
	textLineHeight: 1.1,
	textLetterSpacingEm: -0.03,
	textMaxWidthPx: 420,
	textWeight: 500,
} as const

export type LayoutScales = {
	logoScale: number
	textScale: number
}

export type LogoBoxMetrics = {
	naturalWidth: number
	naturalHeight: number
	/** CSS layout box (img element). */
	boxWidth: number
	boxHeight: number
	/** Painted mark inside the box after object-fit: contain. */
	visualWidth: number
	visualHeight: number
	aspectRatio: number
}

export type TextBoxMetrics = {
	text: string
	fontSize: number
	/** Approximate advance width with letter-spacing. */
	width: number
	/** line-height box height. */
	height: number
	/** Glyph ink height when available. */
	glyphHeight: number
	aspectRatio: number
	maxWidth: number
	truncated: boolean
}

export type MarkLayoutMetrics = {
	scales: LayoutScales
	logo: LogoBoxMetrics
	text: TextBoxMetrics | null
	gap: number
	/** Logo visual left → text left. */
	logoToText: number
	overallWidth: number
	overallHeight: number
	ratios: {
		logoWidthToHeight: number
		logoHeightToWidth: number
		textWidthToHeight: number | null
		textHeightToWidth: number | null
		logoHeightToTextHeight: number | null
		textHeightToLogoHeight: number | null
		logoWidthToTextWidth: number | null
		gapToLogoHeight: number
		gapToTextHeight: number | null
		logoScalePct: number
		textScalePct: number
		textToLogoScale: number
	}
}

function clampScale(n: number): number {
	if (!Number.isFinite(n) || n <= 0) return 1
	return Math.min(2, Math.max(0.5, n))
}

export function computeLogoBoxMetrics(
	naturalWidth: number,
	naturalHeight: number,
	logoScale: number,
): LogoBoxMetrics {
	const scale = clampScale(logoScale)
	const nw = Math.max(1, naturalWidth)
	const nh = Math.max(1, naturalHeight)
	const aspectRatio = nw / nh
	const boxHeight = UI_LAYOUT.logoBaseHeightPx * scale
	const maxW = UI_LAYOUT.logoMaxWidthPx * scale
	const boxWidth = Math.min(boxHeight * aspectRatio, maxW)
	const fit = Math.min(boxWidth / nw, boxHeight / nh)
	return {
		naturalWidth: nw,
		naturalHeight: nh,
		boxWidth,
		boxHeight,
		visualWidth: nw * fit,
		visualHeight: nh * fit,
		aspectRatio,
	}
}

export async function loadImageNaturalSize(
	src: string,
): Promise<{ width: number; height: number } | null> {
	return await new Promise((resolve) => {
		const img = new Image()
		img.onload = () => {
			resolve({
				width: Math.max(1, img.naturalWidth || img.width),
				height: Math.max(1, img.naturalHeight || img.height),
			})
		}
		img.onerror = () => resolve(null)
		img.src = src
	})
}

async function waitForFont(fontFamily: string, fontSize: number): Promise<void> {
	try {
		if (typeof document === 'undefined' || !document.fonts) return
		await document.fonts.load(`${UI_LAYOUT.textWeight} ${fontSize}px ${fontFamily}`)
		await document.fonts.ready
	} catch {
		// fall through
	}
}

/** Measure company-name text the way the UI lays it out. */
export async function measureTextBox(
	text: string,
	fontFamily: string,
	textScale: number,
): Promise<TextBoxMetrics | null> {
	const trimmed = text.trim()
	if (!trimmed || !fontFamily) return null

	const scale = clampScale(textScale)
	const fontSize = UI_LAYOUT.textBaseFontPx * scale
	const maxWidth = UI_LAYOUT.textMaxWidthPx * scale
	await waitForFont(fontFamily, fontSize)

	try {
		const canvas = document.createElement('canvas')
		const ctx = canvas.getContext('2d')
		if (!ctx) return null
		ctx.font = `${UI_LAYOUT.textWeight} ${fontSize}px ${fontFamily}`
		const metrics = ctx.measureText(trimmed)
		const spacing = fontSize * UI_LAYOUT.textLetterSpacingEm
		// letter-spacing applies between characters (n-1 gaps)
		const spacedWidth =
			metrics.width + Math.max(0, trimmed.length - 1) * spacing
		const truncated = spacedWidth > maxWidth
		const width = truncated ? maxWidth : spacedWidth
		const height = fontSize * UI_LAYOUT.textLineHeight
		const ascent = metrics.actualBoundingBoxAscent
		const descent = metrics.actualBoundingBoxDescent
		const glyphHeight =
			Number.isFinite(ascent) && Number.isFinite(descent) && ascent + descent > 0
				? ascent + descent
				: fontSize
		return {
			text: trimmed,
			fontSize,
			width,
			height,
			glyphHeight,
			aspectRatio: width / height,
			maxWidth,
			truncated,
		}
	} catch {
		return null
	}
}

export function buildMarkLayoutMetrics(
	logo: LogoBoxMetrics,
	text: TextBoxMetrics | null,
	scales: LayoutScales,
): MarkLayoutMetrics {
	const logoScale = clampScale(scales.logoScale)
	const textScale = clampScale(scales.textScale)
	const gap = UI_LAYOUT.gapPx
	const textW = text?.width ?? 0
	const textH = text?.height ?? 0
	const overallWidth = logo.boxWidth + (text ? gap + textW : 0)
	const overallHeight = Math.max(logo.boxHeight, textH || 0)

	const ratio = (a: number, b: number) => (b === 0 ? 0 : a / b)

	return {
		scales: { logoScale, textScale },
		logo,
		text,
		gap,
		logoToText: gap,
		overallWidth,
		overallHeight,
		ratios: {
			logoWidthToHeight: ratio(logo.visualWidth, logo.visualHeight),
			logoHeightToWidth: ratio(logo.visualHeight, logo.visualWidth),
			textWidthToHeight: text ? ratio(text.width, text.height) : null,
			textHeightToWidth: text ? ratio(text.height, text.width) : null,
			logoHeightToTextHeight: text ? ratio(logo.visualHeight, text.height) : null,
			textHeightToLogoHeight: text ? ratio(text.height, logo.visualHeight) : null,
			logoWidthToTextWidth: text ? ratio(logo.visualWidth, text.width) : null,
			gapToLogoHeight: ratio(gap, logo.visualHeight),
			gapToTextHeight: text ? ratio(gap, text.height) : null,
			logoScalePct: Math.round(logoScale * 100),
			textScalePct: Math.round(textScale * 100),
			textToLogoScale: ratio(textScale, logoScale),
		},
	}
}

export async function measureMarkLayout(input: {
	logoSrc: string
	companyName: string
	fontFamily: string
	logoScale: number
	textScale: number
	fallbackAspect?: number
}): Promise<MarkLayoutMetrics> {
	const natural = await loadImageNaturalSize(input.logoSrc)
	const aspect = input.fallbackAspect && input.fallbackAspect > 0 ? input.fallbackAspect : 1
	const logo = computeLogoBoxMetrics(
		natural?.width ?? 100 * aspect,
		natural?.height ?? 100,
		input.logoScale,
	)
	const text = await measureTextBox(input.companyName, input.fontFamily, input.textScale)
	return buildMarkLayoutMetrics(logo, text, {
		logoScale: input.logoScale,
		textScale: input.textScale,
	})
}

export function formatPx(n: number): string {
	const r = Math.round(n * 10) / 10
	return Number.isInteger(r) ? `${r}px` : `${r.toFixed(1)}px`
}

export function formatRatio(n: number | null | undefined): string {
	if (n == null || !Number.isFinite(n)) return '—'
	if (Math.abs(n - 1) < 0.005) return '1 : 1'
	if (n >= 1) return `${n.toFixed(2)} : 1`
	return `1 : ${(1 / n).toFixed(2)}`
}

export function formatRatioPair(a: number, b: number): string {
	if (!Number.isFinite(a) || !Number.isFinite(b) || b === 0) return '—'
	const r = a / b
	if (r >= 1) return `${r.toFixed(2)} : 1`
	return `1 : ${(1 / r).toFixed(2)}`
}
