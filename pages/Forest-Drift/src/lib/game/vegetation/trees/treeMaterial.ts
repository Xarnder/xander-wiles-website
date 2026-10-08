import * as THREE from 'three';
import { setOwnShaderHook } from '../../materials/shader/shaderHooks';

/** Shared tree uniforms — one object for every tree; updating them is the entire per-frame cost. */
export interface TreeWindUniforms {
	uTreeTime: { value: number };
	uTreeWindStrength: { value: number };
	/** Procedural surface detail fades out between these view distances (metres). */
	uTreeDetailRange: { value: THREE.Vector2 };
}

/**
 * Procedural bark and foliage detail level:
 * - 0: off — baked vertex colours only (procedural materials switched off);
 * - 1: cheap — one noise per pixel: bark furrows and leaf mottling, near trees only;
 * - 2: full — bark plates/furrows/fibres with lichen, individual leaves/needle tufts with their
 *   own tone and a lighting tilt per leaf;
 * - 3: as 2, drawn further out (Ultra).
 */
export type TreeSurfaceDetail = 0 | 1 | 2 | 3;

/** Fade-out range (metres) per detail level — the pattern is sub-pixel beyond it. */
export const TREE_DETAIL_RANGES: Readonly<Record<TreeSurfaceDetail, readonly [number, number]>> = {
	0: [0, 0],
	1: [8, 22],
	2: [16, 38],
	3: [26, 60]
};

/**
 * Vertex-shader wind: a slow sway of the whole crown plus a small, faster flutter along the
 * surface normal, both weighted by the per-vertex `treeWind` attribute (0 at the trunk base → 1 at
 * the canopy edge) and phase-shifted by each instance's world position, so neighbouring trees never
 * move in lockstep. No CPU work per tree, no extra per-instance data: the phase comes from the
 * instance matrix's translation. Applied in local space before the instance transform.
 *
 * The surface pattern is evaluated on the UNDISPLACED position (so it never swims in the wind),
 * offset per instance so trees sharing a prototype still get different bark and leaves.
 */
const WIND_VERTEX = /* glsl */ `
#ifdef USE_INSTANCING
	vec2 treeOrigin = vec2(instanceMatrix[3][0], instanceMatrix[3][2]);
#else
	vec2 treeOrigin = vec2(0.0);
#endif
	float treePhase = dot(treeOrigin, vec2(0.137, 0.171));
#if TREE_DETAIL > 0
	vTreeSurface = treeSurface;
	vTreeLocal = position + fract(vec3(treeOrigin.x * 0.0731 + treeOrigin.y * 0.0217, treeOrigin.y * 0.0613, treeOrigin.x * 0.0411)) * vec3(37.0, 23.0, 31.0);
#endif
	float treeWeight = treeWind * treeWind * uTreeWindStrength;
	float treeSway = sin(uTreeTime * 1.15 + treePhase) * 0.65 + sin(uTreeTime * 2.3 + treePhase * 1.7) * 0.25;
	transformed.x += treeSway * treeWeight * 0.16;
	transformed.z += cos(uTreeTime * 0.9 + treePhase * 1.3) * treeWeight * 0.09;
	transformed += objectNormal * sin(uTreeTime * 3.8 + position.y * 1.9 + treePhase) * treeWeight * 0.025;
`;

/**
 * Bark and leaves, per pixel, in tree-local metres. Bark is stretched along each trunk/branch axis
 * (the `treeSurface` grain direction), so furrows, plates and fibres run up the trunk and out along
 * branches. Leaves are 3D cells (a 2×2×2 Voronoi — no texture, no seams, no UVs) with their own
 * tone, hue, a dark gap between them and a per-leaf normal tilt that catches the sun differently;
 * needles and scale sprays stretch the cells along the spray direction and add fine streaks.
 *
 * Every pattern averages ~1, so the tuned vertex colours (and the far LODs, which skip all of this)
 * keep the same overall colour. Beyond `uTreeDetailRange.y` nothing is computed.
 */
