import * as THREE from 'three';
import type { UvRect } from './openingVisualMath';

const SEGMENTS = 32;

/** A round arch for normal doors, flattened to an ellipse for wide/short openings. */
export function doorArchSpringY(rect: UvRect): number {
	return rect.maxY - Math.min((rect.maxU - rect.minU) / 2, (rect.maxY - rect.minY) * 0.45);
}

function archTop(u: number, profile: UvRect, springY: number): number {
	const radius = (profile.maxU - profile.minU) / 2;
	const x = (u - (profile.minU + profile.maxU) / 2) / radius;
	return springY + Math.max(0, profile.maxY - springY) * Math.sqrt(Math.max(0, 1 - x * x));
}

function topPoints(
	rect: UvRect,
	profile: UvRect,
	springY: number,
	reverse = false
): THREE.Vector2[] {
	const radius = (profile.maxU - profile.minU) / 2;
	const center = (profile.minU + profile.maxU) / 2;
	const angleAt = (u: number) => Math.acos(Math.max(-1, Math.min(1, (u - center) / radius)));
	const start = angleAt(rect.minU);
	const end = angleAt(rect.maxU);
	// Half-width infill and full-width frames share exactly the same arc vertices.
	const steps = Math.max(1, Math.round((SEGMENTS * Math.abs(end - start)) / Math.PI));
	return Array.from({ length: steps + 1 }, (_, i) => {
		const t = reverse ? 1 - i / steps : i / steps;
		const angle = start + (end - start) * t;
		return new THREE.Vector2(
			center + radius * Math.cos(angle),
			springY + Math.max(0, profile.maxY - springY) * Math.sin(angle)
		);
	});
}

function extrude(points: THREE.Vector2[], depth: number): THREE.ExtrudeGeometry {
	const geometry = new THREE.ExtrudeGeometry(new THREE.Shape(points), {
		depth,
		bevelEnabled: false
	});
	geometry.translate(0, 0, -depth / 2);
	return geometry;
}

/** Both halves sample the same curve, so a double door meets at the crown of one arch. */
export function archedDoorLeafGeometry(
	profile: UvRect,
	leaf: UvRect,
	springY: number,
	depth: number
): THREE.BufferGeometry {
	return extrude(
		[
			new THREE.Vector2(leaf.minU, leaf.minY),
			new THREE.Vector2(leaf.maxU, leaf.minY),
			...topPoints(leaf, profile, springY, true)
		],
		depth
	);
}

/** A continuous U-shaped architrave, with no threshold across the floor. */
export function archedDoorFrameGeometry(
	outer: UvRect,
	inner: UvRect,
	depth: number
): THREE.BufferGeometry {
	const springY = doorArchSpringY(outer);
	return extrude(
		[
			new THREE.Vector2(outer.minU, outer.minY),
			...topPoints(outer, outer, springY),
			new THREE.Vector2(outer.maxU, outer.minY),
			new THREE.Vector2(inner.maxU, inner.minY),
			...topPoints(inner, inner, springY, true),
			new THREE.Vector2(inner.minU, inner.minY)
		],
		depth
	);
}

/** Close the rectangular wall cut's upper corners using the owning wall's own material. */
export function doorArchInfillGeometry(rect: UvRect, depth: number): THREE.BufferGeometry {
	const springY = doorArchSpringY(rect);
	const middle = (rect.minU + rect.maxU) / 2;
	const left = { ...rect, maxU: middle };
	const right = { ...rect, minU: middle };
	const shapes = [left, right].map(
		(half) =>
			new THREE.Shape([
				new THREE.Vector2(half.minU, rect.maxY),
				new THREE.Vector2(half.maxU, rect.maxY),
				...topPoints(half, rect, springY, true)
			])
	);
	const geometry = new THREE.ExtrudeGeometry(shapes, { depth, bevelEnabled: false });
	geometry.translate(0, 0, -depth / 2);
	return geometry;
}

/** Small fixed colliders follow the curved wall corners even when the leaves are open. */
export function doorArchCollisionSegments(rect: UvRect): UvRect[] {
	const springY = doorArchSpringY(rect);
	const pieces: UvRect[] = [];
	for (let i = 0; i < SEGMENTS; i++) {
		const minU = rect.minU + ((rect.maxU - rect.minU) * i) / SEGMENTS;
		const maxU = rect.minU + ((rect.maxU - rect.minU) * (i + 1)) / SEGMENTS;
		const minY = Math.max(archTop(minU, rect, springY), archTop(maxU, rect, springY));
		if (minY < rect.maxY - 1e-6) pieces.push({ minU, maxU, minY, maxY: rect.maxY });
	}
	return pieces;
}
