/**
 * The editor's project state (`MediaProject`). Raw analyses and user decisions are stored; everything
 * else is derived through pure functions:
 *
 *   envelope ─► audio speech ┐
 *   words    ─► transcript speech ┴► proposal (mode, min silence, padding) ─► automatic EDL
 *   overrides ─────────────────────────────────────────────────────────────► effective EDL
 *   effective EDL ─► time map, statistics, preview, export ranges
 */
import { detectAudioSpeech, suggestThreshold } from '../core/audioDetector';
import { proposeCuts } from '../core/combine';
import {
	dropSplitsIn,
	dragBoundary,
	markRange,
	mergeRange,
	splitAt,
	toggleAt
} from '../core/editOps';
import { applyOverrides, buildAutoEdl, keptRanges } from '../core/edl';
import {
	buildCues,
	downloadText,
	toCmx3600,
	toEdlJson,
	toSrt,
	toTranscriptText,
	toVtt
} from '../core/exports';
import { History } from '../core/history';
import { normalize } from '../core/ranges';
import {
	adjacentCut,
	adjacentSegment,
	buildSegments,
	extendSelection,
	formatSpan,
	MIN_SELECTION,
	segmentAt,
	wordsRange
} from '../core/selection';
import { computeStats, formatTimecode, speechFromSilence } from '../core/stats';
import { quantizeRanges, TimeMap } from '../core/timeMap';
import { detectTranscriptSpeech } from '../core/transcriptDetector';
import type {
	EditAction,
	EditTool,
	Envelope,
	ManualOverride,
	Range,
	Transcript,
	TranscriptWord
} from '../core/types';
import { MockTranscriptionEngine } from '../asr/mockEngine';
import { cachedStatus, clearModelCache, modelFileUrl } from '../asr/modelCache';
import { availableModels, chooseVariant, findModel, variantBytes } from '../asr/models';
import {
	TranscriptionCancelledError,
	type DownloadProgress,
	type ModelSpec,
	type RuntimeInfo,
	type TranscribeProgress,
	type TranscriptionEngine
} from '../asr/types';
import { WorkerTranscriptionEngine } from '../asr/workerEngine';
import {
	analyseFile,
	cleanupOpfsExports,
	exportVideo,
	MediaError,
	pickExportTarget
} from '../media/client';
import type { ExportSummary } from '../media/export.worker';
import { buildPyramid, type PeakLevel } from '../media/peaks';
import type { MediaInfo } from '../media/types';
import { detectCapabilities, type Capabilities } from '../runtime/capabilities';
import { loadProject, projectId, saveProject, type ProjectRecord } from './persist';
import {
	clearUserDefaults,
	CUT_PRESETS,
	defaultSettings,
	loadUserDefaults,
	type CutPreset,
	type ProjectSettings
} from './settings';
import { Toasts } from './toasts.svelte';

type NewOverride = Omit<ManualOverride, 'id'>;

export interface AsrState {
	status: 'idle' | 'downloading' | 'loading' | 'ready' | 'transcribing' | 'error';
	download: DownloadProgress | null;
	progress: TranscribeProgress | null;
	error: string | null;
	runtime: RuntimeInfo | null;
	loadedModelId: string | null;
	/** modelId → fully cached on this device */
	cached: Record<string, boolean>;
	/** Browser storage for this origin (model cache lives here). */
	storage: { usage: number; quota: number; persisted: boolean } | null;
}

export interface ExportState {
	status: 'idle' | 'running' | 'done' | 'error' | 'cancelled';
	progress: number;
	phase: string;
	summary: ExportSummary | null;
	error: string | null;
	url: string | null;
	fileName: string;
	savedToDisk: boolean;
}

export interface Diagnostics {
	analysisMs: number | null;
	decodeSpeed: number | null;
	modelLoadMs: number | null;
	modelFilesMs: number | null;
	modelSessionMs: number | null;
	asrRealTimeFactor: number | null;
	asrWallMs: number | null;
	exportMs: number | null;
	exportSpeed: number | null;
	peakHeapMB: number | null;
}

const LICENCE_KEY = 'silence-cutter:crisperwhisper-licence-acknowledged';

export class EditorStore {
	readonly useMockAsr: boolean;
	readonly models: ModelSpec[];

