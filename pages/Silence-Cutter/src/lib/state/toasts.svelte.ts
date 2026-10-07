/** Lightweight, non-blocking notifications with an optional action (e.g. "Undo"). */
export interface Toast {
	id: number;
	message: string;
	tone: 'info' | 'success' | 'warn';
	action?: { label: string; run: () => void };
}

export class Toasts {
	items = $state<Toast[]>([]);
	private nextId = 1;
	/** Auto-dismiss timers (plain bookkeeping, not reactive state). */
	private timers: Record<number, ReturnType<typeof setTimeout>> = {};

	show(
		message: string,
		opts: { tone?: Toast['tone']; action?: Toast['action']; ms?: number } = {}
	) {
		const id = this.nextId++;
		// Keep the stack short: newest three.
		this.items = [
			...this.items.slice(-2),
			{ id, message, tone: opts.tone ?? 'info', action: opts.action }
		];
		this.timers[id] = setTimeout(() => this.dismiss(id), opts.ms ?? 4000);
		return id;
	}

	dismiss(id: number) {
		clearTimeout(this.timers[id]);
		delete this.timers[id];
		this.items = this.items.filter((t) => t.id !== id);
	}
}
