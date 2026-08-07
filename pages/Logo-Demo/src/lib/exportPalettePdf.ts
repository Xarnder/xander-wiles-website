import { jsPDF } from 'jspdf'
import { locateColourAnchors, type NormPoint } from './colourAnchors'
import { formatHslCss, formatOklchCss, formatRgbCss, relativeLuminance } from './colourFormat'
import {
	FALLBACK_VIEWBOX,
	mapSvgPointToRect,
	type PaletteColour,
	type SvgViewBox,
} from './svgPalette'
import {
	formatPx,
	formatRatio,
	formatRatioPair,
	measureMarkLayout,
	type MarkLayoutMetrics,
} from './layoutMetrics'

export type PalettePdfInput = {
	colours: PaletteColour[]
	logoLabel: string
	companyName: string
	logoSrc: string
	viewBox?: SvgViewBox
	/** Display name of the selected typeface, e.g. "Inter". */
	fontName?: string
	/** CSS font-family stack used on the canvas, e.g. "'Inter', sans-serif". */
	fontFamily?: string
	/** UI logo scale multiplier (0.5–2). */
	logoScale?: number
	/** UI text scale multiplier (0.5–2). */
	textScale?: number
	/**
	 * Company-name colour on light backgrounds (matches UI white panel).
	 * When SVG colours are on, this is the darkest extracted colour.
	 */
	textColorOnLight?: string
	/**
	 * Company-name colour on dark backgrounds (matches UI black panel).
	 * When SVG colours are on, this is the lightest extracted colour.
	 */
	textColorOnDark?: string
}


type RasterText = {
	dataUrl: string
	/** Width in PDF points when placed at the intended visual size. */
	widthPt: number
	heightPt: number
}

const PAGE = {
	marginX: 48,
	marginTop: 44,
	marginBottom: 48,
} as const

const INK = {
	nearBlack: [18, 18, 18] as [number, number, number],
	charcoal: [42, 42, 42] as [number, number, number],
	muted: [110, 110, 110] as [number, number, number],
	rule: [220, 220, 220] as [number, number, number],
	panel: [246, 246, 246] as [number, number, number],
	white: [255, 255, 255] as [number, number, number],
	cardBorder: [230, 230, 230] as [number, number, number],
	line: [160, 160, 160] as [number, number, number],
}

function sanitizeFilenamePart(value: string): string {
	return (
		value
			.trim()
			.replace(/[^a-zA-Z0-9-_]+/g, '-')
			.replace(/-+/g, '-')
			.replace(/^-|-$/g, '')
			.slice(0, 48) || 'logo'
	)
}

function todayStamp(): string {
	const d = new Date()
	const y = d.getFullYear()
	const m = String(d.getMonth() + 1).padStart(2, '0')
	const day = String(d.getDate()).padStart(2, '0')
	return `${y}-${m}-${day}`
}

function formatDisplayDate(): string {
	return new Date().toLocaleDateString('en-GB', {
		day: 'numeric',
		month: 'long',
		year: 'numeric',
	})
}

function hexToPdfRgb(hex: string): [number, number, number] {
	const n = Number.parseInt(hex.slice(1), 16)
	return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff]
}

function setRgb(doc: jsPDF, rgb: [number, number, number], mode: 'fill' | 'draw' | 'text') {
	const [r, g, b] = rgb
	if (mode === 'fill') doc.setFillColor(r, g, b)
	else if (mode === 'draw') doc.setDrawColor(r, g, b)
	else doc.setTextColor(r, g, b)
}

async function waitForFonts(fontFamily?: string, fontSizePt = 32): Promise<void> {
	try {
		if (typeof document === 'undefined' || !document.fonts) return
		if (fontFamily) {
			await document.fonts.load(`500 ${fontSizePt}px ${fontFamily}`)
			await document.fonts.load(`600 ${fontSizePt}px ${fontFamily}`)
		}
		await document.fonts.ready
	} catch {
		// Ignore; canvas will fall back to system fonts.
	}
}

/**
 * Rasterize text with a CSS font-family so the PDF can show the selected typeface.
 * Size is specified in PDF points; rendered at 2× for crispness.
 */
async function rasterizeTextToPng(
	text: string,
	fontFamily: string,
	fontSizePt: number,
	color: string,
	options?: {
		fontWeight?: string | number
		maxWidthPt?: number
		align?: CanvasTextAlign
	},
): Promise<RasterText | null> {
	const trimmed = text.trim()
	if (!trimmed || !fontFamily) return null

	await waitForFonts(fontFamily, fontSizePt)

	try {
		const dpr = 2
		const weight = options?.fontWeight ?? 500
		const maxWidthPt = options?.maxWidthPt
		const align = options?.align ?? 'left'

		const measure = document.createElement('canvas')
		const mctx = measure.getContext('2d')
		if (!mctx) return null
		mctx.font = `${weight} ${fontSizePt}px ${fontFamily}`

		const lineHeight = fontSizePt * 1.15
		const lines: string[] = []
		if (maxWidthPt && maxWidthPt > 0) {
			const words = trimmed.split(/\s+/)
			let line = ''
			for (const word of words) {
				const next = line ? `${line} ${word}` : word
				if (mctx.measureText(next).width <= maxWidthPt || !line) {
					line = next
				} else {
					lines.push(line)
					line = word
				}
			}
			if (line) lines.push(line)
		} else {
			lines.push(trimmed)
		}

		const contentW = Math.max(...lines.map((l) => mctx.measureText(l).width), 1)
		const padX = fontSizePt * 0.08
		const padY = fontSizePt * 0.12
		const widthPt = contentW + padX * 2
		const heightPt = lines.length * lineHeight + padY * 2

		const canvas = document.createElement('canvas')
		canvas.width = Math.ceil(widthPt * dpr)
		canvas.height = Math.ceil(heightPt * dpr)
		const ctx = canvas.getContext('2d')
		if (!ctx) return null
		ctx.scale(dpr, dpr)
		ctx.clearRect(0, 0, widthPt, heightPt)
		ctx.font = `${weight} ${fontSizePt}px ${fontFamily}`
		ctx.fillStyle = color
		ctx.textBaseline = 'alphabetic'
		ctx.textAlign = align

		const startX = align === 'center' ? widthPt / 2 : padX
		lines.forEach((line, i) => {
			const baseline = padY + (i + 1) * lineHeight - lineHeight * 0.25
			ctx.fillText(line, startX, baseline)
		})

		return {
			dataUrl: canvas.toDataURL('image/png'),
			widthPt,
			heightPt,
		}
	} catch {
		return null
	}
}

