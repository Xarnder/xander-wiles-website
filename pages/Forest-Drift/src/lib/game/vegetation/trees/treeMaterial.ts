import * as THREE from 'three';
import { setOwnShaderHook } from '../../materials/shader/shaderHooks';

/** Shared wind uniforms — one object for every tree; updating them is the entire per-frame wind cost. */
export interface TreeWindUniforms {
	uTreeTime: { value: number };
	uTreeWindStrength: { value: number };
}

/**
 * Vertex-shader wind: a slow sway of the whole crown plus a small, faster flutter along the
 * surface normal, both weighted by the per-vertex `treeWind` attribute (0 at the trunk base → 1 at
 * the canopy edge) and phase-shifted by each instance's world position, so neighbouring trees never
 * move in lockstep. No CPU work per tree, no extra per-instance data: the phase comes from the
 * instance matrix's translation. Applied in local space before the instance transform.
 */
const WIND_VERTEX = /* glsl */ `
#ifdef USE_INSTANCING
	vec2 treeOrigin = vec2(instanceMatrix[3][0], instanceMatrix[3][2]);
#else
	vec2 treeOrigin = vec2(0.0);
#endif
	float treePhase = dot(treeOrigin, vec2(0.137, 0.171));
	float treeWeight = treeWind * treeWind * uTreeWindStrength;
	float treeSway = sin(uTreeTime * 1.15 + treePhase) * 0.65 + sin(uTreeTime * 2.3 + treePhase * 1.7) * 0.25;
	transformed.x += treeSway * treeWeight * 0.16;
	transformed.z += cos(uTreeTime * 0.9 + treePhase * 1.3) * treeWeight * 0.09;
	transformed += objectNormal * sin(uTreeTime * 3.8 + position.y * 1.9 + treePhase) * treeWeight * 0.025;
`;

/**
 * The ONE material every tree in the world uses: trunk and foliage are a single merged mesh per
 * prototype, coloured by baked vertex colours (bark gradient, canopy light-to-dark, occlusion) and
 * a per-instance tint (`InstancedMesh.instanceColor`). No textures at all.
 *
 * Lambert, not PBR: stylised foliage has no meaningful specular, and a PBR material's Fresnel
 * reflection of the bright sky made tier undersides and grazing canopy edges read as pale blue-grey
 * sheets. Lambert drops that term entirely and is cheaper per pixel; sun, hemisphere light,
 * cascaded shadows and fog all behave the same.
 */
export function createTreeMaterial(): {
	material: THREE.MeshLambertMaterial;
	wind: TreeWindUniforms;
} {
	const material = new THREE.MeshLambertMaterial({ vertexColors: true });
	material.name = 'stylised-tree';
	const wind: TreeWindUniforms = {
		uTreeTime: { value: 0 },
		uTreeWindStrength: { value: 1 }
	};
	setOwnShaderHook(
		material,
		(shader) => {
			Object.assign(shader.uniforms, wind);
			shader.vertexShader = shader.vertexShader
				.replace(
					'#include <common>',
					'#include <common>\nattribute float treeWind;\nuniform float uTreeTime;\nuniform float uTreeWindStrength;'
				)
				.replace('#include <begin_vertex>', `#include <begin_vertex>\n${WIND_VERTEX}`);
		},
		'stylised-tree-wind',
		wind
	);
	return { material, wind };
}
