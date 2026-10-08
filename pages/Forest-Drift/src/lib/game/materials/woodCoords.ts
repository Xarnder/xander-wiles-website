/**
 * "Log space" coordinates for solid procedural wood (`shader/woodShader.ts`). Pure — no Three.js.
 *
 * The wood shader is volumetric: it colours a point by where it sits inside a tree trunk whose axis
 * is the shader's Z. Each timber PIECE (a post, a beam, a floor board) is therefore given its own
 * imaginary log: the grain (log axis) runs along the piece's long axis, and the log's pith is placed
 * just outside the piece, offset across its thinnest side — how real boards and beams are sawn, and
 * what makes the faces show the long flat-sawn arcs and the end grain show growth rings. The offset
 * direction, distance and position along the log are hashed per piece, so neighbouring pieces never
 * look like copies of each other.
 *
 * Output is a `woodCoord` (x, y = across the log, z = along it) per vertex, in metres; the shader
 * scales metres to wood units.
 */

export type Vec3 = [number, number, number];

/** A piece's orthonormal frame: `grain` along the log, `wide` and `thin` across it. */
export interface WoodPieceFrame {
	center: Vec3;
	grain: Vec3;
	wide: Vec3;
	thin: Vec3;
	/** Half the piece's extent along `thin` (metres) — the pith is placed beyond it. */
	halfThin: number;
}

/** Where a piece's pith sits, in its (wide, thin) cross-section coordinates, plus a shift along the grain. */
export interface WoodLog {
	x: number;
	y: number;
	z: number;
}

/** Deterministic 0..1 hash of three ints and a seed (same mixer as `surfaceMapping.ts`). */
export function woodHash(a: number, b: number, c: number, seed: number): number {
	let h = seed | 0;
	h = Math.imul(h ^ a, 0x27d4eb2d);
	h = Math.imul(h ^ b, 0x165667b1);
	h = Math.imul(h ^ c, 0x85ebca6b);
	h ^= h >>> 15;
	h = Math.imul(h, 0xc2b2ae35);
	h ^= h >>> 13;
	return (h >>> 0) / 4294967296;
}

/**
 * The log a piece is cut from. The pith sits 0.5–6.5 cm beyond the piece's thin side (the three.js
 * example cuts its 12.5 cm boards with the pith 4 cm outside), in a direction jittered ±30° so some
 * pieces show rift/quarter-sawn straight grain and others cathedral arches; `z` slides the piece
 * along the log so ring wobble differs between pieces.
 */
export function woodLogFor(halfThin: number, h1: number, h2: number, h3: number): WoodLog {
	const side = h1 < 0.5 ? -1 : 1;
	const angle = (((h1 * 2) % 1) - 0.5) * 1.05;
	const distance = halfThin + 0.005 + h2 * 0.06;
	return {
		x: Math.sin(angle) * distance,
		y: side * Math.cos(angle) * distance,
		z: h3 * 60
	};
}

/** Writes the log-space coordinate of `point` into `out` at `offset`. */
export function writeWoodCoord(
	out: Float32Array,
	offset: number,
	point: Readonly<Vec3>,
	frame: WoodPieceFrame,
	log: WoodLog
): void {
	const dx = point[0] - frame.center[0];
	const dy = point[1] - frame.center[1];
	const dz = point[2] - frame.center[2];
	out[offset] = dx * frame.wide[0] + dy * frame.wide[1] + dz * frame.wide[2] - log.x;
	out[offset + 1] = dx * frame.thin[0] + dy * frame.thin[1] + dz * frame.thin[2] - log.y;
	out[offset + 2] = dx * frame.grain[0] + dy * frame.grain[1] + dz * frame.grain[2] + log.z;
}

const QUANTUM = 1e4; // 0.1 mm

/**
 * Splits a NON-INDEXED triangle list into pieces — triangles connected through shared MANIFOLD
 * edges (both end points coincide, exactly two triangles use it). Edges rather than vertices, so
 * pieces touching at a corner stay apart; manifold only, so a beam resting flush on a post (whose
 * contact edges are used by four triangles) stays apart too. Returns a piece id per triangle.
 */
