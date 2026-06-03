import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, CheckCircle2, ChevronDown, ChevronUp, Clipboard, Cpu, FileText, ListChecks, Loader, LockKeyhole, Sparkles, Tags, Terminal, WandSparkles } from 'lucide-react';
import { isWebGPUSupported, summariseJournalEntry } from '../lib/localSummariser';

function SummaryList({ title, items }) {
    if (!items?.length) return null;

    return (
        <div>
            <p className="text-[10px] text-text-muted uppercase tracking-widest font-bold">{title}</p>
            <ul className="mt-2 space-y-1.5 text-sm text-text-secondary">
                {items.map((item) => (
                    <li key={item} className="flex gap-2 leading-relaxed">
                        <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-secondary" />
                        <span>{item}</span>
                    </li>
                ))}
            </ul>
        </div>
    );
}

function getProgressWidth(progress) {
    if (typeof progress?.percent === 'number') {
        return `${progress.percent}%`;
    }

    if (progress?.total > 0 && progress?.current >= 0) {
        return `${Math.min(100, Math.max(8, (progress.current / progress.total) * 100))}%`;
    }

    return '35%';
}

function getProcessingOverview(progress) {
    const stage = progress?.stage;

    if (stage === 'loading_model') {
        return {
            title: 'Preparing local AI',
            detail: 'Loading the on-device model and WebGPU shaders.'
        };
    }

    if (stage === 'chunking') {
        return {
            title: 'Reading the entry',
            detail: 'Splitting the journal text into manageable local chunks.'
        };
    }

    if (stage === 'summarising_chunks' || stage === 'generating') {
        return {
            title: 'Writing the summary',
            detail: progress?.total > 1
                ? `Processing chunk ${progress.current || 1} of ${progress.total}.`
                : 'Extracting events, tasks, mood, and key points.'
        };
    }

    if (stage === 'retrying_json') {
        return {
            title: 'Cleaning the format',
            detail: 'Retrying with stricter JSON instructions.'
        };
    }

    if (stage === 'json_fallback') {
        return {
            title: 'Using a safe fallback',
            detail: 'The model output was messy, so the app is preserving a conservative local summary.'
        };
    }

    if (stage === 'combining') {
        return {
            title: 'Combining notes',
            detail: 'Merging chunk summaries into one structured result.'
        };
    }

    return {
        title: 'Starting local summary',
        detail: 'Your entry stays in this browser.'
    };
}

function getStepState(progress, step) {
    const order = ['loading_model', 'chunking', 'summarising_chunks', 'combining', 'complete'];
    const stage = progress?.stage === 'generating' ? 'summarising_chunks' : progress?.stage;
    const currentIndex = order.indexOf(stage);
    const stepIndex = order.indexOf(step);

    if (currentIndex === -1 || stepIndex === -1) return 'pending';
    if (stepIndex < currentIndex) return 'done';
    if (stepIndex === currentIndex) return 'active';
    return 'pending';
}

