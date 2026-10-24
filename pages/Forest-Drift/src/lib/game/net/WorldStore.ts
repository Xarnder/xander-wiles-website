import { validTerrainEditData } from '../terrain/TerrainEdits';
import {
	MAX_OP_JSON_BYTES,
	MAX_OPS_PER_BATCH,
	type CommittedOp,
	type OverwrittenField,
	type PlayerRole,
	type RejectConflict,
	type RejectReason
} from './protocol';
import {
	PARENT_KIND,
	canonical,
	cascadeOf,
	entityKey,
	formatChecksum,
	isEntityKind,
	isSubEntityKind,
	opKey,
	parentKeyOf,
	rowChecksumPart,
	rowKey,
	type EntityRow,
	type WorldOp
} from './worldEntities';

/** A row as the room keeps it: who made it, and when each field last changed and by whom. */
export interface StoredRow extends EntityRow {
	/** Player id of the creator; '' for content that came with the published world (the owner's). */
	createdBy: string;
	/** The `seq` of the commit that last changed this row. */
	rev: number;
	fieldRevs: Record<string, { rev: number; by: string }>;
}

export interface WorldStoreState {
	rows: Iterable<StoredRow>;
	seq: number;
	epoch: number;
}

export interface BatchAuthor {
	playerId: string;
	name: string;
	role: PlayerRole;
}

export type BatchResult =
	| {
			ok: true;
			seq: number;
			ops: CommittedOp[];
			overwritten: OverwrittenField[];
			upserts: StoredRow[];
			deletes: string[];
			checksum: string;
	  }
	| { ok: false; reason: RejectReason; message: string; conflicts?: RejectConflict[] };

const MAX_ID_LENGTH = 128;
const EPSILON = 1e-6;

/**
 * The room's copy of the shared world, and the rules for changing it (plan §7.5–7.6):
 *
 *   - viewers can't build; editors and the owner can add anything and change anything (F1-A);
 *   - only the creator — or the owner — deletes (Q4-C), and a delete that would take other people's
 *     additions with it must list them in `confirm` (F2-B);
 *   - additions must have their parent (a window its wall), else `gone`;
 *   - where edits meet, fit is re-checked: two windows in the same spot, two foundations on the
 *     same ground, conflicting heights for the same storey — the later one is refused (`fit`);
 *     identical storeys are shared so concurrent first walls both survive;
 *   - the same field changed by two people: the later change wins, and the earlier person is told.
 *
 * A batch is all or nothing. Pure logic: the host persists what `applyBatch` returns.
 */
export class WorldStore {
	private rows = new Map<string, StoredRow>();
	private seqValue: number;
	private epochValue: number;
	private checksumValue = 0;

	constructor(state: WorldStoreState) {
		for (const row of state.rows) this.rows.set(rowKey(row), row);
		this.seqValue = state.seq;
		this.epochValue = state.epoch;
		for (const [key, row] of this.rows) this.checksumValue ^= rowChecksumPart(key, row.rev);
	}

	get seq(): number {
		return this.seqValue;
	}

	get epoch(): number {
		return this.epochValue;
	}

	get checksum(): string {
		return formatChecksum(this.checksumValue);
	}

	get size(): number {
		return this.rows.size;
	}

	allRows(): StoredRow[] {
		return [...this.rows.values()];
	}

	get(key: string): StoredRow | undefined {
		return this.rows.get(key);
	}

	/** Replaces everything (a restore): new epoch, so every client resyncs. */
	replaceAll(rows: Iterable<StoredRow>, epoch: number): void {
		this.rows = new Map();
		this.checksumValue = 0;
		for (const row of rows) {
			const key = rowKey(row);
			this.rows.set(key, row);
			this.checksumValue ^= rowChecksumPart(key, row.rev);
		}
		this.epochValue = epoch;
	}

