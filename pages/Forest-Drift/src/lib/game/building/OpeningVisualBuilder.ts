import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { BuildingMaterialManager } from './BuildingMaterialManager';
import {
	clampInteriorDepth,
	computeDoorFrameLayout,
	computeDoorHandlePlacement,
	computeWindowFrameLayout,
	hingeSideForOpening
} from './openingVisualMath';
import type { DoorHandlePlacement, UvRect } from './openingVisualMath';
import type { WallOpeningDefinition } from './WallTypes';
import { shutterSwingAngle } from './windowShutterMath';
import {
	archedDoorFrameGeometry,
	archedDoorLeafGeometry,
	doorArchInfillGeometry,
	doorArchSpringY,
	doorArchCollisionSegments
} from './doorGeometry';

/** How thick the glass pane itself is (metres), independent of the frame's own configured depth — kept inside the wall via `clampInteriorDepth`, while the frame itself always sits proud of both faces. */
const GLASS_THICKNESS = 0.02;

/** Shared, never-disposed debug-wireframe materials — same "one module-level LineBasicMaterial constant" convention WallManager/RoofManager's own `boundsMaterial` already use for their bounds helpers. */
const openingBoundsMaterial = new THREE.LineBasicMaterial({ color: 0x39d353 });
const openingFrameBoundsMaterial = new THREE.LineBasicMaterial({ color: 0xffa64d });
const doorHingeMaterial = new THREE.MeshBasicMaterial({ color: 0xff3b30, depthTest: false });

/**
 * The one shared, fixed-look glass material every window pane uses — deliberately NOT routed through
 * `BuildingMaterialManager` (which only ever builds `MeshStandardMaterial`s): glass needs
 * `MeshPhysicalMaterial` for its transparency/reflection, and per the feature spec isn't paintable or
 * per-window-customizable in this version, so a single shared instance (never mutated, never keyed by
 * a `BuildingMaterialDefinition`) is all that's needed. Built lazily and cached at module scope so
 * every caller gets the exact same instance without needing to thread one through every constructor —
 * `ThreeScene` still registers it with the graphics pipeline's CSM system exactly once, the same
 * "ad-hoc material built outside BuildingMaterialManager needs manual registration" rule StairTool's
 * own preview materials already follow (see its `getPreviewMaterials()`).
 */
let sharedGlassMaterial: THREE.MeshPhysicalMaterial | null = null;

export function getGlassMaterial(): THREE.MeshPhysicalMaterial {
	if (!sharedGlassMaterial) {
		sharedGlassMaterial = new THREE.MeshPhysicalMaterial({
			color: 0xbfd4e0,
			transparent: true,
			opacity: 0.25,
			roughness: 0.05,
			metalness: 0,
			reflectivity: 0.5,
			side: THREE.DoubleSide,
			depthWrite: false
		});
	}
	return sharedGlassMaterial;
}

/** The subset of `BuildingSettings` this module actually reads — kept as its own small interface (rather than importing the whole `BuildingSettings`) so this file, like every other `*Math.ts`/builder pair in this codebase, stays decoupled from the debug-GUI settings shape it happens to be fed from today. */
export interface OpeningVisualSettings {
	windowFramesEnabled: boolean;
	windowFrameWidth: number;
	windowFrameDepth: number;
	windowGlassEnabled: boolean;
	doorFramesEnabled: boolean;
	doorFrameWidth: number;
	doorFrameDepth: number;
	doorThickness: number;
	doorClearance: number;

	/** Debug: outlines the opening's own logical `minU/maxU/minY/maxY` rect (spanning the full wall thickness). */
	showOpeningBounds: boolean;
	/** Debug: outlines the ACTUAL (post-clamping) interior rect — the window's glass rect or the door's leaf rect — so adaptive frame-width scaling is directly visible. */
	showOpeningFrameBounds: boolean;
	/** Debug: marks a door's hinge pivot — the axis `DoorInteractionController` rotates around. */
	showDoorHinge: boolean;
}

export interface OpeningVisualResult {
	/** The single object to parent under the owning wall/segment's own wall-local frame — see WallManager/WallPathManager's doc comments on why that placement alone is enough for this to work on straight, diagonal, and polygon-wall-segment walls identically. */
	object: THREE.Object3D;
	/**
	 * Present only for a door: a single hinge, or a double-door assembly containing two hinges.
	 * `DoorInteractionController` animates the leaf pivots (see `buildDoorVisual`).
	 */
	hingePivot?: THREE.Object3D;
	/** A pair of independently hinged shutter leaves, initially folded open. */
	shutterAssembly?: THREE.Object3D;
}

