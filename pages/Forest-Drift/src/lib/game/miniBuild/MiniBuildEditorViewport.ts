import * as THREE from 'three';
import {
	clampBlockSize,
	type EditorResult,
	type MiniBuildEditorState
} from './MiniBuildEditorState';
import {
	anchorGrid,
	blockBox,
	cloneBlock,
	computeBounds,
	effectiveSize,
	flatAxis,
	gridToMeters,
	localSizeForEffective,
	type Axis
} from './miniBuildGrid';
import { surfaceOffsetLevels } from './miniBuildSurfaces';
import { MINI_BUILD_LIMITS, type GridVec3, type MiniBuildFinish } from './MiniBuildTypes';

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

type HandleKind = 'move' | 'resize-max' | 'resize-min';

interface DragState {
	kind: HandleKind;
	axis: Axis;
	blockId: string;
	startPosition: GridVec3;
	startSize: GridVec3;
	origin: THREE.Vector3;
	direction: THREE.Vector3;
	startT: number;
	lastPosition: GridVec3;
	lastSize: GridVec3;
	valid: boolean;
}

export interface MiniBuildEditorViewportCallbacks {
	getState: () => MiniBuildEditorState;
	onSelect: (blockId: string | null) => void;
	onCommitTransform: (blockId: string, position: GridVec3, size: GridVec3) => EditorResult;
	onInvalidPreview?: (message: string) => void;
}

