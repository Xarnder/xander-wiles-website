import { validateCreatureWorldState } from '../creatures/CreaturePersistence';
import { validateMusic } from '../music/MusicValidation';
import type { BuildingLevelDefinition } from '../building/BuildingLevelTypes';
import { validateFurniture } from '../building/FurnitureTypes';
import type { FoundationDefinition } from '../building/FoundationTypes';
import type { BuildingMaterialDefinition } from '../building/MaterialTypes';
import {
	ROOF_TYPE_ORDER,
	type RoofDefinition,
	type RoofProfileSettings,
	type RoofType,
	type ShedDirection
} from '../building/RoofTypes';
import type { SlabDefinition, SlabOpeningDefinition } from '../building/SlabTypes';
import type { StairDefinition } from '../building/StairTypes';
import {
	isFloorDetailKind,
	isFloorDetailPlankDirection,
	isFloorDetailRenderMode,
	isFloorDetailTilePattern,
	type FloorDetailDefinition
} from '../building/FloorDetailTypes';
import type {
	FoundationBuildingDefinition,
	WallBeamDefinition,
	WallDefinition,
	WallOpeningDefinition
} from '../building/WallTypes';
import type { WallPathDefinition, WallPathSegmentDefinition } from '../building/WallPathTypes';
import { CURRENT_WORLD_SCHEMA_VERSION, type WorldDefinition } from './WorldTypes';

/**
 * Hard caps applied to *imported* data before anything is instantiated. Their purpose isn't to
 * express a design limit on how much a player may build locally — it's to stop a hand-crafted or
 * corrupted file that declares, say, five hundred million walls from locking up the browser while
 * Three.js geometry is built for it. Anything a real session could plausibly produce sits orders of
 * magnitude below these numbers.
 */
export const IMPORT_LIMITS = {
	foundations: 5_000,
	wallsPerFoundation: 20_000,
	wallPathsPerFoundation: 5_000,
	pointsPerWallPath: 2_000,
	openingsPerWall: 200,
	beamsPerWall: 200,
	slabsPerFoundation: 5_000,
	pointsPerSlab: 2_000,
	openingsPerSlab: 500,
	stairsPerFoundation: 2_000,
	roofsPerFoundation: 2_000,
	pointsPerRoof: 2_000,
	floorDetailsPerFoundation: 2_000,
	pointsPerFloorDetail: 8,
	buildingLevels: 50_000,
	furniture: 8_000,
	removedTreeIds: 500_000,
	/** Uncompressed world JSON size ceiling for an import, in bytes. */
	worldJsonBytes: 64 * 1024 * 1024,
	/** Compressed package size ceiling for an import, in bytes. */
	packageBytes: 32 * 1024 * 1024
} as const;

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; error: string };

function fail<T>(error: string): ValidationResult<T> {
	return { ok: false, error };
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value);
}

function isNonEmptyString(value: unknown): value is string {
	return typeof value === 'string' && value.length > 0;
}

/** Matches the same `#rgb`/`#rrggbb` shapes MaterialTypes.normalizeColorHex accepts — an imported colour must be a real colour, not arbitrary text handed to THREE.Color. */
function isValidColorString(value: unknown): value is string {
	return typeof value === 'string' && /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value);
}

function validateMaterial(
	value: unknown,
	where: string
): ValidationResult<BuildingMaterialDefinition | undefined> {
	if (value === undefined) return { ok: true, value: undefined };
	if (!isRecord(value)) return fail(`${where}: material must be an object`);
	if (value.type !== 'color') return fail(`${where}: unknown material type`);
	if (!isValidColorString(value.color)) return fail(`${where}: invalid material colour`);
	return { ok: true, value: { type: 'color', color: value.color } };
}

function validateOpening(value: unknown, where: string): ValidationResult<WallOpeningDefinition> {
	if (!isRecord(value)) return fail(`${where}: opening must be an object`);
	if (!isNonEmptyString(value.id)) return fail(`${where}: opening id missing`);
	if (value.type !== 'window' && value.type !== 'door')
		return fail(`${where}: unknown opening type`);
	for (const key of ['minU', 'maxU', 'minY', 'maxY'] as const) {
		if (!isFiniteNumber(value[key]))
			return fail(`${where}: opening ${key} must be a finite number`);
	}
	const material = validateMaterial(value.material, where);
	if (!material.ok) return material;
	return { ok: true, value: value as unknown as WallOpeningDefinition };
}

