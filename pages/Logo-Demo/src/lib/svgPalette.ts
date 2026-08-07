import {
	NEAR_DUPE_RGB_DISTANCE,
	hexToRgb,
	parseColourString,
	relativeLuminance,
	rgbDistance,
	saturation,
	type ParsedColour,
	type Rgb,
} from './colourFormat'

export type ColourSource = 'extreme' | 'shape' | 'custom'

/** Point in SVG user units (same space as viewBox). */
export type SvgPoint = { x: number; y: number }

export type SvgViewBox = { x: number; y: number; width: number; height: number }

export type PaletteColour = {
	id: string
	hex: string
	rgb: Rgb
	source: ColourSource
	label: string
	shapeId?: string
	removable: boolean
	/** Sample point on the logo where this colour originates (SVG units). */
	origin?: SvgPoint
}

export type ExtractedPalette = {
	extremes: PaletteColour[]
	fromShapes: PaletteColour[]
	/** Flat auto list: extremes then shapes (no customs). */
	auto: PaletteColour[]
	lightest: string
	darkest: string
	viewBox: SvgViewBox
}

export const FALLBACK_EXTREMES = { darkest: '#111111', lightest: '#EEEEEE' } as const
export const FALLBACK_VIEWBOX: SvgViewBox = { x: 0, y: 0, width: 100, height: 100 }

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

const PER_SHAPE_CAP = 4
const GLOBAL_AUTO_CAP = 24

type GradientInfo = {
	stops: ParsedColour[]
	href: string | null
}

type ShapeColourHit = {
	parsed: ParsedColour
	origin: SvgPoint
	shapeId: string
	label: string
	area: number
}

function uid(prefix: string): string {
	return `${prefix}-${Math.random().toString(36).slice(2, 9)}`
}

function toPaletteColour(
	parsed: ParsedColour,
	source: ColourSource,
	label: string,
	opts?: { shapeId?: string; origin?: SvgPoint },
): PaletteColour {
	return {
		id: uid(source),
		hex: parsed.hex,
		rgb: parsed.rgb,
		source,
		label,
		shapeId: opts?.shapeId,
		origin: opts?.origin,
		removable: source === 'custom',
	}
}

function getAttr(el: Element, name: string): string | null {
	return (
		el.getAttribute(name) ??
		el.getAttribute(name.toLowerCase()) ??
		el.getAttributeNS('http://www.w3.org/1999/xlink', name.replace(/^xlink:/, ''))
	)
}

function numAttr(el: Element, name: string, fallback = 0): number {
	const v = Number.parseFloat(el.getAttribute(name) ?? '')
	return Number.isFinite(v) ? v : fallback
}

function parseViewBox(doc: Document): SvgViewBox {
	return parseViewBoxFromSvg(doc.querySelector('svg'))
}

type BBox = { x: number; y: number; width: number; height: number }

function bboxCenter(b: BBox): SvgPoint {
	return { x: b.x + b.width / 2, y: b.y + b.height / 2 }
}

function parsePointsAttr(raw: string | null): SvgPoint[] {
	if (!raw?.trim()) return []
	const nums = raw
		.trim()
		.split(/[\s,]+/)
		.map((n) => Number.parseFloat(n))
		.filter((n) => Number.isFinite(n))
	const pts: SvgPoint[] = []
	for (let i = 0; i + 1 < nums.length; i += 2) {
		pts.push({ x: nums[i], y: nums[i + 1] })
	}
	return pts
}

