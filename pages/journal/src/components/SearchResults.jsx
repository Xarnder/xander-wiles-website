import React, { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Calendar, ChevronDown } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { highlightSearchText, searchResultTitle, searchSnippet } from '../utils/journalSearch';

const PAGE_SIZE = 50;

export default React.memo(function SearchResults({ results, queryText, mode, inputRef, returnTo }) {
    const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
    const visible = results.slice(0, visibleCount);
    const resultRefs = useRef([]);

    useEffect(() => {
        if (visibleCount > PAGE_SIZE) resultRefs.current[visibleCount - PAGE_SIZE]?.focus();
    }, [visibleCount]);

    return (
        <div id="journal-search-results" className="space-y-4">
            <ul aria-label="Search results" className="space-y-3 sm:space-y-4">
                {visible.map((entry, index) => <li key={entry.id}>
                    <SearchResultCard entry={entry} queryText={queryText} mode={mode} returnTo={returnTo}
                        linkRef={(node) => { resultRefs.current[index] = node; }}
                        onKeyDown={(event) => {
                            if (event.key === 'ArrowDown' && index + 1 < visible.length) { event.preventDefault(); resultRefs.current[index + 1]?.focus(); }
                            if (event.key === 'ArrowUp') { event.preventDefault(); (index ? resultRefs.current[index - 1] : inputRef.current)?.focus(); }
                        }} />
                </li>)}
            </ul>
            {results.length > visibleCount && <button type="button" onClick={() => setVisibleCount((value) => value + PAGE_SIZE)} className="glass-button w-full min-h-12 px-4 py-3 text-sm font-semibold">
                Show more results ({(results.length - visibleCount).toLocaleString()} remaining)
            </button>}
        </div>
    );
});

function SearchResultCard({ entry, queryText, mode, returnTo, linkRef, onKeyDown }) {
    const [expanded, setExpanded] = useState(false);
    const detailsId = useId();
    const titleMatch = Boolean(queryText.trim() && entry.matches.some(({ source }) => source === 'title'));
    // The heading already displays the entry title; use the preview space for other matches.
    const excerpts = entry.matches.filter(({ source }) => source !== 'title');
    const remaining = excerpts.slice(2);
    const titleQuery = titleMatch ? queryText : '';

    return (
        <article className="glass-card min-w-0 transition-colors hover:border-primary/40 focus-within:border-primary/50">
            <Link to={`/entry/${entry.id}`} state={{ from: returnTo }} data-search-result ref={linkRef} onKeyDown={onKeyDown}
                className="group block min-w-0 rounded-xl p-4 sm:p-5 focus-visible:outline-2 focus-visible:outline-primary scroll-mt-[calc(var(--journal-header-height,5rem)+1rem)]">
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                        <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-text-secondary">
                            <p className="inline-flex items-center gap-1.5">
                                <Calendar className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                                <time dateTime={entry.id}>{format(parseISO(entry.id), 'd MMMM yyyy')}</time>
                            </p>
                            {titleMatch && <span className="rounded-md bg-primary/10 px-2 py-1 font-medium text-primary">Entry title</span>}
                        </div>
                        <h4 className="font-serif text-lg sm:text-xl font-semibold leading-snug text-text [overflow-wrap:anywhere] group-hover:text-primary">
                            <HighlightedText value={searchResultTitle(entry.title, titleQuery, mode)} queryText={titleQuery} mode={mode} />
                        </h4>
                    </div>
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/5 text-text-muted group-hover:bg-primary/10 group-hover:text-primary">
                        <ArrowRight className="h-4 w-4" aria-hidden="true" />
                        <span className="sr-only">Open entry</span>
                    </span>
                </div>
                {excerpts.length > 0 && <div className="mt-4 space-y-3">
                    {excerpts.slice(0, 2).map((match) => <MatchExcerpt key={match.key} match={match} queryText={queryText} mode={mode} />)}
                </div>}
            </Link>
            {remaining.length > 0 && <div className="border-t border-border px-4 sm:px-5">
                <button type="button" aria-expanded={expanded} aria-controls={detailsId} onClick={() => setExpanded((value) => !value)}
                    className="flex min-h-11 w-full items-center justify-between gap-3 rounded-lg py-3 text-left text-sm font-medium text-primary focus-visible:outline-2 focus-visible:outline-primary">
                    <span>{expanded ? 'Hide additional' : `Show ${remaining.length} more`} {queryText.trim() ? (remaining.length === 1 ? 'match' : 'matches') : (remaining.length === 1 ? 'excerpt' : 'excerpts')}</span>
                    <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`} aria-hidden="true" />
                </button>
                <div id={detailsId} hidden={!expanded} className="space-y-3 pb-4 sm:pb-5">
                    {expanded && remaining.map((match) => <MatchExcerpt key={match.key} match={match} queryText={queryText} mode={mode} />)}
                </div>
            </div>}
        </article>
    );
}

function MatchExcerpt({ match, queryText, mode }) {
    const snippet = searchSnippet(match.text, queryText, mode);
    return (
        <div className="min-w-0 border-l-2 border-primary/25 pl-3">
            <p className="mb-1.5 text-xs font-semibold text-text-secondary">{match.label}</p>
            <p className="text-sm sm:text-base leading-relaxed text-text-secondary [overflow-wrap:anywhere]">
                <HighlightedText value={snippet.text} queryText={queryText} mode={mode} />
            </p>
        </div>
    );
}

function HighlightedText({ value, queryText, mode }) {
    return highlightSearchText(value, queryText, mode).map((part, index) => part.match
        ? <mark key={index} className="journal-search-highlight">{part.text}</mark>
        : part.text);
}
