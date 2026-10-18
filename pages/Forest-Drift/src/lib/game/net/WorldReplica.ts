import type { CommitMessage } from './protocol';
import {
	applyOps,
	childrenOf,
	formatChecksum,
	opKey,
	rowChecksumPart,
	rowKey,
	type EntityRow,
	type WorldOp
} from './worldEntities';

/** A row as the client knows it from the room: who made it, and each field's revision. */
export interface ReplicaRow extends EntityRow {
	createdBy: string;
	rev: number;
	fieldRevs: Record<string, { rev: number; by: string }>;
}

export interface ReplicaSnapshot {
	rows: Iterable<ReplicaRow>;
	seq: number;
	epoch: number;
}

export interface PendingBatch {
	batchId: string;
	ops: WorldOp[];
	sentAt: number;
}

export type CommitOutcome = 'applied' | 'duplicate' | 'resync';

/**
 * The client's two views of the shared world (plan §7.6 "optimistic overlay"):
 *
 *   - **confirmed**: exactly what the room has committed, in the room's order;
 *   - **display**: confirmed plus this player's own batches that are still on their way.
 *
 * The scene shows `display`. When the room confirms a batch it moves from pending into confirmed;
 * when it refuses one, dropping it from pending is the rollback.
 */
export class WorldReplica {
	private confirmed = new Map<string, ReplicaRow>();
	private pending: PendingBatch[] = [];
	private seqValue = 0;
	private epochValue = 0;
	private checksumValue = 0;

	constructor(snapshot: ReplicaSnapshot) {
		this.reset(snapshot);
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

	get pendingBatches(): readonly PendingBatch[] {
		return this.pending;
	}

	get pendingOpCount(): number {
		return this.pending.reduce((sum, batch) => sum + batch.ops.length, 0);
	}

	/** Replaces confirmed state from a fresh snapshot (a resync). Pending batches are kept and resent. */
	reset(snapshot: ReplicaSnapshot): void {
		this.confirmed = new Map();
		this.checksumValue = 0;
		for (const row of snapshot.rows) {
			const key = rowKey(row);
			this.confirmed.set(key, structuredClone(row));
			this.checksumValue ^= rowChecksumPart(key, row.rev);
		}
		this.seqValue = snapshot.seq;
		this.epochValue = snapshot.epoch;
	}

	addLocal(batchId: string, ops: WorldOp[], now: number): void {
		this.pending.push({ batchId, ops, sentAt: now });
	}

	/** The room refused a batch: forget it (the display falls back to confirmed). */
	reject(batchId: string): boolean {
		const before = this.pending.length;
		this.pending = this.pending.filter((batch) => batch.batchId !== batchId);
		return this.pending.length !== before;
	}

	/** Applies a commit from the room. Our own batch, if it was one, stops being pending. */
	applyCommit(commit: CommitMessage): CommitOutcome {
		if (commit.epoch !== this.epochValue) return 'resync';
		if (commit.seq <= this.seqValue) return 'duplicate';
		if (commit.seq !== this.seqValue + 1) return 'resync';
		for (const op of commit.ops) {
			const key = opKey(op);
			if (op.op === 'add') {
				const row: ReplicaRow = {
					kind: op.kind,
					id: op.id,
					data: structuredClone(op.data),
					createdBy: op.createdBy ?? commit.by,
					rev: op.rev,
					fieldRevs: {}
				};
				if (op.parent !== undefined) row.parent = op.parent;
				this.setRow(key, row);
			} else if (op.op === 'patch') {
				const current = this.confirmed.get(key);
				if (!current) continue;
				const data = { ...current.data };
				const fieldRevs = { ...current.fieldRevs };
				for (const [field, value] of Object.entries(op.set ?? {})) {
					data[field] = structuredClone(value);
					fieldRevs[field] = { rev: op.rev, by: commit.by };
				}
				for (const field of op.unset ?? []) {
					delete data[field];
					fieldRevs[field] = { rev: op.rev, by: commit.by };
				}
				this.setRow(key, { ...current, data, fieldRevs, rev: op.rev });
			} else {
				this.removeRow(key);
			}
		}
		this.seqValue = commit.seq;
		this.pending = this.pending.filter((batch) => batch.batchId !== commit.batchId);
		return 'applied';
	}

	/** A resent batch the room had already committed. */
	acknowledge(batchId: string): void {
		this.reject(batchId);
	}

	/** True when our confirmed rows hash to what the room says. Only meaningful with nothing pending. */
	checksumMatches(expected: string): boolean {
		return this.checksum === expected;
	}

	/** Confirmed plus pending, as plain rows: what the scene should show. */
	display(): Map<string, EntityRow> {
		const rows = new Map<string, EntityRow>();
		for (const [key, row] of this.confirmed) {
			const plain: EntityRow = { kind: row.kind, id: row.id, data: row.data };
			if (row.parent !== undefined) plain.parent = row.parent;
			rows.set(key, plain);
		}
		for (const batch of this.pending) applyOps(rows, batch.ops);
		return rows;
	}

	/** Confirmed rows only (with who made them), for cascade and permission checks. */
	confirmedRow(key: string): ReplicaRow | undefined {
		return this.confirmed.get(key);
	}

	/** The revision of a field as last confirmed (0 if it has never changed since publishing). */
	fieldRev(key: string, field: string): number {
		return this.confirmed.get(key)?.fieldRevs[field]?.rev ?? 0;
	}

	/** Who added a row; pending additions are ours. */
	creatorOf(key: string, me: string): string {
		return this.confirmed.get(key)?.createdBy ?? me;
	}

	private setRow(key: string, row: ReplicaRow): void {
		const before = this.confirmed.get(key);
		if (before) this.checksumValue ^= rowChecksumPart(key, before.rev);
		this.confirmed.set(key, row);
		this.checksumValue ^= rowChecksumPart(key, row.rev);
	}

	private removeRow(key: string): void {
		const row = this.confirmed.get(key);
		if (!row) return;
		for (const child of childrenOf(this.confirmed, row)) this.removeRow(rowKey(child));
		this.confirmed.delete(key);
		this.checksumValue ^= rowChecksumPart(key, row.rev);
	}
}
