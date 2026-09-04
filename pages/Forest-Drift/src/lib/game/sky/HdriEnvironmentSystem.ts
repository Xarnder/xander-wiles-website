import * as THREE from 'three';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';
import { createProceduralSkyTexture } from './proceduralEnvironmentTexture';
import type { HdriSettings } from './SkyTypes';

/**
 * Loads an HDRI purely for environment lighting/reflections (`scene.environment`) — it is
 * deliberately NOT the visible sky by default; see SkyTypes.ts's module doc for why. If no `.hdr`
 * file exists at the given URL (nothing ships with this project by default), it falls back to a
 * cheap procedural gradient environment instead of leaving the world unlit or logging an error —
 * see the README for how to swap in a real Poly Haven HDRI.
 */
export class HdriEnvironmentSystem {
	private readonly scene: THREE.Scene;
	private readonly settings: HdriSettings;
	private readonly pmremGenerator: THREE.PMREMGenerator;

	private sourceTexture: THREE.Texture | null = null;
	private envTexture: THREE.Texture | null = null;
	private disposed = false;

	constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, settings: HdriSettings) {
		this.scene = scene;
		this.settings = settings;
		this.pmremGenerator = new THREE.PMREMGenerator(renderer);
		this.pmremGenerator.compileEquirectangularShader();
	}

	async initialize(
		hdrUrl: string,
		fallbackTopColor: string,
		fallbackHorizonColor: string
	): Promise<void> {
		let sourceTexture: THREE.Texture;
		try {
			sourceTexture = await new HDRLoader().loadAsync(hdrUrl);
		} catch {
			console.info(
				`[sky] No HDRI found at "${hdrUrl}" — using a lightweight procedural fallback environment. See the README's "Swapping in an HDRI" section to add a real one.`
			);
			sourceTexture = createProceduralSkyTexture(fallbackTopColor, fallbackHorizonColor);
		}

		if (this.disposed) {
			sourceTexture.dispose();
			return;
		}

		sourceTexture.mapping = THREE.EquirectangularReflectionMapping;
		this.sourceTexture = sourceTexture;
		this.envTexture = this.pmremGenerator.fromEquirectangular(sourceTexture).texture;
		this.applySettings();
	}

	applySettings(): void {
		this.scene.environmentIntensity = this.settings.intensity;
		const rotationRadians = THREE.MathUtils.degToRad(this.settings.rotation);
		this.scene.environmentRotation.y = rotationRadians;
		this.scene.backgroundRotation.y = rotationRadians;
		this.scene.environment = this.settings.enabled ? this.envTexture : null;
	}

	/** Non-null only when `showAsBackground` is on and an environment texture is actually loaded — ThreeScene decides what `scene.background` should be from this. */
	getBackgroundTexture(): THREE.Texture | null {
		return this.settings.showAsBackground ? this.envTexture : null;
	}

	dispose(): void {
		this.disposed = true;
		this.envTexture?.dispose();
		this.sourceTexture?.dispose();
		this.pmremGenerator.dispose();
	}
}
