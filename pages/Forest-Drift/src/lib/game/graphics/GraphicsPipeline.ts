import * as THREE from 'three';
import { CSM } from 'three/examples/jsm/csm/CSM.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { FXAAPass } from 'three/examples/jsm/postprocessing/FXAAPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import type { Pass } from 'three/examples/jsm/postprocessing/Pass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import {
	GRAPHICS_PRESETS,
	nextGraphicsQuality,
	type AntiAliasMode,
	type AoQuality,
	type GraphicsPreset,
	type GraphicsQuality,
	type GraphicsSettings
} from './GraphicsTypes';

/** GTAO's own sample-count/denoise tuning per AO quality tier — see GraphicsTypes.ts's AoQuality doc. */
const AO_TUNING: Record<AoQuality, { samples: number; pdRings: number; pdSamples: number }> = {
	low: { samples: 8, pdRings: 2, pdSamples: 8 },
	medium: { samples: 16, pdRings: 2, pdSamples: 16 },
	high: { samples: 24, pdRings: 3, pdSamples: 20 }
};

/**
 * Runs the GTAO buffer at a fraction of render resolution on cheaper tiers and upscales via the
 * pass's own bilinear-sampled denoise/blend step — see the README's "Graphics quality" section for
 * why this is visually near-equivalent but meaningfully cheaper than full-resolution AO.
 */
const AO_RESOLUTION_SCALE: Record<AoQuality, number> = {
	low: 0.5,
	medium: 0.75,
	high: 0.85
};

/** How often (seconds) the dynamic-resolution check re-evaluates — deliberately not every frame, see GraphicsTypes.ts's `dynamicResolutionEnabled` doc. */
const DYNAMIC_RES_CHECK_INTERVAL = 1;
const DYNAMIC_RES_STEP = 0.08;
/** Exponential-moving-average time constant (seconds) for the smoothed FPS the dynamic-resolution logic reacts to. */
const FPS_SMOOTHING_TIME_CONSTANT = 0.5;

interface PipelinePasses {
	renderPass: RenderPass;
	gtaoPass: GTAOPass | null;
	bloomPass: UnrealBloomPass | null;
	aaPass: FXAAPass | SMAAPass;
	outputPass: OutputPass;
}

export interface GraphicsRenderStats {
	quality: GraphicsQuality;
	renderScale: number;
	pixelRatio: number;
	drawCalls: number;
	triangles: number;
	geometries: number;
	textures: number;
	shadowsEnabled: boolean;
	shadowCascades: number;
	shadowDistance: number;
	aoEnabled: boolean;
	aoQuality: AoQuality;
	antialiasing: AntiAliasMode;
}

export interface GraphicsPipelineOptions {
	renderer: THREE.WebGLRenderer;
	scene: THREE.Scene;
	camera: THREE.PerspectiveCamera;
	/** The scene's existing non-shadow-casting sun DirectionalLight — the pipeline detaches it from the scene while CSM's own cascade lights are driving sunlight (both illuminating simultaneously would double-count direct light), and re-attaches it when shadows are off. */
	sunLight: THREE.DirectionalLight;
	settings: GraphicsSettings;
	/** Fired after a quality change fully applies — used for the `L`-key HUD notification and persistence. */
	onQualityChange?: (quality: GraphicsQuality) => void;
}

/**
 * Owns every quality-dependent piece of the renderer: pixel ratio, cascaded shadow maps (CSM),
 * ambient occlusion (GTAO), anti-aliasing, bloom, tone mapping/colour space, and dynamic resolution.
 * `ThreeScene` calls `render()` once per frame instead of `renderer.render(scene, camera)` directly,
 * and routes every shadow-receiving material through `registerMaterial()` — see the README's
 * "Graphics quality" section for the full architecture writeup and the reasoning behind each
 * simplification called out in the doc comments below.
 */
export class GraphicsPipeline {
	private readonly renderer: THREE.WebGLRenderer;
	private readonly scene: THREE.Scene;
	private readonly camera: THREE.PerspectiveCamera;
	private readonly sunLight: THREE.DirectionalLight;
	private readonly settings: GraphicsSettings;
	private readonly onQualityChange?: (quality: GraphicsQuality) => void;

