import {
	captureWorldContent,
	type WorldContentSnapshot,
	type WorldRuntime
} from './WorldSerializer';
import type { SaveStatus, SavedPlayerState } from './WorldTypes';

export type SaveTrigger = 'autosave' | 'manual' | 'lifecycle' | 'critical';

export interface AutosaveTimings {
	/** How long after the last structural edit (wall, paint, removal, …) a save fires. Batches a rapid build session into one write instead of one per click. */
	structuralDebounceMs: number;
	/** Upper bound on that debounce: continuous editing must not defer a save indefinitely, so a save always happens this long after the FIRST unsaved change however busy the player stays. */
	structuralMaxWaitMs: number;
	/** Player movement alone saves on a slow cadence — walking around shouldn't rewrite the world every few seconds, but a crash shouldn't lose where you were either. */
	playerIntervalMs: number;
	/** How often dirty-checking runs. Cheap: it compares integers, it does not serialize. */
	pollIntervalMs: number;
}

export const DEFAULT_AUTOSAVE_TIMINGS: AutosaveTimings = {
	structuralDebounceMs: 2000,
	structuralMaxWaitMs: 10000,
	playerIntervalMs: 15000,
	pollIntervalMs: 500
};

export interface WorldAutosaveManagerOptions {
	runtime: WorldRuntime;
	/** Performs the actual write. Rejecting marks the save failed; the manager keeps the world dirty and retries on the next change or explicit request. */
	persist: (content: WorldContentSnapshot, trigger: SaveTrigger) => Promise<void>;
	onStatusChange?: (status: SaveStatus, error: string | null) => void;
	timings?: Partial<AutosaveTimings>;
	/** Injectable for tests; production uses `performance.now()`. */
	now?: () => number;
}

/**
 * Decides *when* a world is written, so no building tool has to think about persistence.
 *
 * Two ideas do the work:
 *
 *  1. **Revision counters, not serialization.** Managers bump plain integers when they mutate (see
 *     WorldRevisionCounters). Polling compares those integers a couple of times a second, so an idle
 *     world costs nothing and a busy one still only serializes when a debounce actually fires.
 *
 *  2. **Generation-guarded writes.** Every capture is tagged with the generation it came from. If the
 *     world changes while a write is in flight, the newer state is saved immediately afterwards, and
 *     an older in-flight write can never clear the dirty flag for newer state — the failure mode that
 *     silently resurrects deleted walls in save systems that fire writes in parallel.
 */
export class WorldAutosaveManager {
	private readonly runtime: WorldRuntime;
	private readonly persist: (content: WorldContentSnapshot, trigger: SaveTrigger) => Promise<void>;
	private readonly onStatusChange?: (status: SaveStatus, error: string | null) => void;
	private readonly timings: AutosaveTimings;
	private readonly now: () => number;

	private intervalId: ReturnType<typeof setInterval> | null = null;
	private running = false;

	/** Revision counters as of the last time we observed them, so a change is "differs from these". */
	private observedStructural: number;
	private observedEnvironment: number;
	private observedProcedural: number;

	/** Bumped on every observed change; a save records the generation it captured so a slow write can't clear newer dirtiness. */
	private contentGeneration = 0;
	private savedGeneration = 0;

	private structuralDirtySince: number | null = null;
	private structuralDeadlineMs = 0;

	private lastPlayerSaveAt: number;
	private lastSavedPlayerSignature: string;

	private status: SaveStatus = 'saved';
	private lastError: string | null = null;
	private saveChain: Promise<void> = Promise.resolve();

	constructor(options: WorldAutosaveManagerOptions) {
		this.runtime = options.runtime;
		this.persist = options.persist;
		this.onStatusChange = options.onStatusChange;
		this.timings = { ...DEFAULT_AUTOSAVE_TIMINGS, ...options.timings };
		this.now = options.now ?? (() => performance.now());

		const counters = this.runtime.getRevisionCounters();
		this.observedStructural = counters.structural;
		this.observedEnvironment = counters.environment;
		this.observedProcedural = counters.procedural;
		this.lastPlayerSaveAt = this.now();
		this.lastSavedPlayerSignature = playerSignature(this.runtime.getPlayerState());
	}

	start(): void {
		if (this.running) return;
		this.running = true;
		this.intervalId = setInterval(() => this.tick(this.now()), this.timings.pollIntervalMs);
	}

	stop(): void {
		this.running = false;
		if (this.intervalId !== null) clearInterval(this.intervalId);
		this.intervalId = null;
	}

	getStatus(): SaveStatus {
		return this.status;
	}

	getLastError(): string | null {
		return this.lastError;
	}

	/** True when there is unsaved logical state — lets lifecycle flushes skip work when there's nothing to write. */
	hasUnsavedChanges(): boolean {
		this.refreshDirtyFlags(this.now());
		return this.savedGeneration !== this.contentGeneration;
	}

