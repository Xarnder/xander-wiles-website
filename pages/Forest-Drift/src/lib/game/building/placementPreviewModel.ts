import { createFurnitureGroup } from './FurnitureGeometry';
import { pillarDefinition } from './PillarTypes';
import * as THREE from 'three';
import { compileBarrierLevel } from './BarrierGeometryCompiler';
import { layoutBarrier } from './barrierLayout';
import { barrierWoodStyle } from './BarrierManager';
import { BARRIER_WOODS, barrierMainColor, sanitizeBarrierStyle } from './BarrierTypes';
import { beamAlongWallSize, beamExtentForOrientation } from './beamMath';
import type { BuildingMaterialManager } from './BuildingMaterialManager';
import {
	isFloorDetailTool,
	placementColorForTool,
	type BuildingSettings,
	type CustomizablePlacementToolId,
	type FloorDetailToolId
} from './FoundationTypes';
import { buildFloorDetailGeometry } from './FloorDetailGeometryBuilder';
import type { FloorDetailDefinition } from './FloorDetailTypes';
import {
	buildFloorDetailBoxes,
	buildFloorDetailStrips,
	rectanglePointsFromCorners
} from './floorDetailMath';
import type { FloorDetailKind } from './FloorDetailTypes';
import { colorMaterialFromHex } from './MaterialTypes';
import {
	buildOpeningVisual,
	getGlassMaterial,
	type OpeningVisualSettings
} from './OpeningVisualBuilder';
import { buildSlabGeometry } from './SlabGeometryBuilder';
import { buildSlabOpeningFrame } from './SlabOpeningFrameBuilder';
import { buildStairFrame } from './StairFrameBuilder';
import { buildSkirtingRunGeometry } from './SkirtingRunManager';
import { buildStairRailing } from './StairRailingBuilder';
import { buildStairGeometry } from './StairGeometryBuilder';
import { computeStairMetrics } from './stairMath';
import { buildBeamVisual } from './WallBeamBuilder';
import { buildStandaloneWallFrame } from './WallFrameBuilder';
import { buildWallGeometry } from './WallGeometryBuilder';
import { computeSolidWallSegments } from './wallGeometryMath';
import type { WallOpeningDefinition } from './WallTypes';

export interface PlacementPreviewMaterials {
	building: BuildingMaterialManager;
	floorDetail: THREE.MeshStandardMaterial;
}

const PREVIEW_MARGIN = 0.35;

function openingVisualSettings(settings: BuildingSettings): OpeningVisualSettings {
	return {
		windowFramesEnabled: settings.windowFramesEnabled,
		windowFrameWidth: settings.windowFrameWidth,
		windowFrameDepth: settings.windowFrameDepth,
		windowGlassEnabled: settings.windowGlassEnabled,
		doorFramesEnabled: settings.doorFramesEnabled,
		doorFrameWidth: settings.doorFrameWidth,
		doorFrameDepth: settings.doorFrameDepth,
		doorThickness: settings.doorThickness,
		doorClearance: settings.doorClearance,
		showOpeningBounds: false,
		showOpeningFrameBounds: false,
		showDoorHinge: false
	};
}

function disableShadows(root: THREE.Object3D): void {
	root.traverse((child) => {
		if (child instanceof THREE.Mesh) {
			child.castShadow = false;
			child.receiveShadow = false;
		}
	});
}

function fitOpening(
	length: number,
	height: number,
	width: number,
	minY: number,
	spanY: number
): { minU: number; maxU: number; minY: number; maxY: number } {
	const pieceW = Math.min(Math.max(width, 0.2), Math.max(0.25, length - PREVIEW_MARGIN * 2));
	const pieceH = Math.min(Math.max(spanY, 0.2), Math.max(0.25, height - 0.05));
	let y0 = Math.max(0, minY);
	let y1 = y0 + pieceH;
	if (y1 > height) {
		y1 = height;
		y0 = Math.max(0, y1 - pieceH);
	}
	const minU = (length - pieceW) / 2;
	return { minU, maxU: minU + pieceW, minY: y0, maxY: Math.max(y0 + 0.05, y1) };
}

function wallMesh(
	length: number,
	height: number,
	thickness: number,
	openings: WallOpeningDefinition[],
	materials: BuildingMaterialManager
): THREE.Mesh {
	const segments = computeSolidWallSegments(length, height, openings);
	const geometry = buildWallGeometry(segments, thickness, height);
	const mesh = new THREE.Mesh(geometry, materials.getMaterial('wall', undefined));
	mesh.name = 'preview-wall';
	return mesh;
}