function ProcessingStep({ icon, label, state }) {
    return (
        <div className={`flex min-w-0 items-center gap-2 rounded-lg border px-2.5 py-2 ${
            state === 'done'
                ? 'border-green-300/20 bg-green-300/10 text-green-200'
                : state === 'active'
                    ? 'border-secondary/30 bg-secondary/10 text-secondary'
                    : 'border-white/10 bg-white/5 text-text-muted'
        }`}>
            <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${
                state === 'active' ? 'bg-secondary/20 animate-pulse' : 'bg-white/5'
            }`}>
                {state === 'done' ? <CheckCircle2 className="h-3.5 w-3.5" /> : icon}
            </div>
            <span className="truncate text-[10px] font-bold uppercase tracking-widest">{label}</span>
        </div>
    );
}

function SummarySkeleton() {
    return (
        <div className="overflow-hidden rounded-lg border border-white/10 bg-white/[0.03] p-4">
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-secondary">
                <Sparkles className="h-3.5 w-3.5 animate-pulse" />
                Drafting summary
            </div>
            <div className="mt-4 space-y-3">
                <div className="h-5 w-2/5 rounded bg-white/10 animate-pulse" />
                <div className="space-y-2">
                    <div className="h-3 w-full rounded bg-white/10 animate-pulse" />
                    <div className="h-3 w-4/5 rounded bg-white/10 animate-pulse" />
                </div>
            </div>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
                {[0, 1].map(column => (
                    <div key={column} className="space-y-2 rounded-lg border border-white/5 bg-black/20 p-3">
                        <div className="h-3 w-24 rounded bg-white/10 animate-pulse" />
                        <div className="h-3 w-full rounded bg-white/10 animate-pulse" />
                        <div className="h-3 w-5/6 rounded bg-white/10 animate-pulse" />
                        <div className="h-3 w-3/4 rounded bg-white/10 animate-pulse" />
                    </div>
                ))}
            </div>
            <div className="mt-4 flex gap-2">
                <div className="h-6 w-16 rounded-full bg-white/10 animate-pulse" />
                <div className="h-6 w-20 rounded-full bg-white/10 animate-pulse" />
                <div className="h-6 w-14 rounded-full bg-white/10 animate-pulse" />
            </div>
        </div>
    );
}

function formatDebugDetails(details) {
    if (!details) return '';
    if (typeof details.text === 'string') return details.text;

    try {
        return JSON.stringify(details, null, 2);
    } catch {
        return String(details);
    }
}

function formatDebugEntry(entry) {
    const details = formatDebugDetails(entry.details);
    const header = `[${entry.time}] ${entry.level}: ${entry.message}`;
    return details ? `${header}\n${details}` : header;
}

export default function LocalSummaryPanel({ entryText, wordCount, debugTargetId, savedSummaryRecord, onSummaryGenerated }) {
    const [isSupported, setIsSupported] = useState(true);
    const [isRunning, setIsRunning] = useState(false);
    const [progress, setProgress] = useState(null);
    const [summary, setSummary] = useState(null);
    const [error, setError] = useState('');
    const [debugEntries, setDebugEntries] = useState([]);
    const [isDebugOpen, setIsDebugOpen] = useState(false);
    const [debugCopyStatus, setDebugCopyStatus] = useState('');
    const [debugTarget, setDebugTarget] = useState(null);
    const debugEndRef = useRef(null);
    const savedSummaryRecordRef = useRef(savedSummaryRecord);

    const cleanEntryText = useMemo(() => (entryText || '').trim(), [entryText]);
    const hasEntryText = cleanEntryText.length > 0;
    const processingOverview = getProcessingOverview(progress);

    useEffect(() => {
        setIsSupported(isWebGPUSupported());
    }, []);

    useEffect(() => {
        savedSummaryRecordRef.current = savedSummaryRecord;
        if (!isRunning && debugEntries.length === 0) {
            setSummary(savedSummaryRecord?.summary || null);
        }
    }, [savedSummaryRecord, isRunning, debugEntries.length]);

    useEffect(() => {
        setSummary(savedSummaryRecordRef.current?.summary || null);
        setError('');
        setProgress(null);
        setDebugEntries([]);
        setIsDebugOpen(false);
        setDebugCopyStatus('');
    }, [cleanEntryText]);

    useEffect(() => {
        if (isDebugOpen) {
            debugEndRef.current?.scrollIntoView({ block: 'end' });
        }
    }, [debugEntries, isDebugOpen]);

    useEffect(() => {
        if (!debugTargetId) {
            setDebugTarget(null);
            return;
        }

        setDebugTarget(document.getElementById(debugTargetId));
    }, [debugTargetId]);

    function addDebugEntry(entry) {
        setDebugEntries(prev => [
            ...prev.slice(-119),
            {
                id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
                time: new Date().toLocaleTimeString(),
                level: entry.level || (entry.debug ? 'debug' : 'status'),
                message: entry.message || entry.stage || 'Update',
                details: entry.details || null
            }
        ]);
    }

    function handleProgress(update) {
        if (!update?.debug) {
            setProgress(update);
        }

        if (update?.debug || update?.stage || update?.message) {
            addDebugEntry(update);
        }
    }

    async function handleSummarise() {
        setError('');
        setSummary(null);
        setProgress(null);
        setDebugEntries([]);
        setDebugCopyStatus('');
        addDebugEntry({
            level: 'info',
            message: 'Summarise locally clicked',
            details: {
                words: wordCount,
                characters: cleanEntryText.length,
                webgpu: isWebGPUSupported()
            }
        });

        if (!isWebGPUSupported()) {
            setIsSupported(false);
            const unsupportedMessage = 'Local AI summarisation is not supported on this device/browser yet. It needs WebGPU, which is still rolling out on mobile browsers.';
            setError(unsupportedMessage);
            addDebugEntry({
                level: 'error',
                message: unsupportedMessage
            });
            return;
        }

        try {
            setIsSupported(true);
            setIsRunning(true);
            const result = await summariseJournalEntry(cleanEntryText, handleProgress);
            setSummary(result);
            await onSummaryGenerated?.(result);
            addDebugEntry({
                level: 'success',
                message: 'Summary returned to UI',
                details: result
            });
        } catch (err) {
            setError(err?.message || 'The local summariser could not finish this entry.');
            addDebugEntry({
                level: 'error',
                message: err?.message || 'The local summariser could not finish this entry.'
            });
        } finally {
            setIsRunning(false);
        }
    }

    async function handleCopyDebug() {
        const debugText = debugEntries.map(formatDebugEntry).join('\n\n');

        if (!debugText) {
            setDebugCopyStatus('Nothing to copy');
            return;
        }

        try {
            await navigator.clipboard.writeText(debugText);
            setDebugCopyStatus('Copied');
        } catch {
            setDebugCopyStatus('Copy failed');
        }

        window.setTimeout(() => setDebugCopyStatus(''), 1800);
    }

    const debugTerminal = (
        <div className="mt-2 border-t border-white/10 pt-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <button
                    type="button"
                    onClick={() => setIsDebugOpen(prev => !prev)}
                    className="glass-button inline-flex items-center gap-2 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-widest text-text-muted hover:text-white"
                    aria-expanded={isDebugOpen}
                >
                    <Terminal className="h-3.5 w-3.5 text-secondary" />
                    AI debug terminal
                    <span className="rounded bg-white/10 px-1.5 py-0.5 text-[9px] text-text-muted">
                        {debugEntries.length}
                    </span>
                    {isDebugOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                </button>

                <div className="flex items-center gap-2">
                    {debugCopyStatus && (
                        <span className="text-[10px] font-bold uppercase tracking-widest text-secondary">
                            {debugCopyStatus}
                        </span>
                    )}
                    <button
                        type="button"
                        onClick={handleCopyDebug}
                        disabled={debugEntries.length === 0}
                        className="glass-button inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-widest text-text-muted hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                    >
                        <Clipboard className="h-3.5 w-3.5" />
                        Copy
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            setDebugEntries([]);
                            setDebugCopyStatus('');
                        }}
                        disabled={debugEntries.length === 0}
                        className="glass-button px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-widest text-text-muted hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                    >
                        Clear
                    </button>
                </div>
            </div>

            {isDebugOpen && (
                <div className="mt-3">
                    <div className="max-h-72 overflow-y-auto rounded-lg border border-white/10 bg-black/70 p-3 font-mono text-[11px] leading-relaxed text-green-100 shadow-inner custom-scrollbar">
                        {debugEntries.length === 0 ? (
                            <div className="text-text-muted">No AI processing logs yet.</div>
                        ) : debugEntries.map(entry => {
                            const details = formatDebugDetails(entry.details);

                            return (
                                <div key={entry.id} className="mb-3 last:mb-0">
                                    <div className="flex flex-wrap items-center gap-2 text-green-300">
                                        <span className="text-text-muted">[{entry.time}]</span>
                                        <span className={
                                            entry.level === 'error' ? 'text-red-300' :
                                                entry.level === 'fallback' ? 'text-amber-300' :
                                                    entry.level === 'raw' ? 'text-cyan-300' :
                                                        entry.level === 'success' ? 'text-green-300' :
                                                            'text-secondary'
                                        }>
                                            {entry.level}
                                        </span>
                                        <span>{entry.message}</span>
                                    </div>
                                    {details && (
                                        <pre className="mt-1 whitespace-pre-wrap break-words rounded border border-white/5 bg-white/5 p-2 text-green-50/90">
                                            {details}
                                        </pre>
                                    )}
                                </div>
                            );
                        })}
                        <div ref={debugEndRef} />
                    </div>
                    <p className="mt-2 text-[10px] leading-relaxed text-text-muted">
                        Debug output is local to this browser and may include raw model text derived from this journal entry.
                    </p>
                </div>
            )}
        </div>
    );

    return (
        <>
            <section className="mb-6 border-y border-white/10 py-4" aria-label="Local AI journal summary">
                <div className="flex flex-col gap-4">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-start gap-3">
                        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-secondary/30 bg-secondary/10 text-secondary">
                            <LockKeyhole className="h-4 w-4" />
                        </div>
                        <div>
                            <p className="text-sm font-bold text-white">Private local AI</p>
                            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-text-muted">
                                Summaries run in this browser with WebGPU. Your journal text is not sent to a server.
                            </p>
                            {wordCount > 0 && (
                                <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-text-muted/70">
                                    {wordCount} words
                                </p>
                            )}
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={handleSummarise}
                        disabled={isRunning || !hasEntryText || !isSupported}
                        className="glass-button inline-flex min-h-10 items-center justify-center gap-2 px-4 py-2 text-sm font-bold text-secondary hover:border-secondary/30 hover:bg-secondary/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {isRunning ? <Loader className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                        {isRunning ? 'Summarising...' : 'Summarise locally'}
                    </button>
                </div>

                {!isSupported && (
                    <div className="flex items-start gap-2 rounded-lg border border-amber-400/20 bg-amber-400/10 p-3 text-sm text-amber-100">
                        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                        <p>Local AI summarisation is not supported on this device/browser yet.</p>
                    </div>
                )}

                {isRunning && (
                    <div className="overflow-hidden rounded-lg border border-secondary/20 bg-gradient-to-br from-secondary/10 via-white/5 to-primary/10 p-4 shadow-lg shadow-secondary/5" aria-live="polite">
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                            <div className="flex min-w-0 items-start gap-3">
                                <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-secondary/30 bg-black/30 text-secondary">
                                    <WandSparkles className="h-5 w-5" />
                                    <span className="absolute inset-0 rounded-lg border border-secondary/30 animate-ping opacity-30" />
                                </div>
                                <div className="min-w-0">
                                    <p className="text-sm font-bold text-white">{processingOverview.title}</p>
                                    <p className="mt-1 text-xs leading-relaxed text-text-muted">{processingOverview.detail}</p>
                                </div>
                            </div>

                            {progress?.total > 0 && (
                                <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs font-mono text-text-muted">
                                    {progress.current}/{progress.total}
                                </div>
                            )}
                        </div>

                        <div className="mt-4 grid gap-2 sm:grid-cols-4">
                            <ProcessingStep icon={<Cpu className="h-3.5 w-3.5" />} label="Load" state={getStepState(progress, 'loading_model')} />
                            <ProcessingStep icon={<FileText className="h-3.5 w-3.5" />} label="Read" state={getStepState(progress, 'chunking')} />
                            <ProcessingStep icon={<Sparkles className="h-3.5 w-3.5" />} label="Draft" state={getStepState(progress, 'summarising_chunks')} />
                            <ProcessingStep icon={<ListChecks className="h-3.5 w-3.5" />} label="Merge" state={getStepState(progress, 'combining')} />
                        </div>

                        <div className="relative mt-4 h-2 overflow-hidden rounded-full bg-black/40">
                            <div
                                className="h-full rounded-full bg-gradient-to-r from-secondary via-white to-primary shadow-[0_0_18px_rgba(6,182,212,0.45)] transition-all duration-500 ease-out"
                                style={{ width: getProgressWidth(progress) }}
                            />
                            <div className="absolute inset-y-0 left-0 w-1/3 animate-shimmer bg-gradient-to-r from-transparent via-white/40 to-transparent" />
                        </div>
                    </div>
                )}

                {error && (
                    <div className="flex items-start gap-2 rounded-lg border border-red-400/20 bg-red-400/10 p-3 text-sm text-red-100" role="alert">
                        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                        <p>{error}</p>
                    </div>
                )}

                {summary && (
                    <div className="border-t border-white/10 pt-4">
                        <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-green-300">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Local summary ready
                        </div>

                        <div className="mt-3">
                            <h3 className="text-xl font-serif font-bold text-white">{summary.title || 'Journal summary'}</h3>
                            {summary.short_summary && (
                                <p className="mt-2 max-w-3xl text-sm leading-relaxed text-text-secondary">
                                    {summary.short_summary}
                                </p>
                            )}
                        </div>

                        <div className="mt-5 grid gap-5 md:grid-cols-2">
                            <SummaryList title="Key points" items={summary.key_points} />
                            <SummaryList title="Tasks" items={summary.tasks} />
                        </div>

                        {(summary.mood || summary.tags?.length > 0) && (
                            <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-white/5 pt-4 text-sm">
                                {summary.mood && (
                                    <div className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-text-secondary">
                                        <ListChecks className="h-3.5 w-3.5 text-primary" />
                                        <span>{summary.mood}</span>
                                    </div>
                                )}
                                {summary.tags?.map((tag) => (
                                    <span
                                        key={tag}
                                        className="inline-flex items-center gap-1.5 rounded-full border border-secondary/20 bg-secondary/10 px-2.5 py-1 text-xs font-bold text-secondary"
                                    >
                                        <Tags className="h-3 w-3" />
                                        {tag}
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {isRunning && !summary && <SummarySkeleton />}

                </div>
                {!debugTarget && debugTerminal}
            </section>
            {debugTarget ? createPortal(debugTerminal, debugTarget) : null}
        </>
    );
}
