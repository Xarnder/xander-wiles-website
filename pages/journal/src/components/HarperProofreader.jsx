import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, ChevronUp, Loader, RefreshCw, ShieldCheck, Sparkles } from 'lucide-react';
import {
    addHarperWord,
    applyHarperSuggestion,
    checkWithHarper,
    releaseHarperIssues
} from '../lib/harperProofreader';

const MAX_VISIBLE_ISSUES = 5;

function isSpellingIssue(issue) {
    return /spell|typo/i.test(issue.kind);
}

export default function HarperProofreader({ text, onTextChange, editor }) {
    const [result, setResult] = useState({ source: '', issues: [] });
    const [checking, setChecking] = useState(false);
    const [error, setError] = useState('');
    const [applyingId, setApplyingId] = useState('');
    const [showAll, setShowAll] = useState(false);
    const issuesRef = useRef([]);
    const marksRef = useRef([]);
    const requestRef = useRef(0);
    const mountedRef = useRef(true);

    const replaceIssues = useCallback((source, issues) => {
        releaseHarperIssues(issuesRef.current);
        issuesRef.current = issues;
        setResult({ source, issues });
    }, []);

    const performCheck = useCallback(async (source, requestId) => {
        if (source.trim().length < 3) {
            if (mountedRef.current && requestId === requestRef.current) {
                replaceIssues(source, []);
                setChecking(false);
                setError('');
            }
            return;
        }

        setChecking(true);
        setError('');

        try {
            const issues = await checkWithHarper(source);

            if (!mountedRef.current || requestId !== requestRef.current) {
                releaseHarperIssues(issues);
                return;
            }

            replaceIssues(source, issues);
        } catch (checkError) {
            console.error('Harper check failed', checkError);
            if (mountedRef.current && requestId === requestRef.current) {
                setError('Harper could not start. Native iOS spelling support is still on.');
            }
        } finally {
            if (mountedRef.current && requestId === requestRef.current) {
                setChecking(false);
            }
        }
    }, [replaceIssues]);

    useEffect(() => {
        const requestId = ++requestRef.current;
        const delay = text.trim().length < 3 ? 0 : 700;
        const timer = window.setTimeout(() => {
            void performCheck(text, requestId);
        }, delay);

        return () => window.clearTimeout(timer);
    }, [performCheck, text]);

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
            requestRef.current += 1;
            releaseHarperIssues(issuesRef.current);
            issuesRef.current = [];
        };
    }, []);

    const visibleIssues = useMemo(
        () => (result.source === text ? result.issues : []),
        [result.issues, result.source, text]
    );
    const displayedIssues = showAll ? visibleIssues : visibleIssues.slice(0, MAX_VISIBLE_ISSUES);
    const hiddenIssueCount = visibleIssues.length - displayedIssues.length;

    useEffect(() => {
        marksRef.current.forEach((mark) => mark.clear());
        marksRef.current = [];

        if (!editor || result.source !== text) return undefined;

        marksRef.current = visibleIssues
            .filter((issue) => issue.end > issue.start)
            .map((issue) => editor.markText(
                editor.posFromIndex(issue.start),
                editor.posFromIndex(issue.end),
                {
                    className: isSpellingIssue(issue) ? 'cm-harper-spelling' : 'cm-harper-grammar',
                    title: issue.message
                }
            ));

        return () => {
            marksRef.current.forEach((mark) => mark.clear());
            marksRef.current = [];
        };
    }, [editor, result.source, text, visibleIssues]);

    const status = useMemo(() => {
        if (checking) return 'Checking your writing…';
        if (error) return 'Harper unavailable';
        if (text.trim().length < 3) return 'Ready when you start writing';
        if (result.source !== text) return 'Checks after you pause';
        if (visibleIssues.length === 0) return 'No suggestions right now';
        return `${visibleIssues.length} ${visibleIssues.length === 1 ? 'suggestion' : 'suggestions'}`;
    }, [checking, error, result.source, text, visibleIssues.length]);

    const selectIssue = (issue) => {
        if (!editor) return;

        const from = editor.posFromIndex(issue.start);
        const to = editor.posFromIndex(issue.end);
        editor.setSelection(from, to);
        editor.scrollIntoView({ from, to }, 80);
        editor.focus();
    };

    const handleApply = async (issue, suggestion) => {
        if (result.source !== text) return;

        const actionId = `${issue.id}-${suggestion.id}`;
        setApplyingId(actionId);
        setError('');

        try {
            const updatedText = await applyHarperSuggestion(text, issue, suggestion);
            const cursorIndex = issue.start + suggestion.replacement.length;

            replaceIssues(updatedText, []);
            onTextChange(updatedText);

            window.requestAnimationFrame(() => {
                if (!editor) return;
                editor.setCursor(editor.posFromIndex(cursorIndex));
                editor.focus();
            });
        } catch (applyError) {
            console.error('Could not apply Harper suggestion', applyError);
            setError('That suggestion could not be applied. Your writing was not changed.');
        } finally {
            if (mountedRef.current) setApplyingId('');
        }
    };

    const handleLearnWord = async (issue) => {
        const word = issue.problemText.trim();
        if (!word || /\s/.test(word)) return;

        setApplyingId(`learn-${issue.id}`);
        setError('');

        try {
            await addHarperWord(word);
            replaceIssues('', []);
            const requestId = ++requestRef.current;
            await performCheck(text, requestId);
        } catch (learnError) {
            console.error('Could not add word to Harper', learnError);
            setError('That word could not be added to the on-device dictionary.');
        } finally {
            if (mountedRef.current) setApplyingId('');
        }
    };

    const handleCheckNow = () => {
        const requestId = ++requestRef.current;
        void performCheck(text, requestId);
    };

    return (
        <section className="mt-3 overflow-hidden rounded-xl border border-emerald-400/20 bg-emerald-400/[0.05]" aria-label="Writing assistance">
            <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 sm:px-4">
                <div className="flex min-w-0 items-center gap-2.5">
                    <div className="rounded-lg bg-emerald-400/10 p-1.5 text-emerald-300">
                        <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                    </div>
                    <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                            <h3 className="text-xs font-bold uppercase tracking-widest text-text">Writing assistance</h3>
                            <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-emerald-300">
                                On-device
                            </span>
                        </div>
                        <p className="truncate text-[11px] text-text-muted" aria-live="polite">{status}</p>
                    </div>
                </div>
                <button
                    type="button"
                    onClick={handleCheckNow}
                    disabled={checking || text.trim().length < 3}
                    className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-[11px] font-semibold text-text-secondary transition-colors hover:border-emerald-400/30 hover:text-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"
                >
                    {checking ? <Loader className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                    Check now
                </button>
            </div>

            {error && (
                <p className="border-t border-amber-400/15 bg-amber-400/[0.06] px-3 py-2 text-xs text-amber-300 sm:px-4" role="status">
                    {error}
                </p>
            )}

            {!checking && !error && result.source === text && visibleIssues.length === 0 && text.trim().length >= 3 && (
                <div className="flex items-center gap-2 border-t border-emerald-400/10 px-3 py-2.5 text-xs text-emerald-300 sm:px-4">
                    <Check className="h-4 w-4" aria-hidden="true" />
                    Harper found no spelling or grammar suggestions.
                </div>
            )}

            {displayedIssues.length > 0 && (
                <div className="space-y-2 border-t border-emerald-400/10 p-2.5 sm:p-3">
                    {displayedIssues.map((issue) => (
                        <article key={issue.id} className="rounded-lg border border-white/10 bg-black/20 p-2.5 sm:p-3">
                            <div className="flex flex-wrap items-start justify-between gap-2">
                                <button
                                    type="button"
                                    onClick={() => selectIssue(issue)}
                                    className="min-w-0 text-left"
                                    title="Select this text in the editor"
                                >
                                    <span className="block break-words text-sm font-semibold text-red-300 underline decoration-wavy underline-offset-4">
                                        {issue.problemText || 'Missing text'}
                                    </span>
                                    <span className="mt-1 block text-xs leading-relaxed text-text-secondary">{issue.message}</span>
                                </button>
                                <span className="shrink-0 rounded-full bg-white/5 px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-text-muted">
                                    {issue.kind}
                                </span>
                            </div>

                            <div className="mt-2.5 flex flex-wrap gap-2">
                                {issue.suggestions.map((suggestion) => {
                                    const actionId = `${issue.id}-${suggestion.id}`;
                                    return (
                                        <button
                                            key={suggestion.id}
                                            type="button"
                                            onClick={() => void handleApply(issue, suggestion)}
                                            disabled={Boolean(applyingId)}
                                            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-emerald-500/15 px-3 py-1.5 text-xs font-semibold text-emerald-300 transition-colors hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-50"
                                        >
                                            {applyingId === actionId && <Loader className="h-3.5 w-3.5 animate-spin" />}
                                            {suggestion.replacement || 'Remove'}
                                        </button>
                                    );
                                })}
                                {isSpellingIssue(issue) && issue.problemText && !/\s/.test(issue.problemText.trim()) && (
                                    <button
                                        type="button"
                                        onClick={() => void handleLearnWord(issue)}
                                        disabled={Boolean(applyingId)}
                                        className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-text-secondary transition-colors hover:border-primary/30 hover:text-text disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                        {applyingId === `learn-${issue.id}` && <Loader className="h-3.5 w-3.5 animate-spin" />}
                                        Learn word
                                    </button>
                                )}
                            </div>
                        </article>
                    ))}

                    {(hiddenIssueCount > 0 || showAll) && visibleIssues.length > MAX_VISIBLE_ISSUES && (
                        <button
                            type="button"
                            onClick={() => setShowAll((current) => !current)}
                            className="flex min-h-9 w-full items-center justify-center gap-1.5 rounded-lg text-xs font-semibold text-text-muted transition-colors hover:bg-white/5 hover:text-text"
                        >
                            {showAll ? (
                                <>
                                    <ChevronUp className="h-4 w-4" />
                                    Show fewer
                                </>
                            ) : (
                                <>
                                    <ChevronDown className="h-4 w-4" />
                                    Show {hiddenIssueCount} more
                                </>
                            )}
                        </button>
                    )}
                </div>
            )}

            <div className="flex items-start gap-2 border-t border-white/5 px-3 py-2 text-[10px] leading-relaxed text-text-muted sm:px-4">
                <Sparkles className="mt-0.5 h-3 w-3 shrink-0 text-primary" aria-hidden="true" />
                Harper runs privately in a background worker. Native iOS autocorrect, capitalisation and spellcheck are also enabled.
            </div>
        </section>
    );
}