	caps = $state.raw<Capabilities | null>(null);

	// Media
	file = $state.raw<File | null>(null);
	handle: FileSystemFileHandle | undefined;
	mediaUrl = $state<string | null>(null);
	info = $state.raw<MediaInfo | null>(null);
	envelope = $state.raw<Envelope | null>(null);
	peaks = $state.raw<PeakLevel[] | null>(null);
	/** 16 kHz mono PCM. Not reactive: large, and transferred to the ASR worker while transcribing. */
	private pcm: Float32Array | null = null;
	analysis = $state<{
		status: 'idle' | 'running' | 'done' | 'error';
		progress: number;
		error: string | null;
		restored: boolean;
	}>({
		status: 'idle',
		progress: 0,
		error: null,
		restored: false
	});

	// Transcription
	transcript = $state.raw<Transcript | null>(null);
	partialWords = $state.raw<TranscriptWord[]>([]);
	asr = $state<AsrState>({
		status: 'idle',
		download: null,
		progress: null,
		error: null,
		runtime: null,
		loadedModelId: null,
		cached: {},
		storage: null
	});
	licenceAcknowledged = $state(false);
	private engine: TranscriptionEngine | null = null;

	// Settings & edits
	settings = $state<ProjectSettings>(defaultSettings(''));
	overrides = $state.raw<ManualOverride[]>([]);
	private history = new History<ManualOverride[]>([]);
	canUndo = $state(false);
	canRedo = $state(false);
	undoLabel = $state<string | null>(null);
	redoLabel = $state<string | null>(null);
	/** Snap selections and boundary drags to words, segment edges and the playhead. */
	snapping = $state(true);
	/** Timeline mouse tool. Starts in Select each session so clicks always select by default. */
	tool = $state<EditTool>('select');
	private wordAnchor: number | null = null;
	readonly toasts = new Toasts();
	private nextOverrideId = 1;

	// View
	playhead = $state(0);
	selection = $state<Range | null>(null);
	focusedWord = $state<number | null>(null);
	previewMode = $state<'original' | 'edited'>('edited');

	exportState = $state<ExportState>({
		status: 'idle',
		progress: 0,
		phase: '',
		summary: null,
		error: null,
		url: null,
		fileName: '',
		savedToDisk: false
	});
	private exportHandle: { cancel(): void } | null = null;

	diag = $state<Diagnostics>({
		analysisMs: null,
		decodeSpeed: null,
		modelLoadMs: null,
		modelFilesMs: null,
		modelSessionMs: null,
		asrRealTimeFactor: null,
		asrWallMs: null,
		exportMs: null,
		exportSpeed: null,
		peakHeapMB: null
	});

	private saveTimer: ReturnType<typeof setTimeout> | null = null;

	constructor(options: { mockAsr?: boolean; crisperWhisperEnabled: boolean }) {
		this.useMockAsr = !!options.mockAsr;
		this.models = availableModels(options.crisperWhisperEnabled);
		this.settings = loadUserDefaults(
			this.models[0]?.id ?? '',
			this.models.map((m) => m.id)
		);
		try {
			this.licenceAcknowledged = localStorage.getItem(LICENCE_KEY) === 'yes';
		} catch {
			/* storage unavailable */
		}
	}

	// ───────────────────────── derived pipeline ─────────────────────────

	readonly duration = $derived(this.info?.durationSeconds ?? 0);
	readonly words = $derived(this.transcript?.words ?? this.partialWords);

	readonly audioSpeech = $derived(
		this.envelope ? detectAudioSpeech(this.envelope, this.settings.audio) : null
	);

	/**
	 * While transcription is still running, everything not yet transcribed counts as speech for the
	 * transcript detector — unknown audio is never treated as silent.
	 */
	readonly transcriptSpeech = $derived.by(() => {
		if (this.transcript)
			return detectTranscriptSpeech(this.transcript.words, this.settings.transcript);
		if (this.asr.status === 'transcribing' && this.partialWords.length) {
			const done = this.asr.progress?.processedSeconds ?? 0;
			return normalize([
				...detectTranscriptSpeech(this.partialWords, this.settings.transcript),
				{ start: Math.max(0, done - 4), end: this.duration }
			]);
		}
		return null;
	});

