import {
	buildingGridToLocal,
	foundationLocalSize,
	isBuildingGridPointInsideFoundation
} from './FoundationLocalMath';
import type { BuildingGridPoint } from './FoundationLocalMath';
import type { FoundationManager } from './FoundationManager';
import { validateSlabPolygon } from './slabMath';
import type { SlabDefinition, SlabType } from './SlabTypes';
import type { SlabManager } from './SlabManager';
import type { WallManager } from './WallManager';
import {
	computeWallLength,
	findOverlappingOpening,
	isOpeningWithinWallBounds,
	validateWallLength
} from './wallGeometryMath';
import { pathSelfIntersects } from './wallPathMath';
import type { WallJoinStyle } from './wallPathMath';
import type { WallPathDefinition } from './WallPathTypes';
import type { WallPathManager } from './WallPathManager';
import type {
	FoundationBuildingDefinition,
	WallDefinition,
	WallOpeningDefinition,
	WallOpeningType
} from './WallTypes';

export interface WallEndpointTarget extends BuildingGridPoint {
	foundationId: string;
}

export interface AddWallParams {
	start: WallEndpointTarget;
	end: WallEndpointTarget;
	baseY: number;
	height: number;
	thickness: number;
	minimumWallLength: number;
}

export interface AddWallPathParams {
	points: WallEndpointTarget[];
	closed: boolean;
	baseY: number;
	wallHeight: number;
	wallThickness: number;
	joinStyle: WallJoinStyle;
	miterLimit: number;
	minimumSegmentLength: number;
}

export interface AddSlabParams {
	points: WallEndpointTarget[];
	type: SlabType;
	levelIndex: number;
	localY: number;
	thickness: number;
}

export interface OpeningCandidate {
	type: WallOpeningType;
	minU: number;
	maxU: number;
	minY: number;
	maxY: number;
}

export interface AddOpeningParams extends OpeningCandidate {
	wallId: string;
	edgeMargin: number;
	spacing: number;
}

export interface BuildingMutationResult<T> {
	valid: boolean;
	reason?: string;
	value?: T;
}

export interface BuildingManagerOptions {
	foundationManager: FoundationManager;
	wallManager: WallManager;
	wallPathManager: WallPathManager;
	slabManager: SlabManager;
	getVertexSpacing: () => number;
	getBuildingGridSize: () => number;
	getCornerOpeningMargin: () => number;
}

/**
 * The single entry point every building tool goes through to mutate building state. Validates the
 * "buildings can only exist on foundations" rule set at the data layer — not just in the tools —
 * per the README: a wall's two endpoints are independently resolved (each tagged with the
 * foundation it was targeted on) so "different foundations" is a real, rejectable case rather than
 * something the API shape makes impossible to even express. WallManager/WallPathManager/SlabManager
 * remain the permanent owners of their own state; this class only validates and delegates.
 *
 * Standalone walls (Straight Wall Tool) and wall-path segments (Polygon/Continuous Wall Tool) are
 * unified behind one `getWall`/`addOpening`/`removeOpening` surface: a path segment is looked up
 * via `WallPathManager.getSegmentAsWallView()`, which synthesizes the exact same WallDefinition
 * shape a standalone wall has — so Window/Door tools (via OpeningToolBase) never need to know which
 * kind of wall they're targeting. See WallPathManager's doc comment for why this is safe.
 *
 * Walls/paths/slabs all take a `baseY` from the caller rather than resolving it themselves —
 * BuildingManager deliberately knows nothing about building levels (BuildingLevelManager); the
 * *tool* resolves "what Y should this new element start at" from the current level and passes the
 * plain number in, keeping this class's only job "is this placement valid, and where does it go."
 */
export class BuildingManager {
	private readonly foundationManager: FoundationManager;
	private readonly wallManager: WallManager;
	private readonly wallPathManager: WallPathManager;
	private readonly slabManager: SlabManager;
	private readonly getVertexSpacing: () => number;
	private readonly getBuildingGridSize: () => number;
	private readonly getCornerOpeningMargin: () => number;

