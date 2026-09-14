import * as THREE from 'three';
import type { MiniBuildAssetCache } from './MiniBuildAssetCache';
import { contentHash } from './miniBuildGrid';
import type { MiniBuildPersonalLibrary } from './MiniBuildPersonalLibrary';
import type { MiniBuildDefinition, MiniBuildFinish } from './MiniBuildTypes';

const FINISH_LOOK: Record<
	MiniBuildFinish,
	{ roughness: number; metalness: number; opacity?: number }
> = {
	wood: { roughness: 0.8, metalness: 0 },
	fabric: { roughness: 0.95, metalness: 0 },
	metal: { roughness: 0.45, metalness: 0.35 },
	stone: { roughness: 0.9, metalness: 0 },
	glass: { roughness: 0.1, metalness: 0, opacity: 0.5 },
	plain: { roughness: 0.7, metalness: 0 }
};

/** Bump to invalidate every cached thumbnail when the thumbnail look or renderer changes. */
const THUMBNAIL_VERSION = 2;

function thumbnailKey(definition: MiniBuildDefinition): string {
	return `t${THUMBNAIL_VERSION}:${contentHash(definition)}`;
}

function linearToSrgb(value: number): number {
	const v = value / 255;
	const s = v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
	return Math.max(0, Math.min(255, Math.round(s * 255)));
}

/**
 * Small design thumbnails rendered offscreen through the game's *existing* WebGLRenderer (a render
 * target, then a pixel readback) — no extra WebGL context. Rendered on save/update and on first
 * sight of a design, cached by content hash in memory and in the personal library, never per frame.
 * Failure returns null: a missing thumbnail must never block saving.
 */
export class MiniBuildThumbnailRenderer {
	private readonly scene = new THREE.Scene();
	private readonly camera = new THREE.PerspectiveCamera(30, 1, 0.05, 40);
	private readonly urls = new Map<string, string>();
	private readonly inflight = new Map<string, Promise<string | null>>();

	constructor(
		private readonly renderer: THREE.WebGLRenderer,
		private readonly cache: MiniBuildAssetCache,
		private readonly personal?: MiniBuildPersonalLibrary,
		private readonly size = 160
	) {
		this.scene.add(new THREE.HemisphereLight(0xf4fff6, 0x2a3a30, 2.2));
		const key = new THREE.DirectionalLight(0xfff1dc, 2.4);
		key.position.set(2.5, 4, 3);
		this.scene.add(key);
		const fill = new THREE.DirectionalLight(0xcfe6ff, 0.8);
		fill.position.set(-3, 2, -2);
		this.scene.add(fill);
	}

	/** Object URL for a design's thumbnail (cached), or null if rendering is unavailable. */
	getUrl(definition: MiniBuildDefinition): Promise<string | null> {
		const hash = thumbnailKey(definition);
		const cached = this.urls.get(hash);
		if (cached) return Promise.resolve(cached);
		let pending = this.inflight.get(hash);
		if (!pending) {
			pending = this.resolve(definition, hash).finally(() => this.inflight.delete(hash));
			this.inflight.set(hash, pending);
		}
		return pending;
	}

	/** Forces a fresh render (after Save) and stores it. */
	async refresh(definition: MiniBuildDefinition): Promise<string | null> {
		const hash = thumbnailKey(definition);
		const blob = await this.renderBlob(definition);
		if (!blob) return null;
		await this.personal?.putThumbnail(hash, blob);
		return this.setUrl(hash, blob);
	}

	async renderBlob(definition: MiniBuildDefinition): Promise<Blob | null> {
		const canvas = this.renderToCanvas(definition);
		if (!canvas) return null;
		return new Promise<Blob | null>((resolve) =>
			canvas.toBlob((blob) => resolve(blob), 'image/png')
		);
	}

