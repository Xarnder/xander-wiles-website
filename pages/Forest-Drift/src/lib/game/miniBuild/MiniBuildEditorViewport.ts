import * as THREE from 'three';
import {
	clampBlockSize,
	resizeBlockLocal,
	turnBlock,
	withGridTransform,
	type EditorResult,
	type MiniBuildEditorState
} from './MiniBuildEditorState';
import {
	anchorGrid,
	AXES,
	blockBox,
	blockCenterGrid,
	blockExtentBox,
	computeBounds,
	effectiveSize,
	gridToMeters,
	isAngledBlock,
	orientationMatrix,
	snapAngle,
	snapCosSin,
	type Axis
} from './miniBuildGrid';
import { compileMiniBuildData } from './MiniBuildCompiler';
import { surfaceOffsetLevels } from './miniBuildSurfaces';
import { miniBuildSurfaceStyle } from './miniBuildTextures';
import type { ProceduralMaterialLibrary } from '../materials/ProceduralMaterialLibrary';
import {
	MINI_BUILD_LIMITS,
	MINI_BUILD_SCHEMA_VERSION,
	type GridVec3,
	type MiniBuildBlock,
	type MiniBuildFinish,
	type SnapAngle
} from './MiniBuildTypes';

const BACKGROUND = 0x262b2e;
const SELECT_COLOR = 0xffd166;
const INVALID_COLOR = 0xf85149;
const AXIS_COLORS: Record<Axis, number> = { x: 0xe5534b, y: 0x57ab5a, z: 0x539bf5 };
const DRAG_THRESHOLD_PX = 4;

const FINISH_LOOK: Record<
	MiniBuildFinish,
	{ roughness: number; metalness: number; opacity?: number }
> = {
	wood: { roughness: 0.8, metalness: 0 },
	fabric: { roughness: 0.95, metalness: 0 },
	metal: { roughness: 0.4, metalness: 0.45 },
	stone: { roughness: 0.9, metalness: 0 },
	glass: { roughness: 0.1, metalness: 0, opacity: 0.45 },
	plain: { roughness: 0.7, metalness: 0 }
};

type HandleKind = 'move' | 'resize-max' | 'resize-min' | 'rotate';

interface DragState {
	kind: HandleKind;
	/** World axis for move handles and grid blocks; the block's own axis for an angled block's resize. */
	axis: Axis;
	blockId: string;
	block: MiniBuildBlock;
	startPosition: GridVec3;
	startSize: GridVec3;
	origin: THREE.Vector3;
	direction: THREE.Vector3;
	startT: number;
	lastPosition: GridVec3;
	lastSize: GridVec3;
	/** Rotation ring drags: the plane's in-plane basis, and the unwrapped pointer angle. */
	ringU?: THREE.Vector3;
	ringV?: THREE.Vector3;
	lastPhi?: number;
	turned?: number;
	startAngle?: SnapAngle;
	lastAngle?: SnapAngle;
	valid: boolean;
}

export interface MiniBuildEditorViewportCallbacks {
	getState: () => MiniBuildEditorState;
	onSelect: (blockId: string | null) => void;
	onCommitTransform: (blockId: string, position: GridVec3, size: GridVec3) => EditorResult;
	/** Rotation ring released on a new angle. */
	onCommitRotation: (blockId: string, axis: Axis, angle: SnapAngle) => EditorResult;
	/** Current rotation snap step in degrees. */
	getRotationStep: () => number;
	/** Live angle while a rotation ring is dragged (for a readout). */
	onRotatePreview?: (axis: Axis, angle: SnapAngle) => void;
	onInvalidPreview?: (message: string) => void;
	/** The game's procedural material library — slots are drawn with their textures when present. */
	getProcedural?: () => ProceduralMaterialLibrary | null;
}

const RING_RADIUS_PAD = 0.32;
const DEG = Math.PI / 180;

/**
 * The isolated Mini Build editor viewport: neutral background, floor grid, X/Y/Z axes, the 4m build
 * limit, the design bounds and the anchor marker, an orbit camera, and simple snapped handles.
 *
 * Editor rendering is deliberately naive — one Mesh per block (≤16) — because that makes selection
 * and manipulation trivial. Each block's mesh is that block compiled on its own by the world
 * compiler (a plane is two back-to-back quads), so its UVs and solid-wood coordinates are exactly
 * the world's, and with the game's procedural library each slot is drawn with the same procedural
 * texture it will have once placed. None of these meshes ever reach the world: saving hands a
 * logical draft to the compiler.
 *
 * Separate meshes cannot have hidden faces removed, so wherever two blocks put a surface in the same
 * place the one that wins (miniBuildSurfaces.ts — the same rule the compiler uses) is drawn with a
 * polygon offset that pulls it towards the camera. A plane on a table top is therefore always on
 * top, and of two planes in one place the last selected is on top, from whichever side you look.
 *
 * Rotation: three rings around the selection turn it about the axes its X / Y / Z angles actually
 * turn it about (Z is the world Z axis, X is turned by Z, Y is the block's own Y — the Y→X→Z Euler
 * order), snapping to the editor's rotation step. An angled block's outline and resize handles
 * follow the block's own axes.
 */
