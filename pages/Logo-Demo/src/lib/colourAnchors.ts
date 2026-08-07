import { rgbDistance, type Rgb } from './colourFormat'
import {
	FALLBACK_VIEWBOX,
	listPaintableShapes,
	type PaletteColour,
	type SvgViewBox,
} from './svgPalette'

export type NormPoint = { nx: number; ny: number }

const GEOMETRY = new Set([
	'path',
	'rect',
	'circle',
	'ellipse',
	'polygon',
	'polyline',
	'line',
	'use',
])

type Peak = { x: number; y: number; score: number }

function isNearWhite(rgb: Rgb): boolean {
	return rgb.r > 250 && rgb.g > 250 && rgb.b > 250
}

function isLightTarget(rgb: Rgb): boolean {
	return rgb.r > 235 && rgb.g > 235 && rgb.b > 235
}

/** Affinity of a pixel colour to a target (1 = exact, →0 as distance grows). */
function colourAffinity(pixel: Rgb, target: Rgb): number {
	const d = rgbDistance(pixel, target)
	return 1 / (1 + (d * d) / 450)
}

/**
 * Find where `target` actually appears in image data:
 * take the score-weighted centroid of pixels in the top affinity band.
 */
function peakAffinityLocation(
	data: ImageData,
	w: number,
	h: number,
	target: Rgb,
): NormPoint | null {
	const pixels = data.data
	let maxScore = 0
	const candidates: Peak[] = []
	const step = 1

	for (let y = 0; y < h; y += step) {
		for (let x = 0; x < w; x += step) {
			const i = (y * w + x) * 4
			if (pixels[i + 3] < 40) continue
			const pixel = { r: pixels[i], g: pixels[i + 1], b: pixels[i + 2] }
			if (isNearWhite(pixel) && !isLightTarget(target)) continue
			const score = colourAffinity(pixel, target)
			if (score < 0.12) continue
			if (score > maxScore) maxScore = score
			candidates.push({ x, y, score })
		}
	}

	if (candidates.length === 0 || maxScore <= 0) return null

	const band = Math.max(0.55, maxScore * 0.82)
	let sumX = 0
	let sumY = 0
	let sumW = 0
	for (const c of candidates) {
		if (c.score < band) continue
		const weight = c.score * c.score
		sumX += c.x * weight
		sumY += c.y * weight
		sumW += weight
	}

	if (sumW <= 0) {
		const best = candidates.reduce((a, b) => (a.score >= b.score ? a : b))
		return { nx: (best.x + 0.5) / w, ny: (best.y + 0.5) / h }
	}

	return { nx: (sumX / sumW + 0.5) / w, ny: (sumY / sumW + 0.5) / h }
}

/**
 * Exclusive Voronoi ownership among palette colours, then largest connected
 * component centroid — fallback when shape isolation isn't available.
 */
function exclusiveComponentLocations(
	data: ImageData,
	w: number,
	h: number,
	colours: PaletteColour[],
): Map<string, NormPoint> {
	const result = new Map<string, NormPoint>()
	if (colours.length === 0) return result

	const pixels = data.data
	const owner = new Int16Array(w * h)
	owner.fill(-1)

	const indexById = new Map<string, number>()
	colours.forEach((c, i) => indexById.set(c.id, i))

	const MATCH = 48
	for (let y = 0; y < h; y++) {
		for (let x = 0; x < w; x++) {
			const i = (y * w + x) * 4
			if (pixels[i + 3] < 40) continue
			const pixel = { r: pixels[i], g: pixels[i + 1], b: pixels[i + 2] }
			if (isNearWhite(pixel)) continue

			let bestIdx = -1
			let bestDist = Infinity
			let second = Infinity
			for (let ci = 0; ci < colours.length; ci++) {
				const dist = rgbDistance(pixel, colours[ci].rgb)
				if (dist < bestDist) {
					second = bestDist
					bestDist = dist
					bestIdx = ci
				} else if (dist < second) {
					second = dist
				}
			}
			// Require a clear winner (or a very close match).
			if (bestIdx < 0 || bestDist > MATCH) continue
			if (bestDist > 14 && second - bestDist < 6) continue
			owner[y * w + x] = bestIdx
		}
	}

	for (let ci = 0; ci < colours.length; ci++) {
		const colour = colours[ci]
		const visited = new Uint8Array(w * h)
		let bestCount = 0
		let bestSumX = 0
		let bestSumY = 0

		for (let y = 0; y < h; y++) {
			for (let x = 0; x < w; x++) {
				const start = y * w + x
				if (owner[start] !== ci || visited[start]) continue

				let count = 0
				let sumX = 0
				let sumY = 0
				const stack = [start]
				visited[start] = 1

				while (stack.length) {
					const p = stack.pop()!
					const px = p % w
					const py = (p / w) | 0
					count += 1
					sumX += px
					sumY += py
					const neighbors = [p - 1, p + 1, p - w, p + w]
					for (const n of neighbors) {
						if (n < 0 || n >= owner.length || visited[n]) continue
						if (owner[n] !== ci) continue
						const nx = n % w
						const ny = (n / w) | 0
						if (Math.abs(nx - px) + Math.abs(ny - py) !== 1) continue
						visited[n] = 1
						stack.push(n)
					}
				}

				if (count > bestCount) {
					bestCount = count
					bestSumX = sumX
					bestSumY = sumY
				}
			}
		}

		if (bestCount > 0) {
			result.set(colour.id, {
				nx: (bestSumX / bestCount + 0.5) / w,
				ny: (bestSumY / bestCount + 0.5) / h,
			})
		} else {
			const peak = peakAffinityLocation(data, w, h, colour.rgb)
			if (peak) result.set(colour.id, peak)
		}
	}

	return result
}

