/**
 * Minimal immutable undo/redo stack. States must be treated as immutable values (the manual
 * override list is small, so snapshots are cheap). Each step can carry a human-readable label so
 * the UI can say what Undo/Redo will do.
 */
export class History<T> {
	private past: Array<{ state: T; label: string }> = [];
	private future: Array<{ state: T; label: string }> = [];
	private presentLabel = '';

	constructor(
		private present: T,
		private readonly limit = 500
	) {}

	get current(): T {
		return this.present;
	}

	get canUndo(): boolean {
		return this.past.length > 0;
	}

	get canRedo(): boolean {
		return this.future.length > 0;
	}

	/** Label of the step that Undo would revert. */
	get undoLabel(): string | null {
		return this.past.length ? this.presentLabel : null;
	}

	/** Label of the step that Redo would re-apply. */
	get redoLabel(): string | null {
		return this.future.length ? this.future[this.future.length - 1].label : null;
	}

	push(next: T, label = ''): T {
		this.past.push({ state: this.present, label: this.presentLabel });
		if (this.past.length > this.limit) this.past.shift();
		this.present = next;
		this.presentLabel = label;
		this.future = [];
		return next;
	}

	undo(): T {
		const prev = this.past.pop();
		if (prev === undefined) return this.present;
		this.future.push({ state: this.present, label: this.presentLabel });
		this.present = prev.state;
		this.presentLabel = prev.label;
		return prev.state;
	}

	redo(): T {
		const next = this.future.pop();
		if (next === undefined) return this.present;
		this.past.push({ state: this.present, label: this.presentLabel });
		this.present = next.state;
		this.presentLabel = next.label;
		return next.state;
	}

	reset(state: T): void {
		this.past = [];
		this.future = [];
		this.present = state;
		this.presentLabel = '';
	}
}