function addWallFrame(
	group: THREE.Group,
	length: number,
	height: number,
	thickness: number,
	settings: BuildingSettings,
	materials: BuildingMaterialManager
): void {
	const frame = buildStandaloneWallFrame(
		length,
		height,
		thickness,
		{
			wallFrameEnabled: settings.wallFrameEnabled,
			wallFrameWidth: settings.wallFrameWidth,
			wallFrameDepthExtra: settings.wallFrameDepthExtra,
			showWallFrameBounds: false,
			showWallFrameJoins: false
		},
		undefined,
		materials
	);
	if (frame) group.add(frame);
}

function buildWallPreview(
	settings: BuildingSettings,
	materials: BuildingMaterialManager,
	openings: WallOpeningDefinition[],
	beams: boolean
): THREE.Group {
	const height = Math.max(0.5, settings.wallHeight);
	const thickness = Math.max(0.05, settings.wallThickness);
	const openingWidth =
		openings[0] !== undefined ? openings[0].maxU - openings[0].minU : settings.beamHeight;
	const length = Math.max(
		3.2,
		openings[0]?.type === 'window' ? openingWidth * 2 + 0.8 : openingWidth + 1.4
	);
	const fitted = openings.map((opening, index) => {
		const placed = fitOpening(
			length,
			height,
			opening.maxU - opening.minU,
			opening.minY,
			opening.maxY - opening.minY
		);
		return { ...opening, id: opening.id || `preview-opening-${index}`, ...placed };
	});

	const group = new THREE.Group();
	group.name = 'preview-wall-assembly';
	group.add(wallMesh(length, height, thickness, fitted, materials));
	addWallFrame(group, length, height, thickness, settings, materials);

	for (const opening of fitted) {
		const visual = buildOpeningVisual(
			opening,
			thickness,
			openingVisualSettings(settings),
			materials,
			getGlassMaterial()
		);
		if (visual) group.add(visual.object);
	}

	if (beams) {
		const along = beamAlongWallSize(
			settings.beamOrientation,
			settings.beamWidth,
			settings.beamHeight
		);
		const vertical = beamExtentForOrientation(
			settings.beamOrientation,
			height * 0.5,
			settings.beamHeight,
			height,
			settings.openingGridSize
		);
		const placed = fitOpening(length, height, along, vertical.minY, vertical.maxY - vertical.minY);
		const beam = buildBeamVisual(
			{
				id: 'preview-beam',
				minU: placed.minU,
				maxU: placed.maxU,
				minY: placed.minY,
				maxY: placed.maxY,
				material: colorMaterialFromHex(settings.beamColor)
			},
			thickness,
			{ beamDepthExtra: settings.beamDepthExtra },
			materials
		);
		if (beam) group.add(beam);
	}

	return group;
}

function buildPolygonWallPreview(
	settings: BuildingSettings,
	materials: BuildingMaterialManager
): THREE.Group {
	const height = Math.max(0.5, settings.wallHeight);
	const thickness = Math.max(0.05, settings.wallThickness);
	const run = 2.2;
	const stub = 1.6;
	const group = new THREE.Group();
	group.name = 'preview-polygon-wall';

	const a = wallMesh(run, height, thickness, [], materials);
	group.add(a);
	addWallFrame(group, run, height, thickness, settings, materials);

	const stubGroup = new THREE.Group();
	stubGroup.add(wallMesh(stub, height, thickness, [], materials));
	addWallFrame(stubGroup, stub, height, thickness, settings, materials);
	stubGroup.position.set(run, 0, 0);
	stubGroup.rotation.y = -Math.PI / 2;
	group.add(stubGroup);

	return group;
}

/**
 * A wall corner with the next skirting run drawn along its centre line: the boards land on the
 * inside faces at the offset the tool would use (half the wall here in Auto; the manual value
 * otherwise), so the panel shows whether the offset is right.
 */