	constructor(options: BuildingManagerOptions) {
		this.foundationManager = options.foundationManager;
		this.wallManager = options.wallManager;
		this.wallPathManager = options.wallPathManager;
		this.slabManager = options.slabManager;
		this.getVertexSpacing = options.getVertexSpacing;
		this.getBuildingGridSize = options.getBuildingGridSize;
		this.getCornerOpeningMargin = options.getCornerOpeningMargin;
	}

	addWall(params: AddWallParams): BuildingMutationResult<WallDefinition> {
		const { start, end } = params;

		if (start.foundationId !== end.foundationId) {
			return { valid: false, reason: 'Both points must be on the same foundation' };
		}

		const foundation = this.foundationManager.getFoundation(start.foundationId);
		if (!foundation) return { valid: false, reason: 'Foundation not found' };

		const vertexSpacing = this.getVertexSpacing();
		const buildingGridSize = this.getBuildingGridSize();
		const { width, depth } = foundationLocalSize(foundation, vertexSpacing);

		if (
			!isBuildingGridPointInsideFoundation(start, buildingGridSize, width, depth) ||
			!isBuildingGridPointInsideFoundation(end, buildingGridSize, width, depth)
		) {
			return { valid: false, reason: 'Wall must stay within the foundation' };
		}

		const lengthCheck = validateWallLength(
			{
				startGridX: start.gridX,
				startGridZ: start.gridZ,
				endGridX: end.gridX,
				endGridZ: end.gridZ
			},
			buildingGridSize,
			params.minimumWallLength
		);
		if (!lengthCheck.valid) return { valid: false, reason: lengthCheck.reason };

		const wall: WallDefinition = {
			id: crypto.randomUUID(),
			foundationId: start.foundationId,
			startGridX: start.gridX,
			startGridZ: start.gridZ,
			endGridX: end.gridX,
			endGridZ: end.gridZ,
			baseY: params.baseY,
			height: params.height,
			thickness: params.thickness,
			openings: []
		};

		this.wallManager.addWall(wall);
		return { valid: true, value: wall };
	}

	removeWall(wallId: string): boolean {
		return this.wallManager.removeWall(wallId);
	}

	/**
	 * Validates and creates a whole connected wall path in one shot — every point must be inside
	 * the SAME foundation (the first point establishes it), no two consecutive points (including
	 * the closing pair, when `closed`) may coincide, every resulting segment must meet the minimum
	 * length, and the path must not obviously self-intersect (wallPathMath.pathSelfIntersects).
	 * Corner-join geometry itself is computed later, at render time, from `points` alone — nothing
	 * about the join is decided or stored here.
	 */
	addWallPath(params: AddWallPathParams): BuildingMutationResult<WallPathDefinition> {
		const { points, closed } = params;
		if (points.length < 2) {
			return { valid: false, reason: 'A wall path needs at least 2 points' };
		}

		const foundationId = points[0].foundationId;
		if (points.some((p) => p.foundationId !== foundationId)) {
			return { valid: false, reason: 'All points must be on the same foundation' };
		}

		const foundation = this.foundationManager.getFoundation(foundationId);
		if (!foundation) return { valid: false, reason: 'Foundation not found' };

		const vertexSpacing = this.getVertexSpacing();
		const buildingGridSize = this.getBuildingGridSize();
		const { width, depth } = foundationLocalSize(foundation, vertexSpacing);

		for (const point of points) {
			if (!isBuildingGridPointInsideFoundation(point, buildingGridSize, width, depth)) {
				return { valid: false, reason: 'Wall path must stay within the foundation' };
			}
		}

		for (let i = 1; i < points.length; i++) {
			if (points[i].gridX === points[i - 1].gridX && points[i].gridZ === points[i - 1].gridZ) {
				return { valid: false, reason: 'Duplicate point — a segment cannot have zero length' };
			}
		}
		if (closed) {
			const first = points[0];
			const last = points[points.length - 1];
			if (first.gridX === last.gridX && first.gridZ === last.gridZ) {
				return { valid: false, reason: 'Duplicate point — a segment cannot have zero length' };
			}
		}

		const segmentCount = closed ? points.length : points.length - 1;
		for (let i = 0; i < segmentCount; i++) {
			const a = points[i];
			const b = points[(i + 1) % points.length];
			const lengthCheck = validateWallLength(
				{ startGridX: a.gridX, startGridZ: a.gridZ, endGridX: b.gridX, endGridZ: b.gridZ },
				buildingGridSize,
				params.minimumSegmentLength
			);
			if (!lengthCheck.valid) return { valid: false, reason: lengthCheck.reason };
		}

		const localPoints = points.map((p) => {
			const local = buildingGridToLocal(p, buildingGridSize);
			return { x: local.localX, z: local.localZ };
		});
		if (pathSelfIntersects(localPoints, closed)) {
			return { valid: false, reason: 'Wall path crosses itself' };
		}

		const path: WallPathDefinition = {
			id: crypto.randomUUID(),
			foundationId,
			points: points.map((p) => ({ gridX: p.gridX, gridZ: p.gridZ })),
			closed,
			baseY: params.baseY,
			wallHeight: params.wallHeight,
			wallThickness: params.wallThickness,
			joinStyle: params.joinStyle,
			miterLimit: params.miterLimit,
			segments: Array.from({ length: segmentCount }, () => ({
				id: crypto.randomUUID(),
				openings: []
			}))
		};

		this.wallPathManager.addPath(path);
		return { valid: true, value: path };
	}

