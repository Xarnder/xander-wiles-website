/**
 * The shared world as rows (plan §7.2): every authored thing is an *entity* with its own id, and
 * the parts people add to each other's builds — windows and doors, beams, wall-path segments, slab
 * and roof openings — are *sub-entities* with their own rows. Two people can then work on the same
 * house at once: different rows (or different fields of one row) never clash, and the same field
 * resolves "later change wins" in the room's order.
 *
 * Pure data, no Three.js or DOM: the room (Cloudflare) and every browser run exactly this code, so a
 * world flattens and rebuilds identically everywhere.
 *
 * Rows only ever describe *authored content*. The environment (terrain, sky, weather), creatures
 * (local in v1, Q9-A) and the player's position (a per-player bookmark) travel separately.
 */

export type TopEntityKind =
	| 'foundation'
	| 'buildingLevel'
	| 'wall'
	| 'wallPath'
	| 'slab'
	| 'stair'
	| 'roof'
	| 'floorDetail'
	| 'skirtingRun'
	| 'barrier'
	| 'furniture'
	| 'miniBuildDefinition'
	| 'miniBuildInstance'
	| 'musicTree'
	| 'musicPlant'
	| 'removedTree';

export type SubEntityKind =
	| 'wallOpening'
	| 'wallBeam'
	| 'pathSegment'
	| 'pathOpening'
	| 'pathBeam'
	| 'slabOpening'
	| 'roofOpening';

export type EntityKind = TopEntityKind | SubEntityKind;

export const TOP_ENTITY_KINDS: readonly TopEntityKind[] = [
	'foundation',
	'buildingLevel',
	'wall',
	'wallPath',
	'slab',
	'stair',
	'roof',
	'floorDetail',
	'skirtingRun',
	'barrier',
	'furniture',
	'miniBuildDefinition',
	'miniBuildInstance',
	'musicTree',
	'musicPlant',
	'removedTree'
];

/** Which array of a parent holds which kind of sub-entity. */
interface ChildSpec {
	field: string;
	kind: SubEntityKind;
	/** Ordered children carry their position as `index` (wall-path segments line up with points). */
	ordered?: boolean;
}

export const CHILD_SPECS: Readonly<Partial<Record<EntityKind, readonly ChildSpec[]>>> = {
	wall: [
		{ field: 'openings', kind: 'wallOpening' },
		{ field: 'beams', kind: 'wallBeam' }
	],
	wallPath: [{ field: 'segments', kind: 'pathSegment', ordered: true }],
	pathSegment: [
		{ field: 'openings', kind: 'pathOpening' },
		{ field: 'beams', kind: 'pathBeam' }
	],
	slab: [{ field: 'openings', kind: 'slabOpening' }],
	roof: [{ field: 'openings', kind: 'roofOpening' }]
};

/** A sub-entity's parent kind. */
export const PARENT_KIND: Readonly<Record<SubEntityKind, EntityKind>> = {
	wallOpening: 'wall',
	wallBeam: 'wall',
	pathSegment: 'wallPath',
	pathOpening: 'pathSegment',
	pathBeam: 'pathSegment',
	slabOpening: 'slab',
	roofOpening: 'roof'
};

/** Kinds whose rows point at a foundation through `foundationId` (the foundation's dependents). */
const FOUNDATION_DEPENDENTS: ReadonlySet<EntityKind> = new Set<EntityKind>([
	'buildingLevel',
	'wall',
	'wallPath',
	'slab',
	'stair',
	'roof',
	'floorDetail',
	'skirtingRun',
	'barrier',
	'furniture',
	'miniBuildInstance'
]);

/**
 * Fields that never travel as patches. A foundation's `bottomY` is re-grounded locally against the
 * terrain each player generates (plan §7.4), so it would otherwise ping-pong between clients.
 */
export const EXCLUDED_PATCH_FIELDS: Readonly<Partial<Record<EntityKind, readonly string[]>>> = {
	foundation: ['bottomY']
};

export interface EntityRow {
	kind: EntityKind;
	id: string;
	/**
	 * Sub-entities only: the parent's *scoped id* — its id, or for a parent that is itself a
	 * sub-entity (a wall-path segment), `pathId/segmentId`. See `scopedId`.
	 */
	parent?: string;
	/** The entity's own fields, without its child arrays. */
	data: Record<string, unknown>;
}

