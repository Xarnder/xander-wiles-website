import * as THREE from 'three';

/**
 * Weather on surfaces — one shader layer shared by the procedural surface shader (terrain, stone,
 * plaster…) and the wood shader, driven by a handful of world-wide uniforms the weather owns:
 *
 *   wet     rain darkens exposed surfaces and makes them glossier; on upward-facing ones it also
 *           leaves PATCHES of standing water (world-space noise) with near-mirror roughness, so
 *           they catch the sky and the sun like puddles on a path or a flat roof
 *   snow    settles on upward-facing exposed surfaces, breaking up first in the low spots of a
 *           noise pattern, then covering everything as it builds
 *
 * "Exposed" means open to the sky: a top-down depth map of the buildings round the player
 * (`WeatherExposureMap`) says how high the nearest cover is above each point, so floors under a
 * roof stay dry and snow-free while the roof, a patio or the ground outside get wet. Outside the
 * map everything counts as exposed. Uniform-only; nothing recompiles as the weather changes, and
 * the whole layer is skipped while it is dry and snow-free.
 */
export const WEATHER_SURFACE_UNIFORMS = {
	/** 0..1 surface wetness. */
	uWxWet: { value: 0 },
	/** 0..1 snow cover. */
	uWxSnow: { value: 0 },
	/** Top-down depth of buildings round the player (1 = nothing). */
	uWxExposure: { value: null as THREE.Texture | null },
	/** World → exposure-map UV: x = minX, y = minZ, z = 1 / size, w = enabled (0/1). */
	uWxExposureArea: { value: new THREE.Vector4(0, 0, 1, 0) },
	/** Depth → height: x = camera top Y, y = depth range (m). */
	uWxExposureDepth: { value: new THREE.Vector2(0, 1) },
	/** Sky/horizon colour (linear) that water patches reflect — the scene's fog colour. */
	uWxSky: { value: new THREE.Color(0.7, 0.75, 0.8) }
};

const VERTEX_PARS = /* glsl */ `
varying vec3 vWxWorld;
`;

const VERTEX_MAIN = /* glsl */ `
{
	vec4 wxWorld = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
	wxWorld = instanceMatrix * wxWorld;
#endif
	vWxWorld = (modelMatrix * wxWorld).xyz;
}
`;

const FRAGMENT_PARS = /* glsl */ `
varying vec3 vWxWorld;
uniform float uWxWet;
uniform float uWxSnow;
uniform sampler2D uWxExposure;
uniform vec4 uWxExposureArea;
uniform vec2 uWxExposureDepth;
uniform vec3 uWxSky;

float wxHash(vec2 p) {
	return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
float wxNoise(vec2 p) {
	vec2 i = floor(p);
	vec2 f = fract(p);
	vec2 u = f * f * (3.0 - 2.0 * f);
	return mix(mix(wxHash(i), wxHash(i + vec2(1.0, 0.0)), u.x),
		mix(wxHash(i + vec2(0.0, 1.0)), wxHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
/** 1 where nothing built stands above this point, 0 under cover (a soft edge either way). */
float wxExposed(vec3 world) {
	if (uWxExposureArea.w < 0.5) return 1.0;
	vec2 uv = (world.xz - uWxExposureArea.xy) * uWxExposureArea.z;
	if (uv.x <= 0.0 || uv.y <= 0.0 || uv.x >= 1.0 || uv.y >= 1.0) return 1.0;
	uv.y = 1.0 - uv.y; // the map's V runs from +Z to -Z (see WeatherExposureMap)
	float coverTop = uWxExposureDepth.x - texture2D(uWxExposure, uv).r * uWxExposureDepth.y;
	return smoothstep(-0.25, -0.05, world.y - coverTop);
}
`;

/** Injected after the normal is final and before lighting reads diffuse colour and roughness. */
function fragmentMain(hasRoughness: boolean): string {
	return /* glsl */ `
if (uWxWet + uWxSnow > 0.002) {
	vec3 wxUpView = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
	float wxUp = smoothstep(0.6, 0.92, dot(normal, wxUpView));
	float wxOpen = wxExposed(vWxWorld);
	// Snow: settles on the tops of things, first in patches, then everywhere.
	float wxSnowField = wxNoise(vWxWorld.xz * 0.45) * 0.65 + wxNoise(vWxWorld.xz * 2.1) * 0.35;
	float wxSnow = wxUp * wxOpen * smoothstep(1.0 - uWxSnow * 1.25, 1.15 - uWxSnow * 1.25, wxSnowField);
	// Wet: everything exposed darkens a little; upward faces collect patches of standing water.
	float wxWet = uWxWet * wxOpen * (1.0 - wxSnow);
	float wxPuddleField = wxNoise(vWxWorld.xz * 0.55 + 7.1) * 0.7 + wxNoise(vWxWorld.xz * 2.3) * 0.3;
	float wxPuddle = wxUp * wxWet * smoothstep(0.86 - uWxWet * 0.15, 0.91 - uWxWet * 0.15, wxPuddleField);
	diffuseColor.rgb *= 1.0 - 0.22 * wxWet * (0.4 + 0.6 * wxUp);
	// Standing water: a dark film whose look is mostly the sky it reflects (roughness below).
	diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.22 + vec3(0.01, 0.014, 0.018), wxPuddle * 0.9);
	diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.9, 0.92, 0.96), wxSnow);
	// Reflection: water patches mirror the sky, strongly at grazing angles (Fresnel); wet surfaces
	// get a faint sheen. Added as emitted light so it reads whatever environment map is loaded.
	float wxFacing = clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);
	float wxFresnel = 0.04 + 0.96 * pow(1.0 - wxFacing, 5.0);
	totalEmissiveRadiance += uWxSky * wxFresnel * (wxPuddle * 0.95 + wxWet * wxUp * 0.18);
	${
		hasRoughness
			? `roughnessFactor = mix(roughnessFactor, roughnessFactor * 0.55, wxWet);
	roughnessFactor = mix(roughnessFactor, 0.02, wxPuddle);
	roughnessFactor = mix(roughnessFactor, 0.85, wxSnow);`
			: ''
	}
}
`;
}

/**
 * Adds the weather layer to a material's shader (call from inside an onBeforeCompile hook, after
 * the hook's own edits). Shares `WEATHER_SURFACE_UNIFORMS`.
 */
export function injectWeatherSurface(shader: THREE.WebGLProgramParametersWithUniforms): void {
	Object.assign(shader.uniforms, WEATHER_SURFACE_UNIFORMS);
	shader.vertexShader = shader.vertexShader
		.replace('#include <common>', `#include <common>\n${VERTEX_PARS}`)
		.replace('#include <project_vertex>', `#include <project_vertex>\n${VERTEX_MAIN}`);
	const hasRoughness = shader.fragmentShader.includes('#include <roughnessmap_fragment>');
	shader.fragmentShader = shader.fragmentShader
		.replace('#include <common>', `#include <common>\n${FRAGMENT_PARS}`)
		.replace(
			'#include <emissivemap_fragment>',
			`#include <emissivemap_fragment>\n${fragmentMain(hasRoughness)}`
		);
}
