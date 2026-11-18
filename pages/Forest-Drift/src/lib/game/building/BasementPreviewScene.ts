import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TerrainChunk, terrainMaterial } from '../terrain/TerrainChunk';
import { TerrainHeightSampler } from '../terrain/TerrainHeightSampler';
import { createDefaultTerrainSettings } from '../terrain/TerrainSettings';
import { TerrainHoles } from '../terrain/terrainHoles';
import type { FoundationDefinition } from './FoundationTypes';
import {
	basementDeckUndersideY,
	basementFootingBottomY,
	basementLowestFloorY,
	basementRetainingWallRects,
	foundationWorldRect
} from './basementMath';
import { computeFoundationSelection } from './foundationMath';

/**
 * Dev preview for Basements and Joined Foundations Phase 0 (`/basements/?dev`): real terrain from
 * the default world, with a basement foundation placed on it and its cells cut from the mesh.
 * Shows the derived parts (stone walls, footing, the floor between storeys, the deck) as plain
 * boxes — Phase 1 draws them properly.
 */
export class BasementPreviewScene {
	readonly foundation: FoundationDefinition;
	private readonly renderer: THREE.WebGLRenderer;
	private readonly scene = new THREE.Scene();
	private readonly camera = new THREE.PerspectiveCamera(50, 1, 0.1, 2000);
	private readonly controls: OrbitControls;
	private readonly chunks: TerrainChunk[] = [];
	private readonly holes = new TerrainHoles();
	private readonly deck: THREE.Mesh;
	private readonly parts = new THREE.Group();
	private readonly resize = () => this.fit();
	private frame = 0;
	private readonly chunkSize: number;

	constructor(private readonly host: HTMLElement) {
		const settings = createDefaultTerrainSettings();
		this.chunkSize = settings.chunkSize;
		const sampler = new TerrainHeightSampler(settings);
		const spacing = settings.chunkSize / settings.chunkResolution;

		// A 12 × 10 m, two-storey basement on whatever ground the default world has at (40, 40).
		const selection = computeFoundationSelection(
			{ gridX: 20, gridZ: 20 },
			{ gridX: 26, gridZ: 25 },
			spacing,
			(x, z) => sampler.sample(x, z),
			64,
			1
		);
		this.foundation = {
			id: 'preview',
			minGridX: selection.minGridX,
			maxGridX: selection.maxGridX,
			minGridZ: selection.minGridZ,
			maxGridZ: selection.maxGridZ,
			topY: selection.topY,
			bottomY: selection.bottomY,
			basement: { storeys: 2, storeyHeight: 3 }
		};

		this.renderer = new THREE.WebGLRenderer({ antialias: true });
		this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
		host.appendChild(this.renderer.domElement);
		this.scene.background = new THREE.Color(0x9cc4e4);
		this.scene.add(new THREE.HemisphereLight(0xdff0ff, 0x4a3b2a, 1.4));
		const sun = new THREE.DirectionalLight(0xffffff, 2.2);
		sun.position.set(40, 80, 20);
		this.scene.add(sun);

		this.holes.set([foundationWorldRect(this.foundation, spacing)]);
		// The foundation (40 … 52 m) is inside chunk (0, 0); its neighbours give the view context.
		for (let cz = -1; cz <= 1; cz++)
			for (let cx = -1; cx <= 1; cx++) {
				const chunk = new TerrainChunk(settings.chunkResolution);
				chunk.holes = this.holes;
				chunk.populate(cx, cz, settings.chunkSize, sampler, 1);
				this.scene.add(chunk.mesh);
				this.chunks.push(chunk);
			}
		this.addParts(spacing);
		this.deck = this.parts.getObjectByName('deck') as THREE.Mesh;
		this.scene.add(this.parts);

		const r = foundationWorldRect(this.foundation, spacing);
		const centre = new THREE.Vector3(
			(r.minX + r.maxX) / 2,
			this.foundation.topY - 3,
			(r.minZ + r.maxZ) / 2
		);
		this.camera.position.set(centre.x + 18, this.foundation.topY + 14, centre.z + 22);
		this.controls = new OrbitControls(this.camera, this.renderer.domElement);
		this.controls.target.copy(centre);
		this.controls.update();
		window.addEventListener('resize', this.resize);
		this.fit();
		const loop = () => {
			this.frame = requestAnimationFrame(loop);
			this.controls.update();
			this.renderer.render(this.scene, this.camera);
		};
		loop();
	}

