import type { CommitMessage, PlayerRole, RejectMessage } from './protocol';
import { WorldReplica, type ReplicaSnapshot } from './WorldReplica';
import {
	cascadeOf,
	diffRows,
	flattenWorld,
	isSubEntityKind,
	opKey,
	rowMap,
	unflattenWorld,
	type AuthoredContent,
	type EntityKind,
	type EntityRow,
	type TopEntityKind,
	type WorldOp
} from './worldEntities';

/** Which parts of the scene a change touches, so only those are rebuilt (plan §8.2 WorldReplica). */
export interface AffectedContent {
	foundations: Set<string>;
	/** Foundations whose walls, paths, slabs, stairs, roofs, floor details or skirting changed. */
	buildingFoundations: Set<string>;
	levels: boolean;
	barriers: Set<string>;
	furniture: Set<string>;
	miniBuildDefinitions: Set<string>;
	miniBuildInstances: Set<string>;
	music: boolean;
	removedTrees: boolean;
	terrain?: boolean;
}

/** What the game scene offers the feed. `ThreeScene` implements it; tests use a plain object. */
export interface SharedWorldPort {
	/** The scene's authored content right now. */
	captureContent(): AuthoredContent;
	/** Bumps whenever authored content changes (the autosave counters). */
	contentRevision(): number;
	/** A tool is mid-action with the world temporarily inconsistent (Move holding an object). */
	isTransactionOpen(): boolean;
	/** Makes the scene show `target`, rebuilding only what `affected` names. */
	applyContent(target: AuthoredContent, affected: AffectedContent): void;
}

export interface DeletionItem {
	key: string;
	kind: EntityKind;
	id: string;
	by: string;
	byName: string;
}

export interface WorldOpFeedOptions {
	port: SharedWorldPort;
	replica: WorldReplica;
	playerId: string;
	role: () => PlayerRole | null;
	/** Sends a batch; returns false when offline (it stays pending and is resent on reconnect). */
	send: (batchId: string, ops: WorldOp[]) => boolean;
	notice: (message: string) => void;
	/** F2-B: asks whether to remove other people's additions too. */
	confirmDeletion: (items: DeletionItem[]) => Promise<boolean>;
	/** The room's log can't catch us up (or the checksum disagrees): fetch a fresh snapshot. */
	requestResync: () => void;
	nameOf: (playerId: string) => string;
	createId: () => string;
	now?: () => number;
}

/** Collect a whole action (a stair and the slab opening it cuts) before diffing (plan §7.4). */
export const COLLECT_MS = 50;

const BUILDING_PART_KINDS: ReadonlySet<EntityKind> = new Set<EntityKind>([
	'wall',
	'wallPath',
	'slab',
	'stair',
	'roof',
	'floorDetail',
	'skirtingRun'
]);

const KIND_NOUNS: Partial<Record<EntityKind, string>> = {
	foundation: 'a foundation',
	buildingLevel: 'that storey',
	wall: 'a wall',
	wallPath: 'a wall',
	slab: 'a floor',
	stair: 'stairs',
	roof: 'a roof',
	floorDetail: 'a floor pattern',
	skirtingRun: 'skirting',
	barrier: 'a fence',
	furniture: 'something',
	miniBuildInstance: 'something',
	wallOpening: 'a window or door',
	pathOpening: 'a window or door',
	roofOpening: 'a roof window',
	wallBeam: 'a beam',
	pathBeam: 'a beam'
};

const FIELD_NOUNS: Record<string, string> = {
	material: 'the colour of',
	secondaryMaterial: 'the colour of',
	colors: 'the colours of'
};

