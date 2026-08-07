import { describe, expect, it } from 'vitest'
import {
	buildMarkLayoutMetrics,
	computeLogoBoxMetrics,
	formatPx,
	formatRatio,
	formatRatioPair,
	UI_LAYOUT,
} from './layoutMetrics'

describe('layoutMetrics', () => {
	it('scales logo box from UI logo scale', () => {
		const square = computeLogoBoxMetrics(100, 100, 1)
		expect(square.boxHeight).toBe(UI_LAYOUT.logoBaseHeightPx)
		expect(square.boxWidth).toBe(UI_LAYOUT.logoBaseHeightPx)
		expect(square.visualWidth).toBeCloseTo(square.boxWidth)
		expect(square.visualHeight).toBeCloseTo(square.boxHeight)

		const wide = computeLogoBoxMetrics(200, 100, 1)
		expect(wide.boxWidth).toBe(UI_LAYOUT.logoMaxWidthPx)
		expect(wide.visualWidth).toBeCloseTo(UI_LAYOUT.logoMaxWidthPx)
		expect(wide.visualHeight).toBeLessThan(wide.boxHeight)

		const at2 = computeLogoBoxMetrics(100, 100, 2)
		expect(at2.boxHeight).toBe(UI_LAYOUT.logoBaseHeightPx * 2)
		expect(at2.boxWidth).toBe(UI_LAYOUT.logoBaseHeightPx * 2)
	})

	it('builds gap and height ratios from scales', () => {
		const logo = computeLogoBoxMetrics(100, 100, 1)
		const text = {
			text: 'Acme',
			fontSize: 48,
			width: 120,
			height: 48 * 1.1,
			glyphHeight: 40,
			aspectRatio: 120 / (48 * 1.1),
			maxWidth: 420,
			truncated: false,
		}
		const layout = buildMarkLayoutMetrics(logo, text, { logoScale: 1, textScale: 1 })
		expect(layout.gap).toBe(UI_LAYOUT.gapPx)
		expect(layout.overallWidth).toBe(logo.boxWidth + UI_LAYOUT.gapPx + text.width)
		expect(layout.ratios.logoScalePct).toBe(100)
		expect(layout.ratios.logoHeightToTextHeight).toBeCloseTo(logo.visualHeight / text.height)
	})

	it('formats px and ratios', () => {
		expect(formatPx(140)).toBe('140px')
		expect(formatPx(52.25)).toBe('52.3px')
		expect(formatRatio(1)).toBe('1 : 1')
		expect(formatRatioPair(200, 100)).toBe('2.00 : 1')
		expect(formatRatioPair(50, 100)).toBe('1 : 2.00')
	})
})