	/**
	 * All GPU work happens synchronously here, and the temporary meshes leave the shared thumbnail
	 * scene before any await — concurrent requests can never see each other's geometry.
	 */
	private renderToCanvas(definition: MiniBuildDefinition): HTMLCanvasElement | null {
		if (typeof document === 'undefined') return null;
		let asset: ReturnType<MiniBuildAssetCache['acquire']> | null = null;
		const materials: THREE.Material[] = [];
		const group = new THREE.Group();
		const target = new THREE.WebGLRenderTarget(this.size, this.size, { depthBuffer: true });
		const previousTarget = this.renderer.getRenderTarget();
		const previousClear = this.renderer.getClearColor(new THREE.Color());
		const previousAlpha = this.renderer.getClearAlpha();
		const previousShadowAuto = this.renderer.shadowMap.autoUpdate;
		try {
			asset = this.cache.acquire(definition);
			for (const entry of asset.geometries) {
				const slot = definition.materials[entry.materialSlot];
				const look = FINISH_LOOK[slot?.finish ?? 'plain'];
				const material = new THREE.MeshStandardMaterial({
					color: slot?.material.type === 'color' ? slot.material.color : '#cccccc',
					roughness: look.roughness,
					metalness: look.metalness,
					...(look.opacity ? { transparent: true, opacity: look.opacity } : {})
				});
				materials.push(material);
				group.add(new THREE.Mesh(entry.geometry, material));
			}
			this.scene.add(group);
			this.frame(asset.bounds);

			this.renderer.shadowMap.autoUpdate = false;
			this.renderer.setRenderTarget(target);
			this.renderer.setClearColor(0x183426, 1);
			this.renderer.clear(true, true, true);
			this.renderer.render(this.scene, this.camera);
			const pixels = new Uint8Array(this.size * this.size * 4);
			this.renderer.readRenderTargetPixels(target, 0, 0, this.size, this.size, pixels);

			const canvas = document.createElement('canvas');
			canvas.width = this.size;
			canvas.height = this.size;
			const context = canvas.getContext('2d');
			if (!context) return null;
			const image = context.createImageData(this.size, this.size);
			for (let y = 0; y < this.size; y++) {
				const src = (this.size - 1 - y) * this.size * 4;
				const dst = y * this.size * 4;
				for (let x = 0; x < this.size * 4; x += 4) {
					// Render targets hold linear values; the screen path's sRGB conversion doesn't apply.
					image.data[dst + x] = linearToSrgb(pixels[src + x]);
					image.data[dst + x + 1] = linearToSrgb(pixels[src + x + 1]);
					image.data[dst + x + 2] = linearToSrgb(pixels[src + x + 2]);
					image.data[dst + x + 3] = 255;
				}
			}
			context.putImageData(image, 0, 0);
			return canvas;
		} catch {
			return null;
		} finally {
			this.renderer.setRenderTarget(previousTarget);
			this.renderer.setClearColor(previousClear, previousAlpha);
			this.renderer.shadowMap.autoUpdate = previousShadowAuto;
			group.removeFromParent();
			for (const material of materials) material.dispose();
			target.dispose();
			if (asset) this.cache.release(asset);
		}
	}

	dispose(): void {
		for (const url of this.urls.values()) URL.revokeObjectURL(url);
		this.urls.clear();
	}

	private async resolve(definition: MiniBuildDefinition, hash: string): Promise<string | null> {
		const stored = await this.personal?.getThumbnail(hash);
		if (stored) return this.setUrl(hash, stored);
		const blob = await this.renderBlob(definition);
		if (!blob) return null;
		void this.personal?.putThumbnail(hash, blob);
		return this.setUrl(hash, blob);
	}

	private setUrl(hash: string, blob: Blob): string {
		const previous = this.urls.get(hash);
		if (previous) URL.revokeObjectURL(previous);
		const url = URL.createObjectURL(blob);
		this.urls.set(hash, url);
		return url;
	}

	private frame(bounds: THREE.Box3): void {
		const size = bounds.getSize(new THREE.Vector3());
		const center = bounds.getCenter(new THREE.Vector3());
		const radius = Math.max(0.25, size.length() / 2);
		const distance = (radius / Math.sin((this.camera.fov * Math.PI) / 360)) * 1.05;
		const direction = new THREE.Vector3(0.85, 0.62, 1).normalize();
		this.camera.position.copy(center).addScaledVector(direction, distance);
		this.camera.near = Math.max(0.01, distance - radius * 2);
		this.camera.far = distance + radius * 2;
		this.camera.lookAt(center);
		this.camera.updateProjectionMatrix();
	}
}
