import * as THREE from 'three';
import { stairCanonicalToLocalXZ, stairDirectionFlipsWinding } from './stairMath';
import type { StairLocalBounds, StairMetrics } from './stairMath';
import type { StairDirection } from './StairTypes';

/**
 * Builds one staircase's solid stepped mesh: a real stack of tread boxes (never a single flat
 * ramp), merged into one BufferGeometry — see the README's "Stairs" section.
 *
 * Each tread `i` (0-indexed) is a box spanning canonical run `[i * stepRun, runMeters]` (i.e. it
 * extends all the way to the top — the portion beyond its own cell is simply hidden beneath the
 * boxes for higher treads) and canonical rise `[i * stepRise, (i + 1) * stepRise]`. The union of
 * these `stepCount` boxes is exactly the classic nested-box staircase profile: at any point along
 * the run, the visible/walkable height is `(k + 1) * stepRise` where `k` is that point's cell index
 * — a flat 1-cell-wide tread at each level, with a solid mass underneath (an acceptable, documented
 * v1 simplification — see the README; no open timber understructure yet).
 *
 * Built once in canonical stair space (run along +X, width along +Z, rise along +Y) using real
 * `THREE.BoxGeometry` for correct per-face normals/UVs, then every vertex is remapped into
 * foundation-local space via the SAME `stairCanonicalToLocalXZ` collision uses (see its doc
 * comment). That remap is a pure axis permutation/reflection — never a shear or scale — so normals
 * transform by the same function (with an all-zero bounds, recovering just the linear part).
 * Two of the four directions reflect (flip triangle winding); `stairDirectionFlipsWinding` says
 * which, and this reverses their index order afterward so lighting/backface-culling stay correct
 * without needing a double-sided material.
 */
export function buildStairGeometry(
	bounds: StairLocalBounds,
	direction: StairDirection,
	baseY: number,
	metrics: StairMetrics
): THREE.BufferGeometry {
	const { stepCount, stepRise, stepRun, widthMeters, runMeters } = metrics;
	if (stepCount <= 0 || widthMeters <= 0) return new THREE.BufferGeometry();

	const positions: number[] = [];
	const normals: number[] = [];
	const indices: number[] = [];
	let vertexOffset = 0;

	for (let i = 0; i < stepCount; i++) {
		const xMin = i * stepRun;
		const xMax = runMeters;
		const yMin = i * stepRise;
		const yMax = (i + 1) * stepRise;
		const zMin = 0;
		const zMax = widthMeters;

		const box = new THREE.BoxGeometry(xMax - xMin, yMax - yMin, zMax - zMin);
		const posAttr = box.getAttribute('position') as THREE.BufferAttribute;
		const normAttr = box.getAttribute('normal') as THREE.BufferAttribute;
		const cx = (xMin + xMax) / 2;
		const cy = (yMin + yMax) / 2;
		const cz = (zMin + zMax) / 2;

		for (let v = 0; v < posAttr.count; v++) {
			positions.push(posAttr.getX(v) + cx, posAttr.getY(v) + cy, posAttr.getZ(v) + cz);
			normals.push(normAttr.getX(v), normAttr.getY(v), normAttr.getZ(v));
		}
		const boxIndex = box.getIndex();
		if (boxIndex) {
			for (let k = 0; k < boxIndex.count; k++) indices.push(boxIndex.getX(k) + vertexOffset);
		}
		vertexOffset += posAttr.count;
		box.dispose();
	}

	const zeroBounds: StairLocalBounds = { minLocalX: 0, maxLocalX: 0, minLocalZ: 0, maxLocalZ: 0 };
	const vertexCount = positions.length / 3;
	for (let v = 0; v < vertexCount; v++) {
		const px = positions[v * 3];
		const py = positions[v * 3 + 1];
		const pz = positions[v * 3 + 2];
		const localPos = stairCanonicalToLocalXZ(bounds, direction, px, pz);
		positions[v * 3] = localPos.x;
		positions[v * 3 + 1] = baseY + py;
		positions[v * 3 + 2] = localPos.z;

		const nx = normals[v * 3];
		const nz = normals[v * 3 + 2];
		const localNormal = stairCanonicalToLocalXZ(zeroBounds, direction, nx, nz);
		normals[v * 3] = localNormal.x;
		normals[v * 3 + 2] = localNormal.z;
	}

	if (stairDirectionFlipsWinding(direction)) {
		for (let k = 0; k < indices.length; k += 3) {
			const tmp = indices[k + 1];
			indices[k + 1] = indices[k + 2];
			indices[k + 2] = tmp;
		}
	}

	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
	geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
	geometry.setIndex(indices);
	return geometry;
}
