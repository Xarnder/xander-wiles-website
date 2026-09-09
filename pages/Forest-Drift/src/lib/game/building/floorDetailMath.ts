/**
 * Pure geometry for floor detailing — footprints, path strips, and the coloured boxes that
 * FloorDetailGeometryBuilder merges. No Three.js.
 */

import { buildingGridToLocal, type BuildingGridPoint } from './FoundationLocalMath';
import {
	FLOOR_DETAIL_2D_THICKNESS,
	FLOOR_DETAIL_3D_GROOVE,
	FLOOR_DETAIL_3D_THICKNESS,
	FLOOR_DETAIL_CARPET_BORDER,
	FLOOR_DETAIL_CARPET_PILE,
	FLOOR_DETAIL_HOST_LIFT,
	FLOOR_DETAIL_PLANK_LENGTH_RATIO,
	FLOOR_DETAIL_PLANK_MIN_SEGMENT,
	FLOOR_DETAIL_PATH_FRAME_HEIGHT_EXTRA,
	FLOOR_DETAIL_PATH_FRAME_WIDTH,
	type FloorDetailBox,
	type FloorDetailDefinition,
	type FloorDetailKind,
	type FloorDetailRenderMode,
	type FloorDetailTilePattern
} from './FloorDetailTypes';

export interface FloorDetailRect {
	minGridX: number;
	maxGridX: number;
	minGridZ: number;
	maxGridZ: number;
}

export interface LocalRect {
	minX: number;
	maxX: number;
	minZ: number;
	maxZ: number;
}

export interface FloorDetailFootprintCheck {
	valid: boolean;
	reason?: string;
}

const MIN_SPAN_CELLS = 1;
const MAX_BOARD_COUNT = 256;

export function floorDetailThickness(
	kind: FloorDetailKind,
	renderMode: FloorDetailRenderMode
): number {
	if (renderMode === '2d') return FLOOR_DETAIL_2D_THICKNESS;
	return FLOOR_DETAIL_3D_THICKNESS[kind];
}

/** Bottom of the detailing mesh in foundation-local Y. */
export function floorDetailMeshMinY(hostY: number): number {
	return hostY + FLOOR_DETAIL_HOST_LIFT;
}

export function axisAlignedRectFromPoints(
	points: readonly BuildingGridPoint[]
): FloorDetailRect | null {
	if (points.length < 2) return null;
	let minGridX = Infinity;
	let maxGridX = -Infinity;
	let minGridZ = Infinity;
	let maxGridZ = -Infinity;
	for (const point of points) {
		minGridX = Math.min(minGridX, point.gridX);
		maxGridX = Math.max(maxGridX, point.gridX);
		minGridZ = Math.min(minGridZ, point.gridZ);
		maxGridZ = Math.max(maxGridZ, point.gridZ);
	}
	if (!Number.isFinite(minGridX) || !Number.isFinite(minGridZ)) return null;
	return { minGridX, maxGridX, minGridZ, maxGridZ };
}

export function rectanglePointsFromCorners(
	a: BuildingGridPoint,
	b: BuildingGridPoint
): BuildingGridPoint[] {
	const minGridX = Math.min(a.gridX, b.gridX);
	const maxGridX = Math.max(a.gridX, b.gridX);
	const minGridZ = Math.min(a.gridZ, b.gridZ);
	const maxGridZ = Math.max(a.gridZ, b.gridZ);
	return [
		{ gridX: minGridX, gridZ: minGridZ },
		{ gridX: maxGridX, gridZ: minGridZ },
		{ gridX: maxGridX, gridZ: maxGridZ },
		{ gridX: minGridX, gridZ: maxGridZ }
	];
}

export function localRectFromGridRect(rect: FloorDetailRect, gridSize: number): LocalRect {
	return {
		minX: rect.minGridX * gridSize,
		maxX: rect.maxGridX * gridSize,
		minZ: rect.minGridZ * gridSize,
		maxZ: rect.maxGridZ * gridSize
	};
}

export interface PathLocalPoint {
	x: number;
	z: number;
}

export interface PathAuthoring {
	start: BuildingGridPoint;
	end: BuildingGridPoint;
	/** Quadratic Bezier control — omitted on a straight start→end path. */
	handle: BuildingGridPoint | null;
}

const PATH_SAMPLE_SPACING = 0.18;
const PATH_MIN_SAMPLES = 8;
const PATH_MAX_SAMPLES = 40;