/**
 * Turns this player's building into ops, and everyone else's ops into scene changes (plan §7.4):
 *
 *   1. Watch the scene's content counters. When they move and no tool has a transaction open, wait
 *      `COLLECT_MS` for the whole action, then capture the content, flatten it into rows and diff
 *      it against the baseline (what the scene showed when we last synced). New rows are adds,
 *      missing rows deletes, changed fields one patch each.
 *   2. Deletes are checked first: someone else's thing can't be removed (unless you're the owner),
 *      and removing your own thing that holds other people's additions asks first (F2-B) — the
 *      removal already happened on screen, so "no" puts it all back.
 *   3. The batch is shown at once (the optimistic overlay) and sent; the room's commit confirms
 *      it, its rejection rolls it back with a notice.
 *   4. Other people's commits update the confirmed state, and only the difference between what the
 *      scene shows and what it should show is rebuilt. Local changes are always flushed first, so
 *      nothing typed in the same moment is lost.
 */
export class WorldOpFeed {
	private readonly options: WorldOpFeedOptions;
	private readonly now: () => number;
	private baseline = new Map<string, EntityRow>();
	private lastRevision = Number.NaN;
	private dirtySince: number | null = null;
	/** A deletion confirmation is open: the feed waits. */
	private awaitingConfirmation = false;
	/** Remote changes that arrived while a tool held a transaction or a question was open. */
	private readonly queued: (() => void)[] = [];

	constructor(options: WorldOpFeedOptions) {
		this.options = options;
		this.now = options.now ?? (() => Date.now());
	}

	get replica(): WorldReplica {
		return this.options.replica;
	}

	/** Takes the scene's current content as the starting point. */
	start(): void {
		this.recaptureBaseline();
	}

	/** Call often (each frame or every few tens of milliseconds). */
	tick(): void {
		if (this.awaitingConfirmation) return;
		const { port } = this.options;
		const revision = port.contentRevision();
		if (revision !== this.lastRevision) {
			this.lastRevision = revision;
			this.dirtySince = this.now();
		}
		if (port.isTransactionOpen()) return;
		if (this.queued.length > 0) {
			this.flushLocal();
			if (this.awaitingConfirmation) return;
			this.drainQueue();
			return;
		}
		if (this.dirtySince !== null && this.now() - this.dirtySince >= COLLECT_MS) void this.emit();
	}

	onCommit(commit: CommitMessage): void {
		this.whenReady(() => {
			const outcome = this.options.replica.applyCommit(commit);
			if (outcome === 'resync') {
				this.options.requestResync();
				return;
			}
			if (outcome === 'duplicate') return;
			this.showDisplay();
			const me = this.options.playerId;
			if (commit.by !== me) {
				for (const field of commit.overwritten ?? []) {
					if (field.previousBy !== me) continue;
					const what = FIELD_NOUNS[field.field] ?? 'the shape of';
					const noun = KIND_NOUNS[field.kind] ?? 'something';
					this.options.notice(`${commit.byName} changed ${what} ${noun.replace(/^a /, 'this ')}`);
				}
			}
			if (
				this.options.replica.pendingBatches.length === 0 &&
				!this.options.replica.checksumMatches(commit.checksum)
			) {
				this.options.requestResync();
			}
		});
	}

	onReject(reject: RejectMessage): void {
		this.whenReady(() => {
			if (!this.options.replica.reject(reject.batchId)) return;
			this.showDisplay();
			this.options.notice(this.describeRejection(reject));
		});
	}

	onAck(batchId: string): void {
		this.options.replica.acknowledge(batchId);
	}

	/** A fresh snapshot after a gap the room's log couldn't fill (or a restore). */
	onResync(snapshot: ReplicaSnapshot): void {
		this.whenReady(() => {
			this.options.replica.reset(snapshot);
			this.showDisplay();
			this.resendPending();
		});
	}

	/** After a reconnect and catch-up: anything still unconfirmed goes again (same batch ids). */
	resendPending(): void {
		for (const batch of this.options.replica.pendingBatches) {
			this.options.send(batch.batchId, batch.ops);
		}
	}

	/** Diffs and sends any local change right now (unless a confirmation is needed). */
	flushLocal(): void {
		if (this.options.port.isTransactionOpen() || this.awaitingConfirmation) return;
		const revision = this.options.port.contentRevision();
		if (revision !== this.lastRevision) {
			this.lastRevision = revision;
			this.dirtySince = this.now();
		}
		if (this.dirtySince !== null) void this.emit();
	}