/** Approximate path bbox by walking commands (absolute + relative). */
function pathBBox(d: string): BBox | null {
	if (!d.trim()) return null

	const tokens: string[] = []
	const re = /([MmLlHhVvCcSsQqTtAaZz])|(-?\d*\.?\d+(?:e[-+]?\d+)?)/gi
	let m: RegExpExecArray | null
	while ((m = re.exec(d))) {
		tokens.push(m[1] ?? m[2])
	}
	if (tokens.length === 0) return null

	let i = 0
	let cmd = ''
	let cx = 0
	let cy = 0
	let startX = 0
	let startY = 0
	let lastCx = 0
	let lastCy = 0
	let minX = Infinity
	let minY = Infinity
	let maxX = -Infinity
	let maxY = -Infinity

	const include = (x: number, y: number) => {
		if (!Number.isFinite(x) || !Number.isFinite(y)) return
		minX = Math.min(minX, x)
		minY = Math.min(minY, y)
		maxX = Math.max(maxX, x)
		maxY = Math.max(maxY, y)
	}

	const nextNum = (): number | null => {
		if (i >= tokens.length) return null
		const t = tokens[i]
		if (/^[MmLlHhVvCcSsQqTtAaZz]$/.test(t)) return null
		i += 1
		const n = Number.parseFloat(t)
		return Number.isFinite(n) ? n : null
	}

	const read = (count: number): number[] | null => {
		const out: number[] = []
		for (let k = 0; k < count; k++) {
			const n = nextNum()
			if (n == null) return null
			out.push(n)
		}
		return out
	}

	while (i < tokens.length) {
		const t = tokens[i]
		if (/^[MmLlHhVvCcSsQqTtAaZz]$/.test(t)) {
			cmd = t
			i += 1
		} else if (!cmd) {
			i += 1
			continue
		}

		const abs = cmd === cmd.toUpperCase()
		const c = cmd.toUpperCase()

		if (c === 'Z') {
			cx = startX
			cy = startY
			include(cx, cy)
			continue
		}

		if (c === 'M' || c === 'L' || c === 'T') {
			const pair = read(2)
			if (!pair) break
			const x = abs ? pair[0] : cx + pair[0]
			const y = abs ? pair[1] : cy + pair[1]
			cx = x
			cy = y
			include(cx, cy)
			if (c === 'M') {
				startX = cx
				startY = cy
				cmd = abs ? 'L' : 'l'
			}
			if (c === 'T') {
				lastCx = cx
				lastCy = cy
			}
			continue
		}

		if (c === 'H') {
			const n = nextNum()
			if (n == null) break
			cx = abs ? n : cx + n
			include(cx, cy)
			continue
		}

		if (c === 'V') {
			const n = nextNum()
			if (n == null) break
			cy = abs ? n : cy + n
			include(cx, cy)
			continue
		}

		if (c === 'C') {
			const p = read(6)
			if (!p) break
			const x1 = abs ? p[0] : cx + p[0]
			const y1 = abs ? p[1] : cy + p[1]
			const x2 = abs ? p[2] : cx + p[2]
			const y2 = abs ? p[3] : cy + p[3]
			const x = abs ? p[4] : cx + p[4]
			const y = abs ? p[5] : cy + p[5]
			include(x1, y1)
			include(x2, y2)
			include(x, y)
			lastCx = x2
			lastCy = y2
			cx = x
			cy = y
			continue
		}

		if (c === 'S' || c === 'Q') {
			const p = read(4)
			if (!p) break
			const x1 = abs ? p[0] : cx + p[0]
			const y1 = abs ? p[1] : cy + p[1]
			const x = abs ? p[2] : cx + p[2]
			const y = abs ? p[3] : cy + p[3]
			include(x1, y1)
			include(x, y)
			lastCx = x1
			lastCy = y1
			cx = x
			cy = y
			continue
		}

		if (c === 'A') {
			const p = read(7)
			if (!p) break
			const x = abs ? p[5] : cx + p[5]
			const y = abs ? p[6] : cy + p[6]
			include(cx, cy)
			include(x, y)
			cx = x
			cy = y
			continue
		}

		// Unknown / unhandled — stop rather than desync
		break
	}

	if (!Number.isFinite(minX) || !Number.isFinite(minY)) return null
	return {
		x: minX,
		y: minY,
		width: Math.max(0.01, maxX - minX),
		height: Math.max(0.01, maxY - minY),
	}
}