export function pathAuthoring(points: readonly BuildingGridPoint[]): PathAuthoring | null {
	if (points.length === 2) return { start: points[0], end: points[1], handle: null };
	if (points.length === 3) return { start: points[0], handle: points[1], end: points[2] };
	return null;
}

function pathLocal(point: BuildingGridPoint, gridSize: number): PathLocalPoint {
	const local = buildingGridToLocal(point, gridSize);
	return { x: local.localX, z: local.localZ };
}

export function quadraticBezierPoint(
	p0: PathLocalPoint,
	p1: PathLocalPoint,
	p2: PathLocalPoint,
	t: number
): PathLocalPoint {
	const u = 1 - t;
	return {
		x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
		z: u * u * p0.z + 2 * u * t * p1.z + t * t * p2.z
	};
}

function distanceToSegment(point: PathLocalPoint, a: PathLocalPoint, b: PathLocalPoint): number {
	const dx = b.x - a.x;
	const dz = b.z - a.z;
	const len2 = dx * dx + dz * dz;
	if (len2 < 1e-16) return Math.hypot(point.x - a.x, point.z - a.z);
	const t = Math.min(1, Math.max(0, ((point.x - a.x) * dx + (point.z - a.z) * dz) / len2));
	return Math.hypot(point.x - (a.x + t * dx), point.z - (a.z + t * dz));
}

export function pathPolylineLength(samples: readonly PathLocalPoint[]): number {
	let length = 0;
	for (let i = 1; i < samples.length; i++) {
		length += Math.hypot(samples[i].x - samples[i - 1].x, samples[i].z - samples[i - 1].z);
	}
	return length;
}

/** True when the handle sits on the chord — persist as a 2-point straight path. */
export function pathBendIsStraight(
	start: BuildingGridPoint,
	handle: BuildingGridPoint,
	end: BuildingGridPoint,
	gridSize: number
): boolean {
	const a = pathLocal(start, gridSize);
	const c = pathLocal(handle, gridSize);
	const b = pathLocal(end, gridSize);
	return distanceToSegment(c, a, b) <= gridSize * 0.4;
}

/**
 * Centreline in local metres. Two authored points stay a single segment; three become a quadratic
 * Bezier (start → handle → end).
 */
export function pathCenterlineLocalSamples(
	points: readonly BuildingGridPoint[],
	gridSize: number
): PathLocalPoint[] {
	const authored = pathAuthoring(points);
	if (!authored) return [];
	const start = pathLocal(authored.start, gridSize);
	const end = pathLocal(authored.end, gridSize);
	const chord = Math.hypot(end.x - start.x, end.z - start.z);
	if (chord < 1e-8) return [];
	if (!authored.handle) return [start, end];
	const handle = pathLocal(authored.handle, gridSize);
	const pull = distanceToSegment(handle, start, end);
	if (pull < 1e-4) return [start, end];
	const count = Math.min(
		PATH_MAX_SAMPLES,
		Math.max(PATH_MIN_SAMPLES, Math.round((chord + pull) / PATH_SAMPLE_SPACING) + 1)
	);
	const samples: PathLocalPoint[] = [];
	for (let i = 0; i <= count; i++) {
		samples.push(quadraticBezierPoint(start, handle, end, i / count));
	}
	return samples;
}

/** Offset a centreline to the left (positive) or right (negative) of the walk direction. */
export function offsetPathPolyline(
	samples: readonly PathLocalPoint[],
	offset: number
): PathLocalPoint[] {
	if (samples.length < 2) return [];
	const out: PathLocalPoint[] = [];
	for (let i = 0; i < samples.length; i++) {
		let tx: number;
		let tz: number;
		if (i === 0) {
			tx = samples[1].x - samples[0].x;
			tz = samples[1].z - samples[0].z;
		} else if (i === samples.length - 1) {
			tx = samples[i].x - samples[i - 1].x;
			tz = samples[i].z - samples[i - 1].z;
		} else {
			tx = samples[i + 1].x - samples[i - 1].x;
			tz = samples[i + 1].z - samples[i - 1].z;
		}
		const length = Math.hypot(tx, tz);
		if (length < 1e-8) {
			out.push({ x: samples[i].x, z: samples[i].z });
			continue;
		}
		out.push({
			x: samples[i].x + (-tz / length) * offset,
			z: samples[i].z + (tx / length) * offset
		});
	}
	return out;
}

