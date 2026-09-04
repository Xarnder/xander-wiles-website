import { foundationLocalSize, isBuildingGridPointInsideFoundation } from './FoundationLocalMath';
import type { BuildingGridPoint } from './FoundationLocalMath';
import type { FoundationManager } from './FoundationManager';
import type { WallManager } from './WallManager';
import {
	computeWallLength,
	findOverlappingOpening,
	isOpeningWithinWallBounds,
	validateWallLength
} from './wallGeometryMath';
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
	height: number;
	thickness: number;
	minimumWallLength: number;
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
	getVertexSpacing: () => number;
	getBuildingGridSize: () => number;
}

/**
 * The single entry point every building tool goes through to mutate building state. Validates the
 * "buildings can only exist on foundations" rule set at the data layer — not just in the tools —
 * per the README: a wall's two endpoints are independently resolved (each tagged with the
 * foundation it was targeted on) so "different foundations" is a real, rejectable case rather than
 * something the API shape makes impossible to even express. WallManager remains the permanent
 * owner of wall/mesh/collision state; this class only validates and then delegates to it.
 */
export class BuildingManager {
	private readonly foundationManager: FoundationManager;
	private readonly wallManager: WallManager;
	private readonly getVertexSpacing: () => number;
	private readonly getBuildingGridSize: () => number;

	constructor(options: BuildingManagerOptions) {
		this.foundationManager = options.foundationManager;
		this.wallManager = options.wallManager;
		this.getVertexSpacing = options.getVertexSpacing;
		this.getBuildingGridSize = options.getBuildingGridSize;
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

	addOpening(params: AddOpeningParams): BuildingMutationResult<WallOpeningDefinition> {
		const wall = this.wallManager.getWall(params.wallId);
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

		if (!isOpeningWithinWallBounds(candidate, wallLength, wall.height, params.edgeMargin)) {
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
		wall.openings.push(opening);
		this.wallManager.rebuildWall(wall.id);

		return { valid: true, value: opening };
	}

	removeOpening(wallId: string, openingId: string): boolean {
		const wall = this.wallManager.getWall(wallId);
		if (!wall) return false;
		const index = wall.openings.findIndex((opening) => opening.id === openingId);
		if (index === -1) return false;
		wall.openings.splice(index, 1);
		this.wallManager.rebuildWall(wallId);
		return true;
	}

	getWall(wallId: string): WallDefinition | undefined {
		return this.wallManager.getWall(wallId);
	}

	getBuildingForFoundation(foundationId: string): FoundationBuildingDefinition {
		return { foundationId, walls: this.wallManager.getWallsForFoundation(foundationId) };
	}

	/**
	 * Cascade-delete rule for foundation removal (chosen per the README over "reject deletion while
	 * occupied" — there is no foundation-deletion UI yet, but whenever one is added it must call this
	 * before/alongside FoundationManager.removeFoundation so no wall ever outlives its foundation).
	 */
	removeBuildingForFoundation(foundationId: string): void {
		this.wallManager.removeWallsForFoundation(foundationId);
	}

	/** Plain, serializable world-state grouped by foundation — never Three.js objects. */
	serialize(): FoundationBuildingDefinition[] {
		const byFoundation = new Map<string, WallDefinition[]>();
		for (const wall of this.wallManager.getAllWalls()) {
			const list = byFoundation.get(wall.foundationId) ?? [];
			list.push(wall);
			byFoundation.set(wall.foundationId, list);
		}
		return Array.from(byFoundation.entries(), ([foundationId, walls]) => ({ foundationId, walls }));
	}

	/** Replaces all current building state with the given definitions — trusts the input, same as FoundationManager.load(). */
	load(definitions: readonly FoundationBuildingDefinition[]): void {
		for (const wall of this.wallManager.getAllWalls()) this.wallManager.removeWall(wall.id);
		for (const building of definitions) {
			for (const wall of building.walls) this.wallManager.addWall(wall);
		}
	}
}