export class MiniBuildEditorViewport {
	private readonly renderer: THREE.WebGLRenderer;
	private readonly scene = new THREE.Scene();
	private readonly camera = new THREE.PerspectiveCamera(40, 1, 0.02, 100);
	private readonly blocksGroup = new THREE.Group();
	private readonly handlesGroup = new THREE.Group();
	private readonly blockMeshes = new Map<string, THREE.Mesh>();
	private readonly materials = new Map<string, THREE.MeshStandardMaterial>();
	private readonly boxGeometry = new THREE.BoxGeometry(1, 1, 1);
	/** Stand-in for a block mesh until its compiled geometry is built. */
	private readonly emptyGeometry = new THREE.BufferGeometry();
	private readonly selectionOutline: THREE.LineSegments;
	private readonly boundsOutline: THREE.LineSegments;
	private readonly limitOutline: THREE.LineSegments;
	private readonly anchorMarker: THREE.Group;
	private readonly handleMeshes: THREE.Mesh[] = [];
	private readonly ringMeshes: THREE.Mesh[] = [];
	private readonly raycaster = new THREE.Raycaster();
	private readonly pointer = new THREE.Vector2();
	private readonly observer: ResizeObserver;
	private readonly callbacks: MiniBuildEditorViewportCallbacks;

	private readonly target = new THREE.Vector3(0, 0.4, 0);
	private radius = 4;
	private theta = Math.PI / 4;
	private phi = Math.PI / 3;

	private lastVersion = -1;
	private raf = 0;
	private needsRender = true;
	private disposed = false;
	private drag: DragState | null = null;
	private orbiting: {
		x: number;
		y: number;
		pan: boolean;
		moved: boolean;
		startX: number;
		startY: number;
	} | null = null;