	private addParts(spacing: number): void {
		const f = this.foundation;
		const r = foundationWorldRect(f, spacing);
		const stone = new THREE.MeshStandardMaterial({ color: 0x8d8778, roughness: 0.9 });
		const floor = new THREE.MeshStandardMaterial({ color: 0xb9ac95, roughness: 0.9 });
		const lowest = basementLowestFloorY(f)!;
		const box = (
			name: string,
			minX: number,
			maxX: number,
			minY: number,
			maxY: number,
			minZ: number,
			maxZ: number,
			material: THREE.Material
		) => {
			const mesh = new THREE.Mesh(
				new THREE.BoxGeometry(maxX - minX, maxY - minY, maxZ - minZ),
				material
			);
			mesh.position.set((minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2);
			mesh.name = name;
			this.parts.add(mesh);
		};
		box('footing', r.minX, r.maxX, basementFootingBottomY(f), lowest, r.minZ, r.maxZ, stone);
		for (const [i, w] of basementRetainingWallRects(f, spacing).entries()) {
			const along = w.dirX === 1;
			const hx = along ? w.halfLength : w.halfThickness;
			const hz = along ? w.halfThickness : w.halfLength;
			box(
				`wall-${i}`,
				w.centerX - hx,
				w.centerX + hx,
				w.minWorldY,
				w.maxWorldY,
				w.centerZ - hz,
				w.centerZ + hz,
				stone
			);
		}
		const between = f.topY - f.basement!.storeyHeight;
		box(
			'basement-floor',
			r.minX + 0.3,
			r.maxX - 0.3,
			between - 0.2,
			between,
			r.minZ + 0.3,
			r.maxZ - 0.3,
			floor
		);
		const deckMaterial = new THREE.MeshStandardMaterial({
			color: 0xd7c9a8,
			transparent: true,
			opacity: 0.35,
			depthWrite: false
		});
		box('deck', r.minX, r.maxX, basementDeckUndersideY(f), f.topY, r.minZ, r.maxZ, deckMaterial);
	}

	/** Cut (or restore) the terrain under the basement. */
	setCut(cut: boolean): void {
		this.holes.set(
			cut ? [foundationWorldRect(this.foundation, this.chunkSize / this.chunks[0].resolution)] : []
		);
		for (const chunk of this.chunks) chunk.applyHoles(this.chunkSize);
	}

	setDeckVisible(visible: boolean): void {
		this.deck.visible = visible;
	}

	setWireframe(on: boolean): void {
		terrainMaterial.wireframe = on;
	}

	holedCells(): number {
		return this.chunks.reduce((n, c) => n + c.holedCellCount, 0);
	}

	private fit(): void {
		const w = this.host.clientWidth;
		const h = this.host.clientHeight;
		this.renderer.setSize(w, h);
		this.camera.aspect = w / Math.max(1, h);
		this.camera.updateProjectionMatrix();
	}

	dispose(): void {
		cancelAnimationFrame(this.frame);
		window.removeEventListener('resize', this.resize);
		this.controls.dispose();
		for (const chunk of this.chunks) chunk.dispose();
		this.parts.traverse((o) => {
			if (o instanceof THREE.Mesh) o.geometry.dispose();
		});
		this.renderer.dispose();
		this.renderer.domElement.remove();
		terrainMaterial.wireframe = false;
	}
}
