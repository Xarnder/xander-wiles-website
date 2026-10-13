import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { generatePlantAtlas } from './plantAtlas';
import {
	createPlantAtlasTexture,
	createPlantCardTemplate,
	createPlantMaterials,
	createPlantUniforms
} from './plantMaterial';
import { buildPlantPrototype } from './plantPrototype';
import { PLANT_SIZE_RANGE } from './plantPlacement';
import type { PlantSpeciesDefinition } from './PlantTypes';

/**
 * Plant Lab viewer (developer tool, `/plants`): each species is a row — its 2–4 near prototypes as
 * real geometry, then the far card the same plant becomes — using the game's own materials and
 * atlas, so what you tune here is exactly what the world draws.
 */
export class PlantLab {
	private readonly renderer: THREE.WebGLRenderer;
	private readonly scene = new THREE.Scene();
	private readonly camera = new THREE.PerspectiveCamera(35, 1, 0.02, 200);
	private readonly controls: OrbitControls;
	private readonly uniforms = createPlantUniforms();
	private readonly atlasTexture: THREE.DataTexture;
	private readonly materials: ReturnType<typeof createPlantMaterials>;
	private readonly content = new THREE.Group();
	private readonly clock = new THREE.Clock();
	private raf = 0;
	private readonly observer: ResizeObserver;

	constructor(private readonly canvas: HTMLCanvasElement) {
		this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
		this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
		this.renderer.outputColorSpace = THREE.SRGBColorSpace;
		this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
		this.scene.background = new THREE.Color(0xbfd7e6);
		this.scene.add(new THREE.HemisphereLight(0xeaf4ff, 0x4f5a2e, 1.6));
		const sun = new THREE.DirectionalLight(0xfff1dc, 2.4);
		sun.position.set(3, 6, 4);
		this.scene.add(sun);
		const ground = new THREE.Mesh(
			new THREE.PlaneGeometry(60, 60).rotateX(-Math.PI / 2),
			new THREE.MeshLambertMaterial({ color: 0x5e7a3a })
		);
		ground.position.y = -0.002;
		this.scene.add(ground, this.content);
		this.atlasTexture = createPlantAtlasTexture(generatePlantAtlas(64));
		this.materials = createPlantMaterials(this.atlasTexture, this.uniforms);
		// Everything here is "near": geometry always on, cards always on (no crossfade).
		this.uniforms.uPlantLod.value.set(1000, 1000, 1000, 2000);
		this.uniforms.uPlantMisc.value.x = 0.0001;
		this.uniforms.uPlantWind.value.set(0.7, 0.7, 0.35, 0.05);
		this.controls = new OrbitControls(this.camera, canvas);
		this.controls.target.set(1.2, 0.15, 1.5);
		this.camera.position.set(1.2, 1.5, -1.6);
		this.controls.update();
		this.observer = new ResizeObserver(() => this.resize());
		this.observer.observe(canvas.parentElement ?? canvas);
		this.resize();
		const tick = () => {
			this.raf = requestAnimationFrame(tick);
			this.uniforms.uPlantTime.value += this.clock.getDelta();
			this.controls.update();
			this.renderer.render(this.scene, this.camera);
		};
		tick();
	}

	/** Shows one row per species: prototypes left to right, then its far card. */
	showSpecies(species: readonly PlantSpeciesDefinition[]): void {
		for (const child of [...this.content.children]) {
			child.removeFromParent();
			(child as THREE.Mesh).geometry?.dispose();
		}
		let z = 0;
		const template = createPlantCardTemplate();
		for (const s of species) {
			const rowSpacing = Math.max(0.35, s.structure.radius * 2.4);
			let x = 0;
			for (let variant = 0; variant < s.prototypeCount; variant++) {
				const g = buildPlantPrototype(s, variant);
				const geometry = new THREE.InstancedBufferGeometry();
				geometry.setAttribute('position', new THREE.BufferAttribute(g.positions, 3));
				geometry.setAttribute('normal', new THREE.BufferAttribute(g.normals, 3));
				geometry.setAttribute('uv', new THREE.BufferAttribute(g.uvs, 2));
				geometry.setAttribute('aColorA', new THREE.BufferAttribute(g.colors, 3));
				geometry.setAttribute('aColorB', new THREE.BufferAttribute(g.colors2, 3));
				geometry.setAttribute('aPlant', new THREE.BufferAttribute(g.plant, 4));
				geometry.setIndex(new THREE.BufferAttribute(g.indices, 1));
				geometry.setAttribute(
					'aPlantRoot',
					new THREE.InstancedBufferAttribute(new Float32Array([x, 0, z]), 3)
				);
				geometry.setAttribute(
					'aPlantInst',
					new THREE.InstancedBufferAttribute(new Uint8Array([128, 40, 128, 60]), 4, true)
				);
				geometry.instanceCount = 1;
				const mesh = new THREE.Mesh(geometry, this.materials.near);
				mesh.frustumCulled = false;
				this.content.add(mesh);
				x += Math.max(0.3, s.structure.radius * 2.2);
			}
			// The far card for the same species.
			const height = (s.structure.height[0] + s.structure.height[1]) / 2;
			const width = Math.max(height * 0.6, s.structure.radius * 2);
			const card = new THREE.InstancedBufferGeometry();
			card.setAttribute('position', new THREE.BufferAttribute(template.position, 3));
			card.setAttribute('normal', new THREE.BufferAttribute(template.normal, 3));
			card.setAttribute('uv', new THREE.BufferAttribute(template.uv, 2));
			card.setIndex(new THREE.BufferAttribute(template.index, 1));
			const byte = (v: number) => Math.round(Math.sqrt(Math.min(1, Math.max(0, v))) * 255);
			const p = s.palette;
			card.setAttribute(
				'aPlantRoot',
				new THREE.InstancedBufferAttribute(new Float32Array([x + 0.25, 0, z]), 3)
			);
			card.setAttribute(
				'aCardShape',
				new THREE.InstancedBufferAttribute(
					new Uint8Array([
						Math.round((height / PLANT_SIZE_RANGE) * 255),
						Math.round((width / PLANT_SIZE_RANGE) * 255),
						0,
						0
					]),
					4,
					true
				)
			);
			card.setAttribute(
				'aCardPetal',
				new THREE.InstancedBufferAttribute(
					new Uint8Array([
						byte(p.petalBase[0]),
						byte(p.petalBase[1]),
						byte(p.petalBase[2]),
						s.lod.impostorTile
					]),
					4,
					true
				)
			);
			card.setAttribute(
				'aCardCentre',
				new THREE.InstancedBufferAttribute(
					new Uint8Array([byte(p.centre[0]), byte(p.centre[1]), byte(p.centre[2]), 0]),
					4,
					true
				)
			);
			card.setAttribute(
				'aCardLeaf',
				new THREE.InstancedBufferAttribute(
					new Uint8Array([byte(p.leafBase[0]), byte(p.leafBase[1]), byte(p.leafBase[2]), 0x8f]),
					4,
					true
				)
			);
			card.instanceCount = 1;
			const cardMesh = new THREE.Mesh(card, this.materials.card);
			cardMesh.frustumCulled = false;
			this.content.add(cardMesh);
			z += rowSpacing;
		}
		this.controls.target.set(0.9, 0.15, z / 2);
		this.camera.position.set(0.9 + z * 0.25, Math.max(1.2, z * 0.55), -z * 0.35 - 0.8);
		this.controls.update();
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
		this.showSpecies([]);
		this.materials.near.dispose();
		this.materials.card.dispose();
		this.atlasTexture.dispose();
		this.renderer.dispose();
	}
}
