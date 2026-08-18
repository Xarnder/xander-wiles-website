import JSZip from 'jszip'
import {
	formatPx,
	formatRatio,
	formatRatioPair,
	measureMarkLayout,
	UI_LAYOUT,
	type MarkLayoutMetrics,
} from './layoutMetrics'

export type LogoPngExportInput = {
	logoSrc: string
	logoLabel: string
	companyName: string
	fontName?: string
	fontFamily: string
	logoScale: number
	textScale: number
	/** Company-name colour on light / white / alpha (matches UI white panel). */
	textColorOnLight: string
	/** Company-name colour on dark / black (matches UI black panel). */
	textColorOnDark: string
	/** Render multiplier vs preview CSS pixels. Default 2; use 8 for print-quality. */
	scale?: number
}

export type PngBackground = 'white' | 'black' | 'alpha'

export const PNG_EXPORT = {
	/** CSS-pixel padding around the lockup. */
	paddingPx: 24,
	/** Standard export: crisp on screen, ratios match the preview. */
	scale: 2,
	/** High-resolution export (print / large placement). */
	highResScale: 8,
} as const

export type ExportCanvasSize = {
	cssWidth: number
	cssHeight: number
	pixelWidth: number
	pixelHeight: number
	padding: number
	scale: number
}

export function sanitizeFilenamePart(value: string): string {
	return (
		value
			.trim()
			.replace(/[^a-zA-Z0-9-_]+/g, '-')
			.replace(/-+/g, '-')
			.replace(/^-|-$/g, '')
			.slice(0, 48) || 'logo'
	)
}

export function todayStamp(date = new Date()): string {
	const y = date.getFullYear()
	const m = String(date.getMonth() + 1).padStart(2, '0')
	const day = String(date.getDate()).padStart(2, '0')
	return `${y}-${m}-${day}`
}

export function computeExportCanvasSize(
	layout: MarkLayoutMetrics,
	padding: number = PNG_EXPORT.paddingPx,
	scale: number = PNG_EXPORT.scale,
): ExportCanvasSize {
	const cssWidth = Math.max(1, Math.ceil(layout.overallWidth + padding * 2))
	const cssHeight = Math.max(1, Math.ceil(layout.overallHeight + padding * 2))
	return {
		cssWidth,
		cssHeight,
		pixelWidth: cssWidth * scale,
		pixelHeight: cssHeight * scale,
		padding,
		scale,
	}
}

export function buildLayoutManifest(
	layout: MarkLayoutMetrics,
	input: Pick<LogoPngExportInput, 'companyName' | 'fontName' | 'fontFamily' | 'logoLabel'>,
	canvas: ExportCanvasSize,
) {
	const text = layout.text
	return {
		logo: input.logoLabel,
		companyName: input.companyName.trim() || null,
		font: input.fontName?.trim() || null,
		fontFamily: input.fontFamily,
		scales: {
			logo: `${layout.ratios.logoScalePct}%`,
			text: `${layout.ratios.textScalePct}%`,
		},
		sizes: {
			logoBox: {
				width: formatPx(layout.logo.boxWidth),
				height: formatPx(layout.logo.boxHeight),
			},
			logoArt: {
				width: formatPx(layout.logo.visualWidth),
				height: formatPx(layout.logo.visualHeight),
			},
			text: text
				? {
						width: formatPx(text.width) + (text.truncated ? ' (max)' : ''),
						height: formatPx(text.height),
						fontSize: formatPx(text.fontSize),
						glyphHeight: formatPx(text.glyphHeight),
					}
				: null,
			gap: formatPx(layout.gap),
			overall: {
				width: formatPx(layout.overallWidth),
				height: formatPx(layout.overallHeight),
			},
			export: {
				padding: formatPx(canvas.padding),
				scale: canvas.scale,
				css: `${canvas.cssWidth} × ${canvas.cssHeight} px`,
				png: `${canvas.pixelWidth} × ${canvas.pixelHeight} px`,
			},
		},
		ratios: {
			logoWH: formatRatioPair(layout.logo.visualWidth, layout.logo.visualHeight),
			logoBoxWH: formatRatioPair(layout.logo.boxWidth, layout.logo.boxHeight),
			textWH: text ? formatRatioPair(text.width, text.height) : null,
			logoHToTextH: formatRatio(layout.ratios.logoHeightToTextHeight),
			logoWToTextW: formatRatio(layout.ratios.logoWidthToTextWidth),
			gapToLogoH: formatRatio(layout.ratios.gapToLogoHeight),
			textScaleToLogoScale: formatRatio(layout.ratios.textToLogoScale),
			overallWH: formatRatioPair(layout.overallWidth, layout.overallHeight),
		},
		note: `Sizes match the desktop preview lockup (140px logo base, 3rem text, 1.25rem gap). PNG is rendered at ${canvas.scale}×.`,
	}
}

