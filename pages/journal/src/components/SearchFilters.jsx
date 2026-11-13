import React, { useState } from 'react';
import { ChevronDown, SlidersHorizontal } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { ALL_SEARCH_SOURCES, SEARCH_SOURCES, hasSearchFilters, isSearchDate } from '../utils/journalSearch';

const PRESETS = [
    { label: 'Everything', sources: ALL_SEARCH_SOURCES },
    { label: 'Titles only', sources: ['title', 'section-title'] },
    { label: 'Captions only', sources: ['captions'] },
    { label: 'Sub-journals only', sources: ['section-title', 'section-content'] }
];

export default function SearchFilters({ filters, years, errors, updateParams }) {
    const { startDate, endDate, sources } = filters;
    const active = hasSearchFilters(filters);
    const [expanded, setExpanded] = useState(active);
    const allSources = sources.length === ALL_SEARCH_SOURCES.length;
    const selectedYear = startDate && startDate.endsWith('-01-01') && endDate === `${startDate.slice(0, 4)}-12-31`
        ? startDate.slice(0, 4) : (startDate || endDate ? 'custom' : 'All');
    const availableYears = [...new Set([...years, ...(/^\d{4}$/.test(selectedYear) ? [selectedYear] : [])])].sort().reverse();
    const shortDate = (value) => format(parseISO(value), 'd MMM yyyy');
    const dateSummary = errors.dates ? 'Check dates' : startDate && endDate
        ? `${shortDate(startDate)} – ${shortDate(endDate)}`
        : startDate ? `From ${shortDate(startDate)}` : endDate ? `Until ${shortDate(endDate)}` : 'All dates';
    const sourceSummary = allSources ? 'All search areas' : sources.length === 1
        ? SEARCH_SOURCES.find(({ id }) => id === sources[0]).label
        : `${sources.length} search areas`;

    const setSources = (next) => updateParams({ in: next.length === ALL_SEARCH_SOURCES.length ? '' : next.join(',') || 'none' });
    const setDates = (from, to) => updateParams({ from, to, year: '' });

    return (
        <div className="border-t border-border pt-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <button type="button" aria-expanded={expanded} aria-controls="journal-search-filters" onClick={() => setExpanded((value) => !value)}
                    className="inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm font-semibold text-text hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-primary">
                    <SlidersHorizontal className="h-4 w-4" aria-hidden="true" /> Filters
                    {active && <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs">{Number(Boolean(startDate || endDate)) + Number(!allSources)} active</span>}
                    <ChevronDown className={`h-4 w-4 transition-transform ${expanded ? 'rotate-180' : ''}`} aria-hidden="true" />
                </button>
                {active && <button type="button" onClick={() => updateParams({ from: '', to: '', year: '', in: '' })}
                    className="min-h-11 rounded-lg px-3 text-sm text-primary hover:bg-primary/10 focus-visible:outline-2 focus-visible:outline-primary">Reset filters</button>}
            </div>
            <p className="mt-1 text-xs leading-relaxed text-text-muted">{dateSummary} · {sourceSummary}</p>

            <div id="journal-search-filters" hidden={!expanded} className="mt-5 space-y-6">
                <fieldset className="min-w-0 space-y-3">
                    <legend className="mb-2 text-sm font-semibold text-text">Entry date</legend>
                    <label className="flex min-w-0 items-center gap-3 text-sm text-text">
                        <span className="shrink-0">Year</span>
                        <span className="relative min-w-0 flex-1 sm:max-w-56">
                            <select aria-label="Year" value={selectedYear} onChange={(event) => {
                                const year = event.target.value;
                                setDates(year === 'All' ? '' : `${year}-01-01`, year === 'All' ? '' : `${year}-12-31`);
                            }} className="journal-search-input glass-input h-11 w-full min-w-0 appearance-none pr-10">
                                <option value="All">All dates</option>
                                {selectedYear === 'custom' && <option value="custom" disabled>Custom range</option>}
                                {availableYears.map((year) => <option key={year} value={year}>{year}</option>)}
                            </select>
                            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" aria-hidden="true" />
                        </span>
                    </label>
                    <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
                        <label className="min-w-0 space-y-2 text-sm text-text">
                            <span className="block">From date</span>
                            <input type="date" value={isSearchDate(startDate) ? startDate : ''} onChange={(event) => setDates(event.target.value, endDate)}
                                aria-invalid={Boolean(errors.dates)} aria-describedby={errors.dates ? 'search-date-error' : 'search-date-help'}
                                className="journal-search-input glass-input block h-12 w-full min-w-0 max-w-full appearance-none" />
                        </label>
                        <label className="min-w-0 space-y-2 text-sm text-text">
                            <span className="block">To date</span>
                            <input type="date" value={isSearchDate(endDate) ? endDate : ''} onChange={(event) => setDates(startDate, event.target.value)}
                                aria-invalid={Boolean(errors.dates)} aria-describedby={errors.dates ? 'search-date-error' : 'search-date-help'}
                                className="journal-search-input glass-input block h-12 w-full min-w-0 max-w-full appearance-none" />
                        </label>
                    </div>
                    <p id="search-date-help" className="text-xs text-text-muted">Includes both dates. Leave either date empty for an open-ended range. You can filter by date without entering any words.</p>
                    {errors.dates && <p id="search-date-error" role="alert" className="text-sm text-red-500">{errors.dates}</p>}
                    {(startDate || endDate) && <button type="button" onClick={() => setDates('', '')}
                        className="min-h-11 rounded-lg px-3 text-sm text-primary hover:bg-primary/10 focus-visible:outline-2 focus-visible:outline-primary">Clear dates</button>}
                </fieldset>

                <fieldset className="min-w-0 space-y-3" aria-describedby={errors.sources ? 'search-sources-error' : 'search-sources-help'}>
                    <legend className="mb-2 text-sm font-semibold text-text">Search in</legend>
                    <div className="flex flex-wrap gap-2" role="group" aria-label="Search presets">
                        {PRESETS.map((preset) => {
                            const selected = sources.length === preset.sources.length && preset.sources.every((source) => sources.includes(source));
                            return <button key={preset.label} type="button" aria-pressed={selected} onClick={() => setSources(preset.sources)}
                                className={`min-h-11 rounded-lg border px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-primary ${selected ? 'border-primary/40 bg-primary/15 text-text' : 'border-border text-text-muted hover:bg-white/5'}`}>
                                {preset.label}
                            </button>;
                        })}
                    </div>
                    <div className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
                        {SEARCH_SOURCES.map(({ id, label }) => <label key={id} className="inline-flex min-h-11 cursor-pointer items-center gap-3 text-sm text-text">
                            <input type="checkbox" checked={sources.includes(id)} onChange={(event) => setSources(ALL_SEARCH_SOURCES.filter((source) => source === id ? event.target.checked : sources.includes(source)))}
                                className="h-5 w-5 shrink-0 accent-primary" /> {label}
                        </label>)}
                    </div>
                    <p id="search-sources-help" className="text-xs text-text-muted">Choose any combination. Titles only includes entry and sub-journal titles. Sub-journal text covers every additional writing section.</p>
                    {errors.sources && <p id="search-sources-error" role="alert" className="text-sm text-red-500">{errors.sources}</p>}
                </fieldset>
            </div>
        </div>
    );
}