function validateBeam(value: unknown, where: string): ValidationResult<WallBeamDefinition> {
	if (!isRecord(value)) return fail(`${where}: beam must be an object`);
	if (!isNonEmptyString(value.id)) return fail(`${where}: beam id missing`);
	for (const key of ['minU', 'maxU', 'minY', 'maxY'] as const) {
		if (!isFiniteNumber(value[key])) return fail(`${where}: beam ${key} must be a finite number`);
	}
	const material = validateMaterial(value.material, where);
	if (!material.ok) return material;
	return { ok: true, value: value as unknown as WallBeamDefinition };
}

function validateOptionalBeams(
	value: unknown,
	where: string
): ValidationResult<WallBeamDefinition[] | undefined> {
	if (value === undefined) return { ok: true, value: undefined };
	if (!Array.isArray(value)) return fail(`${where}: beams must be an array`);
	if (value.length > IMPORT_LIMITS.beamsPerWall) {
		return fail(`${where}: too many beams on one wall`);
	}
	const beams: WallBeamDefinition[] = [];
	for (const beam of value) {
		const result = validateBeam(beam, where);
		if (!result.ok) return result;
		beams.push(result.value);
	}
	return { ok: true, value: beams };
}

function validateWall(value: unknown, where: string): ValidationResult<WallDefinition> {
	if (!isRecord(value)) return fail(`${where}: wall must be an object`);
	if (!isNonEmptyString(value.id)) return fail(`${where}: wall id missing`);
	if (!isNonEmptyString(value.foundationId)) return fail(`${where}: wall foundationId missing`);
	for (const key of [
		'startGridX',
		'startGridZ',
		'endGridX',
		'endGridZ',
		'height',
		'thickness'
	] as const) {
		if (!isFiniteNumber(value[key])) return fail(`${where}: wall ${key} must be a finite number`);
	}
	if (value.baseY !== undefined && !isFiniteNumber(value.baseY)) {
		return fail(`${where}: wall baseY must be a finite number`);
	}
	const material = validateMaterial(value.material, where);
	if (!material.ok) return material;
	if (!Array.isArray(value.openings)) return fail(`${where}: wall openings must be an array`);
	if (value.openings.length > IMPORT_LIMITS.openingsPerWall) {
		return fail(`${where}: too many openings on one wall`);
	}
	for (const opening of value.openings) {
		const result = validateOpening(opening, where);
		if (!result.ok) return result;
	}
	const beams = validateOptionalBeams(value.beams, where);
	if (!beams.ok) return beams;
	return { ok: true, value: value as unknown as WallDefinition };
}

function validateWallPathSegment(
	value: unknown,
	where: string
): ValidationResult<WallPathSegmentDefinition> {
	if (!isRecord(value)) return fail(`${where}: wall path segment must be an object`);
	if (!isNonEmptyString(value.id)) return fail(`${where}: wall path segment id missing`);
	const material = validateMaterial(value.material, where);
	if (!material.ok) return material;
	if (!Array.isArray(value.openings)) return fail(`${where}: segment openings must be an array`);
	if (value.openings.length > IMPORT_LIMITS.openingsPerWall) {
		return fail(`${where}: too many openings on one wall path segment`);
	}
	for (const opening of value.openings) {
		const result = validateOpening(opening, where);
		if (!result.ok) return result;
	}
	const beams = validateOptionalBeams(value.beams, where);
	if (!beams.ok) return beams;
	return { ok: true, value: value as unknown as WallPathSegmentDefinition };
}

