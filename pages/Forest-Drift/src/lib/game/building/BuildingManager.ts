import {
	buildingGridToLocal,
	foundationLocalSize,
	isBuildingGridPointInsideFoundation
} from './FoundationLocalMath';
import type { BuildingGridPoint } from './FoundationLocalMath';
import type { FoundationManager } from './FoundationManager';
import type { BuildingMaterialDefinition } from './MaterialTypes';
import { isFootprintCompatibleWithRoofType } from './RoofGeometryBuilder';
import type { RoofManager } from './RoofManager';
import type {
	RoofDefinition,
	RoofDirection,
	RoofProfileSettings,
	RoofType,
	ShedDirection
} from './RoofTypes';
import { polygonsOverlap, validateSlabPolygon } from './slabMath';
import type { SlabDefinition, SlabOpeningDefinition, SlabType } from './SlabTypes';
import { slabBottomY } from './SlabTypes';
import type { SlabManager } from './SlabManager';
import { computeStairMetrics, validateStairFootprint } from './stairMath';
import type { StairManager } from './StairManager';
import type { StairDefinition, StairDirection } from './StairTypes';
import type { WallManager } from './WallManager';
import {
	computeWallLength,
	findOverlappingOpening,
	isOpeningWithinWallBounds,
	validateWallLength
} from './wallGeometryMath';
import { pathSelfIntersects } from './wallPathMath';
import type { WallJoinStyle } from './wallPathMath';
import type { WallPathDefinition, WallPathSegmentDefinition } from './WallPathTypes';
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

export interface AddRoofParams {
	points: WallEndpointTarget[];
	levelIndex: number;
	baseY: number;
	type: RoofType;
	direction: RoofDirection;
	shedDirection: ShedDirection;
	rise: number;
	thickness: number;
	overhang: number;
	profileSettings: RoofProfileSettings;
}

export interface AddStairParams {
	foundationId: string;
	minGridX: number;
	maxGridX: number;
	minGridZ: number;
	maxGridZ: number;
	baseY: number;
	direction: StairDirection;
	levelIndex: number;
	gridSizeAtCreation: number;
	minimumStairWidthCells: number;
	minimumStairRunCells: number;
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
	stairManager: StairManager;
	roofManager: RoofManager;
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
	private readonly stairManager: StairManager;
	private readonly roofManager: RoofManager;
	private readonly getVertexSpacing: () => number;
	private readonly getBuildingGridSize: () => number;
	private readonly getCornerOpeningMargin: () => number;

	/**
	 * Bumped by every mutating method on this facade. World persistence polls it (see
	 * WorldAutosaveManager) to answer "has anything changed?" in a single integer comparison rather
	 * than by re-serializing the building state a few times a second.
	 *
	 * Bumped on entry rather than only on success, so a rejected placement can cost one redundant
	 * save. That's the deliberate trade: over-saving is invisible, whereas a missed bump silently
	 * loses a player's work, and every mutating path through this class — including the paint methods
	 * that mutate a definition in place before asking a manager to rebuild — is covered by construction.
	 */
	private revision = 0;

	constructor(options: BuildingManagerOptions) {
		this.foundationManager = options.foundationManager;
		this.wallManager = options.wallManager;
		this.wallPathManager = options.wallPathManager;
		this.slabManager = options.slabManager;
		this.stairManager = options.stairManager;
		this.roofManager = options.roofManager;
		this.getVertexSpacing = options.getVertexSpacing;
		this.getBuildingGridSize = options.getBuildingGridSize;
		this.getCornerOpeningMargin = options.getCornerOpeningMargin;
	}

	/** Monotonic change counter — see the `revision` field's doc comment. */
	getRevision(): number {
		return this.revision;
	}

	addWall(params: AddWallParams): BuildingMutationResult<WallDefinition> {
		this.revision++;
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
		this.revision++;
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
		this.revision++;
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
		this.revision++;
		return this.wallPathManager.removePath(pathId);
	}