function geometryBBox(el: Element): BBox | null {
	// Prefer the browser bbox when the element is rendered (handles relative paths / curves).
	const graphics = el as SVGGraphicsElement
	if (typeof graphics.getBBox === 'function') {
		try {
			const b = graphics.getBBox()
			if (Number.isFinite(b.x) && Number.isFinite(b.y) && (b.width > 0 || b.height > 0)) {
				return {
					x: b.x,
					y: b.y,
					width: Math.max(0.01, b.width),
					height: Math.max(0.01, b.height),
				}
			}
		} catch {
			// Not rendered / unsupported — fall through to attribute parsing.
		}
	}

	const tag = el.tagName.toLowerCase()
	if (tag === 'rect') {
		const x = numAttr(el, 'x')
		const y = numAttr(el, 'y')
		const width = numAttr(el, 'width')
		const height = numAttr(el, 'height')
		if (width <= 0 || height <= 0) return null
		return { x, y, width, height }
	}
	if (tag === 'circle') {
		const cx = numAttr(el, 'cx')
		const cy = numAttr(el, 'cy')
		const r = numAttr(el, 'r')
		if (r <= 0) return null
		return { x: cx - r, y: cy - r, width: r * 2, height: r * 2 }
	}
	if (tag === 'ellipse') {
		const cx = numAttr(el, 'cx')
		const cy = numAttr(el, 'cy')
		const rx = numAttr(el, 'rx')
		const ry = numAttr(el, 'ry')
		if (rx <= 0 || ry <= 0) return null
		return { x: cx - rx, y: cy - ry, width: rx * 2, height: ry * 2 }
	}
	if (tag === 'line') {
		const x1 = numAttr(el, 'x1')
		const y1 = numAttr(el, 'y1')
		const x2 = numAttr(el, 'x2')
		const y2 = numAttr(el, 'y2')
		return {
			x: Math.min(x1, x2),
			y: Math.min(y1, y2),
			width: Math.max(0.01, Math.abs(x2 - x1)),
			height: Math.max(0.01, Math.abs(y2 - y1)),
		}
	}
	if (tag === 'polygon' || tag === 'polyline') {
		const pts = parsePointsAttr(el.getAttribute('points'))
		if (pts.length === 0) return null
		let minX = pts[0].x
		let minY = pts[0].y
		let maxX = pts[0].x
		let maxY = pts[0].y
		for (const p of pts) {
			minX = Math.min(minX, p.x)
			minY = Math.min(minY, p.y)
			maxX = Math.max(maxX, p.x)
			maxY = Math.max(maxY, p.y)
		}
		return {
			x: minX,
			y: minY,
			width: Math.max(0.01, maxX - minX),
			height: Math.max(0.01, maxY - minY),
		}
	}
	if (tag === 'path') {
		return pathBBox(el.getAttribute('d') ?? '')
	}
	return null
}

function samplePointInBBox(bbox: BBox, index: number, total: number): SvgPoint {
	if (total <= 1) return bboxCenter(bbox)
	const t = index / (total - 1)
	return {
		x: bbox.x + bbox.width * (0.2 + t * 0.6),
		y: bbox.y + bbox.height * (0.35 + (index % 2) * 0.25),
	}
}

function parseStyleDeclarations(styleText: string): Map<string, string> {
	const map = new Map<string, string>()
	for (const part of styleText.split(';')) {
		const idx = part.indexOf(':')
		if (idx < 0) continue
		const prop = part.slice(0, idx).trim().toLowerCase()
		const val = part.slice(idx + 1).trim()
		if (prop && val) map.set(prop, val)
	}
	return map
}