	readonly proposal = $derived(
		this.info
			? proposeCuts(
					{
						duration: this.duration,
						audioSpeech: this.audioSpeech,
						transcriptSpeech: this.transcriptSpeech
					},
					this.settings.cut
				)
			: null
	);

	readonly autoEdl = $derived(this.proposal ? buildAutoEdl(this.duration, this.proposal.cuts) : []);
	readonly edl = $derived(
		this.autoEdl.length ? applyOverrides(this.autoEdl, this.overrides, this.duration) : []
	);
	/** Where the user split segments (cuts with S); these always stay separate segments. */
	readonly splitPoints = $derived(
		this.overrides.flatMap((o) => (o.kind === 'split' ? [o.at] : []))
	);
	/** What the user sees, clicks, selects and steps through on the timeline. */
	readonly segments = $derived(buildSegments(this.edl, this.splitPoints));
	readonly timeMap = $derived(TimeMap.fromEdl(this.edl));
	readonly speech = $derived(
		this.proposal ? speechFromSilence(this.proposal.combinedSilence, this.duration) : []
	);
	readonly stats = $derived(
		this.info
			? computeStats(this.duration, this.speech, this.edl, this.transcript?.words.length ?? 0)
			: null
	);
	readonly selectedModel = $derived(findModel(this.settings.modelId) ?? null);
	readonly manualEditCount = $derived(this.overrides.length);
	/** True while work is running that would be lost by closing the tab. */
	readonly isBusy = $derived(
		['downloading', 'loading', 'transcribing'].includes(this.asr.status) ||
			this.exportState.status === 'running' ||
			this.analysis.status === 'running'
	);

	applyPreset(preset: CutPreset) {
		const p = CUT_PRESETS[preset];
		this.settings.cut = {
			...this.settings.cut,
			leadMs: p.leadMs,
			trailMs: p.trailMs,
			minSilenceMs: p.minSilenceMs
		};
	}

	/** Restore factory settings (keeps the per-file threshold, model and language). */
	resetSettings() {
		const keep = {
			thresholdDb: this.settings.audio.thresholdDb,
			modelId: this.settings.modelId,
			language: this.settings.language
		};
		clearUserDefaults();
		const d = defaultSettings(keep.modelId);
		this.settings = {
			...d,
			audio: { ...d.audio, thresholdDb: keep.thresholdDb },
			language: keep.language
		};
		this.toasts.show('Settings reset to defaults.', { ms: 2000 });
	}

	// ───────────────────────── lifecycle ─────────────────────────

	async init() {
		this.caps = await detectCapabilities();
		await this.refreshCacheStatus();
		void cleanupOpfsExports();
	}

	async refreshCacheStatus() {
		if (!this.caps) return;
		const cached: Record<string, boolean> = {};
		for (const m of this.models) {
			const v = chooseVariant(m, this.caps);
			if (!v) continue;
			const status = await cachedStatus(v.files.map((f) => modelFileUrl(m.repo, f.path)));
			cached[m.id] = Object.values(status).every((s) => s !== null);
		}
		this.asr.cached = cached;
		try {
			const est = await navigator.storage?.estimate?.();
			const persisted = (await navigator.storage?.persisted?.()) ?? false;
			if (est) this.asr.storage = { usage: est.usage ?? 0, quota: est.quota ?? 0, persisted };
		} catch {
			/* storage estimate unavailable */
		}
	}

	acknowledgeLicence(value: boolean) {
		this.licenceAcknowledged = value;
		try {
			localStorage.setItem(LICENCE_KEY, value ? 'yes' : 'no');
		} catch {
			/* ignore */
		}
	}

	/** Open a local file. Restores a previous session for the same file when one exists. */
	async openFile(file: File, handle?: FileSystemFileHandle) {
		this.closeFile();
		this.file = file;
		this.handle = handle;
		this.mediaUrl = URL.createObjectURL(file);
		const saved = await loadProject(projectId(file));
		if (saved) {
			this.restore(saved);
			return;
		}
		await this.analyse({ suggest: true });
	}