	removeWallPath(pathId: string): boolean {
		return this.wallPathManager.removePath(pathId);
	}

	/**
	 * Validates and creates a filled horizontal slab (ceiling/floor/flat roof — see SlabTypes.ts,
	 * they all share this one path). Every point must be inside the same foundation, the polygon
	 * itself must be a valid simple polygon (>=3 points, no duplicate/zero-length edges, non-zero
	 * area, no self-intersection — `slabMath.validateSlabPolygon`), and it must not overlap an
	 * existing slab at the *same* `localY` on the same foundation (the "one physical slab" rule —
	 * see SlabTypes.ts's doc comment for why this alone is enough to prevent a duplicate ceiling+
	 * floor pair without needing an explicit "usages" flag).
	 */
	addSlab(params: AddSlabParams): BuildingMutationResult<SlabDefinition> {
		const { points } = params;
		if (points.length === 0) return { valid: false, reason: 'Need at least 3 points' };

		const foundationId = points[0].foundationId;
		if (points.some((p) => p.foundationId !== foundationId)) {
			return { valid: false, reason: 'All points must be on the same foundation' };
		}

		const foundation = this.foundationManager.getFoundation(foundationId);
		if (!foundation) return { valid: false, reason: 'Foundation not found' };

		const vertexSpacing = this.getVertexSpacing();
		const buildingGridSize = this.getBuildingGridSize();
		const { width, depth } = foundationLocalSize(foundation, vertexSpacing);

		for (const point of points) {
			if (!isBuildingGridPointInsideFoundation(point, buildingGridSize, width, depth)) {
				return { valid: false, reason: 'Slab must stay within the foundation' };
			}
		}

		const localPoints = points.map((p) => {
			const local = buildingGridToLocal(p, buildingGridSize);
			return { x: local.localX, z: local.localZ };
		});

		const polygonCheck = validateSlabPolygon(localPoints);
		if (!polygonCheck.valid) return { valid: false, reason: polygonCheck.reason };

		const overlap = this.slabManager.findOverlappingSlabAtLevel(
			foundationId,
			params.localY,
			localPoints
		);
		if (overlap) return { valid: false, reason: 'Slab overlaps existing floor' };

		const slab: SlabDefinition = {
			id: crypto.randomUUID(),
			foundationId,
			type: params.type,
			levelIndex: params.levelIndex,
			localY: params.localY,
			thickness: params.thickness,
			points: points.map((p) => ({ gridX: p.gridX, gridZ: p.gridZ }))
		};

		this.slabManager.addSlab(slab);
		return { valid: true, value: slab };
	}

	removeSlab(id: string): boolean {
		return this.slabManager.removeSlab(id);
	}

	getSlab(id: string): SlabDefinition | undefined {
		return this.slabManager.getSlab(id);
	}

	getSlabsForFoundation(foundationId: string): SlabDefinition[] {
		return this.slabManager.getSlabsForFoundation(foundationId);
	}