/**
 * Give an SVG explicit pixel size so the browser rasterizes it sharply
 * instead of at the default ~300×150 intrinsic size.
 */
export function sizeSvgMarkup(markup: string, width: number, height: number): string | null {
	if (!/<svg[\s>]/i.test(markup)) return null
	const w = Math.max(1, Math.round(width))
	const h = Math.max(1, Math.round(height))
	return markup.replace(/<svg\b([^>]*)>/i, (_full, attrs: string) => {
		const cleaned = String(attrs)
			.replace(/\s(?:width|height)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
			.trimEnd()
		const pad = cleaned.length > 0 && !cleaned.endsWith(' ') ? ' ' : ''
		return `<svg${cleaned}${pad}width="${w}" height="${h}">`
	})
}

function loadImage(src: string): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const img = new Image()
		img.onload = () => resolve(img)
		img.onerror = () => reject(new Error('Could not load logo image'))
		img.src = src
	})
}

/** Rasterize the logo (SVG upscaled when possible) at the export pixel size. */
async function loadLogoForExport(
	src: string,
	pixelWidth: number,
	pixelHeight: number,
): Promise<{ img: HTMLImageElement; revoke?: () => void }> {
	try {
		const res = await fetch(src)
		const text = await res.text()
		const sized = sizeSvgMarkup(text, pixelWidth, pixelHeight)
		if (!sized) return { img: await loadImage(src) }
		const blob = new Blob([sized], { type: 'image/svg+xml' })
		const url = URL.createObjectURL(blob)
		try {
			return { img: await loadImage(url), revoke: () => URL.revokeObjectURL(url) }
		} catch {
			URL.revokeObjectURL(url)
			return { img: await loadImage(src) }
		}
	} catch {
		return { img: await loadImage(src) }
	}
}

function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
	return new Promise((resolve, reject) => {
		canvas.toBlob((blob) => {
			if (blob) resolve(blob)
			else reject(new Error('Could not encode PNG'))
		}, 'image/png')
	})
}

