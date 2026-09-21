import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { db } from '../firebase';
import { collection, query, where, getDocs, documentId, orderBy, doc, onSnapshot } from 'firebase/firestore';
import { format, parseISO, isValid, differenceInDays, addMonths, subMonths } from 'date-fns';
import {
    Clipboard,
    Copy,
    Check,
    Calendar,
    ArrowUpDown,
    FileText,
    FileDown,
    ChevronLeft,
    ChevronRight,
    RefreshCw,
    SlidersHorizontal,
    CheckCircle2
} from 'lucide-react';
import { saveAs } from 'file-saver';
import {
    ENTRY_SECTIONS_SETTINGS_DOC,
    normalizeEntrySections,
    normalizeNumericEntryFields
} from '../utils/entrySections';
import {
    getDateRangeForPreset,
    combineEntries,
    countWords,
    copyTextToClipboard
} from '../utils/clipboardExport';

const REQUEST_TIMEOUT_MS = 12000;
const REQUEST_TIMEOUT_CODE = 'journal/clipboard-timeout';

function withTimeout(promise, timeoutMs = REQUEST_TIMEOUT_MS) {
    let timeoutId;
    return Promise.race([
        promise,
        new Promise((_, reject) => {
            timeoutId = window.setTimeout(() => {
                const error = new Error('Entries request timed out');
                error.code = REQUEST_TIMEOUT_CODE;
                reject(error);
            }, timeoutMs);
        })
    ]).finally(() => window.clearTimeout(timeoutId));
}

const PRESETS = [
    { id: 'current-week', label: 'Current Week' },
    { id: 'last-7-days', label: 'Last 7 Days' },
    { id: 'current-month-so-far', label: 'Month So Far' },
    { id: 'whole-month', label: 'Whole Month' },
    { id: 'last-6-months', label: 'Last 6 Months' },
    { id: 'custom', label: 'Pick Two Dates' }
];

