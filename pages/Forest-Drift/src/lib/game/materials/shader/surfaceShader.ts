import * as THREE from 'three';
import { setOwnShaderHook } from './shaderHooks';

/**
 * World-scale, non-repeating surface shading layered onto a `MeshStandardMaterial`.
 *
 * WHY: a CPU-generated texture is one tile stamped over and over, so any recognisable feature in it
 * — a block, a cluster of cobbles, a clump of grass — recurs on a grid. The fix here moves the
 * STRUCTURE out of the texture and into the fragment shader, evaluated in surface metres (the UVs
 * `surfaceMapping.ts` writes, or terrain's world UVs). Nothing in it is periodic, so a 60 m wall or
 * courtyard has no repeat at all; the CPU texture only supplies structureless micro detail (stone
 * grain, plaster grit, grass blades), sampled stochastically so even that shows no tile grid.
 *
 * Kinds:
 * - `coursed`  — masonry / setts: courses of varying height, blocks of varying length per course.
 * - `cellular` — cobbles, flagstones, fieldstone: domain-warped Voronoi stones whose size drifts.
 * - `cover`    — grass/ground: macro patches (lush, dry, bare soil) over a no-tile detail texture.
 * - `noTile`   — stochastic sampling only (plaster, gravel): breaks the tile grid of a texture that
 *                has no structure to preserve.
 *
 * Every layout feature (stone, course, patch) is hashed from integer cell coordinates plus a seed
 * uniform: deterministic per world seed, different between worlds.
 *
 * Injection only touches named chunks (`map_fragment`, `normal_fragment_maps`, ...) and only
 * replaces exact `texture2D(...)` calls inside them; if a future three.js renames one, that part
 * degrades to ordinary sampling instead of breaking the shader.
 */
export type SurfaceShaderKind = 'coursed' | 'cellular' | 'cover' | 'noTile';

export type SurfaceShaderQuality = 0 | 1 | 2;

/** Shared uniform values — mutate `.value`s to retune live, no recompile. */
export interface SurfaceShaderUniforms {
	uFsSeed: { value: THREE.Vector2 };
	/** Converts the mesh's UV units to metres (1 for binder UVs, 8 for terrain). */
	uFsUvToMetres: { value: number };
	/** Layout: x = course height / cell size (m), y = block length (m), z = jitter (0..1), w = cell aspect (height ÷ width). */
	uFsLayout: { value: THREE.Vector4 };
	/** x = joint half width (m), y = bevel width (m), z = dome (m), w = proud (m). */
	uFsProfile: { value: THREE.Vector4 };
	/** x = variation, y = weathering, z = dirt, w = moss (0..1). */
	uFsAmount: { value: THREE.Vector4 };
	uFsStone: { value: THREE.Color };
	uFsStoneDark: { value: THREE.Color };
	uFsStoneLight: { value: THREE.Color };
	uFsJoint: { value: THREE.Color };
	uFsDirt: { value: THREE.Color };
	uFsMoss: { value: THREE.Color };
	/** Cover kind: lush / dry / soil tints relative to the base (multipliers). */
	uFsLush: { value: THREE.Color };
	uFsDry: { value: THREE.Color };
	uFsSoil: { value: THREE.Color };
	/** Painted-colour multiplier on top of the palette colours. */
	uFsTint: { value: THREE.Color };
	/** Base roughness the detail map is normalised against. */
	uFsRoughness: { value: number };
	/** Joint roughness. */
	uFsJointRoughness: { value: number };
	/** Domain-warp strength of cellular layouts (0 = plain Voronoi). */
	uFsWarp: { value: number };
	/** Hand-laid irregularity: joint waviness and edge chipping (0..1). */
	uFsIrregularity: { value: number };
	/** Cellular: 0 = polygonal flags, 1 = rounded cobbles with sandy gaps at the corners. */
	uFsRoundness: { value: number };
	/** 1 = worn, polished stone tops (paving under foot traffic). */
	uFsWorn: { value: number };
}

