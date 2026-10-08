import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { BuildingMaterialManager } from '../../building/BuildingMaterialManager';
import { terrainColorOptions, writeTerrainColor } from '../../terrain/terrainColor';
import { TERRAIN_SURFACE_STYLE } from '../buildingSurfaceStyles';
import { ProceduralMaterialLibrary } from '../ProceduralMaterialLibrary';
import type { MaterialQuality } from '../ProceduralMaterialTypes';
import { SurfaceMappingBinder } from '../SurfaceMappingBinder';

export type AntiTilingView =
	'wall-wide' | 'wall-close' | 'courtyard-wide' | 'courtyard-close' | 'field-wide' | 'field-close';

export const ANTI_TILING_VIEWS: readonly AntiTilingView[] = [
	'wall-wide',
	'wall-close',
	'courtyard-wide',
	'courtyard-close',
	'field-wide',
	'field-close'
];

/** Fixed camera poses (position, look-at) — identical every run so screenshots compare 1:1. */
const VIEWS: Record<
	AntiTilingView,
	{ position: [number, number, number]; target: [number, number, number] }
> = {
	'wall-wide': { position: [-14, 2.2, 16], target: [12, 1.4, 0] },
	'wall-close': { position: [-3, 1.5, 4.2], target: [1, 1.2, 0.3] },
	'courtyard-wide': { position: [-24, 9, 70], target: [0, 0, 40] },
	'courtyard-close': { position: [2, 2.6, 34], target: [4, 0.5, 29] },
	'field-wide': { position: [-90, 16, -40], target: [40, 0, -120] },
	'field-close': { position: [-40, 3, -40], target: [-34, 0, -48] }
};

/**
 * A fixed test scene for judging texture repetition, independent of any world: a 60 m masonry wall,
 * a 40 × 40 m paved courtyard (with masonry sides), and a 300 m grass field, lit like the game.
 * Surfaces use the SAME material kinds the game does (`BuildingMaterialManager` + the terrain detail
 * style), so what's judged here is exactly what ships. `setAntiTiling(false)` switches to the
 * original repeated texture tiles for side-by-side comparison.
 */
export class AntiTilingTestScene {
	private readonly renderer: THREE.WebGLRenderer;
	private readonly scene = new THREE.Scene();
	private readonly camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1500);
	private readonly binder = new SurfaceMappingBinder({
		getFoundationOrigin: () => null,
		getWorldSeed: () => 'anti-tiling-test'
	});
	private readonly library: ProceduralMaterialLibrary;
	private readonly materials: BuildingMaterialManager;
	private readonly terrainMaterial = new THREE.MeshStandardMaterial({
		vertexColors: true,
		roughness: 0.95
	});
	private readonly disposables: { dispose(): void }[] = [];
	private frame = 0;
	private disposed = false;
	private readonly resizeObserver: ResizeObserver;

	constructor(
		private readonly container: HTMLElement,
		options: { antiTiling: boolean; quality: MaterialQuality }
	) {
		this.renderer = new THREE.WebGLRenderer({ antialias: true });
		this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
		this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
		this.renderer.outputColorSpace = THREE.SRGBColorSpace;
		this.renderer.shadowMap.enabled = true;
		this.renderer.shadowMap.type = THREE.PCFShadowMap;
		container.appendChild(this.renderer.domElement);

		const pmrem = new THREE.PMREMGenerator(this.renderer);
		this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
		this.scene.environmentIntensity = 0.35;
		pmrem.dispose();
		this.scene.background = new THREE.Color(0xbcd6e6);
		this.scene.fog = new THREE.Fog(0xcfe0ea, 160, 700);
		this.scene.add(new THREE.HemisphereLight(0xeaeeee, 0x4f5a2e, 0.7));
		const sun = new THREE.DirectionalLight(0xfff1d6, 1.9);
		sun.position.set(40, 60, 30);
		sun.castShadow = true;
		sun.shadow.mapSize.set(2048, 2048);
		Object.assign(sun.shadow.camera, { left: -80, right: 80, top: 80, bottom: -80, far: 300 });
		this.scene.add(sun);

		terrainColorOptions.groundVariation = true;
		this.library = new ProceduralMaterialLibrary({
			binder: this.binder,
			// An inspection tool: always show surface relief (the game enables it at Ultra).
			relief: true,
			quality: options.quality,
			antiTiling: options.antiTiling,
			anisotropy: Math.min(8, this.renderer.capabilities.getMaxAnisotropy())
		});
		this.materials = new BuildingMaterialManager(undefined, this.library);
		this.library.bindMaterial(this.terrainMaterial, TERRAIN_SURFACE_STYLE, {
			detail: true,
			uvUnitMeters: 1
		});
		this.build();

		this.resizeObserver = new ResizeObserver(() => this.resize());
		this.resizeObserver.observe(container);
		this.resize();
		this.setView('wall-wide');
		this.animate();
	}

	setView(view: AntiTilingView): void {
		const pose = VIEWS[view];
		this.camera.position.set(...pose.position);
		this.camera.lookAt(...pose.target);
	}

	setAntiTiling(enabled: boolean): void {
		this.library.setAntiTiling(enabled);
	}

	setQuality(quality: MaterialQuality): void {
		this.library.setQuality(quality);
	}

	/** Resolves once all textures are generated, applied and every surface is mapped. */
	async ready(): Promise<void> {
		await this.library.whenIdle();
		this.binder.mapNow(this.scene);
		await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
	}

	dispose(): void {
		this.disposed = true;
		cancelAnimationFrame(this.frame);
		this.resizeObserver.disconnect();
		for (const item of this.disposables) item.dispose();
		this.materials.dispose();
		this.library.dispose();
		this.binder.dispose();
		this.terrainMaterial.dispose();
		this.renderer.dispose();
		this.renderer.domElement.remove();
	}

	private build(): void {
		// Long retaining-style wall: masonry on every face.
		const wall = new THREE.Mesh(
			new THREE.BoxGeometry(60, 3, 0.6),
			this.materials.getMaterial('foundation', undefined)
		);
		wall.position.set(18, 1.5, 0);
		this.add(wall);

		// Courtyard: a foundation-like slab — paving on top, masonry on its sides.
		const courtyard = new THREE.Mesh(
			new THREE.BoxGeometry(40, 0.8, 40),
			this.materials.getFoundationMaterials(undefined)
		);
		courtyard.position.set(4, 0.4, 40);
		this.add(courtyard);

		// Grass field: terrain-style vertex colours (with ground variation) + the terrain detail style.
		const size = 300;
		const segments = 150;
		const field = new THREE.PlaneGeometry(size, size, segments, segments);
		field.rotateX(-Math.PI / 2);
		const position = field.getAttribute('position');
		const colors = new Float32Array(position.count * 3);
		const uv = field.getAttribute('uv') as THREE.BufferAttribute;
		for (let i = 0; i < position.count; i++) {
			const x = position.getX(i);
			const z = position.getZ(i);
			writeTerrainColor(2, 1, colors, i * 3, x, z);
			uv.setXY(i, x, z); // native UVs in metres
		}
		field.setAttribute('color', new THREE.BufferAttribute(colors, 3));
		const ground = new THREE.Mesh(field, this.terrainMaterial);
		ground.position.y = -0.02;
		ground.receiveShadow = true;
		this.scene.add(ground);
		this.disposables.push(field);
	}

	private add(mesh: THREE.Mesh): void {
		mesh.castShadow = true;
		mesh.receiveShadow = true;
		this.scene.add(mesh);
		this.disposables.push(mesh.geometry);
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
		this.binder.flush();
		this.renderer.render(this.scene, this.camera);
	};
}