function placeRasterText(
	doc: jsPDF,
	raster: RasterText,
	x: number,
	y: number,
	maxWidthPt?: number,
): number {
	let w = raster.widthPt
	let h = raster.heightPt
	if (maxWidthPt && w > maxWidthPt) {
		const scale = maxWidthPt / w
		w = maxWidthPt
		h = h * scale
	}
	doc.addImage(raster.dataUrl, 'PNG', x, y, w, h)
	return h
}

async function rasterizeToPngDataUrl(
	src: string,
	size: number,
	background: string,
): Promise<string | null> {
	return await new Promise((resolve) => {
		const img = new Image()
		img.onload = () => {
			try {
				const canvas = document.createElement('canvas')
				canvas.width = size
				canvas.height = size
				const ctx = canvas.getContext('2d')
				if (!ctx) {
					resolve(null)
					return
				}
				ctx.fillStyle = background
				ctx.fillRect(0, 0, size, size)
				const pad = size * 0.08
				const box = size - pad * 2
				const scale = Math.min(box / img.naturalWidth, box / img.naturalHeight)
				const w = img.naturalWidth * scale
				const h = img.naturalHeight * scale
				ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h)
				resolve(canvas.toDataURL('image/png'))
			} catch {
				resolve(null)
			}
		}
		img.onerror = () => resolve(null)
		img.src = src
	})
}

async function rasterizeLogoExact(
	src: string,
	viewBox: SvgViewBox,
	maxSize = 900,
): Promise<string | null> {
	return await new Promise((resolve) => {
		const img = new Image()
		img.onload = () => {
			try {
				const aspect = viewBox.width / viewBox.height
				const width = aspect >= 1 ? maxSize : Math.round(maxSize * aspect)
				const height = aspect >= 1 ? Math.round(maxSize / aspect) : maxSize
				const canvas = document.createElement('canvas')
				canvas.width = Math.max(1, width)
				canvas.height = Math.max(1, height)
				const ctx = canvas.getContext('2d')
				if (!ctx) {
					resolve(null)
					return
				}
				ctx.fillStyle = '#ffffff'
				ctx.fillRect(0, 0, canvas.width, canvas.height)
				// Contain-fit the rendered SVG bitmap into the viewBox canvas.
				const scale = Math.min(canvas.width / img.naturalWidth, canvas.height / img.naturalHeight)
				const w = img.naturalWidth * scale
				const h = img.naturalHeight * scale
				ctx.drawImage(img, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h)
				resolve(canvas.toDataURL('image/png'))
			} catch {
				resolve(null)
			}
		}
		img.onerror = () => resolve(null)
		img.src = src
	})
}

function drawHorizontalRule(doc: jsPDF, x: number, y: number, width: number) {
	setRgb(doc, INK.rule, 'draw')
	doc.setLineWidth(0.6)
	doc.line(x, y, x + width, y)
}

function drawAccentBar(doc: jsPDF, pageW: number, accent: [number, number, number]) {
	setRgb(doc, accent, 'fill')
	doc.rect(0, 0, pageW, 6, 'F')
}

function drawFooter(
	doc: jsPDF,
	pageW: number,
	pageH: number,
	company: string,
	pageIndex: number,
	pageCount: number,
	fontName = '',
) {
	const y = pageH - 28
	drawHorizontalRule(doc, PAGE.marginX, y - 12, pageW - PAGE.marginX * 2)
	doc.setFont('helvetica', 'normal')
	doc.setFontSize(8)
	setRgb(doc, INK.muted, 'text')
	const left = [company || 'Brand colour palette', fontName ? `Typeface: ${fontName}` : '']
		.filter(Boolean)
		.join('  ·  ')
	doc.text(left, PAGE.marginX, y)
	doc.text(`${pageIndex} / ${pageCount}`, pageW - PAGE.marginX, y, { align: 'right' })
}

function drawColourStrip(
	doc: jsPDF,
	colours: PaletteColour[],
	x: number,
	y: number,
	width: number,
	height: number,
) {
	if (colours.length === 0) return
	const cellW = width / colours.length
	setRgb(doc, INK.white, 'fill')
	doc.roundedRect(x, y, width, height, 5, 5, 'F')
	colours.forEach((colour, i) => {
		const [r, g, b] = hexToPdfRgb(colour.hex)
		doc.setFillColor(r, g, b)
		doc.rect(x + i * cellW, y, cellW + 0.4, height, 'F')
	})
	setRgb(doc, INK.cardBorder, 'draw')
	doc.setLineWidth(0.8)
	doc.roundedRect(x, y, width, height, 5, 5, 'S')
}

type RowLayout = {
	colour: PaletteColour
	index: number
	x: number
	y: number
	width: number
	height: number
	anchorX: number
	anchorY: number
}

/**
 * Colour-map page: large logo with leader lines to colour rows.
 */
