import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { buildFloorDetailGeometry } from '../../building/FloorDetailGeometryBuilder';
import type { FloorDetailBox } from '../../building/FloorDetailTypes';
import { ProceduralMaterialLibrary } from '../ProceduralMaterialLibrary';
import type { MaterialQuality } from '../ProceduralMaterialTypes';
import { SurfaceMappingBinder } from '../SurfaceMappingBinder';
import { FLOOR_DETAIL_WOOD_STYLE } from '../buildingSurfaceStyles';
import {
	applySolidWoodShader,
	createWoodUniforms,
	setWoodUniforms,
	WOOD_FINISHES,
	WOOD_GENERA,
	WOOD_GENUS_PRESETS,
	type WoodFinish,
	type WoodShaderQuality
} from '../shader/woodShader';

export type WoodTestView = 'boards' | 'frame';
export const WOOD_TEST_VIEWS: readonly WoodTestView[] = ['boards', 'frame'];
const FINISHES = Object.keys(WOOD_FINISHES) as WoodFinish[];

/**
 * Development scene for the solid wood shader (`/materials/wood`).
 *
 * - `boards` recreates https://threejs.org/examples/webgpu_tsl_wood.html — every genus preset in a
 *   row, one column per finish, on the example's 0.125 × 0.9 × 0.9 rounded boards with the log
 *   centre placed the same way — so the port can be compared with the original side by side.
 * - `frame` shows the game's own timber at game scale: a framed wall bay (posts, beams, a brace,
 *   window frame) wearing the structural-timber material through the real binder, and a plank floor
 *   and path rails built by the real floor-detail geometry builder.
 */
export class WoodTestScene {
	private readonly renderer: THREE.WebGLRenderer;
	private readonly scene = new THREE.Scene();
	private readonly camera = new THREE.PerspectiveCamera(40, 1, 0.05, 200);
	private readonly controls: OrbitControls;
	private readonly binder = new SurfaceMappingBinder({
		getFoundationOrigin: () => null,
		getWorldSeed: () => 'wood-test'
	});
	private readonly library: ProceduralMaterialLibrary;
	private readonly boards = new THREE.Group();
	private readonly frame = new THREE.Group();
	private readonly boardMaterials: THREE.MeshStandardMaterial[] = [];
	private frameRoot: THREE.Group | null = null;
	private quality: WoodShaderQuality = 2;
	private animationFrame = 0;
	private readonly resizeObserver: ResizeObserver;

	constructor(
		private readonly container: HTMLElement,
		options: { quality?: MaterialQuality } = {}
	) {
		this.renderer = new THREE.WebGLRenderer({ antialias: true });
		this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
		this.renderer.outputColorSpace = THREE.SRGBColorSpace;
		this.renderer.shadowMap.enabled = true;
		container.appendChild(this.renderer.domElement);

		const pmrem = new THREE.PMREMGenerator(this.renderer);
		this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
		pmrem.dispose();
		this.scene.background = new THREE.Color(0x30353a);

		const sun = new THREE.DirectionalLight(0xfff1d6, 2.2);
		sun.position.set(4, 6, 5);
		sun.castShadow = true;
		sun.shadow.mapSize.set(2048, 2048);
		sun.shadow.camera.left = -8;
		sun.shadow.camera.right = 8;
		sun.shadow.camera.top = 8;
		sun.shadow.camera.bottom = -8;
		this.scene.add(sun, new THREE.HemisphereLight(0xeef0ea, 0x4f5a2e, 0.5));

		this.controls = new OrbitControls(this.camera, this.renderer.domElement);
		this.controls.enableDamping = true;

		this.library = new ProceduralMaterialLibrary({
			binder: this.binder,
			quality: options.quality ?? 'high'
		});
		this.quality = shaderQuality(options.quality ?? 'high');

		this.buildBoards();
		this.buildFrame();
		this.scene.add(this.boards, this.frame);
		this.setView('boards');

		this.resizeObserver = new ResizeObserver(() => this.resize());
		this.resizeObserver.observe(container);
		this.resize();
		this.animate();
	}