	/**
	 * Records that the world changed and (re)arms the debounce.
	 *
	 * The debounce extends on each edit — a save lands shortly after the player stops building rather
	 * than mid-click — but never past `structuralMaxWaitMs` measured from the *first* unsaved change,
	 * so a long uninterrupted building session still gets written periodically instead of holding
	 * everything until it ends.
	 */
	markDirty(): void {
		const now = this.now();
		this.contentGeneration++;

		if (this.structuralDirtySince === null) {
			this.structuralDirtySince = now;
			this.structuralDeadlineMs = now + this.timings.structuralDebounceMs;
		} else {
			this.structuralDeadlineMs = Math.min(
				now + this.timings.structuralDebounceMs,
				this.structuralDirtySince + this.timings.structuralMaxWaitMs
			);
		}
		this.setStatus('dirty');
	}

	/** One dirty-check pass. Public so tests can drive time deterministically instead of waiting on real timers. */
	tick(nowMs: number = this.now()): void {
		this.refreshDirtyFlags(nowMs);

		const structuralDue = this.structuralDirtySince !== null && nowMs >= this.structuralDeadlineMs;
		const playerDue =
			this.playerMoved() && nowMs - this.lastPlayerSaveAt >= this.timings.playerIntervalMs;

		if (structuralDue || playerDue) void this.save('autosave');
	}

	/**
	 * Flushes everything now and resolves once it has actually hit storage — the pause menu's Save,
	 * Cmd/Ctrl+S, quitting to the Worlds screen, and the page-hidden handler all use this, because
	 * "a save was scheduled" is not the same promise as "your world is written".
	 */
	async saveNow(trigger: SaveTrigger = 'manual'): Promise<{ ok: boolean; error?: string }> {
		this.refreshDirtyFlags(this.now());
		try {
			await this.save(trigger, { force: true });
			return this.status === 'error'
				? { ok: false, error: this.lastError ?? 'Save failed.' }
				: { ok: true };
		} catch (error) {
			return { ok: false, error: error instanceof Error ? error.message : String(error) };
		}
	}

	/** Compares the runtime's revision counters against what we last observed. Integer comparisons only — no serialization. */
	private refreshDirtyFlags(nowMs: number): void {
		const counters = this.runtime.getRevisionCounters();

		const changed =
			counters.structural !== this.observedStructural ||
			counters.environment !== this.observedEnvironment ||
			counters.procedural !== this.observedProcedural;

		if (changed) {
			this.observedStructural = counters.structural;
			this.observedEnvironment = counters.environment;
			this.observedProcedural = counters.procedural;
			this.markDirty();
		}

		// A clock that jumped backwards (test-injected time, or a machine sleeping) must not make the
		// player-save interval look like it will never elapse.
		if (nowMs < this.lastPlayerSaveAt) this.lastPlayerSaveAt = nowMs;
	}

	/** Player movement is tracked by value rather than by a revision counter — it changes every frame while walking, so what matters is whether it differs from what's stored, not how often it changed. */
	private playerMoved(): boolean {
		return playerSignature(this.runtime.getPlayerState()) !== this.lastSavedPlayerSignature;
	}

	/**
	 * Serialised through a promise chain so two saves never run concurrently. A save that finds the
	 * world unchanged since the last successful write does nothing, which makes the lifecycle
	 * flushes (page hidden, pause menu, quit) free when they're redundant.
	 */
	private save(trigger: SaveTrigger, { force = false }: { force?: boolean } = {}): Promise<void> {
		this.saveChain = this.saveChain
			.catch(() => {})
			.then(async () => {
				const generation = this.contentGeneration;
				const playerChanged = this.playerMoved();
				const upToDate = generation === this.savedGeneration && !playerChanged;
				// `force` bypasses the debounce, not the "nothing changed" check: a manual save with
				// nothing outstanding should confirm instantly, not rewrite identical bytes.
				if (upToDate && this.status !== 'error') {
					this.setStatus('saved');
					return;
				}
				if (!force && upToDate) return;

				this.setStatus('saving');
				const content = captureWorldContent(this.runtime);
				const capturedPlayerSignature = playerSignature(content.player);
				try {
					await this.persist(content, trigger);
					// Only clear dirtiness up to the generation this write actually captured. Anything
					// that changed while the write was in flight stays dirty and is picked up by the
					// next tick, so a slow write can't swallow edits made during it.
					this.savedGeneration = generation;
					this.lastSavedPlayerSignature = capturedPlayerSignature;
					this.lastPlayerSaveAt = this.now();
					if (this.contentGeneration === generation) {
						this.structuralDirtySince = null;
						this.setStatus('saved');
					} else {
						this.setStatus('dirty');
					}
				} catch (error) {
					this.lastError = error instanceof Error ? error.message : String(error);
					this.setStatus('error');
					throw error;
				}
			});
		return this.saveChain;
	}

	private setStatus(status: SaveStatus): void {
		if (status !== 'error') this.lastError = null;
		if (this.status === status) return;
		this.status = status;
		this.onStatusChange?.(status, this.lastError);
	}

	dispose(): void {
		this.stop();
	}
}

/** Rounded so sub-centimetre float noise while standing still doesn't count as movement. */
function playerSignature(player: SavedPlayerState): string {
	const round = (value: number) => Math.round(value * 100) / 100;
	return [
		round(player.position.x),
		round(player.position.y),
		round(player.position.z),
		round(player.yaw),
		round(player.pitch),
		player.activeFoundationId ?? ''
	].join('|');
}