/**
 * Turns one `WallOpeningDefinition` into its procedural visual insert — a window frame + glass pane,
 * or a door frame + leaf — sized ENTIRELY from the opening's own `minU/maxU/minY/maxY` (see
 * openingVisualMath.ts for the actual layout maths). This is the one place a logical opening becomes
 * Three.js geometry; nothing it returns is ever persisted (see the README's "Openings" section) —
 * reloading a world just calls this again for every opening still in the file, identical to how
 * `RoofGeometryBuilder`/`SlabGeometryBuilder` regenerate their own geometry from logical definitions.
 *
 * Returns `null` for a degenerate opening (non-positive width/height — shouldn't happen from any real
 * placement tool, but defensive against hand-edited/imported world data) or when both frame and glass
 * are disabled for a window with `windowFramesEnabled`/`windowGlassEnabled` both false.
 */
export function buildOpeningVisual(
	opening: WallOpeningDefinition,
	wallThickness: number,
	settings: OpeningVisualSettings,
	materialManager: BuildingMaterialManager,
	glassMaterial: THREE.Material,
	automaticExteriorSide: 1 | -1 = 1,
	wallSurfaceMaterial?: THREE.Material
): OpeningVisualResult | null {
	if (opening.maxU <= opening.minU || opening.maxY <= opening.minY) return null;

	if (opening.type === 'window') {
		const object = buildWindowVisual(
			opening,
			wallThickness,
			settings,
			materialManager,
			glassMaterial,
			automaticExteriorSide
		);
		return object ? { object, shutterAssembly: object.getObjectByName('window-shutters') } : null;
	}

	const result = buildDoorVisual(
		opening,
		wallThickness,
		settings,
		materialManager,
		wallSurfaceMaterial
	);
	return result ? { object: result.group, hingePivot: result.hingePivot } : null;
}

/** Disposes every mesh/line geometry under an opening visual (never its materials — every material here is a shared, never-disposed instance, either cached via `BuildingMaterialManager` or one of this module's own debug-wireframe constants) and detaches it from its parent. Call on rebuild (before building the replacement) and on the owning opening's removal. */
export function disposeOpeningVisual(object: THREE.Object3D): void {
	object.traverse((child) => {
		if (child instanceof THREE.Mesh || child instanceof THREE.LineSegments) {
			child.geometry.dispose();
		}
	});
	object.removeFromParent();
}

/** A wireframe box outline in the SAME absolute wall-local (U, Y, depth) coordinates every solid piece here uses — its own geometry (never shared), so `disposeOpeningVisual`'s generic traversal can dispose it safely. */
function addWireframeBox(
	parent: THREE.Group,
	rect: UvRect,
	depth: number,
	material: THREE.LineBasicMaterial,
	name: string
): void {
	const width = rect.maxU - rect.minU;
	const height = rect.maxY - rect.minY;
	if (width <= 0 || height <= 0) return;
	const box = new THREE.BoxGeometry(width, height, depth);
	box.translate((rect.minU + rect.maxU) / 2, (rect.minY + rect.maxY) / 2, 0);
	const edges = new THREE.EdgesGeometry(box);
	box.dispose();
	const line = new THREE.LineSegments(edges, material);
	line.name = name;
	parent.add(line);
}

/** A small marker at a door's hinge pivot — its own geometry (never shared), added as a CHILD of `hingePivot` so it moves/rotates with it once an interactive door actually animates. */
function addHingeMarker(hingePivot: THREE.Object3D): void {
	const marker = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), doorHingeMaterial);
	marker.name = 'door-hinge-marker';
	hingePivot.add(marker);
}

