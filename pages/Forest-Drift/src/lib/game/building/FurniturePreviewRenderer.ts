import * as THREE from 'three';
import { BuildingMaterialManager } from './BuildingMaterialManager';
import type { BuildingSettings } from './FoundationTypes';
import { createFurnitureGroup, disposeFurnitureGroup } from './FurnitureGeometry';
import { getFurnitureCatalogueEntry } from './furnitureCatalogue';
import { furnitureColorMaterial } from './FurnitureTypes';
import type { FurnitureDefinition } from './FurnitureTypes';

const MAX_PIXEL_RATIO = 1;
const YAW_SPEED = 0.28;
const MIN_FRAME_MS = 1000 / 30;

/**
 * Isolated WebGL preview for the Place Object catalogue modal. Mirrors PlacementPreviewRenderer
 * so closing the modal always drops its WebGL context.
 */
export class FurniturePreviewRenderer {
	private readonly renderer: THREE.WebGLRenderer;
	private readonly scene = new THREE.Scene();
	private readonly camera = new THREE.PerspectiveCamera(32, 1, 0.08, 40);
	private readonly content = new THREE.Group();
	private readonly materials = new BuildingMaterialManager();
	private readonly flameMaterial = new THREE.MeshStandardMaterial({
		color: 0xffb347,
		emissive: 0xff6a1a,
		emissiveIntensity: 1.8,
		roughness: 0.45,
		metalness: 0,
		flatShading: true
	});
	private readonly observer: ResizeObserver;
	private readonly canvas: HTMLCanvasElement;
	private raf = 0;
	private disposed = false;
	private paused = false;
	private userYaw = 0.55;
	private orbitRadius = 3.4;
	private cameraHeight = 1.4;
	private dragging = false;
	private lastPointerX = 0;
	private lastFrame = 0;

	constructor(canvas: HTMLCanvasElement) {
		this.canvas = canvas;
		this.renderer = new THREE.WebGLRenderer({
			canvas,
			antialias: false,
			alpha: false,
			depth: true,
			stencil: false,
			powerPreference: 'low-power',
			precision: 'mediump',
			failIfMajorPerformanceCaveat: false,
			preserveDrawingBuffer: false
		});
		this.renderer.setPixelRatio(MAX_PIXEL_RATIO);
		this.renderer.outputColorSpace = THREE.SRGBColorSpace;
		this.renderer.shadowMap.enabled = false;
		this.renderer.setClearColor(0x0c1c14, 1);

		this.scene.background = new THREE.Color(0x0c1c14);
		this.scene.add(new THREE.HemisphereLight(0xd7efe3, 0x1c2a20, 1.35));
		const key = new THREE.DirectionalLight(0xfff3d6, 1.55);
		key.position.set(2.4, 3.2, 1.8);
		this.scene.add(key);
		this.scene.add(this.content);

		this.observer = new ResizeObserver(() => this.syncSize());
		this.observer.observe(canvas.parentElement ?? canvas);
		this.syncSize();

		canvas.addEventListener('pointerdown', this.onPointerDown);
		window.addEventListener('pointermove', this.onPointerMove);
		window.addEventListener('pointerup', this.onPointerUp);
		document.addEventListener('visibilitychange', this.onVisibility);

		this.paused = document.visibilityState !== 'visible';
		this.lastFrame = performance.now();
		this.raf = requestAnimationFrame(this.tick);
	}

	setContent(settings: BuildingSettings): void {
		if (this.disposed) return;
		this.clearContent();
		const item = previewDefinition(settings);
		const entry = getFurnitureCatalogueEntry(item.kind);
		const group = createFurnitureGroup(item, {
			primary: this.materials.getMaterial(
				'furniture',
				item.material ?? furnitureColorMaterial(undefined, entry.defaultPrimary)
			),
			secondary: this.materials.getMaterial(
				'furniture-accent',
				item.secondaryMaterial ?? furnitureColorMaterial(undefined, entry.defaultSecondary)
			),
			accent: this.materials.getMaterial(
				'furniture-accent',
				item.secondaryMaterial ?? furnitureColorMaterial(undefined, entry.defaultSecondary)
			),
			emissive: this.flameMaterial
		});
		group.matrix.identity();
		group.matrixAutoUpdate = true;
		this.frameContent(group);
		this.content.add(group);
	}

	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
		cancelAnimationFrame(this.raf);
		this.raf = 0;
		this.observer.disconnect();
		this.canvas.removeEventListener('pointerdown', this.onPointerDown);
		window.removeEventListener('pointermove', this.onPointerMove);
		window.removeEventListener('pointerup', this.onPointerUp);
		document.removeEventListener('visibilitychange', this.onVisibility);