/**
 * Closed ring of a constant-width ribbon: left edge start→end, then right edge end→start.
 * Works for straight and Bezier paths.
 */
export function pathRibbonLocalRing(
	points: readonly BuildingGridPoint[],
	pathWidth: number,
	gridSize: number
): PathLocalPoint[] {
	const samples = pathCenterlineLocalSamples(points, gridSize);
	if (samples.length < 2 || pathWidth <= 0) return [];
	const half = pathWidth / 2;
	const left = offsetPathPolyline(samples, half);
	const right = offsetPathPolyline(samples, -half);
	if (left.length < 2 || right.length < 2) return [];
	return [...left, ...right.slice().reverse()];
}

/**
 * Four local-metre corners of a constant-width strip along start→end. Not snapped back onto the
 * building grid — a diagonal path keeps its authored width.
 */
export function pathStripLocalCorners(
	start: BuildingGridPoint,
	end: BuildingGridPoint,
	pathWidth: number,
	gridSize: number
): { x: number; z: number }[] {
	return pathRibbonLocalRing([start, end], pathWidth, gridSize);
}

export function validateFloorDetailFootprint(
	kind: FloorDetailKind,
	points: readonly BuildingGridPoint[],
	pathWidth: number,
	gridSize: number
): FloorDetailFootprintCheck {
	if (kind === 'path') {
		if (points.length < 2) return { valid: false, reason: 'Path needs a start and end' };
		if (points.length > 3) return { valid: false, reason: 'Path can have a start, bend, and end' };
		const authored = pathAuthoring(points);
		if (!authored) return { valid: false, reason: 'Path needs a start and end' };
		if (
			authored.start.gridX === authored.end.gridX &&
			authored.start.gridZ === authored.end.gridZ
		) {
			return { valid: false, reason: 'Path start and end must be different' };
		}
		if (!(pathWidth > 0) || !Number.isFinite(pathWidth)) {
			return { valid: false, reason: 'Path width must be positive' };
		}
		const length = pathPolylineLength(pathCenterlineLocalSamples(points, gridSize));
		if (length < gridSize - 1e-6) {
			return { valid: false, reason: 'Path is too short' };
		}
		return { valid: true };
	}

	const rect = axisAlignedRectFromPoints(points);
	if (!rect) return { valid: false, reason: 'Need two corners' };
	const xCells = rect.maxGridX - rect.minGridX;
	const zCells = rect.maxGridZ - rect.minGridZ;
	if (xCells < MIN_SPAN_CELLS || zCells < MIN_SPAN_CELLS) {
		return { valid: false, reason: 'Need at least one grid cell' };
	}
	return { valid: true };
}

function colorAt(colors: readonly string[], index: number): string {
	if (colors.length === 0) return '#888888';
	return colors[index % colors.length] ?? colors[0];
}

function yRange(
	hostY: number,
	kind: FloorDetailKind,
	renderMode: FloorDetailRenderMode,
	extra = 0
): { minY: number; maxY: number } {
	const minY = floorDetailMeshMinY(hostY);
	return { minY, maxY: minY + floorDetailThickness(kind, renderMode) + extra };
}

function axisBox(rect: LocalRect, minY: number, maxY: number, color: string): FloorDetailBox {
	return {
		minX: Math.min(rect.minX, rect.maxX),
		maxX: Math.max(rect.minX, rect.maxX),
		minY,
		maxY,
		minZ: Math.min(rect.minZ, rect.maxZ),
		maxZ: Math.max(rect.minZ, rect.maxZ),
		color
	};
}

function insetRect(rect: LocalRect, amount: number): LocalRect | null {
	const minX = rect.minX + amount;
	const maxX = rect.maxX - amount;
	const minZ = rect.minZ + amount;
	const maxZ = rect.maxZ - amount;
	if (maxX - minX < 1e-4 || maxZ - minZ < 1e-4) return null;
	return { minX, maxX, minZ, maxZ };
}

function tileColor(
	pattern: Exclude<FloorDetailTilePattern, 'diamond'>,
	ix: number,
	iz: number,
	colors: readonly string[]
): string {
	switch (pattern) {
		case 'solid':
			return colorAt(colors, 0);
		case 'checker':
			return colorAt(colors, (ix + iz) & 1);
		case 'running-bond':
			return colorAt(colors, (ix + (iz & 1)) & 1);
	}
}