export function createSurfaceShaderUniforms(): SurfaceShaderUniforms {
	return {
		uFsSeed: { value: new THREE.Vector2(0, 0) },
		uFsUvToMetres: { value: 1 },
		uFsLayout: { value: new THREE.Vector4(0.3, 0.6, 0.85, 1) },
		uFsProfile: { value: new THREE.Vector4(0.008, 0.03, 0.006, 0.006) },
		uFsAmount: { value: new THREE.Vector4(0.5, 0.4, 0.3, 0.2) },
		uFsStone: { value: new THREE.Color(0.5, 0.5, 0.5) },
		uFsStoneDark: { value: new THREE.Color(0.35, 0.35, 0.35) },
		uFsStoneLight: { value: new THREE.Color(0.65, 0.65, 0.65) },
		uFsJoint: { value: new THREE.Color(0.3, 0.3, 0.3) },
		uFsDirt: { value: new THREE.Color(0.2, 0.17, 0.13) },
		uFsMoss: { value: new THREE.Color(0.1, 0.14, 0.05) },
		uFsLush: { value: new THREE.Color(0.7, 0.95, 0.6) },
		uFsDry: { value: new THREE.Color(1.35, 1.15, 0.75) },
		uFsSoil: { value: new THREE.Color(0.75, 0.58, 0.42) },
		uFsTint: { value: new THREE.Color(1, 1, 1) },
		uFsRoughness: { value: 0.9 },
		uFsJointRoughness: { value: 0.97 },
		uFsWarp: { value: 1 },
		uFsIrregularity: { value: 0.5 },
		uFsRoundness: { value: 0 },
		uFsWorn: { value: 0 }
	};
}

const COMMON = /* glsl */ `
varying vec2 vFsUv;
uniform vec2 uFsSeed;
uniform float uFsUvToMetres;

float fsHash12(vec2 p) {
	vec3 p3 = fract(vec3(p.xyx) * 0.1031);
	p3 += dot(p3, p3.yzx + 33.33);
	return fract((p3.x + p3.y) * p3.z);
}

vec2 fsHash22(vec2 p) {
	vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
	p3 += dot(p3, p3.yzx + 33.33);
	return fract((p3.xx + p3.yz) * p3.zy);
}

float fsNoise(vec2 p) {
	vec2 i = floor(p);
	vec2 f = fract(p);
	vec2 u = f * f * (3.0 - 2.0 * f);
	float a = fsHash12(i + uFsSeed);
	float b = fsHash12(i + vec2(1.0, 0.0) + uFsSeed);
	float c = fsHash12(i + vec2(0.0, 1.0) + uFsSeed);
	float d = fsHash12(i + vec2(1.0, 1.0) + uFsSeed);
	return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

// Fractal value noise in 0..1 — not periodic: features never repeat on a grid.
float fsFbm(vec2 p) {
	float sum = 0.0;
	float amplitude = 0.5;
	for (int i = 0; i < FS_OCTAVES; i++) {
		sum += amplitude * fsNoise(p);
		p = mat2(1.6, 1.2, -1.2, 1.6) * p + vec2(17.13, 9.71);
		amplitude *= 0.5;
	}
	return sum / (1.0 - pow(0.5, float(FS_OCTAVES)));
}

// Stochastic, non-tiling texture lookup (after Inigo Quilez's "texture repetition" #3): a smooth,
// non-periodic index field picks a random offset per region and regions cross-fade, so the texture
// tile grid disappears. textureGrad keeps mip selection continuous across region changes.
vec4 fsNoTile(sampler2D tex, vec2 uv) {
	#if FS_QUALITY == 0
	// Low tier: one fetch with a per-region offset hashed on a coarse world grid would seam, so the
	// lightweight path keeps plain sampling; macro layers still break up the repeat.
	return texture2D(tex, uv);
	#endif
	float k = fsNoise(uv * 0.55 + 31.7);
	float l = k * 8.0;
	float ia = floor(l);
	float f = fract(l);
	vec2 offa = fsHash22(vec2(ia, 1.7) + uFsSeed);
	vec2 offb = fsHash22(vec2(ia + 1.0, 1.7) + uFsSeed);
	vec2 dx = dFdx(uv);
	vec2 dy = dFdy(uv);
	vec4 cola = textureGrad(tex, uv + offa, dx, dy);
	vec4 colb = textureGrad(tex, uv + offb, dx, dy);
	vec4 diff = cola - colb;
	return mix(cola, colb, smoothstep(0.2, 0.8, f - 0.1 * (diff.x + diff.y + diff.z)));
}

// Bump perturbation from a height derivative (Mikkelsen's surface gradient, unnormalised so the
// slope is physical: metres of height per metre of surface).
vec3 fsPerturbNormal(vec3 surfPos, vec3 surfNorm, vec2 dHdxy, float faceDir) {
	vec3 sigmaX = dFdx(surfPos);
	vec3 sigmaY = dFdy(surfPos);
	vec3 r1 = cross(sigmaY, surfNorm);
	vec3 r2 = cross(surfNorm, sigmaX);
	float det = dot(sigmaX, r1) * faceDir;
	vec3 grad = sign(det) * (dHdxy.x * r1 + dHdxy.y * r2);
	return normalize(abs(det) * surfNorm - grad);
}
`;