export function findWoodPieces(positions: Float32Array): { pieceOf: Int32Array; count: number } {
	const triangleCount = Math.floor(positions.length / 9);
	const vertexIds = new Map<string, number>();
	const vertexId = (v: number) => {
		const o = v * 3;
		const key = `${Math.round(positions[o] * QUANTUM)},${Math.round(positions[o + 1] * QUANTUM)},${Math.round(positions[o + 2] * QUANTUM)}`;
		let id = vertexIds.get(key);
		if (id === undefined) {
			id = vertexIds.size;
			vertexIds.set(key, id);
		}
		return id;
	};

	const parent = new Int32Array(triangleCount);
	for (let i = 0; i < triangleCount; i++) parent[i] = i;
	const find = (i: number) => {
		while (parent[i] !== i) {
			parent[i] = parent[parent[i]];
			i = parent[i];
		}
		return i;
	};
	// Each edge's users. Inside one closed piece every edge has exactly two triangles; where pieces
	// touch (a beam resting on a post, flush faces), the contact edges have four — those never join.
	const edgeUsers = new Map<number, number[]>();
	for (let tri = 0; tri < triangleCount; tri++) {
		const ids = [vertexId(tri * 3), vertexId(tri * 3 + 1), vertexId(tri * 3 + 2)];
		for (let k = 0; k < 3; k++) {
			const a = ids[k];
			const b = ids[(k + 1) % 3];
			if (a === b) continue;
			const key = Math.min(a, b) * 2097152 + Math.max(a, b);
			const users = edgeUsers.get(key);
			if (users) users.push(tri);
			else edgeUsers.set(key, [tri]);
		}
	}
	for (const users of edgeUsers.values()) {
		if (users.length !== 2) continue;
		const ra = find(users[0]);
		const rb = find(users[1]);
		if (ra !== rb) parent[Math.max(ra, rb)] = Math.min(ra, rb);
	}

	const pieceOf = new Int32Array(triangleCount);
	const remap = new Map<number, number>();
	for (let tri = 0; tri < triangleCount; tri++) {
		const root = find(tri);
		let id = remap.get(root);
		if (id === undefined) {
			id = remap.size;
			remap.set(root, id);
		}
		pieceOf[tri] = id;
	}
	return { pieceOf, count: remap.size };
}

function normalize(v: Vec3): Vec3 {
	const len = Math.hypot(v[0], v[1], v[2]);
	return len > 1e-12 ? [v[0] / len, v[1] / len, v[2] / len] : [1, 0, 0];
}