export function isSubEntityKind(kind: EntityKind): kind is SubEntityKind {
	return kind in PARENT_KIND;
}

export function isEntityKind(value: unknown): value is EntityKind {
	return (
		typeof value === 'string' &&
		(TOP_ENTITY_KINDS.includes(value as TopEntityKind) || value in PARENT_KIND)
	);
}

/**
 * The row's unique key. Sub-entities are keyed under their parent, so two walls that happen to carry
 * openings with the same id (a copied wall, say) can never collide.
 */
export function entityKey(kind: EntityKind, id: string, parent?: string): string {
	return parent === undefined ? `${kind}:${id}` : `${kind}:${parent}/${id}`;
}

export function rowKey(row: Pick<EntityRow, 'kind' | 'id' | 'parent'>): string {
	return entityKey(row.kind, row.id, row.parent);
}

/** How children refer to this row: its id, prefixed by its own parent's scoped id if it has one. */
export function scopedId(row: Pick<EntityRow, 'id' | 'parent'>): string {
	return row.parent === undefined ? row.id : `${row.parent}/${row.id}`;
}

/** The parent row's key (sub-entities only). */
export function parentKeyOf(row: Pick<EntityRow, 'kind' | 'parent'>): string {
	return `${PARENT_KIND[row.kind as SubEntityKind]}:${row.parent}`;
}

/**
 * The world's authored content: the matching fields of `WorldContentSnapshot` (environment,
 * creatures and player excluded). Typed loosely so the room's bundle doesn't pull in every building
 * module's types; callers pass and receive the real shapes.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = any;
export interface AuthoredContent {
	foundations: Loose[];
	buildings: Loose[];
	buildingLevels: Loose[];
	barriers: Loose[];
	furniture: Loose[];
	miniBuilds: { definitions: Loose[]; instances: Loose[] };
	musicTrees: Loose[];
	musicPlants: Loose[];
	proceduralOverrides: { removedTreeIds: string[] };
}

/** Splits authored content into rows. */
export function flattenWorld(content: AuthoredContent): EntityRow[] {
	const rows: EntityRow[] = [];
	const top = (kind: TopEntityKind, value: unknown) => pushEntity(rows, kind, value, undefined);
	for (const foundation of content.foundations ?? []) top('foundation', foundation);
	for (const level of content.buildingLevels ?? []) top('buildingLevel', level);
	for (const building of content.buildings ?? []) {
		for (const wall of building.walls ?? []) top('wall', wall);
		for (const path of building.wallPaths ?? []) top('wallPath', path);
		for (const slab of building.slabs ?? []) top('slab', slab);
		for (const stair of building.stairs ?? []) top('stair', stair);
		for (const roof of building.roofs ?? []) top('roof', roof);
		for (const detail of building.floorDetails ?? []) top('floorDetail', detail);
		for (const run of building.skirtingRuns ?? []) top('skirtingRun', run);
	}
	for (const barrier of content.barriers ?? []) top('barrier', barrier);
	for (const item of content.furniture ?? []) top('furniture', item);
	for (const design of content.miniBuilds?.definitions ?? []) top('miniBuildDefinition', design);
	for (const instance of content.miniBuilds?.instances ?? []) top('miniBuildInstance', instance);
	for (const tree of content.musicTrees ?? []) top('musicTree', tree);
	for (const plant of content.musicPlants ?? []) top('musicPlant', plant);
	for (const id of content.proceduralOverrides?.removedTreeIds ?? []) {
		rows.push({ kind: 'removedTree', id, data: {} });
	}
	return rows;
}

function pushEntity(
	rows: EntityRow[],
	kind: EntityKind,
	value: unknown,
	parent: string | undefined,
	index?: number
): void {
	const source = value as Record<string, unknown>;
	const data: Record<string, unknown> = {};
	const specs = CHILD_SPECS[kind] ?? [];
	for (const [key, field] of Object.entries(source)) {
		if (field === undefined || specs.some((spec) => spec.field === key)) continue;
		data[key] = cloneJson(field);
	}
	if (index !== undefined) data.index = index;
	const id = String(source.id);
	const row: EntityRow = parent === undefined ? { kind, id, data } : { kind, id, parent, data };
	rows.push(row);
	const childParent = scopedId(row);
	for (const spec of specs) {
		const children = source[spec.field];
		if (!Array.isArray(children)) continue;
		children.forEach((child, i) =>
			pushEntity(rows, spec.kind, child, childParent, spec.ordered ? i : undefined)
		);
	}
}

