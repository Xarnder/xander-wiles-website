import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { generateTreeCardAtlas } from './treeCardAtlas';
import {
	createTreeCardAtlasTexture,
	createTreeCardMaterial,
	createTreeMaterial,
	type TreeCardUniforms,
	type TreeWindUniforms
} from './treeMaterial';
import { TreePrototypeCache } from './TreePrototypeCache';
import { nominalTreeHeight, TREE_SPECIES } from './treeSpecies';
import { TREE_LODS, type TreeLod, type TreeSpeciesId } from './TreeSpeciesTypes';

export interface TreeLabView {
	species: readonly TreeSpeciesId[];
	worldSeed: string;
	/** `variants`: every prototype at LOD0; `lods`: prototype 0 at LOD0 → LOD3. */
	mode: 'variants' | 'lods';
	cards: boolean;
}

/**
 * Tree Lab viewer (developer tool, `/trees`): one row per species — its prototypes side by side,
 * or one prototype at every LOD — drawn with the game's own prototype cache, tree material and
 * foliage-card material and atlas, so what you tune here is exactly what the world draws.
 */
export class TreeLab {
	private readonly renderer: THREE.WebGLRenderer;
	private readonly scene = new THREE.Scene();
	private readonly camera = new THREE.PerspectiveCamera(40, 1, 0.1, 600);
	private readonly controls: OrbitControls;
	private readonly cache = new TreePrototypeCache('tree-lab');
	private readonly material: THREE.MeshLambertMaterial;
	private readonly wind: TreeWindUniforms;
	private readonly cardAtlas: THREE.DataTexture;
	private readonly cardMaterial: THREE.MeshLambertMaterial;
	private readonly cardUniforms: TreeCardUniforms;
	private readonly content = new THREE.Group();
	private readonly sun = new THREE.DirectionalLight(0xfff1dc, 2.6);
	private readonly clock = new THREE.Clock();
	private readonly observer: ResizeObserver;
	private raf = 0;
	private framed = false;

	constructor(private readonly canvas: HTMLCanvasElement) {
		this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
		this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
		this.renderer.outputColorSpace = THREE.SRGBColorSpace;
		this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
		this.renderer.shadowMap.enabled = true;
		this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
		this.scene.background = new THREE.Color(0xa9c8de);
		this.scene.fog = new THREE.Fog(0xa9c8de, 140, 420);
		this.scene.add(new THREE.HemisphereLight(0xdcecff, 0x4f5a2e, 1.5));
		this.sun.position.set(40, 70, 30);
		this.sun.castShadow = true;
		this.sun.shadow.mapSize.set(2048, 2048);
		const shadowCamera = this.sun.shadow.camera;
		shadowCamera.left = shadowCamera.bottom = -90;
		shadowCamera.right = shadowCamera.top = 90;
		shadowCamera.far = 260;
		this.scene.add(this.sun, this.sun.target);
		const ground = new THREE.Mesh(
			new THREE.PlaneGeometry(800, 800).rotateX(-Math.PI / 2),
			new THREE.MeshLambertMaterial({ color: 0x5e7a3a })
		);
		ground.receiveShadow = true;
		this.scene.add(ground, this.content);

		const { material, wind } = createTreeMaterial(3);
		this.material = material;
		this.wind = wind;
		this.cardAtlas = createTreeCardAtlasTexture(generateTreeCardAtlas());
		const cards = createTreeCardMaterial(this.cardAtlas, wind);
		this.cardMaterial = cards.material;
		this.cardUniforms = cards.uniforms;
		// Everything here is near: cards never fade, full surface detail out to the far rows.
		this.cardUniforms.uTreeCardFade.value.set(0, 0, 1e4, 2e4);
		this.wind.uTreeDetailRange.value.set(80, 160);

		this.controls = new OrbitControls(this.camera, canvas);
		this.controls.enableDamping = true;
		this.observer = new ResizeObserver(() => this.resize());
		this.observer.observe(canvas.parentElement ?? canvas);
		this.resize();
		const tick = () => {
			this.raf = requestAnimationFrame(tick);
			this.wind.uTreeTime.value += Math.min(0.1, this.clock.getDelta());
			this.controls.update();
			this.renderer.render(this.scene, this.camera);
		};
		tick();
	}

	setWind(strength: number): void {
		this.wind.uTreeWindStrength.value = strength;
		this.wind.uTreeWindLean.value = strength * 0.35;
		this.wind.uTreeWindDir.value.set(0.8, 0.6);
	}

	show(view: TreeLabView): void {
		this.clear();
		this.cache.setWorldSeed(view.worldSeed);
		let z = 0;
		let widest = 0;
		for (const speciesId of view.species) {
			const species = TREE_SPECIES[speciesId];
			const height = nominalTreeHeight(species);
			const spacing = Math.max(6, height * 0.42);
			const entries: { variant: number; lod: TreeLod }[] =
				view.mode === 'lods'
					? TREE_LODS.map((lod) => ({ variant: 0, lod }))
					: Array.from({ length: species.prototypeCount }, (_, variant) => ({ variant, lod: 0 }));
			entries.forEach(({ variant, lod }, i) => {
				const matrix = new THREE.Matrix4().makeTranslation(i * spacing, 0, z);
				const tree = new THREE.InstancedMesh(
					this.cache.getGeometry(speciesId, variant, lod),
					this.material,
					1
				);
				tree.setMatrixAt(0, matrix);
				tree.castShadow = true;
				tree.receiveShadow = true;
				this.content.add(tree);
				const cardGeometry = view.cards
					? this.cache.getCardGeometry(speciesId, variant, lod)
					: null;
				if (cardGeometry) {
					const cards = new THREE.InstancedMesh(cardGeometry, this.cardMaterial, 1);
					cards.instanceMatrix = tree.instanceMatrix;
					cards.receiveShadow = true;
					this.content.add(cards);
				}
			});
			widest = Math.max(widest, (entries.length - 1) * spacing);
			z += Math.max(8, spacing * 1.1);
		}
		if (!this.framed) {
			this.framed = true;
			this.controls.target.set(widest / 2, 6, z / 2);
			this.camera.position.set(widest / 2 - 10, 14, -Math.max(30, z * 0.75));
		}
		this.sun.target.position.set(widest / 2, 0, z / 2);
		this.sun.position.set(widest / 2 + 40, 70, z / 2 + 30);
	}

	/** Points the camera at one row (species index in the last `show`). */
	focus(row: number, rows: number): void {
		const box = new THREE.Box3().setFromObject(this.content);
		const depth = (box.max.z - box.min.z) / Math.max(1, rows);
		const z = box.min.z + depth * (row + 0.5);
		const x = (box.min.x + box.max.x) / 2;
		this.controls.target.set(x, 7, z);
		this.camera.position.set(x - 4, 9, z - Math.max(24, box.max.x - box.min.x));
	}

	private clear(): void {
		for (const child of [...this.content.children]) child.removeFromParent();
	}

	private resize(): void {
		const parent = this.canvas.parentElement ?? this.canvas;
		const width = Math.max(1, parent.clientWidth);
		const height = Math.max(1, parent.clientHeight);
		this.renderer.setSize(width, height, false);
		this.camera.aspect = width / height;
		this.camera.updateProjectionMatrix();
	}

	dispose(): void {
		cancelAnimationFrame(this.raf);
		this.observer.disconnect();
		this.controls.dispose();
		this.clear();
		this.cache.dispose();
		this.material.dispose();
		this.cardMaterial.dispose();
		this.cardAtlas.dispose();
		this.renderer.dispose();
	}
}