const STONE = /* glsl */ `
uniform vec4 uFsLayout;
uniform vec4 uFsProfile;
uniform vec4 uFsAmount;
uniform vec3 uFsStone;
uniform vec3 uFsStoneDark;
uniform vec3 uFsStoneLight;
uniform vec3 uFsJoint;
uniform vec3 uFsDirt;
uniform vec3 uFsMoss;
uniform vec3 uFsTint;
uniform float uFsRoughness;
uniform float uFsJointRoughness;
uniform float uFsWarp;
uniform float uFsIrregularity;
uniform float uFsRoundness;
uniform float uFsWorn;

struct FsCell {
	float edge;   // metres to the stone outline
	vec2 dir;     // unit gradient of edge in surface metres (points away from the nearest joint)
	vec2 id;      // stable per-stone id
	vec2 local;   // position inside the stone, about -0.5..0.5
	vec2 extent;  // stone size in metres (for per-stone tilt)
};

// Value-noise gradient by forward differences (in the noise's own units).
vec2 fsNoiseGrad(vec2 q) {
	float n0 = fsNoise(q);
	return vec2(fsNoise(q + vec2(0.02, 0.0)) - n0, fsNoise(q + vec2(0.0, 0.02)) - n0) / 0.02;
}

#ifdef FS_COURSED
// Course k's lower bed joint: nominal spacing with a large per-course jitter, so course heights
// vary irregularly but never overlap. Not periodic: k is unbounded.
float fsCourseLine(float k, float h) {
	return k * h + (fsHash12(vec2(k, 7.31) + uFsSeed) - 0.5) * h * 0.55;
}

FsCell fsLayout(vec2 p) {
	float h = uFsLayout.x;
	float k = floor(p.y / h);
	if (p.y < fsCourseLine(k, h)) k -= 1.0;
	else if (p.y >= fsCourseLine(k + 1.0, h)) k += 1.0;
	float b0 = fsCourseLine(k, h);
	float b1 = fsCourseLine(k + 1.0, h);

	// Each course has its own nominal block length and offset; individual head joints jitter.
	float lengthK = uFsLayout.y * mix(0.7, 1.4, fsHash12(vec2(k, 3.7) + uFsSeed));
	float x = p.x + fsHash12(vec2(k, 1.3) + uFsSeed) * lengthK * 4.0;
	float j = floor(x / lengthK);
	float jitter = uFsLayout.z;
	float a0 = (j + (fsHash12(vec2(j, k) + uFsSeed) - 0.5) * jitter) * lengthK;
	if (x < a0) {
		j -= 1.0;
	} else {
		float next = (j + 1.0 + (fsHash12(vec2(j + 1.0, k) + uFsSeed) - 0.5) * jitter) * lengthK;
		if (x >= next) j += 1.0;
	}
	a0 = (j + (fsHash12(vec2(j, k) + uFsSeed) - 0.5) * jitter) * lengthK;
	float a1 = (j + 1.0 + (fsHash12(vec2(j + 1.0, k) + uFsSeed) - 0.5) * jitter) * lengthK;

	FsCell cell;
	// Nearest side decides both the distance and its gradient direction.
	cell.edge = x - a0;
	cell.dir = vec2(1.0, 0.0);
	if (a1 - x < cell.edge) { cell.edge = a1 - x; cell.dir = vec2(-1.0, 0.0); }
	if (p.y - b0 < cell.edge) { cell.edge = p.y - b0; cell.dir = vec2(0.0, 1.0); }
	if (b1 - p.y < cell.edge) { cell.edge = b1 - p.y; cell.dir = vec2(0.0, -1.0); }
	cell.id = vec2(j, k);
	cell.local = vec2((x - a0) / (a1 - a0), (p.y - b0) / (b1 - b0)) - 0.5;
	cell.extent = vec2(a1 - a0, b1 - b0);
	return cell;
}
#else
// Voronoi stones with an exact border distance (two-pass) on a fixed lattice. Two warp scales bend
// rows and stone outlines (never a grid), and stones are split by an extra joint with a probability
// that drifts across the surface — so some regions are many small stones, others large ones.
FsCell fsLayout(vec2 p) {
	float size = uFsLayout.x;
	vec2 warp = (vec2(fsFbm(p * 0.45), fsFbm(p * 0.45 + 5.2)) - 0.5) * 1.1
		+ (vec2(fsNoise(p * 2.6 + 1.3), fsNoise(p * 2.6 + 8.4)) - 0.5) * 0.22;
	vec2 q = p / size + warp * uFsWarp;
	q.y /= uFsLayout.w;
	vec2 n = floor(q);
	vec2 f = fract(q);

	vec2 mg;
	vec2 mr;
	float md = 8.0;
	float md2 = 8.0;
	for (int j = -1; j <= 1; j++)
		for (int i = -1; i <= 1; i++) {
			vec2 g = vec2(float(i), float(j));
			vec2 o = 0.5 + (fsHash22(n + g + uFsSeed) - 0.5) * uFsLayout.z;
			vec2 r = g + o - f;
			r.y *= uFsLayout.w;
			float d = dot(r, r);
			if (d < md) { md2 = md; md = d; mr = r; mg = g; }
			else if (d < md2) { md2 = d; }
		}

	float border = 8.0;
	// Gradient of the border distance: away from the nearest separating edge (toward our feature).
	vec2 borderDir = normalize(mr + vec2(1e-6));
	#if FS_QUALITY > 0
	for (int j = -2; j <= 2; j++)
		for (int i = -2; i <= 2; i++) {
			vec2 g = mg + vec2(float(i), float(j));
			vec2 o = 0.5 + (fsHash22(n + g + uFsSeed) - 0.5) * uFsLayout.z;
			vec2 r = g + o - f;
			r.y *= uFsLayout.w;
			vec2 delta = r - mr;
			if (dot(delta, delta) > 0.00001) {
				float distance = dot(0.5 * (mr + r), normalize(delta));
				if (distance < border) { border = distance; borderDir = -normalize(delta); }
			}
		}
	#else
	border = 0.5 * (sqrt(md2) - sqrt(md)); // F2 - F1 approximation for the low tier
	#endif

	FsCell cell;
	// Rounded stones: the outline is the Voronoi border, pulled in toward a per-stone radius so
	// corners round off and leave sand-filled gaps, as real cobbles do.
	// Only the corners are rounded (radius well beyond the mid-edge distance), so neighbours still
	// sit snugly along their sides and the three-way gaps stay small.
	float radius = mix(0.68, 0.84, fsHash12(n + mg + 2.3 + uFsSeed));
	float rounded = radius - length(mr);
	float minEdge = min(border, rounded);
	vec2 minDir = rounded < border ? normalize(mr + vec2(1e-6)) : borderDir;
	cell.edge = mix(border, minEdge, uFsRoundness) * size;
	cell.dir = normalize(mix(borderDir, minDir, uFsRoundness) + vec2(1e-6));
	cell.id = n + mg;
	cell.local = -mr;
	cell.extent = vec2(size);

	// Hierarchical size variation: split some stones in two along a random line through the centre.
	float splitChance =
		mix(0.04, 0.55, smoothstep(0.3, 0.7, fsFbm(p * 0.09 + 3.1))) * (1.0 - 0.75 * uFsRoundness);
	vec2 splitHash = fsHash22(cell.id * 1.91 + 4.7 + uFsSeed);
	if (splitHash.x < splitChance) {
		float angle = splitHash.y * 6.2831853;
		vec2 dir = vec2(cos(angle), sin(angle));
		float side = dot(cell.local, dir);
		if (abs(side) * size < cell.edge) {
			cell.edge = abs(side) * size;
			cell.dir = side > 0.0 ? dir : -dir;
		}
		cell.id += side > 0.0 ? vec2(0.37, 0.61) : vec2(0.0);
	}
	return cell;
}
#endif

struct FsSurface {
	vec3 color;
	float roughness;
	float ao;
	vec2 dHdxy;
};

FsSurface fsEvaluate(vec2 uvMetres) {
	vec2 p = uvMetres;
	float px = max(length(fwidth(p)), 1e-5);
	// Slight warp of joints for hand-laid irregularity (a few cm at most).
	vec2 jointWarp = (vec2(fsNoise(p * 2.3), fsNoise(p * 2.3 + 9.1)) - 0.5) * 0.03 * uFsIrregularity;
	#ifdef FS_COURSED
	FsCell cell = fsLayout(p + jointWarp);
	#else
	FsCell cell = fsLayout(p);
	#endif

	float r1 = fsHash12(cell.id * 1.37 + uFsSeed);
	float r2 = fsHash12(cell.id.yx * 0.91 + 11.7 + uFsSeed);
	float r3 = fsHash12(cell.id + vec2(5.3, 2.9) + uFsSeed);

	float jointHalf = uFsProfile.x * mix(0.7, 1.35, fsNoise(p * 0.4 + 2.0));
	float chip = (fsNoise(p * 38.0) - 0.5) * 0.010 * (0.4 + uFsIrregularity);
	float edge = cell.edge + chip;
	float soft = max(0.0012, px * 0.75);
	float stoneMask = smoothstep(jointHalf - soft, jointHalf + soft, edge);
	float bevelWidth = uFsProfile.y * mix(0.6, 1.5, r3);
	float bevel = smoothstep(jointHalf, jointHalf + bevelWidth, edge);

	// Macro regions (several metres) shift tone, so no stretch of wall or paving matches another.
	float macro = fsFbm(p * 0.16);
	float macroFine = fsFbm(p * 0.6 + 4.7);
	float variation = uFsAmount.x;
	float tone = (r1 - 0.5) * 1.6 * variation + (macro - 0.5) * 1.2 + (macroFine - 0.5) * 0.35;
	vec3 stone = tone > 0.0 ? mix(uFsStone, uFsStoneLight, min(1.0, tone * 0.8)) : mix(uFsStone, uFsStoneDark, min(1.0, -tone * 0.9));
	// Occasional distinctly different stones.
	stone = mix(stone, uFsDirt, step(0.93, r2) * 0.28);
	stone = mix(stone, uFsStoneLight, step(r2, 0.05) * 0.35);
	// Worn, lighter arrises; polished tops on paving.
	stone = mix(stone, uFsStoneLight, (1.0 - bevel) * stoneMask * 0.25 * (0.4 + uFsAmount.y));
	stone = mix(stone, uFsStoneLight, uFsWorn * bevel * 0.07 * (1.0 - r3));

	// World-aligned dirt and damp: broad patches, heavier toward joints.
	float dirtField = fsFbm(p * 0.23 + 8.3);
	float dirtMask = smoothstep(0.42, 0.78, dirtField) * uFsAmount.z;
	stone = mix(stone, uFsDirt, dirtMask * (0.22 + (1.0 - bevel) * 0.25));
	float mossMask = smoothstep(0.5, 0.78, fsFbm(p * 0.31 + 2.4)) * uFsAmount.w;
	stone = mix(stone, uFsMoss, mossMask * (1.0 - bevel) * stoneMask * 0.45);

	vec3 joint = mix(uFsJoint, uFsDirt, 0.12 + dirtMask * 0.4);
	// Recessed joints sit in shadow and hold grit: darker and noisier than the stone faces.
	joint *= 0.62 + 0.3 * fsNoise(p * 70.0);
	joint = mix(joint, uFsMoss, mossMask * 0.8);

	vec3 color = mix(joint, stone, stoneMask);

	// Far away, joints are sub-pixel: fade toward their average instead of shimmering.
	float far = smoothstep(jointHalf * 1.5, jointHalf * 6.0, px);
	color = mix(color, mix(stone, joint, 0.2), far * 0.4);

	// Relief as an ANALYTIC slope (metres of height per metre of surface), projected to screen
	// space below. Differentiating a per-pixel height with dFdx would only resolve 2×2-pixel blocks;
	// the layout knows exactly how far and in which direction the nearest joint is, so the chamfer,
	// the rounded bevel, each stone's tilt and its rough face stay crisp at any distance.
	float proud = uFsProfile.w;
	float chamfer = max(0.002, soft);
	float t1 = clamp((edge - jointHalf) / chamfer, 0.0, 1.0);
	float s1 = t1 * t1 * (3.0 - 2.0 * t1);
	float chamferSlope = proud * 6.0 * t1 * (1.0 - t1) / chamfer * min(1.0, chamfer * 1.5 / px);
	float t2 = clamp((edge - jointHalf) / bevelWidth, 0.0, 1.0);
	float dome = uFsProfile.z * mix(0.6, 1.3, r2);
	float bevelSlope = dome * 2.0 * (1.0 - t2) / bevelWidth * min(1.0, bevelWidth / (px * 2.0));
	vec2 slope = (chamferSlope + bevelSlope) * cell.dir;
	slope += vec2(r1 - 0.5, r2 - 0.5) * proud * 1.2 / max(cell.extent, vec2(0.05)) * s1;
	// Rough face: two scales of relief per stone, each faded once it falls below a couple of pixels.
	float faceAmp = proud * 0.3 * (0.5 + uFsIrregularity);
	float coarse = 1.0 - smoothstep(0.25, 0.6, px * 9.0);
	float fine = 1.0 - smoothstep(0.25, 0.6, px * 32.0);
	slope += fsNoiseGrad(p * 9.0 + cell.id * 3.1) * 9.0 * faceAmp * coarse * s1;
	slope += fsNoiseGrad(p * 32.0 + cell.id * 1.7) * 32.0 * faceAmp * 0.3 * fine * s1;

	FsSurface surface;
	surface.color = color * uFsTint;
	float stoneRoughness = uFsRoughness + (r1 - 0.5) * 0.1 - uFsWorn * bevel * 0.05 + dirtMask * 0.04;
	surface.roughness = mix(uFsJointRoughness, stoneRoughness, stoneMask) / uFsRoughness;
	surface.ao = mix(0.55, 1.0, stoneMask * 0.7 + bevel * 0.3);
	surface.dHdxy = vec2(dot(slope, dFdx(p)), dot(slope, dFdy(p)));
	return surface;
}
`;