function buildWindowVisual(
	opening: WallOpeningDefinition,
	wallThickness: number,
	settings: OpeningVisualSettings,
	materialManager: BuildingMaterialManager,
	glassMaterial: THREE.Material,
	automaticExteriorSide: 1 | -1
): THREE.Group | null {
	if (
		opening.shutters?.mode === 'off' &&
		!settings.windowFramesEnabled &&
		!settings.windowGlassEnabled &&
		!settings.showOpeningBounds &&
		!settings.showOpeningFrameBounds
	) {
		return null;
	}

	const rect: UvRect = opening;
	const layout = computeWindowFrameLayout(
		rect,
		settings.windowFrameWidth,
		settings.windowFrameDepth,
		wallThickness
	);

	const group = new THREE.Group();
	group.name = 'window-visual';

	if (settings.windowFramesEnabled) {
		const frameMaterial = materialManager.getMaterial('window-frame', opening.material);
		const frameRects = [layout.left, layout.right, layout.top, layout.bottom];
		if (layout.mullion) frameRects.push(layout.mullion);
		if (layout.transom) frameRects.push(layout.transom);
		const frameMesh = buildMergedBoxMesh(frameRects, layout.frameDepth, frameMaterial);
		if (frameMesh) {
			frameMesh.castShadow = true;
			frameMesh.receiveShadow = true;
			frameMesh.name = 'window-frame';
			group.add(frameMesh);
		}
	}

	if (settings.windowGlassEnabled) {
		const glassDepth = clampInteriorDepth(GLASS_THICKNESS, wallThickness);
		const glassMesh = buildMergedBoxMesh([layout.glass], glassDepth, glassMaterial);
		if (glassMesh) {
			glassMesh.castShadow = false;
			glassMesh.receiveShadow = false;
			glassMesh.name = 'window-glass';
			group.add(glassMesh);
		}
	}

	if (opening.shutters?.mode !== 'off') {
		const side =
			opening.shutters?.mode === 'manual' ? (opening.shutters.side ?? 1) : automaticExteriorSide;
		const width = (rect.maxU - rect.minU) / 2;
		const height = rect.maxY - rect.minY;
		const depth = Math.min(0.05, width * 0.15);
		const shutters = new THREE.Group();
		shutters.name = 'window-shutters';
		Object.assign(shutters.userData, {
			interactionKind: 'shutters',
			openingId: opening.id,
			side,
			panelWidth: width,
			minU: rect.minU,
			maxU: rect.maxU,
			minY: rect.minY,
			maxY: rect.maxY
		});
		// The hinge axes meet the jamb edges without a lateral gap. Leave enough depth
		// for the inner cross rails to clear the frame when the leaves are closed.
		const hingeZ = side * (Math.max(wallThickness, layout.frameDepth) / 2 + depth * 0.85 + 0.002);
		for (const hinge of ['left', 'right'] as const) {
			const pivot = new THREE.Group();
			pivot.name = `window-shutter-${hinge}-hinge`;
			pivot.userData.hingeSide = hinge;
			pivot.position.set(hinge === 'left' ? rect.minU : rect.maxU, rect.minY, hingeZ);
			pivot.rotation.y = shutterSwingAngle(side, hinge, 1);
			const center = ((hinge === 'left' ? 1 : -1) * width) / 2;
			const geometries: THREE.BufferGeometry[] = [];
			const addBox = (w: number, h: number, d: number, x: number, y: number, z: number) => {
				const box = new THREE.BoxGeometry(w, h, d);
				box.translate(x, y, z);
				geometries.push(box);
			};
			const planks = Math.max(2, Math.min(8, Math.ceil(width / 0.14)));
			const plankWidth = width / planks;
			for (let index = 0; index < planks; index++) {
				addBox(
					plankWidth - Math.min(0.006, plankWidth * 0.06),
					height,
					depth,
					center - width / 2 + (index + 0.5) * plankWidth,
					height / 2,
					0
				);
			}
			for (const fraction of [0.2, 0.8]) {
				addBox(
					width,
					Math.min(0.075, height * 0.1),
					depth * 0.45,
					center,
					height * fraction,
					-side * depth * 0.6
				);
			}
			const merged = mergeGeometries(geometries, false);
			for (const geometry of geometries) geometry.dispose();
			if (merged) {
				const leaf = new THREE.Mesh(merged, materialManager.getMaterial('door-leaf', undefined));
				leaf.name = 'window-shutter-leaf';
				leaf.castShadow = true;
				leaf.receiveShadow = true;
				pivot.add(leaf);
				shutters.add(pivot);
			}
		}
		group.add(shutters);
	}

	if (settings.showOpeningBounds) {
		addWireframeBox(group, rect, wallThickness, openingBoundsMaterial, 'debug-opening-bounds');
	}
	if (settings.showOpeningFrameBounds) {
		addWireframeBox(
			group,
			layout.glass,
			layout.frameDepth,
			openingFrameBoundsMaterial,
			'debug-frame-bounds'
		);
	}

	return group.children.length > 0 ? group : null;
}

/**
 * `DoorAssembly = frame + hingePivot > doorLeaf`, or a shared assembly containing two hinges.
 * The leaf's own geometry is translated so its LOCAL origin sits exactly on the hinge edge —
 * `hingeU`, at `hingePivot`'s own position — rather than being centred the way every other piece
 * here is; `DoorInteractionController` swings it open by animating `hingePivot.rotation.y`, with
 * no geometry rebuild and no repositioning. Double doors return a parent assembly and animate its
 * two child hinges in opposite directions.
 *
 * `DoorInteractionController.getCollisionRects()` builds a live leaf collider from this pivot's
 * world matrix (closed = fills the doorway hole; open = swung aside so the hole is walkable).
 */
