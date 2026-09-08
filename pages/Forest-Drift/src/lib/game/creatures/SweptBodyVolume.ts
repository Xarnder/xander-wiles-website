import { CatmullRomCurve3, Vector3 } from 'three';
import type { BodyVolumeDefinition, CreatureCompiledGeometry, Vec3 } from './CreatureTypes';

export interface GeometryAccumulator {
	positions: number[];
	indices: number[];
	skinIndices: number[];
	skinWeights: number[];
	uvs: number[];
	parts: string[];
}
export const geometryAccumulator = (): GeometryAccumulator => ({
	positions: [],
	indices: [],
	skinIndices: [],
	skinWeights: [],
	uvs: [],
	parts: []
});
/** Project the previous normal onto the next tangent plane: a rotation-minimising transport frame. */
export function appendSweep(
	out: GeometryAccumulator,
	volume: BodyVolumeDefinition,
	points: Vec3[],
	boneIndices: number[],
	lod: 0 | 1,
	subdivisions = lod === 0 ? 7 : 3
) {
	if (points.length < 2) throw new Error('A sweep needs at least two joints');
	const curve = new CatmullRomCurve3(
		points.map((p) => new Vector3(p.x, p.y, p.z)),
		false,
		'centripetal'
	);
	const rings = Math.max(6, (points.length - 1) * subdivisions),
		sides = lod === 0 ? 12 : 7,
		start = out.positions.length / 3;
	const normal = new Vector3(1, 0, 0);
	for (let r = 0; r <= rings; r++) {
		const t = r / rings,
			center = curve.getPoint(t),
			tangent = curve.getTangent(t).normalize();
		normal.addScaledVector(tangent, -normal.dot(tangent));
		if (normal.lengthSq() < 1e-10) {
			normal.set(0, 1, 0).addScaledVector(tangent, -tangent.y);
			if (normal.lengthSq() < 1e-10) normal.set(0, 0, 1);
		}
		normal.normalize();
		const binormal = new Vector3().crossVectors(tangent, normal).normalize();
		let si = 0;
		while (si < volume.sections.length - 2 && volume.sections[si + 1].t < t) si++;
		const a = volume.sections[si],
			b = volume.sections[si + 1] ?? a,
			f = b.t === a.t ? 0 : (t - a.t) / (b.t - a.t);
		const mix = (x: number, y: number) => x + (y - x) * f;
		const rx = mix(a.radiusX, b.radiusX),
			ry = mix(a.radiusY, b.radiusY),
			rotation = mix(a.rotation ?? 0, b.rotation ?? 0);
		const chain = t * (points.length - 1),
			j = Math.min(points.length - 2, Math.floor(chain)),
			weight = chain - j;
		for (let c = 0; c < sides; c++) {
			const angle = (c / sides) * Math.PI * 2 + rotation;
			const vertex = center
				.clone()
				.addScaledVector(normal, Math.cos(angle) * rx + mix(a.offsetX ?? 0, b.offsetX ?? 0))
				.addScaledVector(binormal, Math.sin(angle) * ry + mix(a.offsetY ?? 0, b.offsetY ?? 0));
			out.positions.push(vertex.x, vertex.y, vertex.z);
			out.skinIndices.push(boneIndices[j], boneIndices[j + 1], 0, 0);
			out.skinWeights.push(1 - weight, weight, 0, 0);
			out.uvs.push(c / sides, t);
			out.parts.push(volume.id);
			if (r < rings) {
				const here = start + r * sides + c,
					next = start + r * sides + ((c + 1) % sides);
				out.indices.push(here, next, here + sides, next, next + sides, here + sides);
			}
		}
	}
	// Independent cap centres avoid degenerate triangles and keep every index in range.
	for (const end of [0, 1]) {
		const point = curve.getPoint(end),
			idx = out.positions.length / 3,
			ring = start + (end ? rings : 0) * sides;
		out.positions.push(point.x, point.y, point.z);
		out.skinIndices.push(boneIndices[end ? boneIndices.length - 1 : 0], 0, 0, 0);
		out.skinWeights.push(1, 0, 0, 0);
		out.uvs.push(0.5, end);
		out.parts.push(volume.id);
		for (let c = 0; c < sides; c++) {
			const a = ring + c,
				b = ring + ((c + 1) % sides);
			out.indices.push(idx, ...(end ? [a, b] : [b, a]));
		}
	}
}
export function finishGeometry(
	out: GeometryAccumulator,
	colors: number[]
): CreatureCompiledGeometry {
	const normals = new Float32Array(out.positions.length);
	for (let i = 0; i < out.indices.length; i += 3) {
		const a = out.indices[i] * 3,
			b = out.indices[i + 1] * 3,
			c = out.indices[i + 2] * 3;
		const ab = new Vector3(
			out.positions[b] - out.positions[a],
			out.positions[b + 1] - out.positions[a + 1],
			out.positions[b + 2] - out.positions[a + 2]
		);
		const ac = new Vector3(
			out.positions[c] - out.positions[a],
			out.positions[c + 1] - out.positions[a + 1],
			out.positions[c + 2] - out.positions[a + 2]
		);
		const n = ab.cross(ac);
		for (const k of [a, b, c]) {
			normals[k] += n.x;
			normals[k + 1] += n.y;
			normals[k + 2] += n.z;
		}
	}
	for (let i = 0; i < normals.length; i += 3) {
		const length = Math.hypot(normals[i], normals[i + 1], normals[i + 2]) || 1;
		normals[i] /= length;
		normals[i + 1] /= length;
		normals[i + 2] /= length;
	}
	return {
		positions: new Float32Array(out.positions),
		indices: new Uint32Array(out.indices),
		normals,
		skinIndices: new Uint16Array(out.skinIndices),
		skinWeights: new Float32Array(out.skinWeights),
		uvs: new Float32Array(out.uvs),
		colors: new Float32Array(colors)
	};
}
