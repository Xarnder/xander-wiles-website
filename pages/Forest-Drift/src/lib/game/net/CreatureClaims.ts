/**
 * Who holds which creature online (by player slot), and this player's own claims waiting for the
 * room's answer. Riding uses it (docs/2026/11-07/bipedal-speed-creature §6); the room decides,
 * and every client keeps the same picture from its `ridden` / welcome messages.
 */

export interface ClaimResult {
	ok: boolean;
	/** Why the room said no (its refusal, or 'timeout' / 'offline' from here). */
	reason?: string;
}

/** A change to who holds what, for the scene to apply to its herd. */
export type HolderChange = (
	slot: number,
	creature: string | null,
	previous: string | null,
	self: boolean
) => void;

export class CreatureClaims {
	/** slot → creature id (this player's own included, once granted). */
	readonly held = new Map<number, string>();
	private readonly pending = new Map<
		number,
		{
			creature: string;
			resolve: (result: ClaimResult) => void;
			timer: ReturnType<typeof setTimeout>;
		}
	>();
	private nextId = 1;

	constructor(private readonly timeoutMs: number) {}

	/** A fresh message id (claims and releases share one sequence, as the room expects). */
	messageId(): number {
		return this.nextId++;
	}

	/**
	 * Asks the room for `creature` with `send(id)`; resolves with its answer, or a timeout.
	 * `send` returns false when the message couldn't leave (offline).
	 */
	claim(creature: string, send: (id: number) => boolean): Promise<ClaimResult> {
		const id = this.messageId();
		return new Promise((resolve) => {
			const timer = setTimeout(() => {
				this.pending.delete(id);
				resolve({ ok: false, reason: 'timeout' });
			}, this.timeoutMs);
			this.pending.set(id, { creature, resolve, timer });
			if (!send(id)) {
				clearTimeout(timer);
				this.pending.delete(id);
				resolve({ ok: false, reason: 'offline' });
			}
		});
	}

	/**
	 * The room answered claim `id`. A grant marks `selfSlot` as the holder. Returns false when
	 * nobody is waiting for that answer any more (it came after the timeout): a late grant must then
	 * be handed straight back.
	 */
	answer(id: number, ok: boolean, reason: string | undefined, selfSlot: number | null): boolean {
		const pending = this.pending.get(id);
		if (!pending) return false;
		this.pending.delete(id);
		clearTimeout(pending.timer);
		if (ok && selfSlot !== null) this.held.set(selfSlot, pending.creature);
		pending.resolve({ ok, reason });
		return true;
	}

	/** This player let go of what they held (already applied locally). */
	release(selfSlot: number | null): void {
		if (selfSlot !== null) this.held.delete(selfSlot);
	}

	/**
	 * The room says `slot` now holds `creature` (null: let go). Calls `change` unless it's this
	 * player's own release echoing back (already applied locally).
	 */
	apply(
		slot: number,
		creature: string | null,
		selfSlot: number | null,
		change: HolderChange
	): void {
		const previous = this.held.get(slot) ?? null;
		const self = slot === selfSlot;
		if (creature === null) this.held.delete(slot);
		else this.held.set(slot, creature);
		if (self && creature === null && previous === null) return;
		change(slot, creature, previous, self);
	}

	/** On (re)joining: the room's full list replaces ours, telling `change` what moved. */
	reconcile(
		list: readonly { slot: number; creature: string }[],
		selfSlot: number | null,
		change: HolderChange
	): void {
		const now = new Map(list.map((entry) => [entry.slot, entry.creature]));
		for (const [slot, creature] of [...this.held]) {
			if (now.get(slot) === creature) continue;
			this.held.delete(slot);
			change(slot, null, creature, slot === selfSlot);
		}
		for (const [slot, creature] of now) {
			if (this.held.get(slot) === creature) continue;
			this.held.set(slot, creature);
			change(slot, creature, null, slot === selfSlot);
		}
	}

	/** Answers every waiting claim with `result` (disconnected, or leaving). */
	settle(result: ClaimResult): void {
		for (const pending of this.pending.values()) {
			clearTimeout(pending.timer);
			pending.resolve(result);
		}
		this.pending.clear();
	}
}