	applyBatch(author: BatchAuthor, ops: readonly WorldOp[]): BatchResult {
		if (author.role === 'viewer') {
			return { ok: false, reason: 'role', message: "Visitors can look around but can't build." };
		}
		if (!Array.isArray(ops) || ops.length === 0 || ops.length > MAX_OPS_PER_BATCH) {
			return { ok: false, reason: 'invalid', message: 'That change was too large to save.' };
		}
		for (const op of ops) {
			const problem = shapeProblem(op);
			if (problem) return { ok: false, reason: 'invalid', message: problem };
		}

		const seq = this.seqValue + 1;
		const owner = author.role === 'owner';
		// Work on a copy, so a refused batch leaves nothing behind.
		const rows = new Map(this.rows);

		// Deletes, first pass. A player's own things (and, for the owner, everything) may be removed,
		// along with whatever goes with them; anything else only as part of such a removal. Content
		// that came with the published world (`createdBy: ''`) is the owner's.
		const isMine = (row: StoredRow) =>
			row.createdBy === author.playerId || (owner && row.createdBy === '');
		const confirmed = new Set<string>();
		for (const op of ops)
			if (op.op === 'del') for (const key of op.confirm ?? []) confirmed.add(key);
		const going = new Set<string>();
		for (const op of ops) {
			if (op.op !== 'del') continue;
			const key = opKey(op);
			const row = rows.get(key);
			if (!row || !(owner || isMine(row))) continue;
			for (const member of cascadeOf(rows, key)) going.add(member);
		}
		for (const op of ops) {
			if (op.op !== 'del') continue;
			const row = rows.get(opKey(op));
			if (row && !going.has(opKey(op))) {
				return {
					ok: false,
					reason: 'rights',
					message: 'Only whoever added that, or the owner, can remove it.',
					conflicts: [conflict(row)]
				};
			}
		}
		const othersInCascade: RejectConflict[] = [];
		for (const key of going) {
			const row = rows.get(key)!;
			if (!isMine(row) && !confirmed.has(key)) othersInCascade.push(conflict(row));
		}
		if (othersInCascade.length > 0) {
			return {
				ok: false,
				reason: 'confirmNeeded',
				message: "This would also remove other people's additions.",
				conflicts: othersInCascade
			};
		}

		const committed: CommittedOp[] = [];
		const overwritten: OverwrittenField[] = [];
		const touched = new Set<string>();
		for (const op of ops) {
			const key = opKey(op);
			if (op.op === 'add') {
				// Two builders can independently initialize the same storey while drawing their
				// first walls. Keep the existing level identity without rejecting either wall.
				if (op.kind === 'buildingLevel' && !rows.has(key)) {
					const existing = [...rows.values()].find(
						(row) =>
							row.kind === 'buildingLevel' &&
							row.data.foundationId === op.data.foundationId &&
							row.data.index === op.data.index
					);
					const withoutId = (data: Record<string, unknown>) => {
						const copy = { ...data };
						delete copy.id;
						return copy;
					};
					if (existing && canonical(withoutId(existing.data)) === canonical(withoutId(op.data))) {
						const existingKey = rowKey(existing);
						rows.set(existingKey, { ...existing, rev: seq });
						touched.add(existingKey);
						// An explicit no-op patch acknowledges even a batch containing only the
						// duplicate level, preserving creator and field revision metadata.
						committed.push({
							op: 'patch',
							kind: 'buildingLevel',
							id: existing.id,
							set: {},
							rev: seq
						});
						continue;
					}
				}
				if (rows.has(key)) {
					return { ok: false, reason: 'invalid', message: 'That already exists.' };
				}
				const missing = missingReference(rows, op);
				if (missing)
					return {
						ok: false,
						reason: 'gone',
						message: missing.message,
						conflicts: missing.conflicts
					};
				const row: StoredRow = {
					kind: op.kind,
					id: op.id,
					data: structuredClone(op.data),
					createdBy: author.playerId,
					rev: seq,
					fieldRevs: {}
				};
				if (op.parent !== undefined) row.parent = op.parent;
				const clash = fitConflict(rows, row);
				if (clash) return clash;
				rows.set(key, row);
				touched.add(key);
				committed.push({ ...cloneOp(op), rev: seq, createdBy: author.playerId });
			} else if (op.op === 'patch') {
				const current = rows.get(key);
				if (!current) {
					return {
						ok: false,
						reason: 'gone',
						message: 'Someone removed that while you were changing it.'
					};
				}
				const data = { ...current.data };
				const fieldRevs = { ...current.fieldRevs };
				const fields = [...Object.keys(op.set ?? {}), ...(op.unset ?? [])];
				for (const field of fields) {
					if (field === 'id') {
						return { ok: false, reason: 'invalid', message: "An object's id can't change." };
					}
					const previous = fieldRevs[field];
					const previousBy = previous?.by ?? current.createdBy;
					const seen = op.seen?.[field] ?? 0;
					if (current.kind === 'terrainTile' && previous && seen < previous.rev)
						return {
							ok: false,
							reason: 'fit',
							message: 'This terrain changed while you were digging. Try the stroke again.'
						};
					if (previousBy !== author.playerId && previous && seen < previous.rev) {
						overwritten.push({
							kind: current.kind,
							id: current.id,
							...(current.parent !== undefined ? { parent: current.parent } : {}),
							field,
							previousBy
						});
					}
					fieldRevs[field] = { rev: seq, by: author.playerId };
				}
				for (const [field, value] of Object.entries(op.set ?? {}))
					data[field] = structuredClone(value);
				for (const field of op.unset ?? []) delete data[field];
				const next: StoredRow = { ...current, data, fieldRevs, rev: seq };
				const missing = missingReference(rows, {
					op: 'add',
					kind: next.kind,
					id: next.id,
					parent: next.parent,
					data
				});
				if (missing)
					return {
						ok: false,
						reason: 'gone',
						message: missing.message,
						conflicts: missing.conflicts
					};
				const clash = fitConflict(rows, next);
				if (clash) return clash;
				rows.set(key, next);
				touched.add(key);
				committed.push({ ...cloneOp(op), rev: seq });
			} else {
				if (!rows.has(key)) continue;
				for (const member of cascadeOf(rows, key)) {
					if (!rows.has(member)) continue;
					const memberRow = rows.get(member)!;
					rows.delete(member);
					touched.add(member);
					// Every replica removes exactly what the room removed, in the room's order.
					const isChildOfRemoved =
						memberRow.parent !== undefined && !rows.has(parentKeyOf(memberRow)) && member !== key;
					if (member === key || !isChildOfRemoved) {
						const del: CommittedOp = {
							op: 'del',
							kind: memberRow.kind,
							id: memberRow.id,
							rev: seq
						};
						if (memberRow.parent !== undefined) del.parent = memberRow.parent;
						if (member === key && op.confirm?.length) del.confirm = [...op.confirm];
						committed.push(del);
					}
				}
			}
		}
		if (committed.length === 0) {
			return { ok: false, reason: 'gone', message: 'Nothing left to change.' };
		}

		// Commit.
		const upserts: StoredRow[] = [];
		const deletes: string[] = [];
		for (const key of touched) {
			const before = this.rows.get(key);
			const after = rows.get(key);
			if (before) this.checksumValue ^= rowChecksumPart(key, before.rev);
			if (after) {
				this.checksumValue ^= rowChecksumPart(key, after.rev);
				upserts.push(after);
			} else {
				deletes.push(key);
			}
		}
		this.rows = rows;
		this.seqValue = seq;
		return {
			ok: true,
			seq,
			ops: committed,
			overwritten,
			upserts,
			deletes,
			checksum: this.checksum
		};
	}
}