function buildSkirtingPreview(
	settings: BuildingSettings,
	materials: BuildingMaterialManager
): THREE.Group {
	const draft = settings.skirtingRun;
	const grid = Math.max(0.05, settings.buildingGridSize);
	const height = 0.9;
	const thickness = Math.max(0.05, settings.wallThickness);
	const runCells = Math.max(2, Math.round(2.2 / grid));
	const stubCells = Math.max(2, Math.round(1.6 / grid));
	const run = runCells * grid;
	const stub = stubCells * grid;
	const group = new THREE.Group();
	group.name = 'preview-skirting';
	group.add(wallMesh(run, height, thickness, [], materials));
	const stubWall = wallMesh(stub, height, thickness, [], materials);
	stubWall.position.set(run, 0, 0);
	stubWall.rotation.y = -Math.PI / 2;
	group.add(stubWall);
	const offset = draft.offsetMode === 'auto' ? thickness / 2 : draft.manualOffset;
	const boards = new THREE.Mesh(
		buildSkirtingRunGeometry(
			{
				id: 'preview',
				foundationId: 'preview',
				levelIndex: 0,
				baseY: 0,
				points: [
					{ gridX: 0, gridZ: 0 },
					{ gridX: runCells, gridZ: 0 },
					{ gridX: runCells, gridZ: stubCells }
				],
				closed: false,
				segments: [
					{ side: 1, offset },
					{ side: 1, offset }
				],
				height: draft.height,
				depth: draft.depth
			},
			grid
		),
		materials.getMaterial('skirting', draft.color ? colorMaterialFromHex(draft.color) : undefined)
	);
	group.add(boards);
	return group;
}

/** An L of the next fence/railing — a run, a corner post and a return — from the real generator. */
function buildBarrierPreview(
	settings: BuildingSettings,
	materials: BuildingMaterialManager
): THREE.Group {
	const style = sanitizeBarrierStyle(settings.barrier.style);
	const run = Math.max(2.4, style.structuralPostSpacing * 1.2);
	const points = [
		{ x: 0, y: 0, z: 0 },
		{ x: run, y: 0, z: 0 },
		{ x: run, y: 0, z: -1.6 }
	];
	const layout = layoutBarrier({ points, closed: false, baseMode: 'flat', style });
	const compiled = compileBarrierLevel(layout, style, { lod: 0, origin: points[0], seed: 7 });
	const group = new THREE.Group();
	group.name = 'preview-barrier';
	const main = materials.getStyledMaterial(
		'barrier',
		colorMaterialFromHex(barrierMainColor({ style, material: undefined })),
		barrierWoodStyle(style.wood),
		{ ownWoodCoords: true }
	);
	if (compiled.main) group.add(new THREE.Mesh(compiled.main, main));
	if (compiled.accent) {
		const wood = style.accentWood ?? style.wood;
		const accent = materials.getStyledMaterial(
			'barrier',
			colorMaterialFromHex(BARRIER_WOODS[wood].color),
			barrierWoodStyle(wood),
			{ ownWoodCoords: true }
		);
		group.add(new THREE.Mesh(compiled.accent, accent));
	}
	const floor = new THREE.Mesh(
		new THREE.PlaneGeometry(run + 0.4, 2.1).rotateX(-Math.PI / 2),
		materials.getMaterial('slab-floor', undefined)
	);
	floor.position.set(run / 2, -0.005, -0.7);
	group.add(floor);
	return group;
}

function floorKind(toolId: FloorDetailToolId): FloorDetailKind {
	if (toolId === 'floor-path') return 'path';
	if (toolId === 'floor-planks') return 'planks';
	if (toolId === 'floor-tiles') return 'tiles';
	return 'carpet';
}