function buildDoorVisual(
	opening: WallOpeningDefinition,
	wallThickness: number,
	settings: OpeningVisualSettings,
	materialManager: BuildingMaterialManager,
	wallSurfaceMaterial?: THREE.Material
): { group: THREE.Group; hingePivot: THREE.Object3D | undefined } | null {
	const rect: UvRect = opening;
	const hingeSide = hingeSideForOpening(opening.id);
	const layout = computeDoorFrameLayout(
		rect,
		settings.doorFrameWidth,
		settings.doorFrameDepth,
		wallThickness,
		settings.doorClearance,
		hingeSide
	);

	const group = new THREE.Group();
	group.name = 'door-visual';

	const arched = opening.doorStyle?.arched === true;
	const double = opening.doorStyle?.double === true;
	const springY = doorArchSpringY(rect);
	if (arched) {
		const infill = new THREE.Mesh(
			doorArchInfillGeometry(rect, wallThickness),
			wallSurfaceMaterial ?? materialManager.getMaterial('wall', undefined)
		);
		infill.name = 'door-arch-infill';
		infill.castShadow = infill.receiveShadow = true;
		group.add(infill);
	}
	if (settings.doorFramesEnabled) {
		const frameMaterial = materialManager.getMaterial('door-frame', undefined);
		const inner = computeDoorFrameLayout(
			rect,
			settings.doorFrameWidth,
			settings.doorFrameDepth,
			wallThickness,
			0,
			hingeSide
		).leaf;
		const frameMesh = arched
			? new THREE.Mesh(archedDoorFrameGeometry(rect, inner, layout.frameDepth), frameMaterial)
			: buildMergedBoxMesh(
					[layout.left, layout.right, layout.top],
					layout.frameDepth,
					frameMaterial
				);
		if (frameMesh) {
			frameMesh.castShadow = true;
			frameMesh.receiveShadow = true;
			frameMesh.name = 'door-frame';
			group.add(frameMesh);
		}
	}

	const leafWidth = layout.leaf.maxU - layout.leaf.minU;
	const leafHeight = layout.leaf.maxY - layout.leaf.minY;
	const doorThickness = Math.max(0.01, settings.doorThickness);
	let hingePivot: THREE.Object3D | undefined;
	if (leafWidth > 0 && leafHeight > 0) {
		const middle = (layout.leaf.minU + layout.leaf.maxU) / 2;
		const seam = Math.min(0.002, leafWidth * 0.01);
		const leaves = double
			? [
					{ rect: { ...layout.leaf, maxU: middle - seam }, side: 'left' as const },
					{ rect: { ...layout.leaf, minU: middle + seam }, side: 'right' as const }
				]
			: [{ rect: layout.leaf, side: hingeSide }];
		if (double) {
			hingePivot = new THREE.Group();
			hingePivot.name = 'door-hinge-pivot';
			Object.assign(hingePivot.userData, {
				openingId: opening.id,
				interactionKind: 'double-door',
				aimU: (rect.minU + rect.maxU) / 2,
				aimY: (rect.minY + rect.maxY) / 2
			});
			group.add(hingePivot);
		}
		for (const { rect: leaf, side } of leaves) {
			const pivot = new THREE.Object3D();
			const width = leaf.maxU - leaf.minU;
			const hingeU = side === 'left' ? leaf.minU : leaf.maxU;
			pivot.name = double ? 'door-leaf-hinge' : 'door-hinge-pivot';
			Object.assign(pivot.userData, {
				openingId: opening.id,
				hingeSide: side,
				aimU: (rect.minU + rect.maxU) / 2,
				aimY: (rect.minY + rect.maxY) / 2,
				minU: double && side === 'right' ? middle : rect.minU,
				maxU: double && side === 'left' ? middle : rect.maxU,
				minY: rect.minY,
				maxY: rect.maxY,
				wallThickness,
				doorThickness,
				leafWidth: width,
				leafHeight
			});
			pivot.position.set(hingeU, leaf.minY, 0);
			const geometry = arched
				? archedDoorLeafGeometry(layout.leaf, leaf, springY, doorThickness)
				: new THREE.BoxGeometry(width, leafHeight, doorThickness).translate(
						(leaf.minU + leaf.maxU) / 2,
						(leaf.minY + leaf.maxY) / 2,
						0
					);
			geometry.translate(-hingeU, -leaf.minY, 0);
			const leafMesh = new THREE.Mesh(
				geometry,
				materialManager.getMaterial('door-leaf', opening.material)
			);
			leafMesh.castShadow = leafMesh.receiveShadow = true;
			leafMesh.name = 'door-leaf';
			pivot.add(leafMesh);
			// Keep handles below the curve even on unusually wide, low arched doors.
			const handleHeight = arched
				? Math.min(leafHeight, Math.max(0.1, springY - leaf.minY))
				: leafHeight;
			const handles = buildDoorHandleMesh(
				computeDoorHandlePlacement(width, handleHeight, side),
				doorThickness,
				materialManager.getMaterial('door-handle', undefined)
			);
			if (handles) pivot.add(handles);
			if (settings.showDoorHinge) addHingeMarker(pivot);
			if (double) hingePivot!.add(pivot);
			else {
				hingePivot = pivot;
				group.add(pivot);
			}
		}
	}

	if (arched && hingePivot) {
		hingePivot.userData.archCorners = doorArchCollisionSegments(rect);
		hingePivot.userData.archWallThickness = wallThickness;
	}

	if (settings.showOpeningBounds) {
		addWireframeBox(group, rect, wallThickness, openingBoundsMaterial, 'debug-opening-bounds');
	}
	if (settings.showOpeningFrameBounds) {
		addWireframeBox(
			group,
			layout.leaf,
			layout.frameDepth,
			openingFrameBoundsMaterial,
			'debug-frame-bounds'
		);
	}

	if (group.children.length === 0) return null;
	return { group, hingePivot };
}

