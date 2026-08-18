import { describe, expect, it } from 'vitest'
import {
	buildLayoutManifest,
	computeExportCanvasSize,
	drawSpacedText,
	PNG_EXPORT,
	sanitizeFilenamePart,
	sizeSvgMarkup,
	todayStamp,
} from './exportLogoPng'
import { buildMarkLayoutMetrics, computeLogoBoxMetrics, UI_LAYOUT } from './layoutMetrics'

function fakeLayout(opts?: { withText?: boolean; logoScale?: number; textScale?: number }) {
	const logoScale = opts?.logoScale ?? 1
	const textScale = opts?.textScale ?? 1
	const logo = computeLogoBoxMetrics(100, 100, logoScale)
	const text = opts?.withText === false
		? null
		: {
				text: 'Sylenze',
				fontSize: UI_LAYOUT.textBaseFontPx * textScale,
				width: 180 * textScale,
				height: UI_LAYOUT.textBaseFontPx * textScale * UI_LAYOUT.textLineHeight,
				glyphHeight: 40 * textScale,
				aspectRatio: 180 / (UI_LAYOUT.textBaseFontPx * UI_LAYOUT.textLineHeight),
				maxWidth: UI_LAYOUT.textMaxWidthPx * textScale,
				truncated: false,
			}
	return buildMarkLayoutMetrics(logo, text, { logoScale, textScale })
}

describe('exportLogoPng helpers', () => {
	it('sanitizes filename parts', () => {
		expect(sanitizeFilenamePart('Asset 2 Icons')).toBe('Asset-2-Icons')
		expect(sanitizeFilenamePart('  ***  ')).toBe('logo')
		expect(sanitizeFilenamePart('Sylenze')).toBe('Sylenze')
	})

	it('formats todayStamp', () => {
		expect(todayStamp(new Date(2026, 7, 18))).toBe('2026-08-18')
	})

	it('sizes the PNG canvas from preview layout plus padding and scale', () => {
		const layout = fakeLayout({ withText: true, logoScale: 1, textScale: 1 })
		const size = computeExportCanvasSize(layout)
		expect(size.padding).toBe(PNG_EXPORT.paddingPx)
		expect(size.scale).toBe(PNG_EXPORT.scale)
		expect(size.cssWidth).toBe(Math.ceil(layout.overallWidth + PNG_EXPORT.paddingPx * 2))
		expect(size.cssHeight).toBe(Math.ceil(layout.overallHeight + PNG_EXPORT.paddingPx * 2))
		expect(size.pixelWidth).toBe(size.cssWidth * PNG_EXPORT.scale)
		expect(size.pixelHeight).toBe(size.cssHeight * PNG_EXPORT.scale)
	})

	it('sizes a high-resolution canvas at 8×', () => {
		const layout = fakeLayout({ withText: true, logoScale: 1, textScale: 1 })
		const standard = computeExportCanvasSize(layout)
		const hi = computeExportCanvasSize(layout, PNG_EXPORT.paddingPx, PNG_EXPORT.highResScale)
		expect(PNG_EXPORT.highResScale).toBe(8)
		expect(hi.scale).toBe(8)
		expect(hi.cssWidth).toBe(standard.cssWidth)
		expect(hi.pixelWidth).toBe(standard.pixelWidth * 4)
	})

	it('sets explicit SVG width and height for sharp rasterization', () => {
		const src = '<svg viewBox="0 0 10 20" xmlns="http://www.w3.org/2000/svg"></svg>'
		const sized = sizeSvgMarkup(src, 800, 1600)
		expect(sized).toContain('width="800"')
		expect(sized).toContain('height="1600"')
		expect(sized).toContain('viewBox="0 0 10 20"')

		const withSize = '<svg width="10" height="20" viewBox="0 0 10 20"></svg>'
		const replaced = sizeSvgMarkup(withSize, 400, 800)
		expect(replaced).toContain('width="400"')
		expect(replaced).toContain('height="800"')
		expect(replaced).not.toMatch(/width="10"/)
	})

	it('keeps logo/text ratios in the zip layout manifest', () => {
		const layout = fakeLayout({ withText: true, logoScale: 1.5, textScale: 0.8 })
		const canvas = computeExportCanvasSize(layout)
		const manifest = buildLayoutManifest(
			layout,
			{
				companyName: 'Sylenze',
				fontName: 'Inter',
				fontFamily: "'Inter', sans-serif",
				logoLabel: 'Asset 2',
			},
			canvas,
		)
		expect(manifest.scales.logo).toBe('150%')
		expect(manifest.scales.text).toBe('80%')
		expect(manifest.font).toBe('Inter')
		expect(manifest.sizes.gap).toBe('20px')
		expect(manifest.ratios.logoHToTextH).toMatch(/\d/)
		expect(manifest.sizes.export.scale).toBe(2)
	})

	it('draws letter-spaced glyphs left to right', () => {
		const fills: Array<{ ch: string; x: number }> = []
		const widths: Record<string, number> = { S: 10, y: 8 }
		const ctx = {
			measureText: (s: string) => ({
				width: [...s].reduce((sum, ch) => sum + (widths[ch] ?? 10), 0),
			}),
			fillText: (ch: string, x: number) => {
				fills.push({ ch, x })
			},
		} as unknown as CanvasRenderingContext2D

		drawSpacedText(ctx, 'Sy', 0, 0, -2, 1000)
		expect(fills.map((f) => f.ch)).toEqual(['S', 'y'])
		expect(fills[1].x).toBe(8) // 10 + (-2)
	})
})
