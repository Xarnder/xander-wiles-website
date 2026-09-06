import type { BuildingLevelDefinition } from '../building/BuildingLevelTypes';
import type { FoundationDefinition } from '../building/FoundationTypes';
import type { FoundationBuildingDefinition } from '../building/WallTypes';
import {
	createDefaultPlayerState,
	createEmptyProceduralOverrides,
	CURRENT_WORLD_SCHEMA_VERSION,
	type ProceduralWorldOverrides,
	type SavedPlayerState,
	type WorldDefinition,
	type WorldEnvironmentDefinition
} from './WorldTypes';

/**
 * Counters the autosave manager polls to decide whether anything actually changed, without
 * serializing to find out. Each is a plain integer bumped by the owning manager on mutation, so
 * "has the world changed?" costs a few comparisons per second instead of a full re-serialize —
 * see WorldAutosaveManager.
 */
export interface WorldRevisionCounters {
	/** Foundations, walls, wall paths, slabs, stairs, openings, materials, building levels. */
	structural: number;
	/** Terrain / vegetation / sky generation settings (the debug GUI mutates these live). */
	environment: number;
	/** Procedural-world deltas (removed trees, etc). */
	procedural: number;
}

/**
 * The port the running game exposes to persistence. `ThreeScene` implements it; nothing in this
 * module or below imports Three.js, which is the point — the serializer's whole job is to convert
 * between *logical* world state and the persisted contract, and it must not be able to reach a mesh
 * even by accident.
 */
export interface WorldRuntime {
	getEnvironment(): WorldEnvironmentDefinition;
	getFoundations(): FoundationDefinition[];
	getBuildings(): FoundationBuildingDefinition[];
	getBuildingLevels(): BuildingLevelDefinition[];
	getPlayerState(): SavedPlayerState;
	getProceduralOverrides(): ProceduralWorldOverrides;
	getRevisionCounters(): WorldRevisionCounters;
}

/** The mutable half of a world — everything that changes while playing, as opposed to identity/timestamps which WorldManager owns. */
export interface WorldContentSnapshot {
	environment: WorldEnvironmentDefinition;
	foundations: FoundationDefinition[];
	buildings: FoundationBuildingDefinition[];
	buildingLevels: BuildingLevelDefinition[];
	proceduralOverrides: ProceduralWorldOverrides;
	player: SavedPlayerState;
}

/**
 * Snapshots the live game into plain data.
 *
 * Deep-cloned on the way out, deliberately: the runtime settings objects are mutated in place by the
 * debug GUI and by graphics-quality render-distance scaling, so a snapshot that aliased them would
 * keep changing after it was taken — which would make `saveRevision` meaningless and could write a
 * half-changed world if a slider moved mid-save.
 *
 * Note what is NOT read here, and cannot be: terrain chunks, tree instances, collision rects,
 * picking proxies, preview geometry, materials, or anything else the renderer builds. Those are all
 * reproducible from `environment` + `seed`, so storing them would trade a compact save for a
 * gigantic one that says nothing new.
 */
export function captureWorldContent(runtime: WorldRuntime): WorldContentSnapshot {
	return deepClone({
		environment: runtime.getEnvironment(),
		foundations: runtime.getFoundations(),
		buildings: runtime.getBuildings(),
		buildingLevels: runtime.getBuildingLevels(),
		proceduralOverrides: runtime.getProceduralOverrides(),
		player: sanitizePlayerState(runtime.getPlayerState())
	});
}

/** Folds a fresh snapshot into an existing world record, bumping the revision/timestamp. Identity (`id`, `createdAt`) is never touched. */
export function applyContentToWorld(
	world: WorldDefinition,
	content: WorldContentSnapshot,
	now: string = new Date().toISOString()
): WorldDefinition {
	return {
		...world,
		environment: content.environment,
		foundations: content.foundations,
		buildings: content.buildings,
		buildingLevels: content.buildingLevels,
		proceduralOverrides: content.proceduralOverrides,
		player: content.player,
		// The world's seed is authoritative over the terrain settings copy, so a world can never end
		// up generating from a different seed than the one the Worlds screen shows.
		seed: world.seed,
		updatedAt: now,
		saveRevision: world.saveRevision + 1,
		schemaVersion: CURRENT_WORLD_SCHEMA_VERSION
	};
}

export interface CreateWorldParams {
	id: string;
	name: string;
	seed: string;
	environment: WorldEnvironmentDefinition;
	now?: string;
}

/**
 * A brand-new, empty world. The environment settings passed in are snapshotted *explicitly* rather
 * than left to be re-derived from `createDefault*Settings()` at load time — application defaults
 * drift between releases, and a world made today must still look like itself after they do.
 */
export function createWorldDefinition({
	id,
	name,
	seed,
	environment,
	now = new Date().toISOString()
}: CreateWorldParams): WorldDefinition {
	const cloned = deepClone(environment);
	cloned.terrain.seed = seed;
	return {
		schemaVersion: CURRENT_WORLD_SCHEMA_VERSION,
		id,
		name,
		createdAt: now,
		updatedAt: now,
		lastPlayedAt: now,
		saveRevision: 1,
		seed,
		environment: cloned,
		foundations: [],
		buildings: [],
		buildingLevels: [],
		proceduralOverrides: createEmptyProceduralOverrides(),
		player: createDefaultPlayerState()
	};
}

/**
 * Guards a restored spawn. A world whose player position is non-finite or absurdly far out (a
 * corrupted or hand-edited save) must not strand someone at `NaN` or a hundred million units below
 * the terrain with no way back — falling back to the origin costs one player their exact position
 * and saves the world.
 */
export function sanitizePlayerState(player: SavedPlayerState): SavedPlayerState {
	const safeCoordinate = (value: number): number =>
		Number.isFinite(value) && Math.abs(value) < 1e7 ? value : 0;
	const safeAngle = (value: number): number => (Number.isFinite(value) ? value : 0);
	return {
		position: {
			x: safeCoordinate(player.position?.x ?? 0),
			y: safeCoordinate(player.position?.y ?? 0),
			z: safeCoordinate(player.position?.z ?? 0)
		},
		yaw: safeAngle(player.yaw ?? 0),
		pitch: safeAngle(player.pitch ?? 0),
		activeFoundationId: player.activeFoundationId,
		currentLevelIndexByFoundation: player.currentLevelIndexByFoundation ?? {}
	};
}

/** Structured clone where available (preserves numeric precision exactly), JSON round-trip otherwise. */
export function deepClone<T>(value: T): T {
	if (typeof structuredClone === 'function') return structuredClone(value);
	return JSON.parse(JSON.stringify(value)) as T;
}