async function loadImage(url: string): Promise<HTMLImageElement | null> {
	return await new Promise((resolve) => {
		const img = new Image()
		img.onload = () => resolve(img)
		img.onerror = () => resolve(null)
		img.src = url
	})
}

function rasterizeSvgElement(
	svg: SVGSVGElement,
	viewBox: SvgViewBox,
	maxSize: number,
	background: string | null = null,
): Promise<{ data: ImageData; dataUrl: string } | null> {
	return new Promise((resolve) => {
		const aspect = viewBox.width / Math.max(viewBox.height, 0.001)
		const width = aspect >= 1 ? maxSize : Math.max(1, Math.round(maxSize * aspect))
		const height = aspect >= 1 ? Math.max(1, Math.round(maxSize / aspect)) : maxSize

		const clone = svg.cloneNode(true) as SVGSVGElement
		clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
		clone.setAttribute('width', String(width))
		clone.setAttribute('height', String(height))
		if (!clone.getAttribute('viewBox')) {
			clone.setAttribute(
				'viewBox',
				`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`,
			)
		}

		const serialized = new XMLSerializer().serializeToString(clone)
		const blob = new Blob([serialized], { type: 'image/svg+xml;charset=utf-8' })
		const url = URL.createObjectURL(blob)

		const img = new Image()
		img.onload = () => {
			try {
				const canvas = document.createElement('canvas')
				canvas.width = width
				canvas.height = height
				const ctx = canvas.getContext('2d', { willReadFrequently: true })
				if (!ctx) {
					URL.revokeObjectURL(url)
					resolve(null)
					return
				}
				if (background) {
					ctx.fillStyle = background
					ctx.fillRect(0, 0, width, height)
				} else {
					ctx.clearRect(0, 0, width, height)
				}
				ctx.drawImage(img, 0, 0, width, height)
				URL.revokeObjectURL(url)
				resolve({
					data: ctx.getImageData(0, 0, width, height),
					dataUrl: canvas.toDataURL('image/png'),
				})
			} catch {
				URL.revokeObjectURL(url)
				resolve(null)
			}
		}
		img.onerror = () => {
			URL.revokeObjectURL(url)
			resolve(null)
		}
		img.src = url
	})
}

function hideOtherGeometry(root: Element, keep: Element) {
	for (const el of root.querySelectorAll('*')) {
		const tag = el.tagName.toLowerCase()
		if (!GEOMETRY.has(tag)) continue
		if (el === keep) continue
		el.setAttribute('visibility', 'hidden')
		el.setAttribute('fill', 'none')
		el.setAttribute('stroke', 'none')
	}
}

/**
 * Locate each palette colour on the logo using shape-isolated SVG renders
 * and affinity-peak sampling (much more accurate for gradients).
 * Returns anchors in the same normalized space as `previewPng` (viewBox-fitted).
 */
