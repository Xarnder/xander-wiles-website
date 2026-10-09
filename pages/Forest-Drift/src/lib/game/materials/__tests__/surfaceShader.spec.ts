import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { generateMaterialMaps } from '../generateMaterialMaps';
import { resolveMaterialRecipe } from '../materialPresets';
import { InlineMaterialMapSource } from '../MaterialMapSource';
import { ProceduralMaterialLibrary } from '../ProceduralMaterialLibrary';
import { hasOwnShaderHook, setBaseShaderHook, setOwnShaderHook } from '../shader/shaderHooks';
import { applySurfaceShader, createSurfaceShaderUniforms } from '../shader/surfaceShader';
import { surfaceShaderKindFor } from '../shader/surfaceShaderPresets';

type Shader = Parameters<THREE.Material['onBeforeCompile']>[0];

function fakeShader(): Shader {
	const lib = THREE.ShaderLib.standard;
	return {
		uniforms: THREE.UniformsUtils.clone(lib.uniforms),
		vertexShader: lib.vertexShader,
		fragmentShader: lib.fragmentShader
	} as unknown as Shader;
}

describe('shader hook composition', () => {
	it('runs both the pipeline (CSM) hook and the procedural hook, in that order', () => {
		const material = new THREE.MeshStandardMaterial();
		const calls: string[] = [];
		setOwnShaderHook(material, () => calls.push('own'), 'own-key');
		setBaseShaderHook(material, () => calls.push('base'));
		material.onBeforeCompile(fakeShader(), null as never);
		expect(calls).toEqual(['base', 'own']);
		expect(material.customProgramCacheKey()).toContain('own-key');
	});

	it('keeps the procedural hook when the pipeline hook is removed (CSM disposed)', () => {
		const material = new THREE.MeshStandardMaterial();
		const own = vi.fn();
		setOwnShaderHook(material, own, 'k');
		setBaseShaderHook(material, () => {});
		setBaseShaderHook(material, null);
		material.onBeforeCompile(fakeShader(), null as never);
		expect(own).toHaveBeenCalledOnce();
		setOwnShaderHook(material, null);
		expect(hasOwnShaderHook(material)).toBe(false);
	});

	it('paints a river-edge beach only on the terrain cover shader', () => {
		const plain = new THREE.MeshStandardMaterial();
		const shore = new THREE.MeshStandardMaterial();
		shore.userData.fsShore = true;
		const uniforms = createSurfaceShaderUniforms();
		applySurfaceShader(plain, 'cover', uniforms, 1);
		applySurfaceShader(shore, 'cover', createSurfaceShaderUniforms(), 1);
		expect(plain.customProgramCacheKey()).not.toBe(shore.customProgramCacheKey());
		const shader = fakeShader();
		shore.onBeforeCompile(shader, null as never);
		expect(shader.vertexShader).toContain('vFsShore = aShore');
		expect(shader.fragmentShader).toContain('vFsShore');
		const plainShader = fakeShader();
		plain.onBeforeCompile(plainShader, null as never);
		expect(plainShader.vertexShader).not.toContain('aShore');
	});

	it('gives different extensions different program keys', () => {
		const a = new THREE.MeshStandardMaterial();
		const b = new THREE.MeshStandardMaterial();
		applySurfaceShader(a, 'coursed', createSurfaceShaderUniforms(), 2);
		applySurfaceShader(b, 'cellular', createSurfaceShaderUniforms(), 2);
		expect(a.customProgramCacheKey()).not.toBe(b.customProgramCacheKey());
	});
});

describe('world-scale surface shader', () => {
	it.each(['coursed', 'cellular', 'cover', 'noTile'] as const)(
		'%s injects its code and stochastic sampling into the standard shader',
		(kind) => {
			const material = new THREE.MeshStandardMaterial();
			const uniforms = createSurfaceShaderUniforms();
			applySurfaceShader(material, kind, uniforms, 1);
			const shader = fakeShader();
			material.onBeforeCompile(shader, null as never);
			expect(shader.fragmentShader).toContain('fsNoTile( map, vMapUv )');
			expect(shader.fragmentShader).toContain('fsNoTile( normalMap, vNormalMapUv )');
			expect(shader.vertexShader).toContain('vFsUv = uv * uFsUvToMetres;');
			expect(shader.uniforms.uFsSeed).toBe(uniforms.uFsSeed);
			if (kind === 'noTile') expect(shader.fragmentShader).not.toContain('fsEvaluate(vFsUv)');
			else expect(shader.fragmentShader).toContain('fsEvaluate(vFsUv)');
			if (kind === 'coursed') expect(shader.fragmentShader).toContain('#define FS_COURSED');
		}
	);

	it('assigns world-scale treatment per material type', () => {
		expect(surfaceShaderKindFor(resolveMaterialRecipe('masonry'))).toBe('coursed');
		expect(surfaceShaderKindFor(resolveMaterialRecipe('masonry', { variant: 'fieldstone' }))).toBe(
			'cellular'
		);
		expect(surfaceShaderKindFor(resolveMaterialRecipe('paving'))).toBe('cellular');
		expect(surfaceShaderKindFor(resolveMaterialRecipe('paving', { variant: 'setts' }))).toBe(
			'coursed'
		);
		expect(surfaceShaderKindFor(resolveMaterialRecipe('grass'))).toBe('cover');
		expect(surfaceShaderKindFor(resolveMaterialRecipe('plaster'))).toBe('noTile');
		expect(surfaceShaderKindFor(resolveMaterialRecipe('slate'))).toBeNull();
		expect(surfaceShaderKindFor(resolveMaterialRecipe('timber'))).toBeNull();
	});

	it('generates structureless detail maps for shader-laid stone', () => {
		const structured = generateMaterialMaps(resolveMaterialRecipe('paving', { quality: 'low' }));
		const detail = generateMaterialMaps(
			resolveMaterialRecipe('paving', { quality: 'low', structure: false })
		);
		// Joints make the structured map far more contrasted than pure stone grain.
		const spread = (pixels: Uint8Array) => {
			let min = 255;
			let max = 0;
			for (let i = 0; i < pixels.length; i += 4) {
				min = Math.min(min, pixels[i]);
				max = Math.max(max, pixels[i]);
			}
			return max - min;
		};
		expect(spread(detail.albedo)).toBeLessThan(spread(structured.albedo));
	});

	it('the library switches between world-scale and legacy tiled looks, deterministically', async () => {
		const library = new ProceduralMaterialLibrary({
			source: new InlineMaterialMapSource(),
			quality: 'low'
		});
		const material = new THREE.MeshStandardMaterial();
		library.bindMaterial(material, { type: 'paving', mapping: 'planar' });
		await library.whenIdle();
		expect(hasOwnShaderHook(material)).toBe(true);
		const worldMap = material.map;
		library.setAntiTiling(false);
		await library.whenIdle();
		expect(hasOwnShaderHook(material)).toBe(false);
		expect(material.map).not.toBe(worldMap);
		library.setAntiTiling(true);
		await library.whenIdle();
		expect(material.map).toBe(worldMap);
	});
});