function cross(a: Vec3, b: Vec3): Vec3 {
	return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function dot(a: Readonly<Vec3>, b: Readonly<Vec3>): number {
	return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/** Largest-magnitude component positive, so the same piece always gets the same axis sign. */
function canonical(v: Vec3): Vec3 {
	const ax = Math.abs(v[0]);
	const ay = Math.abs(v[1]);
	const az = Math.abs(v[2]);
	const dominant = ax >= ay && ax >= az ? v[0] : ay >= az ? v[1] : v[2];
	return dominant < 0 ? [-v[0], -v[1], -v[2]] : v;
}

/** Dominant eigenvector of a symmetric 3×3 matrix (row-major), by power iteration. */
function dominantAxis(m: Float64Array): Vec3 {
	// Start from the matrix's largest column — never orthogonal to the dominant eigenvector unless degenerate.
	let best = 0;
	let bestNorm = -1;
	for (let c = 0; c < 3; c++) {
		const n = m[c] * m[c] + m[3 + c] * m[3 + c] + m[6 + c] * m[6 + c];
		if (n > bestNorm) {
			bestNorm = n;
			best = c;
		}
	}
	let v: Vec3 = bestNorm > 1e-18 ? normalize([m[best], m[3 + best], m[6 + best]]) : [1, 0, 0];
	for (let i = 0; i < 32; i++) {
		v = normalize([
			m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
			m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
			m[6] * v[0] + m[7] * v[1] + m[8] * v[2]
		]);
	}
	return v;
}

/**
 * A piece's frame from its vertices: principal axes of the vertex cloud. The long axis is the grain;
 * the axis of least spread is `thin`. Works for boxes at any orientation and for the extruded
 * polygons used for braces.
 */
export function pieceFrameFromPoints(points: readonly Vec3[]): WoodPieceFrame {
	const center: Vec3 = [0, 0, 0];
	for (const p of points) {
		center[0] += p[0];
		center[1] += p[1];
		center[2] += p[2];
	}
	const n = Math.max(1, points.length);
	center[0] /= n;
	center[1] /= n;
	center[2] /= n;
	const cov = new Float64Array(9);
	for (const p of points) {
		const d = [p[0] - center[0], p[1] - center[1], p[2] - center[2]];
		for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) cov[r * 3 + c] += d[r] * d[c];
	}
	const grain = canonical(dominantAxis(cov));
	// Deflate and find the second axis (the "wide" one).
	const lambda = (() => {
		const mv = [
			cov[0] * grain[0] + cov[1] * grain[1] + cov[2] * grain[2],
			cov[3] * grain[0] + cov[4] * grain[1] + cov[5] * grain[2],
			cov[6] * grain[0] + cov[7] * grain[1] + cov[8] * grain[2]
		];
		return mv[0] * grain[0] + mv[1] * grain[1] + mv[2] * grain[2];
	})();
	const deflated = new Float64Array(9);
	for (let r = 0; r < 3; r++)
		for (let c = 0; c < 3; c++) deflated[r * 3 + c] = cov[r * 3 + c] - lambda * grain[r] * grain[c];
	let wide = dominantAxis(deflated);
	// Re-orthogonalise against the grain (power iteration on a near-degenerate matrix drifts).
	const along = dot(wide, grain);
	wide = normalize([
		wide[0] - along * grain[0],
		wide[1] - along * grain[1],
		wide[2] - along * grain[2]
	]);
	if (Math.abs(dot(wide, grain)) > 0.5 || !Number.isFinite(wide[0])) {
		wide = normalize(cross(grain, Math.abs(grain[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]));
	}
	wide = canonical(wide);
	const thin = canonical(normalize(cross(grain, wide)));
	let halfThin = 0;
	for (const p of points) {
		const t = Math.abs(
			(p[0] - center[0]) * thin[0] + (p[1] - center[1]) * thin[1] + (p[2] - center[2]) * thin[2]
		);
		if (t > halfThin) halfThin = t;
	}
	return { center, grain, wide, thin, halfThin };
}

/**
 * `woodCoord` for every vertex of a non-indexed triangle list (anchor-space metres). Pieces are
 * found by edge connectivity, framed by their principal axes, and each gets a log hashed from its
 * (quantised) centre and `seed`, so the result is stable for a building however it was rebuilt.
 */
export function computeWoodCoordinates(positions: Float32Array, seed: number): Float32Array {
	const triangleCount = Math.floor(positions.length / 9);
	const out = new Float32Array(triangleCount * 9);
	if (triangleCount === 0) return out;
	const { pieceOf, count } = findWoodPieces(positions);

	const piecePoints: Vec3[][] = Array.from({ length: count }, () => []);
	const seen: Set<string>[] = Array.from({ length: count }, () => new Set());
	for (let tri = 0; tri < triangleCount; tri++) {
		const piece = pieceOf[tri];
		for (let k = 0; k < 3; k++) {
			const o = (tri * 3 + k) * 3;
			const key = `${Math.round(positions[o] * QUANTUM)},${Math.round(positions[o + 1] * QUANTUM)},${Math.round(positions[o + 2] * QUANTUM)}`;
			if (seen[piece].has(key)) continue;
			seen[piece].add(key);
			piecePoints[piece].push([positions[o], positions[o + 1], positions[o + 2]]);
		}
	}

	const frames = piecePoints.map((points) => pieceFrameFromPoints(points));
	const logs = frames.map((frame) => {
		const cx = Math.round(frame.center[0] * 100);
		const cy = Math.round(frame.center[1] * 100);
		const cz = Math.round(frame.center[2] * 100);
		return woodLogFor(
			frame.halfThin,
			woodHash(cx, cy, cz, seed),
			woodHash(cz, cx, cy, seed ^ 0x5bd1e995),
			woodHash(cy, cz, cx, seed ^ 0x68e31da4)
		);
	});

	const point: Vec3 = [0, 0, 0];
	for (let tri = 0; tri < triangleCount; tri++) {
		const piece = pieceOf[tri];
		for (let k = 0; k < 3; k++) {
			const o = (tri * 3 + k) * 3;
			point[0] = positions[o];
			point[1] = positions[o + 1];
			point[2] = positions[o + 2];
			writeWoodCoord(out, o, point, frames[piece], logs[piece]);
		}
	}
	return out;
}