	private whenReady(action: () => void): void {
		if (this.awaitingConfirmation || this.options.port.isTransactionOpen()) {
			this.queued.push(action);
			return;
		}
		this.flushLocal();
		if (this.awaitingConfirmation) {
			this.queued.push(action);
			return;
		}
		action();
	}

	private drainQueue(): void {
		while (this.queued.length > 0 && !this.awaitingConfirmation) this.queued.shift()!();
	}

	private async emit(): Promise<void> {
		const { port, replica } = this.options;
		const current = rowMap(flattenWorld(port.captureContent()));
		this.dirtySince = null;
		const ops = diffRows(this.baseline, current, (key, field) => replica.fieldRev(key, field));
		if (ops.length === 0) {
			this.baseline = current;
			return;
		}

		const deletions = this.checkDeletions(ops);
		if (deletions.refused) {
			this.restore(this.baseline, current);
			this.options.notice(deletions.refused);
			return;
		}
		if (deletions.others.length > 0) {
			this.awaitingConfirmation = true;
			const confirmed = await this.options
				.confirmDeletion(deletions.others)
				.catch(() => false)
				.finally(() => {
					this.awaitingConfirmation = false;
				});
			if (!confirmed) {
				this.restore(this.baseline, current);
				this.drainQueue();
				return;
			}
			const firstDel = ops.find((op) => op.op === 'del');
			if (firstDel && firstDel.op === 'del')
				firstDel.confirm = deletions.others.map((item) => item.key);
		}

		const batchId = this.options.createId();
		replica.addLocal(batchId, ops, this.now());
		this.options.send(batchId, ops);
		this.baseline = current;
		this.drainQueue();
	}

	/** Deletion rights (Q4-C) and what else would go with them (F2-B). */
	private checkDeletions(ops: WorldOp[]): { refused: string | null; others: DeletionItem[] } {
		const dels = ops.filter((op) => op.op === 'del');
		if (dels.length === 0) return { refused: null, others: [] };
		const { replica, playerId } = this.options;
		const owner = this.options.role() === 'owner';
		const creator = (key: string) => replica.creatorOf(key, playerId);
		const isMine = (key: string) => {
			const by = creator(key);
			return by === playerId || (owner && by === '');
		};
		const going = new Set<string>();
		for (const op of dels) {
			const key = opKey(op);
			if (owner || isMine(key))
				for (const member of cascadeOf(this.baseline, key)) going.add(member);
		}
		for (const op of dels) {
			const key = opKey(op);
			if (this.baseline.has(key) && !going.has(key)) {
				return { refused: onlyWhoCanRemove(this.options.nameOf, creator(key)), others: [] };
			}
		}
		const others: DeletionItem[] = [];
		for (const key of going) {
			if (isMine(key)) continue;
			const row = this.baseline.get(key)!;
			const by = creator(key);
			others.push({ key, kind: row.kind, id: row.id, by, byName: this.options.nameOf(by) });
		}
		return { refused: null, others };
	}

	/** Makes the scene show `replica.display()` and takes that as the new baseline. */
	private showDisplay(): void {
		this.restore(this.options.replica.display());
	}

	/**
	 * Makes the scene show `target`. `sceneRows` is what it shows now: the baseline, whenever local
	 * changes have just been flushed (so the whole world needn't be captured again to know).
	 */
	private restore(target: Map<string, EntityRow>, sceneRows = this.baseline): void {
		const affected = affectedBetween(sceneRows, target);
		if (!isEmpty(affected))
			this.options.port.applyContent(unflattenWorld(target.values()), affected);
		this.recaptureBaseline();
	}

	private currentSceneRows(): Map<string, EntityRow> {
		return rowMap(flattenWorld(this.options.port.captureContent()));
	}

	private recaptureBaseline(): void {
		this.baseline = this.currentSceneRows();
		this.lastRevision = this.options.port.contentRevision();
		this.dirtySince = null;
	}