function validateWallPath(value: unknown, where: string): ValidationResult<WallPathDefinition> {
	if (!isRecord(value)) return fail(`${where}: wall path must be an object`);
	if (!isNonEmptyString(value.id)) return fail(`${where}: wall path id missing`);
	if (!isNonEmptyString(value.foundationId))
		return fail(`${where}: wall path foundationId missing`);
	if (typeof value.closed !== 'boolean')
		return fail(`${where}: wall path closed must be a boolean`);
	if (value.joinStyle !== 'miter' && value.joinStyle !== 'bevel') {
		return fail(`${where}: unknown wall path join style`);
	}
	for (const key of ['wallHeight', 'wallThickness', 'miterLimit'] as const) {
		if (!isFiniteNumber(value[key]))
			return fail(`${where}: wall path ${key} must be a finite number`);
	}
	if (value.baseY !== undefined && !isFiniteNumber(value.baseY)) {
		return fail(`${where}: wall path baseY must be a finite number`);
	}
	if (!Array.isArray(value.points)) return fail(`${where}: wall path points must be an array`);
	if (value.points.length > IMPORT_LIMITS.pointsPerWallPath) {
		return fail(`${where}: wall path has too many points`);
	}
	for (const point of value.points) {
		if (!isRecord(point) || !isFiniteNumber(point.gridX) || !isFiniteNumber(point.gridZ)) {
			return fail(`${where}: wall path point must have finite gridX/gridZ`);
		}
	}
	if (!Array.isArray(value.segments)) return fail(`${where}: wall path segments must be an array`);
	if (value.segments.length > IMPORT_LIMITS.pointsPerWallPath) {
		return fail(`${where}: wall path has too many segments`);
	}
	for (const segment of value.segments) {
		const result = validateWallPathSegment(segment, where);
		if (!result.ok) return result;
	}
	return { ok: true, value: value as unknown as WallPathDefinition };
}

function validateSlabOpening(
	value: unknown,
	where: string
): ValidationResult<SlabOpeningDefinition> {
	if (!isRecord(value)) return fail(`${where}: slab opening must be an object`);
	if (!isNonEmptyString(value.id)) return fail(`${where}: slab opening id missing`);
	if (value.type !== 'stairs') return fail(`${where}: unknown slab opening type`);
	for (const key of ['minGridX', 'maxGridX', 'minGridZ', 'maxGridZ'] as const) {
		if (!isFiniteNumber(value[key])) return fail(`${where}: slab opening ${key} must be finite`);
	}
	if (value.sourceStairId !== undefined && !isNonEmptyString(value.sourceStairId)) {
		return fail(`${where}: slab opening sourceStairId must be a string when present`);
	}
	if (value.frameEnabled !== undefined && typeof value.frameEnabled !== 'boolean') {
		return fail(`${where}: slab opening frameEnabled must be a boolean when present`);
	}
	return { ok: true, value: value as unknown as SlabOpeningDefinition };
}

function validateSlab(value: unknown, where: string): ValidationResult<SlabDefinition> {
	if (!isRecord(value)) return fail(`${where}: slab must be an object`);
	if (!isNonEmptyString(value.id)) return fail(`${where}: slab id missing`);
	if (!isNonEmptyString(value.foundationId)) return fail(`${where}: slab foundationId missing`);
	if (value.type !== 'ceiling' && value.type !== 'floor' && value.type !== 'flat-roof') {
		return fail(`${where}: unknown slab type`);
	}
	for (const key of ['levelIndex', 'localY', 'thickness'] as const) {
		if (!isFiniteNumber(value[key])) return fail(`${where}: slab ${key} must be a finite number`);
	}
	const material = validateMaterial(value.material, where);
	if (!material.ok) return material;
	if (!Array.isArray(value.points)) return fail(`${where}: slab points must be an array`);
	if (value.points.length > IMPORT_LIMITS.pointsPerSlab)
		return fail(`${where}: slab has too many points`);
	for (const point of value.points) {
		if (!isRecord(point) || !isFiniteNumber(point.gridX) || !isFiniteNumber(point.gridZ)) {
			return fail(`${where}: slab point must have finite gridX/gridZ`);
		}
	}
	const openings = value.openings ?? [];
	if (!Array.isArray(openings)) return fail(`${where}: slab openings must be an array`);
	if (openings.length > IMPORT_LIMITS.openingsPerSlab)
		return fail(`${where}: slab has too many openings`);
	for (const opening of openings) {
		const result = validateSlabOpening(opening, where);
		if (!result.ok) return result;
	}
	return { ok: true, value: value as unknown as SlabDefinition };
}

