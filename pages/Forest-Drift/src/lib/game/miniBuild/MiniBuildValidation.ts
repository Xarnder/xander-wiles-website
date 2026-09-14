/**
 * Untrusted-data validation for Mini Builds. Every definition that enters the runtime — from
 * IndexedDB, an imported world file or the personal library — passes through here, so a
 * hand-edited save can never bypass the editor's limits (a 10,000-block "chair" is rejected here,
 * long before the compiler sees it).
 *
 * Validators return a *sanitised copy*: derived data (bounds) is recomputed rather than trusted,
 * and designs are re-grounded to Y = 0.
 */
import { normalizeColorHex, type BuildingMaterialDefinition } from '../building/MaterialTypes';
import {
	blockBox,
	boundsFit,
	cloneBlock,
	computeBounds,
	groundBlocks,
	isQuarterTurn,
	sanitizeName
} from './miniBuildGrid';
import {
	MINI_BUILD_FINISHES,
	MINI_BUILD_LIMITS,
	MINI_BUILD_SCHEMA_VERSION,
	MINI_BUILD_V1_GRID_SCALE,
	MINI_BUILD_SEMANTIC_TYPES,
	MINI_BUILD_WORLD_LIMITS,
	type MiniBuildBlock,
	type MiniBuildBlockCollision,
	type MiniBuildDefinition,
	type MiniBuildDraft,
	type MiniBuildFinish,
	type MiniBuildInstance,
	type MiniBuildMaterialOverride,
	type MiniBuildMaterialSlot,
	type MiniBuildSemanticType,
	type MiniBuildWorldState
} from './MiniBuildTypes';

export type MiniBuildValidationResult<T> = { ok: true; value: T } | { ok: false; error: string };

/** Loaded coordinates stay near the editor workspace; anything further is not a real design. */
const MAX_ABS_GRID_COORDINATE = MINI_BUILD_LIMITS.workspaceHalfGrid * 2;
const MAX_ID_LENGTH = 128;
const MAX_WORLD_COORDINATE = 1e7;

