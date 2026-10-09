import * as THREE from 'three';
import { WEATHER_SURFACE_UNIFORMS } from '../materials/shader/weatherSurface';

/** World size (m) of the square the map covers, centred on the player. */
const EXTENT = 96;
const RESOLUTION = 512;
/** Re-render once the player is this far from the map's centre (m). */
const RECENTRE_DISTANCE = 12;
const ABOVE = 80;
const DEPTH_RANGE = 200;

/**
 * Which surfaces are open to the sky? A top-down orthographic DEPTH render of the buildings round
 * the player (foundations, walls, floors, roofs, stairs, furniture, Mini Builds — never terrain or
 * trees) into a 512² depth texture over 96 m. The weather surface shader compares each fragment's
 * height with the highest cover above it: roofs, patios and open ground get wet and snowy; floors
 * under a roof stay dry. Rendered only while surfaces are wet or snowy, and then only when the
 * player has moved ~12 m or something was built or removed — not per frame.
 */
export class WeatherExposureMap {
	private readonly target: THREE.WebGLRenderTarget;
	private readonly camera: THREE.OrthographicCamera;
	private readonly material = new THREE.MeshBasicMaterial({ colorWrite: false });
	private centreX = Number.NaN;
	private centreZ = Number.NaN;
	private revision = Number.NaN;
	private renders = 0;

	constructor(
		private readonly renderer: THREE.WebGLRenderer,
		private readonly scene: THREE.Scene,
		private readonly occluders: () => readonly THREE.Object3D[]
	) {
		this.target = new THREE.WebGLRenderTarget(RESOLUTION, RESOLUTION, {
			depthBuffer: true,
			stencilBuffer: false
		});
		this.target.depthTexture = new THREE.DepthTexture(RESOLUTION, RESOLUTION);
		this.target.depthTexture.minFilter = THREE.NearestFilter;
		this.target.depthTexture.magFilter = THREE.NearestFilter;
		const half = EXTENT / 2;
		this.camera = new THREE.OrthographicCamera(-half, half, half, -half, 0.1, DEPTH_RANGE);
		// Looking straight down with screen-up = -Z: screen right is +X, so the map's V runs from
		// +Z (v = 0) to -Z (v = 1). The shader flips V to match.
		this.camera.up.set(0, 0, -1);
		WEATHER_SURFACE_UNIFORMS.uWxExposure.value = this.target.depthTexture;
	}

	get renderCount(): number {
		return this.renders;
	}

	/**
	 * `active`: surfaces are wet or snowy (otherwise the map is not needed and nothing renders).
	 * `revision`: changes whenever buildings change.
	 */
	update(x: number, y: number, z: number, revision: number, active: boolean): void {
		const area = WEATHER_SURFACE_UNIFORMS.uWxExposureArea.value;
		if (!active) return;
		const moved = !(Math.hypot(x - this.centreX, z - this.centreZ) < RECENTRE_DISTANCE);
		if (!moved && revision === this.revision) return;
		// Snap the centre to the texel grid so re-centring never shifts existing cover by a fraction
		// of a texel (which would make edges shimmer).
		const texel = EXTENT / RESOLUTION;
		this.centreX = Math.round(x / texel) * texel;
		this.centreZ = Math.round(z / texel) * texel;
		this.revision = revision;
		const top = y + ABOVE;
		this.camera.position.set(this.centreX, top, this.centreZ);
		this.camera.lookAt(this.centreX, top - 1, this.centreZ);
		this.camera.updateMatrixWorld();
		this.render();
		area.set(this.centreX - EXTENT / 2, this.centreZ - EXTENT / 2, 1 / EXTENT, 1);
		WEATHER_SURFACE_UNIFORMS.uWxExposureDepth.value.set(top - this.camera.near, DEPTH_RANGE - this.camera.near);
	}

	/** Forces a re-render next time it is needed (world loaded). */
	invalidate(): void {
		this.centreX = Number.NaN;
	}

	dispose(): void {
		this.target.depthTexture?.dispose();
		this.target.dispose();
		this.material.dispose();
		WEATHER_SURFACE_UNIFORMS.uWxExposure.value = null;
		WEATHER_SURFACE_UNIFORMS.uWxExposureArea.value.w = 0;
	}

	private render(): void {
		const scene = this.scene;
		const keep = new Set(this.occluders());
		// Ancestors of the occluders must stay visible (the groups may sit inside other groups);
		// every other branch is hidden for this one render.
		const path = new Set<THREE.Object3D>();
		for (const object of keep) {
			for (let parent = object.parent; parent; parent = parent.parent) path.add(parent);
		}
		const hidden: THREE.Object3D[] = [];
		const hideOthers = (node: THREE.Object3D) => {
			for (const child of node.children) {
				if (keep.has(child) || !child.visible) continue;
				if (path.has(child)) hideOthers(child);
				else {
					child.visible = false;
					hidden.push(child);
				}
			}
		};
		hideOthers(scene);
		const background = scene.background;
		const fog = scene.fog;
		const override = scene.overrideMaterial;
		const shadowAuto = this.renderer.shadowMap.autoUpdate;
		const previousTarget = this.renderer.getRenderTarget();
		scene.background = null;
		scene.fog = null;
		scene.overrideMaterial = this.material;
		this.renderer.shadowMap.autoUpdate = false;
		try {
			this.renderer.setRenderTarget(this.target);
			this.renderer.clear(true, true, false);
			this.renderer.render(scene, this.camera);
		} finally {
			this.renderer.setRenderTarget(previousTarget);
			this.renderer.shadowMap.autoUpdate = shadowAuto;
			scene.overrideMaterial = override;
			scene.fog = fog;
			scene.background = background;
			for (const child of hidden) child.visible = true;
		}
		this.renders++;
	}
}