function rimBoxes(
	rect: LocalRect,
	inner: LocalRect,
	minY: number,
	maxY: number,
	color: string
): FloorDetailBox[] {
	const parts: LocalRect[] = [
		{ minX: rect.minX, maxX: rect.maxX, minZ: rect.minZ, maxZ: inner.minZ },
		{ minX: rect.minX, maxX: rect.maxX, minZ: inner.maxZ, maxZ: rect.maxZ },
		{ minX: rect.minX, maxX: inner.minX, minZ: inner.minZ, maxZ: inner.maxZ },
		{ minX: inner.maxX, maxX: rect.maxX, minZ: inner.minZ, maxZ: inner.maxZ }
	];
	return parts
		.filter((part) => part.maxX - part.minX > 1e-4 && part.maxZ - part.minZ > 1e-4)
		.map((part) => axisBox(part, minY, maxY, color));
}

function buildCarpetBoxes(def: FloorDetailDefinition, gridSize: number): FloorDetailBox[] {
	const grid = axisAlignedRectFromPoints(def.points);
	if (!grid) return [];
	const rect = localRectFromGridRect(grid, gridSize);
	const { minY, maxY } = yRange(def.hostY, def.kind, def.renderMode);
	const inner = insetRect(rect, FLOOR_DETAIL_CARPET_BORDER);
	if (!inner || def.colors.length < 2) {
		return [axisBox(rect, minY, maxY, colorAt(def.colors, 0))];
	}
	const pile = def.renderMode === '3d' ? FLOOR_DETAIL_CARPET_PILE : 0;
	return [
		...rimBoxes(rect, inner, minY, maxY, colorAt(def.colors, 1)),
		axisBox(inner, minY, maxY + pile, colorAt(def.colors, 0))
	];
}

/** Repeating length mix so neighbouring boards do not share a joint line. */
const PLANK_LENGTH_WEIGHTS = [1.05, 0.7, 1.2, 0.85, 1.0] as const;

function plankTargetLength(plankWidth: number, runSpan: number, rowCount: number): number {
	let target = Math.max(
		FLOOR_DETAIL_PLANK_MIN_SEGMENT * 2,
		plankWidth * FLOOR_DETAIL_PLANK_LENGTH_RATIO
	);
	target = Math.min(target, Math.max(runSpan, FLOOR_DETAIL_PLANK_MIN_SEGMENT));
	const perRow = Math.max(1, Math.ceil(runSpan / Math.max(target, 1e-4)));
	if (rowCount * perRow > MAX_BOARD_COUNT) {
		target = runSpan / Math.max(1, Math.floor(MAX_BOARD_COUNT / rowCount));
	}
	return target;
}

function buildPlankBoxes(def: FloorDetailDefinition, gridSize: number): FloorDetailBox[] {
	const grid = axisAlignedRectFromPoints(def.points);
	if (!grid) return [];
	const rect = localRectFromGridRect(grid, gridSize);
	const { minY, maxY } = yRange(def.hostY, def.kind, def.renderMode);
	const plankWidth = Math.max(0.04, def.plankWidth);
	const groove = FLOOR_DETAIL_3D_GROOVE;
	const alongX = def.plankDirection === 'x';
	const runMin = alongX ? rect.minX : rect.minZ;
	const runMax = alongX ? rect.maxX : rect.maxZ;
	const acrossMin = alongX ? rect.minZ : rect.minX;
	const acrossMax = alongX ? rect.maxZ : rect.maxX;
	const runSpan = runMax - runMin;
	const acrossSpan = acrossMax - acrossMin;
	if (runSpan < 1e-4 || acrossSpan < 1e-4) return [];

	const rowCount = Math.min(MAX_BOARD_COUNT, Math.max(1, Math.round(acrossSpan / plankWidth)));
	const rowStep = acrossSpan / rowCount;
	const target = plankTargetLength(plankWidth, runSpan, rowCount);
	const boxes: FloorDetailBox[] = [];

	const emit = (run0: number, run1: number, across0: number, across1: number, color: string) => {
		const shrinkRun = run1 < runMax - 1e-6 ? groove : 0;
		const shrinkAcross = across1 < acrossMax - 1e-6 ? groove : 0;
		const part = alongX
			? { minX: run0, maxX: run1 - shrinkRun, minZ: across0, maxZ: across1 - shrinkAcross }
			: { minX: across0, maxX: across1 - shrinkAcross, minZ: run0, maxZ: run1 - shrinkRun };
		if (part.maxX - part.minX <= 1e-4 || part.maxZ - part.minZ <= 1e-4) return;
		boxes.push(axisBox(part, minY, maxY, color));
	};

	for (let row = 0; row < rowCount; row++) {
		const across0 = acrossMin + row * rowStep;
		const across1 = row === rowCount - 1 ? acrossMax : acrossMin + (row + 1) * rowStep;
		let pos = runMin;
		let board = 0;
		const firstCut = ((row % 3) / 3) * target;
		if (
			firstCut >= FLOOR_DETAIL_PLANK_MIN_SEGMENT &&
			runMax - (runMin + firstCut) >= FLOOR_DETAIL_PLANK_MIN_SEGMENT
		) {
			emit(runMin, runMin + firstCut, across0, across1, colorAt(def.colors, row + board));
			pos = runMin + firstCut;
			board += 1;
		}
		while (pos < runMax - 1e-6) {
			const remaining = runMax - pos;
			const weight = PLANK_LENGTH_WEIGHTS[(board + row) % PLANK_LENGTH_WEIGHTS.length];
			const len = target * weight;
			if (remaining <= len + FLOOR_DETAIL_PLANK_MIN_SEGMENT) {
				emit(pos, runMax, across0, across1, colorAt(def.colors, row + board));
				break;
			}
			emit(pos, pos + len, across0, across1, colorAt(def.colors, row + board));
			pos += len;
			board += 1;
		}
	}
	return boxes;
}

