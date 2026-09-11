import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase';
import { format, parseISO, isValid } from 'date-fns';
import {
    Clock,
    Calendar,
    ArrowRight,
    Sparkles,
    CheckCircle2,
    AlertCircle,
    RotateCcw,
    Plus,
    Minus,
    FileText,
    History,
    FastForward
} from 'lucide-react';
import {
    calculateTargetDate,
    formatOffsetDescription,
    parseOffsetString,
    findClosestEntry
} from '../utils/dateOffset';

export default function DateOffsetTool({ onClose, autoFocus = true }) {
    const { currentUser } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();

    // Check if user is currently viewing an entry
    const currentEntryDateMatch = location.pathname.match(/\/entry\/(\d{4}-\d{2}-\d{2})/);
    const currentEntryDateStr = currentEntryDateMatch ? currentEntryDateMatch[1] : null;

    // States
    const [direction, setDirection] = useState('forward'); // 'backward' | 'forward'
    const [baseMode, setBaseMode] = useState('custom'); // 'today' | 'currentEntry' | 'custom'
    const [customDateStr, setCustomDateStr] = useState('2026-01-08'); // default to user's example 8 Jan 2026
    const [offset, setOffset] = useState({ years: 0, months: 4, weeks: 2, days: 0 }); // 4 months and 2 weeks
    const [textQuery, setTextQuery] = useState('4 months and 2 weeks forward');
    const [searchResult, setSearchResult] = useState({
        loading: true,
        targetDateStr: '',
        targetFormatted: '',
        exactMatch: null,
        closestEntry: null,
        diffDays: 0,
        discrepancy: null,
        alternativeEntry: null,
        altDiffDays: null,
        error: ''
    });

    const searchRequestIdRef = useRef(0);
    const textInputRef = useRef(null);

    // Compute base date
    const baseDate = useMemo(() => {
        if (baseMode === 'custom' && customDateStr) {
            try {
                const parsed = parseISO(customDateStr);
                if (isValid(parsed)) return parsed;
            } catch {
                // fallback
            }
        } else if (baseMode === 'currentEntry' && currentEntryDateStr) {
            try {
                const parsed = parseISO(currentEntryDateStr);
                if (isValid(parsed)) return parsed;
            } catch {
                // fallback
            }
        }
        return new Date();
    }, [baseMode, customDateStr, currentEntryDateStr]);

    const baseDateFormatted = useMemo(() => {
        try {
            return format(baseDate, 'd MMMM yyyy');
        } catch {
            return customDateStr;
        }
    }, [baseDate, customDateStr]);

    // Calculate target date
    const targetDate = useMemo(() => {
        return calculateTargetDate(baseDate, offset, direction);
    }, [baseDate, offset, direction]);

    const targetDateStr = useMemo(() => {
        try {
            return format(targetDate, 'yyyy-MM-dd');
        } catch {
            return '';
        }
    }, [targetDate]);

    const offsetDescription = useMemo(() => {
        return formatOffsetDescription(offset, direction, baseMode === 'today' ? '' : baseDateFormatted);
    }, [offset, direction, baseMode, baseDateFormatted]);

    // Presets based on direction
    const presets = useMemo(() => {
        if (direction === 'forward') {
            return [
                { label: '4 mo, 2 wk forward', offset: { years: 0, months: 4, weeks: 2, days: 0 } },
                { label: '2 weeks forward', offset: { years: 0, months: 0, weeks: 2, days: 0 } },
                { label: '1 month forward', offset: { years: 0, months: 1, weeks: 0, days: 0 } },
                { label: '3 months forward', offset: { years: 0, months: 3, weeks: 0, days: 0 } },
                { label: '6 months forward', offset: { years: 0, months: 6, weeks: 0, days: 0 } },
                { label: '1 year forward', offset: { years: 1, months: 0, weeks: 0, days: 0 } },
                { label: '100 days forward', offset: { years: 0, months: 0, weeks: 0, days: 100 } }
            ];
        }
        return [
            { label: '1 yr, 2 mo, 3 wk ago', offset: { years: 1, months: 2, weeks: 3, days: 0 } },
            { label: '3 weeks ago', offset: { years: 0, months: 0, weeks: 3, days: 0 } },
            { label: '1 month ago', offset: { years: 0, months: 1, weeks: 0, days: 0 } },
            { label: '3 months ago', offset: { years: 0, months: 3, weeks: 0, days: 0 } },
            { label: '6 months ago', offset: { years: 0, months: 6, weeks: 0, days: 0 } },
            { label: '1 year ago', offset: { years: 1, months: 0, weeks: 0, days: 0 } },
            { label: '100 days ago', offset: { years: 0, months: 0, weeks: 0, days: 100 } }
        ];
    }, [direction]);

    // Auto-focus text input on mount
    useEffect(() => {
        if (autoFocus) {
            const timer = window.setTimeout(() => textInputRef.current?.focus(), 150);
            return () => window.clearTimeout(timer);
        }
        return undefined;
    }, [autoFocus]);

    // Fetch closest entry whenever targetDateStr or currentUser changes
    const executeSearch = useCallback(async (targetDateString) => {
        if (!currentUser || !targetDateString) return;

        const requestId = ++searchRequestIdRef.current;
        setSearchResult((prev) => ({
            ...prev,
            loading: true,
            targetDateStr: targetDateString,
            error: ''
        }));

        try {
            const res = await findClosestEntry(db, currentUser.uid, targetDateString);
            if (requestId !== searchRequestIdRef.current) return;

            setSearchResult({
                loading: false,
                targetDateStr: res.targetDateStr,
                targetFormatted: res.targetFormatted,
                exactMatch: res.exactMatch,
                closestEntry: res.closestEntry,
                diffDays: res.diffDays,
                discrepancy: res.discrepancy,
                alternativeEntry: res.alternativeEntry,
                altDiffDays: res.altDiffDays,
                error: ''
            });
        } catch {
            if (requestId !== searchRequestIdRef.current) return;
            setSearchResult((prev) => ({
                ...prev,
                loading: false,
                error: 'Could not fetch entries. Check connection.'
            }));
        }
    }, [currentUser]);

    useEffect(() => {
        if (!targetDateStr) return undefined;
        const timer = window.setTimeout(() => {
            executeSearch(targetDateStr);
        }, 150);

        return () => window.clearTimeout(timer);
    }, [targetDateStr, executeSearch]);

    // Stepper updates
    const updateUnit = (unit, change) => {
        setOffset((prev) => {
            const nextVal = Math.max(0, (prev[unit] || 0) + change);
            const nextOffset = { ...prev, [unit]: nextVal };
            setTextQuery(formatOffsetDescription(nextOffset, direction));
            return nextOffset;
        });
    };

    const setUnitDirect = (unit, val) => {
        const num = Math.max(0, parseInt(val, 10) || 0);
        setOffset((prev) => {
            const nextOffset = { ...prev, [unit]: num };
            setTextQuery(formatOffsetDescription(nextOffset, direction));
            return nextOffset;
        });
    };

    const toggleDirection = (nextDir) => {
        setDirection(nextDir);
        setTextQuery(formatOffsetDescription(offset, nextDir));
    };

    const handleTextChange = (e) => {
        const val = e.target.value;
        setTextQuery(val);
        const parsed = parseOffsetString(val);
        if (parsed) {
            setOffset({
                years: parsed.years,
                months: parsed.months,
                weeks: parsed.weeks,
                days: parsed.days
            });
            if (parsed.direction) {
                setDirection(parsed.direction);
            }
        }
    };

    const applyPreset = (preset) => {
        setOffset(preset.offset);
        setTextQuery(formatOffsetDescription(preset.offset, direction));
    };

    const navigateToEntry = (dateId, isExact) => {
        navigate(`/entry/${dateId}`, {
            state: {
                timeTravel: {
                    requestedTarget: targetDateStr,
                    targetFormatted: searchResult.targetFormatted || format(targetDate, 'EEEE, d MMMM yyyy'),
                    offsetText: offsetDescription,
                    diffDays: searchResult.diffDays,
                    exactMatch: isExact,
                    direction,
                    baseDateText: baseDateFormatted
                },
                from: location.pathname
            }
        });
        if (onClose) onClose();
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            if (searchResult.closestEntry) {
                navigateToEntry(searchResult.closestEntry.id, searchResult.diffDays === 0);
            } else if (targetDateStr) {
                navigateToEntry(targetDateStr, false);
            }
        }
    };

    return (
        <div className="flex flex-col h-full space-y-3 sm:space-y-4" onKeyDown={handleKeyDown}>
            {/* Top Control Bar: Direction + Base Date */}
            <div className="space-y-2.5">
                {/* Direction Switcher (Past vs Future) */}
                <div className="space-y-1">
                    <span className="text-[11px] font-semibold text-text-muted uppercase tracking-wider">
                        Time Travel Direction
                    </span>
                    <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-black/40 border border-white/10">
                        <button
                            type="button"
                            onClick={() => toggleDirection('backward')}
                            className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
                                direction === 'backward'
                                    ? 'bg-primary text-white shadow-md'
                                    : 'text-text-muted hover:text-white hover:bg-white/5'
                            }`}
                        >
                            <History className="w-3.5 h-3.5 shrink-0" />
                            <span>Backward (Ago)</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => toggleDirection('forward')}
                            className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
                                direction === 'forward'
                                    ? 'bg-secondary text-white shadow-md'
                                    : 'text-text-muted hover:text-white hover:bg-white/5'
                            }`}
                        >
                            <FastForward className="w-3.5 h-3.5 shrink-0" />
                            <span>Forward (Ahead)</span>
                        </button>
                    </div>
                </div>

                {/* Base Date Selector */}
                <div className="space-y-1">
                    <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-semibold text-text-muted uppercase tracking-wider">
                            Calculate from
                        </span>
                        <div className="inline-flex rounded-lg border border-white/10 bg-black/20 p-0.5">
                            <button
                                type="button"
                                onClick={() => setBaseMode('today')}
                                className={`px-2 py-1 rounded-md text-[11px] sm:text-xs transition-all font-medium ${
                                    baseMode === 'today' ? 'bg-white/20 text-white shadow-sm font-bold' : 'text-text-muted hover:text-white'
                                }`}
                            >
                                Today
                            </button>
                            {currentEntryDateStr && (
                                <button
                                    type="button"
                                    onClick={() => setBaseMode('currentEntry')}
                                    className={`px-2 py-1 rounded-md text-[11px] sm:text-xs transition-all font-medium ${
                                        baseMode === 'currentEntry' ? 'bg-white/20 text-white shadow-sm font-bold' : 'text-text-muted hover:text-white'
                                    }`}
                                >
                                    This Entry
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={() => setBaseMode('custom')}
                                className={`px-2 py-1 rounded-md text-[11px] sm:text-xs transition-all font-medium ${
                                    baseMode === 'custom' ? 'bg-white/20 text-white shadow-sm font-bold' : 'text-text-muted hover:text-white'
                                }`}
                            >
                                Pick Date
                            </button>
                        </div>
                    </div>

                    {/* Interactive Custom Date Picker Row */}
                    {baseMode === 'custom' ? (
                        <div className="flex items-center gap-2 p-2 rounded-xl bg-white/5 border border-white/10">
                            <Calendar className="w-4 h-4 text-primary shrink-0 ml-1" />
                            <input
                                type="date"
                                value={customDateStr}
                                onChange={(e) => e.target.value && setCustomDateStr(e.target.value)}
                                style={{ colorScheme: 'dark' }}
                                className="glass-input py-1.5 px-2.5 text-base sm:text-sm font-semibold flex-1 bg-black/50 text-white rounded-lg border-white/20 focus:border-primary/50"
                            />
                            <button
                                type="button"
                                onClick={() => setCustomDateStr('2026-01-08')}
                                className="text-[10px] sm:text-xs text-secondary hover:text-white px-2 py-1 rounded bg-secondary/15 hover:bg-secondary/25 transition-colors shrink-0 whitespace-nowrap font-medium border border-secondary/20"
                                title="Set to 8 January 2026"
                            >
                                8 Jan 2026
                            </button>
                        </div>
                    ) : (
                        <div className="text-xs text-text-muted px-1 flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5 text-text-muted" />
                            <span>Starting date: <strong className="text-white">{baseDateFormatted}</strong></span>
                        </div>
                    )}
                </div>

                {/* Natural text search input */}
                <div className="relative">
                    <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary" />
                    <input
                        ref={textInputRef}
                        type="text"
                        value={textQuery}
                        onChange={handleTextChange}
                        placeholder={direction === 'forward' ? 'e.g. 4 months 2 weeks forward, 100 days ahead' : 'e.g. 1 year 2 months 3 weeks ago, 100 days'}
                        className="w-full glass-input py-2.5 pl-9 pr-16 text-base sm:text-sm font-medium"
                    />
                    <button
                        type="button"
                        onClick={() => {
                            setOffset({ years: 0, months: 0, weeks: 0, days: 0 });
                            setTextQuery('');
                        }}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-text-muted hover:text-white px-2 py-0.5 rounded bg-white/5 hover:bg-white/10"
                    >
                        Reset
                    </button>
                </div>

                {/* Quick preset chips */}
                <div className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar pb-1">
                    <span className="text-[11px] text-text-muted shrink-0 mr-1">Presets:</span>
                    {presets.map((preset) => (
                        <button
                            key={preset.label}
                            type="button"
                            onClick={() => applyPreset(preset)}
                            className="shrink-0 px-2.5 py-1 rounded-full text-xs font-medium bg-white/5 border border-white/10 hover:border-primary/40 hover:bg-primary/10 hover:text-primary transition-colors text-text-secondary"
                        >
                            {preset.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Steppers: Years, Months, Weeks, Days */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                    { key: 'years', label: 'Years', max: 50 },
                    { key: 'months', label: 'Months', max: 120 },
                    { key: 'weeks', label: 'Weeks', max: 520 },
                    { key: 'days', label: 'Days', max: 3650 }
                ].map(({ key, label, max }) => {
                    const value = offset[key] || 0;
                    return (
                        <div
                            key={key}
                            className="glass-card p-2 sm:p-2.5 flex flex-col items-center justify-between border border-white/10 rounded-xl bg-white/5"
                        >
                            <span className="text-[10px] sm:text-[11px] font-semibold text-text-muted uppercase tracking-wider mb-1">
                                {label}
                            </span>
                            <div className="flex items-center justify-between w-full gap-1">
                                <button
                                    type="button"
                                    onClick={() => updateUnit(key, -1)}
                                    disabled={value <= 0}
                                    className="p-1.5 rounded-lg bg-white/5 hover:bg-white/15 text-text-muted hover:text-white disabled:opacity-30 disabled:pointer-events-none transition-colors"
                                    aria-label={`Decrease ${label}`}
                                >
                                    <Minus className="w-3.5 h-3.5" />
                                </button>

                                <input
                                    type="number"
                                    min="0"
                                    max={max}
                                    value={value}
                                    onChange={(e) => setUnitDirect(key, e.target.value)}
                                    className="w-10 sm:w-12 text-center bg-transparent font-serif font-bold text-base sm:text-lg text-white outline-none focus:text-primary transition-colors"
                                />

                                <button
                                    type="button"
                                    onClick={() => updateUnit(key, 1)}
                                    className="p-1.5 rounded-lg bg-white/5 hover:bg-white/15 text-text-muted hover:text-white transition-colors"
                                    aria-label={`Increase ${label}`}
                                >
                                    <Plus className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Calculated Target & Match Card */}
            <div className="glass-card p-3.5 sm:p-4 rounded-xl border border-white/10 bg-surface/80 space-y-3 shadow-xl">
                {/* Target Date Header */}
                <div className="flex items-start justify-between gap-2 border-b border-white/10 pb-3">
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 text-xs text-primary font-semibold mb-0.5">
                            <Calendar className="w-3.5 h-3.5" />
                            <span>Calculated Target Date</span>
                        </div>
                        <h3 className="text-base sm:text-xl font-serif font-bold text-white tracking-tight leading-snug break-words">
                            {format(targetDate, 'EEEE, d MMMM yyyy')}
                        </h3>
                        <p className="text-xs text-text-muted mt-0.5 break-words">
                            Target is <span className="text-white font-medium">{offsetDescription}</span>
                        </p>
                    </div>

                    <div className="shrink-0 text-right">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-mono font-bold bg-white/10 text-text-secondary">
                            {targetDateStr}
                        </span>
                    </div>
                </div>

                {/* Match Status & Discrepancy */}
                {searchResult.loading ? (
                    <div className="flex items-center justify-center py-5 gap-2 text-text-muted text-xs sm:text-sm animate-pulse">
                        <RotateCcw className="w-4 h-4 animate-spin text-primary" />
                        <span>Searching for exact or closest entry...</span>
                    </div>
                ) : searchResult.error ? (
                    <div className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-300 text-xs flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        <span>{searchResult.error}</span>
                    </div>
                ) : searchResult.exactMatch ? (
                    /* EXACT MATCH */
                    <div className="space-y-2.5 sm:space-y-3">
                        <div className="flex items-center justify-between p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                            <div className="flex items-center gap-2 font-medium text-xs sm:text-sm">
                                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                                <span>Exact date entry found! (0 days off)</span>
                            </div>
                            <span className="text-[11px] px-2 py-0.5 rounded bg-emerald-500/20 font-bold shrink-0">
                                Exact Match
                            </span>
                        </div>

                        {/* Entry Preview */}
                        <div className="p-2.5 sm:p-3 rounded-lg bg-black/30 border border-white/5 space-y-1">
                            <div className="flex items-center justify-between gap-2">
                                <h4 className="font-serif font-bold text-white truncate text-sm sm:text-base">
                                    {searchResult.exactMatch.title}
                                </h4>
                                <span className="text-[11px] text-text-muted shrink-0">
                                    {searchResult.exactMatch.wordCount} words
                                </span>
                            </div>
                            {searchResult.exactMatch.preview && (
                                <p className="text-xs text-text-muted line-clamp-2 leading-relaxed">
                                    {searchResult.exactMatch.preview}
                                </p>
                            )}
                        </div>

                        <button
                            type="button"
                            onClick={() => navigateToEntry(searchResult.exactMatch.id, true)}
                            className="w-full flex items-center justify-center gap-2 py-2.5 sm:py-3 px-4 rounded-lg bg-gradient-to-r from-emerald-600 to-primary text-white text-xs sm:text-sm font-semibold shadow-lg hover:shadow-emerald-500/20 hover:scale-[1.01] active:scale-[0.99] transition-all cursor-pointer"
                        >
                            <span>Open Exact Entry ({format(targetDate, 'MMM d, yyyy')})</span>
                            <ArrowRight className="w-4 h-4" />
                        </button>
                    </div>
                ) : searchResult.closestEntry ? (
                    /* CLOSEST ENTRY (OFF BY N DAYS) */
                    <div className="space-y-2.5 sm:space-y-3">
                        {/* Discrepancy callout */}
                        <div className="p-2.5 sm:p-3 rounded-lg bg-amber-500/10 border border-amber-500/25 text-amber-200 space-y-1">
                            <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2 font-semibold text-xs sm:text-sm">
                                    <AlertCircle className="w-4 h-4 shrink-0 text-amber-400" />
                                    <span>No entry on target date. Closest entry:</span>
                                </div>
                                <span className="text-[11px] sm:text-xs font-bold font-mono px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 shrink-0">
                                    {searchResult.discrepancy?.badgeLabel}
                                </span>
                            </div>
                            <p className="text-xs text-amber-200/80 pl-6">
                                {searchResult.discrepancy?.summary} — {format(parseISO(searchResult.closestEntry.id), 'EEEE, d MMMM yyyy')}
                            </p>
                        </div>

                        {/* Closest Entry Preview Card */}
                        <div className="p-2.5 sm:p-3 rounded-lg bg-black/30 border border-white/5 space-y-1">
                            <div className="flex items-center justify-between gap-2">
                                <h4 className="font-serif font-bold text-white truncate text-sm sm:text-base">
                                    {searchResult.closestEntry.title}
                                </h4>
                                <div className="flex items-center gap-1.5 shrink-0">
                                    <span className="text-xs font-mono text-primary">
                                        {format(parseISO(searchResult.closestEntry.id), 'MMM d, yyyy')}
                                    </span>
                                    <span className="text-[11px] text-text-muted">
                                        • {searchResult.closestEntry.wordCount}w
                                    </span>
                                </div>
                            </div>
                            {searchResult.closestEntry.preview && (
                                <p className="text-xs text-text-muted line-clamp-2 leading-relaxed">
                                    {searchResult.closestEntry.preview}
                                </p>
                            )}
                        </div>

                        {/* Alternative entry if available */}
                        {searchResult.alternativeEntry && (
                            <div className="flex items-center justify-between text-xs px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/5">
                                <span className="text-text-muted truncate">
                                    Nearby: <strong className="text-white">{format(parseISO(searchResult.alternativeEntry.id), 'MMM d, yyyy')}</strong> ({searchResult.altDiffDays > 0 ? `+${searchResult.altDiffDays}` : searchResult.altDiffDays}d)
                                </span>
                                <button
                                    type="button"
                                    onClick={() => navigateToEntry(searchResult.alternativeEntry.id, false)}
                                    className="text-primary hover:underline font-medium ml-2 shrink-0"
                                >
                                    View
                                </button>
                            </div>
                        )}

                        {/* Actions: Primary closest + Secondary exact target */}
                        <div className="flex flex-col sm:flex-row gap-2 pt-1">
                            <button
                                type="button"
                                onClick={() => navigateToEntry(searchResult.closestEntry.id, false)}
                                className="flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg bg-gradient-to-r from-primary to-secondary text-white font-semibold shadow-lg hover:shadow-primary/25 hover:scale-[1.01] active:scale-[0.99] transition-all cursor-pointer text-xs sm:text-sm"
                            >
                                <span>Go to Closest Entry ({searchResult.discrepancy?.badgeLabel})</span>
                                <ArrowRight className="w-4 h-4 shrink-0" />
                            </button>

                            <button
                                type="button"
                                onClick={() => navigateToEntry(targetDateStr, false)}
                                className="glass-button py-2.5 px-3 text-xs text-text-secondary hover:text-white flex items-center justify-center gap-1.5 shrink-0"
                                title="Open the exact target date to view or write an entry"
                            >
                                <FileText className="w-3.5 h-3.5 shrink-0" />
                                <span>Open Target Date</span>
                            </button>
                        </div>
                    </div>
                ) : (
                    /* NO ENTRIES IN JOURNAL */
                    <div className="text-center py-5 space-y-2.5">
                        <p className="text-xs text-text-muted">
                            No entries found in your journal for this period.
                        </p>
                        <button
                            type="button"
                            onClick={() => navigateToEntry(targetDateStr, false)}
                            className="inline-flex items-center gap-2 py-2 px-3.5 rounded-lg bg-primary text-white text-xs font-semibold hover:bg-primary-variant transition-colors"
                        >
                            <span>Open {format(targetDate, 'MMMM d, yyyy')} to write</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
