import { snapOpeningCoord } from './openingDivisionSnap';

export type BeamOrientation = 'vertical' | 'horizontal';

export interface BeamVerticalExtent {
	minY: number;
	maxY: number;
}

/**
 * Along-wall size of the next beam. Vertical posts use the timber's short face (`beamHeight`);
 * horizontal boards use `beamWidth`.
 */
export function beamAlongWallSize(
	orientation: BeamOrientation,
	beamWidth: number,
	beamHeight: number
): number {
	return orientation === 'horizontal' ? beamWidth : beamHeight;
}

/**
 * Beam centre-Y follows the look point, snapped to `openingGridSize`, then clamped so the timber
 * stays on the wall face. Horizontal snap is the same C-cycled wall-division used by Window/Door
 * (`snapOpeningCenterU`); this is only the extra vertical freedom a horizontal beam has over a
 * fixed sill. Vertical beams span the wall instead.
 */
export function computeBeamVerticalExtent(
	lookY: number,
	beamHeight: number,
	wallHeight: number,
	gridSize: number
): BeamVerticalExtent {
	const height = Math.max(0, beamHeight);
	const half = height / 2;
	const snapped = snapOpeningCoord(lookY, gridSize);
	const maxCenter = Math.max(half, wallHeight - half);
	const center = Math.min(Math.max(snapped, half), maxCenter);
	return { minY: center - half, maxY: center + half };
}

/** Vertical posts run floor-to-top; horizontal boards keep the look-centred strip. */
export function beamExtentForOrientation(
	orientation: BeamOrientation,
	lookY: number,
	beamHeight: number,
	wallHeight: number,
	gridSize: number
): BeamVerticalExtent {
	if (orientation !== 'horizontal') {
		const top = Math.max(0, wallHeight);
		return { minY: 0, maxY: top };
	}
	return computeBeamVerticalExtent(lookY, beamHeight, wallHeight, gridSize);
}

export function cycleBeamOrientation(current: BeamOrientation): BeamOrientation {
	return current === 'vertical' ? 'horizontal' : 'vertical';
}
