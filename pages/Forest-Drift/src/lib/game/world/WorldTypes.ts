import type { CreatureWorldState } from '../creatures/CreatureTypes';
import type { MusicTreeDefinition, MusicPlantDefinition } from '../music/MusicModel';
import type { FurnitureDefinition } from '../building/FurnitureTypes';
import type { FoundationDefinition } from '../building/FoundationTypes';
import type { BuildingLevelDefinition } from '../building/BuildingLevelTypes';
import type { FoundationBuildingDefinition } from '../building/WallTypes';
import type { SkySettings } from '../sky/SkyTypes';
import type { TerrainSettings } from '../terrain/TerrainSettings';
import type { VegetationSettings } from '../vegetation/VegetationTypes';

/**
 * The persisted world-schema version. Bump this whenever `WorldDefinition`'s shape changes in a way
 * an older save can't be read as-is, and add a matching step to WorldMigrationManager — see its doc
 * comment. Deliberately separate from the *application* version (APPLICATION_VERSION below): a game
 * release doesn't imply a schema change, and a schema change doesn't imply a release.
 */
export const CURRENT_WORLD_SCHEMA_VERSION = 6;

/** Written into export packages purely as provenance ("which build wrote this file") — never used to decide whether a world can be loaded; that's `schemaVersion`'s job alone. */
export const APPLICATION_VERSION = '0.1.0';

/**
 * Everything that defines how a world *generates* — the deterministic inputs the infinite terrain,
 * biome, forest and sky systems are rebuilt from on load.
 *
 * These are snapshotted into every world explicitly, including values that happen to equal today's
 * `createDefault*Settings()` output, because application defaults will drift between releases and a
 * saved world must keep looking the way it looked when it was made. That is the whole reason this
 * is world state and not an application preference — contrast `GraphicsSettings`, which is a local
 * player preference (see GraphicsSettingsStore) and deliberately NOT stored here: "Graphics: ULTRA"
 * belongs to a person's machine, not to a world.
 */
export interface WorldEnvironmentDefinition {
	terrain: TerrainSettings;
	vegetation: VegetationSettings;
	sky: SkySettings;
}

/**
 * Where the player was standing when the world was last saved. Deliberately excludes every
 * transient movement input (velocity, held keys, jump state, pointer-lock state) — those are
 * runtime state that must reset cleanly on load, not world content.
 */
export interface SavedPlayerState {
	position: { x: number; y: number; z: number };
	/** Radians, matching FirstPersonController's own yaw/pitch convention. */
	yaw: number;
	pitch: number;
	/** The foundation the build tools were locked onto, if any — restored so reopening a world resumes editing the same building. */
	activeFoundationId?: string;
	/** Per-foundation "which storey am I building on", keyed by foundation id. */
	currentLevelIndexByFoundation?: Record<string, number>;
}

/**
 * Differences from the deterministic procedural world — never the procedural world itself.
 *
 * The infinite world's trees exist because `(worldSeed, vegetation cell)` says so, so a world that
 * has been walked across for 20km stores nothing extra. Only *exceptions* are recorded: cutting one
 * tree down stores that one tree's deterministic id, not the millions of trees still standing. Every
 * future procedural-world edit (terrain deformation, harvested resources, scattered props) should
 * follow the same delta shape rather than materialising the generated world into the save.
 */
export interface ProceduralWorldOverrides {
	/** Deterministic ids of procedural trees the player has removed. */
	removedTreeIds: string[];
}

/**
 * The authoritative, serializable definition of one world — the single persistence contract for
 * everything below. Nothing in here is a Three.js object, a mesh, a geometry, a material instance,
 * or a generated terrain/vegetation chunk: those are all runtime representations rebuilt from this.
 *
 * The split is deliberate and is the core rule of this system:
 *
 *   SAVED       — what defines the world (seed, generation settings, authored buildings, deltas)
 *   REGENERATED — everything derivable from that (terrain vertices, tree instances, collision
 *                 rects, picking proxies, preview/debug geometry, shadow maps, materials)
 *
 * so save size grows with *authored content*, not with explored area.
 */
export interface WorldDefinition {
	schemaVersion: number;

	id: string;
	name: string;

	createdAt: string;
	updatedAt: string;
	lastPlayedAt: string;

	/** Monotonically increasing; every successful write bumps it. Used to reject stale async writes today (see WorldAutosaveManager) and to detect divergence between replicas later. */
	saveRevision: number;

	/** The world's own seed. `environment.terrain.seed` is kept in sync with this — this field is the authoritative one and is what the Worlds UI shows. */
	seed: string;

	environment: WorldEnvironmentDefinition;

	/** Player-authored content — cannot be regenerated from the seed, so it is stored in full. */
	/** Ecology settings and explicitly persistent recipes; ambient fauna are never saved. */
	creatures: CreatureWorldState;
	musicTrees: MusicTreeDefinition[];
	musicPlants: MusicPlantDefinition[];
	furniture: FurnitureDefinition[];
	foundations: FoundationDefinition[];
	buildings: FoundationBuildingDefinition[];
	buildingLevels: BuildingLevelDefinition[];

	proceduralOverrides: ProceduralWorldOverrides;

	player: SavedPlayerState;
}

/**
 * The small record the Worlds browser lists. Kept in its own IndexedDB store so opening the Worlds
 * screen reads only these (a few hundred bytes each) instead of deserializing every full world just
 * to render a name and a date — which matters as soon as a player has several large worlds.
 */
export interface WorldMetadata {
	id: string;
	name: string;
	createdAt: string;
	updatedAt: string;
	lastPlayedAt: string;
	schemaVersion: number;
	saveRevision: number;
	seed: string;
	/** Approximate serialized size of the world record, for the Worlds UI. */
	byteSize?: number;
}

export type SaveStatus = 'saved' | 'dirty' | 'saving' | 'error';

export function createEmptyProceduralOverrides(): ProceduralWorldOverrides {
	return { removedTreeIds: [] };
}

export function createDefaultPlayerState(): SavedPlayerState {
	return {
		position: { x: 0, y: 0, z: 0 },
		yaw: 0,
		pitch: 0,
		currentLevelIndexByFoundation: {}
	};
}

/** Derives the listing record from a full world — the one place that mapping lives, so the two stores can't drift. */
export function metadataFromWorld(world: WorldDefinition, byteSize?: number): WorldMetadata {
	return {
		id: world.id,
		name: world.name,
		createdAt: world.createdAt,
		updatedAt: world.updatedAt,
		lastPlayedAt: world.lastPlayedAt,
		schemaVersion: world.schemaVersion,
		saveRevision: world.saveRevision,
		seed: world.seed,
		byteSize
	};
}
