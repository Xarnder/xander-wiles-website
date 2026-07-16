import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase';
import { collection, query, getDocs, orderBy, getCountFromServer, limit, startAfter, documentId } from 'firebase/firestore';
import { Search, X, Calendar, AlertTriangle } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import Modal from './Modal';

const BATCH_SIZE = 500; // Adjust based on document size/network

export default function SearchModal({ isOpen, onClose }) {
    const { currentUser } = useAuth();
    const navigate = useNavigate();
    const [queryText, setQueryText] = useState('');
    const [searchMode, setSearchMode] = useState('any'); // 'any' | 'phrase'
    const [entries, setEntries] = useState([]);
    const [selectedYear, setSelectedYear] = useState('All');

    const availableYears = useMemo(() => {
        const years = new Set(entries.map((entry) => Number(entry.id?.slice(0, 4))).filter(Boolean));
        return ['All', ...Array.from(years).sort((a, b) => b - a)];
    }, [entries]);

    // Loading/Indexing States
    const [indexing, setIndexing] = useState(false);
    const [progress, setProgress] = useState(0);
    const [totalEntries, setTotalEntries] = useState(0);
    const [timeEstimate, setTimeEstimate] = useState(null);
    const [isLargeDataset, setIsLargeDataset] = useState(false);
    const [indexError, setIndexError] = useState('');
    const [activeIndex, setActiveIndex] = useState(-1);

    const inputRef = useRef(null);
    const indexEntriesRef = useRef(null);

    // Index all entries
    const indexEntries = useCallback(async () => {
        if (!currentUser) return;
        setIndexing(true);
        setProgress(0);
        setTimeEstimate('Calculating...');
        setIndexError('');

        try {
            // 1. Get Total Count
            const coll = collection(db, 'users', currentUser.uid, 'entries');
            const countSnapshot = await getCountFromServer(coll);
            const count = countSnapshot.data().count;
            setTotalEntries(count);

            if (count > 1000) setIsLargeDataset(true);

            // 2. Batch Fetch
            let fetchedCount = 0;
            let lastDoc = null;
            let startTime = Date.now();
            let allDocs = [];

            while (fetchedCount < count) {
                // Determine query constraints
                let constraints = [orderBy(documentId(), 'desc'), limit(BATCH_SIZE)];
                if (lastDoc) {
                    constraints.push(startAfter(lastDoc));
                }

                const q = query(coll, ...constraints);
                const snapshot = await getDocs(q);

                if (snapshot.empty) break;

                const batchDocs = snapshot.docs.map((entryDoc) => {
                    const data = entryDoc.data();
                    const subEntryText = Object.values(data.subEntries || {})
                        .flatMap((subEntry) => [subEntry?.title, subEntry?.content])
                        .filter(Boolean)
                        .join(' ');
                    return {
                        id: entryDoc.id,
                        ...data,
                        searchableContent: `${data.content || ''} ${subEntryText}`.toLowerCase(),
                        searchableTitle: (data.title || '').toLowerCase()
                    };
                });

                allDocs = [...allDocs, ...batchDocs];
                fetchedCount += batchDocs.length;
                lastDoc = snapshot.docs[snapshot.docs.length - 1];

                // Update Progress
                const currentProgress = Math.round((fetchedCount / count) * 100);
                setProgress(currentProgress);

                // Update Estimate
                const elapsed = Date.now() - startTime;
                const speedPerDoc = elapsed / fetchedCount;
                const remainingDocs = count - fetchedCount;
                const estRemainingMs = remainingDocs * speedPerDoc;

                if (remainingDocs > 0) {
                    setTimeEstimate(`${Math.ceil(estRemainingMs / 1000)}s remaining`);
                } else {
                    setTimeEstimate('Finalizing...');
                }

                // Small delay to allow UI updates if needed (optional)
                await new Promise(resolve => setTimeout(resolve, 0));
            }

            setEntries(allDocs);
            setIndexing(false);
            setTimeEstimate(null);

        } catch (error) {
            console.error("Error indexing entries:", error);
            setIndexing(false);
            setTimeEstimate(null);
            setIndexError('Your journal could not be indexed. Check your connection and try again.');
        }
    }, [currentUser]);
    useEffect(() => {
        indexEntriesRef.current = indexEntries;
    }, [indexEntries]);

    // Focus input when opened and trigger indexing
    useEffect(() => {
        if (isOpen) {
            const focusTimer = window.setTimeout(() => inputRef.current?.focus(), 100);
            let indexTimer;
            if (entries.length === 0 && !indexing) {
                indexTimer = window.setTimeout(() => indexEntriesRef.current?.(), 0);
            }
            return () => {
                window.clearTimeout(focusTimer);
                window.clearTimeout(indexTimer);
            };
        }
        return undefined;
    }, [isOpen, entries.length, indexing]);

    // Perform Search
    const results = useMemo(() => {
        if (!queryText.trim()) return [];

        const lowerQuery = queryText.toLowerCase();

        return entries.filter(entry => {
            // Filter by Year first
            if (selectedYear !== 'All') {
                const entryYear = Number(entry.id?.slice(0, 4));
                if (entryYear !== parseInt(selectedYear)) return false;
            }

            let matches = false;
            if (searchMode === 'phrase') {
                matches = entry.searchableContent.includes(lowerQuery) ||
                    entry.searchableTitle.includes(lowerQuery);
            } else {
                // Any word mode
                const words = lowerQuery.split(/\s+/).filter(w => w.length > 0);
                matches = words.some(word =>
                    entry.searchableContent.includes(word) ||
                    entry.searchableTitle.includes(word)
                );
            }

            return matches;
        });
    }, [queryText, searchMode, selectedYear, entries]);

    useEffect(() => {
        if (activeIndex < 0) return;
        document.getElementById(`search-result-${activeIndex}`)?.scrollIntoView({ block: 'nearest' });
    }, [activeIndex]);

    const openResult = (entry) => {
        navigate(`/entry/${entry.id}`, { state: { from: window.location.pathname } });
        onClose();
    };

    const handleInputKeyDown = (event) => {
        if (event.key === 'ArrowDown' && results.length > 0) {
            event.preventDefault();
            setActiveIndex((current) => (current + 1) % results.length);
        } else if (event.key === 'ArrowUp' && results.length > 0) {
            event.preventDefault();
            setActiveIndex((current) => (current <= 0 ? results.length - 1 : current - 1));
        } else if (event.key === 'Enter' && activeIndex >= 0) {
            event.preventDefault();
            openResult(results[activeIndex]);
        }
    };

    // ... (getSnippet removed/unused)

    if (!isOpen) return null;

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            labelledBy="journal-search-title"
            initialFocusRef={inputRef}
            containerClassName="items-start justify-center pt-20 px-4"
            className="bg-surface w-full max-w-2xl rounded-xl shadow-2xl border border-border flex flex-col max-h-[80vh] overflow-hidden"
        >
                {/* Header / Input */}
                <div className="p-4 border-b border-border bg-white/5 space-y-4">
                    <div className="flex items-center justify-between">
                        <h2 id="journal-search-title" className="text-lg font-bold text-text flex items-center">
                            <Search className="w-5 h-5 mr-2 text-primary" />
                            Search Journal
                        </h2>
                        <button type="button" onClick={onClose} aria-label="Close search" className="text-text-muted hover:text-text transition-colors">
                            <X className="w-6 h-6" />
                        </button>
                    </div>

                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" />
                        <input
                            ref={inputRef}
                            type="text"
                            value={queryText}
                            onChange={(e) => {
                                setQueryText(e.target.value);
                                setActiveIndex(e.target.value.trim() ? 0 : -1);
                            }}
                            onKeyDown={handleInputKeyDown}
                            placeholder="Search your memories..."
                            aria-controls="journal-search-results"
                            aria-activedescendant={activeIndex >= 0 ? `search-result-${activeIndex}` : undefined}
                            className="w-full glass-input py-3 pl-10 pr-4"
                        />
                    </div>

                    <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-4">
                            <label className="flex items-center space-x-2 text-sm text-text-muted cursor-pointer hover:text-white transition-colors group select-none">
                                <div className="relative">
                                    <input
                                        type="checkbox"
                                        checked={searchMode === 'phrase'}
                                        onChange={(e) => {
                                            setSearchMode(e.target.checked ? 'phrase' : 'any');
                                            setActiveIndex(0);
                                        }}
                                        className="sr-only peer"
                                    />
                                    <div className="w-9 h-5 bg-white/10 border border-white/10 rounded-full peer-checked:bg-secondary/30 peer-checked:border-secondary/50 transition-all duration-300"></div>
                                    <div className="absolute left-0.5 top-0.5 w-4 h-4 bg-text-muted rounded-full transition-all duration-300 peer-checked:translate-x-4 peer-checked:bg-secondary"></div>
                                </div>
                                <span className={`${searchMode === 'phrase' ? 'text-secondary font-bold' : ''}`}>Exact Phrase</span>
                            </label>

                            {/* Year Filter */}
                            <select
                                value={selectedYear}
                                onChange={(e) => {
                                    setSelectedYear(e.target.value);
                                    setActiveIndex(0);
                                }}
                            className="glass-input py-1 px-2"
                            >
                                {availableYears.map(year => (
                                    <option key={year} value={year}>{year}</option>
                                ))}
                            </select>
                        </div>
                        <div className="text-xs text-text-muted">
                            {results.length} results found
                        </div>
                    </div>
                </div>

                {/* Progress / Status */}
                {indexing && (
                    <div className="px-4 py-3 bg-primary/10 border-b border-primary/20">
                        <div className="flex items-center justify-between text-xs text-primary mb-1 font-mono">
                            <span>Indexing entries... {progress}%</span>
                            <span>{timeEstimate}</span>
                        </div>
                        <div className="w-full bg-black/40 rounded-full h-1.5 overflow-hidden">
                            <div
                                className="bg-primary h-full transition-all duration-300"
                                style={{ width: `${progress}%` }}
                            ></div>
                        </div>
                        {isLargeDataset && (
                            <div className="flex items-center mt-2 text-xs text-orange-400">
                                <AlertTriangle className="w-3 h-3 mr-1" />
                                Large journal ({totalEntries} items). This might take a moment.
                            </div>
                        )}
                    </div>
                )}

                {indexError && !indexing && (
                    <div role="alert" className="px-4 py-3 bg-red-500/10 border-b border-red-500/20 flex items-center justify-between gap-3">
                        <p className="text-sm text-red-300">{indexError}</p>
                        <button type="button" onClick={indexEntries} className="shrink-0 glass-button px-3 py-1.5 text-sm text-text">
                            Retry
                        </button>
                    </div>
                )}

                {/* Results List */}
                <div id="journal-search-results" role="listbox" aria-label="Search results" className="flex-1 overflow-y-auto custom-scrollbar p-2">
                    {results.length === 0 && queryText && !indexing ? (
                        <div className="text-center py-10 text-text-muted">
                            <p>No matches found for "{queryText}"</p>
                        </div>
                    ) : (
                        <div className="space-y-1">
                            {results.map((entry, index) => (
                                <button
                                    key={entry.id}
                                    id={`search-result-${index}`}
                                    role="option"
                                    aria-selected={activeIndex === index}
                                    onMouseEnter={() => setActiveIndex(index)}
                                    onClick={() => openResult(entry)}
                                    className={`w-full text-left p-2 rounded-lg transition-colors group border ${activeIndex === index ? 'bg-primary/10 border-primary/30' : 'border-transparent hover:bg-white/5 hover:border-white/5'}`}
                                >
                                    <div className="flex justify-between items-center gap-2">
                                        <h3 className="font-medium text-text group-hover:text-primary transition-colors truncate">
                                            {cleanTitle(entry.title)}
                                        </h3>
                                        <span className="text-xs text-text-muted flex items-center shrink-0">
                                            <Calendar className="w-3 h-3 mr-1" />
                                            {format(parseISO(entry.id), 'MMM d, yyyy')}
                                        </span>
                                    </div>
                                    <p className="text-xs text-text-muted mt-1 line-clamp-1">
                                        <HighlightedSnippet
                                            content={entry.content}
                                            query={queryText}
                                            mode={searchMode}
                                        />
                                    </p>
                                </button>
                            ))}
                        </div>
                    )}

                    {!queryText && !indexing && (
                        <div className="text-center py-20 text-text-muted opacity-50 select-none">
                            <Search className="w-12 h-12 mx-auto mb-2 opacity-20" />
                            <p>Type above to search your journal.</p>
                        </div>
                    )}
                </div>
        </Modal>
    );
}