const COVER = /* glsl */ `
uniform vec3 uFsLush;
uniform vec3 uFsDry;
uniform vec3 uFsSoil;
uniform vec4 uFsAmount;

struct FsSurface {
	vec3 color;
	float roughness;
	float ao;
	vec2 dHdxy;
};

// Ground cover: three scales over a no-tile detail texture. Broad (tens of metres) lush/dry swathes,
// mid-scale (a few metres) clumps of denser/darker growth, and small patches of bare soil — all
// domain-warped so patch edges are organic rather than blobby.
FsSurface fsEvaluate(vec2 uvMetres) {
	vec2 p = uvMetres;
	#if FS_QUALITY > 0
	vec2 warp = vec2(fsFbm(p * 0.015), fsFbm(p * 0.015 + 7.7)) - 0.5;
	vec2 q = p + warp * 24.0;
	#else
	vec2 q = p + (vec2(fsNoise(p * 0.02), fsNoise(p * 0.02 + 7.7)) - 0.5) * 18.0;
	#endif
	float broad = fsFbm(q * 0.028);
	float mid = fsFbm(q * 0.21 + 3.3);
	float fine = fsNoise(p * 1.9);
	float dry = smoothstep(0.52, 0.78, broad) * (0.55 + uFsAmount.y);
	float lush = smoothstep(0.48, 0.24, broad);
	float soil = smoothstep(0.7, 0.86, mid * 0.75 + fine * 0.25) * smoothstep(0.35, 0.65, broad) * uFsAmount.z * 1.6;

	vec3 tint = vec3(1.0);
	tint = mix(tint, uFsLush, lush * 0.85);
	tint = mix(tint, uFsDry, min(1.0, dry) * 0.7);
	tint *= mix(0.8, 1.14, mid);
	tint = mix(tint, uFsSoil, min(1.0, soil));

	FsSurface surface;
	surface.color = tint;
	surface.roughness = 1.0 + soil * 0.03;
	surface.ao = 1.0;
	surface.dHdxy = vec2(0.0);
	return surface;
}
`;