	closeFile() {
		this.exportHandle?.cancel();
		this.engine?.cancel();
		if (this.mediaUrl) URL.revokeObjectURL(this.mediaUrl);
		if (this.exportState.url) URL.revokeObjectURL(this.exportState.url);
		this.file = null;
		this.handle = undefined;
		this.mediaUrl = null;
		this.info = null;
		this.envelope = null;
		this.peaks = null;
		this.pcm = null;
		this.transcript = null;
		this.partialWords = [];
		this.overrides = [];
		this.history.reset([]);
		this.syncHistory();
		this.selection = null;
		this.playhead = 0;
		this.analysis = { status: 'idle', progress: 0, error: null, restored: false };
		this.exportState = {
			...this.exportState,
			status: 'idle',
			progress: 0,
			url: null,
			summary: null,
			error: null
		};
	}

	private restore(saved: ProjectRecord) {
		this.info = saved.info;
		this.envelope = { hopSeconds: saved.envelopeHop, db: saved.envelopeDb };
		this.peaks = buildPyramid(saved.peaks, saved.peakBucketSeconds);
		this.transcript = saved.transcript;
		this.settings = { ...defaultSettings(this.settings.modelId), ...saved.settings };
		if (!this.models.some((m) => m.id === this.settings.modelId)) {
			this.settings.modelId = this.models[0]?.id ?? '';
		}
		this.overrides = saved.overrides;
		this.nextOverrideId = saved.overrides.reduce((m, o) => Math.max(m, o.id), 0) + 1;
		this.history.reset(saved.overrides);
		this.syncHistory();
		this.analysis = { status: 'done', progress: 1, error: null, restored: true };
	}

	/** Decode the audio track (needed for analysis, and for transcription after a restore). */
	async analyse(opts: { suggest?: boolean } = {}) {
		if (!this.file) return;
		const file = this.file;
		this.analysis = { ...this.analysis, status: 'running', progress: 0, error: null };
		const started = performance.now();
		try {
			const result = await analyseFile(file, {
				onInfo: (info) => (this.info = info),
				onProgress: (s, total) => (this.analysis.progress = total ? s / total : 0)
			}).promise;
			if (this.file !== file) return;
			this.info = result.info;
			this.pcm = result.pcm16k;
			this.envelope = { hopSeconds: result.envelopeHop, db: result.envelopeDb };
			this.peaks = buildPyramid(result.peaks, result.peakBucketSeconds);
			if (opts.suggest) {
				this.settings.audio = {
					...this.settings.audio,
					thresholdDb: suggestThreshold(this.envelope)
				};
			}
			this.analysis = { ...this.analysis, status: 'done', progress: 1 };
			this.diag.analysisMs = performance.now() - started;
			this.diag.decodeSpeed = result.info.durationSeconds / (result.timings.decodeMs / 1000);
			this.sampleMemory();
			this.scheduleSave();
		} catch (err) {
			this.analysis = { ...this.analysis, status: 'error', error: (err as Error).message };
			if (err instanceof MediaError && err.code === 'unsupported-audio') {
				this.analysis.error +=
					' Try converting the file to MP4 (H.264 + AAC). Nothing has been uploaded.';
			}
		}
	}

	// ───────────────────────── transcription ─────────────────────────

	private makeEngine(model: ModelSpec): TranscriptionEngine {
		if (this.useMockAsr) return new MockTranscriptionEngine();
		return new WorkerTranscriptionEngine(model, this.caps ?? { webgpu: false, f16: false });
	}

	variantFor(model: ModelSpec) {
		return this.caps ? chooseVariant(model, this.caps) : null;
	}

	downloadSizeFor(model: ModelSpec): number | null {
		const v = this.variantFor(model);
		return v ? variantBytes(v) : null;
	}