// Helper component for highlighting matches
function HighlightedSnippet({ content, query, mode }) {
    if (!content) return null;

    // Strip markdown (basic) and extra whitespace
    const plainText = content
        .replace(/[#*`_~>]/g, '') // remove markdown chars
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // link text
        .replace(/\s+/g, ' ')
        .trim();

    const lowerContent = plainText.toLowerCase();
    const lowerQuery = query.toLowerCase();

    let matchIndex = -1;
    let matchLength = 0;

    if (mode === 'phrase') {
        matchIndex = lowerContent.indexOf(lowerQuery);
        matchLength = lowerQuery.length;
    } else {
        // Find best matching word (first one found)
        const words = lowerQuery.split(/\s+/).filter(w => w.length > 0);
        for (const word of words) {
            const idx = lowerContent.indexOf(word);
            if (idx !== -1) {
                matchIndex = idx;
                matchLength = word.length;
                break; // Just use first match for window centering
            }
        }
    }

    if (matchIndex === -1 && query) return <span className="text-text-muted">{plainText.slice(0, 50)}...</span>;
    if (!query) return <span className="text-text-muted">{plainText.slice(0, 50)}...</span>;

    // Window logic: show just a sentence fragment around the match
    // ~25 chars before and ~30 chars after match for a compact preview
    const start = Math.max(0, matchIndex - 25);
    const end = Math.min(plainText.length, matchIndex + matchLength + 30);

    let snippet = plainText.slice(start, end);
    // Add ellipses
    if (start > 0) snippet = '...' + snippet;
    if (end < plainText.length) snippet = snippet + '...';

    // 2. Highlight matching terms within snippet
    let regex;

    try {
        if (mode === 'phrase') {
            regex = new RegExp(`(${escapeRegExp(lowerQuery)})`, 'gi');
        } else {
            const words = lowerQuery.split(/\s+/).filter(w => w.length > 0);
            if (words.length > 0) {
                regex = new RegExp(`(${words.map(escapeRegExp).join('|')})`, 'gi');
            }
        }
    } catch {
        return <span>{snippet}</span>;
    }

    if (!regex) return <span>{snippet}</span>;

    const split = snippet.split(regex);

    return (
        <span>
            {split.map((part, i) => {
                const lowerPart = part.toLowerCase();
                let isMatch = false;

                if (mode === 'phrase') {
                    isMatch = lowerPart === lowerQuery;
                } else {
                    const words = lowerQuery.split(/\s+/).filter(w => w.length > 0);
                    isMatch = words.some(w => lowerPart === w);
                }

                if (isMatch) {
                    return (
                        <span key={i} className="bg-yellow-500/40 text-yellow-200 font-bold px-0.5 rounded">
                            {part}
                        </span>
                    );
                }
                return <span key={i}>{part}</span>;
            })}
        </span>
    );
}

function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Extract clean title from formatted header like **++Date - Name: Actual Title++**
function cleanTitle(rawTitle) {
    if (!rawTitle) return 'Untitled';

    // Pattern: **++Date - Name: Actual Title++** or similar variations
    // Try to extract just the title part after the colon
    const colonMatch = rawTitle.match(/:\s*(.+?)(?:\+\+|\*\*|$)/);
    if (colonMatch && colonMatch[1]) {
        const title = colonMatch[1].replace(/[*+]+/g, '').trim();
        if (title) return title.length > 60 ? title.slice(0, 60) + '...' : title;
    }

    // If no colon pattern, try to extract from ++ markers with dash separator
    const dashMatch = rawTitle.match(/\+\+[^-]+-\s*(.+?)\+\+/);
    if (dashMatch && dashMatch[1]) {
        const title = dashMatch[1].replace(/[*+]+/g, '').trim();
        if (title) return title.length > 60 ? title.slice(0, 60) + '...' : title;
    }

    // Fallback: just strip formatting chars
    const stripped = rawTitle.replace(/[*+#]+/g, '').trim();
    if (stripped) return stripped.length > 60 ? stripped.slice(0, 60) + '...' : stripped;

    return 'Untitled';
}
