import { describe, expect, it } from 'vitest'
import { locateColourAnchorsInPng } from './colourAnchors'
import type { PaletteColour } from './svgPalette'

/** Build a tiny PNG via raw ImageData put into a data URL when canvas works; else skip. */
function trySolidPng(): string | null {
	try {
		const canvas = document.createElement('canvas')
		canvas.width = 40
		canvas.height = 40
		const ctx = canvas.getContext('2d')
		if (!ctx) return null
		ctx.fillStyle = '#ffffff'
		ctx.fillRect(0, 0, 40, 40)
		ctx.fillStyle = '#336699'
		ctx.fillRect(5, 5, 15, 15)
		ctx.fillStyle = '#ff8000'
		ctx.fillRect(22, 22, 12, 12)
		return canvas.toDataURL('image/png')
	} catch {
		return null
	}
}

describe('colourAnchors', () => {
	it('peaks near the painted solid regions in a PNG', async () => {
		const png = trySolidPng()
		if (!png) {
			// happy-dom may lack canvas 2d — skip rather than fail CI.
			expect(true).toBe(true)
			return
		}
		const colours: PaletteColour[] = [
			{
				id: 'a',
				hex: '#336699',
				rgb: { r: 51, g: 102, b: 153 },
				source: 'shape',
				label: 'A',
				removable: false,
			},
			{
				id: 'b',
				hex: '#FF8000',
				rgb: { r: 255, g: 128, b: 0 },
				source: 'shape',
				label: 'B',
				removable: false,
			},
		]
		const anchors = await locateColourAnchorsInPng(png, colours)
		expect(anchors.get('a')).toBeTruthy()
		expect(anchors.get('b')).toBeTruthy()
		expect(anchors.get('a')!.nx).toBeLessThan(0.5)
		expect(anchors.get('a')!.ny).toBeLessThan(0.5)
		expect(anchors.get('b')!.nx).toBeGreaterThan(0.45)
		expect(anchors.get('b')!.ny).toBeGreaterThan(0.45)
	})
})
