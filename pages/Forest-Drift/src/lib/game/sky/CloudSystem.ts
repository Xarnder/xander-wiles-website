import * as THREE from 'three';
import type { CloudSettings, SkyDebugSettings } from './SkyTypes';

/** Large enough that the alpha-faded plane edge (see uEdgeFade in the shader) always sits far beyond any realistic fog-far/view-distance setting. */
const PLANE_SIZE = 8000;
const PLANE_SEGMENTS = 24;

/**
 * Fixed per-layer "recipes" — this is what gives the 2-3 cloud layers their differing scale/
 * coverage/softness/speed/opacity/altitude without needing a whole extra GUI section per layer.
 * Layer 0 is the primary lower fluffy layer (uses speed1/direction1); layer 1 is a mid layer with
 * more breakup (speed2/direction2); the optional layer 2 is a thin, slow, wispy high layer.
 */
interface LayerRecipe {
	altitudeOffset: number;
	scaleMul: number;
	opacityMul: number;
	coverageBias: number;
	speedMul: number;
	useDirection: 1 | 2;
}

const LAYER_RECIPES: readonly LayerRecipe[] = [
	{
		altitudeOffset: 0,
		scaleMul: 1.0,
		opacityMul: 1.0,
		coverageBias: 0.0,
		speedMul: 1.0,
		useDirection: 1
	},
	{
		altitudeOffset: 55,
		scaleMul: 0.55,
		opacityMul: 0.7,
		coverageBias: -0.08,
		speedMul: 1.0,
		useDirection: 2
	},
	{
		altitudeOffset: 115,
		scaleMul: 1.9,
		opacityMul: 0.4,
		coverageBias: -0.2,
		speedMul: 0.55,
		useDirection: 1
	}
];

const VERTEX_SHADER = /* glsl */ `
	varying vec2 vUv;
	varying vec2 vWorldXZ;
	void main() {
		vUv = uv;
		// The plane's local (pre-translation) X/Z, already in real world units since PlaneGeometry
		// is built at true world size (PLANE_SIZE) — used instead of vUv for noise sampling so cloud
		// feature size is a real world-space quantity, not a fraction of the plane's own arbitrary
		// size. See uMacroScale/uBreakupScale/uWispyScale usage below for why this matters.
		vWorldXZ = position.xz;
		gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
	}
`;