function downloadBlob(blob: Blob, filename: string) {
	const url = URL.createObjectURL(blob)
	const a = document.createElement('a')
	a.href = url
	a.download = filename
	a.rel = 'noopener'
	a.style.display = 'none'
	document.body.append(a)
	a.click()
	a.remove()
	window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/**
 * Draw CSS-like letter-spacing (-0.03em) and optional ellipsis to match `.name`.
 * Advances use prefix-width differences so kerning is preserved.
 */
export function drawSpacedText(
	ctx: CanvasRenderingContext2D,
	text: string,
	x: number,
	y: number,
	letterSpacing: number,
	maxWidth: number,
): void {
	if (!text) return

	const fullAdvance = (s: string) => {
		if (!s) return 0
		const base = ctx.measureText(s).width
		return base + Math.max(0, [...s].length - 1) * letterSpacing
	}

	let display = text
	if (fullAdvance(display) > maxWidth) {
		const ellipsis = '…'
		const chars = [...text]
		display = ellipsis
		for (let i = 1; i <= chars.length; i++) {
			const candidate = chars.slice(0, i).join('') + ellipsis
			if (fullAdvance(candidate) > maxWidth) break
			display = candidate
		}
	}

	const chars = [...display]
	let cx = x
	for (let i = 0; i < chars.length; i++) {
		ctx.fillText(chars[i], cx, y)
		const before = ctx.measureText(chars.slice(0, i).join('')).width
		const after = ctx.measureText(chars.slice(0, i + 1).join('')).width
		cx += after - before + (i < chars.length - 1 ? letterSpacing : 0)
	}
}

function fillBackground(
	ctx: CanvasRenderingContext2D,
	width: number,
	height: number,
	background: PngBackground,
) {
	ctx.clearRect(0, 0, width, height)
	if (background === 'white') {
		ctx.fillStyle = '#ffffff'
		ctx.fillRect(0, 0, width, height)
	} else if (background === 'black') {
		ctx.fillStyle = '#000000'
		ctx.fillRect(0, 0, width, height)
	}
}

function textColorFor(background: PngBackground, input: LogoPngExportInput): string {
	if (background === 'black') return input.textColorOnDark
	return input.textColorOnLight
}

function renderLockup(
	ctx: CanvasRenderingContext2D,
	img: HTMLImageElement,
	layout: MarkLayoutMetrics,
	canvas: ExportCanvasSize,
	background: PngBackground,
	input: LogoPngExportInput,
) {
	const { padding, scale } = canvas
	const pixelW = canvas.pixelWidth
	const pixelH = canvas.pixelHeight

	fillBackground(ctx, pixelW, pixelH, background)

	ctx.save()
	ctx.scale(scale, scale)

	const markX = padding
	const markY = padding
	const logoX = markX
	const logoY = markY + (layout.overallHeight - layout.logo.boxHeight) / 2
	const visualX = logoX + (layout.logo.boxWidth - layout.logo.visualWidth) / 2
	const visualY = logoY + (layout.logo.boxHeight - layout.logo.visualHeight) / 2

	ctx.imageSmoothingEnabled = img.naturalWidth < layout.logo.visualWidth * scale
	ctx.imageSmoothingQuality = 'high'
	ctx.drawImage(
		img,
		visualX,
		visualY,
		layout.logo.visualWidth,
		layout.logo.visualHeight,
	)

	const text = layout.text
	if (text) {
		const textX = logoX + layout.logo.boxWidth + layout.gap
		const textY = markY + (layout.overallHeight - text.height) / 2
		const fontSpec = `${UI_LAYOUT.textWeight} ${text.fontSize}px ${input.fontFamily}`
		ctx.font = fontSpec
		ctx.fillStyle = textColorFor(background, input)
		ctx.textAlign = 'left'
		ctx.textBaseline = 'alphabetic'

		const metrics = ctx.measureText(text.text)
		const ascent =
			Number.isFinite(metrics.fontBoundingBoxAscent) && metrics.fontBoundingBoxAscent > 0
				? metrics.fontBoundingBoxAscent
				: Number.isFinite(metrics.actualBoundingBoxAscent)
					? metrics.actualBoundingBoxAscent
					: text.fontSize * 0.8
		const halfLeading = (text.height - text.fontSize) / 2
		const baseline = textY + halfLeading + ascent
		const letterSpacing = text.fontSize * UI_LAYOUT.textLetterSpacingEm

		drawSpacedText(ctx, text.text, textX, baseline, letterSpacing, text.maxWidth)
	}

	ctx.restore()
}

async function renderLockupPng(
	img: HTMLImageElement,
	layout: MarkLayoutMetrics,
	canvasSize: ExportCanvasSize,
	background: PngBackground,
	input: LogoPngExportInput,
): Promise<Blob> {
	const canvas = document.createElement('canvas')
	canvas.width = canvasSize.pixelWidth
	canvas.height = canvasSize.pixelHeight
	const ctx = canvas.getContext('2d')
	if (!ctx) throw new Error('Could not create canvas')
	renderLockup(ctx, img, layout, canvasSize, background, input)
	return await canvasToPngBlob(canvas)
}

export async function exportLogoPngZip(input: LogoPngExportInput): Promise<void> {
	const company = input.companyName.trim()
	const fontFamily = input.fontFamily.trim() || 'sans-serif'
	const scale = input.scale ?? PNG_EXPORT.scale

	const layout = await measureMarkLayout({
		logoSrc: input.logoSrc,
		companyName: company,
		fontFamily,
		logoScale: input.logoScale,
		textScale: input.textScale,
	})

	const canvasSize = computeExportCanvasSize(layout, PNG_EXPORT.paddingPx, scale)
	const loaded = await loadLogoForExport(
		input.logoSrc,
		layout.logo.visualWidth * scale,
		layout.logo.visualHeight * scale,
	)

	try {
		const backgrounds: PngBackground[] = ['white', 'black', 'alpha']
		const pngs = await Promise.all(
			backgrounds.map((bg) =>
				renderLockupPng(loaded.img, layout, canvasSize, bg, { ...input, fontFamily }),
			),
		)

		const stem = [
			sanitizeFilenamePart(company || input.logoLabel),
			sanitizeFilenamePart(input.logoLabel),
		]
			.filter((part, i, all) => part && all.indexOf(part) === i)
			.join('-')

		const zip = new JSZip()
		const suffix = scale === PNG_EXPORT.scale ? '' : `-${scale}x`
		zip.file(`${stem}-white${suffix}.png`, pngs[0])
		zip.file(`${stem}-black${suffix}.png`, pngs[1])
		zip.file(`${stem}-alpha${suffix}.png`, pngs[2])
		zip.file(
			'layout.json',
			JSON.stringify(buildLayoutManifest(layout, input, canvasSize), null, 2),
		)

		const blob = await zip.generateAsync({
			type: 'blob',
			compression: 'DEFLATE',
			compressionOptions: { level: 6 },
		})
		const zipSuffix = scale === PNG_EXPORT.scale ? '' : `-${scale}x`
		downloadBlob(blob, `${stem}-png${zipSuffix}-${todayStamp()}.zip`)
	} finally {
		loaded.revoke?.()
	}
}