/**
 * One latch-side handle for a single door face. `faceSign` is +1/−1 along the leaf's thickness
 * axis (out of that face); `leverSign` aims the grip toward the hinge so the handle sits on the
 * swing edge, not the pivot. Built without a scale-flip so FrontSide winding stays outward.
 */
function buildOneDoorHandleGeometry(
	leverSign: number,
	faceSign: number
): THREE.BufferGeometry | null {
	const plate = new THREE.BoxGeometry(0.034, 0.1, 0.01);
	plate.translate(0, 0, faceSign * 0.005);
	const stem = new THREE.CylinderGeometry(0.009, 0.009, 0.02, 8);
	stem.rotateX(Math.PI / 2);
	stem.translate(0, 0, faceSign * 0.02);
	const lever = new THREE.BoxGeometry(0.08, 0.014, 0.014);
	lever.translate(leverSign * 0.04, 0, faceSign * 0.03);
	const merged = mergeGeometries([plate, stem, lever], false);
	plate.dispose();
	stem.dispose();
	lever.dispose();
	return merged;
}

/** Two handles — one on each face of the leaf — parented under the hinge pivot so they swing with the door. */
function buildDoorHandleMesh(
	placement: DoorHandlePlacement,
	doorThickness: number,
	material: THREE.Material
): THREE.Mesh | null {
	const half = doorThickness / 2;
	const pieces: THREE.BufferGeometry[] = [];
	for (const faceSign of [1, -1] as const) {
		const handle = buildOneDoorHandleGeometry(placement.leverSign, faceSign);
		if (!handle) continue;
		handle.translate(placement.localX, placement.localY, faceSign * half);
		pieces.push(handle);
	}
	if (pieces.length === 0) return null;
	const merged = mergeGeometries(pieces, false);
	for (const piece of pieces) piece.dispose();
	if (!merged) return null;
	const mesh = new THREE.Mesh(merged, material);
	mesh.castShadow = true;
	mesh.receiveShadow = true;
	mesh.name = 'door-handles';
	return mesh;
}

/** Merges a small set of axis-aligned boxes (each in ABSOLUTE wall-local U/Y coordinates, exactly like `WallGeometryBuilder.buildWallGeometry`'s own solid segments) into one draw call — one merged mesh per opening per part (frame), rather than 3-4 separate meshes, per the feature's render-cost requirement. */
function buildMergedBoxMesh(
	rects: readonly UvRect[],
	depth: number,
	material: THREE.Material
): THREE.Mesh | null {
	const geometries: THREE.BoxGeometry[] = [];
	for (const rect of rects) {
		const width = rect.maxU - rect.minU;
		const height = rect.maxY - rect.minY;
		if (width <= 0 || height <= 0) continue;
		const geometry = new THREE.BoxGeometry(width, height, depth);
		geometry.translate((rect.minU + rect.maxU) / 2, (rect.minY + rect.maxY) / 2, 0);
		geometries.push(geometry);
	}
	if (geometries.length === 0) return null;

	const merged = mergeGeometries(geometries, false);
	for (const geometry of geometries) geometry.dispose();
	return merged ? new THREE.Mesh(merged, material) : null;
}