	/**
	 * Removes ONE segment from a wall path, splitting/reshaping the remaining topology cleanly rather
	 * than leaving a fake logical connection across the gap — see the README's "Removing polygon /
	 * continuous wall segments" section for the worked examples this mirrors exactly:
	 *
	 * - Open path: the segment's index splits `points`/`segments` into a "before" and "after" run.
	 *   Each run becomes its own new path IF it still has >= 2 points (a single leftover point isn't
	 *   a wall at all, so a 1-point run is simply dropped) — removing a path's only segment can
	 *   therefore delete the whole path with no replacement.
	 * - Closed path: removing any one segment can never split a loop in two (a cycle minus one edge
	 *   is a single connected chain) — the result is always exactly one new OPEN path, containing
	 *   every original point, rotated to start right after the cut.
	 *
	 * Both cases preserve the ORIGINAL WallPathSegmentDefinition objects (same id, same openings) for
	 * every segment that survives — never regenerated — so a surviving segment's own windows/doors
	 * ride along untouched. The removed segment's own openings are never migrated to a neighbour;
	 * they simply cease to exist along with it. The old path is fully torn down and the new one(s)
	 * built fresh via `wallPathManager.addPath`, which is what guarantees corner-join geometry at the
	 * new endpoints regenerates cleanly (no leftover miter/bevel/spike from the segment that's gone —
	 * see WallPathGeometryBuilder, which always computes joins from the CURRENT point sequence alone).
	 */
	removeWallSegment(pathId: string, segmentId: string): boolean {
		this.revision++;
		const path = this.wallPathManager.getPath(pathId);
		if (!path) return false;
		const index = path.segments.findIndex((s) => s.id === segmentId);
		if (index === -1) return false;

		const shared = {
			foundationId: path.foundationId,
			baseY: path.baseY,
			wallHeight: path.wallHeight,
			wallThickness: path.wallThickness,
			joinStyle: path.joinStyle,
			miterLimit: path.miterLimit
		};

		const addIfValid = (
			points: WallPathDefinition['points'],
			segments: WallPathSegmentDefinition[]
		) => {
			if (points.length < 2) return;
			this.wallPathManager.addPath({
				id: crypto.randomUUID(),
				...shared,
				points,
				closed: false,
				segments
			});
		};

		this.wallPathManager.removePath(pathId);

		if (!path.closed) {
			addIfValid(path.points.slice(0, index + 1), path.segments.slice(0, index));
			addIfValid(path.points.slice(index + 1), path.segments.slice(index + 1));
			return true;
		}

		// Closed loop: rotate to start right after the removed segment, dropping it — see doc comment.
		const n = path.points.length;
		const rotatedPoints = Array.from({ length: n }, (_, k) => path.points[(index + 1 + k) % n]);
		const rotatedSegments = Array.from(
			{ length: n - 1 },
			(_, k) => path.segments[(index + 1 + k) % n]
		);
		addIfValid(rotatedPoints, rotatedSegments);
		return true;
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
		this.revision++;
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
			points: points.map((p) => ({ gridX: p.gridX, gridZ: p.gridZ })),
			openings: []
		};