		this.clearContent();
		this.materials.dispose();
		this.flameMaterial.dispose();
		this.scene.traverse((child) => {
			if (child instanceof THREE.Light) child.dispose();
		});
		this.scene.clear();

		this.renderer.setAnimationLoop(null);
		this.renderer.forceContextLoss();
		this.renderer.dispose();
		this.canvas.width = 0;
		this.canvas.height = 0;
	}

	private clearContent(): void {
		for (const child of [...this.content.children]) {
			if (child instanceof THREE.Group) disposeFurnitureGroup(child, false);
			else child.removeFromParent();
		}
	}

	private frameContent(group: THREE.Group): void {
		const box = new THREE.Box3().setFromObject(group);
		const center = box.getCenter(new THREE.Vector3());
		const sphere = box.getBoundingSphere(new THREE.Sphere());
		group.position.sub(center);
		const radius = Math.max(0.6, sphere.radius);
		this.orbitRadius = radius * 2.35;
		this.cameraHeight = radius * 0.55;
		this.camera.near = Math.max(0.05, radius / 40);
		this.camera.far = Math.max(20, radius * 12);
		this.camera.position.set(
			Math.sin(this.userYaw) * this.orbitRadius,
			this.cameraHeight,
			Math.cos(this.userYaw) * this.orbitRadius
		);
		this.camera.lookAt(0, 0, 0);
		this.camera.updateProjectionMatrix();
	}

	private syncSize(): void {
		if (this.disposed) return;
		const parent = this.canvas.parentElement ?? this.canvas;
		const width = Math.max(1, Math.floor(parent.clientWidth));
		const height = Math.max(1, Math.floor(parent.clientHeight));
		this.renderer.setSize(width, height, false);
		this.camera.aspect = width / height;
		this.camera.updateProjectionMatrix();
	}

	private readonly onVisibility = (): void => {
		this.paused = document.visibilityState !== 'visible';
		if (!this.paused && !this.disposed) {
			this.lastFrame = performance.now();
			if (!this.raf) this.raf = requestAnimationFrame(this.tick);
		}
	};

	private readonly onPointerDown = (event: PointerEvent): void => {
		this.dragging = true;
		this.lastPointerX = event.clientX;
		this.canvas.setPointerCapture(event.pointerId);
	};

	private readonly onPointerMove = (event: PointerEvent): void => {
		if (!this.dragging) return;
		this.userYaw -= (event.clientX - this.lastPointerX) * 0.008;
		this.lastPointerX = event.clientX;
	};

	private readonly onPointerUp = (): void => {
		this.dragging = false;
	};

	private readonly tick = (now: number): void => {
		if (this.disposed) return;
		this.raf = 0;
		if (this.paused) return;

		const elapsed = now - this.lastFrame;
		if (!this.dragging && elapsed < MIN_FRAME_MS) {
			this.raf = requestAnimationFrame(this.tick);
			return;
		}
		const dt = Math.min(0.05, elapsed / 1000);
		this.lastFrame = now;
		if (!this.dragging) this.userYaw += YAW_SPEED * dt;

		this.camera.position.set(
			Math.sin(this.userYaw) * this.orbitRadius,
			this.cameraHeight,
			Math.cos(this.userYaw) * this.orbitRadius
		);
		this.camera.lookAt(0, 0, 0);
		this.renderer.render(this.scene, this.camera);
		this.raf = requestAnimationFrame(this.tick);
	};
}

function previewDefinition(settings: BuildingSettings): FurnitureDefinition {
	return {
		id: 'preview',
		kind: settings.furnitureKind,
		foundationId: null,
		x: 0,
		y: 0,
		z: 0,
		nx: 0,
		ny: 1,
		nz: 0,
		rotationY: 0,
		dimensions: {
			width: settings.furnitureWidth,
			depth: settings.furnitureDepth,
			height: settings.furnitureHeight
		},
		material: furnitureColorMaterial(
			settings.furniturePrimaryColor,
			getFurnitureCatalogueEntry(settings.furnitureKind).defaultPrimary
		),
		secondaryMaterial: furnitureColorMaterial(
			settings.furnitureSecondaryColor,
			getFurnitureCatalogueEntry(settings.furnitureKind).defaultSecondary
		),
		parameters: {
			backrest: settings.furnitureBackrest,
			headboard: settings.furnitureHeadboard,
			shelfCount: settings.furnitureShelfCount
		}
	};
}
