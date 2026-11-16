import * as THREE from 'three';
import { afterEach, describe, expect, it } from 'vitest';
import { WEATHER_SURFACE_UNIFORMS } from '../../../materials/shader/weatherSurface';
import { createCreatureMaterial, setCreatureWeatherScale } from '../../CreatureMaterial';
import { readCreatureCoatSwitches } from '../creatureCoatSwitches';

type Shader = Parameters<THREE.Material['onBeforeCompile']>[0];

function compiled(material: THREE.Material) {
	const lib = THREE.ShaderLib.standard;
	const shader = {
		uniforms: THREE.UniformsUtils.clone(lib.uniforms),
		vertexShader: lib.vertexShader,
		fragmentShader: lib.fragmentShader
	} as unknown as Shader;
	material.onBeforeCompile(shader, null as never);
	return shader;
}

describe('weather on coats', () => {
	afterEach(() => {
		readCreatureCoatSwitches('');
		setCreatureWeatherScale(1);
	});

	it('adds the weather layer after the final normal and roughness, before lighting', () => {
		const material = createCreatureMaterial();
		const shader = compiled(material);
		const f = shader.fragmentShader;
		const coat = f.indexOf('creatureBaseNormal = normal;');
		const weather = f.indexOf('(uWxWet + uWxSnow) * creatureWeatherScale');
		const lights = f.indexOf('#include <lights_physical_fragment>');
		const roughness = f.indexOf('roughnessFactor = clamp(vCreatureSurface.x');
		expect(coat).toBeGreaterThan(0);
		expect(roughness).toBeGreaterThan(0);
		expect(weather).toBeGreaterThan(coat);
		expect(weather).toBeGreaterThan(roughness);
		expect(weather).toBeLessThan(lights);
		// The world position (after skinning) feeds the building exposure lookup.
		expect(shader.vertexShader).toContain(
			'vCreatureWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;'
		);
		expect(material.customProgramCacheKey()).toContain('creature-surface-v4');
		material.dispose();
	});

	it('follows the same world-wide weather uniforms as the terrain', () => {
		const material = createCreatureMaterial();
		const shader = compiled(material);
		for (const key of Object.keys(
			WEATHER_SURFACE_UNIFORMS
		) as (keyof typeof WEATHER_SURFACE_UNIFORMS)[])
			expect(shader.uniforms[key]).toBe(WEATHER_SURFACE_UNIFORMS[key]);
		material.dispose();
	});

	it('turns off with ?creatureWeather=off', () => {
		readCreatureCoatSwitches('?creatureWeather=off');
		const off = createCreatureMaterial();
		expect(compiled(off).uniforms.creatureWeatherScale.value).toBe(0);
		off.dispose();
		readCreatureCoatSwitches('');
		const on = createCreatureMaterial();
		expect(compiled(on).uniforms.creatureWeatherScale.value).toBe(1);
		on.dispose();
	});
});