	private csm: CSM | null = null;
	private composer: EffectComposer | null = null;
	private passes: PipelinePasses | null = null;
	private currentPreset: GraphicsPreset;

	private readonly registeredMaterials = new Set<THREE.Material>();

	private readonly sunDirection = new THREE.Vector3(0, 1, 0);
	private sunColor = new THREE.Color(0xffffff);
	private sunIntensity = 1;

	private containerWidth = 1;
	private containerHeight = 1;
	private renderScale = 1;
	private smoothedFps = 60;
	private dynamicResCooldown = 0;

	constructor(options: GraphicsPipelineOptions) {
		this.renderer = options.renderer;
		this.scene = options.scene;
		this.camera = options.camera;
		this.sunLight = options.sunLight;
		this.settings = options.settings;
		this.onQualityChange = options.onQualityChange;

		this.renderer.outputColorSpace = THREE.SRGBColorSpace;
		this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
		this.renderer.toneMappingExposure = this.settings.toneMappingExposure;

		this.currentPreset = GRAPHICS_PRESETS[this.settings.quality];
		this.applyPreset(this.settings.quality, { notify: false });
	}

	/** Every material that should be lit by the sun (all `MeshStandardMaterial`s in the scene — see the README for the complete enumerated list) must be registered exactly once; CSM's shader injection otherwise sums every cascade light's full contribution on unregistered materials instead of picking one, badly overbrightening them. Safe to call repeatedly with the same material. */
	registerMaterial(material: THREE.Material): void {
		if (this.registeredMaterials.has(material)) return;
		this.registeredMaterials.add(material);
		this.csm?.setupMaterial(material);
	}

	getQuality(): GraphicsQuality {
		return this.settings.quality;
	}

	setQuality(quality: GraphicsQuality): void {
		if (this.settings.quality === quality) return;
		this.settings.quality = quality;
		this.applyPreset(quality, { notify: true });
	}

	cycleQuality(): GraphicsQuality {
		const next = nextGraphicsQuality(this.settings.quality);
		this.setQuality(next);
		return next;
	}

	/** Re-applies the current quality's advanced settings after a debug-GUI tweak (e.g. dynamic-resolution toggle) without a full preset rebuild. */
	refreshAdvancedSettings(): void {
		this.applyPreset(this.settings.quality, { notify: false });
	}

	/** Cheap live update for the debug GUI's exposure slider — no composer/shadow rebuild needed. */
	setToneMappingExposure(exposure: number): void {
		this.settings.toneMappingExposure = exposure;
		this.renderer.toneMappingExposure = exposure;
	}

	/** Cheap per-frame direction update — CSM repositions its cascade lights from this every `update()` call; does not touch shadow-frustum bounds (see the class doc's per-frame vs per-settings-change split). */
	setSunDirection(direction: THREE.Vector3): void {
		this.sunDirection.copy(direction);
	}

	/** Called whenever sky settings change (sun colour/intensity) — cheap, applied directly to whichever cascade lights are currently active. */
	setSunColorIntensity(color: THREE.Color, intensity: number): void {
		this.sunColor.copy(color);
		this.sunIntensity = intensity;
		if (!this.csm) return;
		for (const light of this.csm.lights) {
			light.color.copy(color);
			light.intensity = intensity;
		}
	}

	/** Camera near/far/fov changed (or first setup) — recomputes CSM's cascade split frustums. Not needed for ordinary sun-direction changes; see CSM.update()'s own per-frame light-orientation math. */
	refreshShadowFrustums(): void {
		this.csm?.updateFrustums();
	}

	handleResize(containerWidth: number, containerHeight: number): void {
		this.containerWidth = Math.max(1, containerWidth);
		this.containerHeight = Math.max(1, containerHeight);
		this.applyRenderSize();
		this.refreshShadowFrustums();
	}

	/** Advances CSM's per-frame light placement and the dynamic-resolution controller. Call once per frame before `render()`. */
	update(deltaSeconds: number): void {
		if (this.csm) {
			this.csm.lightDirection.copy(this.sunDirection);
			this.csm.update();
		}
		this.updateDynamicResolution(deltaSeconds);
	}

	render(): void {
		if (this.composer) this.composer.render();
		else this.renderer.render(this.scene, this.camera);
	}

