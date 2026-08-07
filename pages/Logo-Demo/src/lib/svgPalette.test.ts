import { describe, expect, it } from 'vitest'
import {
	compositeOnWhite,
	expandHex,
	formatHslCss,
	formatOklchCss,
	formatRgbCss,
	parseColourString,
	rgbDistance,
	rgbToHex,
} from './colourFormat'
import {
	buildFlatPalette,
	createCustomColour,
	extractPaletteFromSvgText,
	mapSvgPointToRect,
} from './svgPalette'
import solidSvg from './fixtures/solid-and-rgb.svg?raw'
import gradientSvg from './fixtures/gradient-css-class.svg?raw'
import tinySvg from './fixtures/tiny-paths.svg?raw'

describe('colourFormat', () => {
	it('expands short hex to uppercase #RRGGBB', () => {
		expect(expandHex('#abc')).toBe('#AABBCC')
		expect(expandHex('#AABBCC')).toBe('#AABBCC')
	})

	it('parses rgb and rgba with composite-on-white', () => {
		const solid = parseColourString('rgb(61, 108, 180)')
		expect(solid?.hex).toBe('#3D6CB4')
		expect(formatRgbCss(solid!.rgb)).toBe('rgb(61, 108, 180)')

		const translucent = parseColourString('rgba(0, 0, 0, 0.5)')
		expect(translucent?.hex).toBe(rgbToHex(compositeOnWhite(0, 0, 0, 0.5)))
	})

	it('composites 8-digit hex on white', () => {
		const parsed = parseColourString('#00000080')
		expect(parsed).not.toBeNull()
		expect(parsed!.rgb.r).toBeGreaterThan(0)
	})

	it('formats HSL and OKLCH from sRGB', () => {
		const red = parseColourString('#ff0000')!.rgb
		expect(formatHslCss(red)).toBe('hsl(0 100% 50%)')
		expect(formatOklchCss(red)).toMatch(/^oklch\(/)

		const gray = parseColourString('#808080')!.rgb
		expect(formatHslCss(gray)).toMatch(/^hsl\(0 0%/)
		const oklchGray = formatOklchCss(gray)
		expect(oklchGray).toMatch(/oklch\(/)
		// Achromatic → hue collapsed to 0
		expect(oklchGray.endsWith(' 0)')).toBe(true)
	})

	it('reports near-dupe distance', () => {
		const a = parseColourString('#3465b0')!.rgb
		const b = parseColourString('#2f5a9e')!.rgb
		expect(rgbDistance(a, b)).toBeLessThan(30)
	})
})

describe('extractPaletteFromSvgText', () => {
	it('extracts solid hex and rgb fills', () => {
		const palette = extractPaletteFromSvgText(solidSvg)
		const hexes = palette.auto.map((c) => c.hex)
		expect(hexes).toContain('#336699')
		expect(hexes).toContain('#FF8000')
		expect(palette.lightest).toBe('#FF8000')
		expect(palette.darkest).toBe('#336699')
		expect(palette.auto[0].label).toBe('Lightest')
		expect(palette.auto[1].label).toBe('Darkest')
	})

	it('resolves CSS class gradients and xlink:href inheritance', () => {
		const palette = extractPaletteFromSvgText(gradientSvg)
		const hexes = new Set(palette.auto.map((c) => c.hex))
		expect(hexes.has('#112233')).toBe(true)
		expect(hexes.has('#AABBCC')).toBe(true)
		// Mid stop may survive depending on cap/rank; endpoints preferred
		expect(palette.auto.length).toBeGreaterThanOrEqual(2)
		expect(palette.auto.length).toBeLessThanOrEqual(24)
	})

	it('skips tiny/degenerate geometry when a real shape exists', () => {
		const palette = extractPaletteFromSvgText(tinySvg)
		const hexes = palette.auto.map((c) => c.hex)
		expect(hexes).toContain('#00FF00')
	})

	it('attaches SVG origin points and viewBox for mapped colours', () => {
		const palette = extractPaletteFromSvgText(solidSvg)
		expect(palette.viewBox.width).toBeGreaterThan(0)
		expect(palette.viewBox.height).toBeGreaterThan(0)
		const withOrigin = palette.auto.filter((c) => c.origin)
		expect(withOrigin.length).toBeGreaterThan(0)
		for (const colour of withOrigin) {
			expect(colour.origin!.x).toBeGreaterThanOrEqual(palette.viewBox.x)
			expect(colour.origin!.y).toBeGreaterThanOrEqual(palette.viewBox.y)
			expect(colour.origin!.x).toBeLessThanOrEqual(palette.viewBox.x + palette.viewBox.width)
			expect(colour.origin!.y).toBeLessThanOrEqual(palette.viewBox.y + palette.viewBox.height)
		}
	})

	it('maps relative path geometry into the viewBox', () => {
		const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
			<path d="M10,20c10,0 20,10 30,10c5,5 10,15 15,20" fill="#112233"/>
			<path d="M60,70l20,10l-5,15l-15,-5z" fill="#AABBCC"/>
		</svg>`
		const palette = extractPaletteFromSvgText(svg)
		const withOrigin = palette.auto.filter((c) => c.origin)
		expect(withOrigin.length).toBeGreaterThan(0)
		for (const colour of withOrigin) {
			expect(colour.origin!.x).toBeGreaterThanOrEqual(0)
			expect(colour.origin!.y).toBeGreaterThanOrEqual(0)
			expect(colour.origin!.x).toBeLessThanOrEqual(100)
			expect(colour.origin!.y).toBeLessThanOrEqual(100)
		}
		// Relative curve should not produce a bbox near the origin from delta misreads.
		const dark = withOrigin.find((c) => c.hex === '#112233')
		expect(dark?.origin?.x).toBeGreaterThan(10)
		expect(dark?.origin?.y).toBeGreaterThan(15)
	})

	it('maps SVG points into a PDF image rectangle', () => {
		const mapped = mapSvgPointToRect(
			{ x: 50, y: 25 },
			{ x: 0, y: 0, width: 100, height: 50 },
			{ x: 10, y: 20, width: 200, height: 100 },
		)
		expect(mapped.x).toBeCloseTo(110)
		expect(mapped.y).toBeCloseTo(70)
	})

	it('builds flat list with customs after autos', () => {
		const palette = extractPaletteFromSvgText(solidSvg)
		const custom = createCustomColour('#123456')!
		const flat = buildFlatPalette(palette.auto, [custom])
		expect(flat[flat.length - 1].hex).toBe('#123456')
		expect(flat[flat.length - 1].source).toBe('custom')
	})

	it('does not duplicate exact-hex customs already in autos', () => {
		const palette = extractPaletteFromSvgText(solidSvg)
		const existing = palette.auto[0].hex
		const custom = createCustomColour(existing)!
		const flat = buildFlatPalette(palette.auto, [custom])
		expect(flat.filter((c) => c.hex === existing).length).toBe(1)
	})
})