// A cheap hash-based value-noise + fbm — not simplex quality, but more than enough for soft cloud
// alpha shaping, and trivial on the GPU. Macro noise dominates the density mix (see uDensity
// below) so large shapes read first, same "large shapes dominate, micro detail stays restrained"
// rule the terrain system uses.
const FRAGMENT_SHADER = /* glsl */ `
	varying vec2 vUv;
	varying vec2 vWorldXZ;

	// World units per noise cycle at uMacroScale == 1. From typical eye height, only a few hundred
	// world units of a cloud layer's huge plane are ever actually visible between the horizon and
	// the top of the screen — sampling noise from raw plane UV (a fraction of the whole 8000-unit
	// plane) put nearly the entire visible sky inside a fraction of one noise cycle, so it always
	// looked flat. Sampling world-space coordinates against this much smaller reference keeps real
	// variation inside the visible window, matching every other noise-driven system in this project
	// (terrain, vegetation), which always scales against real world-space distance.
	const float CLOUD_NOISE_REFERENCE_UNIT = 900.0;

	uniform float uMacroScale;
	uniform float uBreakupScale;
	uniform float uWispyScale;
	uniform vec2 uOffsetMacro;
	uniform vec2 uOffsetBreakup;
	uniform vec2 uOffsetWispy;
	uniform float uCoverage;
	uniform float uEdgeThreshold;
	uniform float uEdgeSoftness;
	uniform float uOpacity;

	uniform vec3 uBaseColor;
	uniform vec3 uShadowColor;
	uniform vec3 uWarmColor;
	uniform vec3 uCoolColor;
	uniform float uLightResponse;
	uniform float uWarmth;
	uniform float uCoolTint;

	float hash(vec2 p) {
		p = fract(p * vec2(123.34, 456.21));
		p += dot(p, p + 45.32);
		return fract(p.x * p.y);
	}

	float valueNoise(vec2 p) {
		vec2 i = floor(p);
		vec2 f = fract(p);
		float a = hash(i);
		float b = hash(i + vec2(1.0, 0.0));
		float c = hash(i + vec2(0.0, 1.0));
		float d = hash(i + vec2(1.0, 1.0));
		vec2 u = f * f * (3.0 - 2.0 * f);
		return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
	}

	float fbm3(vec2 p) {
		float sum = valueNoise(p) * 0.5;
		p *= 2.02;
		sum += valueNoise(p) * 0.25;
		p *= 2.03;
		sum += valueNoise(p) * 0.125;
		return sum / 0.875;
	}

	uniform vec2 uSunXZ;
	uniform float uSunUp;

	// Cloud density at a point: macro shapes, domain-warped so they billow instead of smearing,
	// with ridged "cauliflower" detail eating into the edges. The raw fbm mix clusters tightly
	// around 0.5 (value noise), which left every pixel a faint, even haze — it is stretched here so
	// coverage/threshold produce real clouds with real clear sky between them.
	float cloudDensity(vec2 coord, out vec2 warped, out float macroOut) {
		vec2 warp = vec2(
			valueNoise(coord * uBreakupScale * 0.5 + uOffsetBreakup + 3.7),
			valueNoise(coord * uBreakupScale * 0.5 + uOffsetBreakup - 5.1)
		) - 0.5;
		vec2 q = coord + warp * (0.28 / max(uMacroScale, 0.1));
		warped = q;
		float macro = fbm3(q * uMacroScale + uOffsetMacro);
		macroOut = macro;
		float breakup = fbm3(q * uBreakupScale + uOffsetBreakup);
		float billow = 1.0 - abs(valueNoise(q * uWispyScale + uOffsetWispy) * 2.0 - 1.0);
		float puff = 1.0 - abs(valueNoise(q * uWispyScale * 2.3 + uOffsetWispy * 1.7 + 9.0) * 2.0 - 1.0);
		float raw = macro * 0.58 + breakup * 0.24 + billow * 0.12 + puff * 0.06;
		return (raw - 0.5) * 2.6 + 0.5 + (uCoverage - 0.5) * 1.5;
	}

	void main() {
		vec2 worldCoord = vWorldXZ / CLOUD_NOISE_REFERENCE_UNIT;
		vec2 warped;
		float macroHere;
		float density = cloudDensity(worldCoord, warped, macroHere);

		float soft = max(0.035, uEdgeSoftness * 0.6);
		float alpha = smoothstep(uEdgeThreshold - soft, uEdgeThreshold + soft, density);

		// Fade the plane's own boundary to nothing well before its edge, so there is never a
		// visible rectangular border no matter how far the player can theoretically see.
		float edgeFade = 1.0 - smoothstep(0.28, 0.5, length(vUv - 0.5));
		alpha *= edgeFade;

		if (alpha <= 0.002) discard;

		// Seen from below: thick cores are grey underneath, thin edges let light through and glow.
		float thickness = smoothstep(uEdgeThreshold, uEdgeThreshold + 0.7, density);
		// One step toward the sun on the large shapes only (cheap): where the cloud thins toward the
		// sun, that side is lit.
		float macroSun = fbm3((warped + uSunXZ * 0.045) * uMacroScale + uOffsetMacro);
		float sunlit = clamp((macroHere - macroSun) * 6.0 + 0.5, 0.0, 1.0) * uSunUp;
		float shade = mix(1.0, 1.0 - thickness * 0.95, uLightResponse);
		shade = clamp(shade + sunlit * 0.35 * uLightResponse, 0.0, 1.15);
		vec3 color = mix(uShadowColor, uBaseColor, shade);
		// Silver lining on the thin, sunward edges.
		color += uBaseColor * (1.0 - thickness) * sunlit * 0.18;
		color = mix(color, uWarmColor * (uBaseColor.r), uWarmth * 0.3);
		color = mix(color, uCoolColor * (uBaseColor.r), uCoolTint * 0.2);

		// Dense cores are nearly opaque; thin edges stay soft.
		gl_FragColor = vec4(color, alpha * mix(0.75, 1.0, thickness) * uOpacity);
	}
`;