function replaceChunk(source: string, chunk: string, transform: (code: string) => string): string {
	const include = `#include <${chunk}>`;
	if (!source.includes(include)) return source;
	const code = (THREE.ShaderChunk as Record<string, string>)[chunk] ?? '';
	return source.replace(include, transform(code));
}

function withNoTile(source: string): string {
	let out = source;
	out = replaceChunk(out, 'map_fragment', (c) =>
		c.replace('texture2D( map, vMapUv )', 'fsNoTile( map, vMapUv )')
	);
	out = replaceChunk(out, 'normal_fragment_maps', (c) =>
		c.replaceAll('texture2D( normalMap, vNormalMapUv )', 'fsNoTile( normalMap, vNormalMapUv )')
	);
	out = replaceChunk(out, 'roughnessmap_fragment', (c) =>
		c.replace(
			'texture2D( roughnessMap, vRoughnessMapUv )',
			'fsNoTile( roughnessMap, vRoughnessMapUv )'
		)
	);
	out = replaceChunk(out, 'aomap_fragment', (c) =>
		c.replace('texture2D( aoMap, vAoMapUv )', 'fsNoTile( aoMap, vAoMapUv )')
	);
	return out;
}

/**
 * Installs (or, with `kind = null`, removes) the world-scale surface shading on `material`.
 * Uniform objects are shared with the caller so values update live without recompiling.
 */