function buildTileBoxes(def: FloorDetailDefinition, gridSize: number): FloorDetailBox[] {
	const grid = axisAlignedRectFromPoints(def.points);
	if (!grid) return [];
	const rect = localRectFromGridRect(grid, gridSize);
	if (def.tilePattern === 'diamond') return buildDiamondTileBoxes(def, rect);

	const { minY, maxY } = yRange(def.hostY, def.kind, def.renderMode);
	const tileSize = Math.max(0.12, def.tileSize);
	const groove = def.renderMode === '3d' ? FLOOR_DETAIL_3D_GROOVE : 0;
	const width = rect.maxX - rect.minX;
	const depth = rect.maxZ - rect.minZ;
	const cols = Math.min(MAX_BOARD_COUNT, Math.max(1, Math.round(width / tileSize)));
	const rows = Math.min(MAX_BOARD_COUNT, Math.max(1, Math.round(depth / tileSize)));
	const cellW = width / cols;
	const cellD = depth / rows;
	const boxes: FloorDetailBox[] = [];

	for (let iz = 0; iz < rows; iz++) {
		const rowOffset = def.tilePattern === 'running-bond' && iz % 2 === 1 ? cellW * 0.5 : 0;
		const extra = rowOffset > 0 ? 1 : 0;
		for (let ix = -extra; ix < cols; ix++) {
			let minX = rect.minX + ix * cellW + rowOffset;
			let maxX = minX + cellW;
			if (maxX <= rect.minX + 1e-6 || minX >= rect.maxX - 1e-6) continue;
			minX = Math.max(minX, rect.minX);
			maxX = Math.min(maxX, rect.maxX);
			const minZ = rect.minZ + iz * cellD;
			const maxZ = iz === rows - 1 ? rect.maxZ : rect.minZ + (iz + 1) * cellD;
			if (maxX - minX < 1e-4 || maxZ - minZ < 1e-4) continue;
			const shrinkX = maxX < rect.maxX - 1e-6 ? groove : 0;
			const shrinkZ = iz < rows - 1 ? groove : 0;
			boxes.push(
				axisBox(
					{ minX, maxX: maxX - shrinkX, minZ, maxZ: maxZ - shrinkZ },
					minY,
					maxY,
					tileColor(def.tilePattern, ix, iz, def.colors)
				)
			);
		}
	}
	return boxes;
}

