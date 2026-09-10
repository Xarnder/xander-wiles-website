// Four identical, rotated cubic sides give each phase exactly a quarter of the path.
export const pathData =
	'M 90 390 C 80 380 114 324 114 240 C 114 156 80 100 90 90 C 100 80 156 114 240 114 C 324 114 380 80 390 90 C 400 100 366 156 366 240 C 366 324 400 380 390 390 C 380 400 324 366 240 366 C 156 366 100 400 90 390 Z';
export type PathPoint = { x: number; y: number };
export function nearestPosition(points: PathPoint[], x: number, y: number) {
	let best = 0,
		distance = Infinity;
	for (let i = 0; i < points.length; i++) {
		const d = (points[i].x - x) ** 2 + (points[i].y - y) ** 2;
		if (d < distance) {
			distance = d;
			best = i;
		}
	}
	return best / points.length;
}