export function applySurfaceShader(
	material: THREE.Material,
	kind: SurfaceShaderKind | null,
	uniforms: SurfaceShaderUniforms,
	quality: SurfaceShaderQuality
): void {
	if (!kind) {
		setOwnShaderHook(material, null);
		return;
	}
	const structured = kind === 'coursed' || kind === 'cellular';
	const hook: THREE.Material['onBeforeCompile'] = (shader) => {
		Object.assign(shader.uniforms, uniforms);
		const defines = [
			`#define FS_QUALITY ${quality}`,
			`#define FS_OCTAVES ${quality === 0 ? 2 : quality === 1 ? 3 : 4}`,
			kind === 'coursed' ? '#define FS_COURSED' : ''
		].join('\n');

		shader.vertexShader = shader.vertexShader
			.replace(
				'#include <common>',
				`#include <common>\nvarying vec2 vFsUv;\nuniform float uFsUvToMetres;`
			)
			.replace('#include <uv_vertex>', `#include <uv_vertex>\nvFsUv = uv * uFsUvToMetres;`);

		let fragment = shader.fragmentShader.replace(
			'#include <common>',
			`#include <common>\n${defines}\n${COMMON}\n${structured ? STONE : kind === 'cover' ? COVER : ''}`
		);
		fragment = withNoTile(fragment);
		if (kind !== 'noTile') {
			fragment = fragment
				.replace(
					'#include <color_fragment>',
					'#include <color_fragment>\nFsSurface fsSurface = fsEvaluate(vFsUv);\ndiffuseColor.rgb *= fsSurface.color;'
				)
				.replace(
					'#include <roughnessmap_fragment>',
					'#include <roughnessmap_fragment>\nroughnessFactor *= fsSurface.roughness;'
				)
				.replace(
					'#include <normal_fragment_maps>',
					'#include <normal_fragment_maps>\nnormal = fsPerturbNormal(-vViewPosition, normal, fsSurface.dHdxy, faceDirection);'
				)
				.replace(
					'#include <aomap_fragment>',
					'#include <aomap_fragment>\nreflectedLight.indirectDiffuse *= fsSurface.ao;\nreflectedLight.indirectSpecular *= fsSurface.ao;'
				);
		}
		shader.fragmentShader = fragment;
	};
	setOwnShaderHook(material, hook, `fs:${kind}:${quality}`);
}