function conflict(row: StoredRow): RejectConflict {
	const out: RejectConflict = { kind: row.kind, id: row.id, by: row.createdBy };
	if (row.parent !== undefined) out.parent = row.parent;
	return out;
}

function cloneOp(op: WorldOp): WorldOp {
	return structuredClone(op);
}

/** Structural checks the room makes before trusting an op (plan §7.5 "Structure"). */
function shapeProblem(op: WorldOp): string | null {
	if (!op || typeof op !== 'object') return 'Malformed change.';
	if (op.op !== 'add' && op.op !== 'patch' && op.op !== 'del') return 'Unknown change.';
	if (!isEntityKind(op.kind)) return 'Unknown kind of object.';
	if (typeof op.id !== 'string' || op.id.length === 0 || op.id.length > MAX_ID_LENGTH) {
		return 'Malformed object id.';
	}
	if (isSubEntityKind(op.kind)) {
		if (
			typeof op.parent !== 'string' ||
			op.parent.length === 0 ||
			op.parent.length > 2 * MAX_ID_LENGTH + 1
		) {
			return 'Malformed parent id.';
		}
	} else if (op.parent !== undefined) {
		return 'Unexpected parent.';
	}
	if (op.op === 'add') {
		if (!op.data || typeof op.data !== 'object' || Array.isArray(op.data)) return 'Malformed data.';
		if (op.data.id !== undefined && op.data.id !== op.id) return 'Data and id disagree.';
	}
	if (op.op === 'patch') {
		if (op.set !== undefined && (!op.set || typeof op.set !== 'object' || Array.isArray(op.set))) {
			return 'Malformed change.';
		}
		if (op.unset !== undefined && (!Array.isArray(op.unset) || !op.unset.every(isSafeField))) {
			return 'Malformed change.';
		}
		if (op.set && !Object.keys(op.set).every(isSafeField)) return 'Malformed change.';
		if (
			op.seen !== undefined &&
			(!op.seen ||
				typeof op.seen !== 'object' ||
				Array.isArray(op.seen) ||
				!Object.entries(op.seen).every(
					([key, rev]) => isSafeField(key) && Number.isSafeInteger(rev) && rev >= 0
				))
		) {
			return 'Malformed field revisions.';
		}
	}
	if (
		op.op === 'del' &&
		op.confirm !== undefined &&
		(!Array.isArray(op.confirm) || !op.confirm.every((key) => typeof key === 'string'))
	) {
		return 'Malformed confirmation.';
	}
	if (JSON.stringify(op).length > MAX_OP_JSON_BYTES) return 'That object is too large to share.';
	return null;
}