function validateStair(value: unknown, where: string): ValidationResult<StairDefinition> {
	if (!isRecord(value)) return fail(`${where}: stair must be an object`);
	if (!isNonEmptyString(value.id)) return fail(`${where}: stair id missing`);
	if (!isNonEmptyString(value.foundationId)) return fail(`${where}: stair foundationId missing`);
	if (!['+x', '-x', '+z', '-z'].includes(value.direction as string)) {
		return fail(`${where}: unknown stair direction`);
	}
	for (const key of [
		'minGridX',
		'maxGridX',
		'minGridZ',
		'maxGridZ',
		'baseY',
		'levelIndex',
		'gridSizeAtCreation'
	] as const) {
		if (!isFiniteNumber(value[key])) return fail(`${where}: stair ${key} must be a finite number`);
	}
	if ((value.gridSizeAtCreation as number) <= 0)
		return fail(`${where}: stair gridSizeAtCreation must be positive`);
	const material = validateMaterial(value.material, `${where}: stair`);
	if (!material.ok) return material;
	for (const key of [
		'frameEnabled',
		'railingsEnabled',
		'openingEnabled',
		'openingFrameEnabled'
	] as const) {
		if (value[key] !== undefined && typeof value[key] !== 'boolean') {
			return fail(`${where}: stair ${key} must be a boolean when present`);
		}
	}
	return { ok: true, value: value as unknown as StairDefinition };
}

function validateRoofProfileSettings(
	value: unknown,
	where: string
): ValidationResult<RoofProfileSettings> {
	if (!isRecord(value)) return fail(`${where}: roof profileSettings must be an object`);
	for (const key of [
		'gambrelLowerSlopeFraction',
		'gambrelBreakHeightFraction',
		'mansardBreakFraction',
		'dutchGableHipFraction',
		'mShapedValleyFraction'
	] as const) {
		if (!isFiniteNumber(value[key])) {
			return fail(`${where}: roof profileSettings ${key} must be a finite number`);
		}
	}
	return { ok: true, value: value as unknown as RoofProfileSettings };
}

function validateRoof(value: unknown, where: string): ValidationResult<RoofDefinition> {
	if (!isRecord(value)) return fail(`${where}: roof must be an object`);
	if (!isNonEmptyString(value.id)) return fail(`${where}: roof id missing`);
	if (!isNonEmptyString(value.foundationId)) return fail(`${where}: roof foundationId missing`);
	if (!ROOF_TYPE_ORDER.includes(value.type as RoofType)) {
		return fail(`${where}: unknown roof type`);
	}
	if (value.direction !== 'x' && value.direction !== 'z') {
		return fail(`${where}: roof direction must be 'x' or 'z'`);
	}
	if (!['+x', '-x', '+z', '-z'].includes(value.shedDirection as ShedDirection)) {
		return fail(`${where}: unknown roof shedDirection`);
	}
	for (const key of ['levelIndex', 'baseY', 'rise', 'thickness', 'overhang'] as const) {
		if (!isFiniteNumber(value[key])) return fail(`${where}: roof ${key} must be a finite number`);
	}
	const profileSettings = validateRoofProfileSettings(value.profileSettings, where);
	if (!profileSettings.ok) return profileSettings;
	const material = validateMaterial(value.material, where);
	if (!material.ok) return material;
	if (!Array.isArray(value.points)) return fail(`${where}: roof points must be an array`);
	if (value.points.length > IMPORT_LIMITS.pointsPerRoof)
		return fail(`${where}: roof has too many points`);
	for (const point of value.points) {
		if (!isRecord(point) || !isFiniteNumber(point.gridX) || !isFiniteNumber(point.gridZ)) {
			return fail(`${where}: roof point must have finite gridX/gridZ`);
		}
	}
	return { ok: true, value: value as unknown as RoofDefinition };
}

