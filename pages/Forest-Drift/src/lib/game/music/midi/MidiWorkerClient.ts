import type { MidiAnalysis } from './MidiParser';
import type { MidiImportOptions, MidiImportPlan } from './MidiImportPlan';
/** A parser can be terminated on timeout/cancel, including malformed third-party parser input. */
export class MidiWorkerClient {
	private worker = new Worker(new URL('./midi.worker.ts', import.meta.url), { type: 'module' });
	private id = 0;
	private pending = new Map<
		number,
		{
			resolve: (v: unknown) => void;
			reject: (e: Error) => void;
			timer: ReturnType<typeof setTimeout>;
			stage?: (s: string) => void;
		}
	>();
	constructor() {
		this.worker.onmessage = (e) => {
			const p = this.pending.get(e.data.id);
			if (!p) return;
			if (e.data.stage) {
				p.stage?.(e.data.stage);
				return;
			}
			clearTimeout(p.timer);
			this.pending.delete(e.data.id);
			if (e.data.error) p.reject(Error(e.data.error));
			else p.resolve(e.data.result);
		};
		this.worker.onerror = (e) => this.dispose(e.message);
	}
	private request<T>(data: object, transfer: Transferable[] = [], stage?: (s: string) => void) {
		const id = ++this.id;
		return new Promise<T>((resolve, reject) => {
			const timer = setTimeout(
				() => this.dispose('MIDI processing exceeded the 30-second safety limit.'),
				30000
			);
			this.pending.set(id, { resolve: (v) => resolve(v as T), reject, timer, stage });
			this.worker.postMessage({ id, ...data }, transfer);
		});
	}
	parse(buffer: ArrayBuffer, fileName: string, stage?: (s: string) => void) {
		return this.request<MidiAnalysis>({ kind: 'parse', buffer, fileName }, [buffer], stage);
	}
	plan(options: MidiImportOptions, stage?: (s: string) => void) {
		return this.request<MidiImportPlan>({ kind: 'plan', options }, [], stage);
	}
	dispose(reason = 'MIDI import cancelled.') {
		this.worker.terminate();
		for (const p of this.pending.values()) {
			clearTimeout(p.timer);
			p.reject(Error(reason));
		}
		this.pending.clear();
	}
}
