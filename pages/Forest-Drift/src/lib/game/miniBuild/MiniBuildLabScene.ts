import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { BuildingMaterialManager } from '../building/BuildingMaterialManager';
import { ProceduralMaterialLibrary } from '../materials/ProceduralMaterialLibrary';
import { createMiniBuildAsset, type CompiledMiniBuildAsset } from './MiniBuildAsset';
import { compileMiniBuildData } from './MiniBuildCompiler';
import { resolveMiniBuildMaterial } from './MiniBuildSystem';
import type { MiniBuildDefinition } from './MiniBuildTypes';

export type MiniBuildLabView = 'three-quarter' | 'front' | 'side' | 'top' | 'back';

const VIEW_DIRECTIONS: Record<MiniBuildLabView, THREE.Vector3> = {
	'three-quarter': new THREE.Vector3(0.85, 0.62, 1),
	front: new THREE.Vector3(0, 0.25, 1),
	side: new THREE.Vector3(1, 0.25, 0),
	top: new THREE.Vector3(0.001, 1, 0.35),
	back: new THREE.Vector3(-0.7, 0.55, -1)
};

/** Gap between designs on the lab floor, in metres. */
const GAP = 0.7;
const ROW_WIDTH = 7.5;

interface LabItem {
	definition: MiniBuildDefinition;
	asset: CompiledMiniBuildAsset;
	group: THREE.Group;
}

/**
 * The development Mini Build lab (`/mini-builds/`): every design laid out on a floor under game-like
 * light, drawn with exactly the world's geometry (the compiler) and materials (`resolveMiniBuildMaterial`
 * through a procedural library), so stock furniture can be reviewed without opening a world.
 */
export class MiniBuildLabScene {
	private readonly renderer: THREE.WebGLRenderer;
	private readonly scene = new THREE.Scene();
	private readonly camera = new THREE.PerspectiveCamera(32, 1, 0.02, 80);
	private readonly controls: OrbitControls;
	private readonly library: ProceduralMaterialLibrary;
	private readonly materials: BuildingMaterialManager;
	private readonly items: LabItem[] = [];
	private readonly floor: THREE.Mesh;
	private readonly sun: THREE.DirectionalLight;
	private readonly resizeObserver: ResizeObserver;
	private frame = 0;
	private disposed = false;

	constructor(
		private readonly container: HTMLElement,
		definitions: readonly MiniBuildDefinition[],
		options: { procedural?: boolean } = {}
	) {
		this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
		this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
		this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
		this.renderer.outputColorSpace = THREE.SRGBColorSpace;
		this.renderer.shadowMap.enabled = true;
		this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
		container.appendChild(this.renderer.domElement);

		const pmrem = new THREE.PMREMGenerator(this.renderer);
		this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
		this.scene.environmentIntensity = 0.5;
		this.scene.background = new THREE.Color(0x2a3236);
		pmrem.dispose();

		this.scene.add(new THREE.HemisphereLight(0xeef0ea, 0x4f5a2e, 0.7));
		this.sun = new THREE.DirectionalLight(0xfff1d6, 2.4);
		this.sun.castShadow = true;
		this.sun.shadow.mapSize.set(4096, 4096);
		this.sun.shadow.bias = -0.0004;
		this.sun.shadow.normalBias = 0.01;
		this.scene.add(this.sun, this.sun.target);

		this.floor = new THREE.Mesh(
			new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
			new THREE.MeshStandardMaterial({ color: 0x5d5245, roughness: 0.95 })
		);
		this.floor.receiveShadow = true;
		this.scene.add(this.floor);

		this.controls = new OrbitControls(this.camera, this.renderer.domElement);
		this.controls.enableDamping = true;

		this.library = new ProceduralMaterialLibrary({
			quality: 'high',
			relief: true,
			enabled: options.procedural ?? true,
			anisotropy: Math.min(8, this.renderer.capabilities.getMaxAnisotropy())
		});
		this.materials = new BuildingMaterialManager(undefined, this.library);

		this.layout(definitions);
		this.resizeObserver = new ResizeObserver(() => this.resize());
		this.resizeObserver.observe(container);
		this.resize();
		this.focus(null);
		this.animate();
	}