function buildClassPaintMap(root: ParentNode): Map<string, { fill?: string; stroke?: string }> {
	const map = new Map<string, { fill?: string; stroke?: string }>()
	const styles = root.querySelectorAll('style')
	for (const styleEl of styles) {
		const css = styleEl.textContent ?? ''
		const ruleRe = /\.([A-Za-z_][\w-]*)\s*\{([^}]*)\}/g
		let m: RegExpExecArray | null
		while ((m = ruleRe.exec(css))) {
			const className = m[1]
			const decls = parseStyleDeclarations(m[2])
			const entry = map.get(className) ?? {}
			if (decls.has('fill')) entry.fill = decls.get('fill')
			if (decls.has('stroke')) entry.stroke = decls.get('stroke')
			map.set(className, entry)
		}
	}
	return map
}

function buildGradientMap(root: ParentNode): Map<string, GradientInfo> {
	const map = new Map<string, GradientInfo>()
	const nodes = root.querySelectorAll('linearGradient, radialGradient')
	for (const node of nodes) {
		const id = node.getAttribute('id')
		if (!id) continue
		const href = getAttr(node, 'href') ?? getAttr(node, 'xlink:href') ?? null
		const stops: ParsedColour[] = []
		for (const stop of node.querySelectorAll('stop')) {
			const fromAttr =
				stop.getAttribute('stop-color') ??
				parseStyleDeclarations(stop.getAttribute('style') ?? '').get('stop-color')
			if (!fromAttr) continue
			const parsed = parseColourString(fromAttr)
			if (parsed) stops.push(parsed)
		}
		map.set(id, {
			stops,
			href: href?.startsWith('#') ? href.slice(1) : href,
		})
	}
	return map
}

function resolveGradientStops(
	id: string,
	gradients: Map<string, GradientInfo>,
	seen = new Set<string>(),
): ParsedColour[] {
	if (seen.has(id)) return []
	seen.add(id)
	const g = gradients.get(id)
	if (!g) return []
	if (g.stops.length > 0) return g.stops
	if (g.href) return resolveGradientStops(g.href, gradients, seen)
	return []
}

function paintFromClasses(
	el: Element,
	classMap: Map<string, { fill?: string; stroke?: string }>,
): { fill?: string; stroke?: string } {
	const classAttr = el.getAttribute('class')
	if (!classAttr) return {}
	const result: { fill?: string; stroke?: string } = {}
	for (const name of classAttr.split(/\s+/)) {
		const entry = classMap.get(name)
		if (!entry) continue
		if (entry.fill && !result.fill) result.fill = entry.fill
		if (entry.stroke && !result.stroke) result.stroke = entry.stroke
	}
	return result
}

function resolvePaintValue(
	raw: string | undefined,
	gradients: Map<string, GradientInfo>,
): ParsedColour[] {
	if (!raw) return []
	const value = raw.trim()
	if (!value || value === 'none') return []

	const urlMatch = value.match(/url\(\s*['"]?#([^)'"]+)['"]?\s*\)/i)
	if (urlMatch) return resolveGradientStops(urlMatch[1], gradients)

	const parsed = parseColourString(value)
	return parsed ? [parsed] : []
}

function isTinyGeometry(el: Element): boolean {
	const tag = el.tagName.toLowerCase()
	if (tag === 'path') {
		const d = (el.getAttribute('d') ?? '').trim()
		if (!d || d.length < 24) return true
	}
	if (tag === 'rect') {
		const w = Number.parseFloat(el.getAttribute('width') ?? '0')
		const h = Number.parseFloat(el.getAttribute('height') ?? '0')
		if (w > 0 && h > 0 && w * h < 0.5) return true
	}
	if (tag === 'circle' || tag === 'ellipse') {
		const r = Number.parseFloat(el.getAttribute('r') ?? '0')
		const rx = Number.parseFloat(el.getAttribute('rx') ?? '0')
		const ry = Number.parseFloat(el.getAttribute('ry') ?? '0')
		if (tag === 'circle' && r > 0 && r < 0.25) return true
		if (tag === 'ellipse' && rx * ry > 0 && rx * ry < 0.25) return true
	}
	return false
}