	setView(view: WoodTestView): void {
		this.boards.visible = view === 'boards';
		this.frame.visible = view === 'frame';
		if (view === 'boards') {
			// The example's look: neutral tone mapping, bright environment.
			this.renderer.toneMapping = THREE.NeutralToneMapping;
			this.scene.environmentIntensity = 1;
			this.camera.position.set(0, 0, 9.5);
			this.controls.target.set(0, 0, 0);
		} else {
			// The game's look: ACES, a dim environment.
			this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
			this.scene.environmentIntensity = 0.45;
			this.camera.position.set(2.2, 1.9, 3.4);
			this.controls.target.set(0, 1.1, 0);
		}
		this.controls.update();
	}

	setQuality(quality: MaterialQuality): void {
		this.quality = shaderQuality(quality);
		this.library.setQuality(quality);
		for (const material of this.boardMaterials) {
			applySolidWoodShader(material, material.userData.woodUniforms, this.quality);
		}
	}

	dispose(): void {
		cancelAnimationFrame(this.animationFrame);
		this.resizeObserver.disconnect();
		this.controls.dispose();
		this.scene.traverse((object) => {
			const mesh = object as THREE.Mesh;
			if (mesh.isMesh) mesh.geometry.dispose();
		});
		for (const material of this.boardMaterials) material.dispose();
		this.library.dispose();
		this.binder.dispose();
		this.renderer.dispose();
		this.renderer.domElement.remove();
	}

	private buildBoards(): void {
		const geometry = new RoundedBoxGeometry(0.125, 0.9, 0.9, 10, 0.02);
		const spacingX = 1.0;
		const spacingY = 1.0;
		WOOD_GENERA.forEach((genus, row) => {
			FINISHES.forEach((finish, column) => {
				const uniforms = createWoodUniforms();
				setWoodUniforms(uniforms, WOOD_GENUS_PRESETS[genus], { finish, scale: 1 });
				const material = new THREE.MeshStandardMaterial({
					roughness: WOOD_FINISHES[finish].roughness,
					metalness: 0
				});
				material.userData.woodUniforms = uniforms;
				applySolidWoodShader(material, uniforms, this.quality);
				this.boardMaterials.push(material);
				const board = geometry.clone();
				// The example's transform: log centre 0.1 off the board, a random slide along the log.
				const offsetZ = Math.sin((row * 4 + column) * 12.9898) * 43758.5453;
				const woodOffset = new THREE.Vector3(-0.1, 0, (offsetZ - Math.floor(offsetZ)) * 100);
				const position = board.getAttribute('position');
				const coords = new Float32Array(position.count * 3);
				for (let i = 0; i < position.count; i++) {
					coords[i * 3] = position.getX(i) + woodOffset.x;
					coords[i * 3 + 1] = position.getY(i) + woodOffset.y;
					coords[i * 3 + 2] = position.getZ(i) + woodOffset.z;
				}
				board.setAttribute('woodCoord', new THREE.BufferAttribute(coords, 3));
				const mesh = new THREE.Mesh(board, material);
				mesh.rotation.y = Math.PI / 2;
				// Genus columns, finish rows (the example's layout, transposed to fit a wide screen).
				mesh.position.set(
					(row - (WOOD_GENERA.length - 1) / 2) * spacingX,
					((FINISHES.length - 1) / 2 - column) * spacingY,
					0
				);
				this.boards.add(mesh);
			});
		});
		geometry.dispose();
	}