	getRenderStats(): GraphicsRenderStats {
		const info = this.renderer.info;
		return {
			quality: this.settings.quality,
			renderScale: this.renderScale,
			pixelRatio: this.renderer.getPixelRatio(),
			drawCalls: info.render.calls,
			triangles: info.render.triangles,
			geometries: info.memory.geometries,
			textures: info.memory.textures,
			shadowsEnabled: this.currentPreset.shadowsEnabled,
			shadowCascades: this.currentPreset.shadowCascades,
			shadowDistance: this.currentPreset.shadowDistance,
			aoEnabled: this.currentPreset.aoEnabled,
			aoQuality: this.currentPreset.aoQuality,
			antialiasing: this.currentPreset.antialiasing
		};
	}

	dispose(): void {
		this.teardownCsm();
		this.disposeComposer();
		this.registeredMaterials.clear();
	}

	private applyPreset(quality: GraphicsQuality, { notify }: { notify: boolean }): void {
		const preset = GRAPHICS_PRESETS[quality];
		this.currentPreset = preset;

		const cappedPixelRatio = Math.min(window.devicePixelRatio || 1, preset.pixelRatioCap);
		this.renderer.setPixelRatio(cappedPixelRatio);

		this.applyShadowSettings(preset);
		this.rebuildComposer(preset);
		this.applyRenderSize();

		if (notify) this.onQualityChange?.(quality);
	}

	private applyShadowSettings(preset: GraphicsPreset): void {
		this.teardownCsm();

		if (!preset.shadowsEnabled) {
			this.renderer.shadowMap.enabled = false;
			if (!this.sunLight.parent) {
				this.scene.add(this.sunLight);
				this.scene.add(this.sunLight.target);
			}
			return;
		}

		// CSM's cascade lights fully replace the plain sun light while active — see registerMaterial's
		// doc comment for why having both in the scene at once would double-count direct light.
		this.scene.remove(this.sunLight);
		this.scene.remove(this.sunLight.target);

		this.renderer.shadowMap.enabled = true;
		this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

		try {
			const csm = new CSM({
				camera: this.camera,
				parent: this.scene,
				cascades: preset.shadowCascades,
				maxFar: preset.shadowDistance,
				mode: 'practical',
				shadowMapSize: preset.shadowMapSizes[0] ?? 2048,
				lightDirection: this.sunDirection.clone(),
				lightIntensity: this.sunIntensity,
				lightNear: 1,
				lightFar: 2000,
				lightMargin: 200
			});
			csm.fade = true;

			// CSM sizes every cascade's shadow map uniformly; override per-cascade so the near cascade
			// (which carries almost all of the visible shadow detail) gets the highest resolution and
			// far cascades — which cover a much larger, more distant area per texel anyway — get less.
			preset.shadowMapSizes.forEach((size, index) => {
				const light = csm.lights[index];
				if (!light) return;
				light.shadow.mapSize.set(size, size);
				light.shadow.map?.dispose();
				light.shadow.map = null;
				light.color.copy(this.sunColor);
				light.intensity = this.sunIntensity;
			});

			for (const material of this.registeredMaterials) csm.setupMaterial(material);
			this.csm = csm;
		} catch (error) {
			// Graceful fallback: an unsupported combination (extremely old/limited WebGL context)
			// degrades to the plain unshadowed sun light rather than crashing the render loop.
			console.warn(
				'[graphics] Cascaded shadow maps failed to initialize — disabling shadows.',
				error
			);
			this.renderer.shadowMap.enabled = false;
			this.scene.add(this.sunLight);
			this.scene.add(this.sunLight.target);
		}
	}