/** Squares rotated 45° on a diamond lattice so the pattern is distinct from axis-aligned checker. */
function buildDiamondTileBoxes(def: FloorDetailDefinition, rect: LocalRect): FloorDetailBox[] {
	const { minY, maxY } = yRange(def.hostY, def.kind, def.renderMode);
	const width = rect.maxX - rect.minX;
	const depth = rect.maxZ - rect.minZ;
	if (width < 1e-4 || depth < 1e-4) return [];

	const requested = Math.max(0.12, def.tileSize);
	const span = Math.min(width, depth);
	const D = Math.min(requested, span);
	const step = D / 2;
	const side = D / Math.SQRT2;
	const groove = def.renderMode === '3d' ? FLOOR_DETAIL_3D_GROOVE : 0;
	const inner = Math.max(1e-3, side - groove);
	const half = inner / 2;
	const yaw = Math.PI / 4;
	const halfExtent = D / 2;
	const boxes: FloorDetailBox[] = [];

	const iMax = Math.ceil(width / step) + 2;
	const jMax = Math.ceil(depth / step) + 2;
	let count = 0;
	for (let j = 0; j <= jMax && count < MAX_BOARD_COUNT; j++) {
		for (let i = 0; i <= iMax && count < MAX_BOARD_COUNT; i++) {
			if (((i + j) & 1) !== 0) continue;
			const cx = rect.minX + i * step;
			const cz = rect.minZ + j * step;
			if (cx - halfExtent < rect.minX - 1e-6 || cx + halfExtent > rect.maxX + 1e-6) continue;
			if (cz - halfExtent < rect.minZ - 1e-6 || cz + halfExtent > rect.maxZ + 1e-6) continue;
			boxes.push({
				minX: cx - half,
				maxX: cx + half,
				minY,
				maxY,
				minZ: cz - half,
				maxZ: cz + half,
				color: colorAt(def.colors, i & 1),
				yaw
			});
			count += 1;
		}
	}
	return boxes;
}

/** Box whose local Z runs from A→B and whose local X is the half-width. */
function yawedBoxAlongSegment(
	ax: number,
	az: number,
	bx: number,
	bz: number,
	halfWidth: number,
	minY: number,
	maxY: number,
	color: string
): FloorDetailBox | null {
	const dx = bx - ax;
	const dz = bz - az;
	const length = Math.hypot(dx, dz);
	if (length < 1e-8 || halfWidth <= 0) return null;
	const cx = (ax + bx) / 2;
	const cz = (az + bz) / 2;
	const halfL = length / 2;
	return {
		minX: cx - halfWidth,
		maxX: cx + halfWidth,
		minY,
		maxY,
		minZ: cz - halfL,
		maxZ: cz + halfL,
		color,
		yaw: Math.atan2(dx, dz)
	};
}

function boxesAlongPolyline(
	samples: readonly PathLocalPoint[],
	halfWidth: number,
	minY: number,
	maxY: number,
	color: string
): FloorDetailBox[] {
	const boxes: FloorDetailBox[] = [];
	for (let i = 1; i < samples.length; i++) {
		const box = yawedBoxAlongSegment(
			samples[i - 1].x,
			samples[i - 1].z,
			samples[i].x,
			samples[i].z,
			halfWidth,
			minY,
			maxY,
			color
		);
		if (box) boxes.push(box);
	}
	return boxes;
}

function buildPathBoxes(def: FloorDetailDefinition, gridSize: number): FloorDetailBox[] {
	const samples = pathCenterlineLocalSamples(def.points, gridSize);
	if (samples.length < 2) return [];
	const { minY, maxY } = yRange(def.hostY, def.kind, def.renderMode);
	const halfW = def.pathWidth / 2;
	const boxes = boxesAlongPolyline(samples, halfW, minY, maxY, colorAt(def.colors, 0));
	if (!def.pathFraming) return boxes;

	const frameHalf = FLOOR_DETAIL_PATH_FRAME_WIDTH / 2;
	if (halfW < frameHalf + 1e-4) return boxes;

	const offset = halfW - frameHalf;
	const frame = yRange(def.hostY, def.kind, def.renderMode, FLOOR_DETAIL_PATH_FRAME_HEIGHT_EXTRA);
	const railColor = colorAt(def.colors, 1);
	for (const sign of [-1, 1] as const) {
		boxes.push(
			...boxesAlongPolyline(
				offsetPathPolyline(samples, sign * offset),
				frameHalf,
				frame.minY,
				frame.maxY,
				railColor
			)
		);
	}
	return boxes;
}

/** Coloured boxes for one detailing piece — empty when the footprint is degenerate. */
export function buildFloorDetailBoxes(
	definition: FloorDetailDefinition,
	gridSize: number
): FloorDetailBox[] {
	if (!(gridSize > 0)) return [];
	switch (definition.kind) {
		case 'carpet':
			return buildCarpetBoxes(definition, gridSize);
		case 'planks':
			return buildPlankBoxes(definition, gridSize);
		case 'tiles':
			return buildTileBoxes(definition, gridSize);
		case 'path':
			return buildPathBoxes(definition, gridSize);
	}
}