function buildFloorPreview(
	toolId: FloorDetailToolId,
	settings: BuildingSettings,
	materials: PlacementPreviewMaterials
): THREE.Group {
	const kind = floorKind(toolId);
	const grid = Math.max(0.1, settings.buildingGridSize);
	const points =
		kind === 'path'
			? [
					{ gridX: 0, gridZ: 2 },
					{ gridX: 8, gridZ: 2 }
				]
			: rectanglePointsFromCorners({ gridX: 0, gridZ: 0 }, { gridX: 6, gridZ: 6 });
	const draft: FloorDetailDefinition = {
		id: 'preview-floor-detail',
		foundationId: 'preview',
		levelIndex: 0,
		kind,
		hostY: 0,
		renderMode: settings.floorDetailRenderMode === '2d' ? '2d' : '3d',
		points,
		colors: [settings.floorDetailColorA, settings.floorDetailColorB],
		plankWidth: settings.floorDetailPlankWidth,
		plankDirection: settings.floorDetailPlankDirection === 'z' ? 'z' : 'x',
		tileSize: settings.floorDetailTileSize,
		tilePattern: settings.floorDetailTilePattern,
		pathWidth: settings.floorDetailPathWidth,
		pathFraming: settings.floorDetailPathFraming
	};
	const boxes = buildFloorDetailBoxes(draft, grid);
	const strips = buildFloorDetailStrips(draft, grid);
	const group = new THREE.Group();
	group.name = 'preview-floor-detail';
	const mesh = new THREE.Mesh(buildFloorDetailGeometry(boxes, strips), materials.floorDetail);
	mesh.name = 'preview-floor-detail-mesh';
	group.add(mesh);

	let minX = Infinity;
	let maxX = -Infinity;
	let minZ = Infinity;
	let maxZ = -Infinity;
	for (const box of boxes) {
		minX = Math.min(minX, box.minX);
		maxX = Math.max(maxX, box.maxX);
		minZ = Math.min(minZ, box.minZ);
		maxZ = Math.max(maxZ, box.maxZ);
	}
	for (const strip of strips) {
		for (const point of [...strip.left, ...strip.right]) {
			minX = Math.min(minX, point.x);
			maxX = Math.max(maxX, point.x);
			minZ = Math.min(minZ, point.z);
			maxZ = Math.max(maxZ, point.z);
		}
	}
	const pad = 0.28;
	const sizeX = Number.isFinite(minX)
		? Math.max(1.2, maxX - minX + pad * 2)
		: Math.max(grid * 6, 1.2);
	const sizeZ = Number.isFinite(minZ)
		? Math.max(1.2, maxZ - minZ + pad * 2)
		: Math.max(grid * 6, 1.2);
	const slab = new THREE.Mesh(
		new THREE.BoxGeometry(sizeX, 0.04, sizeZ),
		materials.building.getMaterial('slab-floor', undefined)
	);
	slab.name = 'preview-host-floor';
	slab.position.set(
		Number.isFinite(minX) ? (minX + maxX) / 2 : 0,
		-0.02,
		Number.isFinite(minZ) ? (minZ + maxZ) / 2 : 0
	);
	group.add(slab);
	return group;
}

function buildStairPreview(
	settings: BuildingSettings,
	materials: BuildingMaterialManager
): THREE.Group {
	const grid = Math.max(0.1, settings.buildingGridSize);
	const stair = {
		minGridX: 0,
		maxGridX: 8,
		minGridZ: 0,
		maxGridZ: 4,
		direction: '+x' as const,
		gridSizeAtCreation: grid,
		baseY: 0
	};
	const metrics = computeStairMetrics(stair);
	const bounds = {
		minLocalX: 0,
		maxLocalX: 8 * grid,
		minLocalZ: 0,
		maxLocalZ: 4 * grid
	};
	const group = new THREE.Group();
	group.name = 'preview-stair-assembly';

	const mesh = new THREE.Mesh(
		buildStairGeometry(bounds, '+x', 0, metrics),
		materials.getMaterial('stair', colorMaterialFromHex(settings.stairColor))
	);
	mesh.name = 'preview-stair';
	group.add(mesh);

	const frame = buildStairFrame(
		bounds,
		'+x',
		0,
		metrics,
		{
			stairFrameEnabled: settings.stairFrameEnabled,
			stairFrameWidth: settings.stairFrameWidth,
			stairFrameDepthExtra: settings.stairFrameDepthExtra
		},
		materials
	);
	if (frame) group.add(frame);
	// Railings are fences in the current Fence / Railing style — the same thing the stair will get.
	if (settings.stairRailingsEnabled) {
		const railing = buildStairRailing(bounds, '+x', 0, metrics, settings.barrier.style, materials);
		if (railing) group.add(railing.group);
	}

	const pad = 0.35;
	const topY = metrics.totalRise;
	const bottomY = topY - Math.max(0.08, settings.floorThickness);
	const holeOpen = settings.stairOpeningEnabled;
	const holePolygon = [
		{ x: bounds.minLocalX, z: bounds.minLocalZ },
		{ x: bounds.maxLocalX, z: bounds.minLocalZ },
		{ x: bounds.maxLocalX, z: bounds.maxLocalZ },
		{ x: bounds.minLocalX, z: bounds.maxLocalZ }
	];
	const landing = new THREE.Mesh(
		buildSlabGeometry(
			[
				{ x: -pad, z: -pad },
				{ x: bounds.maxLocalX + pad, z: -pad },
				{ x: bounds.maxLocalX + pad, z: bounds.maxLocalZ + pad },
				{ x: -pad, z: bounds.maxLocalZ + pad }
			],
			topY,
			bottomY,
			holeOpen ? [holePolygon] : []
		),
		materials.getMaterial('slab-floor', undefined)
	);
	landing.name = 'preview-landing';
	group.add(landing);

	if (holeOpen) {
		const openingFrame = buildSlabOpeningFrame(
			{
				minX: bounds.minLocalX,
				maxX: bounds.maxLocalX,
				minZ: bounds.minLocalZ,
				maxZ: bounds.maxLocalZ
			},
			topY,
			bottomY,
			{
				slabOpeningFrameEnabled: settings.slabOpeningFrameEnabled,
				slabOpeningFrameWidth: settings.slabOpeningFrameWidth,
				slabOpeningFrameDepthExtra: settings.slabOpeningFrameDepthExtra
			},
			materials
		);
		if (openingFrame) group.add(openingFrame);
	}
	return group;
}