		this.slabManager.addSlab(slab);
		this.autoOpenStairsIntoSlab(slab);
		return { valid: true, value: slab };
	}

	removeSlab(id: string): boolean {
		this.revision++;
		return this.slabManager.removeSlab(id);
	}

	/**
	 * Places a pitched (or, via `type: 'flat'`, arbitrary-polygon) roof — the same "validate footprint
	 * against the foundation and grid, then delegate" shape as `addSlab`, plus one check `addSlab`
	 * doesn't need: `isFootprintCompatibleWithRoofType` rejects a non-rectangular footprint for any
	 * pitched type BEFORE `RoofManager` ever attempts to build geometry from it, matching the
	 * README's "Gable roof requires a compatible footprint" behaviour rather than throwing.
	 */
	addRoof(params: AddRoofParams): BuildingMutationResult<RoofDefinition> {
		this.revision++;
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
				return { valid: false, reason: 'Roof must stay within the foundation' };
			}
		}

		const localPoints = points.map((p) => {
			const local = buildingGridToLocal(p, buildingGridSize);
			return { x: local.localX, z: local.localZ };
		});

		const polygonCheck = validateSlabPolygon(localPoints);
		if (!polygonCheck.valid) return { valid: false, reason: polygonCheck.reason };

		if (!isFootprintCompatibleWithRoofType(localPoints, params.type)) {
			return {
				valid: false,
				reason: `${params.type} roof requires a compatible footprint`
			};
		}

		const roof: RoofDefinition = {
			id: crypto.randomUUID(),
			foundationId,
			levelIndex: params.levelIndex,
			points: points.map((p) => ({ gridX: p.gridX, gridZ: p.gridZ })),
			baseY: params.baseY,
			type: params.type,
			direction: params.direction,
			shedDirection: params.shedDirection,
			rise: params.rise,
			thickness: params.thickness,
			overhang: params.overhang,
			profileSettings: params.profileSettings
		};

		const result = this.roofManager.addRoof(roof);
		if (!result.ok) return { valid: false, reason: result.reason };
		return { valid: true, value: roof };
	}

	removeRoof(id: string): boolean {
		this.revision++;
		return this.roofManager.removeRoof(id);
	}

	getRoof(id: string): RoofDefinition | undefined {
		return this.roofManager.getRoof(id);
	}

	getSlab(id: string): SlabDefinition | undefined {
		return this.slabManager.getSlab(id);
	}

	getSlabsForFoundation(foundationId: string): SlabDefinition[] {
		return this.slabManager.getSlabsForFoundation(foundationId);
	}

	/**
	 * Validates and creates an axis-aligned straight staircase (see StairTypes.ts / stairMath.ts).
	 * Footprint must be inside the foundation, must satisfy the minimum width/run cell counts, and
	 * `direction` must run along the footprint's long axis (or either axis, for a square footprint)
	 * — see `stairMath.validateStairFootprint`. Overlap against other stairs/walls is intentionally
	 * NOT checked yet (see the README's "not implemented yet" list) — only the footprint-shape rules
	 * above are enforced for v1.
	 */
	addStair(params: AddStairParams): BuildingMutationResult<StairDefinition> {
		this.revision++;
		const foundation = this.foundationManager.getFoundation(params.foundationId);
		if (!foundation) return { valid: false, reason: 'Foundation not found' };

		const vertexSpacing = this.getVertexSpacing();
		const buildingGridSize = this.getBuildingGridSize();
		const { width, depth } = foundationLocalSize(foundation, vertexSpacing);

		const corners: BuildingGridPoint[] = [
			{ gridX: params.minGridX, gridZ: params.minGridZ },
			{ gridX: params.maxGridX, gridZ: params.maxGridZ }
		];
		for (const corner of corners) {
			if (!isBuildingGridPointInsideFoundation(corner, buildingGridSize, width, depth)) {
				return { valid: false, reason: 'Stair must stay within the foundation' };
			}
		}

		const footprintCheck = validateStairFootprint(
			params,
			params.direction,
			params.minimumStairWidthCells,
			params.minimumStairRunCells
		);
		if (!footprintCheck.valid) return { valid: false, reason: footprintCheck.reason };

		const stair: StairDefinition = {
			id: crypto.randomUUID(),
			foundationId: params.foundationId,
			minGridX: params.minGridX,
			maxGridX: params.maxGridX,
			minGridZ: params.minGridZ,
			maxGridZ: params.maxGridZ,
			baseY: params.baseY,
			direction: params.direction,
			levelIndex: params.levelIndex,
			gridSizeAtCreation: params.gridSizeAtCreation
		};

		this.stairManager.addStair(stair);
		this.openSlabForStair(stair);
		return { valid: true, value: stair };
	}

	/** The stair's footprint as a foundation-local (meter) polygon — used only by the auto-opening checks below. */
	private stairFootprintLocalPolygon(
		stair: Pick<StairDefinition, 'minGridX' | 'maxGridX' | 'minGridZ' | 'maxGridZ'>
	) {
		const buildingGridSize = this.getBuildingGridSize();
		return [
			{ gridX: stair.minGridX, gridZ: stair.minGridZ },
			{ gridX: stair.maxGridX, gridZ: stair.minGridZ },
			{ gridX: stair.maxGridX, gridZ: stair.maxGridZ },
			{ gridX: stair.minGridX, gridZ: stair.maxGridZ }
		].map((p) => {
			const local = buildingGridToLocal(p, buildingGridSize);
			return { x: local.localX, z: local.localZ };
		});
	}

	/**
	 * A stair's topmost tread box occupies local Y `[metrics.topLocalY - stepRise, metrics.topLocalY]`
	 * and, being a stacked solid (see StairGeometryBuilder), every tread below it fills the space
	 * beneath that too — so the stair's solid mass physically intersects a slab whenever its top
	 * reaches at or past that slab's UNDERSIDE, not only when it lines up with the slab's top surface
	 * exactly. Requiring an exact match (the original implementation) meant a hole was only ever cut
	 * for the one specific stair length that happened to sum to bit-for-bit the same Y as the slab —
	 * effectively never, for a stair whose length the user chose freely — which is why the opening
	 * silently failed to appear for ordinary stairs. A tiny epsilon absorbs floating-point noise, not
	 * "close enough" fudging: this is a real solid/solid intersection test, not a fuzzy heuristic.
	 */
	private stairReachesSlab(stairTopLocalY: number, slab: SlabDefinition): boolean {
		const EPS = 1e-6;
		return stairTopLocalY >= slabBottomY(slab) - EPS;
	}

	private slabLocalPolygonOf(slab: Pick<SlabDefinition, 'points'>) {
		const buildingGridSize = this.getBuildingGridSize();
		return slab.points.map((p) => {
			const local = buildingGridToLocal(p, buildingGridSize);
			return { x: local.localX, z: local.localZ };
		});
	}

	/**
	 * The ONE slab that counts as "the ceiling directly above" a stair — never a slab at or below the
	 * stair's own base (that's the floor the stair stands ON, not something it rises through — a
	 * previous version had no lower bound here at all, which is what let a hole get cut in the floor
	 * the stair started from), and never more than one even when the stair's solid mass would also
	 * technically reach a farther slab stacked above the correct one. Among every slab on the same
	 * foundation whose footprint overlaps the stair's, strictly above `stair.baseY`, and actually
	 * reached by the stair's own solid mass (`stairReachesSlab`), this returns the one with the
	 * LOWEST underside — i.e. the nearest one — or `undefined` if none qualify yet.
	 */
	private findCeilingSlabForStair(stair: StairDefinition): SlabDefinition | undefined {
		const EPS = 1e-6;
		const metrics = computeStairMetrics(stair);
		const stairLocalPolygon = this.stairFootprintLocalPolygon(stair);
		let best: SlabDefinition | undefined;
		let bestBottom = Infinity;
		for (const slab of this.slabManager.getSlabsForFoundation(stair.foundationId)) {
			const bottom = slabBottomY(slab);
			if (bottom <= stair.baseY + EPS) continue; // at/below the stair's own floor — never "above"
			if (!this.stairReachesSlab(metrics.topLocalY, slab)) continue;
			if (!polygonsOverlap(this.slabLocalPolygonOf(slab), stairLocalPolygon)) continue;
			if (bottom < bestBottom) {
				best = slab;
				bestBottom = bottom;
			}
		}
		return best;
	}

	/** Removes every slab-opening `stairId` owns (via `sourceStairId`) except the one (if any) on `keepSlabId` — used when the ceiling directly above a stair changes because a nearer slab was just placed, so a stair's opening never lingers on a slab that is no longer the correct one. */
	private removeStairOpeningsExcept(
		foundationId: string,
		stairId: string,
		keepSlabId: string
	): void {
		for (const slab of this.slabManager.getSlabsForFoundation(foundationId)) {
			if (slab.id === keepSlabId) continue;
			for (const opening of slab.openings) {
				if (opening.sourceStairId === stairId) this.slabManager.removeOpening(slab.id, opening.id);
			}
		}
	}

	/**
	 * Punches a rectangular opening into the ONE slab that is "the ceiling directly above" the stair
	 * (see `findCeilingSlabForStair`) — the "sensible, slightly-oversized" v1 opening the README
	 * describes (full stair width and run, which alone already guarantees headroom the whole way up
	 * since nothing above the stair's own footprint is ever solid). Never opens a slab below the
	 * stair's own base, and never more than one slab even if a farther one is also technically
	 * reached. Called right after a stair is placed; the mirror case (a slab placed AFTER a stair
	 * that already reaches it) is `autoOpenStairsIntoSlab` below.
	 */
	private openSlabForStair(stair: StairDefinition): void {
		const ceiling = this.findCeilingSlabForStair(stair);
		if (ceiling) this.addStairOpening(ceiling.id, stair);
	}

	/**
	 * Mirror of `openSlabForStair`, called right after a slab is placed — for every stair on the same
	 * foundation, recomputes which slab is now "the ceiling directly above" it (the new slab may or
	 * may not be the correct one — a closer slab could already exist) and opens ONLY that one,
	 * removing any stale opening the stair previously owned on a now-incorrect (farther) slab.
	 */
	private autoOpenStairsIntoSlab(slab: SlabDefinition): void {
		for (const stair of this.stairManager.getStairsForFoundation(slab.foundationId)) {
			const ceiling = this.findCeilingSlabForStair(stair);
			if (!ceiling || ceiling.id !== slab.id) continue;
			this.removeStairOpeningsExcept(stair.foundationId, stair.id, slab.id);
			this.addStairOpening(slab.id, stair);
		}
	}

	private addStairOpening(slabId: string, stair: StairDefinition): void {
		const opening: SlabOpeningDefinition = {
			id: crypto.randomUUID(),
			type: 'stairs',
			minGridX: stair.minGridX,
			maxGridX: stair.maxGridX,
			minGridZ: stair.minGridZ,
			maxGridZ: stair.maxGridZ,
			sourceStairId: stair.id
		};
		this.slabManager.addOpening(slabId, opening);
	}

	/**
	 * Removes the stair, then restores solid floor by removing every slab opening THIS stair created
	 * (matched via `sourceStairId` — see SlabOpeningDefinition's doc comment) and rebuilding those
	 * slabs. Never touches an opening belonging to a different stair, or one with no `sourceStairId`
	 * at all (manually authored, or serialized before that field existed) — ownership is explicit,
	 * not inferred from overlapping position, per the README's "Removing stairs" section.
	 */
	removeStair(id: string): boolean {
		this.revision++;
		const removed = this.stairManager.removeStair(id);
		if (!removed) return false;

		for (const slab of this.slabManager.getAllSlabs()) {
			for (const opening of slab.openings) {
				if (opening.sourceStairId === id) this.slabManager.removeOpening(slab.id, opening.id);
			}
		}
		return true;
	}

	getStair(id: string): StairDefinition | undefined {
		return this.stairManager.getStair(id);
	}

	getStairsForFoundation(foundationId: string): StairDefinition[] {
		return this.stairManager.getStairsForFoundation(foundationId);
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
		this.revision++;
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
		this.revision++;
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

	/** Every raycastable wall surface — standalone wall meshes plus wall-path segment picking meshes — for Window/Door tool and Remove Mode targeting. */
	getRaycastableWallMeshes() {
		return [
			...this.wallManager.getWallMeshesForRaycast(),
			...this.wallPathManager.getPickingMeshesForRaycast()
		];
	}

	/** Every stair's real mesh — for Remove Mode targeting (see StairManager.getMeshesForRaycast). */
	getRaycastableStairMeshes() {
		return this.stairManager.getMeshesForRaycast();
	}

	/** Every slab's real mesh — for Paint Mode targeting (see SlabManager.getMeshesForRaycast). */
	getRaycastableSlabMeshes() {
		return this.slabManager.getMeshesForRaycast();
	}

	/** Every roof's real mesh — for Remove/Paint Mode targeting (see RoofManager.getMeshesForRaycast). */
	getRaycastableRoofMeshes() {
		return this.roofManager.getMeshesForRaycast();
	}

	/** Every foundation's real mesh — for Paint Mode targeting. */
	getRaycastableFoundationMeshes() {
		return this.foundationManager.getMeshes();
	}

	/** Every door hinge pivot (standalone walls and path segments) — `DoorInteractionController` swings these. */
	getDoorHingePivots() {
		return [...this.wallManager.getDoorHingePivots(), ...this.wallPathManager.getDoorHingePivots()];
	}

	getWallPath(pathId: string): WallPathDefinition | undefined {
		return this.wallPathManager.getPath(pathId);
	}

	/** Every standalone wall across every foundation — used by RemoveTool to build one OpeningPickingProxy per existing window/door. */
	getAllWalls(): WallDefinition[] {
		return this.wallManager.getAllWalls();
	}

	/** Every wall path across every foundation — same purpose as `getAllWalls`, for path-segment openings. */
	getAllWallPaths(): WallPathDefinition[] {
		return this.wallPathManager.getAllPaths();
	}

	getAllStairs(): StairDefinition[] {
		return this.stairManager.getAllStairs();
	}

	getAllRoofs(): RoofDefinition[] {
		return this.roofManager.getAllRoofs();
	}

	/**
	 * Paints (or, given `undefined`, resets to default) a standalone wall's material — the whole
	 * logical wall, never a single face (see the README's "Paint Tool" section on why per-face
	 * painting is out of scope for v1). Preserves every opening/collision exactly: `rebuildWall`
	 * regenerates geometry from the SAME `openings` array, just with a different material applied —
	 * nothing about the wall's shape is touched. Returns `false` for an unknown wall id.
	 */
	paintWall(wallId: string, material: BuildingMaterialDefinition | undefined): boolean {
		this.revision++;
		const wall = this.wallManager.getWall(wallId);
		if (!wall) return false;
		wall.material = material;
		this.wallManager.rebuildWall(wallId);
		return true;
	}

	/**
	 * Paints ONE segment of a Continuous/Polygon Wall path — never the whole path (see the README's
	 * "Paint Tool" section: this matches Window/Door/Remove Mode's existing per-segment targeting,
	 * not a whole-path operation). The merged visible mesh keeps one Three.js material GROUP per
	 * segment specifically so this is possible without repainting every neighbour — see
	 * WallPathManager.rebuildEntry. Returns `false` for an unknown path or segment id.
	 */
	paintWallSegment(
		pathId: string,
		segmentId: string,
		material: BuildingMaterialDefinition | undefined
	): boolean {
		this.revision++;
		const path = this.wallPathManager.getPath(pathId);
		if (!path) return false;
		const segment = path.segments.find((s) => s.id === segmentId);
		if (!segment) return false;
		segment.material = material;
		this.wallPathManager.rebuildPath(pathId);
		return true;
	}

	/** Paints (or resets) a slab (ceiling/floor/flat roof) — the whole physical slab, even when it's shared as one room's ceiling and the room above's floor (see SlabDefinition.material's doc comment). Returns `false` for an unknown slab id. */
	paintSlab(slabId: string, material: BuildingMaterialDefinition | undefined): boolean {
		this.revision++;
		return this.slabManager.setMaterial(slabId, material);
	}

	/** Paints (or resets) a foundation — visual only; never touches its grid footprint, `topY`/`bottomY`, or collision (see FoundationDefinition.material's doc comment). Returns `false` for an unknown foundation id. */
	paintFoundation(foundationId: string, material: BuildingMaterialDefinition | undefined): boolean {
		this.revision++;
		return this.foundationManager.setMaterial(foundationId, material);
	}

	/** Paints (or resets) a roof — preserves type/pitch/geometry/collision exactly, only the material changes (RoofManager.setMaterial rebuilds the mesh from the SAME RoofDefinition with just `material` swapped). Returns `false` for an unknown roof id. */
	paintRoof(roofId: string, material: BuildingMaterialDefinition | undefined): boolean {
		this.revision++;
		return this.roofManager.setMaterial(roofId, material);
	}

	/** A standalone wall's real mesh — for PaintTool's live hover preview (material swap + outline). */
	getWallMesh(wallId: string) {
		return this.wallManager.getMeshForWall(wallId);
	}

	/** A slab's real mesh — same purpose as `getWallMesh`. */
	getSlabMesh(slabId: string) {
		return this.slabManager.getMeshForSlab(slabId);
	}

	/** A foundation's real mesh — same purpose as `getWallMesh`. */
	getFoundationMesh(foundationId: string) {
		return this.foundationManager.getMeshForFoundation(foundationId);
	}

	/** A roof's real mesh — same purpose as `getWallMesh`. */
	getRoofMesh(roofId: string) {
		return this.roofManager.getMeshForRoof(roofId);
	}

	/** A wall-path segment's merged visible mesh + which of its material-array indices are its own — see WallPathManager.getVisibleMeshAndGroupIndices and PaintTool's per-segment preview. */
	getWallPathVisibleMeshAndGroupIndices(segmentId: string) {
		return this.wallPathManager.getVisibleMeshAndGroupIndices(segmentId);
	}

	getBuildingForFoundation(foundationId: string): FoundationBuildingDefinition {
		return {
			foundationId,
			walls: this.wallManager.getWallsForFoundation(foundationId),
			wallPaths: this.wallPathManager.getPathsForFoundation(foundationId),
			slabs: this.slabManager.getSlabsForFoundation(foundationId),
			stairs: this.stairManager.getStairsForFoundation(foundationId),
			roofs: this.roofManager.getRoofsForFoundation(foundationId)
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
		this.revision++;
		this.wallManager.removeWallsForFoundation(foundationId);
		this.wallPathManager.removePathsForFoundation(foundationId);
		this.slabManager.removeSlabsForFoundation(foundationId);
		this.stairManager.removeStairsForFoundation(foundationId);
		this.roofManager.removeRoofsForFoundation(foundationId);
	}

	/** Plain, serializable world-state grouped by foundation — never Three.js objects. Building *levels* aren't included here since BuildingManager doesn't own BuildingLevelManager; ThreeScene combines both when serializing the full scene. */
	serialize(): FoundationBuildingDefinition[] {
		const byFoundation = new Map<
			string,
			{
				walls: WallDefinition[];
				wallPaths: WallPathDefinition[];
				slabs: SlabDefinition[];
				stairs: StairDefinition[];
				roofs: RoofDefinition[];
			}
		>();
		const ensure = (foundationId: string) => {
			let entry = byFoundation.get(foundationId);
			if (!entry) {
				entry = { walls: [], wallPaths: [], slabs: [], stairs: [], roofs: [] };
				byFoundation.set(foundationId, entry);
			}
			return entry;
		};
		for (const wall of this.wallManager.getAllWalls()) ensure(wall.foundationId).walls.push(wall);
		for (const path of this.wallPathManager.getAllPaths()) {
			ensure(path.foundationId).wallPaths.push(path);
		}
		for (const slab of this.slabManager.getAllSlabs()) ensure(slab.foundationId).slabs.push(slab);
		for (const stair of this.stairManager.getAllStairs()) {
			ensure(stair.foundationId).stairs.push(stair);
		}
		for (const roof of this.roofManager.getAllRoofs()) ensure(roof.foundationId).roofs.push(roof);
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
		this.revision++;
		for (const wall of this.wallManager.getAllWalls()) this.wallManager.removeWall(wall.id);
		for (const path of this.wallPathManager.getAllPaths()) this.wallPathManager.removePath(path.id);
		for (const slab of this.slabManager.getAllSlabs()) this.slabManager.removeSlab(slab.id);
		for (const stair of this.stairManager.getAllStairs()) this.stairManager.removeStair(stair.id);
		for (const roof of this.roofManager.getAllRoofs()) this.roofManager.removeRoof(roof.id);
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
			for (const stair of building.stairs ?? []) this.stairManager.addStair(stair);
			for (const roof of building.roofs ?? []) this.roofManager.addRoof(roof);
		}
	}
}