	private rebuildComposer(preset: GraphicsPreset): void {
		this.disposeComposer();

		try {
			const composer = new EffectComposer(this.renderer);
			const renderPass = new RenderPass(this.scene, this.camera);
			composer.addPass(renderPass);

			let gtaoPass: GTAOPass | null = null;
			if (preset.aoEnabled) {
				gtaoPass = new GTAOPass(this.scene, this.camera, this.containerWidth, this.containerHeight);
				gtaoPass.output = GTAOPass.OUTPUT.Denoise;
				gtaoPass.blendIntensity = preset.aoIntensity;
				const tuning = AO_TUNING[preset.aoQuality];
				gtaoPass.updateGtaoMaterial({ radius: preset.aoRadius, samples: tuning.samples });
				gtaoPass.updatePdMaterial({
					radius: preset.aoRadius,
					rings: tuning.pdRings,
					samples: tuning.pdSamples
				});
				composer.addPass(gtaoPass);
			}

			let bloomPass: UnrealBloomPass | null = null;
			if (preset.bloomEnabled) {
				bloomPass = new UnrealBloomPass(
					new THREE.Vector2(this.containerWidth, this.containerHeight),
					preset.bloomStrength,
					preset.bloomRadius,
					preset.bloomThreshold
				);
				composer.addPass(bloomPass);
			}

			const aaPass = preset.antialiasing === 'fxaa' ? new FXAAPass() : new SMAAPass();
			composer.addPass(aaPass);

			const outputPass = new OutputPass();
			composer.addPass(outputPass);

			this.composer = composer;
			this.passes = { renderPass, gtaoPass, bloomPass, aaPass, outputPass };
		} catch (error) {
			// Graceful fallback: postprocessing failed to build (e.g. a required extension is
			// missing) — render() already falls back to a plain renderer.render() when composer is
			// null, so the game keeps running with correct tone mapping/colour space either way
			// (WebGLRenderer applies both itself even without a composer).
			console.warn(
				'[graphics] Postprocessing pipeline failed to initialize — using direct rendering.',
				error
			);
			this.composer = null;
			this.passes = null;
		}
	}

	private applyRenderSize(): void {
		const width = Math.max(1, Math.round(this.containerWidth * this.renderScale));
		const height = Math.max(1, Math.round(this.containerHeight * this.renderScale));

		// `updateStyle = false`: the canvas's CSS size is governed entirely by the
		// `.canvas-container canvas { width/height: 100% }` rule, so shrinking the drawing buffer for
		// dynamic resolution never changes the element's on-screen size — the browser just upscales.
		this.renderer.setSize(width, height, false);
		this.composer?.setSize(width, height);

		if (this.passes?.gtaoPass) {
			const scale = AO_RESOLUTION_SCALE[this.currentPreset.aoQuality];
			const pixelRatio = this.renderer.getPixelRatio();
			this.passes.gtaoPass.setSize(
				Math.max(1, Math.round(width * pixelRatio * scale)),
				Math.max(1, Math.round(height * pixelRatio * scale))
			);
		}
	}

	private updateDynamicResolution(deltaSeconds: number): void {
		if (deltaSeconds > 0) {
			const instantFps = 1 / deltaSeconds;
			const alpha = Math.min(1, deltaSeconds / FPS_SMOOTHING_TIME_CONSTANT);
			this.smoothedFps += (instantFps - this.smoothedFps) * alpha;
		}

		if (!this.settings.dynamicResolutionEnabled) {
			if (this.renderScale !== 1) {
				this.renderScale = 1;
				this.applyRenderSize();
			}
			return;
		}

		this.dynamicResCooldown -= deltaSeconds;
		if (this.dynamicResCooldown > 0) return;
		this.dynamicResCooldown = DYNAMIC_RES_CHECK_INTERVAL;

		const floor = this.currentPreset.minDynamicResolutionScale;
		const targetFps = this.settings.targetFps;

		if (this.smoothedFps < targetFps * 0.9 && this.renderScale > floor) {
			this.renderScale = Math.max(floor, this.renderScale - DYNAMIC_RES_STEP);
			this.applyRenderSize();
		} else if (this.smoothedFps > targetFps * 0.97 && this.renderScale < 1) {
			this.renderScale = Math.min(1, this.renderScale + DYNAMIC_RES_STEP / 2);
			this.applyRenderSize();
		}
	}

	private teardownCsm(): void {
		if (!this.csm) return;
		this.csm.remove();
		this.csm.dispose();
		this.csm = null;
	}

	private disposeComposer(): void {
		if (!this.composer) return;
		for (const pass of this.composer.passes as Pass[]) pass.dispose();
		this.composer.dispose();
		this.composer = null;
		this.passes = null;
	}
}
