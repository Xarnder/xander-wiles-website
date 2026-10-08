import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { ProceduralMaterialLibrary } from '../ProceduralMaterialLibrary';
import type {
	MaterialPaletteId,
	MaterialQuality,
	ProceduralMaterialOptions,
	ProceduralMaterialType,
	SurfaceStyle
} from '../ProceduralMaterialTypes';
import { SurfaceMappingBinder } from '../SurfaceMappingBinder';

export type GallerySample = 'wall' | 'block' | 'roof' | 'floor' | 'sphere';

export interface GallerySelection {
	type: ProceduralMaterialType;
	options: ProceduralMaterialOptions;
	quality: MaterialQuality;
	palette: MaterialPaletteId;
	sample: GallerySample;
}

export interface GalleryMaps {
	key: string;
	albedo: { data: Uint8Array; size: number };
	normal: { data: Uint8Array; size: number };
	orm: { data: Uint8Array; size: number };
	/** Wall-clock time from request to applied maps (includes worker hand-off). */
	milliseconds: number;
}

/** Mapping mode the gallery uses for each type — the same choices `buildingSurfaceStyles.ts` makes. */
function mappingFor(type: ProceduralMaterialType): SurfaceStyle['mapping'] {
	return type === 'timber' ? 'grain' : type === 'slate' ? 'roof' : 'planar';
}

/**
 * The 3D half of the development material gallery (`/materials/`): one lit sample object wearing the
 * selected procedural material, under lighting close to the game's (warm sun, sky hemisphere,
 * environment reflections, ACES). Samples are built at real-world size and mapped by the same
 * `SurfaceMappingBinder` the game uses, so what you see here is what a wall or roof gets in-world.
 */
export class MaterialGalleryScene {
	private readonly renderer: THREE.WebGLRenderer;
	private readonly scene = new THREE.Scene();
	private readonly camera = new THREE.PerspectiveCamera(40, 1, 0.05, 100);
	private readonly controls: OrbitControls;
	private readonly binder = new SurfaceMappingBinder({
		getFoundationOrigin: () => null,
		getWorldSeed: () => 'gallery'
	});
	private readonly library: ProceduralMaterialLibrary;
	private readonly standard = new THREE.MeshStandardMaterial({ roughness: 0.8 });
	private readonly glass = new THREE.MeshPhysicalMaterial({
		transparent: true,
		side: THREE.DoubleSide,
		depthWrite: false
	});
	private readonly backing = new THREE.Mesh(
		new THREE.BoxGeometry(3.4, 2.4, 0.05),
		new THREE.MeshStandardMaterial({ color: 0xcfc6b3, roughness: 0.9 })
	);
	private sampleMesh: THREE.Mesh | null = null;
	private frame = 0;
	private disposed = false;
	private readonly resizeObserver: ResizeObserver;

	constructor(private readonly container: HTMLElement) {
		this.renderer = new THREE.WebGLRenderer({ antialias: true });
		this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
		this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
		this.renderer.outputColorSpace = THREE.SRGBColorSpace;
		this.renderer.shadowMap.enabled = true;
		container.appendChild(this.renderer.domElement);

		const pmrem = new THREE.PMREMGenerator(this.renderer);
		this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
		this.scene.environmentIntensity = 0.45;
		this.scene.background = new THREE.Color(0x2a3236);
		pmrem.dispose();

		this.scene.add(new THREE.HemisphereLight(0xeef0ea, 0x4f5a2e, 0.6));
		const sun = new THREE.DirectionalLight(0xfff1d6, 2.2);
		sun.position.set(3, 4, 5);
		sun.castShadow = true;
		sun.shadow.mapSize.set(1024, 1024);
		this.scene.add(sun);

		this.camera.position.set(1.6, 1.0, 3.6);
		this.controls = new OrbitControls(this.camera, this.renderer.domElement);
		this.controls.enableDamping = true;
		this.controls.target.set(0, 0.1, 0);

		this.library = new ProceduralMaterialLibrary({
			binder: this.binder,
			anisotropy: Math.min(8, this.renderer.capabilities.getMaxAnisotropy())
		});

		this.resizeObserver = new ResizeObserver(() => this.resize());
		this.resizeObserver.observe(container);
		this.resize();
		this.animate();
	}