	async transcribe() {
		const model = this.selectedModel;
		if (!model || !this.info) return;
		if (model.family === 'crisperwhisper' && !this.licenceAcknowledged && !this.useMockAsr) {
			this.asr.error = 'Please acknowledge the CrisperWhisper licence first.';
			return;
		}
		this.asr.error = null;
		try {
			if (!this.pcm) {
				await this.analyse();
				if (!this.pcm) throw new Error(this.analysis.error ?? 'Audio could not be decoded.');
			}
			if (!this.engine || this.asr.loadedModelId !== model.id) {
				await this.engine?.unload();
				this.engine = this.makeEngine(model);
				this.asr.status = 'downloading';
				this.asr.download = null;
				// Ask for persistent storage before a multi-hundred-MB download so the browser does
				// not evict the cached model (and the user's projects) under storage pressure.
				try {
					await navigator.storage?.persist?.();
				} catch {
					/* best effort */
				}
				const res = await this.engine.load({
					onDownload: (p) => {
						this.asr.download = p;
						if (p.overallLoaded >= p.overallTotal) this.asr.status = 'loading';
					}
				});
				this.asr.runtime = res.runtime;
				this.asr.loadedModelId = model.id;
				this.diag.modelLoadMs = res.loadMs;
				this.diag.modelFilesMs = res.filesMs;
				this.diag.modelSessionMs = res.sessionMs;
				await this.refreshCacheStatus();
			}
			this.asr.status = 'transcribing';
			this.asr.progress = null;
			this.partialWords = [];
			this.transcript = null;
			const audio = this.pcm;
			this.pcm = null; // ownership moves to the engine for the duration of the call
			const engine = this.engine;
			try {
				const res = await engine.transcribe(audio, {
					language: this.settings.language,
					mode: 'verbatim',
					onProgress: (p) => (this.asr.progress = p),
					onWords: (w) => (this.partialWords = [...this.partialWords, ...w])
				});
				this.transcript = res.transcript;
				this.diag.asrRealTimeFactor = res.realTimeFactor;
				this.diag.asrWallMs = res.wallMs;
				this.scheduleSave();
			} finally {
				this.pcm = (engine as { returnedAudio?: Float32Array | null }).returnedAudio ?? null;
				this.partialWords = [];
				this.sampleMemory();
			}
			this.asr.status = 'ready';
		} catch (err) {
			if (err instanceof TranscriptionCancelledError) {
				this.asr.status = this.asr.loadedModelId ? 'ready' : 'idle';
				return;
			}
			this.asr.status = 'error';
			this.asr.error = (err as Error).message;
			this.asr.loadedModelId = null;
			this.engine = null;
		}
	}

	cancelTranscription() {
		this.engine?.cancel();
	}

	async deleteCachedModel(model: ModelSpec) {
		const v = this.variantFor(model);
		if (!v) return;
		if (this.asr.loadedModelId === model.id) {
			await this.engine?.unload();
			this.engine = null;
			this.asr.loadedModelId = null;
			this.asr.status = 'idle';
		}
		await clearModelCache(v.files.map((f) => modelFileUrl(model.repo, f.path)));
		await this.refreshCacheStatus();
	}

	// ───────────────────────── manual edits ─────────────────────────

	private commit(next: ManualOverride[], label: string, notify = true) {
		this.overrides = this.history.push(next, label);
		this.syncHistory();
		this.scheduleSave();
		if (notify) {
			this.toasts.show(label, {
				tone: 'success',
				action: { label: 'Undo', run: () => this.undo() }
			});
		}
	}

	private syncHistory() {
		this.canUndo = this.history.canUndo;
		this.canRedo = this.history.canRedo;
		this.undoLabel = this.history.undoLabel;
		this.redoLabel = this.history.redoLabel;
	}

	private add(op: NewOverride | null, label: string, notify = true): boolean {
		if (!op) return false;
		this.commit(
			[...this.overrides, { ...op, id: this.nextOverrideId++ } as ManualOverride],
			label,
			notify
		);
		return true;
	}

	/** Fraction of `range` that is currently removed (0 = all kept, 1 = all removed). */
	removedFraction(range: Range): number {
		const len = range.end - range.start;
		if (len <= 0) return 0;
		let removed = 0;
		for (const r of this.edl) {
			if (r.end <= range.start) continue;
			if (r.start >= range.end) break;
			if (r.action === 'remove') {
				removed += Math.min(r.end, range.end) - Math.max(r.start, range.start);
			}
		}
		return removed / len;
	}

	/**
	 * Click on the segment strip: a cut is restored (and selected, so Delete re-cuts it); a kept
	 * segment is selected (shift extends the selection). Only the clicked segment is affected —
	 * pieces created with Split or by earlier edits are never grouped with neighbours. (Pauses are
	 * cut from the detail track or with T.)
	 */
	clickSegment(t: number, extend = false): 'restored' | 'selected' | null {
		const region = segmentAt(this.segments, t);
		if (!region) return null;
		if (!extend && region.action === 'remove') {
			const span = formatSpan(region.end - region.start);
			if (this.add(markRange(region, 'keep'), `Restored ${span} cut`)) {
				this.selection = { start: region.start, end: region.end };
				return 'restored';
			}
		}
		this.selectSegment(region, extend);
		return 'selected';
	}