interface CloudLayer {
	mesh: THREE.Mesh;
	material: THREE.ShaderMaterial;
	bounds: THREE.LineSegments;
	recipe: LayerRecipe;
	offset: THREE.Vector2;
}

/**
 * A handful of very large, slowly-scrolling cloud sheets rather than any per-cloud geometry —
 * "clouds" are entirely a shader alpha pattern over a couple of huge planes. Layers are
 * re-centred on the player's X/Z every frame (see update()) so the sky never has an edge to walk
 * off of, while their noise offsets drift over time to animate independently of player movement.
 */
export class CloudSystem {
	readonly group = new THREE.Group();
	private readonly layers: CloudLayer[] = [];
	private readonly sharedGeometry: THREE.PlaneGeometry;
	private readonly boundsGeometry: THREE.EdgesGeometry;
	private readonly boundsMaterial = new THREE.LineBasicMaterial({ color: 0x33ccff });

	constructor() {
		this.sharedGeometry = new THREE.PlaneGeometry(
			PLANE_SIZE,
			PLANE_SIZE,
			PLANE_SEGMENTS,
			PLANE_SEGMENTS
		);
		this.sharedGeometry.rotateX(-Math.PI / 2);
		this.boundsGeometry = new THREE.EdgesGeometry(new THREE.PlaneGeometry(PLANE_SIZE, PLANE_SIZE));
		const sharedGeometry = this.sharedGeometry;
		const boundsGeometry = this.boundsGeometry;

		for (const recipe of LAYER_RECIPES) {
			const material = new THREE.ShaderMaterial({
				vertexShader: VERTEX_SHADER,
				fragmentShader: FRAGMENT_SHADER,
				transparent: true,
				depthWrite: false,
				side: THREE.DoubleSide,
				fog: false,
				uniforms: {
					uMacroScale: { value: 1.5 },
					uBreakupScale: { value: 4 },
					uWispyScale: { value: 9 },
					uOffsetMacro: { value: new THREE.Vector2() },
					uOffsetBreakup: { value: new THREE.Vector2() },
					uOffsetWispy: { value: new THREE.Vector2() },
					uCoverage: { value: 0.5 },
					uEdgeThreshold: { value: 0.5 },
					uEdgeSoftness: { value: 0.2 },
					uOpacity: { value: 1 },
					uBaseColor: { value: new THREE.Color(0xffffff) },
					uShadowColor: { value: new THREE.Color(0x9aa4b0) },
					uWarmColor: { value: new THREE.Color(0xffdca8) },
					uCoolColor: { value: new THREE.Color(0xbcd4ff) },
					uLightResponse: { value: 0.6 },
					uWarmth: { value: 0.4 },
					uCoolTint: { value: 0.25 },
					uSunXZ: { value: new THREE.Vector2(0, 1) },
					uSunUp: { value: 1 }
				}
			});

			const mesh = new THREE.Mesh(sharedGeometry, material);
			mesh.frustumCulled = false;
			mesh.renderOrder = -900;

			const bounds = new THREE.LineSegments(boundsGeometry, this.boundsMaterial);
			bounds.rotation.x = -Math.PI / 2;
			bounds.visible = false;
			mesh.add(bounds);

			this.group.add(mesh);
			this.layers.push({ mesh, material, bounds, recipe, offset: new THREE.Vector2() });
		}
	}

