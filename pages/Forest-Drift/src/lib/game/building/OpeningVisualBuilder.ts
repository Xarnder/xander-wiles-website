import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { BuildingMaterialManager } from './BuildingMaterialManager';
import {
	clampFrameDepth,
	computeDoorFrameLayout,
	computeWindowFrameLayout,
	hingeSideForOpening
} from './openingVisualMath';
import type { UvRect } from './openingVisualMath';
import type { WallOpeningDefinition } from './WallTypes';

/** How thick the glass pane itself is (metres), independent of the frame's own configured depth — always clamped to the wall thickness like every other depth here, via `clampFrameDepth`. */
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
	 * Present only for a door — `DoorInteractionController` swings the leaf by animating
	 * `hingePivot.rotation.y` (see `buildDoorVisual`'s doc comment).
	 */
	hingePivot?: THREE.Object3D;
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
	glassMaterial: THREE.Material
): OpeningVisualResult | null {
	if (opening.maxU <= opening.minU || opening.maxY <= opening.minY) return null;

	if (opening.type === 'window') {
		const object = buildWindowVisual(
			opening,
			wallThickness,
			settings,
			materialManager,
			glassMaterial
		);
		return object ? { object } : null;
	}

	const result = buildDoorVisual(opening, wallThickness, settings, materialManager);
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
	glassMaterial: THREE.Material
): THREE.Group | null {
	if (
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
		const frameMaterial = materialManager.getMaterial('window-frame', undefined);
		const frameMesh = buildMergedBoxMesh(
			[layout.left, layout.right, layout.top, layout.bottom],
			layout.frameDepth,
			frameMaterial
		);
		if (frameMesh) {
			frameMesh.castShadow = true;
			frameMesh.receiveShadow = true;
			frameMesh.name = 'window-frame';
			group.add(frameMesh);
		}
	}

	if (settings.windowGlassEnabled) {
		const glassDepth = clampFrameDepth(GLASS_THICKNESS, wallThickness);
		const glassMesh = buildMergedBoxMesh([layout.glass], glassDepth, glassMaterial);
		if (glassMesh) {
			glassMesh.castShadow = false;
			glassMesh.receiveShadow = false;
			glassMesh.name = 'window-glass';
			group.add(glassMesh);
		}
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
 * `DoorAssembly = frame + hingePivot > doorLeaf` (see the class-level doc comment and the README).
 * The leaf's own geometry is translated so its LOCAL origin sits exactly on the hinge edge —
 * `hingeU`, at `hingePivot`'s own position — rather than being centred the way every other piece
 * here is; `DoorInteractionController` swings it open by animating `hingePivot.rotation.y`, with
 * no geometry rebuild and no repositioning.
 *
 * `DoorInteractionController.getCollisionRects()` builds a live leaf collider from this pivot's
 * world matrix (closed = fills the doorway hole; open = swung aside so the hole is walkable).
 */
function buildDoorVisual(
	opening: WallOpeningDefinition,
	wallThickness: number,
	settings: OpeningVisualSettings,
	materialManager: BuildingMaterialManager
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

	if (settings.doorFramesEnabled) {
		const frameMaterial = materialManager.getMaterial('door-frame', undefined);
		const frameMesh = buildMergedBoxMesh(
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
		hingePivot = new THREE.Object3D();
		hingePivot.name = 'door-hinge-pivot';
		hingePivot.userData.openingId = opening.id;
		hingePivot.userData.hingeSide = hingeSide;
		hingePivot.userData.aimU = (rect.minU + rect.maxU) / 2;
		hingePivot.userData.aimY = (rect.minY + rect.maxY) / 2;
		hingePivot.userData.minU = rect.minU;
		hingePivot.userData.maxU = rect.maxU;
		hingePivot.userData.minY = rect.minY;
		hingePivot.userData.maxY = rect.maxY;
		hingePivot.userData.wallThickness = wallThickness;
		hingePivot.userData.doorThickness = doorThickness;
		hingePivot.userData.leafWidth = leafWidth;
		hingePivot.userData.leafHeight = leafHeight;
		hingePivot.position.set(layout.hingeU, layout.leaf.minY, 0);
		const leafGeometry = new THREE.BoxGeometry(leafWidth, leafHeight, doorThickness);
		const sign = hingeSide === 'left' ? 1 : -1;
		leafGeometry.translate(sign * (leafWidth / 2), leafHeight / 2, 0);

		const leafMaterial = materialManager.getMaterial('door-leaf', undefined);
		const leafMesh = new THREE.Mesh(leafGeometry, leafMaterial);
		leafMesh.castShadow = true;
		leafMesh.receiveShadow = true;
		leafMesh.name = 'door-leaf';
		hingePivot.add(leafMesh);
		if (settings.showDoorHinge) addHingeMarker(hingePivot);
		group.add(hingePivot);
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