const SURFACE_FRAGMENT_PARS = /* glsl */ `
uniform vec2 uTreeDetailRange;
varying vec4 vTreeSurface;
varying vec3 vTreeLocal;

float treeHash1(vec3 p) {
	p = fract(p * 0.1031);
	p += dot(p, p.zyx + 31.32);
	return fract((p.x + p.y) * p.z);
}

vec3 treeHash3(vec3 p) {
	p = fract(p * vec3(0.1031, 0.1030, 0.0973));
	p += dot(p, p.yxz + 33.33);
	return fract((p.xxy + p.yzz) * p.zyx);
}

float treeNoise(vec3 p) {
	vec3 i = floor(p);
	vec3 f = fract(p);
	vec3 u = f * f * (3.0 - 2.0 * f);
	float a = mix(treeHash1(i), treeHash1(i + vec3(1.0, 0.0, 0.0)), u.x);
	float b = mix(treeHash1(i + vec3(0.0, 1.0, 0.0)), treeHash1(i + vec3(1.0, 1.0, 0.0)), u.x);
	float c = mix(treeHash1(i + vec3(0.0, 0.0, 1.0)), treeHash1(i + vec3(1.0, 0.0, 1.0)), u.x);
	float d = mix(treeHash1(i + vec3(0.0, 1.0, 1.0)), treeHash1(i + vec3(1.0, 1.0, 1.0)), u.x);
	return mix(mix(a, b, u.y), mix(c, d, u.y), u.z);
}

// 2×2×2 Voronoi: the eight cells whose (jittered) points can be nearest. Returns F1, F2; cellId.
vec2 treeCells(vec3 x, out vec3 cellId) {
	vec3 base = floor(x - 0.5);
	float f1 = 8.0;
	float f2 = 8.0;
	cellId = base;
	for (int k = 0; k < 2; k++)
		for (int j = 0; j < 2; j++)
			for (int i = 0; i < 2; i++) {
				vec3 cell = base + vec3(float(i), float(j), float(k));
				vec3 d = cell + 0.5 + (treeHash3(cell) - 0.5) * 0.85 - x;
				float dist = dot(d, d);
				if (dist < f1) {
					f2 = f1;
					f1 = dist;
					cellId = cell;
				} else if (dist < f2) {
					f2 = dist;
				}
			}
	return sqrt(vec2(f1, f2));
}

// Nearest jittered point of the 2×2×2 neighbourhood, and the vector from it to x.
void treeCellsNearest(vec3 x, out vec3 cellId, out vec3 toPoint) {
	vec3 base = floor(x - 0.5);
	float best = 8.0;
	cellId = base;
	toPoint = vec3(1.0);
	for (int k = 0; k < 2; k++)
		for (int j = 0; j < 2; j++)
			for (int i = 0; i < 2; i++) {
				vec3 cell = base + vec3(float(i), float(j), float(k));
				vec3 d = x - (cell + 0.5 + (treeHash3(cell) - 0.5) * 0.85);
				float dist = dot(d, d);
				if (dist < best) {
					best = dist;
					cellId = cell;
					toPoint = d;
				}
			}
}

// Bark colour multiplier. axis = trunk/branch direction.
vec3 treeBark(int kind, vec3 p, vec3 axis) {
	float along = dot(p, axis);
	vec3 across = p - axis * along;
	vec3 m = vec3(1.0);
#if TREE_DETAIL == 1
	float n = treeNoise(across * 7.0 + axis * along * 0.9);
	m = vec3(mix(0.62, 1.12, smoothstep(0.2, 0.7, n)));
#else
	if (kind == 0) {
		// Furrowed (oak): furrows follow the noise's mid-value contours — long, branching, vertical
		// cracks — with corky ridges between them.
		vec3 q = across * 20.0 + axis * along * 0.7;
		float n = treeNoise(q) * 0.7 + treeNoise(q * 2.3 + 7.1) * 0.3;
		float furrow = 1.0 - smoothstep(0.02, 0.2, abs(n * 2.0 - 1.0));
		m = vec3(mix(1.12, 0.36, furrow) * (0.88 + 0.24 * treeNoise(p * 27.0)));
	} else if (kind == 1) {
		// Plated (pine): long vertical plates split by irregular dark cracks, warmer plate faces.
		vec3 cellId;
		vec3 q = across * 8.0 + axis * along * 2.2;
		vec2 f = treeCells(q, cellId);
		float width = 0.015 + 0.06 * treeNoise(q * 2.1);
		float crack = smoothstep(width, width + 0.06, f.y - f.x);
		float plate = (0.84 + 0.34 * treeHash1(cellId)) * (0.9 + 0.2 * treeNoise(across * 40.0 + axis * along * 4.0));
		m = mix(vec3(0.34, 0.32, 0.31), vec3(1.12, 0.96, 0.86) * plate, crack);
	} else if (kind == 2) {
		// Fibrous (cypress): long stringy strands.
		vec3 q = across * 14.0 + axis * along * 0.35;
		m = vec3(0.72 + 0.36 * treeNoise(q) + 0.16 * (treeNoise(q * 2.7 + 3.3) - 0.5));
	} else {
		// Smooth (ornamental): soft mottling with horizontal lenticel dashes.
		float lenticel = smoothstep(0.74, 0.82, treeNoise(across * 2.2 + axis * along * 26.0));
		m = vec3((0.92 + 0.18 * treeNoise(p * 3.1)) * (1.0 - 0.45 * lenticel));
	}
	// Lichen and moss patches, more of them low on the trunk.
	float lichen = smoothstep(0.66, 0.8, treeNoise(p * 1.9 + 5.0) + (1.0 - smoothstep(0.0, 3.0, p.y)) * 0.12);
	m = mix(m, m * vec3(1.02, 1.22, 0.92) * 1.15, lichen * 0.5);
#endif
	return m;
}

// Foliage colour multiplier and a world-space normal tilt. grain = needle/spray direction.
vec3 treeLeaves(int kind, vec3 p, vec3 grain, out vec3 tilt) {
	tilt = vec3(0.0);
#if TREE_DETAIL == 1
	float size = kind == 5 ? 0.075 : kind >= 6 ? 0.09 : 0.11;
	return vec3(0.8 + 0.42 * treeNoise(p / size));
#else
	vec3 x;
	float streaks = 1.0;
	if (kind >= 6) {
		// Needles / scales: tufts stretched along the spray direction, with fine needle streaks.
		vec3 g = normalize(grain + vec3(0.0, 1e-4, 0.0));
		float along = dot(p, g);
		vec3 across = p - g * along;
		float width = kind == 6 ? 0.1 : 0.07;
		float tuft = kind == 6 ? 0.34 : 0.13;
		x = across / width + g * (along / tuft);
		streaks = 0.82 + 0.36 * treeNoise(across * (kind == 6 ? 70.0 : 45.0) + g * along * 3.0);
	} else {
		x = p / (kind == 5 ? 0.075 : 0.11);
	}
	if (kind >= 6) {
		vec3 cellId;
		vec2 f = treeCells(x, cellId);
		vec3 h = treeHash3(cellId + 17.0);
		vec3 hue = vec3(1.0 + (h.y - 0.5) * 0.18, 1.0, 1.0 - (h.y - 0.5) * 0.24);
		tilt = (treeHash3(cellId + 3.7) - 0.5) * 0.9;
		// Tufts: dark gaps where tufts meet, lighter tips toward each tuft's centre.
		float gap = smoothstep(0.0, 0.22, f.y - f.x);
		float tuftTone = (0.8 + 0.4 * h.x) * (1.06 - 0.22 * f.x) * mix(0.52, 1.0, gap) * streaks;
		return hue * tuftTone * 1.16;
	}
	// Leaves: two overlapping layers of oval leaves, each cell's leaf with its own size, angle and
	// tone; the front layer wins where they overlap, darker inner foliage shows through the gaps.
	vec3 leafColor = vec3(0.6 + 0.14 * treeNoise(p * 11.0));
	float covered = 0.0;
	for (int layer = 0; layer < 2; layer++) {
		vec3 lx = layer == 0 ? x : x * 1.07 + vec3(0.5, 0.31, 0.77);
		vec3 lid;
		vec3 toLeaf;
		treeCellsNearest(lx, lid, toLeaf);
		vec3 lh = treeHash3(lid + 17.0);
		vec3 axisDir = normalize(treeHash3(lid + 9.1) - 0.5);
		// Oval: distance shrunk along the leaf's axis, so it is ~1.8× longer than wide.
		float d = length(toLeaf - axisDir * dot(toLeaf, axisDir) * 0.45);
		float radius = 0.42 + 0.2 * lh.z;
		float mask = (1.0 - smoothstep(radius - 0.08, radius, d)) * (1.0 - covered);
		float tone = (0.88 + 0.26 * lh.x) * (1.08 - 0.2 * d / radius) * (layer == 0 ? 1.0 : 0.86);
		vec3 leafHue = vec3(1.0 + (lh.y - 0.5) * 0.16, 1.0, 1.0 - (lh.y - 0.5) * 0.22);
		leafColor = mix(leafColor, leafHue * tone, mask);
		if (layer == 0) tilt = (treeHash3(lid + 3.7) - 0.5) * 0.9 * mask;
		covered += mask;
	}
	return leafColor * 1.08;
#endif
}
`;