	selectSegment(region: Range, extend = false) {
		this.selection = extend
			? extendSelection(this.selection, region)
			: { start: region.start, end: region.end };
	}

	selectSegmentAt(t: number, extend = false) {
		const region = segmentAt(this.segments, t);
		if (region) this.selectSegment(region, extend);
		return region;
	}

	/** Select word `i` (shift: extend from the anchor word). */
	selectWord(i: number, extend = false) {
		const anchor = extend && this.wordAnchor !== null ? this.wordAnchor : i;
		if (!extend) this.wordAnchor = i;
		const r = wordsRange(this.words, anchor, i);
		if (r) this.selection = r;
		this.focusedWord = i;
	}

	selectWordRange(a: number, b: number) {
		this.wordAnchor = a;
		const r = wordsRange(this.words, a, b);
		if (r) this.selection = r;
		this.focusedWord = b;
	}

	/** Mark-in at `t` (keeps an existing out point after it). */
	setIn(t = this.playhead) {
		const end = this.selection && this.selection.end > t ? this.selection.end : t;
		this.selection = { start: t, end };
	}

	/** Mark-out at `t` (keeps an existing in point before it). */
	setOut(t = this.playhead) {
		const start = this.selection && this.selection.start < t ? this.selection.start : t;
		this.selection = { start, end: t };
	}

	selectAll() {
		if (this.duration > 0) this.selection = { start: 0, end: this.duration };
	}

	clearSelection() {
		this.selection = null;
		this.wordAnchor = null;
	}

	/** Select the next/previous cut (wraps). Returns it so the caller can seek/reveal. */
	selectAdjacentCut(dir: 1 | -1): Range | null {
		const from = this.selection ? this.selection.start : this.playhead;
		const cut = adjacentCut(this.segments, from, dir);
		if (cut) this.selection = { start: cut.start, end: cut.end };
		else this.toasts.show('There are no cuts yet.', { tone: 'info', ms: 2000 });
		return cut;
	}

	selectAdjacentSegment(dir: 1 | -1): Range | null {
		const from = this.selection ? this.selection.start : this.playhead;
		const seg = adjacentSegment(this.segments, from, dir);
		if (seg) this.selection = { start: seg.start, end: seg.end };
		return seg;
	}

	/** Switch the timeline tool; `announce` explains the mode (used by the keyboard shortcuts). */
	setTool(tool: EditTool, announce = false) {
		if (this.tool === tool) return;
		this.tool = tool;
		if (!announce) return;
		this.toasts.show(
			tool === 'trim'
				? 'Trim mode: drag cut edges to move them. Press V to go back to selecting.'
				: 'Select mode: click segments or drag to select. Press B to trim cut edges.',
			{ ms: 2500 }
		);
	}

	/** Delete: remove the selection (or explain how to make one). */
	removeSelection(): boolean {
		const sel = this.selection;
		if (!sel || sel.end - sel.start < MIN_SELECTION) {
			this.toasts.show(
				sel
					? 'Set an out point with O (or drag on the timeline) to choose what to remove.'
					: 'Select something first: click a segment, drag on the timeline, or select words in the transcript.',
				{ tone: 'warn' }
			);
			return false;
		}
		if (this.removedFraction(sel) > 0.999) {
			this.toasts.show('That part is already removed.', { ms: 2000 });
			return false;
		}
		const ok = this.add(markRange(sel, 'remove'), `Removed ${formatSpan(sel.end - sel.start)}`);
		if (ok) this.clearSelection();
		return ok;
	}