async function drawColourMapPage(
	doc: jsPDF,
	pageW: number,
	pageH: number,
	colours: PaletteColour[],
	viewBox: SvgViewBox,
	fallbackLogoPng: string | null,
	logoSrc: string,
	accent: [number, number, number],
) {
	doc.addPage()
	drawAccentBar(doc, pageW, accent)

	let y = PAGE.marginTop + 8
	const contentW = pageW - PAGE.marginX * 2

	doc.setFont('helvetica', 'normal')
	doc.setFontSize(9)
	setRgb(doc, INK.muted, 'text')
	doc.text('COLOUR MAP', PAGE.marginX, y)
	y += 22
	doc.setFont('helvetica', 'bold')
	doc.setFontSize(18)
	setRgb(doc, INK.nearBlack, 'text')
	doc.text('Where each colour comes from', PAGE.marginX, y)
	y += 16
	drawHorizontalRule(doc, PAGE.marginX, y, contentW)
	y += 16

	doc.setFont('helvetica', 'normal')
	doc.setFontSize(9)
	setRgb(doc, INK.muted, 'text')
	doc.text(
		'Lines connect each palette colour to its source region on the logo mark.',
		PAGE.marginX,
		y,
	)
	y += 18

	const gap = 28
	const listW = 210
	const logoPanelW = contentW - listW - gap
	const logoPanelH = Math.min(340, pageH - y - PAGE.marginBottom - 24)
	const logoPanelX = PAGE.marginX
	const logoPanelY = y
	const listX = PAGE.marginX + logoPanelW + gap

	setRgb(doc, INK.panel, 'fill')
	setRgb(doc, INK.cardBorder, 'draw')
	doc.setLineWidth(0.8)
	doc.roundedRect(logoPanelX, logoPanelY, logoPanelW, logoPanelH, 10, 10, 'FD')

	const pad = 22
	const frame = {
		x: logoPanelX + pad,
		y: logoPanelY + pad,
		width: logoPanelW - pad * 2,
		height: logoPanelH - pad * 2,
	}

	const scale = Math.min(frame.width / viewBox.width, frame.height / viewBox.height)
	const drawW = viewBox.width * scale
	const drawH = viewBox.height * scale
	const logoRect = {
		x: frame.x + (frame.width - drawW) / 2,
		y: frame.y + (frame.height - drawH) / 2,
		width: drawW,
		height: drawH,
	}

	const rowH = 52
	const rowGap = 8
	const maxRows = Math.max(1, Math.floor((logoPanelH + 4) / (rowH + rowGap)))
	const mapped = colours.slice(0, maxRows)
	const overflow = colours.length - mapped.length

	// Shape-isolated affinity peaks + preview from the same SVG→canvas pipeline.
	const located = await locateColourAnchors({
		logoSrc,
		colours: mapped,
		viewBox,
	})
	const logoPng = located.previewPng ?? fallbackLogoPng
	const anchors = located.anchors

	if (logoPng) {
		doc.addImage(logoPng, 'PNG', logoRect.x, logoRect.y, logoRect.width, logoRect.height)
	}

	const rows: RowLayout[] = []
	let rowY = logoPanelY
	mapped.forEach((colour, index) => {
		rows.push({
			colour,
			index,
			x: listX,
			y: rowY,
			width: listW,
			height: rowH,
			anchorX: listX,
			anchorY: rowY + rowH / 2,
		})
		rowY += rowH + rowGap
	})

	for (const row of rows) {
		const [r, g, b] = hexToPdfRgb(row.colour.hex)
		setRgb(doc, INK.white, 'fill')
		setRgb(doc, INK.cardBorder, 'draw')
		doc.setLineWidth(0.7)
		doc.roundedRect(row.x, row.y, row.width, row.height, 5, 5, 'FD')

		doc.setFillColor(r, g, b)
		doc.roundedRect(row.x + 6, row.y + 8, 24, row.height - 16, 4, 4, 'F')

		setRgb(doc, INK.nearBlack, 'fill')
		doc.circle(row.x + 48, row.y + row.height / 2, 8, 'F')
		doc.setFont('helvetica', 'bold')
		doc.setFontSize(8)
		setRgb(doc, INK.white, 'text')
		doc.text(String(row.index + 1), row.x + 48, row.y + row.height / 2 + 2.5, {
			align: 'center',
		})

		doc.setFont('helvetica', 'bold')
		doc.setFontSize(10)
		setRgb(doc, INK.nearBlack, 'text')
		doc.text(row.colour.hex, row.x + 62, row.y + 14)

		doc.setFont('helvetica', 'normal')
		doc.setFontSize(7)
		setRgb(doc, INK.muted, 'text')
		doc.text(formatRgbCss(row.colour.rgb), row.x + 62, row.y + 25)
		doc.text(formatHslCss(row.colour.rgb), row.x + 62, row.y + 35)
		doc.text(formatOklchCss(row.colour.rgb), row.x + 62, row.y + 45)
	}

	for (const row of rows) {
		const raster = anchors.get(row.colour.id)
		const from = raster
			? {
					x: logoRect.x + raster.nx * logoRect.width,
					y: logoRect.y + raster.ny * logoRect.height,
				}
			: row.colour.origin
				? mapSvgPointToRect(row.colour.origin, viewBox, logoRect)
				: null
		if (!from) continue

		const toX = row.anchorX - 2
		const toY = row.anchorY

		const [cr, cg, cb] = hexToPdfRgb(row.colour.hex)
		doc.setDrawColor(cr, cg, cb)
		doc.setLineWidth(1.15)
		doc.line(from.x, from.y, toX, toY)

		doc.setFillColor(cr, cg, cb)
		doc.circle(from.x, from.y, 5, 'F')
		setRgb(doc, INK.white, 'draw')
		doc.setLineWidth(1.35)
		doc.circle(from.x, from.y, 5, 'S')

		const luma = relativeLuminance(row.colour.hex)
		doc.setFont('helvetica', 'bold')
		doc.setFontSize(7)
		setRgb(doc, luma > 0.55 ? INK.nearBlack : INK.white, 'text')
		doc.text(String(row.index + 1), from.x, from.y + 2.2, { align: 'center' })
	}

	if (overflow > 0) {
		doc.setFont('helvetica', 'normal')
		doc.setFontSize(8)
		setRgb(doc, INK.muted, 'text')
		doc.text(`+ ${overflow} more on the palette cards page`, listX, logoPanelY + logoPanelH + 14)
	}
}