	private describeRejection(reject: RejectMessage): string {
		const conflict = reject.conflicts?.[0];
		const name = conflict ? this.options.nameOf(conflict.by) : 'Someone';
		const noun = conflict ? (KIND_NOUNS[conflict.kind] ?? 'something') : 'something';
		switch (reject.reason) {
			case 'fit':
				return `${capitalise(name)} just put ${noun} there.`;
			case 'rights':
				return onlyWhoCanRemove(this.options.nameOf, conflict?.by ?? '');
			case 'confirmNeeded':
				return 'Someone added to that while you were removing it. Try again.';
			case 'gone':
			case 'role':
				return reject.message;
			default:
				return `Couldn't share that change: ${reject.message}`;
		}
	}
}

/** Q4-C: the creator or the owner. Published content is the owner's own. */
function onlyWhoCanRemove(nameOf: (playerId: string) => string, creator: string): string {
	return creator === ''
		? 'Only the owner can remove that.'
		: `Only ${nameOf(creator)} or the owner can remove that.`;
}

function capitalise(text: string): string {
	return text.charAt(0).toUpperCase() + text.slice(1);
}

export function emptyAffected(): AffectedContent {
	return {
		foundations: new Set(),
		buildingFoundations: new Set(),
		levels: false,
		barriers: new Set(),
		furniture: new Set(),
		miniBuildDefinitions: new Set(),
		miniBuildInstances: new Set(),
		music: false,
		removedTrees: false
	};
}

export function isEmpty(affected: AffectedContent): boolean {
	return (
		affected.foundations.size === 0 &&
		affected.buildingFoundations.size === 0 &&
		!affected.levels &&
		affected.barriers.size === 0 &&
		affected.furniture.size === 0 &&
		affected.miniBuildDefinitions.size === 0 &&
		affected.miniBuildInstances.size === 0 &&
		!affected.music &&
		!affected.removedTrees &&
		!affected.terrain
	);
}

/** The top-level things that differ between two row sets, grouped the way the scene rebuilds them. */
export function affectedBetween(
	before: ReadonlyMap<string, EntityRow>,
	after: ReadonlyMap<string, EntityRow>
): AffectedContent {
	const affected = emptyAffected();
	const ops = diffRows(before, after);
	for (const op of ops) {
		const { kind, id } = topLevelOf(op.kind, op.id, op.parent);
		const key = `${kind}:${id}`;
		const foundationIds = [before.get(key)?.data.foundationId, after.get(key)?.data.foundationId];
		switch (kind) {
			case 'foundation':
				affected.foundations.add(id);
				break;
			case 'buildingLevel':
				affected.levels = true;
				break;
			case 'barrier':
				affected.barriers.add(id);
				break;
			case 'furniture':
				affected.furniture.add(id);
				break;
			case 'miniBuildDefinition':
				affected.miniBuildDefinitions.add(id);
				break;
			case 'miniBuildInstance':
				affected.miniBuildInstances.add(id);
				break;
			case 'musicTree':
			case 'musicPlant':
				affected.music = true;
				break;
			case 'terrainTile':
				affected.terrain = true;
				break;
			case 'removedTree':
				affected.removedTrees = true;
				break;
			default:
				if (BUILDING_PART_KINDS.has(kind)) {
					for (const foundationId of foundationIds) {
						if (typeof foundationId === 'string') affected.buildingFoundations.add(foundationId);
					}
				}
		}
	}
	return affected;
}

/** The top-level entity a row belongs to (a window → its wall; a segment's window → its path). */
export function topLevelOf(
	kind: EntityKind,
	id: string,
	parent?: string
): { kind: TopEntityKind; id: string } {
	if (!isSubEntityKind(kind) || parent === undefined) return { kind: kind as TopEntityKind, id };
	const rootId = parent.split('/')[0]!;
	const rootKind: TopEntityKind =
		kind === 'pathSegment' || kind === 'pathOpening' || kind === 'pathBeam'
			? 'wallPath'
			: kind === 'slabOpening'
				? 'slab'
				: kind === 'roofOpening'
					? 'roof'
					: 'wall';
	return { kind: rootKind, id: rootId };
}