function isSafeField(value: unknown): value is string {
	return (
		typeof value === 'string' &&
		value.length > 0 &&
		!['__proto__', 'constructor', 'prototype'].includes(value)
	);
}

/** An add (or a patch's result) whose parent, foundation, design or tree no longer exists. */
function missingReference(
	rows: ReadonlyMap<string, StoredRow>,
	op: Extract<WorldOp, { op: 'add' }>
): { message: string; conflicts?: RejectConflict[] } | null {
	if (isSubEntityKind(op.kind)) {
		const parentKey = `${PARENT_KIND[op.kind]}:${op.parent}`;
		if (!rows.has(parentKey)) return { message: 'Someone removed what you were adding to.' };
	}
	const data = op.data;
	const foundationId = data.foundationId;
	if (typeof foundationId === 'string' && foundationId && op.kind !== 'foundation') {
		if (!rows.has(entityKey('foundation', foundationId))) {
			return { message: 'Someone removed the foundation you were building on.' };
		}
	}
	if (op.kind === 'miniBuildInstance' && typeof data.designId === 'string') {
		if (!rows.has(entityKey('miniBuildDefinition', data.designId))) {
			return { message: 'That design is no longer in this world.' };
		}
	}
	if (op.kind === 'musicPlant' && typeof data.musicTreeId === 'string') {
		if (!rows.has(entityKey('musicTree', data.musicTreeId))) {
			return { message: 'Someone removed that music tree.' };
		}
	}
	return null;
}

interface Rect {
	minA: number;
	maxA: number;
	minB: number;
	maxB: number;
}

function overlaps(a: Rect, b: Rect): boolean {
	return (
		a.minA < b.maxA - EPSILON &&
		b.minA < a.maxA - EPSILON &&
		a.minB < b.maxB - EPSILON &&
		b.minB < a.maxB - EPSILON
	);
}

