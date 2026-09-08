/**
 * Pure geometry for floor detailing — footprints, path strips, and the coloured boxes that
 * FloorDetailGeometryBuilder merges. No Three.js.
 */

import { buildingGridToLocal, type BuildingGridPoint } from './FoundationLocalMath';
import {
	FLOOR_DETAIL_2D_THICKNESS,
	FLOOR_DETAIL_3D_GROOVE,
	FLOOR_DETAIL_3D_THICKNESS,
	FLOOR_DETAIL_HOST_LIFT,
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

export function axisAlignedRectFromPoints(points: readonly BuildingGridPoint[]): FloorDetailRect | null {
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
	const a = buildingGridToLocal(start, gridSize);
	const b = buildingGridToLocal(end, gridSize);
	const dx = b.localX - a.localX;
	const dz = b.localZ - a.localZ;
	const length = Math.hypot(dx, dz);
	if (length < 1e-8 || pathWidth <= 0) return [];
	const half = pathWidth / 2;
	const nx = -dz / length;
	const nz = dx / length;
	return [
		{ x: a.localX + nx * half, z: a.localZ + nz * half },
		{ x: b.localX + nx * half, z: b.localZ + nz * half },
		{ x: b.localX - nx * half, z: b.localZ - nz * half },
		{ x: a.localX - nx * half, z: a.localZ - nz * half }
	];
}

export function validateFloorDetailFootprint(
	kind: FloorDetailKind,
	points: readonly BuildingGridPoint[],
	pathWidth: number,
	gridSize: number
): FloorDetailFootprintCheck {
	if (kind === 'path') {
		if (points.length < 2) return { valid: false, reason: 'Path needs a start and end' };
		const start = points[0];
		const end = points[1];
		if (start.gridX === end.gridX && start.gridZ === end.gridZ) {
			return { valid: false, reason: 'Path start and end must be different' };
		}
		if (!(pathWidth > 0) || !Number.isFinite(pathWidth)) {
			return { valid: false, reason: 'Path width must be positive' };
		}
		const a = buildingGridToLocal(start, gridSize);
		const b = buildingGridToLocal(end, gridSize);
		const length = Math.hypot(b.localX - a.localX, b.localZ - a.localZ);
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

function axisBox(
	rect: LocalRect,
	minY: number,
	maxY: number,
	color: string
): FloorDetailBox {
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
	pattern: FloorDetailTilePattern,
	ix: number,
	iz: number,
	colors: readonly string[]
): string {
	switch (pattern) {
		case 'solid':
			return colorAt(colors, 0);
		case 'checker':
			return colorAt(colors, (ix + iz) & 1);
		case 'diamond':
			return colorAt(colors, Math.abs(ix - iz) & 1);
		case 'running-bond':
			return colorAt(colors, (ix + (iz & 1)) & 1);
	}
}

function buildCarpetBoxes(def: FloorDetailDefinition, gridSize: number): FloorDetailBox[] {
	const grid = axisAlignedRectFromPoints(def.points);
	if (!grid) return [];
	const rect = localRectFromGridRect(grid, gridSize);
	const { minY, maxY } = yRange(def.hostY, def.kind, def.renderMode);
	const inner = insetRect(rect, 0.08);
	if (!inner || def.colors.length < 2) {
		return [axisBox(rect, minY, maxY, colorAt(def.colors, 0))];
	}
	return [
		axisBox(rect, minY, maxY, colorAt(def.colors, 1)),
		axisBox(inner, minY, maxY, colorAt(def.colors, 0))
	];
}

function buildPlankBoxes(def: FloorDetailDefinition, gridSize: number): FloorDetailBox[] {
	const grid = axisAlignedRectFromPoints(def.points);
	if (!grid) return [];
	const rect = localRectFromGridRect(grid, gridSize);
	const { minY, maxY } = yRange(def.hostY, def.kind, def.renderMode);
	const plankWidth = Math.max(0.04, def.plankWidth);
	const groove = def.renderMode === '3d' ? FLOOR_DETAIL_3D_GROOVE : 0;
	const boxes: FloorDetailBox[] = [];

	if (def.plankDirection === 'x') {
		const span = rect.maxZ - rect.minZ;
		const count = Math.min(MAX_BOARD_COUNT, Math.max(1, Math.round(span / plankWidth)));
		const step = span / count;
		for (let i = 0; i < count; i++) {
			const minZ = rect.minZ + i * step;
			const maxZ = i === count - 1 ? rect.maxZ : rect.minZ + (i + 1) * step;
			const shrink = i < count - 1 ? groove : 0;
			boxes.push(
				axisBox(
					{ minX: rect.minX, maxX: rect.maxX, minZ, maxZ: maxZ - shrink },
					minY,
					maxY,
					colorAt(def.colors, i)
				)
			);
		}
		return boxes;
	}

	const span = rect.maxX - rect.minX;
	const count = Math.min(MAX_BOARD_COUNT, Math.max(1, Math.round(span / plankWidth)));
	const step = span / count;
	for (let i = 0; i < count; i++) {
		const minX = rect.minX + i * step;
		const maxX = i === count - 1 ? rect.maxX : rect.minX + (i + 1) * step;
		const shrink = i < count - 1 ? groove : 0;
		boxes.push(
			axisBox(
				{ minX, maxX: maxX - shrink, minZ: rect.minZ, maxZ: rect.maxZ },
				minY,
				maxY,
				colorAt(def.colors, i)
			)
		);
	}
	return boxes;
}

function buildTileBoxes(def: FloorDetailDefinition, gridSize: number): FloorDetailBox[] {
	const grid = axisAlignedRectFromPoints(def.points);
	if (!grid) return [];
	const rect = localRectFromGridRect(grid, gridSize);
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

function buildPathBoxes(def: FloorDetailDefinition, gridSize: number): FloorDetailBox[] {
	if (def.points.length < 2) return [];
	const start = buildingGridToLocal(def.points[0], gridSize);
	const end = buildingGridToLocal(def.points[1], gridSize);
	const dx = end.localX - start.localX;
	const dz = end.localZ - start.localZ;
	const length = Math.hypot(dx, dz);
	if (length < 1e-8) return [];
	const yaw = Math.atan2(dx, dz);
	const { minY, maxY } = yRange(def.hostY, def.kind, def.renderMode);
	const cx = (start.localX + end.localX) / 2;
	const cz = (start.localZ + end.localZ) / 2;
	const halfW = def.pathWidth / 2;
	const halfL = length / 2;
	const boxes: FloorDetailBox[] = [
		{
			minX: cx - halfW,
			maxX: cx + halfW,
			minY,
			maxY,
			minZ: cz - halfL,
			maxZ: cz + halfL,
			color: colorAt(def.colors, 0),
			yaw
		}
	];
	if (!def.pathFraming) return boxes;

	const frame = yRange(def.hostY, def.kind, def.renderMode, FLOOR_DETAIL_PATH_FRAME_HEIGHT_EXTRA);
	const frameHalf = FLOOR_DETAIL_PATH_FRAME_WIDTH / 2;
	const offset = halfW - frameHalf;
	const perpX = Math.cos(yaw);
	const perpZ = Math.sin(yaw);
	for (const sign of [-1, 1] as const) {
		const fcx = cx + sign * offset * perpX;
		const fcz = cz + sign * offset * perpZ;
		boxes.push({
			minX: fcx - frameHalf,
			maxX: fcx + frameHalf,
			minY: frame.minY,
			maxY: frame.maxY,
			minZ: fcz - halfL,
			maxZ: fcz + halfL,
			color: colorAt(def.colors, 1),
			yaw
		});
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