	constructor(
		private readonly canvas: HTMLCanvasElement,
		callbacks: MiniBuildEditorViewportCallbacks
	) {
		this.callbacks = callbacks;
		this.renderer = new THREE.WebGLRenderer({
			canvas,
			antialias: true,
			powerPreference: 'default'
		});
		this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
		this.renderer.outputColorSpace = THREE.SRGBColorSpace;
		this.scene.background = new THREE.Color(BACKGROUND);

		this.scene.add(new THREE.HemisphereLight(0xf2f5f7, 0x3a3f42, 1.6));
		const key = new THREE.DirectionalLight(0xffffff, 1.9);
		key.position.set(3, 6, 4);
		this.scene.add(key);
		const fill = new THREE.DirectionalLight(0xdfe8ff, 0.6);
		fill.position.set(-4, 3, -3);
		this.scene.add(fill);

		const size = MINI_BUILD_LIMITS.workspaceHalfGrid * 2 * MINI_BUILD_LIMITS.gridSize;
		// Minor lines every editorGridLineSpacing (coarser than the 0.03125m snap), major every 0.5m.
		const minor = new THREE.GridHelper(
			size,
			Math.round(size / MINI_BUILD_LIMITS.editorGridLineSpacing),
			0x3a4145,
			0x3a4145
		);
		(minor.material as THREE.Material).transparent = true;
		(minor.material as THREE.Material).opacity = 0.55;
		const major = new THREE.GridHelper(size, size * 2, 0x59636a, 0x59636a);
		major.position.y = 0.0005;
		const floor = new THREE.Mesh(
			new THREE.PlaneGeometry(size, size).rotateX(-Math.PI / 2),
			new THREE.MeshStandardMaterial({
				color: 0x2f3538,
				roughness: 1,
				polygonOffset: true,
				polygonOffsetFactor: 1,
				polygonOffsetUnits: 1
			})
		);
		floor.position.y = -0.001;
		this.scene.add(floor, minor, major);

		for (const axis of ['x', 'y', 'z'] as const) {
			const end = new THREE.Vector3(
				axis === 'x' ? 1 : 0,
				axis === 'y' ? 1 : 0,
				axis === 'z' ? 1 : 0
			).multiplyScalar(1.25);
			const line = new THREE.Line(
				new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), end]),
				new THREE.LineBasicMaterial({ color: AXIS_COLORS[axis], depthTest: false })
			);
			line.renderOrder = 5;
			this.scene.add(line);
		}

		this.limitOutline = this.outline(0x6e7781, 0.5);
		this.boundsOutline = this.outline(0xd0d7de, 0.9);
		this.selectionOutline = this.outline(SELECT_COLOR, 1, false);
		this.anchorMarker = this.createAnchorMarker();
		this.scene.add(
			this.blocksGroup,
			this.limitOutline,
			this.boundsOutline,
			this.selectionOutline,
			this.anchorMarker,
			this.handlesGroup
		);
		this.createHandles();

		this.observer = new ResizeObserver(() => this.resize());
		this.observer.observe(canvas.parentElement ?? canvas);
		this.resize();
		canvas.addEventListener('pointerdown', this.onPointerDown);
		window.addEventListener('pointermove', this.onPointerMove);
		window.addEventListener('pointerup', this.onPointerUp);
		canvas.addEventListener('wheel', this.onWheel, { passive: false });
		canvas.addEventListener('contextmenu', this.onContextMenu);
		this.frameDesign();
		this.raf = requestAnimationFrame(this.tick);
	}

	/** Re-sync meshes from editor state (cheap; ≤16 blocks). */
	sync(): void {
		this.needsRender = true;
	}

	frameDesign(): void {
		const blocks = this.callbacks.getState().getBlocks();
		if (blocks.length === 0) {
			this.target.set(0, 0.4, 0);
			this.radius = 4;
		} else {
			const bounds = computeBounds(blocks);
			const anchor = anchorGrid(bounds);
			const height = gridToMeters(bounds.max.y - bounds.min.y);
			this.target.set(gridToMeters(anchor.x), height / 2, gridToMeters(anchor.z));
			const size = Math.max(
				gridToMeters(bounds.max.x - bounds.min.x),
				height,
				gridToMeters(bounds.max.z - bounds.min.z)
			);
			this.radius = THREE.MathUtils.clamp(size * 2.4, 1.5, 14);
		}
		this.needsRender = true;
	}

	dispose(): void {
		this.disposed = true;
		cancelAnimationFrame(this.raf);
		this.observer.disconnect();
		this.canvas.removeEventListener('pointerdown', this.onPointerDown);
		window.removeEventListener('pointermove', this.onPointerMove);
		window.removeEventListener('pointerup', this.onPointerUp);
		this.canvas.removeEventListener('wheel', this.onWheel);
		this.canvas.removeEventListener('contextmenu', this.onContextMenu);
		const shared = new Set<THREE.BufferGeometry>([this.boxGeometry, this.emptyGeometry]);
		this.scene.traverse((object) => {
			if (
				object instanceof THREE.Mesh ||
				object instanceof THREE.LineSegments ||
				object instanceof THREE.Line
			) {
				if (!shared.has(object.geometry)) object.geometry.dispose();
				const material = object.material as THREE.Material | THREE.Material[];
				if (Array.isArray(material)) material.forEach((m) => m.dispose());
				else material.dispose();
			}
		});
		for (const geometry of shared) geometry.dispose();
		for (const material of this.materials.values()) material.dispose();
		this.renderer.dispose();
	}

	private readonly tick = (): void => {
		if (this.disposed) return;
		this.raf = requestAnimationFrame(this.tick);
		const state = this.callbacks.getState();
		if (state.version !== this.lastVersion) {
			this.lastVersion = state.version;
			this.rebuildBlocks();
			this.needsRender = true;
		}
		if (!this.needsRender) return;
		this.needsRender = false;
		this.updateCamera();
		this.renderer.render(this.scene, this.camera);
	};

	private outline(color: number, opacity: number, depthTest = true): THREE.LineSegments {
		const lines = new THREE.LineSegments(
			new THREE.EdgesGeometry(this.boxGeometry),
			new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity, depthTest })
		);
		lines.renderOrder = depthTest ? 2 : 6;
		lines.visible = false;
		return lines;
	}

	private createAnchorMarker(): THREE.Group {
		const group = new THREE.Group();
		const ring = new THREE.Mesh(
			new THREE.RingGeometry(0.07, 0.1, 24).rotateX(-Math.PI / 2),
			new THREE.MeshBasicMaterial({ color: 0xff9e3d, depthTest: false, side: THREE.DoubleSide })
		);
		const dot = new THREE.Mesh(
			new THREE.SphereGeometry(0.025, 12, 8),
			new THREE.MeshBasicMaterial({ color: 0xff9e3d, depthTest: false })
		);
		ring.renderOrder = 7;
		dot.renderOrder = 7;
		group.add(ring, dot);
		group.position.y = 0.002;
		return group;
	}

	private createHandles(): void {
		for (const axis of ['x', 'y', 'z'] as const) {
			const color = AXIS_COLORS[axis];
			const arrowMaterial = new THREE.MeshBasicMaterial({
				color,
				depthTest: false,
				transparent: true,
				opacity: 0.95
			});
			const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.14, 12), arrowMaterial);
			arrow.userData = { kind: 'move', axis };
			const resizeMaterial = new THREE.MeshBasicMaterial({
				color: 0xffffff,
				depthTest: false,
				transparent: true,
				opacity: 0.95
			});
			const resizeMax = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.06), resizeMaterial);
			resizeMax.userData = { kind: 'resize-max', axis };
			const resizeMin = new THREE.Mesh(
				new THREE.BoxGeometry(0.06, 0.06, 0.06),
				resizeMaterial.clone()
			);
			resizeMin.userData = { kind: 'resize-min', axis };
			for (const mesh of [arrow, resizeMax, resizeMin]) {
				mesh.renderOrder = 8;
				this.handleMeshes.push(mesh);
				this.handlesGroup.add(mesh);
			}
			// Unit-radius ring in its local XY plane (axis +Z), scaled to the selection; a fatter
			// invisible copy makes it easy to grab.
			const ring = new THREE.Mesh(
				new THREE.TorusGeometry(1, 0.008, 6, 72),
				new THREE.MeshBasicMaterial({ color, depthTest: false, transparent: true, opacity: 0.8 })
			);
			ring.renderOrder = 7;
			const grip = new THREE.Mesh(
				new THREE.TorusGeometry(1, 0.045, 6, 48),
				new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
			);
			grip.userData = { kind: 'rotate', axis };
			ring.add(grip);
			this.ringMeshes.push(ring);
			this.handleMeshes.push(grip);
			this.handlesGroup.add(ring);
		}
	}

	/**
	 * `offsetLevel` > 0 pulls the surface towards the camera in depth — enough to win against a
	 * coplanar face, far too little to show through anything that is actually in front of it.
	 */
	private materialFor(slotIndex: number, offsetLevel = 0): THREE.MeshStandardMaterial {
		const slot = this.callbacks.getState().getMaterials()[slotIndex];
		const color = slot?.material.type === 'color' ? slot.material.color : '#cccccc';
		const finish = slot?.finish ?? 'plain';
		const procedural = this.callbacks.getProcedural?.() ?? null;
		const style = procedural && slot ? miniBuildSurfaceStyle(slot) : null;
		const key = `${finish}:${color}:${style ? JSON.stringify(style) : 'flat'}:${offsetLevel}`;
		let material = this.materials.get(key);
		if (!material) {
			const look = FINISH_LOOK[finish];
			material = new THREE.MeshStandardMaterial({
				color,
				roughness: look.roughness,
				metalness: look.metalness,
				...(offsetLevel > 0
					? {
							polygonOffset: true,
							polygonOffsetFactor: -offsetLevel,
							polygonOffsetUnits: -4 * offsetLevel
						}
					: {}),
				...(look.opacity ? { transparent: true, opacity: look.opacity } : {})
			});
			this.materials.set(key, material);
			// The same look the world binds (MiniBuildSystem.resolveMaterial). Maps arrive
			// asynchronously; the library flips the material over once they are ready.
			if (procedural && style) {
				procedural.bindMaterial(material, style, {
					tint: color,
					...(style.mapping === 'wood' ? { ownWoodCoords: true } : { uvUnitMeters: 1 })
				});
				void procedural.whenIdle().then(() => (this.needsRender = true));
			}
		}
		return material;
	}

	private rebuildBlocks(): void {
		const state = this.callbacks.getState();
		const blocks = state.getBlocks();
		const seen = new Set<string>();
		const levels = surfaceOffsetLevels(blocks, state.getMaterials());
		for (const [index, block] of blocks.entries()) {
			seen.add(block.id);
			let mesh = this.blockMeshes.get(block.id);
			if (!mesh) {
				mesh = new THREE.Mesh(this.emptyGeometry, this.materialFor(block.materialSlot));
				mesh.userData.blockId = block.id;
				this.blockMeshes.set(block.id, mesh);
				this.blocksGroup.add(mesh);
			}
			mesh.userData.materialSlot = block.materialSlot;
			mesh.userData.offsetLevel = levels[index];
			this.applyBlockMesh(mesh, block);
		}
		for (const [id, mesh] of [...this.blockMeshes]) {
			if (seen.has(id)) continue;
			mesh.removeFromParent();
			if (mesh.geometry !== this.emptyGeometry) mesh.geometry.dispose();
			this.blockMeshes.delete(id);
		}
		if (blocks.length > 0) {
			const bounds = computeBounds(blocks);
			this.applyBox(
				this.boundsOutline,
				bounds.min,
				{
					x: bounds.max.x - bounds.min.x,
					y: bounds.max.y - bounds.min.y,
					z: bounds.max.z - bounds.min.z
				},
				0.004
			);
			this.boundsOutline.visible = true;
			const anchor = anchorGrid(bounds);
			this.anchorMarker.position.set(gridToMeters(anchor.x), 0.002, gridToMeters(anchor.z));
			this.anchorMarker.visible = true;
			const limit = MINI_BUILD_LIMITS.maxBoundsGrid;
			this.applyBox(
				this.limitOutline,
				{
					x: Math.floor(anchor.x - limit.x / 2),
					y: 0,
					z: Math.floor(anchor.z - limit.z / 2)
				},
				limit,
				0.002
			);
			this.limitOutline.visible = true;
		} else {
			this.boundsOutline.visible = false;
			this.anchorMarker.visible = false;
			const limit = MINI_BUILD_LIMITS.maxBoundsGrid;
			this.applyBox(this.limitOutline, { x: -limit.x / 2, y: 0, z: -limit.z / 2 }, limit, 0.002);
			this.limitOutline.visible = true;
		}
		this.updateSelection();
	}

	/**
	 * Gives a block mesh the block compiled on its own (rebuilt only when its shape changes) and
	 * places it at that compile's anchor.
	 */
	private applyBlockMesh(mesh: THREE.Mesh, block: MiniBuildBlock): void {
		const shapeKey = JSON.stringify([block.id, block.positionGrid, block.sizeGrid, block.rotation]);
		if (mesh.userData.shapeKey !== shapeKey) {
			if (mesh.geometry !== this.emptyGeometry) mesh.geometry.dispose();
			mesh.geometry = compileBlockGeometry(block);
			mesh.userData.shapeKey = shapeKey;
		}
		this.refreshMaterial(mesh);
		const anchor = anchorGrid(computeBounds([block]));
		mesh.position.set(gridToMeters(anchor.x), gridToMeters(anchor.y), gridToMeters(anchor.z));
		mesh.rotation.set(0, 0, 0);
		mesh.scale.set(1, 1, 1);
		mesh.updateMatrixWorld(true);
	}

	/** Centre, rotation and local size of a block (metres); `pad` grows every side (outlines). */
	private applyOrientedBox(object: THREE.Object3D, block: MiniBuildBlock, pad = 0): void {
		const c = blockCenterGrid(block);
		object.position.set(gridToMeters(c.x), gridToMeters(c.y), gridToMeters(c.z));
		object.rotation.set(
			block.rotation.x * DEG,
			block.rotation.y * DEG,
			block.rotation.z * DEG,
			'ZXY'
		);
		object.scale.set(
			gridToMeters(block.sizeGrid.x) + pad,
			gridToMeters(block.sizeGrid.y) + pad,
			gridToMeters(block.sizeGrid.z) + pad
		);
		object.updateMatrixWorld(true);
	}

	private refreshMaterial(mesh: THREE.Mesh): void {
		mesh.material = this.materialFor(
			mesh.userData.materialSlot as number,
			(mesh.userData.offsetLevel as number | undefined) ?? 0
		);
	}

	private applyBox(object: THREE.Object3D, min: GridVec3, size: GridVec3, pad = 0): void {
		object.rotation.set(0, 0, 0);
		object.position.set(
			gridToMeters(min.x + size.x / 2),
			gridToMeters(min.y + size.y / 2),
			gridToMeters(min.z + size.z / 2)
		);
		object.scale.set(
			gridToMeters(size.x) + pad,
			gridToMeters(size.y) + pad,
			gridToMeters(size.z) + pad
		);
		object.updateMatrixWorld(true);
	}

	/** Outline, handles and (during a drag) the previewed block. `preview` replaces the selected block. */
	private updateSelection(preview?: MiniBuildBlock, valid = true): void {
		const state = this.callbacks.getState();
		const selected = state.selectedBlock;
		if (!selected) {
			this.selectionOutline.visible = false;
			this.handlesGroup.visible = false;
			return;
		}
		const block = preview ?? selected;
		this.applyOrientedBox(this.selectionOutline, block, 0.01);
		(this.selectionOutline.material as THREE.LineBasicMaterial).color.setHex(
			valid ? SELECT_COLOR : INVALID_COLOR
		);
		this.selectionOutline.visible = true;
		const mesh = this.blockMeshes.get(block.id);
		if (mesh && preview) {
			// A drag can create or break coplanar contacts, so re-rank every surface for the preview.
			const blocks = state.getBlocks().map((other) => (other.id === block.id ? preview : other));
			const levels = surfaceOffsetLevels(blocks, state.getMaterials());
			for (const [index, other] of blocks.entries()) {
				const otherMesh = this.blockMeshes.get(other.id);
				if (!otherMesh) continue;
				otherMesh.userData.offsetLevel = levels[index];
				this.refreshMaterial(otherMesh);
			}
			this.applyBlockMesh(mesh, preview);
		}

		const c = blockCenterGrid(block);
		const center = new THREE.Vector3(gridToMeters(c.x), gridToMeters(c.y), gridToMeters(c.z));
		const extent = blockExtentBox(block);
		const half = {
			x: gridToMeters(extent.max.x - extent.min.x) / 2,
			y: gridToMeters(extent.max.y - extent.min.y) / 2,
			z: gridToMeters(extent.max.z - extent.min.z) / 2
		};
		const angled = isAngledBlock(block);
		const m = orientationMatrix(block.rotation);
		for (const handle of this.handleMeshes) {
			const { kind, axis } = handle.userData as { kind: HandleKind; axis: Axis };
			if (kind === 'rotate') continue;
			const k = AXES.indexOf(axis);
			let dir = new THREE.Vector3(axis === 'x' ? 1 : 0, axis === 'y' ? 1 : 0, axis === 'z' ? 1 : 0);
			let reach = half[axis];
			if (kind !== 'move' && angled) {
				// Resize along the block's own axis.
				dir = new THREE.Vector3(m[k], m[3 + k], m[6 + k]);
				reach = gridToMeters(block.sizeGrid[axis]) / 2;
			}
			handle.userData.direction = dir.clone();
			if (kind === 'move') {
				handle.position.copy(center).addScaledVector(dir, half[axis] + 0.22);
				handle.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
			} else {
				const sign = kind === 'resize-max' ? 1 : -1;
				handle.position.copy(center).addScaledVector(dir, sign * (reach + 0.06));
				handle.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
			}
			handle.updateMatrixWorld(true);
		}
		const radius = Math.max(half.x, half.y, half.z) + RING_RADIUS_PAD;
		for (const ring of this.ringMeshes) {
			const axis = (ring.children[0].userData as { axis: Axis }).axis;
			const normal = ringAxis(block, axis);
			ring.position.copy(center);
			ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
			ring.scale.setScalar(radius);
			ring.updateMatrixWorld(true);
			ring.children[0].userData.normal = normal;
		}
		this.handlesGroup.visible = true;
	}

	private resize(): void {
		const parent = this.canvas.parentElement ?? this.canvas;
		const width = Math.max(1, parent.clientWidth);
		const height = Math.max(1, parent.clientHeight);
		this.renderer.setSize(width, height, false);
		this.camera.aspect = width / height;
		this.camera.updateProjectionMatrix();
		this.needsRender = true;
	}

	private updateCamera(): void {
		this.phi = THREE.MathUtils.clamp(this.phi, 0.08, Math.PI / 2 - 0.02);
		const sinPhi = Math.sin(this.phi);
		this.camera.position.set(
			this.target.x + this.radius * sinPhi * Math.sin(this.theta),
			this.target.y + this.radius * Math.cos(this.phi),
			this.target.z + this.radius * sinPhi * Math.cos(this.theta)
		);
		this.camera.lookAt(this.target);
		this.camera.updateMatrixWorld(true);
	}

	private setPointer(event: PointerEvent | MouseEvent): void {
		const rect = this.canvas.getBoundingClientRect();
		this.pointer.set(
			((event.clientX - rect.left) / rect.width) * 2 - 1,
			-((event.clientY - rect.top) / rect.height) * 2 + 1
		);
		this.updateCamera();
		this.raycaster.setFromCamera(this.pointer, this.camera);
	}

	private axisParameter(origin: THREE.Vector3, direction: THREE.Vector3): number {
		// Closest point on the axis line to the pointer ray.
		const ray = this.raycaster.ray;
		const w0 = origin.clone().sub(ray.origin);
		const b = direction.dot(ray.direction);
		const d = direction.dot(w0);
		const e = ray.direction.dot(w0);
		const denom = 1 - b * b;
		if (Math.abs(denom) < 1e-5) return 0;
		return (b * e - d) / denom;
	}

	private readonly onPointerDown = (event: PointerEvent): void => {
		this.setPointer(event);
		const state = this.callbacks.getState();
		const selected = state.selectedBlock;
		if (event.button === 0 && selected && this.handlesGroup.visible) {
			const hit = this.raycaster.intersectObjects(this.handleMeshes, false)[0];
			if (hit) {
				const { kind, axis } = hit.object.userData as { kind: HandleKind; axis: Axis };
				const box = blockBox(selected);
				const base = {
					kind,
					axis,
					blockId: selected.id,
					block: selected,
					startPosition: { ...box.min },
					startSize: effectiveSize(selected),
					lastPosition: { ...box.min },
					lastSize: effectiveSize(selected),
					valid: true
				};
				if (kind === 'rotate') {
					const normal = (hit.object.userData.normal as THREE.Vector3).clone();
					const c = blockCenterGrid(selected);
					const origin = new THREE.Vector3(gridToMeters(c.x), gridToMeters(c.y), gridToMeters(c.z));
					const ringU = new THREE.Vector3(1, 0, 0);
					if (Math.abs(ringU.dot(normal)) > 0.9) ringU.set(0, 1, 0);
					ringU.addScaledVector(normal, -ringU.dot(normal)).normalize();
					const ringV = normal.clone().cross(ringU);
					const phi = this.ringAngle(origin, normal, ringU, ringV) ?? 0;
					this.drag = {
						...base,
						origin,
						direction: normal,
						startT: 0,
						ringU,
						ringV,
						lastPhi: phi,
						turned: 0,
						startAngle: selected.rotation[axis],
						lastAngle: selected.rotation[axis]
					};
				} else {
					const direction = (hit.object.userData.direction as THREE.Vector3).clone();
					const origin = hit.object.getWorldPosition(new THREE.Vector3());
					this.drag = {
						...base,
						origin,
						direction,
						startT: this.axisParameter(origin, direction)
					};
				}
				this.canvas.setPointerCapture?.(event.pointerId);
				event.preventDefault();
				return;
			}
		}
		this.orbiting = {
			x: event.clientX,
			y: event.clientY,
			startX: event.clientX,
			startY: event.clientY,
			pan: event.button !== 0 || event.shiftKey,
			moved: false
		};
		this.canvas.setPointerCapture?.(event.pointerId);
	};

	private readonly onPointerMove = (event: PointerEvent): void => {
		if (this.drag) {
			this.setPointer(event);
			const drag = this.drag;
			if (drag.kind === 'rotate') {
				this.dragRing(drag);
				return;
			}
			const deltaGrid = Math.round(
				(this.axisParameter(drag.origin, drag.direction) - drag.startT) / MINI_BUILD_LIMITS.gridSize
			);
			let position = { ...drag.startPosition };
			let size = { ...drag.startSize };
			if (drag.kind === 'move') {
				position[drag.axis] += deltaGrid;
			} else if (isAngledBlock(drag.block)) {
				const local = AXES.indexOf(drag.axis) as 0 | 1 | 2;
				const max = drag.kind === 'resize-max';
				const next = resizeBlockLocal(
					drag.block,
					local,
					max ? deltaGrid : -deltaGrid,
					max ? 1 : -1
				);
				position = next.positionGrid;
				size = next.effective;
			} else if (drag.kind === 'resize-max') {
				size[drag.axis] = clampBlockSize(size, drag.axis, drag.startSize[drag.axis] + deltaGrid);
			} else {
				size[drag.axis] = clampBlockSize(size, drag.axis, drag.startSize[drag.axis] - deltaGrid);
				position[drag.axis] =
					drag.startPosition[drag.axis] + drag.startSize[drag.axis] - size[drag.axis];
			}
			const result = this.callbacks.getState().previewBlockGrid(drag.blockId, position, size);
			drag.lastPosition = position;
			drag.lastSize = size;
			drag.valid = result.ok;
			if (!result.ok) this.callbacks.onInvalidPreview?.(result.error);
			this.updateSelection(withGridTransform(drag.block, position, size), result.ok);
			this.needsRender = true;
			return;
		}
		if (!this.orbiting) return;
		const dx = event.clientX - this.orbiting.x;
		const dy = event.clientY - this.orbiting.y;
		this.orbiting.x = event.clientX;
		this.orbiting.y = event.clientY;
		if (
			Math.hypot(event.clientX - this.orbiting.startX, event.clientY - this.orbiting.startY) >
			DRAG_THRESHOLD_PX
		)
			this.orbiting.moved = true;
		if (!this.orbiting.moved) return;
		if (this.orbiting.pan) {
			const scale = this.radius * 0.0016;
			const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0);
			const up = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 1);
			this.target.addScaledVector(right, -dx * scale).addScaledVector(up, dy * scale);
			this.target.y = Math.max(0, this.target.y);
		} else {
			this.theta -= dx * 0.008;
			this.phi -= dy * 0.008;
		}
		this.needsRender = true;
	};

	private readonly onPointerUp = (event: PointerEvent): void => {
		if (this.drag) {
			const drag = this.drag;
			this.drag = null;
			if (drag.kind === 'rotate') {
				if (drag.valid && drag.lastAngle !== drag.startAngle && drag.lastAngle !== undefined)
					this.callbacks.onCommitRotation(drag.blockId, drag.axis, drag.lastAngle);
				this.lastVersion = -1;
				this.needsRender = true;
				return;
			}
			const changed =
				JSON.stringify(drag.lastPosition) !== JSON.stringify(drag.startPosition) ||
				JSON.stringify(drag.lastSize) !== JSON.stringify(drag.startSize);
			if (changed && drag.valid) {
				this.callbacks.onCommitTransform(drag.blockId, drag.lastPosition, drag.lastSize);
			}
			// Always resync: an invalid or rejected drag snaps back to the stored transform.
			this.lastVersion = -1;
			this.needsRender = true;
			return;
		}
		const orbit = this.orbiting;
		this.orbiting = null;
		if (!orbit || orbit.moved || event.button !== 0) return;
		this.setPointer(event);
		const hit = this.raycaster.intersectObjects([...this.blockMeshes.values()], false)[0];
		this.callbacks.onSelect((hit?.object.userData.blockId as string | undefined) ?? null);
		this.needsRender = true;
	};

	/** Pointer angle around a ring (radians, in the ring's u/v basis), or null when edge-on. */
	private ringAngle(
		origin: THREE.Vector3,
		normal: THREE.Vector3,
		u: THREE.Vector3,
		v: THREE.Vector3
	): number | null {
		const ray = this.raycaster.ray;
		const denom = ray.direction.dot(normal);
		if (Math.abs(denom) < 1e-4) return null;
		const t = origin.clone().sub(ray.origin).dot(normal) / denom;
		if (t <= 0) return null;
		const offset = ray.at(t, new THREE.Vector3()).sub(origin);
		return Math.atan2(offset.dot(v), offset.dot(u));
	}

	/**
	 * Turning a ring: the pointer's swept angle (unwrapped, so several turns are fine) snapped to the
	 * rotation step. Small wiggles below half a step leave the angle alone; past that it lands on the
	 * step's grid, so a block set at an odd angle with a finer step snaps onto round angles again.
	 */
	private dragRing(drag: DragState): void {
		const phi = this.ringAngle(drag.origin, drag.direction, drag.ringU!, drag.ringV!);
		if (phi === null) return;
		let delta = phi - drag.lastPhi!;
		if (delta > Math.PI) delta -= 2 * Math.PI;
		if (delta < -Math.PI) delta += 2 * Math.PI;
		drag.lastPhi = phi;
		drag.turned = drag.turned! + delta;
		const step = this.callbacks.getRotationStep();
		const degrees = drag.turned / DEG;
		const angle =
			Math.abs(degrees) < step / 2 ? drag.startAngle! : snapAngle(drag.startAngle! + degrees, step);
		if (angle === drag.lastAngle) return;
		drag.lastAngle = angle;
		const result = this.callbacks.getState().previewBlockAngle(drag.blockId, drag.axis, angle);
		drag.valid = result.ok;
		if (!result.ok) this.callbacks.onInvalidPreview?.(result.error);
		else this.callbacks.onRotatePreview?.(drag.axis, angle);
		this.updateSelection(turnBlock(drag.block, drag.axis, angle), result.ok);
		this.needsRender = true;
	}

	private readonly onWheel = (event: WheelEvent): void => {
		event.preventDefault();
		this.radius = THREE.MathUtils.clamp(this.radius * Math.exp(event.deltaY * 0.0012), 0.6, 20);
		this.needsRender = true;
	};

	private readonly onContextMenu = (event: MouseEvent): void => {
		event.preventDefault();
	};
}