function numberField(data: Record<string, unknown>, field: string): number | null {
	const value = data[field];
	return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function openingRect(data: Record<string, unknown>): Rect | null {
	const minA = numberField(data, 'minU');
	const maxA = numberField(data, 'maxU');
	const minB = numberField(data, 'minY');
	const maxB = numberField(data, 'maxY');
	return minA === null || maxA === null || minB === null || maxB === null
		? null
		: { minA, maxA, minB, maxB };
}

function gridRect(data: Record<string, unknown>): Rect | null {
	const minA = numberField(data, 'minGridX');
	const maxA = numberField(data, 'maxGridX');
	const minB = numberField(data, 'minGridZ');
	const maxB = numberField(data, 'maxGridZ');
	return minA === null || maxA === null || minB === null || maxB === null
		? null
		: { minA, maxA, minB, maxB };
}

/**
 * Fit re-checks where two people's edits meet (plan §7.5–7.6). Each client already checks its own
 * edit against what it can see; this catches two edits that are each fine alone but clash.
 */
function fitConflict(
	rows: ReadonlyMap<string, StoredRow>,
	row: StoredRow
): Extract<BatchResult, { ok: false }> | null {
	const key = rowKey(row);
	if (row.kind === 'terrainTile') {
		if (!validTerrainEditData(row.data) || row.data.points.length > 256)
			return { ok: false, reason: 'invalid', message: 'Invalid terrain tile.' };
		const d = row.data;
		const previous = new Map(
			((rows.get(key)?.data.points ?? []) as [number, number, number][]).map((p) => [
				`${p[0]},${p[1]}`,
				p[2]
			])
		);
		for (const p of d.points) {
			if (`${Math.floor(p[0] / 16)},${Math.floor(p[1] / 16)}` !== row.id)
				return { ok: false, reason: 'invalid', message: 'Terrain point outside tile.' };
			for (const other of rows.values()) {
				if (other.kind === 'terrainTile' && other.data.spacing !== d.spacing)
					return { ok: false, reason: 'invalid', message: 'Terrain grid mismatch.' };
				if (other.kind === 'foundation' && previous.get(`${p[0]},${p[1]}`) !== p[2]) {
					const f = other.data,
						minX = Number(f.minGridX),
						maxX = Number(f.maxGridX),
						minZ = Number(f.minGridZ),
						maxZ = Number(f.maxGridZ);
					const interior = p[0] > minX && p[0] < maxX && p[1] > minZ && p[1] < maxZ;
					const contact = p[0] >= minX && p[0] <= maxX && p[1] >= minZ && p[1] <= maxZ;
					if (interior || (contact && f.style === 'earth'))
						return {
							ok: false,
							reason: 'fit',
							message: 'A foundation protects this terrain. Try another point.'
						};
					const distance =
						Math.hypot(
							Math.max(minX - p[0], 0, p[0] - maxX),
							Math.max(minZ - p[1], 0, p[1] - maxZ)
						) * d.spacing;
					if (contact && f.style !== 'earth') {
						const old = previous.get(`${p[0]},${p[1]}`);
						if (
							p[2] > Math.max(old ?? -Infinity, Number(f.topY) - 0.05 + distance * 0.65) + 0.001 ||
							p[2] < Math.min(old ?? Infinity, Number(f.topY) - 4 - distance * 0.65) - 0.001
						)
							return { ok: false, reason: 'fit', message: 'Stone retaining-wall limits reached.' };
					}
				}
			}
		}
		return null;
	}
	const isOpening =
		row.kind === 'wallOpening' || row.kind === 'pathOpening' || row.kind === 'roofOpening';
	if (isOpening) {
		const rect = openingRect(row.data);
		if (!rect) return null;
		for (const [otherKey, other] of rows) {
			if (otherKey === key || other.kind !== row.kind || other.parent !== row.parent) continue;
			if (row.kind === 'roofOpening' && other.data.face !== row.data.face) continue;
			const otherRect = openingRect(other.data);
			if (otherRect && overlaps(rect, otherRect)) {
				return {
					ok: false,
					reason: 'fit',
					message: 'Someone just put something in that spot.',
					conflicts: [conflict(other)]
				};
			}
		}
		return null;
	}
	if (row.kind === 'foundation') {
		const rect = gridRect(row.data);
		if (!rect) return null;
		for (const [otherKey, other] of rows) {
			if (otherKey === key || other.kind !== 'foundation') continue;
			const otherRect = gridRect(other.data);
			if (otherRect && overlaps(rect, otherRect)) {
				return {
					ok: false,
					reason: 'fit',
					message: 'Someone just built a foundation there.',
					conflicts: [conflict(other)]
				};
			}
		}
		return null;
	}
	if (row.kind === 'buildingLevel') {
		for (const [otherKey, other] of rows) {
			if (otherKey === key || other.kind !== 'buildingLevel') continue;
			if (
				other.data.foundationId === row.data.foundationId &&
				other.data.index === row.data.index
			) {
				return {
					ok: false,
					reason: 'fit',
					message: 'Someone just started that storey.',
					conflicts: [conflict(other)]
				};
			}
		}
	}
	return null;
}

/** Rows for a freshly published world: all the owner's, at revision 1. */
export function publishedRows(rows: Iterable<EntityRow>): StoredRow[] {
	return [...rows].map((row) => ({ ...row, createdBy: '', rev: 1, fieldRevs: {} }));
}
