/**
 * Path-tool draw modes, cycled with C: axis snap, free (any grid heading), and a quadratic Bezier
 * bend. Tool-local — not persisted on BuildingSettings. Framework-free so the cycle is unit-testable.
 */

export type FloorPathDrawMode = 'axis' | 'free' | 'bezier';

export const FLOOR_PATH_DRAW_MODES = ['axis', 'free', 'bezier'] as const;

export function cycleFloorPathDrawMode(current: FloorPathDrawMode): FloorPathDrawMode {
	if (current === 'axis') return 'free';
	if (current === 'free') return 'bezier';
	return 'axis';
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
	}
}
