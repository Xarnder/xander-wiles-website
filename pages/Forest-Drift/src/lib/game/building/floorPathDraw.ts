/**
 * Path-tool draw modes, cycled with C: axis snap, free heading, a free quadratic Bezier (start,
 * end, then the bend), then two Bezier modes drawn start → corner → end. Those keep both arms the
 * same length, and the last also snaps the corner to 30° steps so a right angle is one stop.
 * Tool-local — not persisted on BuildingSettings. Framework-free so the cycle is unit-testable.
 */

import type { BuildingGridPoint } from './FoundationLocalMath';

export type FloorPathDrawMode = 'axis' | 'free' | 'bezier' | 'bezier-equal' | 'bezier-equal-30';

export const FLOOR_PATH_DRAW_MODES = [
	'axis',
	'free',
	'bezier',
	'bezier-equal',
	'bezier-equal-30'
] as const satisfies readonly FloorPathDrawMode[];

/** Corner angle step for the equal-arm Bezier that snaps. */
export const BEZIER_ARM_ANGLE_STEP = 30;

export function cycleFloorPathDrawMode(current: FloorPathDrawMode): FloorPathDrawMode {
	const index = FLOOR_PATH_DRAW_MODES.indexOf(current);
	return FLOOR_PATH_DRAW_MODES[(index + 1) % FLOOR_PATH_DRAW_MODES.length];
}

export function isBezierFloorPathDrawMode(mode: FloorPathDrawMode): boolean {
	return mode === 'bezier' || mode === 'bezier-equal' || mode === 'bezier-equal-30';
}

/** `null` keeps the corner angle free. A number snaps it to multiples of that many degrees. */
export function bezierArmSnapStep(mode: FloorPathDrawMode): number | null {
	return mode === 'bezier-equal-30' ? BEZIER_ARM_ANGLE_STEP : null;
}

export function usesEqualBezierArms(mode: FloorPathDrawMode): boolean {
	return mode === 'bezier-equal' || mode === 'bezier-equal-30';
}

/** Crosshair badge — same slot as wall-division snap. */
export function floorPathDrawModeBadge(mode: FloorPathDrawMode): string {
	switch (mode) {
		case 'axis':
			return 'AXIS SNAP';
		case 'free':
			return 'FREE PATH';
		case 'bezier':
			return 'BEZIER PATH';
		case 'bezier-equal':
			return 'EQUAL ARMS';
		case 'bezier-equal-30':
			return 'EQUAL 30°';
	}
}

export function floorPathDrawModeLabel(mode: FloorPathDrawMode): string {
	switch (mode) {
		case 'axis':
			return 'Axis';
		case 'free':
			return 'Free';
		case 'bezier':
			return 'Bezier';
		case 'bezier-equal':
			return 'Equal arms';
		case 'bezier-equal-30':
			return 'Equal arms 30°';
	}
}

/** Interior angle at the handle, in degrees (0, 180]. 90° is a right-angle corner. */
export function bezierArmAngleDegrees(
	start: BuildingGridPoint,
	end: BuildingGridPoint,
	handle: BuildingGridPoint
): number | null {
	const ax = start.gridX - handle.gridX;
	const az = start.gridZ - handle.gridZ;
	const bx = end.gridX - handle.gridX;
	const bz = end.gridZ - handle.gridZ;
	const la = Math.hypot(ax, az);
	const lb = Math.hypot(bx, bz);
	if (la < 1e-8 || lb < 1e-8) return null;
	const cos = Math.min(1, Math.max(-1, (ax * bx + az * bz) / (la * lb)));
	return (Math.acos(cos) * 180) / Math.PI;
}

/**
 * Places the last Bezier point after the start and the corner are already down. The end stays the
 * same distance from the corner as the start is. With `snapStepDegrees`, the corner angle locks to
 * that step (30, 60, 90, …) and the mouse only chooses which way the path turns.
 */
export function constrainEqualArmEnd(
	start: BuildingGridPoint,
	middle: BuildingGridPoint,
	hover: BuildingGridPoint,
	snapStepDegrees: number | null
): BuildingGridPoint {
	const ux = start.gridX - middle.gridX;
	const uz = start.gridZ - middle.gridZ;
	const radius = Math.hypot(ux, uz);
	if (radius < 1e-8) return hover;
	const vx = hover.gridX - middle.gridX;
	const vz = hover.gridZ - middle.gridZ;
	let signed =
		Math.hypot(vx, vz) < 1e-8 ? Math.PI : Math.atan2(ux * vz - uz * vx, ux * vx + uz * vz);
	if (snapStepDegrees && snapStepDegrees > 0) {
		const absDegrees = (Math.abs(signed) * 180) / Math.PI;
		const snapped = snapArmAngle(absDegrees, snapStepDegrees);
		const sign = signed < 0 ? -1 : 1;
		signed = (sign * snapped * Math.PI) / 180;
	}
	const cos = Math.cos(signed);
	const sin = Math.sin(signed);
	return {
		gridX: middle.gridX + ux * cos - uz * sin,
		gridZ: middle.gridZ + ux * sin + uz * cos
	};
}

function snapArmAngle(angle: number, step: number): number {
	const snapped = Math.round(angle / step) * step;
	return Math.min(180, Math.max(step, snapped));
}
