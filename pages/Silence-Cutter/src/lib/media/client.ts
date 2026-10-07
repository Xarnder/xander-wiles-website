import type { Range, TransitionParams } from '../core/types';
import type { ExportQuality } from './exportPlan';
import type { ExportRequest, ExportResponse, ExportSummary, ExportTarget } from './export.worker';
import type { AnalysisResponse, AnalysisResult, MediaInfo } from './types';

export class MediaError extends Error {
	constructor(
		message: string,
		readonly code?: string
	) {
		super(message);
		this.name = 'MediaError';
	}
}

export interface AnalysisHandle {
	promise: Promise<AnalysisResult>;
	cancel(): void;
}

/** Decode + analyse a local file in a worker. The file is read in place; nothing is uploaded. */
export function analyseFile(
	file: File,
	callbacks: {
		onInfo?: (info: MediaInfo) => void;
		onProgress?: (seconds: number, total: number) => void;
	} = {}
): AnalysisHandle {
	const worker = new Worker(new URL('./analysis.worker.ts', import.meta.url), { type: 'module' });
	let rejectFn: (e: unknown) => void = () => {};
	const promise = new Promise<AnalysisResult>((resolve, reject) => {
		rejectFn = reject;
		worker.onmessage = (e: MessageEvent<AnalysisResponse>) => {
			const msg = e.data;
			if (msg.type === 'info') callbacks.onInfo?.(msg.info);
			else if (msg.type === 'progress') callbacks.onProgress?.(msg.seconds, msg.total);
			else if (msg.type === 'done') {
				worker.terminate();
				resolve(msg.result);
			} else if (msg.type === 'error') {
				worker.terminate();
				reject(new MediaError(msg.message, msg.code));
			}
		};
		worker.onerror = (e) => {
			worker.terminate();
			reject(new MediaError(e.message || 'Analysis worker crashed'));
		};
		worker.postMessage({ type: 'analyse', file });
	});
	return {
		promise,
		cancel() {
			worker.terminate();
			rejectFn(new DOMException('Analysis cancelled', 'AbortError'));
		}
	};
}

export interface ExportOptions {
	file: File;
	keeps: Range[];
	duration: number;
	frameRate: number;
	transitions: TransitionParams;
	quality: ExportQuality;
	target: ExportTarget;
	onProgress?: (seconds: number, total: number, phase: string) => void;
}

export interface ExportResult {
	summary: ExportSummary;
	/** A Blob for the produced file (backed by disk for OPFS output). Absent when saved via a picker. */
	blob: Blob | null;
}

export interface ExportHandle {
	promise: Promise<ExportResult>;
	cancel(): void;
}

export function exportVideo(opts: ExportOptions): ExportHandle {
	const worker = new Worker(new URL('./export.worker.ts', import.meta.url), { type: 'module' });
	const promise = new Promise<ExportResult>((resolve, reject) => {
		worker.onmessage = async (e: MessageEvent<ExportResponse>) => {
			const msg = e.data;
			if (msg.type === 'progress') opts.onProgress?.(msg.seconds, msg.total, msg.phase);
			else if (msg.type === 'done') {
				worker.terminate();
				let blob: Blob | null = null;
				if (msg.buffer) blob = new Blob([msg.buffer], { type: 'video/mp4' });
				else if (msg.opfsName) {
					const root = await navigator.storage.getDirectory();
					blob = await (await root.getFileHandle(msg.opfsName)).getFile();
				}
				resolve({ summary: msg.summary, blob });
			} else if (msg.type === 'cancelled') {
				worker.terminate();
				reject(new DOMException('Export cancelled', 'AbortError'));
			} else if (msg.type === 'error') {
				worker.terminate();
				reject(new MediaError(msg.message));
			}
		};
		worker.onerror = (e) => {
			worker.terminate();
			reject(new MediaError(e.message || 'Export worker crashed'));
		};
		const req: ExportRequest = {
			type: 'export',
			file: opts.file,
			keeps: opts.keeps,
			duration: opts.duration,
			frameRate: opts.frameRate,
			transitions: opts.transitions,
			quality: opts.quality,
			target: opts.target
		};
		worker.postMessage(req);
	});
	return {
		promise,
		cancel() {
			worker.postMessage({ type: 'cancel' } satisfies ExportRequest);
		}
	};
}

/**
 * Choose where an export is written:
 * 1. File System Access save picker (streams straight to the chosen file — Chromium desktop)
 * 2. Origin Private File System (streams to disk, then offered as a download)
 * 3. In-memory buffer (last resort; limited by RAM)
 * Must be called from a user gesture for option 1.
 */
export async function pickExportTarget(suggestedName: string): Promise<ExportTarget | null> {
	const g = globalThis as unknown as {
		showSaveFilePicker?: (o: unknown) => Promise<FileSystemFileHandle>;
	};
	if (typeof g.showSaveFilePicker === 'function') {
		try {
			const handle = await g.showSaveFilePicker({
				suggestedName,
				types: [{ description: 'MP4 video', accept: { 'video/mp4': ['.mp4'] } }]
			});
			return { kind: 'handle', handle };
		} catch (err) {
			if ((err as DOMException)?.name === 'AbortError') return null;
			// Fall through to OPFS (e.g. picker blocked inside an iframe).
		}
	}
	if (typeof navigator.storage?.getDirectory === 'function') {
		return { kind: 'opfs', name: `export-${Date.now()}.mp4` };
	}
	return { kind: 'buffer' };
}

/** Remove temporary OPFS exports left behind by earlier sessions. */
export async function cleanupOpfsExports(keep?: string): Promise<void> {
	try {
		const root = await navigator.storage.getDirectory();
		const names: string[] = [];
		for await (const [name] of (
			root as unknown as { entries(): AsyncIterable<[string, unknown]> }
		).entries()) {
			if (name.startsWith('export-') && name !== keep) names.push(name);
		}
		await Promise.all(names.map((n) => root.removeEntry(n)));
	} catch {
		/* best effort */
	}
}

export function downloadBlob(blob: Blob, filename: string) {
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = filename;
	document.body.appendChild(a);
	a.click();
	a.remove();
	setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