/**
 * Same shape enumeration order as palette extraction (for shapeId → element mapping).
 */
export function listPaintableShapes(root: Element): Array<{ shapeId: string; element: Element }> {
	const gradients = buildGradientMap(root)
	const classMap = buildClassPaintMap(root)
	const shapes: Array<{ shapeId: string; element: Element }> = []
	let shapeIndex = 0

	for (const el of root.querySelectorAll('*')) {
		const tag = el.tagName.toLowerCase()
		if (!GEOMETRY.has(tag) || isTinyGeometry(el)) continue

		const styleDecls = parseStyleDeclarations(el.getAttribute('style') ?? '')
		const fromClass = paintFromClasses(el, classMap)
		const fillRaw = el.getAttribute('fill') ?? styleDecls.get('fill') ?? fromClass.fill
		const strokeRaw = el.getAttribute('stroke') ?? styleDecls.get('stroke') ?? fromClass.stroke
		const combined = [
			...resolvePaintValue(fillRaw, gradients),
			...resolvePaintValue(strokeRaw, gradients),
		]
		if (combined.length === 0) continue

		shapeIndex += 1
		const shapeId = el.getAttribute('id') || `shape-${shapeIndex}`
		shapes.push({ shapeId, element: el })
	}
	return shapes
}

function rankShapeColours(colours: ParsedColour[]): ParsedColour[] {
	const unique: ParsedColour[] = []
	const seen = new Set<string>()
	const ordered = [...colours]
	const prioritized =
		ordered.length >= 2
			? [
					ordered[0],
					ordered[ordered.length - 1],
					...ordered.slice(1, -1).sort((a, b) => saturation(b.rgb) - saturation(a.rgb)),
				]
			: ordered

	for (const c of prioritized) {
		if (seen.has(c.hex)) continue
		seen.add(c.hex)
		unique.push(c)
		if (unique.length >= PER_SHAPE_CAP) break
	}
	return unique
}

function mergeNearDuplicates(colours: PaletteColour[]): PaletteColour[] {
	const result: PaletteColour[] = []
	for (const colour of colours) {
		const near = result.find((existing) => {
			if (existing.hex === colour.hex) return true
			return rgbDistance(existing.rgb, colour.rgb) <= NEAR_DUPE_RGB_DISTANCE
		})
		if (near) continue
		result.push(colour)
	}
	return result
}

function pickBestHit(hits: ShapeColourHit[], hex: string): ShapeColourHit | undefined {
	const matches = hits.filter((h) => h.parsed.hex === hex)
	if (matches.length === 0) return undefined
	return matches.reduce((best, h) => (h.area > best.area ? h : best))
}

/** Parse SVG markup into a palette (no network). Exported for tests. */
export function extractPaletteFromSvgText(svgText: string): ExtractedPalette {
	const fallbackLight = parseColourString(FALLBACK_EXTREMES.lightest)!
	const fallbackDark = parseColourString(FALLBACK_EXTREMES.darkest)!
	const empty = (): ExtractedPalette => ({
		extremes: [
			toPaletteColour(fallbackLight, 'extreme', 'Lightest'),
			toPaletteColour(fallbackDark, 'extreme', 'Darkest'),
		],
		fromShapes: [],
		auto: [
			toPaletteColour(fallbackLight, 'extreme', 'Lightest'),
			toPaletteColour(fallbackDark, 'extreme', 'Darkest'),
		],
		lightest: FALLBACK_EXTREMES.lightest,
		darkest: FALLBACK_EXTREMES.darkest,
		viewBox: { ...FALLBACK_VIEWBOX },
	})

	const parsedDoc = new DOMParser().parseFromString(svgText, 'image/svg+xml')
	if (parsedDoc.querySelector('parsererror')) return empty()

	const sourceSvg = parsedDoc.querySelector('svg')
	if (!sourceSvg) return empty()

	// Mount into the live document so getBBox() can resolve path geometry accurately.
	let host: HTMLDivElement | null = null
	let root: Element = sourceSvg
	if (typeof document !== 'undefined' && document.body) {
		host = document.createElement('div')
		host.setAttribute('aria-hidden', 'true')
		host.style.cssText =
			'position:fixed;left:-10000px;top:0;width:0;height:0;overflow:hidden;opacity:0;pointer-events:none'
		const live = document.importNode(sourceSvg, true) as SVGSVGElement
		host.appendChild(live)
		document.body.appendChild(host)
		root = live
	}

	try {
		return extractPaletteFromRoot(root, empty)
	} finally {
		host?.remove()
	}
}