	/**
	 * Resolves the actual start/end edge margins to enforce for an opening on the given wall — a
	 * path segment's joined end must stay clear of at least `max(cornerOpeningMargin, actualJoinReach)`,
	 * where `actualJoinReach` is the join's *true* computed geometric extent (cached by
	 * WallPathManager from the same computation that builds the visible geometry — see
	 * WallPathGeometryBuilder's doc comment on why a fixed guess isn't safe here). An unjoined end
	 * (open-path endpoint, or a standalone wall) just uses the plain `openingEdgeMargin`. Shared by
	 * `addOpening`'s authoritative check and OpeningToolBase's live preview, so the two can never
	 * disagree about what's valid.
	 */
	getOpeningMargins(
		wallId: string,
		edgeMargin: number
	): { startMargin: number; endMargin: number } {
		const joinInfo = this.wallPathManager.getSegmentJoinInfo(wallId);
		if (!joinInfo) return { startMargin: edgeMargin, endMargin: edgeMargin };
		const cornerMargin = this.getCornerOpeningMargin();
		return {
			startMargin:
				joinInfo.startJoinReach > 0 ? Math.max(cornerMargin, joinInfo.startJoinReach) : edgeMargin,
			endMargin:
				joinInfo.endJoinReach > 0 ? Math.max(cornerMargin, joinInfo.endJoinReach) : edgeMargin
		};
	}

	addOpening(params: AddOpeningParams): BuildingMutationResult<WallOpeningDefinition> {
		const wall = this.getWall(params.wallId);
		if (!wall) return { valid: false, reason: 'Wall not found' };

		const wallLength = computeWallLength(
			{
				startGridX: wall.startGridX,
				startGridZ: wall.startGridZ,
				endGridX: wall.endGridX,
				endGridZ: wall.endGridZ
			},
			this.getBuildingGridSize()
		);

		const candidate: OpeningCandidate = {
			type: params.type,
			minU: params.minU,
			maxU: params.maxU,
			minY: params.minY,
			maxY: params.maxY
		};

		const { startMargin, endMargin } = this.getOpeningMargins(params.wallId, params.edgeMargin);

		if (!isOpeningWithinWallBounds(candidate, wallLength, wall.height, startMargin, endMargin)) {
			return { valid: false, reason: 'Opening does not fit' };
		}

		const overlap = findOverlappingOpening(candidate, wall.openings, params.spacing);
		if (overlap) {
			return { valid: false, reason: `Opening overlaps existing ${overlap.type}` };
		}

		const opening: WallOpeningDefinition = {
			id: crypto.randomUUID(),
			type: params.type,
			minU: params.minU,
			maxU: params.maxU,
			minY: params.minY,
			maxY: params.maxY
		};

		const standaloneWall = this.wallManager.getWall(params.wallId);
		if (standaloneWall) {
			standaloneWall.openings.push(opening);
			this.wallManager.rebuildWall(params.wallId);
		} else {
			const found = this.wallPathManager.findSegment(params.wallId);
			if (!found) return { valid: false, reason: 'Wall not found' };
			found.segment.openings.push(opening);
			this.wallPathManager.rebuildPath(found.path.id);
		}

		return { valid: true, value: opening };
	}

	removeOpening(wallId: string, openingId: string): boolean {
		const standaloneWall = this.wallManager.getWall(wallId);
		if (standaloneWall) {
			const index = standaloneWall.openings.findIndex((opening) => opening.id === openingId);
			if (index === -1) return false;
			standaloneWall.openings.splice(index, 1);
			this.wallManager.rebuildWall(wallId);
			return true;
		}

		const found = this.wallPathManager.findSegment(wallId);
		if (!found) return false;
		const index = found.segment.openings.findIndex((opening) => opening.id === openingId);
		if (index === -1) return false;
		found.segment.openings.splice(index, 1);
		this.wallPathManager.rebuildPath(found.path.id);
		return true;
	}

	/** Resolves either a standalone wall or a wall-path segment (by its own id) to the same WallDefinition shape. */
	getWall(wallId: string): WallDefinition | undefined {
		return this.wallManager.getWall(wallId) ?? this.wallPathManager.getSegmentAsWallView(wallId);
	}