function validateFloorDetail(
	value: unknown,
	where: string
): ValidationResult<FloorDetailDefinition> {
	if (!isRecord(value)) return fail(`${where}: floor detail must be an object`);
	if (!isNonEmptyString(value.id)) return fail(`${where}: floor detail id missing`);
	if (!isNonEmptyString(value.foundationId))
		return fail(`${where}: floor detail foundationId missing`);
	if (!isFloorDetailKind(value.kind)) return fail(`${where}: unknown floor detail kind`);
	if (!isFloorDetailRenderMode(value.renderMode))
		return fail(`${where}: unknown floor detail renderMode`);
	if (!isFloorDetailTilePattern(value.tilePattern))
		return fail(`${where}: unknown floor detail tilePattern`);
	if (!isFloorDetailPlankDirection(value.plankDirection))
		return fail(`${where}: unknown floor detail plankDirection`);
	if (typeof value.pathFraming !== 'boolean')
		return fail(`${where}: floor detail pathFraming must be a boolean`);
	for (const key of ['levelIndex', 'hostY', 'plankWidth', 'tileSize', 'pathWidth'] as const) {
		if (!isFiniteNumber(value[key]))
			return fail(`${where}: floor detail ${key} must be a finite number`);
	}
	if (!Array.isArray(value.colors) || value.colors.length === 0)
		return fail(`${where}: floor detail colors must be a non-empty array`);
	for (const color of value.colors) {
		if (!isValidColorString(color)) return fail(`${where}: invalid floor detail colour`);
	}
	if (!Array.isArray(value.points)) return fail(`${where}: floor detail points must be an array`);
	if (value.points.length > IMPORT_LIMITS.pointsPerFloorDetail)
		return fail(`${where}: floor detail has too many points`);
	for (const point of value.points) {
		if (!isRecord(point) || !isFiniteNumber(point.gridX) || !isFiniteNumber(point.gridZ)) {
			return fail(`${where}: floor detail point must have finite gridX/gridZ`);
		}
	}
	return { ok: true, value: value as unknown as FloorDetailDefinition };
}

function validateFoundation(value: unknown, where: string): ValidationResult<FoundationDefinition> {
	if (!isRecord(value)) return fail(`${where}: foundation must be an object`);
	if (!isNonEmptyString(value.id)) return fail(`${where}: foundation id missing`);
	for (const key of ['minGridX', 'maxGridX', 'minGridZ', 'maxGridZ', 'topY', 'bottomY'] as const) {
		if (!isFiniteNumber(value[key]))
			return fail(`${where}: foundation ${key} must be a finite number`);
	}
	const material = validateMaterial(value.material, where);
	if (!material.ok) return material;
	return { ok: true, value: value as unknown as FoundationDefinition };
}

function validateBuildingLevel(
	value: unknown,
	where: string
): ValidationResult<BuildingLevelDefinition> {
	if (!isRecord(value)) return fail(`${where}: building level must be an object`);
	if (!isNonEmptyString(value.id)) return fail(`${where}: building level id missing`);
	if (!isNonEmptyString(value.foundationId))
		return fail(`${where}: building level foundationId missing`);
	for (const key of ['index', 'baseY', 'wallHeight'] as const) {
		if (!isFiniteNumber(value[key])) return fail(`${where}: building level ${key} must be finite`);
	}
	return { ok: true, value: value as unknown as BuildingLevelDefinition };
}

function validateBuilding(
	value: unknown,
	where: string
): ValidationResult<FoundationBuildingDefinition> {
	if (!isRecord(value)) return fail(`${where}: building must be an object`);
	if (!isNonEmptyString(value.foundationId)) return fail(`${where}: building foundationId missing`);

	const walls = value.walls ?? [];
	const wallPaths = value.wallPaths ?? [];
	const slabs = value.slabs ?? [];
	const stairs = value.stairs ?? [];
	const roofs = value.roofs ?? [];
	const floorDetails = value.floorDetails ?? [];
	if (
		!Array.isArray(walls) ||
		!Array.isArray(wallPaths) ||
		!Array.isArray(slabs) ||
		!Array.isArray(stairs) ||
		!Array.isArray(roofs) ||
		!Array.isArray(floorDetails)
	) {
		return fail(`${where}: building collections must be arrays`);
	}
	if (walls.length > IMPORT_LIMITS.wallsPerFoundation) return fail(`${where}: too many walls`);
	if (wallPaths.length > IMPORT_LIMITS.wallPathsPerFoundation)
		return fail(`${where}: too many wall paths`);
	if (slabs.length > IMPORT_LIMITS.slabsPerFoundation) return fail(`${where}: too many slabs`);
	if (stairs.length > IMPORT_LIMITS.stairsPerFoundation) return fail(`${where}: too many stairs`);
	if (roofs.length > IMPORT_LIMITS.roofsPerFoundation) return fail(`${where}: too many roofs`);
	if (floorDetails.length > IMPORT_LIMITS.floorDetailsPerFoundation)
		return fail(`${where}: too many floor details`);

	for (const wall of walls) {
		const result = validateWall(wall, where);
		if (!result.ok) return result;
	}
	for (const path of wallPaths) {
		const result = validateWallPath(path, where);
		if (!result.ok) return result;
	}
	for (const slab of slabs) {
		const result = validateSlab(slab, where);
		if (!result.ok) return result;
	}
	for (const stair of stairs) {
		const result = validateStair(stair, where);
		if (!result.ok) return result;
	}
	for (const roof of roofs) {
		const result = validateRoof(roof, where);
		if (!result.ok) return result;
	}
	for (const detail of floorDetails) {
		const result = validateFloorDetail(detail, where);
		if (!result.ok) return result;
	}
	return {
		ok: true,
		value: {
			foundationId: value.foundationId,
			walls,
			wallPaths,
			slabs,
			stairs,
			roofs,
			floorDetails
		} as FoundationBuildingDefinition
	};
}