function extractPaletteFromRoot(
	root: Element,
	empty: () => ExtractedPalette,
): ExtractedPalette {
	const viewBox = parseViewBoxFromSvg(
		root.tagName.toLowerCase() === 'svg' ? root : root.querySelector('svg'),
	)
	const gradients = buildGradientMap(root)
	const classMap = buildClassPaintMap(root)
	const hits: ShapeColourHit[] = []

	let shapeIndex = 0
	for (const el of root.querySelectorAll('*')) {
		const tag = el.tagName.toLowerCase()
		if (!GEOMETRY.has(tag) || isTinyGeometry(el)) continue

		const bbox = geometryBBox(el)
		if (!bbox) continue

		const styleDecls = parseStyleDeclarations(el.getAttribute('style') ?? '')
		const fromClass = paintFromClasses(el, classMap)
		const fillRaw = el.getAttribute('fill') ?? styleDecls.get('fill') ?? fromClass.fill
		const strokeRaw = el.getAttribute('stroke') ?? styleDecls.get('stroke') ?? fromClass.stroke
		const combined = [
			...resolvePaintValue(fillRaw, gradients),
			...resolvePaintValue(strokeRaw, gradients),
		]
		if (combined.length === 0) continue

		shapeIndex += 1
		const shapeId = el.getAttribute('id') || `shape-${shapeIndex}`
		const label = `Shape ${shapeIndex}`
		const ranked = rankShapeColours(combined)
		const area = bbox.width * bbox.height

		ranked.forEach((parsed, colourIndex) => {
			hits.push({
				parsed,
				origin: samplePointInBBox(bbox, colourIndex, ranked.length),
				shapeId,
				label,
				area,
			})
		})
	}

	if (hits.length === 0) return { ...empty(), viewBox }

	const allParsed = hits.map((h) => h.parsed)
	let lightest = allParsed[0]
	let darkest = allParsed[0]
	let maxL = relativeLuminance(lightest.hex)
	let minL = maxL
	for (let i = 1; i < allParsed.length; i++) {
		const c = allParsed[i]
		const l = relativeLuminance(c.hex)
		if (l > maxL) {
			maxL = l
			lightest = c
		}
		if (l < minL) {
			minL = l
			darkest = c
		}
	}

	const lightHit = pickBestHit(hits, lightest.hex)
	const darkHit = pickBestHit(hits, darkest.hex)

	const extremes: PaletteColour[] = [
		toPaletteColour(lightest, 'extreme', 'Lightest', {
			shapeId: lightHit?.shapeId,
			origin: lightHit?.origin,
		}),
		toPaletteColour(darkest, 'extreme', 'Darkest', {
			shapeId: darkHit?.shapeId,
			origin: darkHit?.origin,
		}),
	]

	const extremeHexes = new Set(extremes.map((c) => c.hex))
	const fromShapesRaw: PaletteColour[] = []
	const exactSeen = new Set<string>()
	const sortedHits = [...hits].sort((a, b) => b.area - a.area)

	for (const hit of sortedHits) {
		if (extremeHexes.has(hit.parsed.hex) || exactSeen.has(hit.parsed.hex)) continue
		exactSeen.add(hit.parsed.hex)
		fromShapesRaw.push(
			toPaletteColour(hit.parsed, 'shape', hit.label, {
				shapeId: hit.shapeId,
				origin: hit.origin,
			}),
		)
	}

	let fromShapes = mergeNearDuplicates(fromShapesRaw)
	fromShapes = fromShapes.slice(0, Math.max(0, GLOBAL_AUTO_CAP - extremes.length))
	const auto = [...extremes, ...fromShapes]

	return {
		extremes,
		fromShapes,
		auto,
		lightest: lightest.hex,
		darkest: darkest.hex,
		viewBox,
	}
}