	/** Resolves either kind of wall's current world transform — used by Window/Door tools to convert a raycast hit into wall-local (U, Y). */
	getWallTransform(wallId: string) {
		return (
			this.wallManager.getWallTransform(wallId) ?? this.wallPathManager.getSegmentTransform(wallId)
		);
	}

	/** Every raycastable wall surface — standalone wall meshes plus wall-path segment picking meshes — for Window/Door tool targeting. */
	getRaycastableWallMeshes() {
		return [
			...this.wallManager.getWallMeshesForRaycast(),
			...this.wallPathManager.getPickingMeshesForRaycast()
		];
	}

	getWallPath(pathId: string): WallPathDefinition | undefined {
		return this.wallPathManager.getPath(pathId);
	}

	getBuildingForFoundation(foundationId: string): FoundationBuildingDefinition {
		return {
			foundationId,
			walls: this.wallManager.getWallsForFoundation(foundationId),
			wallPaths: this.wallPathManager.getPathsForFoundation(foundationId),
			slabs: this.slabManager.getSlabsForFoundation(foundationId)
		};
	}

	/**
	 * Cascade-delete rule for foundation removal (chosen per the README over "reject deletion while
	 * occupied" — there is no foundation-deletion UI yet, but whenever one is added it must call this
	 * before/alongside FoundationManager.removeFoundation so no wall, wall path, or slab ever
	 * outlives its foundation). Building levels are removed by the caller via
	 * BuildingLevelManager.removeLevelsForFoundation — this class doesn't know levels exist (see the
	 * class doc comment), so it can't cascade them itself.
	 */
	removeBuildingForFoundation(foundationId: string): void {
		this.wallManager.removeWallsForFoundation(foundationId);
		this.wallPathManager.removePathsForFoundation(foundationId);
		this.slabManager.removeSlabsForFoundation(foundationId);
	}

	/** Plain, serializable world-state grouped by foundation — never Three.js objects. Building *levels* aren't included here since BuildingManager doesn't own BuildingLevelManager; ThreeScene combines both when serializing the full scene. */
	serialize(): FoundationBuildingDefinition[] {
		const byFoundation = new Map<
			string,
			{ walls: WallDefinition[]; wallPaths: WallPathDefinition[]; slabs: SlabDefinition[] }
		>();
		const ensure = (foundationId: string) => {
			let entry = byFoundation.get(foundationId);
			if (!entry) {
				entry = { walls: [], wallPaths: [], slabs: [] };
				byFoundation.set(foundationId, entry);
			}
			return entry;
		};
		for (const wall of this.wallManager.getAllWalls()) ensure(wall.foundationId).walls.push(wall);
		for (const path of this.wallPathManager.getAllPaths()) {
			ensure(path.foundationId).wallPaths.push(path);
		}
		for (const slab of this.slabManager.getAllSlabs()) ensure(slab.foundationId).slabs.push(slab);
		return Array.from(byFoundation.entries(), ([foundationId, data]) => ({
			foundationId,
			...data
		}));
	}

	/**
	 * Replaces all current wall/path/slab state with the given definitions — trusts the input, same
	 * as FoundationManager.load(). `wallPaths`/`slabs` default to an empty array for older
	 * serialized data saved before those fields existed, so nothing breaks loading a pre-existing
	 * save.
	 */
	load(definitions: readonly FoundationBuildingDefinition[]): void {
		for (const wall of this.wallManager.getAllWalls()) this.wallManager.removeWall(wall.id);
		for (const path of this.wallPathManager.getAllPaths()) this.wallPathManager.removePath(path.id);
		for (const slab of this.slabManager.getAllSlabs()) this.slabManager.removeSlab(slab.id);
		for (const building of definitions) {
			// Runtime data loaded from an actual save file may predate `baseY` even though the type
			// says it's required — `?? 0` keeps that old data loading as ground-floor walls/paths.
			for (const wall of building.walls) {
				this.wallManager.addWall({ ...wall, baseY: wall.baseY ?? 0 });
			}
			for (const path of building.wallPaths ?? []) {
				this.wallPathManager.addPath({ ...path, baseY: path.baseY ?? 0 });
			}
			for (const slab of building.slabs ?? []) this.slabManager.addSlab(slab);
		}
	}
}