/**
 * The world axis a block's X, Y or Z angle turns it about. With `v' = Rz · Rx · Ry · v`: changing Z
 * turns about world Z, changing X about Rz·X, changing Y about the block's own Y (Rz·Rx·Y).
 */
function ringAxis(block: MiniBuildBlock, axis: Axis): THREE.Vector3 {
	if (axis === 'z') return new THREE.Vector3(0, 0, 1);
	const [cz, sz] = snapCosSin(block.rotation.z);
	if (axis === 'x') return new THREE.Vector3(cz, sz, 0);
	const m = orientationMatrix(block.rotation);
	return new THREE.Vector3(m[1], m[4], m[7]);
}

/**
 * One block through the world compiler, as a BufferGeometry relative to that block's own anchor —
 * the same faces, metre UVs and `woodCoord`s it gets inside a placed design. The material slot is
 * irrelevant here (one group), so a single placeholder slot keeps the compile self-contained.
 */
function compileBlockGeometry(block: MiniBuildBlock): THREE.BufferGeometry {
	const solo: MiniBuildBlock = { ...block, materialSlot: 0 };
	const bounds = computeBounds([solo]);
	const data = compileMiniBuildData({
		schemaVersion: MINI_BUILD_SCHEMA_VERSION,
		id: 'editor-block',
		name: '',
		revision: 1,
		blocks: [solo],
		materials: [{ name: '', finish: 'plain', material: { type: 'color', color: '#FFFFFF' } }],
		bounds,
		anchor: { type: 'bottom-center' },
		createdAt: '',
		updatedAt: ''
	});
	const group = data.groups[0];
	const geometry = new THREE.BufferGeometry();
	if (!group) return geometry;
	geometry.setAttribute('position', new THREE.BufferAttribute(group.positions, 3));
	geometry.setAttribute('normal', new THREE.BufferAttribute(group.normals, 3));
	geometry.setAttribute('uv', new THREE.BufferAttribute(group.uvs, 2));
	geometry.setAttribute('woodCoord', new THREE.BufferAttribute(group.woodCoords, 3));
	geometry.setIndex(new THREE.BufferAttribute(group.indices, 1));
	geometry.computeBoundingSphere();
	return geometry;
}