/**
 * Full validation of an untrusted world payload — an imported file, or anything read back from
 * storage that might have been hand-edited. Deliberately structural-and-relational rather than just
 * "does JSON.parse succeed": a file can be perfectly valid JSON and still reference a wall on a
 * foundation that doesn't exist, which would break the building managers at load time.
 *
 * Assumes the payload has already been migrated to the current schema (see WorldMigrationManager) —
 * this validates the *current* shape only, so migrations own backwards compatibility and this owns
 * "is this actually loadable", which keeps both jobs simple.
 */
export function validateWorldDefinition(value: unknown): ValidationResult<WorldDefinition> {
	if (!isRecord(value)) return fail('World data must be an object');
	if (value.schemaVersion !== CURRENT_WORLD_SCHEMA_VERSION) {
		return fail(`Unsupported world schema version: ${String(value.schemaVersion)}`);
	}
	if (!isNonEmptyString(value.id)) return fail('World id missing');
	if (typeof value.name !== 'string') return fail('World name missing');
	if (!isNonEmptyString(value.seed)) return fail('World seed missing');
	for (const key of ['createdAt', 'updatedAt', 'lastPlayedAt'] as const) {
		if (!isNonEmptyString(value[key])) return fail(`World ${key} missing`);
	}
	if (!isFiniteNumber(value.saveRevision) || value.saveRevision < 0) {
		return fail('World saveRevision must be a non-negative number');
	}

	if (!isRecord(value.environment)) return fail('World environment missing');
	for (const key of ['terrain', 'vegetation', 'sky'] as const) {
		if (!isRecord(value.environment[key])) return fail(`World environment.${key} missing`);
	}
	const terrain = value.environment.terrain as Record<string, unknown>;
	if (!isNonEmptyString(terrain.seed)) return fail('Terrain seed missing');
	for (const key of ['chunkSize', 'chunkResolution', 'baseHeight', 'heightMultiplier'] as const) {
		if (!isFiniteNumber(terrain[key])) return fail(`Terrain ${key} must be a finite number`);
	}
	if ((terrain.chunkSize as number) <= 0 || (terrain.chunkResolution as number) <= 0) {
		return fail('Terrain chunkSize/chunkResolution must be positive');
	}

	const creatureError = validateCreatureWorldState(value.creatures);
	if (creatureError) return fail(creatureError);
	const musicError = validateMusic(value.musicTrees, value.musicPlants);
	if (musicError) return fail(musicError);
	if (!Array.isArray(value.foundations)) return fail('World foundations must be an array');
	if (value.foundations.length > IMPORT_LIMITS.foundations) return fail('Too many foundations');
	const foundationIds = new Set<string>();
	for (const foundation of value.foundations) {
		const result = validateFoundation(foundation, 'foundations');
		if (!result.ok) return result;
		if (foundationIds.has(result.value.id))
			return fail(`Duplicate foundation id: ${result.value.id}`);
		foundationIds.add(result.value.id);
	}

	if (value.furniture === undefined) {
		value.furniture = [];
	} else if (!Array.isArray(value.furniture)) {
		return fail('World furniture must be an array');
	}
	const furnitureError = validateFurniture(value.furniture, foundationIds);
	if (furnitureError) return fail(furnitureError);

	if (!Array.isArray(value.buildings)) return fail('World buildings must be an array');
	const buildings: FoundationBuildingDefinition[] = [];
	for (const building of value.buildings) {
		const result = validateBuilding(building, 'buildings');
		if (!result.ok) return result;
		buildings.push(result.value);
	}

	if (!Array.isArray(value.buildingLevels)) return fail('World buildingLevels must be an array');
	if (value.buildingLevels.length > IMPORT_LIMITS.buildingLevels)
		return fail('Too many building levels');
	for (const level of value.buildingLevels) {
		const result = validateBuildingLevel(level, 'buildingLevels');
		if (!result.ok) return result;
	}

	if (!isRecord(value.proceduralOverrides)) return fail('World proceduralOverrides missing');
	const removedTreeIds = value.proceduralOverrides.removedTreeIds;
	if (!Array.isArray(removedTreeIds))
		return fail('proceduralOverrides.removedTreeIds must be an array');
	if (removedTreeIds.length > IMPORT_LIMITS.removedTreeIds)
		return fail('Too many procedural overrides');
	for (const id of removedTreeIds) {
		if (!isNonEmptyString(id))
			return fail('proceduralOverrides.removedTreeIds must contain strings');
	}

	if (!isRecord(value.player)) return fail('World player state missing');
	const position = value.player.position;
	if (
		!isRecord(position) ||
		!isFiniteNumber(position.x) ||
		!isFiniteNumber(position.y) ||
		!isFiniteNumber(position.z)
	) {
		return fail('Player position must have finite x/y/z');
	}
	if (!isFiniteNumber(value.player.yaw) || !isFiniteNumber(value.player.pitch)) {
		return fail('Player yaw/pitch must be finite numbers');
	}

	const referenceError = validateReferences(
		foundationIds,
		buildings,
		value.buildingLevels as BuildingLevelDefinition[],
		value.player as Record<string, unknown>
	);
	if (referenceError) return fail(referenceError);

	return { ok: true, value: value as unknown as WorldDefinition };
}