	private buildFrame(): void {
		const timber = new THREE.MeshStandardMaterial({ flatShading: true });
		this.library.bindMaterial(timber, {
			type: 'timber',
			options: { variant: 'dark-oak' },
			mapping: 'wood'
		});
		const root = new THREE.Group();
		const parts: THREE.BufferGeometry[] = [];
		const box = (sx: number, sy: number, sz: number, x: number, y: number, z: number) => {
			const g = new THREE.BoxGeometry(sx, sy, sz);
			g.translate(x, y, z);
			parts.push(g);
		};
		// Posts, sill, head beam, mid rail.
		box(0.2, 2.6, 0.2, -1.2, 1.3, 0);
		box(0.2, 2.6, 0.2, 1.2, 1.3, 0);
		box(2.2, 0.2, 0.2, 0, 0.1, 0);
		box(2.8, 0.22, 0.24, 0, 2.71, 0);
		box(2.2, 0.16, 0.16, 0, 1.2, 0);
		// A brace across the lower bay.
		const brace = new THREE.BoxGeometry(Math.hypot(2.2, 0.92) - 0.1, 0.14, 0.14);
		brace.rotateZ(Math.atan2(0.92, 2.2));
		brace.translate(0, 0.66, 0);
		parts.push(brace);
		for (const geometry of parts) {
			const mesh = new THREE.Mesh(geometry, timber);
			mesh.castShadow = true;
			mesh.receiveShadow = true;
			root.add(mesh);
		}
		// Window frame in the upper bay.
		const win = new THREE.Group();
		for (const [sx, sy, x, y] of [
			[1.2, 0.08, 0, 2.3],
			[1.2, 0.08, 0, 1.6],
			[0.08, 0.78, -0.56, 1.95],
			[0.08, 0.78, 0.56, 1.95]
		] as const) {
			const g = new THREE.BoxGeometry(sx, sy, 0.12);
			g.translate(x, y, 0.02);
			win.add(new THREE.Mesh(g, timber));
		}
		root.add(win);

		// Floor details: planks and a framed path, from the real builder, on the real wood material.
		const floorFlat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72 });
		const floorWood = floorFlat.clone();
		this.library.bindMaterial(floorWood, FLOOR_DETAIL_WOOD_STYLE, { ownWoodCoords: true });
		const planks: FloorDetailBox[] = [];
		for (let row = 0; row < 8; row++) {
			let x = -1.6 + (row % 3) * 0.3;
			let board = 0;
			while (x < 1.6) {
				const end = Math.min(1.6, x + 0.9 + ((row + board) % 3) * 0.3);
				planks.push({
					minX: Math.max(-1.6, x),
					maxX: end - 0.006,
					minY: 0,
					maxY: 0.03,
					minZ: 0.25 + row * 0.18,
					maxZ: 0.25 + row * 0.18 + 0.174,
					color: (row + board) % 2 ? '#432A1C' : '#3A2418',
					wood: { grain: 'x', seed: row * 31 + board }
				});
				x = end;
				board++;
			}
		}
		const rails: FloorDetailBox[] = [-1, 1].map((side) => ({
			minX: side * 1.9 - 0.05,
			maxX: side * 1.9 + 0.05,
			minY: 0,
			maxY: 0.08,
			minZ: 0.25,
			maxZ: 1.7,
			color: '#5C4632',
			wood: { grain: 'z' as const, seed: side + 5 }
		}));
		const floor = new THREE.Mesh(buildFloorDetailGeometry([...planks, ...rails]), [
			floorFlat,
			floorWood
		]);
		floor.receiveShadow = true;
		root.add(floor);

		const ground = new THREE.Mesh(
			new THREE.PlaneGeometry(12, 12).rotateX(-Math.PI / 2),
			new THREE.MeshStandardMaterial({ color: 0x5f6b45, roughness: 1 })
		);
		ground.position.y = -0.001;
		ground.receiveShadow = true;
		root.add(ground);
		this.frame.add(root);
		this.frameRoot = root;
		this.binder.mapNow(root);
	}

	private resize(): void {
		const width = Math.max(1, this.container.clientWidth);
		const height = Math.max(1, this.container.clientHeight);
		this.renderer.setSize(width, height, false);
		this.camera.aspect = width / height;
		this.camera.updateProjectionMatrix();
	}

	private readonly animate = (): void => {
		this.animationFrame = requestAnimationFrame(this.animate);
		this.controls.update();
		if (this.frameRoot) this.binder.flush();
		this.renderer.render(this.scene, this.camera);
	};
}

function shaderQuality(quality: MaterialQuality): WoodShaderQuality {
	return quality === 'low' ? 0 : quality === 'medium' ? 1 : 2;
}