const SURFACE_COLOR_FRAGMENT = /* glsl */ `
	vec3 treeTilt = vec3(0.0);
#if TREE_DETAIL > 0
	{
		float treeDistance = length(vViewPosition);
		float treeFade = 1.0 - smoothstep(uTreeDetailRange.x, uTreeDetailRange.y, treeDistance);
		if (treeFade > 0.0) {
			int treeKind = int(vTreeSurface.x + 0.5);
			vec3 treeMult;
			if (treeKind < 4) {
				treeMult = treeBark(treeKind, vTreeLocal, normalize(vTreeSurface.yzw + vec3(0.0, 1e-4, 0.0)));
			} else {
				treeMult = treeLeaves(treeKind, vTreeLocal, vTreeSurface.yzw, treeTilt);
				treeTilt *= treeFade;
			}
			diffuseColor.rgb *= mix(vec3(1.0), treeMult, treeFade);
		}
	}
#endif
`;

const SURFACE_NORMAL_FRAGMENT = /* glsl */ `
#if TREE_DETAIL > 1
	// Per-leaf tilt (world space → view space): each leaf catches the light a little differently.
	normal = normalize(normal + mat3(viewMatrix) * treeTilt);
#endif
`;

function installTreeShader(
	material: THREE.MeshLambertMaterial,
	uniforms: TreeWindUniforms,
	detail: TreeSurfaceDetail
): void {
	const level = detail === 3 ? 2 : detail;
	setOwnShaderHook(
		material,
		(shader) => {
			Object.assign(shader.uniforms, uniforms);
			const define = `#define TREE_DETAIL ${level}\n`;
			shader.vertexShader = shader.vertexShader
				.replace(
					'#include <common>',
					`#include <common>\n${define}attribute float treeWind;\nattribute vec4 treeSurface;\nuniform float uTreeTime;\nuniform float uTreeWindStrength;\nvarying vec4 vTreeSurface;\nvarying vec3 vTreeLocal;`
				)
				.replace('#include <begin_vertex>', `#include <begin_vertex>\n${WIND_VERTEX}`);
			shader.fragmentShader = shader.fragmentShader
				.replace('#include <common>', `#include <common>\n${define}${SURFACE_FRAGMENT_PARS}`)
				.replace(
					'#include <color_fragment>',
					`#include <color_fragment>\n${SURFACE_COLOR_FRAGMENT}`
				)
				.replace(
					'#include <normal_fragment_maps>',
					`#include <normal_fragment_maps>\n${SURFACE_NORMAL_FRAGMENT}`
				);
		},
		`stylised-tree:${level}`,
		uniforms
	);
}

