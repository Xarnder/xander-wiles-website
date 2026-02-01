import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase';
import { collection, query, getDocs, orderBy, getCountFromServer, limit, startAfter } from 'firebase/firestore';
import { Search, X, Loader, Calendar, AlertTriangle } from 'lucide-react';
import { format, parseISO } from 'date-fns';

const BATCH_SIZE = 500; // Adjust based on document size/network

export default function SearchModal({ isOpen, onClose }) {
    const { currentUser } = useAuth();
    const navigate = useNavigate();
    const [queryText, setQueryText] = useState('');
    const [searchMode, setSearchMode] = useState('any'); // 'any' | 'phrase'
    const [entries, setEntries] = useState([]);
    const [results, setResults] = useState([]);
    const [selectedYear, setSelectedYear] = useState('All');

    const availableYears = useMemo(() => {
        const years = new Set(entries.map(e => e.date ? new Date(e.date).getFullYear() : null).filter(Boolean));
        return ['All', ...Array.from(years).sort((a, b) => b - a)];
    }, [entries]);

    // Loading/Indexing States
    const [indexing, setIndexing] = useState(false);
    const [progress, setProgress] = useState(0);
    const [totalEntries, setTotalEntries] = useState(0);
    const [timeEstimate, setTimeEstimate] = useState(null);
    const [isLargeDataset, setIsLargeDataset] = useState(false);

    const inputRef = useRef(null);
    const modalRef = useRef(null);

    // Index all entries
    async function indexEntries() {
        if (!currentUser) return;
        setIndexing(true);
        setProgress(0);
        setTimeEstimate('Calculating...');

        try {
            // 1. Get Total Count
            const coll = collection(db, 'users', currentUser.uid, 'entries');
            console.log("Fetching count for:", currentUser.uid);
            const countSnapshot = await getCountFromServer(coll);
            const count = countSnapshot.data().count;
            console.log("Total entries to index:", count);
            setTotalEntries(count);

            if (count > 1000) setIsLargeDataset(true);

            // 2. Batch Fetch
            let fetchedCount = 0;
            let lastDoc = null;
            let startTime = Date.now();
            let allDocs = [];

            while (fetchedCount < count) {
                // Determine query constraints
                let constraints = [orderBy('date', 'desc'), limit(BATCH_SIZE)];
                if (lastDoc) {
                    constraints.push(startAfter(lastDoc));
                }

                const q = query(coll, ...constraints);
                const snapshot = await getDocs(q);

                if (snapshot.empty) break;

                const batchDocs = snapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data(),
                    // Pre-process lowercase content for faster search
                    searchableContent: (doc.data().content || '').toLowerCase(),
                    searchableTitle: (doc.data().title || '').toLowerCase()
                }));

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
            setTimeEstimate('Error');
        }
    }

    // Focus input when opened and trigger indexing
    useEffect(() => {
        if (isOpen) {
            setTimeout(() => inputRef.current?.focus(), 100);
            if (entries.length === 0 && !indexing) {
                indexEntries();
            }
        }
    }, [isOpen]);

    // Close on escape
    useEffect(() => {
        const handleEsc = (e) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [onClose]);

    // Perform Search
    useEffect(() => {
        console.log("Search effect running. Query:", queryText, "Mode:", searchMode, "Year:", selectedYear, "Entries:", entries.length);

        if (!queryText.trim()) {
            setResults([]);
            return;
        }

        const lowerQuery = queryText.toLowerCase();

        const filtered = entries.filter(entry => {
            // Filter by Year first
            if (selectedYear !== 'All') {
                const entryYear = entry.date ? new Date(entry.date).getFullYear() : null;
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

            // Debug specific failure cases (optional, remove later)
            // if (queryText === 'pizza' && !matches) {
            //     console.log("Pizza mismatch on:", entry.id, entry.searchableContent.slice(0, 50));
            // }

            return matches;
        });

        console.log("Filtered results count:", filtered.length);
        setResults(filtered);
    }, [queryText, searchMode, selectedYear, entries]);

    // ... (getSnippet removed/unused)

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[60] flex items-start justify-center pt-20 px-4">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm animation-fade-in"
                onClick={onClose}
            ></div>

            {/* Modal */}
            <div
                ref={modalRef}
                className="relative bg-[#18181b] w-full max-w-2xl rounded-xl shadow-2xl border border-white/10 flex flex-col max-h-[80vh] animation-scale-in overflow-hidden"
            >
                {/* Header / Input */}
                <div className="p-4 border-b border-white/10 bg-white/5 space-y-4">
                    <div className="flex items-center justify-between">
                        <h2 className="text-lg font-bold text-white flex items-center">
                            <Search className="w-5 h-5 mr-2 text-primary" />
                            Search Journal
                        </h2>
                        <button onClick={onClose} className="text-text-muted hover:text-white transition-colors">
                            <X className="w-6 h-6" />
                        </button>
                    </div>

                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" />
                        <input
                            ref={inputRef}
                            type="text"
                            value={queryText}
                            onChange={(e) => setQueryText(e.target.value)}
                            placeholder="Search your memories..."
                            className="w-full bg-black/40 border border-white/10 rounded-lg py-3 pl-10 pr-4 text-white focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all"
                        />
                    </div>

                    <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-4">
                            <label className="flex items-center space-x-2 text-sm text-text-muted cursor-pointer hover:text-white transition-colors group select-none">
                                <div className="relative">
                                    <input
                                        type="checkbox"
                                        checked={searchMode === 'phrase'}
                                        onChange={(e) => setSearchMode(e.target.checked ? 'phrase' : 'any')}
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
                                onChange={(e) => setSelectedYear(e.target.value)}
                                className="bg-black/40 border border-white/10 rounded-lg text-sm text-text-muted py-1 px-2 focus:outline-none focus:border-primary/50"
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

                {/* Results List */}
                <div className="flex-1 overflow-y-auto custom-scrollbar p-2">
                    {results.length === 0 && queryText && !indexing ? (
                        <div className="text-center py-10 text-text-muted">
                            <p>No matches found for "{queryText}"</p>
                        </div>
                    ) : (
                        <div className="space-y-1">
                            {results.map(entry => (
                                <button
                                    key={entry.id}
                                    onClick={() => {
                                        navigate(`/entry/${entry.id}`);
                                        onClose();
                                    }}
                                    className="w-full text-left p-2 rounded-lg hover:bg-white/5 transition-colors group border border-transparent hover:border-white/5"
                                >
                                    <div className="flex justify-between items-center gap-2">
                                        <h3 className="font-bold text-white group-hover:text-primary transition-colors truncate text-sm" style={{ maxWidth: '60%' }}>
                                            {truncateTitle(entry.title)}
                                        </h3>
                                        <span className="text-xs text-text-muted flex items-center shrink-0">
                                            <Calendar className="w-3 h-3 mr-1" />
                                            {format(parseISO(entry.id), 'MMM d, yyyy')}
                                        </span>
                                    </div>
                                    <p className="text-xs text-text-muted truncate mt-1">
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
            </div>
        </div>
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
    } catch (e) {
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

// Truncate title to a reasonable length for search results
function truncateTitle(title) {
    if (!title) return 'Untitled';
    const clean = title.trim();
    if (clean.length <= 50) return clean;
    return clean.slice(0, 50) + '...';
}