/**
 * Rebuilds authored content from rows. Unordered children come back sorted by id, so every replica
 * builds byte-identical arrays whatever order the rows arrived in.
 */
export function unflattenWorld(rows: Iterable<EntityRow>): AuthoredContent {
	const byKind = new Map<EntityKind, EntityRow[]>();
	const children = new Map<string, EntityRow[]>();
	for (const row of rows) {
		if (row.parent !== undefined) {
			const list = children.get(`${row.kind}|${row.parent}`) ?? [];
			list.push(row);
			children.set(`${row.kind}|${row.parent}`, list);
			continue;
		}
		const list = byKind.get(row.kind) ?? [];
		list.push(row);
		byKind.set(row.kind, list);
	}

	const build = (row: EntityRow): Record<string, unknown> => {
		const value: Record<string, unknown> = { ...cloneJson(row.data) };
		const specs = CHILD_SPECS[row.kind] ?? [];
		if (specs.length === 0) return value;
		const own = scopedId(row);
		for (const spec of specs) {
			const list = [...(children.get(`${spec.kind}|${own}`) ?? [])];
			if (spec.ordered) {
				list.sort(
					(a, b) => Number(a.data.index ?? 0) - Number(b.data.index ?? 0) || compareIds(a, b)
				);
			} else {
				list.sort(compareIds);
			}
			value[spec.field] = list.map((child) => {
				const built = build(child);
				if (spec.ordered) delete built.index;
				return built;
			});
		}
		return value;
	};
	const all = (kind: TopEntityKind) => [...(byKind.get(kind) ?? [])].sort(compareIds).map(build);

	const foundations = all('foundation');
	const parts = {
		walls: all('wall'),
		wallPaths: all('wallPath'),
		slabs: all('slab'),
		stairs: all('stair'),
		roofs: all('roof'),
		floorDetails: all('floorDetail'),
		skirtingRuns: all('skirtingRun')
	};
	const buildingIds = new Set<string>();
	for (const list of Object.values(parts)) {
		for (const part of list) buildingIds.add(String(part.foundationId));
	}
	const buildings = [...buildingIds].sort().map((foundationId) => {
		const of = (list: Record<string, unknown>[]) =>
			list.filter((part) => part.foundationId === foundationId);
		return {
			foundationId,
			walls: of(parts.walls),
			wallPaths: of(parts.wallPaths),
			slabs: of(parts.slabs),
			stairs: of(parts.stairs),
			roofs: of(parts.roofs),
			floorDetails: of(parts.floorDetails),
			skirtingRuns: of(parts.skirtingRuns)
		};
	});

	return {
		foundations,
		buildings,
		buildingLevels: all('buildingLevel'),
		barriers: all('barrier'),
		furniture: all('furniture'),
		miniBuilds: { definitions: all('miniBuildDefinition'), instances: all('miniBuildInstance') },
		musicTrees: all('musicTree'),
		musicPlants: all('musicPlant'),
		proceduralOverrides: {
			removedTreeIds: [...(byKind.get('removedTree') ?? [])].map((row) => row.id).sort()
		}
	} as unknown as AuthoredContent;
}

