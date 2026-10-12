import { MeshStandardMaterial, type WebGLProgramParametersWithUniforms } from 'three';
import { setOwnShaderHook } from '../materials/shader/shaderHooks';

/**
 * Every creature shares ONE MeshStandardMaterial. Colour comes from vertex colours; a per-vertex
 * `surface` attribute (roughness, emissive amount) lets glossy eyes, soft matte bodies and the
 * eye highlight live in the same draw call. The extension goes through shaderHooks so it composes
 * with the graphics pipeline's CSM hook instead of replacing it.
 */
function creatureSurfaceHook(shader: WebGLProgramParametersWithUniforms) {
	shader.vertexShader = shader.vertexShader
		.replace(
			'#include <common>',
			'#include <common>\nattribute vec2 surface;\nvarying vec2 vCreatureSurface;'
		)
		.replace('#include <begin_vertex>', '#include <begin_vertex>\nvCreatureSurface = surface;');
	shader.fragmentShader = shader.fragmentShader
		.replace('#include <common>', '#include <common>\nvarying vec2 vCreatureSurface;')
		.replace(
			'#include <roughnessmap_fragment>',
			'#include <roughnessmap_fragment>\nroughnessFactor = clamp(vCreatureSurface.x, 0.04, 1.0);'
		)
		.replace(
			'#include <emissivemap_fragment>',
			'#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * vCreatureSurface.y;'
		);
}

export function createCreatureMaterial(): MeshStandardMaterial {
	const material = new MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 });
	material.name = 'CreatureSurface';
	setOwnShaderHook(material, creatureSurfaceHook, 'creature-surface-v1');
	return material;
}

let shared: { material: MeshStandardMaterial; users: number } | undefined;
/** Reference-counted world material; released with `releaseCreatureMaterial`. */
export function acquireCreatureMaterial(): MeshStandardMaterial {
	if (!shared) shared = { material: createCreatureMaterial(), users: 0 };
	shared.users++;
	return shared.material;
}
export function releaseCreatureMaterial(material: MeshStandardMaterial) {
	if (!shared || shared.material !== material) return;
	if (--shared.users === 0) {
		shared.material.dispose();
		shared = undefined;
	}
}