export default function ClipboardView() {
    const { currentUser } = useAuth();
    const { success: toastSuccess, error: toastError } = useToast();

    // Range selection state
    const [preset, setPreset] = useState('current-month-so-far');
    const [selectedMonth, setSelectedMonth] = useState(format(new Date(), 'yyyy-MM'));
    const [customStart, setCustomStart] = useState(format(new Date(), 'yyyy-MM-01'));
    const [customEnd, setCustomEnd] = useState(format(new Date(), 'yyyy-MM-dd'));

    // Formatting & Option states
    const [outputFormat, setOutputFormat] = useState('text'); // 'text' | 'markdown'
    const [sortOrder, setSortOrder] = useState('asc'); // 'asc' | 'desc'
    const [includeMetadata, setIncludeMetadata] = useState(true);
    const [includeSubEntries, setIncludeSubEntries] = useState(true);
    const [includeNumeric, setIncludeNumeric] = useState(true);
    const [includeImages, setIncludeImages] = useState(true);
    const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);

    // Data states
    const [entries, setEntries] = useState([]);
    const [loading, setLoading] = useState(false);
    const [loadError, setLoadError] = useState('');
    const [copied, setCopied] = useState(false);
    const [reloadKey, setReloadKey] = useState(0);

    // Metadata lookups
    const [tagDefinitions, setTagDefinitions] = useState({});
    const [entrySections, setEntrySections] = useState([]);
    const [numericFields, setNumericFields] = useState([]);

    const copyFeedbackTimerRef = useRef(null);

    // Calculate current effective date range
    const activeRange = useMemo(() => {
        return getDateRangeForPreset(preset, {
            selectedMonth,
            customStart,
            customEnd
        });
    }, [preset, selectedMonth, customStart, customEnd]);

    // Load tag definitions
    useEffect(() => {
        if (!currentUser) return;
        let isMounted = true;

        async function fetchTags() {
            try {
                const tagsRef = collection(db, 'users', currentUser.uid, 'tags');
                const snapshot = await getDocs(tagsRef);
                if (!isMounted) return;
                const map = {};
                snapshot.forEach(docSnap => {
                    map[docSnap.id] = docSnap.data();
                });
                setTagDefinitions(map);
            } catch (err) {
                console.error('Failed to load tag definitions for clipboard:', err);
            }
        }

        fetchTags();
        return () => { isMounted = false; };
    }, [currentUser]);

    // Load entry sections & numeric fields settings
    useEffect(() => {
        if (!currentUser) return;

        const settingsRef = doc(db, 'users', currentUser.uid, 'settings', ENTRY_SECTIONS_SETTINGS_DOC);
        const unsubscribe = onSnapshot(settingsRef, (snapshot) => {
            const data = snapshot.data() || {};
            setEntrySections(normalizeEntrySections(data.sections));
            setNumericFields(normalizeNumericEntryFields(data.numericFields));
        }, (err) => {
            console.error('Failed to load entry section settings for clipboard:', err);
        });

        return () => unsubscribe();
    }, [currentUser]);

    const entrySectionNameById = useMemo(() => {
        return entrySections.reduce((acc, sec) => {
            acc[sec.id] = sec.name;
            return acc;
        }, {});
    }, [entrySections]);

    const numericFieldNameById = useMemo(() => {
        return numericFields.reduce((acc, field) => {
            acc[field.id] = field.name;
            return acc;
        }, {});
    }, [numericFields]);

    // Fetch entries within active range
    useEffect(() => {
        if (!currentUser) {
            setEntries([]);
            setLoading(false);
            return;
        }

        if (!activeRange.start || !activeRange.end) {
            setEntries([]);
            setLoading(false);
            return;
        }

        let isCurrent = true;
        setLoading(true);
        setLoadError('');

        async function loadEntries() {
            try {
                const entriesRef = collection(db, 'users', currentUser.uid, 'entries');
                const q = query(
                    entriesRef,
                    where(documentId(), '>=', activeRange.start),
                    where(documentId(), '<=', activeRange.end),
                    orderBy(documentId(), 'asc')
                );

                const snapshot = await withTimeout(getDocs(q));

                if (!isCurrent) return;

                const loaded = [];
                snapshot.forEach(docSnap => {
                    const data = docSnap.data();
                    // Keep entries that have some content, title, sub-entries, or images
                    const hasContent = Boolean(
                        (data.content && data.content.trim().length > 0) ||
                        (data.text && data.text.trim().length > 0) ||
                        (data.title && data.title.trim().length > 0) ||
                        (data.images && data.images.length > 0) ||
                        (data.imageUrl) ||
                        (data.subEntries && Object.keys(data.subEntries).length > 0) ||
                        (data.numericEntries && Object.keys(data.numericEntries).length > 0)
                    );

                    if (hasContent) {
                        loaded.push({
                            id: docSnap.id,
                            ...data
                        });
                    }
                });

                setEntries(loaded);
            } catch (err) {
                if (!isCurrent) return;
                console.error('Error fetching entries for clipboard:', err);
                if (err?.code === REQUEST_TIMEOUT_CODE) {
                    setLoadError('Loading entries timed out. Check your connection and try again.');
                } else {
                    setLoadError('Failed to load entries for the selected range. Please try again.');
                }
            } finally {
                if (isCurrent) {
                    setLoading(false);
                }
            }
        }

        loadEntries();

        return () => {
            isCurrent = false;
        };
    }, [currentUser, activeRange.start, activeRange.end, reloadKey]);

    // Format options object
    const formatOptions = useMemo(() => ({
        includeMetadata,
        includeSubEntries,
        includeNumeric,
        includeImages,
        sortOrder,
        tagDefinitions,
        entrySectionNameById,
        numericFieldNameById
    }), [
        includeMetadata,
        includeSubEntries,
        includeNumeric,
        includeImages,
        sortOrder,
        tagDefinitions,
        entrySectionNameById,
        numericFieldNameById
    ]);

    // Combined output string
    const combinedText = useMemo(() => {
        return combineEntries(entries, outputFormat, formatOptions);
    }, [entries, outputFormat, formatOptions]);

    const totalWords = useMemo(() => countWords(combinedText), [combinedText]);
    const totalChars = useMemo(() => combinedText.length, [combinedText]);

    // Days span calculation
    const totalDaysSpan = useMemo(() => {
        if (!activeRange.start || !activeRange.end) return 0;
        try {
            const start = parseISO(activeRange.start);
            const end = parseISO(activeRange.end);
            return Math.abs(differenceInDays(end, start)) + 1;
        } catch {
            return 0;
        }
    }, [activeRange]);

    // Handle Big Copy to Clipboard
    async function handleCopyToClipboard() {
        if (!combinedText || entries.length === 0) {
            toastError('No entries to copy for the selected date range.');
            return;
        }

        const success = await copyTextToClipboard(combinedText);
        if (success) {
            setCopied(true);
            toastSuccess(`Copied ${entries.length} ${entries.length === 1 ? 'entry' : 'entries'} (${totalWords.toLocaleString()} words) to clipboard!`);

            if (copyFeedbackTimerRef.current) {
                clearTimeout(copyFeedbackTimerRef.current);
            }
            copyFeedbackTimerRef.current = setTimeout(() => {
                setCopied(false);
            }, 2500);
        } else {
            toastError('Failed to copy to clipboard. Please allow clipboard permissions or download the file instead.');
        }
    }

    // Handle Download as File
    function handleDownload(formatToDownload) {
        if (!combinedText || entries.length === 0) {
            toastError('No entries to download for the selected date range.');
            return;
        }

        const contentToSave = formatToDownload === outputFormat
            ? combinedText
            : combineEntries(entries, formatToDownload, formatOptions);

        const ext = formatToDownload === 'markdown' ? 'md' : 'txt';
        const mime = formatToDownload === 'markdown' ? 'text/markdown;charset=utf-8' : 'text/plain;charset=utf-8';
        const filename = `journal-entries_${activeRange.start}_to_${activeRange.end}.${ext}`;

        const blob = new Blob([contentToSave], { type: mime });
        saveAs(blob, filename);
        toastSuccess(`Downloaded ${filename}`);
    }

    // Month navigation helpers for 'whole-month'
    function handlePrevMonth() {
        try {
            const current = parseISO(`${selectedMonth}-01`);
            const prev = subMonths(current, 1);
            setSelectedMonth(format(prev, 'yyyy-MM'));
        } catch (e) {
            console.error('Error going to previous month:', e);
        }
    }

    function handleNextMonth() {
        try {
            const current = parseISO(`${selectedMonth}-01`);
            const next = addMonths(current, 1);
            setSelectedMonth(format(next, 'yyyy-MM'));
        } catch (e) {
            console.error('Error going to next month:', e);
        }
    }

    // Clean human-friendly date range label
    const formattedRangeSummary = useMemo(() => {
        try {
            const start = parseISO(activeRange.start);
            const end = parseISO(activeRange.end);
            if (isValid(start) && isValid(end)) {
                return `${format(start, 'd MMM yyyy')} – ${format(end, 'd MMM yyyy')}`;
            }
        } catch {
            // fallback
        }
        return `${activeRange.start} – ${activeRange.end}`;
    }, [activeRange]);

    return (
        <div className="space-y-6 max-w-7xl mx-auto animation-fade-in pb-12">
            {/* Page Header */}
            <div className="glass-card p-5 sm:p-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-primary/15 rounded-xl border border-primary/20 text-primary">
                            <Clipboard className="w-6 h-6" />
                        </div>
                        <div>
                            <h1 className="text-xl sm:text-2xl font-serif font-bold text-white">
                                Journal Clipboard
                            </h1>
                            <p className="text-sm text-text-muted">
                                Select a date range to copy multiple entries in one go, or download as text or markdown.
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-primary/10 border border-primary/20 text-primary">
                            <Calendar className="w-3.5 h-3.5" />
                            {formattedRangeSummary} ({totalDaysSpan} {totalDaysSpan === 1 ? 'day' : 'days'})
                        </span>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                {/* Controls & Configuration Column */}
                <div className="lg:col-span-5 space-y-6">
                    {/* Preset Range Selector */}
                    <div className="glass-card p-5">
                        <h2 className="text-base font-bold text-white mb-3 flex items-center gap-2">
                            <Calendar className="w-4 h-4 text-primary" />
                            Choose Date Range
                        </h2>

                        {/* Preset buttons */}
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
                            {PRESETS.map((p) => {
                                const isActive = preset === p.id;
                                return (
                                    <button
                                        key={p.id}
                                        type="button"
                                        onClick={() => setPreset(p.id)}
                                        className={`px-3 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all text-center ${
                                            isActive
                                                ? 'bg-primary text-white shadow-md shadow-primary/30 border border-primary'
                                                : 'bg-white/5 text-text-muted hover:bg-white/10 hover:text-white border border-transparent'
                                        }`}
                                    >
                                        {p.label}
                                    </button>
                                );
                            })}
                        </div>

                        {/* Contextual Input: Whole Month */}
                        {preset === 'whole-month' && (
                            <div className="mt-3 pt-3 border-t border-white/10 space-y-2">
                                <label className="block text-xs font-medium text-text-muted">
                                    Select Month
                                </label>
                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={handlePrevMonth}
                                        className="p-2 glass-button text-text-muted hover:text-white rounded-lg"
                                        title="Previous Month"
                                        aria-label="Previous Month"
                                    >
                                        <ChevronLeft className="w-4 h-4" />
                                    </button>
                                    <input
                                        type="month"
                                        value={selectedMonth}
                                        onChange={(e) => setSelectedMonth(e.target.value)}
                                        className="flex-1 glass-input text-sm py-1.5 px-3"
                                    />
                                    <button
                                        type="button"
                                        onClick={handleNextMonth}
                                        className="p-2 glass-button text-text-muted hover:text-white rounded-lg"
                                        title="Next Month"
                                        aria-label="Next Month"
                                    >
                                        <ChevronRight className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Contextual Input: Pick Two Dates */}
                        {preset === 'custom' && (
                            <div className="mt-3 pt-3 border-t border-white/10 grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-medium text-text-muted mb-1">
                                        Start Date
                                    </label>
                                    <input
                                        type="date"
                                        value={customStart}
                                        onChange={(e) => setCustomStart(e.target.value)}
                                        className="w-full glass-input text-sm py-1.5 px-2.5"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-text-muted mb-1">
                                        End Date
                                    </label>
                                    <input
                                        type="date"
                                        value={customEnd}
                                        onChange={(e) => setCustomEnd(e.target.value)}
                                        className="w-full glass-input text-sm py-1.5 px-2.5"
                                    />
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Output Format & Ordering */}
                    <div className="glass-card p-5">
                        <div className="flex items-center justify-between mb-3">
                            <h2 className="text-base font-bold text-white flex items-center gap-2">
                                <FileText className="w-4 h-4 text-primary" />
                                Format & Layout
                            </h2>
                            <button
                                type="button"
                                onClick={() => setShowAdvancedOptions(!showAdvancedOptions)}
                                className="text-xs text-primary hover:underline flex items-center gap-1"
                            >
                                <SlidersHorizontal className="w-3.5 h-3.5" />
                                {showAdvancedOptions ? 'Less Options' : 'More Options'}
                            </button>
                        </div>

                        {/* Text vs Markdown switch */}
                        <div className="flex bg-white/5 p-1 rounded-lg mb-4">
                            <button
                                type="button"
                                onClick={() => setOutputFormat('text')}
                                className={`flex-1 py-1.5 px-3 rounded-md text-xs sm:text-sm font-medium transition-all ${
                                    outputFormat === 'text'
                                        ? 'bg-primary text-white shadow-md'
                                        : 'text-text-muted hover:text-white'
                                }`}
                            >
                                Plain Text (.txt)
                            </button>
                            <button
                                type="button"
                                onClick={() => setOutputFormat('markdown')}
                                className={`flex-1 py-1.5 px-3 rounded-md text-xs sm:text-sm font-medium transition-all ${
                                    outputFormat === 'markdown'
                                        ? 'bg-primary text-white shadow-md'
                                        : 'text-text-muted hover:text-white'
                                }`}
                            >
                                Markdown (.md)
                            </button>
                        </div>

                        {/* Chronological order */}
                        <div className="flex items-center justify-between py-2 border-b border-white/5 text-sm">
                            <span className="text-text-muted flex items-center gap-1.5">
                                <ArrowUpDown className="w-4 h-4 text-text-muted" />
                                Entry Order
                            </span>
                            <div className="flex bg-white/5 p-0.5 rounded-lg">
                                <button
                                    type="button"
                                    onClick={() => setSortOrder('asc')}
                                    className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                                        sortOrder === 'asc' ? 'bg-primary text-white' : 'text-text-muted hover:text-white'
                                    }`}
                                >
                                    Oldest First
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setSortOrder('desc')}
                                    className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                                        sortOrder === 'desc' ? 'bg-primary text-white' : 'text-text-muted hover:text-white'
                                    }`}
                                >
                                    Newest First
                                </button>
                            </div>
                        </div>

                        {/* Advanced Toggles */}
                        {showAdvancedOptions && (
                            <div className="pt-3 space-y-3 animation-fade-in text-sm">
                                <label className="flex items-center justify-between cursor-pointer">
                                    <span className="text-text-muted">Include Tags, Mood & Special Day</span>
                                    <input
                                        type="checkbox"
                                        checked={includeMetadata}
                                        onChange={(e) => setIncludeMetadata(e.target.checked)}
                                        className="w-4 h-4 accent-primary rounded cursor-pointer"
                                    />
                                </label>

                                <label className="flex items-center justify-between cursor-pointer">
                                    <span className="text-text-muted">Include Custom Sections</span>
                                    <input
                                        type="checkbox"
                                        checked={includeSubEntries}
                                        onChange={(e) => setIncludeSubEntries(e.target.checked)}
                                        className="w-4 h-4 accent-primary rounded cursor-pointer"
                                    />
                                </label>

                                <label className="flex items-center justify-between cursor-pointer">
                                    <span className="text-text-muted">Include Numerical Inputs</span>
                                    <input
                                        type="checkbox"
                                        checked={includeNumeric}
                                        onChange={(e) => setIncludeNumeric(e.target.checked)}
                                        className="w-4 h-4 accent-primary rounded cursor-pointer"
                                    />
                                </label>

                                <label className="flex items-center justify-between cursor-pointer">
                                    <span className="text-text-muted">Include Attachments / Captions</span>
                                    <input
                                        type="checkbox"
                                        checked={includeImages}
                                        onChange={(e) => setIncludeImages(e.target.checked)}
                                        className="w-4 h-4 accent-primary rounded cursor-pointer"
                                    />
                                </label>
                            </div>
                        )}
                    </div>

                    {/* BIG COPY BUTTON & Downloads Card */}
                    <div className="glass-card p-5 space-y-4">
                        {/* BIG COPY TO CLIPBOARD BUTTON */}
                        <button
                            type="button"
                            onClick={handleCopyToClipboard}
                            disabled={loading || entries.length === 0}
                            className={`w-full py-4 px-6 rounded-xl font-bold text-white transition-all flex flex-col items-center justify-center gap-1 shadow-lg relative overflow-hidden group ${
                                loading || entries.length === 0
                                    ? 'bg-white/10 opacity-50 cursor-not-allowed'
                                    : copied
                                        ? 'bg-green-600 shadow-green-600/30'
                                        : 'bg-gradient-to-r from-primary to-secondary hover:from-primary/95 hover:to-secondary/95 shadow-primary/30 hover:shadow-primary/50 hover:scale-[1.01] active:scale-[0.99]'
                            }`}
                        >
                            <div className="flex items-center gap-2.5 text-base sm:text-lg">
                                {copied ? (
                                    <>
                                        <Check className="w-6 h-6 text-white stroke-[3] animate-bounce" />
                                        <span>Copied to Clipboard!</span>
                                    </>
                                ) : (
                                    <>
                                        <Copy className="w-5 h-5 text-white" />
                                        <span>Copy All to Clipboard</span>
                                    </>
                                )}
                            </div>
                            <span className="text-xs text-white/80 font-normal">
                                {loading
                                    ? 'Loading entries...'
                                    : `${entries.length} ${entries.length === 1 ? 'entry' : 'entries'} • ${totalWords.toLocaleString()} words`}
                            </span>
                        </button>

                        {/* Secondary Download Actions */}
                        <div className="grid grid-cols-2 gap-3 pt-1">
                            <button
                                type="button"
                                onClick={() => handleDownload('text')}
                                disabled={loading || entries.length === 0}
                                className={`py-2.5 px-3 rounded-lg text-xs sm:text-sm font-medium border border-white/10 bg-white/5 text-white hover:bg-white/10 transition-all flex items-center justify-center gap-2 ${
                                    loading || entries.length === 0 ? 'opacity-50 cursor-not-allowed' : ''
                                }`}
                                title="Download as .txt"
                            >
                                <FileDown className="w-4 h-4 text-primary" />
                                <span>Download .txt</span>
                            </button>

                            <button
                                type="button"
                                onClick={() => handleDownload('markdown')}
                                disabled={loading || entries.length === 0}
                                className={`py-2.5 px-3 rounded-lg text-xs sm:text-sm font-medium border border-white/10 bg-white/5 text-white hover:bg-white/10 transition-all flex items-center justify-center gap-2 ${
                                    loading || entries.length === 0 ? 'opacity-50 cursor-not-allowed' : ''
                                }`}
                                title="Download as .md"
                            >
                                <FileDown className="w-4 h-4 text-primary" />
                                <span>Download .md</span>
                            </button>
                        </div>
                    </div>
                </div>

                {/* Preview & Stats Column */}
                <div className="lg:col-span-7 space-y-4">
                    {/* Live Stats Bar */}
                    <div className="grid grid-cols-3 gap-3">
                        <div className="glass-card p-3.5 text-center">
                            <span className="block text-xs uppercase text-text-muted font-bold tracking-wider">
                                Entries
                            </span>
                            <span className="text-xl sm:text-2xl font-bold text-white">
                                {loading ? '...' : entries.length}
                            </span>
                        </div>
                        <div className="glass-card p-3.5 text-center">
                            <span className="block text-xs uppercase text-text-muted font-bold tracking-wider">
                                Total Words
                            </span>
                            <span className="text-xl sm:text-2xl font-bold text-white">
                                {loading ? '...' : totalWords.toLocaleString()}
                            </span>
                        </div>
                        <div className="glass-card p-3.5 text-center">
                            <span className="block text-xs uppercase text-text-muted font-bold tracking-wider">
                                Characters
                            </span>
                            <span className="text-xl sm:text-2xl font-bold text-white">
                                {loading ? '...' : totalChars.toLocaleString()}
                            </span>
                        </div>
                    </div>

                    {/* Preview Card */}
                    <div className="glass-card flex flex-col h-[600px] overflow-hidden">
                        <div className="px-4 py-3 bg-white/5 border-b border-white/10 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <span className="text-sm font-semibold text-white">
                                    Clipboard Preview
                                </span>
                                <span className="text-xs px-2 py-0.5 rounded bg-white/10 text-text-muted uppercase font-mono">
                                    {outputFormat}
                                </span>
                            </div>

                            <button
                                type="button"
                                onClick={handleCopyToClipboard}
                                disabled={loading || entries.length === 0}
                                className={`text-xs px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all ${
                                    copied
                                        ? 'bg-green-500/20 text-green-300'
                                        : 'bg-white/10 hover:bg-white/20 text-white'
                                } ${loading || entries.length === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
                            >
                                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                                <span>{copied ? 'Copied' : 'Copy Preview'}</span>
                            </button>
                        </div>

                        {/* Preview Body */}
                        <div className="flex-1 p-4 overflow-auto custom-scrollbar font-mono text-xs sm:text-sm text-text/90 leading-relaxed bg-black/20">
                            {loading ? (
                                <div className="h-full flex flex-col items-center justify-center text-text-muted gap-3">
                                    <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                                    <p className="text-sm">Summoning entries from {activeRange.start} to {activeRange.end}...</p>
                                </div>
                            ) : loadError ? (
                                <div className="h-full flex flex-col items-center justify-center text-center p-6 gap-3">
                                    <p className="text-sm text-red-400">{loadError}</p>
                                    <button
                                        type="button"
                                        onClick={() => setReloadKey(k => k + 1)}
                                        className="glass-button px-4 py-2 text-sm text-white flex items-center gap-2"
                                    >
                                        <RefreshCw className="w-4 h-4" />
                                        <span>Retry</span>
                                    </button>
                                </div>
                            ) : entries.length === 0 ? (
                                <div className="h-full flex flex-col items-center justify-center text-center p-6 text-text-muted gap-2">
                                    <p className="text-base font-medium text-white/70">No entries found for this period</p>
                                    <p className="text-xs max-w-sm">
                                        There are no recorded journal entries between {activeRange.start} and {activeRange.end}. Try selecting a different month or date range.
                                    </p>
                                </div>
                            ) : (
                                <pre className="whitespace-pre-wrap font-inherit select-all">
                                    {combinedText}
                                </pre>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