export async function locateColourAnchors(input: {
	logoSrc: string
	colours: PaletteColour[]
	viewBox?: SvgViewBox
}): Promise<{ anchors: Map<string, NormPoint>; previewPng: string | null }> {
	const anchors = new Map<string, NormPoint>()
	const colours = input.colours
	if (colours.length === 0) return { anchors, previewPng: null }

	const viewBox = input.viewBox ?? FALLBACK_VIEWBOX

	let svgText = ''
	try {
		const res = await fetch(input.logoSrc)
		if (!res.ok) return { anchors, previewPng: null }
		svgText = await res.text()
	} catch {
		return { anchors, previewPng: null }
	}

	const parsed = new DOMParser().parseFromString(svgText, 'image/svg+xml')
	if (parsed.querySelector('parsererror')) return { anchors, previewPng: null }
	const sourceSvg = parsed.querySelector('svg')
	if (!sourceSvg) return { anchors, previewPng: null }

	const host = document.createElement('div')
	host.setAttribute('aria-hidden', 'true')
	host.style.cssText =
		'position:fixed;left:-10000px;top:0;width:0;height:0;overflow:hidden;opacity:0;pointer-events:none'
	const live = document.importNode(sourceSvg, true) as SVGSVGElement
	host.appendChild(live)
	document.body.appendChild(host)

	let previewPng: string | null = null

	try {
		const shapes = listPaintableShapes(live)
		const byShapeId = new Map(shapes.map((s) => [s.shapeId, s.element]))

		const grouped = new Map<string, PaletteColour[]>()
		const orphan: PaletteColour[] = []
		for (const colour of colours) {
			if (colour.shapeId && byShapeId.has(colour.shapeId)) {
				const list = grouped.get(colour.shapeId) ?? []
				list.push(colour)
				grouped.set(colour.shapeId, list)
			} else {
				orphan.push(colour)
			}
		}

		const MAX = 720

		// Preview uses the exact same SVG→canvas pipeline as sampling.
		const fullPreview = await rasterizeSvgElement(live, viewBox, MAX, '#ffffff')
		previewPng = fullPreview?.dataUrl ?? null

		for (const [shapeId, group] of grouped) {
			if (!byShapeId.has(shapeId)) continue

			const iso = live.cloneNode(true) as SVGSVGElement
			const isoShapes = listPaintableShapes(iso)
			const isoTarget = isoShapes.find((s) => s.shapeId === shapeId)?.element
			if (!isoTarget) continue
			hideOtherGeometry(iso, isoTarget)

			// Transparent bg so affinity ignores empty canvas.
			const rendered = await rasterizeSvgElement(iso, viewBox, MAX, null)
			if (!rendered) continue
			const { data } = rendered
			const w = data.width
			const h = data.height

			for (const colour of group) {
				const peak = peakAffinityLocation(data, w, h, colour.rgb)
				if (peak) anchors.set(colour.id, peak)
			}
		}

		const missing = colours.filter((c) => !anchors.has(c.id))
		if (missing.length > 0 && fullPreview) {
			const full = fullPreview.data
			for (const colour of missing) {
				const peak = peakAffinityLocation(full, full.width, full.height, colour.rgb)
				if (peak) anchors.set(colour.id, peak)
			}
			const stillMissing = missing.filter((c) => !anchors.has(c.id))
			if (stillMissing.length > 0) {
				const fallback = exclusiveComponentLocations(
					full,
					full.width,
					full.height,
					stillMissing,
				)
				for (const [id, pt] of fallback) anchors.set(id, pt)
			}
		}

		if (orphan.length > 0 && fullPreview) {
			const full = fullPreview.data
			for (const colour of orphan) {
				if (anchors.has(colour.id)) continue
				const peak = peakAffinityLocation(full, full.width, full.height, colour.rgb)
				if (peak) anchors.set(colour.id, peak)
			}
		}
	} finally {
		host.remove()
	}

	return { anchors, previewPng }
}

/** Debug/helper: locate from an already-rasterized PNG (legacy path). */
export async function locateColourAnchorsInPng(
	dataUrl: string,
	colours: PaletteColour[],
): Promise<Map<string, NormPoint>> {
	const result = new Map<string, NormPoint>()
	const img = await loadImage(dataUrl)
	if (!img || colours.length === 0) return result

	const w = Math.max(1, img.naturalWidth)
	const h = Math.max(1, img.naturalHeight)
	const canvas = document.createElement('canvas')
	canvas.width = w
	canvas.height = h
	const ctx = canvas.getContext('2d', { willReadFrequently: true })
	if (!ctx) return result
	ctx.drawImage(img, 0, 0)
	let data: ImageData
	try {
		data = ctx.getImageData(0, 0, w, h)
	} catch {
		return result
	}

	for (const colour of colours) {
		const peak = peakAffinityLocation(data, w, h, colour.rgb)
		if (peak) result.set(colour.id, peak)
	}
	const missing = colours.filter((c) => !result.has(c.id))
	if (missing.length > 0) {
		const fallback = exclusiveComponentLocations(data, w, h, missing)
		for (const [id, pt] of fallback) result.set(id, pt)
	}
	return result
}
