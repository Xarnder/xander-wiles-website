import React, { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Search, X, Clock, ArrowLeft, Loader2, AlertTriangle } from 'lucide-react';
import DateOffsetTool from './DateOffsetTool';
import SearchFilters from './SearchFilters';
import SearchResults from './SearchResults';
import { useSearchIndex } from '../lib/useSearchIndex';
import { filterSearchEntries, readSearchFilters, searchFilterErrors, hasSearchFilters } from '../utils/journalSearch';

const EMPTY_RESULTS = [];

export default function SearchView() {
    const [urlParams, setParams] = useSearchParams();
    const urlSearch = urlParams.toString();
    // Router transitions can be deferred; controlled inputs must update immediately.
    const [draft, setDraft] = useState({ source: urlSearch, params: urlParams });
    if (draft.source !== urlSearch) {
        setDraft({ source: urlSearch, params: urlParams });
    }
    const params = draft.params;
    const inputRef = useRef(null);
    const isTimeTravel = params.get('tab') === 'date-offset';
    const queryText = params.get('q') || '';
    const mode = params.get('mode') === 'phrase' ? 'phrase' : 'any';
    const filterKey = params.toString();
    const filters = useMemo(() => readSearchFilters(new URLSearchParams(filterKey)), [filterKey]);
    const deferredSearchKey = useDeferredValue(filterKey);
    const resultSearch = useMemo(() => {
        const searchParams = new URLSearchParams(deferredSearchKey);
        return {
            queryText: searchParams.get('q') || '',
            mode: searchParams.get('mode') === 'phrase' ? 'phrase' : 'any',
            filters: readSearchFilters(searchParams)
        };
    }, [deferredSearchKey]);
    const updatingResults = filterKey !== deferredSearchKey;
    const filterErrors = searchFilterErrors(filters);
    const hasFilterError = Boolean(filterErrors.dates || filterErrors.sources);
    const hasCriteria = Boolean(queryText.trim() || hasSearchFilters(filters));
    const { entries, status, message, retry } = useSearchIndex(!isTimeTravel);
    const loading = status === 'loading' || status === 'idle';
    const results = useMemo(() => filterSearchEntries(entries, resultSearch.queryText, resultSearch.mode, resultSearch.filters), [entries, resultSearch]);
    const years = useMemo(() => [...new Set(entries.map((entry) => entry.id.slice(0, 4)))].sort().reverse(), [entries]);

    const updateParams = (updates) => {
        const next = new URLSearchParams(params);
        Object.entries(updates).forEach(([key, value]) => {
            if (value) next.set(key, value);
            else next.delete(key);
        });
        setDraft({ source: urlSearch, params: next });
        setParams(next, { replace: true });
    };
    const updateParam = (key, value) => updateParams({ [key]: value });
    const tabUrl = (tab) => {
        const next = new URLSearchParams(params);
        if (tab) next.set('tab', tab);
        else next.delete('tab');
        const search = next.toString();
        return `/search${search ? `?${search}` : ''}`;
    };

    useEffect(() => {
        window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    }, []);

    useEffect(() => {
        // Avoid opening the software keyboard on page load on touch devices.
        if (!isTimeTravel && window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
            inputRef.current?.focus({ preventScroll: true });
        }
    }, [isTimeTravel]);

    const focusFirstResult = () => {
        if (!updatingResults && !hasFilterError) document.querySelector('[data-search-result]')?.focus();
    };

    return (
        <section aria-labelledby="journal-search-title" className="mx-auto w-full max-w-5xl min-w-0 space-y-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
            <Link to="/" className="inline-flex min-h-11 items-center gap-2 rounded-lg text-sm text-text-muted hover:text-text focus-visible:outline-2 focus-visible:outline-primary">
                <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to calendar
            </Link>
            <div>
                <h2 id="journal-search-title" className="text-3xl sm:text-4xl font-serif font-bold text-text">Search your journal</h2>
                <p className="mt-2 text-sm sm:text-base text-text-muted">Find a memory by its words, or jump to another date.</p>
            </div>

            <nav aria-label="Search tools" className="flex flex-wrap gap-2 border-b border-border pb-4">
                <Link to={tabUrl('')} aria-current={!isTimeTravel ? 'page' : undefined}
                    className={`inline-flex min-h-11 items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-primary ${!isTimeTravel ? 'bg-primary/20 text-text' : 'text-text-muted hover:bg-white/5'}`}>
                    <Search className="h-4 w-4" aria-hidden="true" /> Search
                </Link>
                <Link to={tabUrl('date-offset')} aria-current={isTimeTravel ? 'page' : undefined}
                    className={`inline-flex min-h-11 items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-primary ${isTimeTravel ? 'bg-primary/20 text-text' : 'text-text-muted hover:bg-white/5'}`}>
                    <Clock className="h-4 w-4" aria-hidden="true" /> Time Travel
                </Link>
            </nav>

            {isTimeTravel ? (
                <div className="glass-card p-4 sm:p-6 max-w-3xl">
                    <DateOffsetTool autoFocus={false} />
                </div>
            ) : (
                <>
                    <form role="search" aria-label="Search journal entries" className="glass-card p-4 sm:p-6 space-y-4"
                        onSubmit={(event) => { event.preventDefault(); focusFirstResult(); }}>
                        <label htmlFor="journal-search-input" className="block text-sm font-semibold text-text">Words or phrase</label>
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted pointer-events-none" aria-hidden="true" />
                            <input id="journal-search-input" ref={inputRef} type="search" enterKeyHint="search" autoComplete="off"
                                value={queryText} onChange={(event) => updateParam('q', event.target.value)}
                                onKeyDown={(event) => {
                                    if (event.key === 'ArrowDown' && results.length) { event.preventDefault(); focusFirstResult(); }
                                }}
                                aria-describedby="journal-search-help" aria-controls="journal-search-results"
                                placeholder="Search your memories…" className="journal-search-input glass-input w-full min-h-12 pl-10 pr-12" />
                            {queryText && <button type="button" aria-label="Clear search" onClick={() => { updateParam('q', ''); inputRef.current?.focus(); }}
                                className="absolute right-1 top-1/2 -translate-y-1/2 flex h-11 w-11 items-center justify-center rounded-lg text-text-muted hover:text-text focus-visible:outline-2 focus-visible:outline-primary">
                                <X className="h-5 w-5" aria-hidden="true" />
                            </button>}
                        </div>
                        <div>
                            <label className="inline-flex min-h-11 items-center gap-3 cursor-pointer text-sm text-text">
                                <input type="checkbox" checked={mode === 'phrase'} onChange={(event) => updateParam('mode', event.target.checked ? 'phrase' : '')}
                                    className="h-5 w-5 accent-primary" /> Exact phrase
                            </label>
                        </div>
                        <p id="journal-search-help" className="text-xs text-text-muted">{mode === 'phrase' ? 'Matches the words together, in order, within one title, text section, or caption. Case, extra spaces and Markdown formatting are ignored.' : 'Matches any entered word, in any order, in the selected search areas. Case is ignored.'}</p>
                        <SearchFilters filters={filters} years={years} errors={filterErrors} updateParams={updateParams} />
                    </form>

                    {loading && <div role="status" className="flex items-center gap-3 rounded-xl border border-primary/20 bg-primary/10 p-4 text-sm text-text">
                        <Loader2 className="h-5 w-5 shrink-0 animate-spin text-primary" aria-hidden="true" />
                        <span>{entries.length ? `Searching ${entries.length.toLocaleString()} downloaded entries. Loading the rest…` : 'Loading your journal for search…'}</span>
                    </div>}
                    {message && <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
                        <AlertTriangle className="h-5 w-5 shrink-0 text-accent" aria-hidden="true" />
                        <p className="min-w-0 flex-1 basis-48 text-sm text-text">{message}</p>
                        <button type="button" onClick={retry} className="glass-button min-h-11 px-4 text-sm font-semibold">Retry</button>
                    </div>}

                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                            <h3 className="font-serif text-xl font-semibold text-text">Results</h3>
                            {results.length > 0 && <p className="mt-1 text-xs text-text-muted">Newest entries first</p>}
                        </div>
                        <p role="status" aria-live="polite" aria-atomic="true" className="text-sm text-text-muted">
                            {hasFilterError ? 'Check your filters' : updatingResults ? 'Updating results…' : hasCriteria ? `${results.length.toLocaleString()} ${queryText.trim() ? (results.length === 1 ? 'match' : 'matches') : (results.length === 1 ? 'entry' : 'entries')}${status === 'partial' || loading ? ' so far' : ''}` : `${entries.length.toLocaleString()} entries ${status === 'ready' ? 'ready to search' : 'loaded'}`}
                        </p>
                    </div>
                    <div aria-busy={updatingResults} inert={updatingResults || undefined} className={updatingResults ? 'opacity-60' : undefined}>
                        <SearchResults key={deferredSearchKey} results={hasFilterError ? EMPTY_RESULTS : results} queryText={resultSearch.queryText} mode={resultSearch.mode} inputRef={inputRef}
                            returnTo={`/search${deferredSearchKey ? `?${deferredSearchKey}` : ''}`} />
                    </div>
                    {!results.length && !updatingResults && !loading && status !== 'error' && !hasFilterError && <div className="glass-card px-5 py-12 sm:py-16 text-center text-text-muted">
                        <Search className="mx-auto h-9 w-9 mb-4 opacity-50" aria-hidden="true" />
                        <p className="font-medium text-text break-words">{hasCriteria ? (status === 'partial' ? 'No matches in downloaded entries' : 'No matches found') : (status === 'ready' && !entries.length ? 'Your journal has no entries yet' : 'What would you like to find?')}</p>
                        <p className="mt-2 text-sm">{hasCriteria ? 'Try different words, a wider date range, or more search areas.' : 'Enter a word or phrase, or open Filters to browse a date range.'}</p>
                    </div>}
                </>
            )}
        </section>
    );
}
