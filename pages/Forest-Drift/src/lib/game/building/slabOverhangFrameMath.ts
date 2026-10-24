import { ensureCCW } from './slabMath';
import type { Point2D } from './wallPathMath';

export interface SlabEdgeSupport {
	start: Point2D;
	end: Point2D;
	/** Half the supporting wall's thickness; zero for a neighbouring slab edge. */
	halfWidth: number;
}

export interface ExposedSlabEdge {
	start: Point2D;
	end: Point2D;
	outward: Point2D;
}

const EPS = 1e-6;

/** Subtract wall coverage and shared slab edges, retaining partial overhangs on arbitrary polygons. */
export function exposedSlabEdges(
	polygon: readonly Point2D[],
	supports: readonly SlabEdgeSupport[]
): ExposedSlabEdge[] {
	const points = ensureCCW(polygon);
	const result: ExposedSlabEdge[] = [];
	for (let i = 0; i < points.length; i++) {
		const start = points[i];
		const end = points[(i + 1) % points.length];
		const length = Math.hypot(end.x - start.x, end.z - start.z);
		if (length < EPS) continue;
		const dx = (end.x - start.x) / length;
		const dz = (end.z - start.z) / length;
		const covered: [number, number][] = [];
		for (const support of supports) {
			const sx = support.end.x - support.start.x;
			const sz = support.end.z - support.start.z;
			const supportLength = Math.hypot(sx, sz);
			// A wall crossing the edge at a point does not support an entire stretch of its rim.
			if (supportLength < EPS || Math.abs(dx * sz - dz * sx) > EPS * supportLength) continue;
			const offset = Math.abs(dx * (support.start.z - start.z) - dz * (support.start.x - start.x));
			if (offset > support.halfWidth + EPS) continue;
			const a = (support.start.x - start.x) * dx + (support.start.z - start.z) * dz;
			const b = (support.end.x - start.x) * dx + (support.end.z - start.z) * dz;
			const low = Math.max(0, Math.min(a, b));
			const high = Math.min(length, Math.max(a, b));
			if (high - low > EPS) covered.push([low, high]);
		}
		covered.sort((a, b) => a[0] - b[0]);
		const add = (low: number, high: number) => {
			if (high - low <= EPS) return;
			result.push({
				start: { x: start.x + dx * low, z: start.z + dz * low },
				end: { x: start.x + dx * high, z: start.z + dz * high },
				outward: { x: dz, z: -dx }
			});
		};
		let cursor = 0;
		for (const [low, high] of covered) {
			add(cursor, low);
			cursor = Math.max(cursor, high);
		}
		add(cursor, length);
	}
	return result;
}