	/** Applies a selection and resolves with the applied maps once generated. */
	async show(selection: GallerySelection): Promise<GalleryMaps | null> {
		const started = performance.now();
		this.library.setQuality(selection.quality);
		this.library.setPalette(selection.palette);
		const isGlass = selection.type === 'glass';
		const material = isGlass ? this.glass : this.standard;
		const native = selection.sample === 'sphere';
		this.library.bindMaterial(material, {
			type: selection.type,
			options: selection.options,
			mapping: native ? 'native' : mappingFor(selection.type)
		});
		this.buildSample(selection.sample, selection.type, material);
		this.backing.visible = isGlass;
		await this.library.whenIdle();
		if (this.disposed) return null;
		const applied = this.library.getAppliedMaps(material);
		if (!applied) return null;
		const image = (texture: THREE.DataTexture) => ({
			data: texture.image.data as Uint8Array,
			size: texture.image.width
		});
		return {
			key: applied.key,
			albedo: image(applied.map),
			normal: image(applied.normalMap),
			orm: image(applied.ormMap),
			milliseconds: performance.now() - started
		};
	}

	getStats() {
		return this.library.getStats();
	}

	dispose(): void {
		this.disposed = true;
		cancelAnimationFrame(this.frame);
		this.resizeObserver.disconnect();
		this.controls.dispose();
		this.sampleMesh?.geometry.dispose();
		this.library.dispose();
		this.binder.dispose();
		this.standard.dispose();
		this.glass.dispose();
		this.backing.geometry.dispose();
		(this.backing.material as THREE.Material).dispose();
		this.renderer.dispose();
		this.renderer.domElement.remove();
	}

	/** Real-world sized sample geometry: what a wall panel, beam, roof slope or floor actually is in-game. */
	private buildSample(
		sample: GallerySample,
		type: ProceduralMaterialType,
		material: THREE.Material
	): void {
		if (this.sampleMesh) {
			this.scene.remove(this.sampleMesh);
			this.sampleMesh.geometry.dispose();
		}
		let geometry: THREE.BufferGeometry;
		const mesh = new THREE.Mesh();
		switch (sample) {
			case 'block':
				geometry =
					type === 'timber'
						? new THREE.BoxGeometry(2.4, 0.24, 0.24)
						: new THREE.BoxGeometry(1.6, 0.9, 0.9);
				break;
			case 'roof':
				geometry = new THREE.BoxGeometry(2.8, 0.06, 2.2);
				mesh.rotation.x = 0.6;
				break;
			case 'floor':
				geometry = new THREE.BoxGeometry(3, 0.1, 3);
				mesh.position.y = -0.6;
				break;
			case 'sphere': {
				const radius = 0.8;
				geometry = new THREE.SphereGeometry(radius, 96, 64);
				// Native UVs in metres: U around the equator, V pole to pole.
				const uv = geometry.getAttribute('uv') as THREE.BufferAttribute;
				for (let i = 0; i < uv.count; i++) {
					uv.setXY(i, uv.getX(i) * Math.PI * 2 * radius, uv.getY(i) * Math.PI * radius);
				}
				break;
			}
			default:
				geometry = new THREE.BoxGeometry(3, 2, 0.12);
		}
		mesh.geometry = geometry;
		mesh.material = material;
		mesh.castShadow = true;
		mesh.receiveShadow = true;
		if (!this.backing.parent) {
			this.backing.position.set(0, 0, -0.6);
			this.scene.add(this.backing);
		}
		this.scene.add(mesh);
		this.sampleMesh = mesh;
		this.binder.mapNow(mesh);
	}

	private resize(): void {
		const width = Math.max(1, this.container.clientWidth);
		const height = Math.max(1, this.container.clientHeight);
		this.renderer.setSize(width, height, false);
		this.camera.aspect = width / height;
		this.camera.updateProjectionMatrix();
	}

	private readonly animate = (): void => {
		if (this.disposed) return;
		this.frame = requestAnimationFrame(this.animate);
		this.controls.update();
		this.binder.flush();
		this.renderer.render(this.scene, this.camera);
	};
}