function compareIds(a: EntityRow, b: EntityRow): number {
	return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

// ---------------------------------------------------------------------------------------------
// Operations (plan §7.3)
// ---------------------------------------------------------------------------------------------

export type WorldOp =
	| { op: 'add'; kind: EntityKind; id: string; parent?: string; data: Record<string, unknown> }
	| {
			op: 'patch';
			kind: EntityKind;
			id: string;
			parent?: string;
			/** Changed fields and their new values. */
			set?: Record<string, unknown>;
			/** Fields that were removed (back to their default, e.g. a wall's paint reset). */
			unset?: string[];
			/** The field revisions this change was based on, for "Sam changed this" notices. */
			seen?: Record<string, number>;
	  }
	| {
			op: 'del';
			kind: EntityKind;
			id: string;
			parent?: string;
			/** Keys of other people's additions the player agreed to remove too (F2-B). */
			confirm?: string[];
	  };

export function opKey(op: WorldOp): string {
	return entityKey(op.kind, op.id, op.parent);
}

/**
 * The ops that turn `before` into `after`: new keys are adds, missing keys are deletes, and changed
 * fields are one patch per entity carrying only those fields. Parents are added before children and
 * deleted after them; a deleted parent's children are left implicit (they go with it).
 */
export function diffRows(
	before: ReadonlyMap<string, EntityRow>,
	after: ReadonlyMap<string, EntityRow>,
	fieldRevOf?: (key: string, field: string) => number
): WorldOp[] {
	const adds: WorldOp[] = [];
	const patches: WorldOp[] = [];
	const dels: WorldOp[] = [];
	for (const [key, row] of after) {
		const old = before.get(key);
		if (!old) {
			adds.push(
				withParent({ op: 'add', kind: row.kind, id: row.id, data: cloneJson(row.data) }, row)
			);
			continue;
		}
		const excluded = EXCLUDED_PATCH_FIELDS[row.kind] ?? [];
		const set: Record<string, unknown> = {};
		const unset: string[] = [];
		const seen: Record<string, number> = {};
		for (const field of new Set([...Object.keys(old.data), ...Object.keys(row.data)])) {
			if (excluded.includes(field)) continue;
			const was = old.data[field];
			const now = row.data[field];
			if (canonical(was) === canonical(now)) continue;
			if (now === undefined) unset.push(field);
			else set[field] = cloneJson(now);
			if (fieldRevOf) seen[field] = fieldRevOf(key, field);
		}
		if (Object.keys(set).length === 0 && unset.length === 0) continue;
		const patch: WorldOp = { op: 'patch', kind: row.kind, id: row.id };
		if (Object.keys(set).length > 0) patch.set = set;
		if (unset.length > 0) patch.unset = unset.sort();
		if (fieldRevOf) patch.seen = seen;
		patches.push(withParent(patch, row));
	}
	for (const [key, row] of before) {
		if (after.has(key)) continue;
		// Children of a deleted parent go with it.
		if (row.parent !== undefined && !after.has(parentKeyOf(row)) && before.has(parentKeyOf(row))) {
			continue;
		}
		dels.push(withParent({ op: 'del', kind: row.kind, id: row.id }, row));
	}
	adds.sort((a, b) => depth(a.kind) - depth(b.kind));
	dels.sort((a, b) => depth(b.kind) - depth(a.kind));
	return [...adds, ...patches, ...dels];
}

function withParent<T extends WorldOp>(op: T, row: EntityRow): T {
	if (row.parent !== undefined) op.parent = row.parent;
	return op;
}

/** 0 for top-level kinds, 1 for their children, 2 for path-segment children. */
export function depth(kind: EntityKind): number {
	let level = 0;
	let current: EntityKind = kind;
	while (isSubEntityKind(current)) {
		level++;
		current = PARENT_KIND[current];
	}
	return level;
}

/**
 * Applies ops to a row map in place. Returns the keys that changed. Unknown parents, duplicate adds
 * and patches of missing rows are skipped (the room validates; replicas just follow its order).
 */
export function applyOps(rows: Map<string, EntityRow>, ops: readonly WorldOp[]): Set<string> {
	const changed = new Set<string>();
	for (const op of ops) {
		const key = opKey(op);
		if (op.op === 'add') {
			const row: EntityRow = { kind: op.kind, id: op.id, data: cloneJson(op.data) };
			if (op.parent !== undefined) row.parent = op.parent;
			rows.set(key, row);
			changed.add(key);
		} else if (op.op === 'patch') {
			const row = rows.get(key);
			if (!row) continue;
			const data = { ...row.data };
			for (const [field, value] of Object.entries(op.set ?? {})) data[field] = cloneJson(value);
			for (const field of op.unset ?? []) delete data[field];
			rows.set(key, { ...row, data });
			changed.add(key);
		} else {
			if (!rows.has(key)) continue;
			for (const removed of removeWithChildren(rows, key)) changed.add(removed);
		}
	}
	return changed;
}

/** Deletes a row and every sub-entity below it. Returns the removed keys. */
export function removeWithChildren(rows: Map<string, EntityRow>, key: string): string[] {
	const removed: string[] = [];
	const row = rows.get(key);
	if (!row) return removed;
	rows.delete(key);
	removed.push(key);
	for (const child of childrenOf(rows, row))
		removed.push(...removeWithChildren(rows, rowKey(child)));
	return removed;
}

/** Direct sub-entities of a row. */
export function childrenOf(rows: ReadonlyMap<string, EntityRow>, row: EntityRow): EntityRow[] {
	const specs = CHILD_SPECS[row.kind];
	if (!specs) return [];
	const out: EntityRow[] = [];
	const own = scopedId(row);
	for (const spec of specs) {
		for (const candidate of rows.values()) {
			if (candidate.kind === spec.kind && candidate.parent === own) out.push(candidate);
		}
	}
	return out;
}

/**
 * Rows that can't exist without `row` — beyond its own sub-entities — and must go when it goes:
 * everything standing on a foundation, a Mini Build design's placed copies, a music tree's plants,
 * and the slab opening a stair cut.
 */
export function dependentsOf(rows: ReadonlyMap<string, EntityRow>, row: EntityRow): EntityRow[] {
	const out: EntityRow[] = [];
	for (const candidate of rows.values()) {
		const data = candidate.data;
		if (row.kind === 'foundation' && FOUNDATION_DEPENDENTS.has(candidate.kind)) {
			if (data.foundationId === row.id) out.push(candidate);
		} else if (row.kind === 'miniBuildDefinition' && candidate.kind === 'miniBuildInstance') {
			if (data.designId === row.id) out.push(candidate);
		} else if (row.kind === 'musicTree' && candidate.kind === 'musicPlant') {
			if (data.musicTreeId === row.id) out.push(candidate);
		} else if (row.kind === 'stair' && candidate.kind === 'slabOpening') {
			if (data.sourceStairId === row.id) out.push(candidate);
		}
	}
	return out;
}

/** Everything that goes when `key` goes: its sub-entities and dependents, transitively. */
export function cascadeOf(rows: ReadonlyMap<string, EntityRow>, key: string): Set<string> {
	const out = new Set<string>();
	const visit = (row: EntityRow) => {
		const k = rowKey(row);
		if (out.has(k)) return;
		out.add(k);
		for (const child of childrenOf(rows, row)) visit(child);
		for (const dependent of dependentsOf(rows, row)) visit(dependent);
	};
	const root = rows.get(key);
	if (root) visit(root);
	return out;
}

// ---------------------------------------------------------------------------------------------
// Checksums (plan §7.8)
// ---------------------------------------------------------------------------------------------

/**
 * Order-independent hash of every row's key and revision: XOR of a per-row FNV-1a, so the room can
 * update it incrementally (XOR out the old revision, XOR in the new) and a replica can verify it.
 */
export function rowChecksumPart(key: string, rev: number): number {
	let hash = 0x811c9dc5;
	const text = `${key}#${rev}`;
	for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193);
	return hash >>> 0;
}

export function formatChecksum(value: number): string {
	return (value >>> 0).toString(16).padStart(8, '0');
}

// ---------------------------------------------------------------------------------------------

/** JSON with sorted keys: equal values give equal strings whatever order their keys were set in. */
export function canonical(value: unknown): string {
	if (value === undefined) return 'undefined';
	return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(sortKeys);
	if (value && typeof value === 'object') {
		const out: Record<string, unknown> = {};
		for (const key of Object.keys(value as object).sort()) {
			const field = (value as Record<string, unknown>)[key];
			if (field !== undefined) out[key] = sortKeys(field);
		}
		return out;
	}
	return value;
}

export function cloneJson<T>(value: T): T {
	return value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T);
}

/** Rows as a map keyed by `rowKey`. */
export function rowMap(rows: Iterable<EntityRow>): Map<string, EntityRow> {
	const map = new Map<string, EntityRow>();
	for (const row of rows) map.set(rowKey(row), row);
	return map;
}
