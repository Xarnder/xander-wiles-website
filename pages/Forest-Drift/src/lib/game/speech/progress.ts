/** Progress is per current asset; its ETA never includes later loading or synthesis. */
export interface SpeechProgress {
	stage: 'loading' | 'download' | 'generating' | 'checking' | 'saving';
	file?: string;
	loaded?: number;
	total?: number;
	bytesPerSecond?: number;
	etaSeconds?: number;
	completed?: number;
	count?: number;
	reused?: number;
}
export class TransferProgress {
	private files = new Map<
		string,
		{ started: number; loaded: number; initial: number; total?: number }
	>();
	update(file: string, loaded: number, total: number, now: number): SpeechProgress {
		let previous = this.files.get(file);
		if (!previous || loaded < previous.loaded) {
			previous = {
				started: now,
				loaded,
				initial: loaded,
				total: Number.isFinite(total) && total > loaded ? total : undefined
			};
			this.files.set(file, previous);
		}
		previous.loaded = loaded;
		const seconds = (now - previous.started) / 1000;
		const rate = seconds >= 1 ? (loaded - previous.initial) / seconds : undefined;
		// The loader expands unknown-length totals to match loaded bytes; never call that 100%.
		if (total !== previous.total || loaded > total) previous.total = undefined;
		const knownTotal = previous.total;
		return {
			stage: 'download',
			file,
			loaded,
			total: knownTotal,
			bytesPerSecond: rate,
			etaSeconds: rate && knownTotal ? Math.max(0, (knownTotal - loaded) / rate) : undefined
		};
	}
}
export function formatBytes(bytes: number): string {
	return bytes >= 1024 * 1024
		? `${(bytes / 1024 / 1024).toFixed(1)} MB`
		: `${(bytes / 1024).toFixed(0)} KB`;
}
export function formatDuration(seconds: number): string {
	const rounded = Math.max(0, Math.ceil(seconds));
	return rounded < 60 ? `${rounded}s` : `${Math.floor(rounded / 60)}m ${rounded % 60}s`;
}
