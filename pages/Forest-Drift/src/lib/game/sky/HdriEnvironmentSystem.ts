import * as THREE from 'three';
import { HDRI_PRESETS, resolveHdriPreset, type HdriPreset } from './hdriPresets';
import { disposeEnvironmentTexture, loadEnvironmentTexture } from './loadEnvironmentTexture';
import { createProceduralSkyTexture } from './proceduralEnvironmentTexture';
import type { HdriSettings } from './SkyTypes';

interface EnvironmentEntry {
	source: THREE.Texture;
	target: THREE.WebGLRenderTarget;
}

/** Selected-only loading, bounded two-preset cache, and one PMREM conversion per cached image. */
export class HdriEnvironmentSystem {
	private pmremGenerator: THREE.PMREMGenerator | null = null;
	private readonly cache = new Map<HdriPreset, EnvironmentEntry>();
	private entry: EnvironmentEntry | null = null;
	private requestedPreset: HdriPreset | null = null;
	private pending: Promise<void> | null = null;
	private abortController: AbortController | null = null;
	private requestVersion = 0;
	private initialized = false;
	private disposed = false;
	private fallbackTopColor = '#2f79d1';
	private fallbackHorizonColor = '#cfe9f2';

	constructor(
		private readonly renderer: THREE.WebGLRenderer,
		private readonly scene: THREE.Scene,
		private readonly settings: HdriSettings,
		private readonly onEnvironmentChange: () => void = () => {}
	) {}

	initialize(fallbackTopColor: string, fallbackHorizonColor: string): Promise<void> {
		this.fallbackTopColor = fallbackTopColor;
		this.fallbackHorizonColor = fallbackHorizonColor;
		this.initialized = true;
		this.applySettings();
		return this.pending ?? Promise.resolve();
	}

	applySettings(): void {
		if (this.disposed) return;
		this.applySceneSettings();
		if (!this.initialized) return;
		const preset = resolveHdriPreset(this.settings.preset);
		if (preset === this.requestedPreset) return;
		this.cancelPending();
		this.requestedPreset = preset;
		const cached = this.cache.get(preset);
		if (cached) {
			// Move hits to the most recently used end of the bounded cache.
			this.cache.delete(preset);
			this.cache.set(preset, cached);
			this.entry = cached;
			this.applySceneSettings();
			this.onEnvironmentChange();
			return;
		}
		const version = this.requestVersion;
		const controller = new AbortController();
		this.abortController = controller;
		this.pending = this.loadPreset(preset, version, controller.signal)
			.catch((error) => {
				if (!this.disposed && version === this.requestVersion) {
					console.warn('[sky] Could not prepare the environment map.', error);
				}
			})
			.finally(() => {
				if (version === this.requestVersion) {
					this.pending = null;
					this.abortController = null;
				}
			});
	}

	private applySceneSettings(): void {
		this.scene.environmentIntensity = this.settings.intensity;
		const rotation = THREE.MathUtils.degToRad(this.settings.rotation);
		this.scene.environmentRotation.y = rotation;
		this.scene.backgroundRotation.y = rotation;
		this.scene.environment = this.settings.enabled ? (this.entry?.target.texture ?? null) : null;
	}

	private async loadPreset(
		preset: HdriPreset,
		version: number,
		signal: AbortSignal
	): Promise<void> {
		const definition = HDRI_PRESETS.find((candidate) => candidate.value === preset)!;
		let source: THREE.Texture;
		try {
			source = definition.url
				? await loadEnvironmentTexture(definition.url, signal)
				: createProceduralSkyTexture(this.fallbackTopColor, this.fallbackHorizonColor);
		} catch (error) {
			if (signal.aborted || this.disposed || version !== this.requestVersion) return;
			console.warn(
				`[sky] ${definition.label} could not load; using a procedural environment.`,
				error
			);
			source = createProceduralSkyTexture(this.fallbackTopColor, this.fallbackHorizonColor);
		}
		if (signal.aborted || this.disposed || version !== this.requestVersion) {
			disposeEnvironmentTexture(source);
			return;
		}
		source.mapping = THREE.EquirectangularReflectionMapping;
		source.colorSpace = THREE.SRGBColorSpace;
		source.generateMipmaps = false;
		source.minFilter = THREE.LinearFilter;
		let target: THREE.WebGLRenderTarget;
		try {
			if (!this.pmremGenerator) {
				this.pmremGenerator = new THREE.PMREMGenerator(this.renderer);
				this.pmremGenerator.compileEquirectangularShader();
			}
			target = this.pmremGenerator.fromEquirectangular(source);
		} catch (error) {
			disposeEnvironmentTexture(source);
			throw error;
		}
		const entry = { source, target };
		this.cache.set(preset, entry);
		this.entry = entry;
		this.applySceneSettings();
		this.onEnvironmentChange();
		while (this.cache.size > 2) {
			const oldest = this.cache.keys().next().value!;
			this.disposeEntry(this.cache.get(oldest)!);
			this.cache.delete(oldest);
		}
	}

	/** Use the sharp original panorama for backgrounds, never the blurred lighting PMREM. */
	getBackgroundTexture(): THREE.Texture | null {
		return resolveHdriPreset(this.settings.preset) === 'procedural'
			? null
			: (this.entry?.source ?? null);
	}

	private cancelPending(): void {
		this.requestVersion++;
		this.abortController?.abort();
		this.abortController = null;
		this.pending = null;
	}

	private disposeEntry(entry: EnvironmentEntry): void {
		if (this.scene.environment === entry.target.texture) this.scene.environment = null;
		if (this.scene.background === entry.source) this.scene.background = null;
		entry.target.dispose();
		disposeEnvironmentTexture(entry.source);
	}

	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
		this.cancelPending();
		for (const entry of this.cache.values()) this.disposeEntry(entry);
		this.cache.clear();
		this.entry = null;
		this.pmremGenerator?.dispose();
	}
}