/**
 * Tiny stand-in of the next piece the customise modal is editing, built with the same geometry
 * helpers the world uses. Lives only in the modal preview renderer — never persisted.
 */
export function buildPlacementPreviewModel(
	toolId: CustomizablePlacementToolId,
	settings: BuildingSettings,
	materials: PlacementPreviewMaterials
): THREE.Group {
	let group: THREE.Group;
	if (toolId === 'pillar') {
		const wood = materials.building.getMaterial('wall-beam', undefined);
		group = new THREE.Group();
		group.add(
			createFurnitureGroup(
				pillarDefinition(settings.pillar, { x: 0, y: 0, z: 0 }, null, 'pillar-preview'),
				{ primary: wood, secondary: wood, accent: wood, emissive: wood }
			)
		);
	} else if (toolId === 'window') {
		const color = placementColorForTool(settings, 'window');
		group = buildWallPreview(
			settings,
			materials.building,
			[
				{
					id: 'preview-window',
					shutters: { mode: settings.windowShutterMode ?? 'auto', side: 1 },
					type: 'window',
					minU: 0,
					maxU: settings.windowWidth,
					minY: settings.windowSillHeight,
					maxY: settings.windowSillHeight + settings.windowHeight,
					material: color ? colorMaterialFromHex(color) : undefined
				}
			],
			false
		);
	} else if (toolId === 'door') {
		const color = placementColorForTool(settings, 'door');
		group = buildWallPreview(
			settings,
			materials.building,
			[
				{
					id: 'preview-door',
					doorStyle: { double: settings.doorDouble ?? false, arched: settings.doorArched ?? false },
					type: 'door',
					minU: 0,
					maxU: settings.doorWidth,
					minY: settings.doorSillHeight,
					maxY: settings.doorSillHeight + settings.doorHeight,
					material: color ? colorMaterialFromHex(color) : undefined
				}
			],
			false
		);
	} else if (toolId === 'beam') {
		group = buildWallPreview(settings, materials.building, [], true);
	} else if (toolId === 'polygon-wall') {
		group = buildPolygonWallPreview(settings, materials.building);
	} else if (toolId === 'barrier') {
		group = buildBarrierPreview(settings, materials.building);
	} else if (toolId === 'skirting') {
		group = buildSkirtingPreview(settings, materials.building);
	} else if (isFloorDetailTool(toolId)) {
		group = buildFloorPreview(toolId, settings, materials);
	} else if (toolId === 'stairs') {
		group = buildStairPreview(settings, materials.building);
	} else {
		group = buildWallPreview(settings, materials.building, [], false);
	}

	disableShadows(group);
	return group;
}

/** Refresh fixed child matrices before measuring, so repeated resizes never re-centre stale bounds. */
export function centerPlacementPreviewModel(group: THREE.Group): THREE.Box3 {
	group.updateMatrixWorld(true);
	const box = new THREE.Box3().setFromObject(group);
	const center = box.getCenter(new THREE.Vector3());
	group.position.sub(center);
	group.updateMatrixWorld(true);
	return box.translate(center.negate());
}

/** Disposes mesh/line geometries under a preview root. Shared glass / cached paint materials stay. */
export function disposePreviewObject(object: THREE.Object3D): void {
	object.traverse((child) => {
		if (child instanceof THREE.Mesh || child instanceof THREE.LineSegments) {
			child.geometry.dispose();
		}
	});
	object.removeFromParent();
}