function parseViewBoxFromSvg(svg: Element | null): SvgViewBox {
	if (!svg) return { ...FALLBACK_VIEWBOX }
	const vb = svg.getAttribute('viewBox')
	if (vb) {
		const parts = vb
			.trim()
			.split(/[\s,]+/)
			.map((p) => Number.parseFloat(p))
		if (parts.length === 4 && parts.every((n) => Number.isFinite(n)) && parts[2] > 0 && parts[3] > 0) {
			return { x: parts[0], y: parts[1], width: parts[2], height: parts[3] }
		}
	}
	const width = numAttr(svg, 'width', 100)
	const height = numAttr(svg, 'height', 100)
	return {
		x: 0,
		y: 0,
		width: width > 0 ? width : 100,
		height: height > 0 ? height : 100,
	}
}

export async function extractPalette(src: string): Promise<ExtractedPalette> {
	const res = await fetch(src)
	if (!res.ok) {
		const light = parseColourString(FALLBACK_EXTREMES.lightest)!
		const dark = parseColourString(FALLBACK_EXTREMES.darkest)!
		const extremes = [
			toPaletteColour(light, 'extreme', 'Lightest'),
			toPaletteColour(dark, 'extreme', 'Darkest'),
		]
		return {
			extremes,
			fromShapes: [],
			auto: extremes,
			lightest: FALLBACK_EXTREMES.lightest,
			darkest: FALLBACK_EXTREMES.darkest,
			viewBox: { ...FALLBACK_VIEWBOX },
		}
	}
	return extractPaletteFromSvgText(await res.text())
}

export function buildFlatPalette(
	auto: PaletteColour[],
	customs: PaletteColour[],
): PaletteColour[] {
	const hexes = new Set(auto.map((c) => c.hex))
	return [...auto, ...customs.filter((c) => !hexes.has(c.hex))]
}

export function createCustomColour(hexOrCss: string): PaletteColour | null {
	const parsed = parseColourString(hexOrCss)
	if (!parsed) return null
	return toPaletteColour(parsed, 'custom', 'Custom')
}

export function coloursEqualHex(a: string, b: string): boolean {
	const pa = parseColourString(a)
	const pb = parseColourString(b)
	if (!pa || !pb) return false
	return pa.hex === pb.hex
}

export function ensureRgb(hex: string): Rgb {
	return hexToRgb(hex) ?? { r: 0, g: 0, b: 0 }
}

/** Map an SVG-user-unit point into a PDF image rectangle (contain-fit). */
export function mapSvgPointToRect(
	origin: SvgPoint,
	viewBox: SvgViewBox,
	rect: { x: number; y: number; width: number; height: number },
): SvgPoint {
	const scale = Math.min(rect.width / viewBox.width, rect.height / viewBox.height)
	const drawW = viewBox.width * scale
	const drawH = viewBox.height * scale
	const offsetX = rect.x + (rect.width - drawW) / 2
	const offsetY = rect.y + (rect.height - drawH) / 2
	return {
		x: offsetX + ((origin.x - viewBox.x) / viewBox.width) * drawW,
		y: offsetY + ((origin.y - viewBox.y) / viewBox.height) * drawH,
	}
}