function drawColourCard(
	doc: jsPDF,
	colour: PaletteColour,
	index: number,
	x: number,
	y: number,
	cardW: number,
	cardH: number,
	swatchH: number,
) {
	const [r, g, b] = hexToPdfRgb(colour.hex)
	const luma = relativeLuminance(colour.hex)

	setRgb(doc, INK.white, 'fill')
	setRgb(doc, INK.cardBorder, 'draw')
	doc.setLineWidth(0.8)
	doc.roundedRect(x, y, cardW, cardH, 6, 6, 'FD')

	doc.setFillColor(r, g, b)
	doc.roundedRect(x + 1, y + 1, cardW - 2, swatchH, 5, 5, 'F')
	doc.rect(x + 1, y + swatchH - 10, cardW - 2, 11, 'F')

	setRgb(doc, INK.rule, 'draw')
	doc.setLineWidth(0.5)
	doc.line(x + 1, y + swatchH, x + cardW - 1, y + swatchH)

	const metaX = x + 12
	let metaY = y + swatchH + 16

	doc.setFont('helvetica', 'bold')
	doc.setFontSize(7.5)
	setRgb(doc, INK.muted, 'text')
	doc.text(`${index + 1}  ·  ${(colour.label || `Colour ${index + 1}`).toUpperCase()}`, metaX, metaY)

	metaY += 14
	doc.setFont('helvetica', 'bold')
	doc.setFontSize(12)
	setRgb(doc, INK.nearBlack, 'text')
	doc.text(colour.hex, metaX, metaY)

	metaY += 13
	doc.setFont('helvetica', 'normal')
	doc.setFontSize(8)
	setRgb(doc, INK.charcoal, 'text')
	doc.text(formatRgbCss(colour.rgb), metaX, metaY)
	metaY += 11
	doc.text(formatHslCss(colour.rgb), metaX, metaY)
	metaY += 11
	doc.text(formatOklchCss(colour.rgb), metaX, metaY)

	const chipLabel = colour.hex
	doc.setFont('helvetica', 'bold')
	doc.setFontSize(7)
	const chipW = doc.getTextWidth(chipLabel) + 10
	const chipX = x + cardW - chipW - 8
	const chipY = y + 8
	const chipBg: [number, number, number] = luma > 0.55 ? [18, 18, 18] : [255, 255, 255]
	const chipFg: [number, number, number] = luma > 0.55 ? [255, 255, 255] : [18, 18, 18]
	setRgb(doc, chipBg, 'fill')
	doc.roundedRect(chipX, chipY, chipW, 14, 3, 3, 'F')
	setRgb(doc, chipFg, 'text')
	doc.text(chipLabel, chipX + chipW / 2, chipY + 10, { align: 'center' })
}

function ensureSpace(
	doc: jsPDF,
	y: number,
	needed: number,
	pageW: number,
	pageH: number,
	accent: [number, number, number],
): number {
	if (y + needed <= pageH - PAGE.marginBottom) return y
	doc.addPage()
	drawAccentBar(doc, pageW, accent)
	return PAGE.marginTop + 12
}

const DIM = {
	stroke: [90, 90, 90] as [number, number, number],
	label: [42, 42, 42] as [number, number, number],
	guide: [200, 200, 200] as [number, number, number],
}

function drawDimHorizontal(
	doc: jsPDF,
	x1: number,
	x2: number,
	y: number,
	label: string,
	labelAbove = true,
) {
	const left = Math.min(x1, x2)
	const right = Math.max(x1, x2)
	const tick = 4
	setRgb(doc, DIM.stroke, 'draw')
	doc.setLineWidth(0.7)
	doc.line(left, y, right, y)
	doc.line(left, y - tick, left, y + tick)
	doc.line(right, y - tick, right, y + tick)
	doc.setFont('helvetica', 'normal')
	doc.setFontSize(7.5)
	setRgb(doc, DIM.label, 'text')
	const ty = labelAbove ? y - 6 : y + 11
	doc.text(label, (left + right) / 2, ty, { align: 'center' })
}

function drawDimVertical(
	doc: jsPDF,
	x: number,
	y1: number,
	y2: number,
	label: string,
	labelLeft = true,
	labelAt: 'mid' | 'end' = 'mid',
) {
	const top = Math.min(y1, y2)
	const bottom = Math.max(y1, y2)
	const tick = 4
	setRgb(doc, DIM.stroke, 'draw')
	doc.setLineWidth(0.7)
	doc.line(x, top, x, bottom)
	doc.line(x - tick, top, x + tick, top)
	doc.line(x - tick, bottom, x + tick, bottom)
	doc.setFont('helvetica', 'normal')
	doc.setFontSize(7.5)
	setRgb(doc, DIM.label, 'text')
	const labelY = labelAt === 'end' ? bottom + 11 : (top + bottom) / 2 + 2.5
	if (labelLeft) {
		doc.text(label, x - 6, labelY, { align: 'right' })
	} else {
		doc.text(label, x + 6, labelY, { align: 'left' })
	}
}

/** Compact ratio chip drawn at a point (for diagram annotations). */
function drawRatioChip(
	doc: jsPDF,
	x: number,
	y: number,
	label: string,
	align: 'left' | 'center' | 'right' = 'center',
) {
	doc.setFont('helvetica', 'bold')
	doc.setFontSize(7)
	const w = doc.getTextWidth(label) + 8
	const h = 12
	let left = x - w / 2
	if (align === 'left') left = x
	if (align === 'right') left = x - w
	setRgb(doc, INK.panel, 'fill')
	setRgb(doc, INK.cardBorder, 'draw')
	doc.setLineWidth(0.6)
	doc.roundedRect(left, y - h + 3, w, h, 3, 3, 'FD')
	setRgb(doc, INK.nearBlack, 'text')
	doc.text(label, left + w / 2, y, { align: 'center' })
}

/**
 * Comparison bracket linking two vertical spans (e.g. logo H vs text H) with a ratio value.
 */
function drawHeightRatioCompare(
	doc: jsPDF,
	x: number,
	aTop: number,
	aBottom: number,
	bTop: number,
	bBottom: number,
	ratioLabel: string,
) {
	const tick = 3
	setRgb(doc, DIM.stroke, 'draw')
	doc.setLineWidth(0.65)
	// Span A
	doc.line(x, aTop, x, aBottom)
	doc.line(x - tick, aTop, x + tick, aTop)
	doc.line(x - tick, aBottom, x + tick, aBottom)
	// Span B
	doc.line(x + 10, bTop, x + 10, bBottom)
	doc.line(x + 10 - tick, bTop, x + 10 + tick, bTop)
	doc.line(x + 10 - tick, bBottom, x + 10 + tick, bBottom)
	// Bridge between midpoints
	const midA = (aTop + aBottom) / 2
	const midB = (bTop + bBottom) / 2
	doc.setLineDashPattern([2, 2], 0)
	doc.line(x, midA, x + 10, midB)
	doc.setLineDashPattern([], 0)
	drawRatioChip(doc, x + 5, Math.min(midA, midB) - 8, ratioLabel, 'center')
}