function fail<T>(error: string): MiniBuildValidationResult<T> {
	return { ok: false, error };
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isId(value: unknown): value is string {
	return typeof value === 'string' && value.length > 0 && value.length <= MAX_ID_LENGTH;
}

function isGridInteger(value: unknown): value is number {
	return typeof value === 'number' && Number.isInteger(value);
}

function validateMaterialDefinition(value: unknown): BuildingMaterialDefinition | null {
	if (!isRecord(value) || value.type !== 'color' || typeof value.color !== 'string') return null;
	try {
		return { type: 'color', color: normalizeColorHex(value.color) };
	} catch {
		return null;
	}
}

function validateMaterialSlot(
	value: unknown,
	index: number
): MiniBuildValidationResult<MiniBuildMaterialSlot> {
	if (!isRecord(value)) return fail(`Material slot ${index + 1} must be an object`);
	if (!MINI_BUILD_FINISHES.includes(value.finish as MiniBuildFinish)) {
		return fail(`Material slot ${index + 1} has an unknown finish`);
	}
	const material = validateMaterialDefinition(value.material);
	if (!material) return fail(`Material slot ${index + 1} has an invalid material`);
	const name = typeof value.name === 'string' ? value.name.trim().slice(0, 32) : '';
	return {
		ok: true,
		value: {
			name: name || `Material ${index + 1}`,
			finish: value.finish as MiniBuildFinish,
			material
		}
	};
}

function validateBlock(
	value: unknown,
	index: number,
	materialCount: number
): MiniBuildValidationResult<MiniBuildBlock> {
	const label = `Block ${index + 1}`;
	if (!isRecord(value)) return fail(`${label} must be an object`);
	if (!isId(value.id)) return fail(`${label} id missing`);
	const position = value.positionGrid;
	const size = value.sizeGrid;
	const rotation = value.rotation;
	if (!isRecord(position) || !isRecord(size) || !isRecord(rotation)) {
		return fail(`${label} must have positionGrid, sizeGrid and rotation`);
	}
	for (const axis of ['x', 'y', 'z'] as const) {
		const p = position[axis];
		const s = size[axis];
		if (!isGridInteger(p)) return fail(`${label} position must be whole grid units`);
		if (Math.abs(p) > MAX_ABS_GRID_COORDINATE) return fail(`${label} is outside the build area`);
		if (!isGridInteger(s) || s < MINI_BUILD_LIMITS.minBlockSizeGrid) {
			return fail(`${label} size must be whole grid units, zero or more`);
		}
		if (s > MINI_BUILD_LIMITS.maxBoundsGrid[axis]) return fail(`${label} is larger than 4m`);
		if (!isQuarterTurn(rotation[axis])) return fail(`${label} rotation must be 0, 90, 180 or 270`);
	}
	const flat = [size.x, size.y, size.z].filter((s) => s === 0).length;
	if (flat > MINI_BUILD_LIMITS.maxFlatAxesPerBlock) {
		return fail(`${label} can be flat (size 0) on only one axis`);
	}
	if (
		!isGridInteger(value.materialSlot) ||
		value.materialSlot < 0 ||
		value.materialSlot >= materialCount
	) {
		return fail(`${label} references a missing material slot`);
	}
	const collision = value.collision;
	if (
		collision !== undefined &&
		collision !== 'auto' &&
		collision !== 'solid' &&
		collision !== 'none'
	) {
		return fail(`${label} has an unknown collision mode`);
	}
	const layer = value.layer;
	if (
		layer !== undefined &&
		(!isGridInteger(layer) || layer < 0 || layer > MINI_BUILD_LIMITS.maxPlaneLayer)
	) {
		return fail(`${label} has an invalid layer`);
	}
	return {
		ok: true,
		value: cloneBlock({
			id: value.id,
			positionGrid: { x: position.x as number, y: position.y as number, z: position.z as number },
			sizeGrid: { x: size.x as number, y: size.y as number, z: size.z as number },
			rotation: {
				x: rotation.x as MiniBuildBlock['rotation']['x'],
				y: rotation.y as MiniBuildBlock['rotation']['y'],
				z: rotation.z as MiniBuildBlock['rotation']['z']
			},
			materialSlot: value.materialSlot,
			collision: collision as MiniBuildBlockCollision | undefined,
			layer: layer as number | undefined
		})
	};
}

/** Shared by definitions and editor drafts: the blocks+materials content rules. */
export function validateMiniBuildContent(
	blocksRaw: unknown,
	materialsRaw: unknown
): MiniBuildValidationResult<{ blocks: MiniBuildBlock[]; materials: MiniBuildMaterialSlot[] }> {
	if (!Array.isArray(materialsRaw)) return fail('Materials must be an array');
	if (materialsRaw.length < 1) return fail('A Mini Build needs at least one material');
	if (materialsRaw.length > MINI_BUILD_LIMITS.maxMaterialSlots) {
		return fail(`Maximum ${MINI_BUILD_LIMITS.maxMaterialSlots} materials.`);
	}
	const materials: MiniBuildMaterialSlot[] = [];
	for (let i = 0; i < materialsRaw.length; i++) {
		const result = validateMaterialSlot(materialsRaw[i], i);
		if (!result.ok) return result;
		materials.push(result.value);
	}

	if (!Array.isArray(blocksRaw)) return fail('Blocks must be an array');
	if (blocksRaw.length < 1) return fail('A Mini Build needs at least one block');
	if (blocksRaw.length > MINI_BUILD_LIMITS.maxBlocks) {
		return fail(`Maximum ${MINI_BUILD_LIMITS.maxBlocks} blocks.`);
	}
	const blocks: MiniBuildBlock[] = [];
	const ids = new Set<string>();
	for (let i = 0; i < blocksRaw.length; i++) {
		const result = validateBlock(blocksRaw[i], i, materials.length);
		if (!result.ok) return result;
		if (ids.has(result.value.id)) return fail(`Duplicate block id: ${result.value.id}`);
		ids.add(result.value.id);
		blocks.push(result.value);
	}
	if (!boundsFit(computeBounds(blocks))) return fail('Mini Build must fit within 4m × 4m × 4m');
	return { ok: true, value: { blocks: groundBlocks(blocks), materials } };
}

export function validateMiniBuildDraft(
	draft: MiniBuildDraft
): MiniBuildValidationResult<MiniBuildDraft> {
	const content = validateMiniBuildContent(draft.blocks, draft.materials);
	if (!content.ok) return content;
	return {
		ok: true,
		value: {
			name: sanitizeName(draft.name),
			blocks: content.value.blocks,
			materials: content.value.materials,
			semanticType: draft.semanticType
		}
	};
}

export function validateMiniBuildDefinition(
	value: unknown
): MiniBuildValidationResult<MiniBuildDefinition> {
	if (!isRecord(value)) return fail('Mini Build definition must be an object');
	if (!isId(value.id)) return fail('Mini Build id missing');
	const label = `Mini Build ${value.id}`;
	const schemaVersion = value.schemaVersion ?? 1;
	if (
		!isGridInteger(schemaVersion) ||
		schemaVersion < 1 ||
		schemaVersion > MINI_BUILD_SCHEMA_VERSION
	) {
		return fail(`${label} has an unsupported schema version`);
	}
	if (!isGridInteger(value.revision) || value.revision < 1) {
		return fail(`${label} revision must be a positive integer`);
	}
	if (typeof value.name !== 'string') return fail(`${label} name missing`);
	const blocksRaw = schemaVersion < 2 ? upgradeV1Blocks(value.blocks) : value.blocks;
	const content = validateMiniBuildContent(blocksRaw, value.materials);
	if (!content.ok) return fail(`${label}: ${content.error}`);
	if (
		value.anchor !== undefined &&
		(!isRecord(value.anchor) || value.anchor.type !== 'bottom-center')
	) {
		return fail(`${label} has an unsupported anchor`);
	}
	let semanticType: MiniBuildSemanticType | undefined;
	if (value.semanticType !== undefined) {
		if (!MINI_BUILD_SEMANTIC_TYPES.includes(value.semanticType as MiniBuildSemanticType)) {
			return fail(`${label} has an unknown semantic type`);
		}
		semanticType = value.semanticType as MiniBuildSemanticType;
	}
	if (value.sourceDefaultId !== undefined && !isId(value.sourceDefaultId)) {
		return fail(`${label} has an invalid sourceDefaultId`);
	}
	const now = new Date(0).toISOString();
	const blocks = content.value.blocks;
	return {
		ok: true,
		value: {
			schemaVersion: MINI_BUILD_SCHEMA_VERSION,
			id: value.id,
			name: sanitizeName(value.name),
			revision: value.revision,
			blocks,
			materials: content.value.materials,
			bounds: computeBounds(blocks),
			anchor: { type: 'bottom-center' },
			...(semanticType ? { semanticType } : {}),
			...(typeof value.sourceDefaultId === 'string'
				? { sourceDefaultId: value.sourceDefaultId }
				: {}),
			createdAt: typeof value.createdAt === 'string' ? value.createdAt : now,
			updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : now
		}
	};
}

function validateOverrides(
	value: unknown,
	label: string
): MiniBuildValidationResult<MiniBuildMaterialOverride[] | undefined> {
	if (value === undefined) return { ok: true, value: undefined };
	if (!Array.isArray(value) || value.length > MINI_BUILD_LIMITS.maxMaterialSlots) {
		return fail(`${label} materialOverrides must be an array of at most 4 entries`);
	}
	const slots = new Set<number>();
	const overrides: MiniBuildMaterialOverride[] = [];
	for (const entry of value) {
		if (!isRecord(entry) || !isGridInteger(entry.slot) || entry.slot < 0) {
			return fail(`${label} has an invalid material override`);
		}
		if (entry.slot >= MINI_BUILD_LIMITS.maxMaterialSlots || slots.has(entry.slot)) {
			return fail(`${label} has an invalid material override slot`);
		}
		const material = validateMaterialDefinition(entry.material);
		if (!material) return fail(`${label} has an invalid override material`);
		slots.add(entry.slot);
		overrides.push({ slot: entry.slot, material });
	}
	return { ok: true, value: overrides.length > 0 ? overrides : undefined };
}

export function validateMiniBuildInstance(
	value: unknown,
	definitionIds: ReadonlySet<string>,
	foundationIds?: ReadonlySet<string>
): MiniBuildValidationResult<MiniBuildInstance> {
	if (!isRecord(value)) return fail('Mini Build instance must be an object');
	if (!isId(value.id)) return fail('Mini Build instance id missing');
	const label = `Mini Build instance ${value.id}`;
	if (!isId(value.designId)) return fail(`${label} designId missing`);
	if (!definitionIds.has(value.designId)) {
		return fail(`${label} references unknown design: ${value.designId}`);
	}
	const position = value.position;
	if (!isRecord(position)) return fail(`${label} position missing`);
	for (const axis of ['x', 'y', 'z'] as const) {
		const v = position[axis];
		if (typeof v !== 'number' || !Number.isFinite(v) || Math.abs(v) > MAX_WORLD_COORDINATE) {
			return fail(`${label} must have a finite position`);
		}
	}
	if (!isQuarterTurn(value.rotationY)) return fail(`${label} rotationY must be 0, 90, 180 or 270`);
	const overrides = validateOverrides(value.materialOverrides, label);
	if (!overrides.ok) return overrides;
	const instance: MiniBuildInstance = {
		id: value.id,
		designId: value.designId,
		position: { x: position.x as number, y: position.y as number, z: position.z as number },
		rotationY: value.rotationY
	};
	// A dangling foundation link is only a hint for future cascade behaviour, so it is dropped
	// rather than failing the whole world.
	if (isId(value.foundationId) && (!foundationIds || foundationIds.has(value.foundationId))) {
		instance.foundationId = value.foundationId;
	}
	if (isId(value.levelId)) instance.levelId = value.levelId;
	if (overrides.value) instance.materialOverrides = overrides.value;
	return { ok: true, value: instance };
}

/**
 * Structural validation of the world's `miniBuilds` block. Budget enforcement is deliberately NOT
 * here: an over-budget chunk is loadable (excess instances stay inactive — see
 * MiniBuildInstanceManager.load), while structural corruption is not.
 */
export function validateMiniBuildWorldState(
	value: unknown,
	foundationIds?: ReadonlySet<string>
): MiniBuildValidationResult<MiniBuildWorldState> {
	if (value === undefined) return { ok: true, value: { definitions: [], instances: [] } };
	if (!isRecord(value)) return fail('World miniBuilds must be an object');
	const definitionsRaw = value.definitions ?? [];
	const instancesRaw = value.instances ?? [];
	if (!Array.isArray(definitionsRaw)) return fail('miniBuilds.definitions must be an array');
	if (!Array.isArray(instancesRaw)) return fail('miniBuilds.instances must be an array');
	if (definitionsRaw.length > MINI_BUILD_WORLD_LIMITS.maxDefinitionsPerWorld) {
		return fail('Too many Mini Build designs');
	}
	if (instancesRaw.length > MINI_BUILD_WORLD_LIMITS.maxInstancesPerWorld) {
		return fail('Too many Mini Build objects');
	}
	const definitions: MiniBuildDefinition[] = [];
	const definitionIds = new Set<string>();
	for (const raw of definitionsRaw) {
		const result = validateMiniBuildDefinition(raw);
		if (!result.ok) return result;
		if (definitionIds.has(result.value.id)) {
			return fail(`Duplicate Mini Build design id: ${result.value.id}`);
		}
		definitionIds.add(result.value.id);
		definitions.push(result.value);
	}
	const instances: MiniBuildInstance[] = [];
	const instanceIds = new Set<string>();
	for (const raw of instancesRaw) {
		const result = validateMiniBuildInstance(raw, definitionIds, foundationIds);
		if (!result.ok) return result;
		if (instanceIds.has(result.value.id)) {
			return fail(`Duplicate Mini Build instance id: ${result.value.id}`);
		}
		instanceIds.add(result.value.id);
		instances.push(result.value);
	}
	return { ok: true, value: { definitions, instances } };
}

/**
 * v1 designs used a 0.125m grid; v2 uses 0.0625m. Doubling every grid coordinate keeps each block at
 * exactly the same size and place in metres. Non-numeric fields are left alone so malformed data
 * still fails validation afterwards rather than being "repaired".
 */
export function upgradeV1Blocks(blocks: unknown): unknown {
	if (!Array.isArray(blocks)) return blocks;
	const scale = (vector: unknown) => {
		if (!isRecord(vector)) return vector;
		const out: Record<string, unknown> = { ...vector };
		for (const axis of ['x', 'y', 'z'] as const) {
			if (typeof vector[axis] === 'number')
				out[axis] = (vector[axis] as number) * MINI_BUILD_V1_GRID_SCALE;
		}
		return out;
	};
	return blocks.map((block) =>
		isRecord(block)
			? { ...block, positionGrid: scale(block.positionGrid), sizeGrid: scale(block.sizeGrid) }
			: block
	);
}

/** True when every block's effective box has integer coordinates — asserted by tests and the compiler. */
export function blocksOnGrid(blocks: readonly MiniBuildBlock[]): boolean {
	return blocks.every((block) => {
		const box = blockBox(block);
		return [box.min.x, box.min.y, box.min.z, box.max.x, box.max.y, box.max.z].every(
			Number.isInteger
		);
	});
}