/**
 * The isolated Mini Build editor viewport: neutral background, floor grid, X/Y/Z axes, the 4m build
 * limit, the design bounds and the anchor marker, an orbit camera, and simple snapped handles.
 *
 * Editor rendering is deliberately naive — one Mesh per block (≤16) — because that makes selection
 * and manipulation trivial. A block that is flat on one axis is drawn with a shared, two-sided unit
 * plane instead of a squashed box (which would have a singular normal matrix and z-fighting faces).
 * None of these meshes ever reach the world: saving hands a logical draft to the compiler.
 *
 * Separate meshes cannot have hidden faces removed, so wherever two blocks put a surface in the same
 * place the one that wins (miniBuildSurfaces.ts — the same rule the compiler uses) is drawn with a
 * polygon offset that pulls it towards the camera. A plane on a table top is therefore always on
 * top, and of two planes in one place the last selected is on top, from whichever side you look.
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
	/** Unit planes whose normal lies along each axis, for blocks that are flat on that axis. */
	private readonly planeGeometries: Record<Axis, THREE.PlaneGeometry> = {
		x: new THREE.PlaneGeometry(1, 1).rotateY(Math.PI / 2),
		y: new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
		z: new THREE.PlaneGeometry(1, 1)
	};
	private readonly selectionOutline: THREE.LineSegments;
	private readonly boundsOutline: THREE.LineSegments;
	private readonly limitOutline: THREE.LineSegments;
	private readonly anchorMarker: THREE.Group;
	private readonly handleMeshes: THREE.Mesh[] = [];
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
		// Minor lines every editorGridLineSpacing (coarser than the 0.0625m snap), major every 0.5m.
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
		const shared = new Set<THREE.BufferGeometry>([
			this.boxGeometry,
			...Object.values(this.planeGeometries)
		]);
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
		}
	}

	/**
	 * `offsetLevel` > 0 pulls the surface towards the camera in depth — enough to win against a
	 * coplanar face, far too little to show through anything that is actually in front of it.
	 */
	private materialFor(
		slotIndex: number,
		twoSided = false,
		offsetLevel = 0
	): THREE.MeshStandardMaterial {
		const slot = this.callbacks.getState().getMaterials()[slotIndex];
		const color = slot?.material.type === 'color' ? slot.material.color : '#cccccc';
		const finish = slot?.finish ?? 'plain';
		const key = `${finish}:${color}:${twoSided ? 2 : 1}:${offsetLevel}`;
		let material = this.materials.get(key);
		if (!material) {
			const look = FINISH_LOOK[finish];
			material = new THREE.MeshStandardMaterial({
				color,
				roughness: look.roughness,
				metalness: look.metalness,
				side: twoSided ? THREE.DoubleSide : THREE.FrontSide,
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
				mesh = new THREE.Mesh(this.boxGeometry, this.materialFor(block.materialSlot));
				mesh.userData.blockId = block.id;
				this.blockMeshes.set(block.id, mesh);
				this.blocksGroup.add(mesh);
			}
			mesh.userData.materialSlot = block.materialSlot;
			mesh.userData.offsetLevel = levels[index];
			this.applyBlockMesh(mesh, blockBox(block).min, effectiveSize(block));
		}
		for (const [id, mesh] of [...this.blockMeshes]) {
			if (seen.has(id)) continue;
			mesh.removeFromParent();
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

	/** Positions a block mesh, swapping between the box and a plane as its thickness reaches 0. */
	private applyBlockMesh(mesh: THREE.Mesh, min: GridVec3, size: GridVec3): void {
		const flat = flatAxis(size);
		mesh.geometry = flat ? this.planeGeometries[flat] : this.boxGeometry;
		mesh.userData.twoSided = flat !== null;
		this.refreshMaterial(mesh);
		this.applyBox(mesh, min, size);
		// The plane has no extent on its flat axis; a unit scale keeps the normal matrix invertible.
		if (flat) {
			mesh.scale[flat] = 1;
			mesh.updateMatrixWorld(true);
		}
	}

	private refreshMaterial(mesh: THREE.Mesh): void {
		mesh.material = this.materialFor(
			mesh.userData.materialSlot as number,
			mesh.userData.twoSided as boolean,
			(mesh.userData.offsetLevel as number | undefined) ?? 0
		);
	}

	private applyBox(object: THREE.Object3D, min: GridVec3, size: GridVec3, pad = 0): void {
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

	private updateSelection(previewPosition?: GridVec3, previewSize?: GridVec3, valid = true): void {
		const state = this.callbacks.getState();
		const block = state.selectedBlock;
		if (!block) {
			this.selectionOutline.visible = false;
			this.handlesGroup.visible = false;
			return;
		}
		const min = previewPosition ?? blockBox(block).min;
		const size = previewSize ?? effectiveSize(block);
		this.applyBox(this.selectionOutline, min, size, 0.01);
		(this.selectionOutline.material as THREE.LineBasicMaterial).color.setHex(
			valid ? SELECT_COLOR : INVALID_COLOR
		);
		this.selectionOutline.visible = true;
		const mesh = this.blockMeshes.get(block.id);
		if (mesh && previewPosition && previewSize) {
			// A drag can create or break coplanar contacts, so re-rank every surface for the preview.
			const blocks = state.getBlocks().map((other) =>
				other.id === block.id
					? {
							...cloneBlock(other),
							positionGrid: { ...previewPosition },
							sizeGrid: localSizeForEffective(previewSize, other.rotation)
						}
					: other
			);
			const levels = surfaceOffsetLevels(blocks, state.getMaterials());
			for (const [index, other] of blocks.entries()) {
				const otherMesh = this.blockMeshes.get(other.id);
				if (!otherMesh) continue;
				otherMesh.userData.offsetLevel = levels[index];
				this.refreshMaterial(otherMesh);
			}
			this.applyBlockMesh(mesh, previewPosition, previewSize);
		}

		const center = new THREE.Vector3(
			gridToMeters(min.x + size.x / 2),
			gridToMeters(min.y + size.y / 2),
			gridToMeters(min.z + size.z / 2)
		);
		const half = {
			x: gridToMeters(size.x) / 2,
			y: gridToMeters(size.y) / 2,
			z: gridToMeters(size.z) / 2
		};
		for (const handle of this.handleMeshes) {
			const { kind, axis } = handle.userData as { kind: HandleKind; axis: Axis };
			const dir = new THREE.Vector3(
				axis === 'x' ? 1 : 0,
				axis === 'y' ? 1 : 0,
				axis === 'z' ? 1 : 0
			);
			if (kind === 'move') {
				handle.position.copy(center).addScaledVector(dir, half[axis] + 0.22);
				handle.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
			} else {
				const sign = kind === 'resize-max' ? 1 : -1;
				handle.position.copy(center).addScaledVector(dir, sign * (half[axis] + 0.06));
			}
			handle.updateMatrixWorld(true);
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
				const direction = new THREE.Vector3(
					axis === 'x' ? 1 : 0,
					axis === 'y' ? 1 : 0,
					axis === 'z' ? 1 : 0
				);
				const origin = hit.object.getWorldPosition(new THREE.Vector3());
				const box = blockBox(selected);
				this.drag = {
					kind,
					axis,
					blockId: selected.id,
					startPosition: { ...box.min },
					startSize: effectiveSize(selected),
					origin,
					direction,
					startT: this.axisParameter(origin, direction),
					lastPosition: { ...box.min },
					lastSize: effectiveSize(selected),
					valid: true
				};
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
			const deltaGrid = Math.round(
				(this.axisParameter(drag.origin, drag.direction) - drag.startT) / MINI_BUILD_LIMITS.gridSize
			);
			const position = { ...drag.startPosition };
			const size = { ...drag.startSize };
			if (drag.kind === 'move') {
				position[drag.axis] += deltaGrid;
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
			this.updateSelection(position, size, result.ok);
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

	private readonly onWheel = (event: WheelEvent): void => {
		event.preventDefault();
		this.radius = THREE.MathUtils.clamp(this.radius * Math.exp(event.deltaY * 0.0012), 0.6, 20);
		this.needsRender = true;
	};

	private readonly onContextMenu = (event: MouseEvent): void => {
		event.preventDefault();
	};
}
