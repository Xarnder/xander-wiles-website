/**
 * Window/Door/Beam placement snap along a wall's own length — press `B` to cycle. Framework-free, same
 * rule as polygonDrawSnap.ts, so the choice of centre-U is unit-testable without a renderer.
 *
 * `'off'` leaves the along-wall position unsnapped. `'grid'` keeps today's `openingGridSize` snap. Division modes snap the opening's centre to the
 * nearest even split of that wall's length (half through sixteenths) so a door or window can sit
 * exactly in the middle, at the quarters, and so on, instead of only on a fixed metre grid.
 */

export type OpeningDivisionSnapMode =
	| 'off'
	| 'grid'
	| 'half'
	| 'thirds'
	| 'quarters'
	| 'fifths'
	| 'sixths'
	| 'sevenths'
	| 'eighths'
	| 'ninths'
	| 'tenths'
	| 'elevenths'
	| 'twelfths'
	| 'thirteenths'
	| 'fourteenths'
	| 'fifteenths'
	| 'sixteenths';

// Twelve internal guide lines split the wall into thirteen equal segments.
export const DEFAULT_OPENING_SNAP_MODE: OpeningDivisionSnapMode = 'thirteenths';

// Put the default immediately before Off so the first B press disables snapping.
export const OPENING_DIVISION_CYCLE: readonly OpeningDivisionSnapMode[] = [
	'off',
	'grid',
	'half',
	'thirds',
	'quarters',
	'fifths',
	'sixths',
	'sevenths',
	'eighths',
	'ninths',
	'tenths',
	'elevenths',
	'twelfths',
	'fourteenths',
	'fifteenths',
	'sixteenths',
	'thirteenths'
];

const DIVISION_COUNTS: Record<Exclude<OpeningDivisionSnapMode, 'grid' | 'off'>, number> = {
	half: 2,
	thirds: 3,
	quarters: 4,
	fifths: 5,
	sixths: 6,
	sevenths: 7,
	eighths: 8,
	ninths: 9,
	tenths: 10,
	elevenths: 11,
	twelfths: 12,
	thirteenths: 13,
	fourteenths: 14,
	fifteenths: 15,
	sixteenths: 16
};

const DIVISION_BADGES: Record<Exclude<OpeningDivisionSnapMode, 'grid' | 'off'>, string> = {
	half: 'HALF SNAP',
	thirds: 'THIRDS SNAP',
	quarters: 'QUARTER SNAP',
	fifths: 'FIFTHS SNAP',
	sixths: 'SIXTHS SNAP',
	sevenths: 'SEVENTHS SNAP',
	eighths: 'EIGHTHS SNAP',
	ninths: 'NINTHS SNAP',
	tenths: 'TENTHS SNAP',
	elevenths: 'ELEVENTHS SNAP',
	twelfths: 'TWELFTHS SNAP',
	thirteenths: '12 LINE SNAP',
	fourteenths: 'FOURTEENTHS SNAP',
	fifteenths: 'FIFTEENTHS SNAP',
	sixteenths: 'SIXTEENTHS SNAP'
};

export function cycleOpeningDivisionSnap(
	current: OpeningDivisionSnapMode
): OpeningDivisionSnapMode {
	const index = OPENING_DIVISION_CYCLE.indexOf(current);
	const from = index >= 0 ? index : 0;
	return OPENING_DIVISION_CYCLE[(from + 1) % OPENING_DIVISION_CYCLE.length];
}

/** How many equal spans the wall is split into, or `null` for metre-grid snap or no snap. */
export function openingDivisionCount(mode: OpeningDivisionSnapMode): number | null {
	if (mode === 'grid' || mode === 'off') return null;
	return DIVISION_COUNTS[mode];
}

/** Interior split points along a wall (never 0 or `wallLength` — those are the ends, not a division). */
export function openingDivisionPoints(wallLength: number, mode: OpeningDivisionSnapMode): number[] {
	const divisions = openingDivisionCount(mode);
	if (!divisions || wallLength <= 0) return [];
	const points: number[] = [];
	for (let i = 1; i < divisions; i++) points.push((wallLength * i) / divisions);
	return points;
}

/** Metre-grid snap used for opening/beam centre-U in `'grid'` mode, and for a beam's look-at Y. */
export function snapOpeningCoord(raw: number, gridSize: number): number {
	const size = Math.max(1e-6, gridSize);
	return Math.round(raw / size) * size;
}

export function snapOpeningCenterU(
	rawU: number,
	wallLength: number,
	mode: OpeningDivisionSnapMode,
	gridSize: number
): number {
	if (mode === 'off') return rawU;
	if (mode === 'grid') {
		return snapOpeningCoord(rawU, gridSize);
	}
	const points = openingDivisionPoints(wallLength, mode);
	if (points.length === 0) return snapOpeningCenterU(rawU, wallLength, 'grid', gridSize);
	let best = points[0];
	let bestDist = Math.abs(points[0] - rawU);
	for (let i = 1; i < points.length; i++) {
		const dist = Math.abs(points[i] - rawU);
		if (dist < bestDist) {
			bestDist = dist;
			best = points[i];
		}
	}
	return best;
}

/** Crosshair badge copy — `null` for grid snap so the existing metre-grid behaviour stays visually quiet. */
export function openingDivisionSnapBadge(mode: OpeningDivisionSnapMode): string | null {
	if (mode === 'off') return 'SNAP OFF';
	if (mode === 'grid') return null;
	return DIVISION_BADGES[mode];
}