function drawRatioTable(
	doc: jsPDF,
	x: number,
	y: number,
	width: number,
	rows: Array<[string, string]>,
): number {
	const rowH = 16
	const colLabel = width * 0.62
	let cy = y
	setRgb(doc, INK.panel, 'fill')
	setRgb(doc, INK.cardBorder, 'draw')
	doc.setLineWidth(0.7)
	doc.roundedRect(x, y, width, rows.length * rowH + 8, 6, 6, 'FD')
	cy += 12
	for (const [label, value] of rows) {
		doc.setFont('helvetica', 'normal')
		doc.setFontSize(8)
		setRgb(doc, INK.charcoal, 'text')
		doc.text(label, x + 10, cy)
		doc.setFont('helvetica', 'bold')
		doc.setFontSize(8)
		setRgb(doc, INK.nearBlack, 'text')
		doc.text(value, x + colLabel, cy)
		cy += rowH
	}
	return rows.length * rowH + 8
}

/**
 * Spacing & measurements page from UI logo/text scales.
 */
async function drawMeasurementsPage(
	doc: jsPDF,
	pageW: number,
	pageH: number,
	input: PalettePdfInput,
	logoPng: string | null,
	accent: [number, number, number],
	layout: MarkLayoutMetrics,
	textColorOnLight: string,
) {
	doc.addPage()
	drawAccentBar(doc, pageW, accent)

	let y = PAGE.marginTop + 8
	const contentW = pageW - PAGE.marginX * 2
	const company = input.companyName.trim() || 'Company'
	const fontFamily = input.fontFamily?.trim() || 'sans-serif'
	const fontName = input.fontName?.trim() || ''

	doc.setFont('helvetica', 'normal')
	doc.setFontSize(9)
	setRgb(doc, INK.muted, 'text')
	doc.text('SPACING & MEASUREMENTS', PAGE.marginX, y)
	y += 22
	doc.setFont('helvetica', 'bold')
	doc.setFontSize(18)
	setRgb(doc, INK.nearBlack, 'text')
	doc.text('Logo + wordmark layout', PAGE.marginX, y)
	y += 16
	drawHorizontalRule(doc, PAGE.marginX, y, contentW)
	y += 16

	doc.setFont('helvetica', 'normal')
	doc.setFontSize(9)
	setRgb(doc, INK.muted, 'text')
	doc.text(
		`UI scales — Logo ${layout.ratios.logoScalePct}%  ·  Text ${layout.ratios.textScalePct}%` +
			(fontName ? `  ·  ${fontName}` : ''),
		PAGE.marginX,
		y,
	)
	y += 10
	doc.text(
		'Values match the on-screen mark (140px logo base, 3rem text base, 1.25rem gap).',
		PAGE.marginX,
		y,
	)
	y += 22

	// Diagram panel
	const panelPad = 36
	const dimBleedLeft = 48
	const dimBleedRight = 150
	const dimBleedBottom = 96
	const dimBleedTop = 22
	const panelX = PAGE.marginX
	const panelY = y
	const panelW = contentW
	const diagramMaxW = panelW - panelPad * 2 - dimBleedLeft - dimBleedRight
	const diagramMaxH = 150

	const hasText = Boolean(layout.text)
	const srcW = layout.overallWidth
	const srcH = layout.overallHeight
	const fit = Math.min(diagramMaxW / Math.max(srcW, 1), diagramMaxH / Math.max(srcH, 1), 1.35)
	const logoW = layout.logo.boxWidth * fit
	const logoH = layout.logo.boxHeight * fit
	const visualW = layout.logo.visualWidth * fit
	const visualH = layout.logo.visualHeight * fit
	const gapW = layout.gap * fit
	const textW = (layout.text?.width ?? 0) * fit
	const textH = (layout.text?.height ?? 0) * fit
	const markW = logoW + (hasText ? gapW + textW : 0)
	const markH = Math.max(logoH, textH)

	const panelH = markH + panelPad * 2 + dimBleedBottom + dimBleedTop + 10
	setRgb(doc, INK.white, 'fill')
	setRgb(doc, INK.cardBorder, 'draw')
	doc.setLineWidth(0.8)
	doc.roundedRect(panelX, panelY, panelW, panelH, 8, 8, 'FD')

	const markX = panelX + panelPad + dimBleedLeft
	const markY = panelY + panelPad + dimBleedTop
	const logoX = markX
	const logoY = markY + (markH - logoH) / 2
	const textX = logoX + logoW + gapW
	const textY = markY + (markH - textH) / 2
	void markW

	// Logo box outline + image
	setRgb(doc, DIM.guide, 'draw')
	doc.setLineWidth(0.6)
	doc.setLineDashPattern([2, 2], 0)
	doc.rect(logoX, logoY, logoW, logoH, 'S')
	doc.setLineDashPattern([], 0)

	if (logoPng) {
		const vx = logoX + (logoW - visualW) / 2
		const vy = logoY + (logoH - visualH) / 2
		doc.addImage(logoPng, 'PNG', vx, vy, visualW, visualH)
		setRgb(doc, DIM.stroke, 'draw')
		doc.setLineWidth(0.5)
		doc.rect(vx, vy, visualW, visualH, 'S')
	} else {
		setRgb(doc, INK.panel, 'fill')
		doc.rect(logoX, logoY, logoW, logoH, 'F')
	}

	// Text specimen
	if (layout.text && hasText) {
		const specimen = await rasterizeTextToPng(company, fontFamily, Math.max(8, layout.text.fontSize * fit), textColorOnLight, {
			fontWeight: 500,
			maxWidthPt: Math.max(textW, 8),
		})
		setRgb(doc, DIM.guide, 'draw')
		doc.setLineWidth(0.6)
		doc.setLineDashPattern([2, 2], 0)
		doc.rect(textX, textY, textW, textH, 'S')
		doc.setLineDashPattern([], 0)
		if (specimen) {
			const sx = textX + (textW - Math.min(specimen.widthPt, textW)) / 2
			const sy = textY + (textH - Math.min(specimen.heightPt, textH)) / 2
			placeRasterText(doc, specimen, sx, sy, textW)
		} else {
			doc.setFont('helvetica', 'normal')
			doc.setFontSize(Math.max(8, layout.text.fontSize * fit * 0.75))
			setRgb(doc, INK.nearBlack, 'text')
			doc.text(company, textX + 2, textY + textH * 0.7)
		}
	}

	const logoAspect = formatRatioPair(layout.logo.visualWidth, layout.logo.visualHeight)
	const logoBoxAspect = formatRatioPair(layout.logo.boxWidth, layout.logo.boxHeight)
	const textAspect = layout.text
		? formatRatioPair(layout.text.width, layout.text.height)
		: null

	// Aspect-ratio chips above logo / text
	drawRatioChip(doc, logoX + logoW / 2, logoY - 8, `logo W:H ${logoAspect}`)
	if (hasText && textAspect) {
		drawRatioChip(doc, textX + textW / 2, textY - 8, `text W:H ${textAspect}`)
	}

	// Width dims sit just under the mark; gap + overall stack further down to avoid overlap.
	const widthDimY = Math.max(logoY + logoH, textY + textH) + 14
	const gapY = widthDimY + 22
	const overallY = gapY + 20

	// Gap dimension (between logo box and text) + gap:logoH ratio
	if (hasText) {
		const gapRatio = formatRatio(layout.ratios.gapToLogoHeight)
		drawDimHorizontal(
			doc,
			logoX + logoW,
			textX,
			gapY,
			`gap ${formatPx(layout.gap)}  ·  ${gapRatio} of logo H`,
			false,
		)

		setRgb(doc, DIM.guide, 'draw')
		doc.setLineWidth(0.5)
		doc.setLineDashPattern([1.5, 1.5], 0)
		doc.line(logoX + logoW, logoY + logoH, logoX + logoW, gapY)
		doc.line(textX, textY + textH, textX, gapY)
		doc.setLineDashPattern([], 0)
	}

	// Overall width + overall W:H / logoW:textW ratios
	const overallEnd = hasText ? textX + textW : logoX + logoW
	const overallParts = [
		`overall ${formatPx(layout.overallWidth)}`,
		`W:H ${formatRatioPair(layout.overallWidth, layout.overallHeight)}`,
	]
	if (layout.text) {
		overallParts.push(`logoW:textW ${formatRatio(layout.ratios.logoWidthToTextWidth)}`)
	}
	drawDimHorizontal(doc, logoX, overallEnd, overallY, overallParts.join('  ·  '), false)

	// Logo width (below logo) with box aspect
	drawDimHorizontal(
		doc,
		logoX,
		logoX + logoW,
		widthDimY,
		`logo W ${formatPx(layout.logo.boxWidth)}  ·  box ${logoBoxAspect}`,
		false,
	)

	// Text width with aspect
	if (hasText && layout.text && textAspect) {
		drawDimHorizontal(
			doc,
			textX,
			textX + textW,
			widthDimY,
			`text W ${formatPx(layout.text.width)}  ·  ${textAspect}`,
			false,
		)
	}

	// Logo height (left) — label below the span so it clears the gap row
	drawDimVertical(
		doc,
		logoX - 16,
		logoY,
		logoY + logoH,
		`H ${formatPx(layout.logo.boxHeight)}`,
		true,
		'end',
	)

	// Visual logo height if different from box
	if (
		Math.abs(layout.logo.visualHeight - layout.logo.boxHeight) > 0.5 ||
		Math.abs(layout.logo.visualWidth - layout.logo.boxWidth) > 0.5
	) {
		const vx = logoX + (logoW - visualW) / 2
		const vy = logoY + (logoH - visualH) / 2
		drawDimVertical(
			doc,
			vx + visualW + 10,
			vy,
			vy + visualH,
			`art ${formatPx(layout.logo.visualHeight)}`,
			false,
		)
		drawDimHorizontal(
			doc,
			vx,
			vx + visualW,
			vy - 10,
			`art W ${formatPx(layout.logo.visualWidth)}  ·  ${logoAspect}`,
			true,
		)
	}

	// Text height + font size (right) — spaced so labels do not collide.
	if (hasText && layout.text) {
		const textDimX = textX + textW + 20
		const fontDimX = textX + textW + 86
		const fontSizeH = layout.text.fontSize * fit
		const fontTop = textY + (textH - fontSizeH) / 2

		drawDimVertical(
			doc,
			textDimX,
			textY,
			textY + textH,
			`text H ${formatPx(layout.text.height)}`,
			false,
		)
		drawDimVertical(
			doc,
			fontDimX,
			fontTop,
			fontTop + fontSizeH,
			`font ${formatPx(layout.text.fontSize)}`,
			false,
		)

		// Logo H : Text H comparison bracket further right
		drawHeightRatioCompare(
			doc,
			fontDimX + 52,
			logoY,
			logoY + logoH,
			textY,
			textY + textH,
			`logoH:textH ${formatRatio(layout.ratios.logoHeightToTextHeight)}`,
		)
	}

	y = panelY + panelH + 22

	doc.setFont('helvetica', 'bold')
	doc.setFontSize(12)
	setRgb(doc, INK.nearBlack, 'text')
	doc.text('Dimensions', PAGE.marginX, y)
	y += 10

	const dimRows: Array<[string, string]> = [
		['Logo scale (UI)', `${layout.ratios.logoScalePct}%`],
		['Text scale (UI)', `${layout.ratios.textScalePct}%`],
		['Logo box width', formatPx(layout.logo.boxWidth)],
		['Logo box height', formatPx(layout.logo.boxHeight)],
		['Logo artwork width', formatPx(layout.logo.visualWidth)],
		['Logo artwork height', formatPx(layout.logo.visualHeight)],
		['Logo natural size', `${Math.round(layout.logo.naturalWidth)} × ${Math.round(layout.logo.naturalHeight)} px`],
	]
	if (layout.text) {
		dimRows.push(
			['Wordmark text', layout.text.text],
			['Text width', formatPx(layout.text.width) + (layout.text.truncated ? ' (max)' : '')],
			['Text height (line-box)', formatPx(layout.text.height)],
			['Text glyph height', formatPx(layout.text.glyphHeight)],
			['Font size', formatPx(layout.text.fontSize)],
			['Gap (logo → text)', formatPx(layout.gap)],
			['Overall width', formatPx(layout.overallWidth)],
			['Overall height', formatPx(layout.overallHeight)],
		)
	}

	const half = Math.ceil(dimRows.length / 2)
	const colGap = 14
	const colW = (contentW - colGap) / 2
	const leftH = drawRatioTable(doc, PAGE.marginX, y, colW, dimRows.slice(0, half))
	const rightH = drawRatioTable(doc, PAGE.marginX + colW + colGap, y, colW, dimRows.slice(half))
	y += Math.max(leftH, rightH) + 20

	doc.setFont('helvetica', 'bold')
	doc.setFontSize(12)
	setRgb(doc, INK.nearBlack, 'text')
	doc.text('Ratios', PAGE.marginX, y)
	y += 10

	const ratioRows: Array<[string, string]> = [
		['Logo W : H', formatRatioPair(layout.logo.visualWidth, layout.logo.visualHeight)],
		['Logo H : W', formatRatioPair(layout.logo.visualHeight, layout.logo.visualWidth)],
		['Logo box W : H', formatRatioPair(layout.logo.boxWidth, layout.logo.boxHeight)],
		['Text scale : Logo scale', formatRatio(layout.ratios.textToLogoScale)],
		['Gap : Logo height', formatRatio(layout.ratios.gapToLogoHeight)],
	]
	if (layout.text) {
		ratioRows.push(
			['Text W : H', formatRatioPair(layout.text.width, layout.text.height)],
			['Text H : W', formatRatioPair(layout.text.height, layout.text.width)],
			['Logo H : Text H', formatRatio(layout.ratios.logoHeightToTextHeight)],
			['Text H : Logo H', formatRatio(layout.ratios.textHeightToLogoHeight)],
			['Logo W : Text W', formatRatio(layout.ratios.logoWidthToTextWidth)],
			['Gap : Text height', formatRatio(layout.ratios.gapToTextHeight)],
			[
				'Overall W : H',
				formatRatioPair(layout.overallWidth, layout.overallHeight),
			],
		)
	}

	const rHalf = Math.ceil(ratioRows.length / 2)
	const rLeft = drawRatioTable(doc, PAGE.marginX, y, colW, ratioRows.slice(0, rHalf))
	const rRight = drawRatioTable(
		doc,
		PAGE.marginX + colW + colGap,
		y,
		colW,
		ratioRows.slice(rHalf),
	)
	y += Math.max(rLeft, rRight) + 14

	doc.setFont('helvetica', 'normal')
	doc.setFontSize(8)
	setRgb(doc, INK.muted, 'text')
	doc.text(
		'Dashed boxes = CSS layout bounds. Solid outline on logo = artwork after object-fit: contain.',
		PAGE.marginX,
		y,
	)
}
export async function exportPalettePdf(input: PalettePdfInput): Promise<void> {
	const doc = new jsPDF({ unit: 'pt', format: 'a4' })
	const pageW = doc.internal.pageSize.getWidth()
	const pageH = doc.internal.pageSize.getHeight()
	const contentW = pageW - PAGE.marginX * 2
	const company = input.companyName.trim()
	const title = company || input.logoLabel || 'Logo'
	const assetLabel = input.logoLabel || 'Logo mark'
	const dateLabel = formatDisplayDate()
	const viewBox = input.viewBox ?? FALLBACK_VIEWBOX
	const fontName = input.fontName?.trim() || ''
	const fontFamily = input.fontFamily?.trim() || ''
	const logoScale = input.logoScale ?? 1
	const textScale = input.textScale ?? 1
	const textColorOnLight = input.textColorOnLight?.trim() || '#121212'
	const textColorOnDark = input.textColorOnDark?.trim() || '#ffffff'

	const layoutPromise = measureMarkLayout({
		logoSrc: input.logoSrc,
		companyName: company,
		fontFamily: fontFamily || 'sans-serif',
		logoScale,
		textScale,
		fallbackAspect: viewBox.width / viewBox.height,
	})

	const [logoLight, logoDark, logoMap, titleRaster, fontSpecimen, nameOnLight, nameOnDark, layout] =
		await Promise.all([
			rasterizeToPngDataUrl(input.logoSrc, 512, '#ffffff'),
			rasterizeToPngDataUrl(input.logoSrc, 512, '#000000'),
			rasterizeLogoExact(input.logoSrc, viewBox, 900),
			fontFamily
				? rasterizeTextToPng(title, fontFamily, 32, textColorOnLight, {
						fontWeight: 600,
						maxWidthPt: contentW,
					})
				: Promise.resolve(null),
			fontFamily && fontName
				? rasterizeTextToPng(fontName, fontFamily, 16, textColorOnLight, {
						fontWeight: 500,
						maxWidthPt: contentW,
					})
				: Promise.resolve(null),
			company && fontFamily
				? rasterizeTextToPng(company, fontFamily, 14, textColorOnLight, {
						fontWeight: 500,
						maxWidthPt: (contentW - 16) / 2 - 24,
						align: 'center',
					})
				: Promise.resolve(null),
			company && fontFamily
				? rasterizeTextToPng(company, fontFamily, 14, textColorOnDark, {
						fontWeight: 500,
						maxWidthPt: (contentW - 16) / 2 - 24,
						align: 'center',
					})
				: Promise.resolve(null),
			layoutPromise,
		])

	const accent = input.colours[0] ? hexToPdfRgb(input.colours[0].hex) : INK.nearBlack

	drawAccentBar(doc, pageW, accent)

	let y = PAGE.marginTop + 8

	doc.setFont('helvetica', 'normal')
	doc.setFontSize(9)
	setRgb(doc, INK.muted, 'text')
	doc.text('BRAND COLOUR PRESENTATION', PAGE.marginX, y)
	doc.text(dateLabel, pageW - PAGE.marginX, y, { align: 'right' })
	y += 16
	drawHorizontalRule(doc, PAGE.marginX, y, contentW)
	y += 28

	if (titleRaster) {
		y += placeRasterText(doc, titleRaster, PAGE.marginX, y, contentW)
		y += 10
	} else {
		doc.setFont('helvetica', 'bold')
		doc.setFontSize(30)
		setRgb(doc, INK.nearBlack, 'text')
		const titleLines = doc.splitTextToSize(title, contentW)
		doc.text(titleLines, PAGE.marginX, y)
		y += titleLines.length * 34
	}

	if (fontName) {
		doc.setFont('helvetica', 'normal')
		doc.setFontSize(9)
		setRgb(doc, INK.muted, 'text')
		doc.text(`TYPEFACE  ·  ${fontName.toUpperCase()}`, PAGE.marginX, y)
		y += 6
		if (fontSpecimen) {
			y += 4
			y += placeRasterText(doc, fontSpecimen, PAGE.marginX, y, contentW)
		}
		y += 14
	}

	doc.setFont('helvetica', 'normal')
	doc.setFontSize(11)
	setRgb(doc, INK.muted, 'text')
	doc.text(assetLabel, PAGE.marginX, y)
	y += 26

	const panelGap = 16
	const panelW = (contentW - panelGap) / 2
	const showPanelNames = Boolean(nameOnLight || nameOnDark)
	const panelH = showPanelNames ? 198 : 172
	const logoBox = 118

	if (logoLight || logoDark) {
		setRgb(doc, INK.white, 'fill')
		setRgb(doc, INK.cardBorder, 'draw')
		doc.setLineWidth(0.8)
		doc.roundedRect(PAGE.marginX, y, panelW, panelH, 8, 8, 'FD')
		setRgb(doc, [0, 0, 0], 'fill')
		doc.roundedRect(PAGE.marginX + panelW + panelGap, y, panelW, panelH, 8, 8, 'F')

		const logoTop = showPanelNames ? y + 18 : y + (panelH - logoBox) / 2
		if (logoLight) {
			doc.addImage(
				logoLight,
				'PNG',
				PAGE.marginX + (panelW - logoBox) / 2,
				logoTop,
				logoBox,
				logoBox,
			)
		}
		if (logoDark) {
			doc.addImage(
				logoDark,
				'PNG',
				PAGE.marginX + panelW + panelGap + (panelW - logoBox) / 2,
				logoTop,
				logoBox,
				logoBox,
			)
		}

		if (nameOnLight) {
			const nameY = logoTop + logoBox + 10
			const maxW = panelW - 24
			placeRasterText(
				doc,
				nameOnLight,
				PAGE.marginX + (panelW - Math.min(nameOnLight.widthPt, maxW)) / 2,
				nameY,
				maxW,
			)
		}
		if (nameOnDark) {
			const nameY = logoTop + logoBox + 10
			const maxW = panelW - 24
			placeRasterText(
				doc,
				nameOnDark,
				PAGE.marginX + panelW + panelGap + (panelW - Math.min(nameOnDark.widthPt, maxW)) / 2,
				nameY,
				maxW,
			)
		}

		y += panelH + 14
		doc.setFont('helvetica', 'normal')
		doc.setFontSize(8)
		setRgb(doc, INK.muted, 'text')
		doc.text('LIGHT BACKGROUND', PAGE.marginX + panelW / 2, y, { align: 'center' })
		doc.text('DARK BACKGROUND', PAGE.marginX + panelW + panelGap + panelW / 2, y, {
			align: 'center',
		})
		y += 26
	}

	if (input.colours.length > 0) {
		drawColourStrip(doc, input.colours, PAGE.marginX, y, contentW, 32)
		y += 50
	}

	doc.setFont('helvetica', 'bold')
	doc.setFontSize(14)
	setRgb(doc, INK.nearBlack, 'text')
	doc.text('Colour palette', PAGE.marginX, y)
	y += 8
	drawHorizontalRule(doc, PAGE.marginX, y, contentW)
	y += 12

	doc.setFont('helvetica', 'normal')
	doc.setFontSize(9)
	setRgb(doc, INK.muted, 'text')
	const paletteMeta = [
		input.colours.length === 1 ? '1 colour' : `${input.colours.length} colours`,
		fontName ? `Typeface: ${fontName}` : '',
	]
		.filter(Boolean)
		.join('  ·  ')
	doc.text(paletteMeta, PAGE.marginX, y)
	y += 20

	if (input.colours.length === 0) {
		doc.setFontSize(11)
		doc.text('No colours in this palette.', PAGE.marginX, y)
	} else {
		const cols = 2
		const cardGapX = 14
		const cardGapY = 14
		const cardW = (contentW - cardGapX * (cols - 1)) / cols
		const swatchH = 76
		const cardH = swatchH + 82

		let rowY = y
		for (let i = 0; i < input.colours.length; i++) {
			const col = i % cols
			if (col === 0) {
				rowY = ensureSpace(doc, rowY, cardH + cardGapY, pageW, pageH, accent)
			}
			const x = PAGE.marginX + col * (cardW + cardGapX)
			drawColourCard(doc, input.colours[i], i, x, rowY, cardW, cardH, swatchH)
			if (col === cols - 1 || i === input.colours.length - 1) {
				rowY += cardH + cardGapY
			}
		}
	}

	const hasOrigins = input.colours.some((c) => c.origin)
	if (hasOrigins && input.colours.length > 0) {
		await drawColourMapPage(
			doc,
			pageW,
			pageH,
			input.colours,
			viewBox,
			logoMap ?? logoLight,
			input.logoSrc,
			accent,
		)
	}

	await drawMeasurementsPage(
		doc,
		pageW,
		pageH,
		input,
		logoMap ?? logoLight,
		accent,
		layout,
		textColorOnLight,
	)

	const total = doc.getNumberOfPages()
	for (let i = 1; i <= total; i++) {
		doc.setPage(i)
		drawFooter(doc, pageW, pageH, title, i, total, fontName)
	}

	doc.save(`palette-${sanitizeFilenamePart(input.logoLabel)}-${todayStamp()}.pdf`)
}