	/** Resolves once every procedural texture the designs asked for has been generated. */
	whenReady(): Promise<void> {
		return this.library.whenIdle();
	}

	setProcedural(enabled: boolean): void {
		this.library.setEnabled(enabled);
	}

	/** Frames one design (by id, shown alone) from `view`, or the whole floor when `id` is null. */
	focus(id: string | null, view: MiniBuildLabView = 'three-quarter'): void {
		const box = new THREE.Box3();
		const item = id ? this.items.find((entry) => entry.definition.id === id) : undefined;
		for (const entry of this.items) entry.group.visible = !item || entry === item;
		if (item) box.setFromObject(item.group);
		else for (const entry of this.items) box.expandByObject(entry.group);
		if (box.isEmpty()) return;
		const center = box.getCenter(new THREE.Vector3());
		const radius = Math.max(0.3, box.getSize(new THREE.Vector3()).length() / 2);
		const fit = item ? 1.08 : 0.82;
		const distance = (radius / Math.sin((this.camera.fov * Math.PI) / 360)) * fit;
		const direction = VIEW_DIRECTIONS[view].clone().normalize();
		this.camera.position.copy(center).addScaledVector(direction, distance);
		this.camera.near = Math.max(0.02, distance - radius * 3);
		this.camera.far = distance + radius * 4;
		this.camera.updateProjectionMatrix();
		this.controls.target.copy(center);
		this.controls.update();
	}

	dispose(): void {
		this.disposed = true;
		cancelAnimationFrame(this.frame);
		this.resizeObserver.disconnect();
		this.controls.dispose();
		for (const item of this.items) item.asset.dispose();
		this.library.dispose();
		this.floor.geometry.dispose();
		(this.floor.material as THREE.Material).dispose();
		this.renderer.dispose();
		this.renderer.domElement.remove();
	}

	/** Rows of designs left to right, front row nearest the camera, each sitting on the floor. */
	private layout(definitions: readonly MiniBuildDefinition[]): void {
		let x = 0;
		let z = 0;
		let rowDepth = 0;
		for (const definition of definitions) {
			const asset = createMiniBuildAsset(definition.id, compileMiniBuildData(definition));
			const size = asset.bounds.getSize(new THREE.Vector3());
			if (x > 0 && x + size.x > ROW_WIDTH) {
				x = 0;
				z -= rowDepth + GAP;
				rowDepth = 0;
			}
			const group = new THREE.Group();
			group.name = definition.id;
			for (const entry of asset.geometries) {
				const slot = definition.materials[entry.materialSlot];
				const mesh = new THREE.Mesh(entry.geometry, resolveMiniBuildMaterial(this.materials, slot));
				mesh.castShadow = true;
				mesh.receiveShadow = true;
				group.add(mesh);
			}
			group.position.set(x - asset.bounds.min.x, 0, z - asset.bounds.max.z);
			this.scene.add(group);
			this.items.push({ definition, asset, group });
			x += size.x + GAP;
			rowDepth = Math.max(rowDepth, size.z);
		}
		const all = new THREE.Box3();
		for (const item of this.items) all.expandByObject(item.group);
		const center = all.getCenter(new THREE.Vector3());
		const extent = all.getSize(new THREE.Vector3()).length() + 4;
		this.floor.scale.set(extent, 1, extent);
		this.floor.position.set(center.x, 0, center.z);
		this.sun.position.set(center.x + 4, 7, center.z + 5);
		this.sun.target.position.copy(center);
		const shadow = this.sun.shadow.camera;
		shadow.left = shadow.bottom = -extent / 2;
		shadow.right = shadow.top = extent / 2;
		shadow.far = 30;
		shadow.updateProjectionMatrix();
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
		this.renderer.render(this.scene, this.camera);
	};
}