/**
 * Cross-record integrity: every wall/slab/stair/level must belong to a foundation that actually
 * exists in the same file, and every slab opening claiming a `sourceStairId` must name a stair that
 * exists. Loading is otherwise perfectly capable of *silently* producing a building whose walls hang
 * off nothing, which is far harder to diagnose later than a rejected import.
 *
 * Returns an error message, or `null` when the graph is consistent.
 */
function validateReferences(
	foundationIds: ReadonlySet<string>,
	buildings: readonly FoundationBuildingDefinition[],
	buildingLevels: readonly BuildingLevelDefinition[],
	player: Record<string, unknown>
): string | null {
	const stairIds = new Set<string>();
	for (const building of buildings) {
		for (const stair of building.stairs) stairIds.add(stair.id);
	}

	for (const building of buildings) {
		if (!foundationIds.has(building.foundationId)) {
			return `Building references unknown foundation: ${building.foundationId}`;
		}
		for (const wall of building.walls) {
			if (!foundationIds.has(wall.foundationId)) {
				return `Wall ${wall.id} references unknown foundation: ${wall.foundationId}`;
			}
		}
		for (const path of building.wallPaths) {
			if (!foundationIds.has(path.foundationId)) {
				return `Wall path ${path.id} references unknown foundation: ${path.foundationId}`;
			}
		}
		for (const slab of building.slabs) {
			if (!foundationIds.has(slab.foundationId)) {
				return `Slab ${slab.id} references unknown foundation: ${slab.foundationId}`;
			}
			for (const opening of slab.openings ?? []) {
				// An opening whose owning stair is gone is tolerated rather than rejected: it's exactly
				// the pre-`sourceStairId` case (see SlabTypes), and an orphaned hole in a floor is a
				// cosmetic leftover, not a structural inconsistency that breaks loading.
				if (opening.sourceStairId && !stairIds.has(opening.sourceStairId)) continue;
			}
		}
		for (const stair of building.stairs) {
			if (!foundationIds.has(stair.foundationId)) {
				return `Stair ${stair.id} references unknown foundation: ${stair.foundationId}`;
			}
		}
		for (const detail of building.floorDetails ?? []) {
			if (!foundationIds.has(detail.foundationId)) {
				return `Floor detail ${detail.id} references unknown foundation: ${detail.foundationId}`;
			}
		}
	}

	for (const level of buildingLevels) {
		if (!foundationIds.has(level.foundationId)) {
			return `Building level ${level.id} references unknown foundation: ${level.foundationId}`;
		}
	}

	const activeFoundationId = player.activeFoundationId;
	if (activeFoundationId !== undefined) {
		if (typeof activeFoundationId !== 'string' || !foundationIds.has(activeFoundationId)) {
			return `Player references unknown active foundation: ${String(activeFoundationId)}`;
		}
	}

	return null;
}