	/** Restore (keep) the selection; with no selection, restore the cut under the playhead. */
	restoreSelection(): boolean {
		let sel = this.selection;
		if (!sel || sel.end - sel.start < MIN_SELECTION) {
			const cut = segmentAt(this.segments, this.playhead);
			sel = cut?.action === 'remove' ? { start: cut.start, end: cut.end } : null;
		}
		if (!sel) {
			this.toasts.show('Select a cut (click it, or press ] for the next one) to restore it.', {
				tone: 'warn'
			});
			return false;
		}
		if (this.removedFraction(sel) < 0.001) {
			this.toasts.show('Nothing is removed there.', { ms: 2000 });
			return false;
		}
		return this.add(markRange(sel, 'keep'), `Restored ${formatSpan(sel.end - sel.start)}`);
	}

	/** Toggle the region at `t` (cut ↔ keep). Used by the T shortcut. */
	toggleAt(t: number) {
		if (!this.proposal) return false;
		const region = segmentAt(this.segments, t);
		if (region?.action === 'remove') return this.clickSegment(t) === 'restored';
		const op = toggleAt(
			this.edl,
			t,
			this.proposal.combinedSilence,
			this.settings.cut,
			this.duration
		);
		if (op?.kind !== 'paint') {
			this.toasts.show('Only pauses can be toggled. Select speech and press Delete to remove it.', {
				tone: 'warn',
				ms: 3000
			});
			return false;
		}
		return this.add(op, `Cut ${formatSpan(op.end - op.start)} pause`);
	}

	dragBoundary(leftIndex: number, from: number, to: number) {
		return this.add(
			dragBoundary(this.edl, leftIndex, from, to),
			`Moved cut edge by ${formatSpan(Math.abs(to - from))}`,
			false
		);
	}

	mark(action: EditAction) {
		return action === 'remove' ? this.removeSelection() : this.restoreSelection();
	}

	/** Cut (split) the segment at `at` so each side can be kept or removed independently. */
	split(at = this.playhead) {
		const ok = this.add(splitAt(this.segments, at), `Split at ${formatTimecode(at)}`, false);
		if (ok) {
			// A selection spanning the split would hide the two new pieces; let the user pick one.
			const sel = this.selection;
			if (sel && sel.start < at && sel.end > at) this.clearSelection();
			this.toasts.show(`Split at ${formatTimecode(at)}. Click a side to select it, then Delete.`, {
				ms: 3000
			});
		} else {
			this.toasts.show('Cannot split here (too close to a segment edge).', {
				tone: 'warn',
				ms: 2500
			});
		}
		return ok;
	}

	merge(range: Range | null = this.selection) {
		if (!range) {
			this.toasts.show('Select the segments to merge first.', { tone: 'warn' });
			return false;
		}
		const op = mergeRange(this.segments, range);
		if (!op) return false;
		const withoutSplits = dropSplitsIn(this.overrides, op as Range);
		this.commit(
			[...withoutSplits, { ...op, id: this.nextOverrideId++ } as ManualOverride],
			'Merged segments'
		);
		return true;
	}

	undo() {
		const label = this.history.undoLabel;
		if (!this.history.canUndo) return;
		this.overrides = this.history.undo();
		this.syncHistory();
		this.scheduleSave();
		if (label) this.toasts.show(`Undid: ${label}`, { ms: 2000 });
	}

	redo() {
		const label = this.history.redoLabel;
		if (!this.history.canRedo) return;
		this.overrides = this.history.redo();
		this.syncHistory();
		this.scheduleSave();
		if (label) this.toasts.show(`Redid: ${label}`, { ms: 2000 });
	}

	resetToAutomatic() {
		if (this.overrides.length === 0) return;
		this.commit([], 'Reset to automatic edit');
	}

	// ───────────────────────── side-car exports ─────────────────────────

	private baseName() {
		return (this.file?.name ?? 'video').replace(/\.[^.]+$/, '');
	}

	/** Captions timed to the edited video (removed words dropped). */
	exportSubtitles(format: 'srt' | 'vtt') {
		if (!this.transcript) return;
		const cues = buildCues(this.transcript.words, this.edl, this.timeMap);
		downloadText(
			format === 'srt' ? toSrt(cues) : toVtt(cues),
			`${this.baseName()} (edited).${format}`,
			format === 'srt' ? 'application/x-subrip' : 'text/vtt'
		);
	}

	exportTranscript() {
		if (!this.transcript) return;
		downloadText(
			toTranscriptText(this.transcript.words, this.edl),
			`${this.baseName()} (edited).txt`
		);
	}

