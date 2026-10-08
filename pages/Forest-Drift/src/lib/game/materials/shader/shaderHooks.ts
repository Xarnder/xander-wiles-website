import type * as THREE from 'three';

type BeforeCompile = THREE.Material['onBeforeCompile'];
type Uniforms = Record<string, THREE.IUniform>;

const BASE_HOOK = 'fsBaseBeforeCompile';
const OWN_HOOK = 'fsOwnBeforeCompile';
const OWN_KEY = 'fsOwnProgramKey';

/**
 * `onBeforeCompile` has exactly one slot per material, and three's CSM owns it: `setupMaterial`
 * overwrites it and `dispose` deletes it. Procedural surface shading needs it too. Rather than
 * patching CSM, both parties register here and the material gets ONE composed hook:
 *
 * - the "base" hook is whatever the graphics pipeline installed (CSM's), recorded by
 *   `GraphicsPipeline` right after `csm.setupMaterial` and cleared after `csm.dispose`;
 * - the "own" hook is the material's procedural shader extension (`surfaceShader.ts`).
 *
 * `customProgramCacheKey` is set explicitly because three's default key is the hook's source text,
 * which is identical for every composed hook and would make different extensions share a program.
 *
 * Uniforms: three keeps ONE uniforms object per material — the one built by the most recent
 * compile — and does not call `onBeforeCompile` again when it switches back to a program it
 * already compiled for that material (procedural materials toggled off and on, a style switched and
 * back). The extension's uniforms would then be missing and read as zero (black wood, flat stone).
 * So an extension registers its uniforms here, and they are written into every uniforms object
 * three has built for the material, whichever program ends up reused.
 */
const compiledUniforms = new WeakMap<THREE.Material, Uniforms[]>();
/** Uniform objects kept per material — one per distinct program it has compiled; bounded. */
const MAX_COMPILED_UNIFORM_SETS = 16;

function rebuild(material: THREE.Material): void {
	const base = material.userData[BASE_HOOK] as BeforeCompile | undefined;
	const own = material.userData[OWN_HOOK] as BeforeCompile | undefined;
	const ownKey = (material.userData[OWN_KEY] as string | undefined) ?? '';
	if (!base && !own) {
		delete (material as Partial<THREE.Material>).onBeforeCompile;
		delete (material as Partial<THREE.Material>).customProgramCacheKey;
	} else {
		material.onBeforeCompile = (shader, renderer) => {
			base?.call(material, shader, renderer);
			own?.call(material, shader, renderer);
			let sets = compiledUniforms.get(material);
			if (!sets) compiledUniforms.set(material, (sets = []));
			if (!sets.includes(shader.uniforms)) sets.push(shader.uniforms);
			if (sets.length > MAX_COMPILED_UNIFORM_SETS) sets.shift();
		};
		material.customProgramCacheKey = () => `${base ? 'base' : ''}|${ownKey}`;
	}
	material.needsUpdate = true;
}

/**
 * Sets (or with `null`, removes) a material's own shader extension. Pass the uniform objects the
 * hook adds as `uniforms` — see the note on `compiledUniforms` for why.
 */
export function setOwnShaderHook<U extends { [K in keyof U]: THREE.IUniform }>(
	material: THREE.Material,
	hook: BeforeCompile | null,
	programKey = '',
	uniforms?: U
): void {
	if (hook && uniforms) {
		for (const set of compiledUniforms.get(material) ?? []) Object.assign(set, uniforms);
	}
	const current = material.userData[OWN_KEY] as string | undefined;
	if (!hook && !material.userData[OWN_HOOK]) return;
	if (hook && current === programKey && material.userData[OWN_HOOK] === hook) return;
	if (hook) {
		material.userData[OWN_HOOK] = hook;
		material.userData[OWN_KEY] = programKey;
	} else {
		delete material.userData[OWN_HOOK];
		delete material.userData[OWN_KEY];
	}
	rebuild(material);
}

/**
 * Records the pipeline's hook (CSM). Call with `material.onBeforeCompile` right after
 * `csm.setupMaterial(material)`, and with `null` after the CSM that installed it is disposed.
 */
export function setBaseShaderHook(material: THREE.Material, hook: BeforeCompile | null): void {
	if (hook) material.userData[BASE_HOOK] = hook;
	else delete material.userData[BASE_HOOK];
	rebuild(material);
}

export function hasOwnShaderHook(material: THREE.Material): boolean {
	return typeof material.userData[OWN_HOOK] === 'function';
}