/**
 * The ONE material every tree in the world uses: trunk and foliage are a single merged mesh per
 * prototype, coloured by baked vertex colours (bark gradient, canopy light-to-dark, occlusion) and
 * a per-instance tint (`InstancedMesh.instanceColor`), with procedural bark and leaves drawn on top
 * per pixel near the camera (`setTreeSurfaceDetail`). No textures at all.
 *
 * Lambert, not PBR: stylised foliage has no meaningful specular, and a PBR material's Fresnel
 * reflection of the bright sky made tier undersides and grazing canopy edges read as pale blue-grey
 * sheets. Lambert drops that term entirely and is cheaper per pixel; sun, hemisphere light,
 * cascaded shadows and fog all behave the same.
 */
export function createTreeMaterial(detail: TreeSurfaceDetail = 2): {
	material: THREE.MeshLambertMaterial;
	wind: TreeWindUniforms;
} {
	const material = new THREE.MeshLambertMaterial({ vertexColors: true });
	material.name = 'stylised-tree';
	const wind: TreeWindUniforms = {
		uTreeTime: { value: 0 },
		uTreeWindStrength: { value: 1 },
		uTreeDetailRange: { value: new THREE.Vector2() }
	};
	setTreeSurfaceDetail(material, wind, detail);
	return { material, wind };
}

/** Switches the procedural bark/leaf detail level (recompiles the one tree program). */
export function setTreeSurfaceDetail(
	material: THREE.MeshLambertMaterial,
	uniforms: TreeWindUniforms,
	detail: TreeSurfaceDetail
): void {
	const [near, far] = TREE_DETAIL_RANGES[detail];
	uniforms.uTreeDetailRange.value.set(near, far);
	installTreeShader(material, uniforms, detail);
}