	applySettings(settings: CloudSettings): void {
		this.group.visible = settings.enabled;

		const baseColor = new THREE.Color(0xffffff).multiplyScalar(settings.brightness);
		// Undersides: a cool grey (stronger than the old flat tint) so clouds read against a pale sky.
		const shadowColor = new THREE.Color(0x8e9aaa)
			.multiplyScalar(settings.brightness)
			.lerp(baseColor, 1 - Math.min(1, settings.shadowTint * 1.6));

		this.layers.forEach((layer, index) => {
			layer.mesh.visible = settings.enabled && index < settings.layerCount;

			const u = layer.material.uniforms;
			u.uMacroScale.value = settings.macroScale * layer.recipe.scaleMul * settings.scale;
			u.uBreakupScale.value = settings.breakupScale * layer.recipe.scaleMul * settings.scale;
			u.uWispyScale.value = settings.wispyScale * layer.recipe.scaleMul * settings.scale;
			u.uCoverage.value = settings.coverage + layer.recipe.coverageBias;
			u.uEdgeThreshold.value = settings.edgeThreshold;
			u.uEdgeSoftness.value = Math.max(0.02, settings.edgeSoftness * (0.5 + settings.softness));
			u.uOpacity.value = settings.opacity * layer.recipe.opacityMul;
			(u.uBaseColor.value as THREE.Color).copy(baseColor);
			(u.uShadowColor.value as THREE.Color).copy(shadowColor);
			u.uLightResponse.value = settings.lightResponse;
			u.uWarmth.value = settings.warmth;
			u.uCoolTint.value = settings.coolTint;
		});
	}

	applyDebugSettings(debug: SkyDebugSettings): void {
		for (const layer of this.layers) {
			layer.bounds.visible = debug.showCloudBounds;
			layer.material.wireframe = debug.showCloudLayerWireframe;
		}
	}

	/** Sun direction (toward the sun) — lights the sunward side of each cloud. */
	setSunDirection(direction: THREE.Vector3): void {
		const horizontal = Math.hypot(direction.x, direction.z) || 1;
		for (const layer of this.layers) {
			const u = layer.material.uniforms;
			(u.uSunXZ.value as THREE.Vector2).set(direction.x / horizontal, direction.z / horizontal);
			u.uSunUp.value = THREE.MathUtils.clamp(direction.y * 3 + 0.3, 0, 1);
		}
	}

	/** Re-centres every layer on the player's X/Z and advances each layer's noise offset — called once per frame. */
	update(deltaSeconds: number, settings: CloudSettings, cameraX: number, cameraZ: number): void {
		if (!settings.enabled) return;

		for (const layer of this.layers) {
			layer.mesh.position.set(cameraX, settings.altitude + layer.recipe.altitudeOffset, cameraZ);

			const directionDegrees =
				layer.recipe.useDirection === 1 ? settings.direction1 : settings.direction2;
			const speed =
				(layer.recipe.useDirection === 1 ? settings.speed1 : settings.speed2) *
				layer.recipe.speedMul *
				settings.driftStrength;
			const radians = THREE.MathUtils.degToRad(directionDegrees);

			layer.offset.x += Math.sin(radians) * speed * deltaSeconds * 0.02;
			layer.offset.y += Math.cos(radians) * speed * deltaSeconds * 0.02;

			const u = layer.material.uniforms;
			(u.uOffsetMacro.value as THREE.Vector2).copy(layer.offset);
			(u.uOffsetBreakup.value as THREE.Vector2).set(layer.offset.x * 1.7, layer.offset.y * 1.3);
			(u.uOffsetWispy.value as THREE.Vector2).set(layer.offset.x * 0.6, layer.offset.y * 2.1);
		}
	}

	dispose(): void {
		for (const layer of this.layers) layer.material.dispose();
		this.boundsMaterial.dispose();
		this.sharedGeometry.dispose();
		this.boundsGeometry.dispose();
	}
}