	/** Edit decision list: JSON (source seconds) or CMX 3600 for Premiere/Resolve. */
	exportEdl(format: 'json' | 'cmx') {
		if (!this.info) return;
		const fps = this.info.video?.frameRate ?? 30;
		if (format === 'json') {
			downloadText(
				toEdlJson(this.edl, {
					file: this.file?.name ?? '',
					duration: this.duration,
					frameRate: fps
				}),
				`${this.baseName()}.edl.json`,
				'application/json'
			);
		} else {
			downloadText(
				toCmx3600(this.exportRanges(), fps, this.file?.name ?? 'source'),
				`${this.baseName()}.edl`
			);
		}
	}

	// ───────────────────────── export ─────────────────────────

	exportRanges(): Range[] {
		const fps = this.info?.video?.frameRate ?? 30;
		return quantizeRanges(keptRanges(this.edl), fps, this.duration);
	}

	/** Must be called from a click handler (the save picker needs user activation). */
	async startExport(mode: 'save' | 'download') {
		if (!this.file || !this.info) return;
		const base = this.file.name.replace(/\.[^.]+$/, '');
		const fileName = `${base} (edited).mp4`;
		const target =
			mode === 'save'
				? await pickExportTarget(fileName)
				: typeof navigator.storage?.getDirectory === 'function'
					? ({ kind: 'opfs', name: `export-${Date.now()}.mp4` } as const)
					: ({ kind: 'buffer' } as const);
		if (!target) return;
		if (this.exportState.url) URL.revokeObjectURL(this.exportState.url);
		this.exportState = {
			status: 'running',
			progress: 0,
			phase: 'Preparing',
			summary: null,
			error: null,
			url: null,
			fileName,
			savedToDisk: target.kind === 'handle'
		};
		const started = performance.now();
		const handle = exportVideo({
			file: this.file,
			keeps: this.exportRanges(),
			duration: this.duration,
			frameRate: this.info.video?.frameRate ?? 30,
			// Reactive proxies cannot be structured-cloned into the worker.
			transitions: $state.snapshot(this.settings.transitions),
			quality: this.settings.exportQuality,
			target,
			onProgress: (s, total, phase) => {
				this.exportState.progress = total ? s / total : 0;
				this.exportState.phase = phase;
			}
		});
		this.exportHandle = handle;
		try {
			const { summary, blob } = await handle.promise;
			this.exportState.summary = summary;
			this.exportState.url = blob ? URL.createObjectURL(blob) : null;
			this.exportState.status = 'done';
			this.exportState.progress = 1;
			this.diag.exportMs = performance.now() - started;
			this.diag.exportSpeed = summary.editedSeconds / (summary.wallMs / 1000);
		} catch (err) {
			if ((err as DOMException)?.name === 'AbortError') this.exportState.status = 'cancelled';
			else {
				this.exportState.status = 'error';
				this.exportState.error = (err as Error).message;
			}
		} finally {
			this.exportHandle = null;
			this.sampleMemory();
		}
	}

	cancelExport() {
		this.exportHandle?.cancel();
	}

	// ───────────────────────── persistence ─────────────────────────

	scheduleSave() {
		if (!this.file || !this.info || !this.envelope || !this.peaks) return;
		if (this.saveTimer) clearTimeout(this.saveTimer);
		this.saveTimer = setTimeout(() => void this.saveNow(), 600);
	}

	async saveNow() {
		if (!this.file || !this.info || !this.envelope || !this.peaks) return;
		const level0 = this.peaks[0];
		await saveProject({
			id: projectId(this.file),
			name: this.file.name,
			size: this.file.size,
			lastModified: this.file.lastModified,
			updatedAt: Date.now(),
			info: $state.snapshot(this.info) as MediaInfo,
			settings: $state.snapshot(this.settings) as ProjectSettings,
			overrides: this.overrides,
			transcript: this.transcript,
			envelopeDb: this.envelope.db,
			envelopeHop: this.envelope.hopSeconds,
			peaks: level0.data,
			peakBucketSeconds: level0.bucketSeconds,
			handle: this.handle
		}).catch(() => {});
	}

	private sampleMemory() {
		const m = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
		if (m) this.diag.peakHeapMB = Math.max(this.diag.peakHeapMB ?? 0, m.usedJSHeapSize / 1e6);
	}
}
